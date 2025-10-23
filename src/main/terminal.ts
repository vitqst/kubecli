import * as pty from 'node-pty';
import os from 'os';
import { BrowserWindow } from 'electron';

export interface TerminalOptions {
  cwd?: string;
  env?: Record<string, string>;
}

export class TerminalManager {
  private terminals: Map<string, pty.IPty> = new Map();
  private window: BrowserWindow | null = null;

  setWindow(window: BrowserWindow): void {
    this.window = window;
  }

  createTerminal(id: string, options: TerminalOptions = {}): void {
    if (this.terminals.has(id)) {
      throw new Error(`Terminal with id ${id} already exists`);
    }

    // Detect shell based on platform
    const shell = this.getDefaultShell();
    
    // Set up environment
    const env = {
      ...process.env,
      ...options.env,
      TERM: 'xterm-256color',
    } as any;

    // Create PTY process
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 30,
      cwd: options.cwd || process.env.HOME || process.cwd(),
      env,
    });

    // Handle data from terminal
    ptyProcess.onData((data: string) => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('terminal:data', id, data);
      }
    });

    // Handle terminal exit
    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log(`[Terminal ${id}] Exited with code ${exitCode}, signal ${signal}`);
      this.terminals.delete(id);
      
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('terminal:exit', id, exitCode, signal);
      }
    });

    this.terminals.set(id, ptyProcess);
    console.log(`[Terminal ${id}] Created with shell: ${shell}`);
  }

  writeToTerminal(id: string, data: string): void {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      throw new Error(`Terminal with id ${id} not found`);
    }
    terminal.write(data);
  }

  resizeTerminal(id: string, cols: number, rows: number): void {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      throw new Error(`Terminal with id ${id} not found`);
    }
    terminal.resize(cols, rows);
  }

  closeTerminal(id: string): void {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      return;
    }

    try {
      terminal.kill();
    } catch (error) {
      console.error(`[Terminal ${id}] Error killing terminal:`, error);
    }

    this.terminals.delete(id);
    console.log(`[Terminal ${id}] Closed`);
  }

  closeAllTerminals(): void {
    for (const id of this.terminals.keys()) {
      this.closeTerminal(id);
    }
  }

  hasTerminal(id: string): boolean {
    return this.terminals.has(id);
  }

  getTerminalIds(): string[] {
    return Array.from(this.terminals.keys());
  }

  private getDefaultShell(): string {
    const platform = os.platform();

    if (platform === 'win32') {
      // Windows: prefer PowerShell, fallback to cmd
      return process.env.SHELL || 'powershell.exe';
    }

    if (platform === 'darwin') {
      // macOS: prefer zsh (default since Catalina), fallback to bash
      return process.env.SHELL || '/bin/zsh';
    }

    // Linux/Unix: use SHELL env var or fallback to bash
    return process.env.SHELL || '/bin/bash';
  }
}

// Singleton instance
export const terminalManager = new TerminalManager();
