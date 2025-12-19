import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export interface TerminalDataPayload {
  terminalId: string;
  data: string;
}

export const terminal = {
  create: (shell?: string, initialEnv?: Record<string, string>): Promise<string> =>
    invoke<string>('terminal_create', { shell: shell ?? null, initialEnv: initialEnv ?? null }),

  write: (terminalId: string, data: string): Promise<void> =>
    invoke('terminal_write', { terminalId, data }),

  writeSilent: (terminalId: string, data: string): Promise<void> =>
    invoke('terminal_write_silent', { terminalId, data }),

  resize: (terminalId: string, cols: number, rows: number): Promise<void> =>
    invoke('terminal_resize', { terminalId, cols, rows }),

  close: (terminalId: string): Promise<void> =>
    invoke('terminal_close', { terminalId }),

  onData: (callback: (payload: TerminalDataPayload) => void): Promise<UnlistenFn> =>
    listen<TerminalDataPayload>('terminal:data', (event) => callback(event.payload)),

  onExit: (callback: (terminalId: string) => void): Promise<UnlistenFn> =>
    listen<string>('terminal:exit', (event) => callback(event.payload)),
};
