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

  // Handle environment changes without recreating terminal
  useEffect(() => {
    if (!xtermRef.current || !env || !isReady) return;
    
    console.log(`[Terminal ${id}] Environment changed:`, env);
    
    // Clear terminal for fresh start
    if (window.terminal) {
      window.terminal.write(id, 'clear\n').catch((err) => {
        console.error('Failed to clear terminal:', err);
      });
    }
    
    // Give clear command time to execute before showing messages
    setTimeout(() => {
      if (!xtermRef.current || !isMountedRef.current) return;
      
      // Update KUBECONFIG when config changes
      if (env.KUBECONFIG && window.terminal) {
        const configCommand = `export KUBECONFIG=${env.KUBECONFIG}\n`;
        window.terminal.write(id, configCommand).catch((err) => {
          console.error('Failed to update KUBECONFIG:', err);
        });
        
        xtermRef.current.writeln(`\x1b[36m✓ KUBECONFIG: ${env.KUBECONFIG}\x1b[0m`);
      }
      
      // Update kubectl alias when namespace changes
      if (env.KUBECTL_NAMESPACE && window.terminal) {
        const namespace = env.KUBECTL_NAMESPACE;
        const aliasCommand = `export KUBECTL_NAMESPACE=${namespace}\nalias kubectl='kubectl -n ${namespace}'\n`;
        window.terminal.write(id, aliasCommand).catch((err) => {
          console.error('Failed to update kubectl alias:', err);
        });
        
        xtermRef.current.writeln(`\x1b[32m✓ Namespace: ${namespace}\x1b[0m`);
        xtermRef.current.writeln(`\x1b[90m  All kubectl commands will use -n ${namespace}\x1b[0m`);
      }
      
      xtermRef.current.writeln('');
    }, 100);
  }, [env, id, isReady]);

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
    if (!terminalRef.current) {
      console.error(`[Terminal ${id}] Container ref is null`);
      return;
    }
    
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
        
        // Set up kubectl alias with namespace if provided
        if (env?.KUBECTL_NAMESPACE && window.terminal) {
          const namespace = env.KUBECTL_NAMESPACE;
          const aliasCommand = `alias kubectl='kubectl -n ${namespace}'\n`;
          window.terminal.write(id, aliasCommand).catch((err) => {
            console.error('Failed to set kubectl alias:', err);
          });
          
          // Show info message
          xterm.writeln(`\x1b[32m✓ kubectl configured for namespace: ${namespace}\x1b[0m`);
          xterm.writeln(`\x1b[36mℹ All kubectl commands will use -n ${namespace} automatically\x1b[0m`);
          xterm.writeln('');
        }
        
        if (onReady) onReady();
      })
      .catch((error) => {
        console.error(`[Terminal ${id}] Failed to create:`, error);
        xterm.writeln(`\x1b[31mFailed to create terminal: ${error.message}\x1b[0m`);
      });

    // Handle user input
    xterm.onData((data) => {
      if (window.terminal && isMountedRef.current) {
        window.terminal.write(id, data).catch((error) => {
          console.error(`[Terminal ${id}] Failed to write:`, error);
        });
      }
    });

    // Handle keyboard shortcuts for copy/paste
    xterm.attachCustomKeyEventHandler((event) => {
      // Ctrl+C or Cmd+C - Copy when text is selected
      if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
        const selection = xterm.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection);
          return false; // Prevent default
        }
        // If no selection, let Ctrl+C send SIGINT to terminal
        return true;
      }
      
      // Ctrl+V or Cmd+V - Paste
      if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
        event.preventDefault();
        navigator.clipboard.readText().then((text) => {
          if (window.terminal && isMountedRef.current) {
            window.terminal.write(id, text);
          }
        }).catch((err) => {
          console.error('Failed to read clipboard:', err);
        });
        return false;
      }
      
      return true; // Allow other keys
    });

    // Handle right-click context menu for copy/paste
    terminalRef.current.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      
      const selection = xterm.getSelection();
      
      // Create context menu
      const menu = document.createElement('div');
      menu.style.position = 'fixed';
      menu.style.left = `${e.clientX}px`;
      menu.style.top = `${e.clientY}px`;
      menu.style.backgroundColor = '#2d2d30';
      menu.style.border = '1px solid #454545';
      menu.style.borderRadius = '4px';
      menu.style.padding = '4px 0';
      menu.style.zIndex = '10000';
      menu.style.minWidth = '150px';
      menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
      
      // Copy option (only if text is selected)
      if (selection) {
        const copyItem = document.createElement('div');
        copyItem.textContent = 'Copy';
        copyItem.style.padding = '6px 12px';
        copyItem.style.cursor = 'pointer';
        copyItem.style.color = '#cccccc';
        copyItem.style.fontSize = '13px';
        copyItem.onmouseover = () => copyItem.style.backgroundColor = '#094771';
        copyItem.onmouseout = () => copyItem.style.backgroundColor = 'transparent';
        copyItem.onclick = () => {
          navigator.clipboard.writeText(selection);
          document.body.removeChild(menu);
        };
        menu.appendChild(copyItem);
      }
      
      // Paste option
      const pasteItem = document.createElement('div');
      pasteItem.textContent = 'Paste';
      pasteItem.style.padding = '6px 12px';
      pasteItem.style.cursor = 'pointer';
      pasteItem.style.color = '#cccccc';
      pasteItem.style.fontSize = '13px';
      pasteItem.onmouseover = () => pasteItem.style.backgroundColor = '#094771';
      pasteItem.onmouseout = () => pasteItem.style.backgroundColor = 'transparent';
      pasteItem.onclick = async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (window.terminal && isMountedRef.current) {
            window.terminal.write(id, text);
          }
        } catch (err) {
          console.error('Failed to read clipboard:', err);
        }
        document.body.removeChild(menu);
      };
      menu.appendChild(pasteItem);
      
      // Clear selection option (only if text is selected)
      if (selection) {
        const clearItem = document.createElement('div');
        clearItem.textContent = 'Clear Selection';
        clearItem.style.padding = '6px 12px';
        clearItem.style.cursor = 'pointer';
        clearItem.style.color = '#cccccc';
        clearItem.style.fontSize = '13px';
        clearItem.onmouseover = () => clearItem.style.backgroundColor = '#094771';
        clearItem.onmouseout = () => clearItem.style.backgroundColor = 'transparent';
        clearItem.onclick = () => {
          xterm.clearSelection();
          document.body.removeChild(menu);
        };
        menu.appendChild(clearItem);
      }
      
      document.body.appendChild(menu);
      
      // Close menu on click outside
      const closeMenu = (event: MouseEvent) => {
        if (!menu.contains(event.target as Node)) {
          if (document.body.contains(menu)) {
            document.body.removeChild(menu);
          }
          document.removeEventListener('click', closeMenu);
        }
      };
      setTimeout(() => document.addEventListener('click', closeMenu), 0);
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

    // Handle window resize - make terminal grow with window
    const handleResize = () => {
      // Early return if component is unmounted
      if (!isMountedRef.current) return;
      
      // Check all refs are still valid
      const fitAddon = fitAddonRef.current;
      const xterm = xtermRef.current;
      
      if (!fitAddon || !xterm || !window.terminal) return;
      
      try {
        // Check if terminal is disposed - element becomes null after dispose()
        const element = xterm.element;
        if (!element) {
          return;
        }
        
        // Check if terminal element is visible and has dimensions
        if (element.clientWidth === 0 || element.clientHeight === 0) {
          return;
        }
        
        // Check if terminal has buffer (disposed terminals don't have buffer)
        if (!xterm.buffer || !xterm.buffer.active) {
          return;
        }
        
        // Fit terminal to container
        fitAddon.fit();
        
        // Get dimensions after fit
        const { cols, rows } = xterm;
        if (cols && rows && cols > 0 && rows > 0) {
          window.terminal.resize(id, cols, rows).catch((error) => {
            // Ignore resize errors - terminal may have closed
            console.debug(`[Terminal ${id}] Resize backend failed:`, error);
          });
        }
      } catch (error) {
        // Silently ignore all resize errors - terminal may be disposed
        // This is normal during cleanup
      }
    };

    // Listen to window resize
    window.addEventListener('resize', handleResize);

    // Use ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(() => {
      if (isMountedRef.current) {
        try {
          handleResize();
        } catch (error) {
          // Ignore resize errors during cleanup
          console.debug(`[Terminal ${id}] ResizeObserver error:`, error);
        }
      }
    });
    
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    // Cleanup
    return () => {
      console.log(`[Terminal ${id}] Cleaning up...`);
      isMountedRef.current = false;
      
      // Remove event listeners first
      window.removeEventListener('resize', handleResize);
      
      // Disconnect resize observer
      try {
        resizeObserver.disconnect();
      } catch (error) {
        console.debug(`[Terminal ${id}] ResizeObserver disconnect error:`, error);
      }
      
      // Cleanup event listeners
      if (cleanupDataHandler) cleanupDataHandler();
      if (cleanupExitHandler) cleanupExitHandler();
      
      // Close backend terminal
      if (window.terminal) {
        window.terminal.close(id).catch((error) => {
          console.error(`[Terminal ${id}] Failed to close:`, error);
        });
      }
      
      // Dispose fit addon first (before terminal)
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.dispose();
        } catch (error) {
          console.debug(`[Terminal ${id}] FitAddon dispose error:`, error);
        }
        fitAddonRef.current = null;
      }
      
      // Dispose terminal last
      if (xtermRef.current) {
        try {
          xtermRef.current.dispose();
        } catch (error) {
          console.debug(`[Terminal ${id}] Terminal dispose error:`, error);
        }
        xtermRef.current = null;
      }
    };
  }, [id, cwd, onReady, onExit]);

  // Separate effect for initial resize after terminal is ready
  useEffect(() => {
    if (isReady && isMountedRef.current && fitAddonRef.current && xtermRef.current) {
      setTimeout(() => {
        if (isMountedRef.current && fitAddonRef.current) {
          try {
            fitAddonRef.current.fit();
            const { cols, rows } = xtermRef.current!;
            if (cols && rows && cols > 0 && rows > 0 && window.terminal) {
              window.terminal.resize(id, cols, rows).catch((error) => {
                console.error(`[Terminal ${id}] Failed to resize:`, error);
              });
            }
          } catch (error) {
            console.debug(`[Terminal ${id}] Initial resize skipped:`, error);
          }
        }
      }, 200);
    }
  }, [isReady, id]);

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
