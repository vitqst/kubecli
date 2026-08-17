import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AzureSessionStatus } from '../../common/authTypes';
import { AuthStatusButton } from './AuthStatusButton';
import { AzureSessionsDialog } from './AzureSessionsDialog';
import { ReauthenticationDialog } from './ReauthenticationDialog';

const activeStatus: AzureSessionStatus = {
  state: 'active',
  contextName: 'aks-orders-prod',
  tenantId: 'tenant-prod',
  loginMode: 'azurecli',
  account: {
    username: 'alex@contoso.com',
    subscriptionId: 'sub-prod',
    subscriptionName: 'Production',
    tenantId: 'tenant-prod',
    isDefault: true,
  },
  accounts: [
    {
      username: 'alex@contoso.com',
      subscriptionId: 'sub-prod',
      subscriptionName: 'Production',
      tenantId: 'tenant-prod',
      isDefault: true,
    },
  ],
  expiresAtEpochSeconds: 1786966200,
  affectedContexts: ['aks-orders-prod', 'aks-payments-prod'],
  reason: null,
  safeMessage: null,
};

const harness = vi.hoisted(() => ({ value: {} as any }));
const platform = vi.hoisted(() => ({
  openUrl: vi.fn(),
  writeText: vi.fn(),
}));
vi.mock('../../contexts/AuthSessionContext', () => ({
  useAuthSession: () => harness.value,
}));
vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: platform.openUrl,
}));

function setSession(overrides: Record<string, unknown> = {}) {
  harness.value = {
    status: activeStatus,
    loginProgress: null,
    isReauthOpen: false,
    isSessionsOpen: false,
    checkNow: vi.fn(),
    startLogin: vi.fn(),
    cancelLogin: vi.fn(),
    reportAuthFailure: vi.fn(),
    registerRecovery: vi.fn(),
    openSessions: vi.fn(),
    closeSessions: vi.fn(),
    openReauth: vi.fn(),
    dismissReauth: vi.fn(),
    ...overrides,
  };
}

describe('Azure auth UI', () => {
  beforeEach(() => {
    setSession();
    platform.openUrl.mockReset().mockResolvedValue(undefined);
    platform.writeText.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: platform.writeText },
    });
  });

  it('hides the status control for non-Azure contexts', () => {
    setSession({ status: { ...activeStatus, state: 'notAzure' } });
    render(<AuthStatusButton />);
    expect(screen.queryByRole('button', { name: /azure/i })).not.toBeInTheDocument();
  });

  it('shows account health and opens the session center', () => {
    render(<AuthStatusButton />);
    fireEvent.click(screen.getByRole('button', { name: /azure session ready/i }));
    expect(harness.value.openSessions).toHaveBeenCalledTimes(1);
  });

  it('explains the affected cluster and offers browser-first recovery', () => {
    setSession({
      status: { ...activeStatus, state: 'expired' },
      isReauthOpen: true,
    });
    render(<ReauthenticationDialog />);

    expect(screen.getByRole('dialog', { name: /reconnect your azure account/i })).toBeInTheDocument();
    expect(screen.getByText('aks-orders-prod')).toBeInTheDocument();
    expect(screen.getByText('tenant-prod')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /continue with browser/i }));
    expect(harness.value.startLogin).toHaveBeenCalledWith('browser');
  });

  it('lets the user choose device code and shows its live instruction', () => {
    setSession({
      status: { ...activeStatus, state: 'expired' },
      isReauthOpen: true,
      loginProgress: {
        loginId: 'login-1',
        phase: 'deviceCode',
        verificationUrl: 'https://microsoft.com/devicelogin',
        userCode: 'F7KQ-P9WX',
        safeMessage: null,
        status: null,
      },
    });
    render(<ReauthenticationDialog />);

    expect(screen.getByText('F7KQ-P9WX')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open browser/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /back to browser login/i }));
    expect(harness.value.startLogin).toHaveBeenCalledWith('browser');
  });

  it('opens or copies the device sign-in link', async () => {
    setSession({
      status: { ...activeStatus, state: 'expired' },
      isReauthOpen: true,
      loginProgress: {
        loginId: 'login-1',
        phase: 'deviceCode',
        verificationUrl: 'https://microsoft.com/devicelogin',
        userCode: 'F7KQ-P9WX',
        safeMessage: null,
        status: null,
      },
    });
    render(<ReauthenticationDialog />);

    fireEvent.click(screen.getByRole('button', { name: /open browser/i }));
    await waitFor(() => {
      expect(platform.openUrl).toHaveBeenCalledWith('https://microsoft.com/devicelogin');
    });

    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    await waitFor(() => {
      expect(platform.writeText).toHaveBeenCalledWith('https://microsoft.com/devicelogin');
      expect(screen.getByRole('button', { name: /link copied/i })).toBeInTheDocument();
    });
  });

  it('shows the verification reason and rechecks access without another login', async () => {
    const checkNow = vi.fn().mockResolvedValue(activeStatus);
    const verifierStatus: AzureSessionStatus = {
      ...activeStatus,
      state: 'expired',
      reason: 'interactionRequired',
      safeMessage: 'Azure CLI has not exposed the refreshed session yet.',
    };
    setSession({
      status: verifierStatus,
      isReauthOpen: true,
      checkNow,
      loginProgress: {
        loginId: 'login-1',
        phase: 'failed',
        verificationUrl: null,
        userCode: null,
        safeMessage: 'Sign-in finished, but Azure access could not be verified.',
        status: verifierStatus,
      },
    });
    render(<ReauthenticationDialog />);

    expect(screen.getByText('Azure CLI has not exposed the refreshed session yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /check access again/i }));

    await waitFor(() => expect(checkNow).toHaveBeenCalledTimes(1));
    expect(harness.value.startLogin).not.toHaveBeenCalled();
    expect(harness.value.dismissReauth).toHaveBeenCalledTimes(1);
  });

  it('lists accounts and affected clusters in the session center', () => {
    setSession({ isSessionsOpen: true });
    render(<AzureSessionsDialog />);

    expect(screen.getByRole('dialog', { name: /azure sessions/i })).toBeInTheDocument();
    expect(screen.getByText('alex@contoso.com')).toBeInTheDocument();
    expect(screen.getByText(/aks-orders-prod, aks-payments-prod/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /check again/i }));
    expect(harness.value.checkNow).toHaveBeenCalledTimes(1);
  });
});
