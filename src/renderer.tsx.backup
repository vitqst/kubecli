import React, { useCallback, useEffect, useMemo, useState, memo } from 'react';
import { createRoot } from 'react-dom/client';
import type { KubeConfigSummary, KubectlResult, KubeContext, KubeConfigFile } from './common/kubeTypes';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Terminal } from './components/Terminal';
import { TerminalSidebar } from './components/TerminalSidebar';
import { ActionPromptDialog } from './components/ActionPromptDialog';
import { ResourceType, getResourceDefinition, ResourceActionContext } from './resources';

// Memoized Memory Display Component to prevent re-rendering entire app
const MemoryDisplay = memo(() => {
  const [memoryUsage, setMemoryUsage] = useState<{ used: number; total: number }>({ used: 0, total: 0 });

  useEffect(() => {
    const updateMemory = () => {
      if (performance && (performance as any).memory) {
        const memory = (performance as any).memory;
        setMemoryUsage({
          used: memory.usedJSHeapSize,
          total: memory.jsHeapSizeLimit,
        });
      }
    };

    updateMemory();
    const interval = setInterval(updateMemory, 2000);
    return () => clearInterval(interval);
  }, []);

  if (memoryUsage.total === 0) return null;

  const usedMB = (memoryUsage.used / 1024 / 1024).toFixed(1);
  const totalMB = (memoryUsage.total / 1024 / 1024).toFixed(0);
  const percentage = (memoryUsage.used / memoryUsage.total) * 100;
  const color = percentage > 90 ? '#f48771' : percentage > 70 ? '#dcdcaa' : '#4ec9b0';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '4px 12px',
      backgroundColor: '#1e1e1e',
      borderRadius: '4px',
      border: '1px solid #3e3e42',
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
        <path d="M4 6h16M4 12h16M4 18h16"></path>
      </svg>
      <span style={{
        fontSize: '0.75rem',
        fontFamily: 'monospace',
        fontWeight: 500,
        color,
      }}>
        RAM: {usedMB} / {totalMB} MB ({percentage.toFixed(1)}%)
      </span>
    </div>
  );
});

MemoryDisplay.displayName = 'MemoryDisplay';

// Fix for webpack asset relocator __dirname issue in renderer
declare global {
  var __dirname: string;
}
if (typeof __dirname === 'undefined') {
  (globalThis as any).__dirname = '';
}

type LoadState = 'idle' | 'loading' | 'error';

type CommandResult = KubectlResult & {
  completedAt: Date;
};

const kubeAPI = window.kube;

