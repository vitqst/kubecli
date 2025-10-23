import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

interface TerminalProps {
  id: string;
  cwd?: string;
  env?: Record<string, string>;
  onReady?: () => void;
  onExit?: (exitCode: number, signal?: number) => void;
}

export function Terminal({ id, cwd, env, onReady, onExit }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isReady, setIsReady] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    
    if (!terminalRef.current || !window.terminal) {
      console.error('[Terminal] Terminal ref or API not available');
      return;
    }

    console.log(`[Terminal ${id}] Initializing...`);

    // Create xterm instance
    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5',
      },
      scrollback: 10000,
      allowProposedApi: true,
    });

    // Create fit addon
    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    // Open terminal in DOM
    xterm.open(terminalRef.current);
    
    // Wait a tick for DOM to be ready before fitting
    setTimeout(() => {
      try {
    fitAddon.fit();
      } catch (error) {
        console.error(`[Terminal ${id}] Initial fit error:`, error);
      }
    }, 0);

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Create backend terminal
    window.terminal
      .create(id, { cwd, env })
      .then(() => {
        console.log(`[Terminal ${id}] Created successfully`);
        setIsReady(true);
        if (onReady) onReady();
      })
      .catch((error) => {
        console.error(`[Terminal ${id}] Failed to create:`, error);
        xterm.writeln(`\x1b[31mFailed to create terminal: ${error.message}\x1b[0m`);
      });

    // Handle user input
    xterm.onData((data) => {
      if (window.terminal) {
        window.terminal.write(id, data).catch((error) => {
          console.error(`[Terminal ${id}] Failed to write:`, error);
        });
      }
    });

    // Handle data from backend - display in terminal
    const dataHandler = (termId: string, data: string) => {
      if (termId === id && xtermRef.current && isMountedRef.current) {
        xtermRef.current.write(data);
      }
    };
    
    const cleanupDataHandler = window.terminal.onData(dataHandler);

    // Handle terminal exit
    const exitHandler = (termId: string, exitCode: number, signal?: number) => {
      if (termId === id) {
        console.log(`[Terminal ${id}] Exited with code ${exitCode}, signal ${signal}`);
        if (xtermRef.current) {
          xtermRef.current.writeln(`\r\n\x1b[33mTerminal exited with code ${exitCode}\x1b[0m`);
        }
        if (onExit) onExit(exitCode, signal);
      }
    };
    
    const cleanupExitHandler = window.terminal.onExit(exitHandler);

    // Handle window resize
    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current && window.terminal) {
        fitAddonRef.current.fit();
        const { cols, rows } = xtermRef.current;
        window.terminal.resize(id, cols, rows).catch((error) => {
          console.error(`[Terminal ${id}] Failed to resize:`, error);
        });
      }
    };

    window.addEventListener('resize', handleResize);

    // Initial resize after a short delay to ensure proper layout
    setTimeout(handleResize, 100);

    // Cleanup
    return () => {
      console.log(`[Terminal ${id}] Cleaning up...`);
      isMountedRef.current = false;
      
      window.removeEventListener('resize', handleResize);
      
      // Cleanup event listeners
      if (cleanupDataHandler) cleanupDataHandler();
      if (cleanupExitHandler) cleanupExitHandler();
      
      if (window.terminal) {
        window.terminal.close(id).catch((error) => {
          console.error(`[Terminal ${id}] Failed to close:`, error);
        });
      }
      
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
    };
  }, [id, cwd, env, onReady, onExit]);

  return (
    <div
      ref={terminalRef}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#1e1e1e',
      }}
    />
  );
}
