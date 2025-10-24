import { invoke } from '@tauri-apps/api/tauri';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { readTextFile } from '@tauri-apps/api/fs';
import * as YAML from 'yaml';

// Terminal API
export const terminal = {
  create: async (id: string, options?: { cwd?: string; env?: Record<string, string> }): Promise<{ id: string }> => {
    const result = await invoke<string>('create_terminal', {
      id,
      cwd: options?.cwd,
      env: options?.env,
    });
    return { id: result };
  },

  write: async (id: string, data: string): Promise<void> => {
    await invoke('write_terminal', { id, data });
  },

  resize: async (id: string, cols: number, rows: number): Promise<void> => {
    await invoke('resize_terminal', { id, cols, rows });
  },

  close: async (id: string): Promise<void> => {
    await invoke('close_terminal', { id });
  },

  onData: (callback: (id: string, data: string) => void): UnlistenFn => {
    let unlisten: UnlistenFn | null = null;
    
    listen<{ id: string; data: string }>('terminal:data', (event) => {
      callback(event.payload.id, event.payload.data);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  },

  onExit: (callback: (id: string, exitCode: number, signal?: number) => void): UnlistenFn => {
    let unlisten: UnlistenFn | null = null;
    
    listen<{ id: string; exit_code: number }>('terminal:exit', (event) => {
      callback(event.payload.id, event.payload.exit_code);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  },

  onEditMode: (callback: (id: string, isEditMode: boolean) => void): UnlistenFn => {
    // Edit mode detection will be handled in frontend for now
    // Can be moved to Rust backend later
    return () => {};
  },
};

// Kube API (kubectl commands)
// Reads kubeconfig directly from filesystem
export const kube = {
  getContexts: async () => {
    try {
      // Read kubeconfig from default location
      const homeDir = await invoke<string>('get_home_dir');
      const kubeconfigPath = `${homeDir}/.kube/config`;
      
      console.log('[Tauri API] Reading kubeconfig from:', kubeconfigPath);
      
      // Read and parse kubeconfig
      const fileContents = await readTextFile(kubeconfigPath);
      const config = YAML.parse(fileContents) || {};
      
      console.log('[Tauri API] Parsed kubeconfig:', config);
      
      // Parse contexts
      const rawContexts: Array<{ name: string; context?: Record<string, any> }> =
        Array.isArray(config.contexts) ? config.contexts : [];
      const rawClusters: Array<{ name: string; cluster?: Record<string, any> }> =
        Array.isArray(config.clusters) ? config.clusters : [];
      
      const clusterMap = new Map<string, Record<string, any>>();
      rawClusters.forEach((cluster) => {
        if (cluster?.name) {
          clusterMap.set(cluster.name, cluster.cluster ?? {});
        }
      });
      
      const contexts = rawContexts.map((ctx) => {
        const contextData = ctx.context ?? {};
        const clusterName: string | undefined = contextData.cluster;
        const cluster = clusterName ? clusterMap.get(clusterName) ?? {} : {};
        
        return {
          name: ctx.name,
          cluster: clusterName,
          user: contextData.user,
          namespace: contextData.namespace,
          server: cluster?.server,
        };
      });
      
      const currentContext =
        typeof config['current-context'] === 'string' ? config['current-context'] : null;
      
      console.log('[Tauri API] Found contexts:', contexts);
      console.log('[Tauri API] Current context:', currentContext);
      
      return {
        contexts,
        currentContext,
        kubeconfigPath: kubeconfigPath,
        availableConfigs: [{
          path: kubeconfigPath,
          name: 'default',
          isDefault: true,
        }],
      };
    } catch (error) {
      console.error('[Tauri API] Failed to get contexts:', error);
      return {
        contexts: [],
        currentContext: null,
        kubeconfigPath: '',
        availableConfigs: [],
      };
    }
  },

  loadKubeConfig: async (configPath: string) => {
    // Same as getContexts for now
    return kube.getContexts();
  },

  setConfig: async (configPath: string) => {
    // Switch to a different kubeconfig
    // For now, just return the same contexts
    return kube.getContexts();
  },

  setContext: async (contextName: string) => {
    // Switch to a different context
    // For now, just return the same contexts
    return kube.getContexts();
  },

  useContext: async (configPath: string, contextName: string) => {
    // Execute kubectl config use-context via terminal
    return { success: true };
  },

  runCommand: async (contextName: string, command: string) => {
    // Execute kubectl command
    // For now, return empty result
    return { stdout: '', stderr: '', code: 0 };
  },

  runKubectlCommand: async (args: string[], context: string, namespace?: string) => {
    // Execute kubectl commands via terminal
    return { stdout: '', stderr: '', exitCode: 0 };
  },
};

// File system API
export const fs = {
  readFile: async (path: string): Promise<string> => {
    // Will use Tauri's fs plugin
    return '';
  },

  writeFile: async (path: string, contents: string): Promise<void> => {
    // Will use Tauri's fs plugin
  },
};

// Make it available globally for compatibility
if (typeof window !== 'undefined') {
  (window as any).terminal = terminal;
  (window as any).kube = kube;
  (window as any).fs = fs;
}
