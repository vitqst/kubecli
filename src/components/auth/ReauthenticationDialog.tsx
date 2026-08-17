import React, { useEffect, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useAuthSession } from '../../contexts/AuthSessionContext';
import { authStyles as styles } from './authStyles';

export function ReauthenticationDialog() {
  const session = useAuthSession();
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isRechecking, setIsRechecking] = useState(false);
  const { status, loginProgress: progress } = session;

  useEffect(() => {
    if (!session.isReauthOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (progress && !['failed', 'cancelled'].includes(progress.phase)) void session.cancelLogin();
      session.dismissReauth();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [progress, session.cancelLogin, session.dismissReauth, session.isReauthOpen]);

  if (!session.isReauthOpen) return null;

  const isWaitingBrowser = progress?.phase === 'waitingForBrowser';
  const isDevice = progress?.phase === 'waitingForDeviceCode' || progress?.phase === 'deviceCode';
  const isFailed = progress?.phase === 'failed';
  const cancelAndClose = () => {
    void session.cancelLogin();
    session.dismissReauth();
  };
  const copyCode = async () => {
    if (!progress?.userCode) return;
    await navigator.clipboard?.writeText(progress.userCode);
    setCopied(true);
  };
  const openSignInPage = async () => {
    if (!progress?.verificationUrl) return;
    setLinkError(null);
    try {
      await openUrl(progress.verificationUrl);
    } catch {
      setLinkError('KubeCLI could not open your default browser. Copy the link and open it manually.');
    }
  };
  const copySignInLink = async () => {
    if (!progress?.verificationUrl) return;
    setLinkError(null);
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(progress.verificationUrl);
      setLinkCopied(true);
    } catch {
      setLinkError('KubeCLI could not copy the link. Select the URL below and copy it manually.');
    }
  };
  const recheckAccess = async () => {
    setIsRechecking(true);
    try {
      const result = await session.checkNow();
      if (result?.state === 'active') session.dismissReauth();
    } finally {
      setIsRechecking(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div role="dialog" aria-modal="true" aria-labelledby="azure-reauth-title" style={styles.dialog}>
        <div style={styles.header}>
          <div style={{ ...styles.icon, color: isFailed ? '#f27d72' : '#65b9e8' }} aria-hidden="true">
            {isDevice ? '#' : isWaitingBrowser ? '↗' : isFailed ? '!' : 'AD'}
          </div>
          <div>
            <h2 id="azure-reauth-title" style={styles.title}>
              {isDevice ? 'Sign in with a device code' : isWaitingBrowser ? 'Finish signing in with your browser' : isFailed ? 'Azure sign-in needs another try' : 'Reconnect your Azure account'}
            </h2>
            <p style={styles.copy}>
              {isDevice
                ? 'Open Microsoft’s verification page and enter the one-time code.'
                : isWaitingBrowser
                  ? 'A secure Microsoft sign-in window should be open. Return here when finished.'
                  : isFailed
                    ? progress.status?.safeMessage || progress.safeMessage || 'Azure sign-in did not complete.'
                    : 'Your Microsoft sign-in for this cluster is no longer valid. Your terminal and kubeconfig are unchanged.'}
            </p>
          </div>
        </div>

        <div style={styles.contextGrid}>
          <div style={styles.contextItem}><span style={styles.label}>Cluster</span><span style={styles.value}>{status.contextName}</span></div>
          <div style={styles.contextItem}><span style={styles.label}>Tenant</span><span style={styles.value}>{status.tenantId || 'Unknown'}</span></div>
        </div>

        {isDevice && (
          <div style={styles.codeBox} aria-live="polite">
            <span style={styles.label}>Microsoft device code</span>
            <div style={styles.code}>{progress.userCode || 'Preparing…'}</div>
            {progress.userCode && <button type="button" onClick={() => void copyCode()} style={styles.button}>{copied ? 'Copied' : 'Copy code'}</button>}
            {progress.verificationUrl && (
              <>
                <div style={localStyles.linkActions}>
                  <button type="button" onClick={() => void openSignInPage()} style={styles.primaryButton}>Open browser</button>
                  <button type="button" onClick={() => void copySignInLink()} style={styles.button}>{linkCopied ? 'Link copied' : 'Copy link'}</button>
                </div>
                <div style={localStyles.url} title={progress.verificationUrl}>{progress.verificationUrl}</div>
                {linkError && <div role="alert" style={localStyles.error}>{linkError}</div>}
              </>
            )}
          </div>
        )}

        {(isWaitingBrowser || isDevice) && (
          <div role="status" aria-live="polite" style={styles.progress}>
            <div style={localStyles.progressTrack}><div style={localStyles.progressBar} /></div>
            Waiting securely for Microsoft sign-in. KubeCLI will verify access automatically.
          </div>
        )}

        <div style={styles.actions}>
          <button type="button" onClick={isFailed ? session.dismissReauth : progress ? cancelAndClose : session.dismissReauth} style={styles.button}>{isFailed ? 'Close' : progress ? 'Cancel' : 'Not now'}</button>
          <div style={styles.actionsRight}>
            {isDevice ? (
              <button type="button" onClick={() => void session.startLogin('browser')} style={styles.button}>Back to browser login</button>
            ) : isWaitingBrowser ? (
              <button type="button" onClick={() => void session.startLogin('deviceCode')} style={styles.button}>Use device code instead</button>
            ) : isFailed ? (
              <>
                <button type="button" onClick={() => void session.startLogin('deviceCode')} style={styles.button}>Sign in again</button>
                <button type="button" autoFocus disabled={isRechecking} onClick={() => void recheckAccess()} style={styles.primaryButton}>{isRechecking ? 'Checking…' : 'Check access again'}</button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => void session.startLogin('deviceCode')} style={styles.button}>Use device code</button>
                <button type="button" autoFocus onClick={() => void session.startLogin('browser')} style={styles.primaryButton}>Continue with browser</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const localStyles: Record<string, React.CSSProperties> = {
  progressTrack: { height: '5px', marginBottom: '10px', overflow: 'hidden', borderRadius: '999px', background: '#393e43' },
  progressBar: { width: '62%', height: '100%', borderRadius: '999px', background: '#1683c5' },
  linkActions: { display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '10px' },
  url: { marginTop: '10px', color: '#9fa7ad', fontSize: '10px', overflowWrap: 'anywhere', userSelect: 'text' },
  error: { marginTop: '10px', color: '#f2a39b', fontSize: '11px', lineHeight: 1.4 },
};
