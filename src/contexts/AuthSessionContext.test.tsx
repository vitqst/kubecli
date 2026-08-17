import React, { useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AzureAuthProgress, AzureSessionStatus } from '../common/authTypes';
import { AuthSessionProvider, useAuthSession } from './AuthSessionContext';

const harness = vi.hoisted(() => ({
  check: vi.fn(),
  startLogin: vi.fn(),
  cancelLogin: vi.fn(),
  unlisten: vi.fn(),
  progressHandler: null as null | ((progress: AzureAuthProgress) => void),
}));

vi.mock('../api/auth', () => ({
  auth: {
    check: (...args: unknown[]) => harness.check(...args),
    startLogin: (...args: unknown[]) => harness.startLogin(...args),
    cancelLogin: (...args: unknown[]) => harness.cancelLogin(...args),
    onProgress: vi.fn(async (handler: (progress: AzureAuthProgress) => void) => {
      harness.progressHandler = handler;
      return harness.unlisten;
    }),
  },
}));

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
  accounts: [],
  expiresAtEpochSeconds: Math.floor(Date.now() / 1000) + 3600,
  affectedContexts: ['aks-orders-prod'],
  reason: null,
  safeMessage: null,
};

function Consumer({ recovery }: { recovery?: () => void }) {
  const session = useAuthSession();
  useEffect(() => recovery ? session.registerRecovery(recovery) : undefined, [recovery, session.registerRecovery]);
  return (
    <div>
      <span data-testid="state">{session.status.state}</span>
      <span data-testid="reauth">{String(session.isReauthOpen)}</span>
      <button onClick={() => session.startLogin('browser')}>browser</button>
      <button onClick={() => session.reportAuthFailure("Please run 'az login'")}>auth failure</button>
    </div>
  );
}

describe('AuthSessionProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.progressHandler = null;
    harness.check.mockResolvedValue(activeStatus);
    harness.startLogin.mockResolvedValue({ loginId: 'login-1', reused: false });
    harness.cancelLogin.mockResolvedValue(undefined);
  });

  it('checks the selected context on startup', async () => {
    render(
      <AuthSessionProvider configPath="/home/user/.kube/config" selectedContext="aks-orders-prod">
        <Consumer />
      </AuthSessionProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('active'));
    expect(harness.check).toHaveBeenCalledWith('/home/user/.kube/config', 'aks-orders-prod');
  });

  it('opens one guided reauthentication flow when Azure auth fails', async () => {
    render(
      <AuthSessionProvider configPath="/home/user/.kube/config" selectedContext="aks-orders-prod">
        <Consumer />
      </AuthSessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('active'));

    fireEvent.click(screen.getByRole('button', { name: 'auth failure' }));
    fireEvent.click(screen.getByRole('button', { name: 'auth failure' }));

    expect(screen.getByTestId('state')).toHaveTextContent('expired');
    expect(screen.getByTestId('reauth')).toHaveTextContent('true');
  });

  it('starts browser login for the current tenant', async () => {
    render(
      <AuthSessionProvider configPath="/home/user/.kube/config" selectedContext="aks-orders-prod">
        <Consumer />
      </AuthSessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('active'));

    fireEvent.click(screen.getByRole('button', { name: 'browser' }));

    await waitFor(() => expect(harness.startLogin).toHaveBeenCalledWith({
      configPath: '/home/user/.kube/config',
      contextName: 'aks-orders-prod',
      tenantId: 'tenant-prod',
      method: 'browser',
    }));
  });

  it('runs registered recovery callbacks after verified login', async () => {
    const recovery = vi.fn();
    render(
      <AuthSessionProvider configPath="/home/user/.kube/config" selectedContext="aks-orders-prod">
        <Consumer recovery={recovery} />
      </AuthSessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('active'));
    fireEvent.click(screen.getByRole('button', { name: 'browser' }));
    await waitFor(() => expect(harness.startLogin).toHaveBeenCalled());

    act(() => harness.progressHandler?.({
      loginId: 'login-1',
      phase: 'verified',
      verificationUrl: null,
      userCode: null,
      safeMessage: 'Azure access is ready.',
      status: activeStatus,
    }));

    await waitFor(() => expect(recovery).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('reauth')).toHaveTextContent('false');
  });
});
