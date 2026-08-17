export type AzureAuthState =
  | 'notAzure'
  | 'checking'
  | 'active'
  | 'expiringSoon'
  | 'expired'
  | 'signedOut'
  | 'error';

export type AzureLoginMethod = 'browser' | 'deviceCode';

export interface AzureAccountSummary {
  username: string;
  subscriptionId: string;
  subscriptionName: string;
  tenantId: string;
  isDefault: boolean;
}

export interface AzureSessionStatus {
  state: AzureAuthState;
  contextName: string;
  tenantId: string | null;
  loginMode: string | null;
  account: AzureAccountSummary | null;
  accounts: AzureAccountSummary[];
  expiresAtEpochSeconds: number | null;
  affectedContexts: string[];
  reason: string | null;
  safeMessage: string | null;
}

export type AzureLoginPhase =
  | 'starting'
  | 'waitingForBrowser'
  | 'waitingForDeviceCode'
  | 'deviceCode'
  | 'verified'
  | 'failed'
  | 'cancelled';

export interface AzureAuthProgress {
  loginId: string;
  phase: AzureLoginPhase;
  verificationUrl: string | null;
  userCode: string | null;
  safeMessage: string | null;
  status: AzureSessionStatus | null;
}

export interface AzureLoginStart {
  loginId: string;
  reused: boolean;
}

export interface StartAzureLoginInput {
  configPath: string;
  contextName: string;
  tenantId: string;
  method: AzureLoginMethod;
}
