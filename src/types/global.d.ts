import type { KubeConfigSummary, KubectlResult } from '../common/kubeTypes';

declare global {
  interface Window {
    kube?: {
      getContexts: () => Promise<KubeConfigSummary>;
      setContext: (contextName: string) => Promise<KubeConfigSummary>;
      setConfig: (configPath: string) => Promise<KubeConfigSummary>;
      runCommand: (context: string, command: string) => Promise<KubectlResult>;
    };
    terminal?: {
      create: (id: string, options?: { cwd?: string; env?: Record<string, string> }) => Promise<{ id: string }>;
      write: (id: string, data: string) => Promise<void>;
      resize: (id: string, cols: number, rows: number) => Promise<void>;
      close: (id: string) => Promise<void>;
      onData: (callback: (id: string, data: string) => void) => (() => void);
      onExit: (callback: (id: string, exitCode: number, signal?: number) => void) => (() => void);
      onEditMode: (callback: (id: string, isEditMode: boolean) => void) => (() => void);
    };
  }
}

export {};
