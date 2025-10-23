import type { KubeConfigSummary, KubectlResult } from '../common/kubeTypes';

declare global {
  interface Window {
    kube?: {
      getContexts: () => Promise<KubeConfigSummary>;
      setContext: (contextName: string) => Promise<KubeConfigSummary>;
      setConfig: (configPath: string) => Promise<KubeConfigSummary>;
      runCommand: (context: string, command: string) => Promise<KubectlResult>;
    };
  }
}

export {};