function App() {
  console.log('[App] Component rendering...');
  
  const [contexts, setContexts] = useState<KubeContext[]>([]);
  const [currentContext, setCurrentContext] = useState<string | null>(null);
  const [selectedContext, setSelectedContext] = useState<string>('');
  const [kubeconfigPath, setKubeconfigPath] = useState<string>('');
  const [availableConfigs, setAvailableConfigs] = useState<KubeConfigFile[]>([]);
  const [command, setCommand] = useState<string>('');
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [showTerminal, setShowTerminal] = useState<boolean>(false);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [selectedNamespace, setSelectedNamespace] = useState<string>('default');
  const [loadingNamespaces, setLoadingNamespaces] = useState<boolean>(false);
  const [isConfigChanging, setIsConfigChanging] = useState<boolean>(false);
  const [promptDialog, setPromptDialog] = useState<{
    actionId: string;
    context: ResourceActionContext;
    title: string;
    prompts?: any[];
    confirmMessage?: string;
  } | null>(null);
  const [isInEditMode, setIsInEditMode] = useState<boolean>(false);

  // Load namespaces for current context
  const loadNamespaces = useCallback(async (contextName: string) => {
    if (!contextName || !kubeAPI) return;
    
    // Verify context exists in current context list
    if (!contexts.some(ctx => ctx.name === contextName)) {
      console.log(`Context ${contextName} not found in current config, skipping namespace load`);
      return;
    }
    
    setLoadingNamespaces(true);
    try {
      const result = await kubeAPI.runCommand(contextName, 'get namespaces -o jsonpath={.items[*].metadata.name}');
      if (result.code === 0 && result.stdout) {
        const nsList = result.stdout.trim().split(/\s+/).filter(Boolean);
        setNamespaces(nsList);
        
        // Restore last selected namespace from localStorage
        const storageKey = `kubecli-namespace-${contextName}`;
        const savedNamespace = localStorage.getItem(storageKey);
        if (savedNamespace && nsList.includes(savedNamespace)) {
          setSelectedNamespace(savedNamespace);
        } else if (nsList.includes('default')) {
          setSelectedNamespace('default');
        } else if (nsList.length > 0) {
          setSelectedNamespace(nsList[0]);
        }
      }
    } catch (error) {
      console.error('Failed to load namespaces:', error);
      setNamespaces(['default']);
      setSelectedNamespace('default');
    } finally {
      setLoadingNamespaces(false);
    }
  }, [contexts]);

  const applySummary = useCallback((summary: KubeConfigSummary) => {
      setContexts(summary.contexts);
      setCurrentContext(summary.currentContext);
      setKubeconfigPath(summary.kubeconfigPath);
      setAvailableConfigs(summary.availableConfigs || []);

      const availableNames = summary.contexts.map((ctx) => ctx.name);
      const fallback = summary.currentContext ?? availableNames[0] ?? '';

      setSelectedContext((prev) => {
        if (prev && availableNames.includes(prev)) {
          return prev;
        }
        return fallback;
      });
    }, []);

  const refreshContexts = useCallback(async () => {
    if (!kubeAPI) {
      setLoadState('error');
      setLoadError(
        'Renderer bridge unavailable. Ensure the preload script is configured and contextIsolation remains enabled.'
      );
      return;
    }

    setLoadState('loading');
    setLoadError(null);
    try {
      const summary = await kubeAPI.getContexts();
      applySummary(summary);
      setLoadState('idle');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load contexts';
      setLoadError(message);
      setLoadState('error');
    }
  }, [applySummary]);

  useEffect(() => {
    void refreshContexts();
  }, [refreshContexts]);

  // Load namespaces when context changes
  useEffect(() => {
    if (selectedContext) {
      void loadNamespaces(selectedContext);
    }
  }, [selectedContext, loadNamespaces]);

  // Handle namespace change and save to localStorage
  const handleNamespaceChange = useCallback((namespace: string) => {
    setIsConfigChanging(true);
    // Small delay to ensure overlay appears before state update
    setTimeout(() => {
      setSelectedNamespace(namespace);
      if (selectedContext) {
        const storageKey = `kubecli-namespace-${selectedContext}`;
        localStorage.setItem(storageKey, namespace);
      }
      // Keep loading state to let terminal update and prevent flicker
      // Longer duration ensures overlay stays until terminal is fully settled
      setTimeout(() => setIsConfigChanging(false), 1400);
    }, 50);
  }, [selectedContext]);

  // Handle edit mode changes from terminal
  const handleEditModeChange = useCallback((isEditMode: boolean) => {
    setIsInEditMode(isEditMode);
  }, []);

  // Generic resource action handler - SOLID principle: Single Responsibility
  // This handler delegates to the resource action system instead of having
  // multiple specific handlers for each resource type and action
  const handleResourceAction = useCallback(
    (actionId: string, resourceType: ResourceType, resourceName: string, customNamespace?: string) => {
      if (!window.terminal || !selectedNamespace) return;
      
      // Prevent actions when in edit mode
      if (isInEditMode) {
        console.warn('Cannot execute action while terminal is in edit mode');
        return;
      }

      // Use custom namespace if provided (for resources like CronJobs), otherwise use selected namespace
      const namespace = customNamespace || selectedNamespace;

      const context: ResourceActionContext = {
        resourceName,
        namespace,
        resourceType,
      };

      // Get the resource definition and action
      const resource = getResourceDefinition(resourceType);
      if (!resource) {
        console.warn(`Resource type "${resourceType}" not found`);
        return;
      }

      const action = resource.getActions().find(a => a.id === actionId);
      if (!action) {
        console.warn(`Action "${actionId}" not found for resource type "${resourceType}"`);
        return;
      }

      // Check if action requires prompts or confirmation
      if (action.prompts || action.confirmMessage) {
        const confirmMsg = typeof action.confirmMessage === 'function'
          ? action.confirmMessage(context)
          : action.confirmMessage;

        setPromptDialog({
          actionId,
          context,
          title: `${action.label} - ${resourceName}`,
          prompts: action.prompts,
          confirmMessage: confirmMsg,
        });
        return;
      }

      // Execute action directly if no prompts needed
      executeAction(actionId, context, {});
    },
    [selectedNamespace, isInEditMode]
  );

  // Execute action with prompt values
  const executeAction = useCallback((actionId: string, context: ResourceActionContext, promptValues: Record<string, any>) => {
    if (!window.terminal) return;

    const resource = getResourceDefinition(context.resourceType);
    if (!resource) return;

    const action = resource.getActions().find(a => a.id === actionId);
    if (!action) return;

    const command = action.getCommand(context, promptValues);
    if (command) {
      window.terminal.write('main', command).catch((error) => {
        console.error(`Failed to execute ${actionId} on ${context.resourceType} ${context.resourceName}:`, error);
      });
    }
  }, []);

  // Handle prompt dialog confirm
  const handlePromptConfirm = useCallback((values: Record<string, any>) => {
    if (promptDialog) {
      executeAction(promptDialog.actionId, promptDialog.context, values);
      setPromptDialog(null);
    }
  }, [promptDialog, executeAction]);

  // Handle prompt dialog cancel
  const handlePromptCancel = useCallback(() => {
    setPromptDialog(null);
  }, []);

  const handleContextChange = useCallback(
    async (nextContext: string) => {
      setRunError(null);
      setIsConfigChanging(true);
      // Small delay to ensure overlay appears before state update
      await new Promise(resolve => setTimeout(resolve, 50));
      try {
        if (!kubeAPI) {
          throw new Error('Renderer bridge unavailable.');
        }
        setSelectedContext(nextContext);
        const summary = await kubeAPI.setContext(nextContext);
        applySummary(summary);
        // Keep loading state to let terminal update and prevent flicker
        // Longer duration ensures overlay stays until terminal is fully settled
        setTimeout(() => setIsConfigChanging(false), 1900);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to switch context';
        setRunError(message);
        setIsConfigChanging(false);
        await refreshContexts();
      }
    },
    [applySummary, refreshContexts]
  );

  const handleConfigChange = useCallback(
    async (configPath: string) => {
      setLoadState('loading');
      setLoadError(null);
      setRunError(null);
      setIsConfigChanging(true);
      // Small delay to ensure overlay appears before state update
      await new Promise(resolve => setTimeout(resolve, 50));
      // Clear selected context and namespaces to prevent race conditions
      setSelectedContext('');
      setNamespaces([]);
      setSelectedNamespace('default');
      try {
        if (!kubeAPI) {
          throw new Error('Renderer bridge unavailable.');
        }
        const summary = await kubeAPI.setConfig(configPath);
        applySummary(summary);
        setLoadState('idle');
        // Keep loading state to let terminal update and prevent flicker
        // Longer duration ensures overlay stays until terminal is fully settled
        setTimeout(() => setIsConfigChanging(false), 2200);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to switch kubeconfig';
        setLoadError(message);
        setLoadState('error');
        setIsConfigChanging(false);
      }
    },
    [applySummary]
  );

  const handleRun = useCallback(async () => {
    if (!selectedContext) {
      setRunError('Select a context before running a command.');
      return;
    }

    if (!command.trim()) {
      setRunError('Enter a kubectl command to run.');
      return;
    }

    setIsRunning(true);
    setRunError(null);
    setResult(null);
    try {
      if (!kubeAPI) {
        throw new Error('Renderer bridge unavailable.');
      }
      const runResult = await kubeAPI.runCommand(selectedContext, command);
      setResult({
        ...runResult,
        completedAt: new Date(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to run kubectl command';
      setRunError(message);
    } finally {
      setIsRunning(false);
    }
  }, [command, selectedContext]);

  const activeContextDetails = useMemo(() => {
    return contexts.find((ctx) => ctx.name === selectedContext) ?? null;
  }, [contexts, selectedContext]);

  const disabled = contexts.length === 0 || loadState === 'loading';
  const configSelectDisabled = loadState === 'loading'; // Only disable during loading, not when no contexts

  if (!kubeAPI) {
    return (
      <div style={styles.container}>
        <header style={styles.header}>
          <h1 style={styles.title}>Kubernetes CLI Manager</h1>
        </header>
        <p style={styles.error}>
          Unable to reach Electron preload bridge. Double-check the application
          configuration (`preload.ts`) and restart the app.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <style>{`
        .home-icon-button:hover {
          background-color: #094771 !important;
          border-color: #0e639c !important;
        }
        .get-started-button:hover:not(:disabled) {
          background-color: #1177bb !important;
        }
        .get-started-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .form-select:hover:not(:disabled) {
          border-color: #0e639c !important;
        }
        .form-select:focus {
          border-color: #0e639c !important;
          box-shadow: 0 0 0 2px rgba(14, 99, 156, 0.2);
        }
        .home-card {
          animation: fadeIn 0.4s ease-out;
        }
      `}</style>
      {showTerminal ? (
        <>
          {/* Terminal Top Bar */}
          <header style={styles.terminalHeader}>
            <button
              onClick={() => {
                setShowTerminal(false);
                setIsInEditMode(false); // Reset edit mode when leaving terminal
              }}
              style={styles.homeIconButton}
              className="home-icon-button"
              title="Go back to home"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
            </button>
            <div style={styles.configPathDisplay}>
              <span style={styles.configLabel}>Config:</span>
              <span style={styles.configPath}>{kubeconfigPath}</span>
            </div>
            <MemoryDisplay />
          </header>
          
          {/* Terminal Content */}
          <div style={styles.terminalContainer}>
            <TerminalSidebar
              kubeconfigPath={kubeconfigPath}
              availableConfigs={availableConfigs}
              selectedContext={selectedContext}
              contexts={contexts}
              selectedNamespace={selectedNamespace}
              namespaces={namespaces}
              loadingNamespaces={loadingNamespaces}
              isInEditMode={isInEditMode}
              onConfigChange={handleConfigChange}
              onContextChange={handleContextChange}
              onNamespaceChange={handleNamespaceChange}
              onResourceAction={handleResourceAction}
            />
            <div style={styles.terminalMain}>
              <Terminal 
                id="main"
                env={{ 
                  KUBECONFIG: kubeconfigPath,
                  KUBECTL_NAMESPACE: selectedNamespace 
                }}
                isLoading={isConfigChanging}
                onEditModeChange={handleEditModeChange}
              />
            </div>
          </div>
        </>
      ) : (
        <div style={styles.homeContainer}>
          {/* Home Screen Header */}
          <div style={styles.homeHeader}>
            <div style={styles.logoContainer}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4ec9b0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
              <h1 style={styles.homeTitle}>Kubernetes CLI Manager</h1>
            </div>
            <p style={styles.homeSubtitle}>Manage your Kubernetes clusters with ease</p>
          </div>

          {/* Home Screen Content */}
          <div style={styles.homeContent}>
            <div style={styles.homeCard} className="home-card">
              <h2 style={styles.cardTitle}>Configuration</h2>
              
              {loadState === 'loading' && (
                <div style={styles.loadingMessage}>
                  <div style={styles.spinner}></div>
                  <span>Loading contexts…</span>
                </div>
              )}
              
              {loadError && (
                <div style={styles.errorMessage}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <span>{loadError}</span>
                </div>
              )}

              {!loadState || loadState === 'idle' ? (
                <>
                  {/* Kubeconfig File Selector */}
                  {availableConfigs.length > 1 && (
                    <div style={styles.formGroup}>
                      <label htmlFor="config-select" style={styles.formLabel}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                          <polyline points="13 2 13 9 20 9"></polyline>
                        </svg>
                        Kubeconfig File
                      </label>
                      <select
                        id="config-select"
                        style={styles.formSelect}
                        className="form-select"
                        disabled={configSelectDisabled}
                        value={kubeconfigPath}
                        onChange={(event) => handleConfigChange(event.target.value)}
                      >
                        {availableConfigs.map((config) => (
                          <option key={config.path} value={config.path}>
                            {config.name} {config.isDefault ? '(default)' : ''}
                          </option>
                        ))}
                      </select>
                      <div style={styles.formHint}>{kubeconfigPath}</div>
                    </div>
                  )}

                  {/* Context Selector */}
                  <div style={styles.formGroup}>
                    <label htmlFor="context-select" style={styles.formLabel}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="2" y1="12" x2="22" y2="12"></line>
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                      </svg>
                      Kubernetes Context
                    </label>
                    {contexts.length > 0 ? (
                      <>
                        <select
                          id="context-select"
                          style={styles.formSelect}
                          className="form-select"
                          disabled={disabled}
                          value={selectedContext}
                          onChange={(event) => handleContextChange(event.target.value)}
                        >
                          {contexts.map((ctx) => (
                            <option key={ctx.name} value={ctx.name}>
                              {ctx.name}
                              {ctx.name === currentContext ? ' (current)' : ''}
                            </option>
                          ))}
                        </select>
                        {activeContextDetails && (
                          <div style={styles.contextInfo}>
                            <div style={styles.contextInfoRow}>
                              <span style={styles.contextInfoLabel}>Cluster:</span>
                              <span style={styles.contextInfoValue}>{activeContextDetails.cluster ?? 'N/A'}</span>
                            </div>
                            <div style={styles.contextInfoRow}>
                              <span style={styles.contextInfoLabel}>Server:</span>
                              <span style={styles.contextInfoValue}>{activeContextDetails.server ?? 'N/A'}</span>
                            </div>
                            <div style={styles.contextInfoRow}>
                              <span style={styles.contextInfoLabel}>User:</span>
                              <span style={styles.contextInfoValue}>{activeContextDetails.user ?? 'N/A'}</span>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={styles.noDataMessage}>
                        No contexts found. Check that your kubeconfig is available.
                      </div>
                    )}
                  </div>

                  {/* Get Started Button */}
                  {contexts.length > 0 && selectedContext && (
                    <button
                      onClick={() => {
                        setShowTerminal(true);
                        setIsInEditMode(false); // Reset edit mode when entering terminal
                      }}
                      style={styles.getStartedButton}
                      className="get-started-button"
                      disabled={disabled}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6"></polyline>
                      </svg>
                      Get Started
                    </button>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Action Prompt Dialog */}
      {promptDialog && (
        <ActionPromptDialog
          title={promptDialog.title}
          prompts={promptDialog.prompts}
          confirmMessage={promptDialog.confirmMessage}
          context={promptDialog.context}
          onConfirm={handlePromptConfirm}
          onCancel={handlePromptCancel}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    width: '100%',
    height: '100vh',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: '#1e1e1e',
  },
  // Home Screen Styles
  homeContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#1e1e1e',
    overflow: 'auto',
  },
  homeHeader: {
    padding: '60px 40px 40px',
    textAlign: 'center',
    borderBottom: '1px solid #3e3e42',
  },
  logoContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    marginBottom: '16px',
  },
  homeTitle: {
    fontSize: '2.5rem',
    fontWeight: 600,
    margin: 0,
    color: '#cccccc',
  },
  homeSubtitle: {
    fontSize: '1.125rem',
    color: '#858585',
    margin: '8px 0 0',
  },
  homeContent: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: '60px 40px',
  },
  homeCard: {
    width: '100%',
    maxWidth: '600px',
    backgroundColor: '#252526',
    border: '1px solid #3e3e42',
    borderRadius: '8px',
    padding: '32px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
  },
  cardTitle: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#cccccc',
    marginTop: 0,
    marginBottom: '24px',
  },
  formGroup: {
    marginBottom: '24px',
  },
  formLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#cccccc',
    marginBottom: '8px',
  },
  formSelect: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '1rem',
    backgroundColor: '#3c3c3c',
    border: '1px solid #3e3e42',
    borderRadius: '6px',
    color: '#cccccc',
    cursor: 'pointer',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  formHint: {
    fontSize: '0.75rem',
    color: '#858585',
    marginTop: '6px',
    fontStyle: 'italic',
  },
  contextInfo: {
    marginTop: '12px',
    padding: '12px',
    backgroundColor: '#1e1e1e',
    border: '1px solid #3e3e42',
    borderRadius: '6px',
  },
  contextInfoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    fontSize: '0.875rem',
  },
  contextInfoLabel: {
    color: '#858585',
    fontWeight: 500,
  },
  contextInfoValue: {
    color: '#4ec9b0',
    fontFamily: 'monospace',
  },
  getStartedButton: {
    width: '100%',
    padding: '14px 24px',
    fontSize: '1.125rem',
    fontWeight: 600,
    backgroundColor: '#0e639c',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'background-color 0.2s',
    marginTop: '8px',
  },
  loadingMessage: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    color: '#cccccc',
    fontSize: '0.875rem',
  },
  spinner: {
    width: '20px',
    height: '20px',
    border: '2px solid #3e3e42',
    borderTop: '2px solid #0e639c',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  errorMessage: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    backgroundColor: '#5a1d1d',
    border: '1px solid #be1100',
    borderRadius: '6px',
    color: '#f48771',
    fontSize: '0.875rem',
  },
  noDataMessage: {
    padding: '16px',
    color: '#858585',
    fontSize: '0.875rem',
    fontStyle: 'italic',
    textAlign: 'center',
    backgroundColor: '#1e1e1e',
    border: '1px solid #3e3e42',
    borderRadius: '6px',
  },
  // Terminal Screen Styles
  terminalHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '12px 16px',
    backgroundColor: '#252526',
    borderBottom: '1px solid #3e3e42',
    flexShrink: 0,
  },
  homeIconButton: {
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    border: '1px solid #3e3e42',
    borderRadius: '6px',
    color: '#cccccc',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  configPathDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
  },
  configLabel: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#858585',
  },
  configPath: {
    fontSize: '0.875rem',
    color: '#4ec9b0',
    fontFamily: 'monospace',
  },
  section: {
    marginBottom: '24px',
  },
  subtitle: {
    fontSize: '1.25rem',
    marginBottom: '12px',
  },
  contextRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  label: {
    minWidth: '120px',
  },
  select: {
    flex: '1',
    padding: '8px',
    fontSize: '1rem',
  },
  contextDetails: {
    marginTop: '12px',
    paddingLeft: '18px',
    color: '#52606d',
  },
  commandRow: {
    display: 'flex',
    gap: '12px',
  },
  commandInput: {
    flex: 1,
    padding: '10px',
    fontSize: '1rem',
    borderRadius: '4px',
    border: '1px solid #cbd2d9',
  },
  runButton: {
    padding: '10px 16px',
    fontSize: '1rem',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: '#2563eb',
    color: '#fff',
  },
  resultContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  resultMeta: {
    display: 'flex',
    gap: '16px',
    fontSize: '0.9rem',
    color: '#52606d',
  },
  outputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  outputTitle: {
    margin: 0,
    fontSize: '1rem',
    color: '#1f2933',
  },
  outputBlock: {
    backgroundColor: '#f5f7fa',
    border: '1px solid #cbd2d9',
    padding: '12px',
    borderRadius: '4px',
    minHeight: '120px',
    whiteSpace: 'pre-wrap',
    fontFamily: 'ui-monospace, SFMono-Regular, SFMono, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
    fontSize: '0.95rem',
  },
  placeholder: {
    color: '#52606d',
  },
  hint: {
    fontSize: '0.875rem',
    color: '#52606d',
    marginTop: '8px',
    fontStyle: 'italic',
  },
  error: {
    color: '#c81e1e',
    marginTop: '8px',
  },
  terminalContainer: {
    flex: 1,
    width: '100%',
    display: 'flex',
    flexDirection: 'row',
    backgroundColor: '#1e1e1e',
    overflow: 'hidden',
  },
  terminalMain: {
    flex: 1,
    height: '100%',
    overflow: 'hidden',
  },
};

function initializeApp() {
  console.log('[Renderer] Initializing app...');
  
  const container = document.getElementById('root');

  if (!container) {
    console.error('[Renderer] Root container element not found!');
    throw new Error('Root container element not found');
  }

  console.log('[Renderer] Root container found, creating React root...');
  const root = createRoot(container);

  console.log('[Renderer] Rendering App component...');
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
  
  console.log('[Renderer] App component rendered successfully');
}

// Global error handlers
window.addEventListener('error', (event) => {
  // Suppress xterm.js disposal errors - these are harmless and occur during cleanup
  if (event.message && typeof event.message === 'string') {
    const msg = event.message.toLowerCase();
    if (msg.includes('handleresize') || 
        msg.includes('dimensions') || 
        msg.includes('xterm')) {
      // These are expected during terminal disposal, don't log them
      event.preventDefault();
      return;
    }
  }
  
  console.error('[Global Error Handler] Uncaught error:', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Global Error Handler] Unhandled promise rejection:', {
    reason: event.reason,
    promise: event.promise,
  });
});

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
