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
  private editModeStatus: Map<string, boolean> = new Map();

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
      // Detect edit mode by looking for editor indicators
      this.detectEditMode(id, data);
      
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
    this.editModeStatus.delete(id);
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

  isInEditMode(id: string): boolean {
    return this.editModeStatus.get(id) || false;
  }

  private detectEditMode(id: string, data: string): void {
    // Detect when entering edit mode (vim, nano, vi, emacs)
    // These patterns indicate an editor has taken over the terminal
    const enterEditPatterns = [
      /\x1b\[\?1049h/, // Vim/Vi alternate screen buffer (most reliable)
      /\x1b\[\?47h/,   // Alternative screen mode
      /GNU nano/,      // Nano editor
    ];

    // Detect when exiting edit mode
    const exitEditPatterns = [
      /\x1b\[\?1049l/, // Vim/Vi exit alternate screen
      /\x1b\[\?47l/,   // Exit alternative screen mode
    ];

    const wasInEditMode = this.editModeStatus.get(id) || false;
    let isInEditMode = wasInEditMode;

    // Check for exiting edit mode FIRST (higher priority)
    // This ensures we don't get stuck in edit mode
    let hasExitPattern = false;
    for (const pattern of exitEditPatterns) {
      if (pattern.test(data)) {
        isInEditMode = false;
        hasExitPattern = true;
        break;
      }
    }

    // Only check for entering edit mode if we didn't find an exit pattern
    if (!hasExitPattern) {
      for (const pattern of enterEditPatterns) {
        if (pattern.test(data)) {
          isInEditMode = true;
          break;
        }
      }
    }

    // Update status and notify renderer if changed
    if (isInEditMode !== wasInEditMode) {
      this.editModeStatus.set(id, isInEditMode);
      
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('terminal:edit-mode', id, isInEditMode);
      }
      
      console.log(`[Terminal ${id}] Edit mode: ${isInEditMode}`);
    }
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
