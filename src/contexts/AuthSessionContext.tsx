import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { auth } from '../api/auth';
import type {
  AzureAuthProgress,
  AzureLoginMethod,
  AzureSessionStatus,
} from '../common/authTypes';

const TEN_MINUTES_MS = 10 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;

function emptyStatus(contextName = ''): AzureSessionStatus {
  return {
    state: 'notAzure',
    contextName,
    tenantId: null,
    loginMode: null,
    account: null,
    accounts: [],
    expiresAtEpochSeconds: null,
    affectedContexts: [],
    reason: null,
    safeMessage: null,
  };
}

interface AuthSessionContextValue {
  status: AzureSessionStatus;
  loginProgress: AzureAuthProgress | null;
  isReauthOpen: boolean;
  isSessionsOpen: boolean;
  checkNow: () => Promise<AzureSessionStatus | null>;
  startLogin: (method: AzureLoginMethod) => Promise<void>;
  cancelLogin: () => Promise<void>;
  reportAuthFailure: (message: string) => void;
  registerRecovery: (callback: () => void | Promise<void>) => () => void;
  openSessions: () => void;
  closeSessions: () => void;
  openReauth: () => void;
  dismissReauth: () => void;
}

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

interface AuthSessionProviderProps {
  children: ReactNode;
  configPath: string;
  selectedContext: string;
}

