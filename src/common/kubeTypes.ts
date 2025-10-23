export interface KubeContext {
  name: string;
  cluster?: string;
  user?: string;
  namespace?: string;
  server?: string;
}

export interface KubeConfigFile {
  path: string;
  name: string;
  isDefault: boolean;
}

export interface KubeConfigSummary {
  contexts: KubeContext[];
  currentContext: string | null;
  kubeconfigPath: string;
  availableConfigs?: KubeConfigFile[];
}

export interface KubectlResult {
  stdout: string;
  stderr: string;
  code: number | null;
}
