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
  setConfig: async (configPath: string): Promise<KubeConfigSummary> => {
    const response = await ipcRenderer.invoke('kube:set-config', configPath);
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

contextBridge.exposeInMainWorld('terminal', {
  create: async (id: string, options?: { cwd?: string; env?: Record<string, string> }): Promise<{ id: string }> => {
    const response = await ipcRenderer.invoke('terminal:create', id, options);
    return unwrap(response);
  },
  write: async (id: string, data: string): Promise<void> => {
    const response = await ipcRenderer.invoke('terminal:write', id, data);
    unwrap(response);
  },
  resize: async (id: string, cols: number, rows: number): Promise<void> => {
    const response = await ipcRenderer.invoke('terminal:resize', id, cols, rows);
    unwrap(response);
  },
  close: async (id: string): Promise<void> => {
    const response = await ipcRenderer.invoke('terminal:close', id);
    unwrap(response);
  },
  onData: (callback: (id: string, data: string) => void) => {
    const handler = (_event: any, id: string, data: string) => callback(id, data);
    ipcRenderer.on('terminal:data', handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener('terminal:data', handler);
  },
  onExit: (callback: (id: string, exitCode: number, signal?: number) => void) => {
    const handler = (_event: any, id: string, exitCode: number, signal?: number) => callback(id, exitCode, signal);
    ipcRenderer.on('terminal:exit', handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener('terminal:exit', handler);
  },
  onEditMode: (callback: (id: string, isEditMode: boolean) => void) => {
    const handler = (_event: any, id: string, isEditMode: boolean) => callback(id, isEditMode);
    ipcRenderer.on('terminal:edit-mode', handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener('terminal:edit-mode', handler);
  },
});
