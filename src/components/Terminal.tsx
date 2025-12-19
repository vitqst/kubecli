import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import 'xterm/css/xterm.css';
import { terminal as terminalApi } from '../api';

interface TerminalProps {
  id: string;
  cwd?: string;
  env?: Record<string, string>;
  pendingCommand?: string | null;
  onCommandExecuted?: () => void;
  onReady?: () => void;
  onExit?: (exitCode: number, signal?: number) => void;
  onEditModeChange?: (isEditMode: boolean) => void;
  isLoading?: boolean;
}

export function Terminal({ id, cwd, env, pendingCommand, onCommandExecuted, onReady, onExit, onEditModeChange, isLoading = false }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isReady, setIsReady] = useState(false);
  const isMountedRef = useRef(true);
  const terminalIdRef = useRef<string | null>(null);

  // Handle environment changes without recreating terminal
  useEffect(() => {
    if (!xtermRef.current || !env || !isReady || !terminalIdRef.current) return;

    console.log(`[Terminal ${id}] Environment changed:`, env);

    // Wait for loading overlay to appear and be fully visible
    // This prevents any flickering by doing all updates while overlay is shown
    setTimeout(() => {
      if (!xtermRef.current || !isMountedRef.current || !terminalIdRef.current) return;

      // Batch all terminal writes together to minimize redraws
      const commands: string[] = [];
      const messages: string[] = [];

      // Update KUBECONFIG when config changes
      if (env.KUBECONFIG) {
        commands.push(`export KUBECONFIG=${env.KUBECONFIG}`);
        // messages.push(`\x1b[36m✓ KUBECONFIG: ${env.KUBECONFIG}\x1b[0m`);
      }

      // Export namespace as environment variable (no alias needed - helpers handle it)
      if (env.KUBECTL_NAMESPACE) {
        const namespace = env.KUBECTL_NAMESPACE;
        commands.push(`export KUBECTL_NAMESPACE=${namespace}`);

        // messages.push(`\x1b[32m✓ Namespace: ${namespace}\x1b[0m`);
      }

      // Clear and write everything in one operation to prevent double blink
      xtermRef.current.clear();

      // Write all messages at once
      messages.forEach(msg => {
        if (xtermRef.current) {
          xtermRef.current.writeln(msg);
        }
      });

      if (xtermRef.current) {
        xtermRef.current.writeln('');
      }

      // Send all commands silently (not shown to user)
      if (commands.length > 0 && terminalIdRef.current) {
        const batchCommand = commands.join('; ');
        terminalApi.writeSilent(terminalIdRef.current, batchCommand).catch((err) => {
          console.error('Failed to update environment:', err);
        });
      }
    }, 500); // Wait 500ms for overlay to be fully visible before any terminal updates
  }, [env, id, isReady]);

  // Handle pending command execution
  useEffect(() => {
    if (!pendingCommand || !isReady || !terminalIdRef.current || !isMountedRef.current) return;

    console.log(`[Terminal ${id}] Executing pending command:`, pendingCommand);

    // Clear current line first with Ctrl+U, then send the command
    // Using Ctrl+U alone to avoid Ctrl+C eating the first character
    const clearAndExecute = '\x15' + pendingCommand + '\n';

    terminalApi.write(terminalIdRef.current, clearAndExecute).then(() => {
      console.log(`[Terminal ${id}] Command sent successfully`);
      if (onCommandExecuted) {
        onCommandExecuted();
      }
    }).catch((error) => {
      console.error(`[Terminal ${id}] Failed to execute command:`, error);
    });
  }, [pendingCommand, isReady, id, onCommandExecuted]);

  useEffect(() => {
    isMountedRef.current = true;

    if (!terminalRef.current) {
      console.error('[Terminal] Terminal ref not available');
      return;
    }

    console.log(`[Terminal ${id}] Initializing...`);

    // Store cleanup functions for async listeners
    let unlistenData: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;

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

    // Load Unicode11 addon for proper handling of wide characters
    // This fixes cursor positioning with zsh themes using special characters like ╰─$
    const unicode11Addon = new Unicode11Addon();
    xterm.loadAddon(unicode11Addon);
    xterm.unicode.activeVersion = '11';

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

    // Register event listeners BEFORE creating backend terminal to avoid race condition
    // This ensures we don't miss any early output from the PTY
    terminalApi.onData((payload) => {
      if (payload.terminalId === terminalIdRef.current && xtermRef.current && isMountedRef.current) {
        xtermRef.current.write(payload.data);
      }
    }).then((unlisten) => {
      unlistenData = unlisten;
    });

    terminalApi.onExit((termId) => {
      if (termId === terminalIdRef.current) {
        console.log(`[Terminal ${id}] Exited`);
        if (xtermRef.current) {
          xtermRef.current.writeln(`\r\n\x1b[33mTerminal exited\x1b[0m`);
        }
        if (onExit) onExit(0);
      }
    }).then((unlisten) => {
      unlistenExit = unlisten;
    });

    // Create backend terminal
    terminalApi
      .create()
      .then((termId) => {
        console.log(`[Terminal ${id}] Created successfully with backend ID: ${termId}`);
        terminalIdRef.current = termId;

        // Wait for backend initialization to complete
        setTimeout(() => {
          setIsReady(true);

          // Show namespace info (no alias needed - helpers handle namespace)
          if (env?.KUBECTL_NAMESPACE) {
            const namespace = env.KUBECTL_NAMESPACE;
            xterm.writeln(`\x1b[32m✓ Namespace: ${namespace}\x1b[0m`);
            xterm.writeln('');
          }

          if (onReady) onReady();
        }, 300);
      })
      .catch((error) => {
        console.error(`[Terminal ${id}] Failed to create:`, error);
        xterm.writeln(`\x1b[31mFailed to create terminal: ${error}\x1b[0m`);
      });

    // Handle user input
    xterm.onData((data) => {
      if (terminalIdRef.current && isMountedRef.current) {
        terminalApi.write(terminalIdRef.current, data).catch((error) => {
          console.error(`[Terminal ${id}] Failed to write:`, error);
        });
      }
    });

    // Handle keyboard shortcuts for copy/paste
    xterm.attachCustomKeyEventHandler((event) => {
      // Allow global shortcuts to bubble up
      // Ctrl+Shift+P / Cmd+Shift+P - Command Palette
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'P') {
        return false; // Let it bubble to global handler
      }

      // Ctrl+K / Cmd+K - Kubectl Command Palette
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        return false; // Let it bubble to global handler
      }

      // Ctrl+F / Cmd+F - Global Search
      if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
        return false; // Let it bubble to global handler
      }

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
          if (terminalIdRef.current && isMountedRef.current) {
            terminalApi.write(terminalIdRef.current, text);
          }
        }).catch((err) => {
          console.error('Failed to read clipboard:', err);
        });
        return false;
      }

      return true; // Allow other keys
    });

    // Handle right-click context menu for copy/paste
    const contextMenuHandler = (e: MouseEvent) => {
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
          if (terminalIdRef.current && isMountedRef.current) {
            terminalApi.write(terminalIdRef.current, text);
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
    };

    terminalRef.current.addEventListener('contextmenu', contextMenuHandler);

    // Handle window resize - make terminal grow with window
    const handleResize = () => {
      // Early return if component is unmounted
      if (!isMountedRef.current) return;

      // Check all refs are still valid
      const fitAddon = fitAddonRef.current;
      const xterm = xtermRef.current;

      if (!fitAddon || !xterm || !terminalIdRef.current) return;

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
        if (cols && rows && cols > 0 && rows > 0 && terminalIdRef.current) {
          terminalApi.resize(terminalIdRef.current, cols, rows).catch((error) => {
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

      // Cleanup Tauri event listeners
      if (unlistenData) unlistenData();
      if (unlistenExit) unlistenExit();

      // Close backend terminal
      if (terminalIdRef.current) {
        terminalApi.close(terminalIdRef.current).catch((error) => {
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
    if (isReady && isMountedRef.current && fitAddonRef.current && xtermRef.current && terminalIdRef.current) {
      setTimeout(() => {
        if (isMountedRef.current && fitAddonRef.current && terminalIdRef.current) {
          try {
            fitAddonRef.current.fit();
            const { cols, rows } = xtermRef.current!;
            if (cols && rows && cols > 0 && rows > 0 && terminalIdRef.current) {
              terminalApi.resize(terminalIdRef.current, cols, rows).catch((error) => {
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
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={terminalRef}
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#1e1e1e',
        }}
      />
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(30, 30, 30, 1)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            animation: 'fadeIn 0.2s ease-in',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              border: '4px solid #3e3e42',
              borderTop: '4px solid #0e639c',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          <div
            style={{
              marginTop: '16px',
              color: '#cccccc',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            Updating terminal environment...
          </div>
          <style>
            {`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
            `}
          </style>
        </div>
      )}
    </div>
  );
}
