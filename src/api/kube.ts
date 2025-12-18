import { invoke } from '@tauri-apps/api/core';

export interface ContextInfo {
  name: string;
  cluster: string;
  user: string;
  namespace: string | null;
}

export interface KubeConfigSummary {
  current_context: string;
  contexts: ContextInfo[];
  config_path: string;
}

export const kube = {
  getContexts: (configPath?: string): Promise<KubeConfigSummary> =>
    invoke<KubeConfigSummary>('get_contexts', { configPath: configPath ?? null }),

  setContext: (configPath: string, contextName: string): Promise<void> =>
    invoke('set_context', { configPath, contextName }),

  setNamespace: (configPath: string, context: string, namespace: string): Promise<void> =>
    invoke('set_namespace', { configPath, context, namespace }),

  runCommand: (args: string[], configPath?: string): Promise<string> =>
    invoke<string>('run_kubectl', { args, configPath: configPath ?? null }),
};