export function AuthSessionProvider({
  children,
  configPath,
  selectedContext,
}: AuthSessionProviderProps) {
  const [status, setStatus] = useState<AzureSessionStatus>(() => emptyStatus(selectedContext));
  const [loginProgress, setLoginProgress] = useState<AzureAuthProgress | null>(null);
  const [isReauthOpen, setIsReauthOpen] = useState(false);
  const [isSessionsOpen, setIsSessionsOpen] = useState(false);
  const statusRef = useRef(status);
  statusRef.current = status;
  const activeLoginIdRef = useRef<string | null>(null);
  const pendingProgressRef = useRef(new Map<string, AzureAuthProgress>());
  const checkingRef = useRef<Promise<AzureSessionStatus | null> | null>(null);
  const requestSequenceRef = useRef(0);
  const recoveryCallbacksRef = useRef(new Set<() => void | Promise<void>>());

  const checkNow = useCallback((): Promise<AzureSessionStatus | null> => {
    if (!configPath || !selectedContext) {
      const next = emptyStatus(selectedContext);
      setStatus(next);
      return Promise.resolve(next);
    }
    if (checkingRef.current) return checkingRef.current;

    const requestSequence = ++requestSequenceRef.current;
    setStatus({ ...emptyStatus(selectedContext), state: 'checking' });
    const request = auth.check(configPath, selectedContext)
      .then((result) => {
        if (requestSequence !== requestSequenceRef.current) return null;
        setStatus((previous) => {
          if (
            (result.state === 'expired' || result.state === 'signedOut')
            && previous.state === 'active'
            && previous.expiresAtEpochSeconds
            && previous.expiresAtEpochSeconds * 1000 > Date.now()
          ) {
            return {
              ...previous,
              state: 'expiringSoon',
              reason: result.reason,
              safeMessage: result.safeMessage,
            };
          }
          return result;
        });
        if (result.state === 'expired' || result.state === 'signedOut') {
          setIsReauthOpen(true);
        }
        return result;
      })
      .catch(() => {
        if (requestSequence !== requestSequenceRef.current) return null;
        const failure: AzureSessionStatus = {
          ...emptyStatus(selectedContext),
          state: 'error',
          reason: 'statusCheckFailed',
          safeMessage: 'KubeCLI could not check the Azure session.',
        };
        setStatus(failure);
        return failure;
      })
      .finally(() => {
        if (checkingRef.current === request) checkingRef.current = null;
      });
    checkingRef.current = request;
    return request;
  }, [configPath, selectedContext]);

  useEffect(() => {
    checkingRef.current = null;
    requestSequenceRef.current += 1;
    setLoginProgress(null);
    setIsReauthOpen(false);
    setIsSessionsOpen(false);
    activeLoginIdRef.current = null;
    pendingProgressRef.current.clear();
    void checkNow();
  }, [checkNow]);

  const applyLoginProgress = useCallback((progress: AzureAuthProgress) => {
    setLoginProgress(progress);
    if (progress.phase === 'verified' && progress.status) {
      setStatus(progress.status);
      activeLoginIdRef.current = null;
      setIsReauthOpen(false);
      setIsSessionsOpen(false);
      for (const callback of recoveryCallbacksRef.current) {
        void callback();
      }
    }
    if (progress.phase === 'cancelled') {
      activeLoginIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (status.state !== 'active' && status.state !== 'expiringSoon') return;
    const expiryDelay = status.expiresAtEpochSeconds
      ? status.expiresAtEpochSeconds * 1000 - Date.now() - FIVE_MINUTES_MS
      : TEN_MINUTES_MS;
    const delay = status.state === 'expiringSoon'
      ? ONE_MINUTE_MS
      : Math.max(ONE_MINUTE_MS, Math.min(TEN_MINUTES_MS, expiryDelay));
    const timer = window.setTimeout(() => void checkNow(), delay);
    return () => window.clearTimeout(timer);
  }, [checkNow, status.expiresAtEpochSeconds, status.state]);

  useEffect(() => {
    let disposed = false;
    let unlisten: undefined | (() => void);
    void auth.onProgress((progress) => {
      if (disposed) return;
      if (progress.loginId !== activeLoginIdRef.current) {
        pendingProgressRef.current.set(progress.loginId, progress);
        return;
      }
      applyLoginProgress(progress);
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unlisten = cleanup;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [applyLoginProgress]);

  const startLogin = useCallback(async (method: AzureLoginMethod) => {
    if (!status.tenantId || !configPath || !selectedContext) {
      setLoginProgress({
        loginId: '',
        phase: 'failed',
        verificationUrl: null,
        userCode: null,
        safeMessage: 'This Kubernetes context does not include an Azure tenant.',
        status: null,
      });
      setIsReauthOpen(true);
      return;
    }

    const previousLoginId = activeLoginIdRef.current;
    activeLoginIdRef.current = null;
    if (previousLoginId) await auth.cancelLogin(previousLoginId);

    setIsReauthOpen(true);
    setLoginProgress({
      loginId: 'pending',
      phase: method === 'browser' ? 'waitingForBrowser' : 'waitingForDeviceCode',
      verificationUrl: null,
      userCode: null,
      safeMessage: null,
      status: null,
    });
    try {
      const started = await auth.startLogin({
        configPath,
        contextName: selectedContext,
        tenantId: status.tenantId,
        method,
      });
      activeLoginIdRef.current = started.loginId;
      setLoginProgress((current) => current ? { ...current, loginId: started.loginId } : current);
      const pending = pendingProgressRef.current.get(started.loginId);
      if (pending) {
        pendingProgressRef.current.delete(started.loginId);
        applyLoginProgress(pending);
      }
    } catch (error) {
      activeLoginIdRef.current = null;
      setLoginProgress({
        loginId: '',
        phase: 'failed',
        verificationUrl: null,
        userCode: null,
        safeMessage: error instanceof Error ? error.message : String(error),
        status: null,
      });
    }
  }, [applyLoginProgress, configPath, selectedContext, status.tenantId]);

  const cancelLogin = useCallback(async () => {
    const loginId = activeLoginIdRef.current;
    activeLoginIdRef.current = null;
    if (loginId) await auth.cancelLogin(loginId);
    setLoginProgress(null);
  }, []);

  const reportAuthFailure = useCallback((message: string) => {
    if (!['azurecli', 'devicecode', 'interactive'].includes(statusRef.current.loginMode || '')) return;
    setStatus((current) => ({
      ...current,
      state: 'expired',
      reason: 'kubectlAuthFailure',
      safeMessage: message,
    }));
    setIsReauthOpen(true);
  }, []);

  const registerRecovery = useCallback((callback: () => void | Promise<void>) => {
    recoveryCallbacksRef.current.add(callback);
    return () => recoveryCallbacksRef.current.delete(callback);
  }, []);

  const value = useMemo<AuthSessionContextValue>(() => ({
    status,
    loginProgress,
    isReauthOpen,
    isSessionsOpen,
    checkNow,
    startLogin,
    cancelLogin,
    reportAuthFailure,
    registerRecovery,
    openSessions: () => setIsSessionsOpen(true),
    closeSessions: () => setIsSessionsOpen(false),
    openReauth: () => setIsReauthOpen(true),
    dismissReauth: () => setIsReauthOpen(false),
  }), [
    status,
    loginProgress,
    isReauthOpen,
    isSessionsOpen,
    checkNow,
    startLogin,
    cancelLogin,
    reportAuthFailure,
    registerRecovery,
  ]);

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): AuthSessionContextValue {
  const context = useContext(AuthSessionContext);
  if (!context) throw new Error('useAuthSession must be used within AuthSessionProvider');
  return context;
}
