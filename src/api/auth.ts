import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  AzureAuthProgress,
  AzureLoginStart,
  AzureSessionStatus,
  StartAzureLoginInput,
} from '../common/authTypes';

export const auth = {
  check(configPath: string, contextName: string): Promise<AzureSessionStatus> {
    return invoke<AzureSessionStatus>('check_azure_auth', { configPath, contextName });
  },

  runtimeEnv(configPath: string, contextName: string): Promise<Record<string, string>> {
    return invoke<Record<string, string>>('get_kubelogin_runtime_env', {
      configPath,
      contextName,
    });
  },

  startLogin(input: StartAzureLoginInput): Promise<AzureLoginStart> {
    return invoke<AzureLoginStart>('start_azure_login', {
      configPath: input.configPath,
      contextName: input.contextName,
      tenantId: input.tenantId,
      method: input.method,
    });
  },

  cancelLogin(loginId: string): Promise<void> {
    return invoke<void>('cancel_azure_login', { loginId });
  },

  onProgress(callback: (progress: AzureAuthProgress) => void): Promise<UnlistenFn> {
    return listen<AzureAuthProgress>('azure-auth-progress', (event) => callback(event.payload));
  },
};
