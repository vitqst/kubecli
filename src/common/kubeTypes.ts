export interface KubeContext {
  name: string;
  cluster?: string;
  user?: string;
  namespace?: string;
  server?: string;
}

export interface KubeConfigSummary {
  contexts: KubeContext[];
  currentContext: string | null;
  kubeconfigPath: string;
}

export interface KubectlResult {
  stdout: string;
  stderr: string;
  code: number | null;
}
