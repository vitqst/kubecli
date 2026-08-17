import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { auth } from './auth';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

describe('auth API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('checks Azure auth for the selected kubeconfig context', async () => {
    const status = {
      state: 'active',
      contextName: 'aks-orders-prod',
      tenantId: 'tenant-prod',
      loginMode: 'azurecli',
      account: null,
      accounts: [],
      expiresAtEpochSeconds: 1786966200,
      affectedContexts: ['aks-orders-prod'],
      reason: null,
      safeMessage: null,
    } as const;
    vi.mocked(invoke).mockResolvedValue(status);

    await expect(auth.check('/home/user/.kube/config', 'aks-orders-prod')).resolves.toEqual(status);
    expect(invoke).toHaveBeenCalledWith('check_azure_auth', {
      configPath: '/home/user/.kube/config',
      contextName: 'aks-orders-prod',
    });
  });

  it('starts the selected browser or device-code login method', async () => {
    vi.mocked(invoke).mockResolvedValue({ loginId: 'login-1', reused: false });

    await auth.startLogin({
      configPath: '/home/user/.kube/config',
      contextName: 'aks-orders-prod',
      tenantId: 'tenant-prod',
      method: 'deviceCode',
    });

    expect(invoke).toHaveBeenCalledWith('start_azure_login', {
      configPath: '/home/user/.kube/config',
      contextName: 'aks-orders-prod',
      tenantId: 'tenant-prod',
      method: 'deviceCode',
    });
  });

  it('passes progress event payloads to the subscriber', async () => {
    let listener: ((event: { payload: unknown }) => void) | undefined;
    const unlisten = vi.fn();
    vi.mocked(listen).mockImplementation(async (_event, handler) => {
      listener = handler as (event: { payload: unknown }) => void;
      return unlisten;
    });
    const callback = vi.fn();
    await auth.onProgress(callback);
    const progress = {
      loginId: 'login-1',
      phase: 'deviceCode',
      verificationUrl: 'https://microsoft.com/devicelogin',
      userCode: 'F7KQ-P9WX',
      safeMessage: null,
      status: null,
    };

    listener!({ payload: progress });

    expect(listen).toHaveBeenCalledWith('azure-auth-progress', expect.any(Function));
    expect(callback).toHaveBeenCalledWith(progress);
  });

  it('cancels a login by ID', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await auth.cancelLogin('login-1');
    expect(invoke).toHaveBeenCalledWith('cancel_azure_login', { loginId: 'login-1' });
  });
});
