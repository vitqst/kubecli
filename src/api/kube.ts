import { invoke } from '@tauri-apps/api/core';
import type { KubeConfigSummary, KubectlResult, KubeContext, KubeConfigFile } from '../common/kubeTypes';

// Internal Tauri response types
interface TauriContextInfo {
  name: string;
  cluster: string;
  user: string;
  namespace: string | null;
}

interface TauriKubeConfigSummary {
  current_context: string;
  contexts: TauriContextInfo[];
  config_path: string;
}

// Convert Tauri response to app's expected format
function convertSummary(tauri: TauriKubeConfigSummary): KubeConfigSummary {
  return {
    currentContext: tauri.current_context,
    kubeconfigPath: tauri.config_path,
    contexts: tauri.contexts.map(ctx => ({
      name: ctx.name,
      cluster: ctx.cluster,
      user: ctx.user,
      namespace: ctx.namespace ?? undefined,
    })),
    availableConfigs: [], // Tauri doesn't support multiple configs yet
  };
}

// State to track current config path
let currentConfigPath: string | null = null;

export const kube = {
  // Get contexts - matches Electron API
  getContexts: async (configPath?: string): Promise<KubeConfigSummary> => {
    const result = await invoke<TauriKubeConfigSummary>('get_contexts', {
      configPath: configPath ?? null
    });
    currentConfigPath = result.config_path;
    return convertSummary(result);
  },

  // Set config file - matches Electron API (returns new summary)
  setConfig: async (newConfigPath: string): Promise<KubeConfigSummary> => {
    const result = await invoke<TauriKubeConfigSummary>('get_contexts', {
      configPath: newConfigPath
    });
    currentConfigPath = result.config_path;
    return convertSummary(result);
  },

  // Set context - matches Electron API (returns new summary)
  setContext: async (contextName: string): Promise<KubeConfigSummary> => {
    if (!currentConfigPath) {
      throw new Error('No kubeconfig loaded');
    }
    await invoke('set_context', {
      configPath: currentConfigPath,
      contextName
    });
    // Reload to get updated summary
    const result = await invoke<TauriKubeConfigSummary>('get_contexts', {
      configPath: currentConfigPath
    });
    return convertSummary(result);
  },

  // Set namespace - matches Electron API
  setNamespace: async (context: string, namespace: string): Promise<void> => {
    if (!currentConfigPath) {
      throw new Error('No kubeconfig loaded');
    }
    await invoke('set_namespace', {
      configPath: currentConfigPath,
      context,
      namespace
    });
  },

  // Run kubectl command - matches Electron API (returns result object)
  runCommand: async (context: string, command: string): Promise<KubectlResult> => {
    try {
      // Parse command string into args
      const args = command.split(/\s+/).filter(Boolean);

      // Add context flag if not already present
      if (!args.includes('--context')) {
        args.unshift('--context', context);
      }

      const stdout = await invoke<string>('run_kubectl', {
        args,
        configPath: currentConfigPath ?? null
      });

      return {
        stdout,
        stderr: '',
        code: 0,
      };
    } catch (error) {
      return {
        stdout: '',
        stderr: String(error),
        code: 1,
      };
    }
  },
};
