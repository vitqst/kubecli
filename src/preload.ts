import { contextBridge, ipcRenderer } from 'electron';
import type { KubeConfigSummary, KubectlResult } from './common/kubeTypes';

type SuccessResponse<T> = {
  success: true;
  data: T;
};

type ErrorResponse = {
  success: false;
  error: string;
};

function unwrap<T>(response: SuccessResponse<T> | ErrorResponse): T {
  if (response.success) {
    return response.data;
  }

  throw new Error(response.error);
}

contextBridge.exposeInMainWorld('kube', {
  getContexts: async (): Promise<KubeConfigSummary> => {
    const response = await ipcRenderer.invoke('kube:get-contexts');
    return unwrap(response);
  },
  setContext: async (contextName: string): Promise<KubeConfigSummary> => {
    const response = await ipcRenderer.invoke('kube:set-context', contextName);
    return unwrap(response);
  },
  runCommand: async (
    context: string,
    command: string
  ): Promise<KubectlResult> => {
    const response = await ipcRenderer.invoke('kube:run-command', {
      context,
      command,
    });

    return unwrap(response);
  },
});
