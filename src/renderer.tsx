import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { KubeConfigSummary, KubectlResult, KubeContext, KubeConfigFile } from './common/kubeTypes';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HomeScreen } from './components/screens/HomeScreen';
import { TerminalScreen } from './components/screens/TerminalScreen';
import { ActionPromptDialog } from './components/ActionPromptDialog';
import { ResourceType, getResourceDefinition, ResourceActionContext } from './resources';
import { ResourceCacheProvider } from './contexts/ResourceCacheContext';
import { ErrorProvider } from './contexts/ErrorContext';
import { ErrorBanner } from './components/ErrorBanner';
import { CommandPalette } from './components/CommandPalette';
import { KubectlPalette } from './components/KubectlPalette';
import { addRecentCommand } from './commands';
import { kube as kubeAPI, window as windowAPI } from './api';
import { AuthSessionProvider, useAuthSession } from './contexts/AuthSessionContext';
import { AuthStatusButton } from './components/auth/AuthStatusButton';
import { AzureSessionsDialog } from './components/auth/AzureSessionsDialog';
import { ReauthenticationDialog } from './components/auth/ReauthenticationDialog';

function AuthRecoveryBridge({
  selectedContext,
  reloadNamespaces,
}: {
  selectedContext: string;
  reloadNamespaces: (contextName: string) => Promise<void>;
}) {
  const { registerRecovery } = useAuthSession();

  useEffect(() => registerRecovery(() => {
    if (selectedContext) return reloadNamespaces(selectedContext);
  }), [registerRecovery, reloadNamespaces, selectedContext]);

  return null;
}

function App() {
  // State
  const [contexts, setContexts] = useState<KubeContext[]>([]);
  const [selectedContext, setSelectedContext] = useState<string>('');
  const [kubeconfigPath, setKubeconfigPath] = useState<string>('');
  const [availableConfigs, setAvailableConfigs] = useState<KubeConfigFile[]>([]);
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
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isKubectlPaletteOpen, setIsKubectlPaletteOpen] = useState<boolean>(false);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  // Store pending refresh info - use state so it triggers re-render and passes to TerminalScreen
  const [pendingRefresh, setPendingRefresh] = useState<{ type: ResourceType; delayMs: number } | null>(null);

  // Load namespaces for current context
  const loadNamespaces = useCallback(async (contextName: string) => {
    if (!contextName) return;

    setLoadingNamespaces(true);
    try {
      const result = await kubeAPI.runCommand(contextName, 'get namespaces -o jsonpath={.items[*].metadata.name}');
      if (result.code === 0) {
        const nsList = result.stdout.trim().split(/\s+/).filter(ns => ns);
        setNamespaces(nsList);
        
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
    } finally {
      setLoadingNamespaces(false);
    }
  }, []);

  // Keyboard shortcuts: Ctrl+Shift+P for command palette, Ctrl+K for kubectl palette, Ctrl+Shift+N for new window
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+P or Cmd+Shift+P (Mac) - Resource Command Palette
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }
      // Ctrl+K or Cmd+K - Kubectl Command Palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsKubectlPaletteOpen(true);
      }
      // Ctrl+Shift+N or Cmd+Shift+N - Open New Window
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        windowAPI.openNewWindow();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load initial contexts
  useEffect(() => {
    kubeAPI.getContexts().then((summary: KubeConfigSummary) => {
      setContexts(summary.contexts);
      setSelectedContext(summary.currentContext || '');
      setKubeconfigPath(summary.kubeconfigPath);
      setAvailableConfigs(summary.availableConfigs || []);
      
      if (summary.currentContext) {
        loadNamespaces(summary.currentContext);
      }
    }).catch((error) => {
      console.error('Failed to load contexts:', error);
    });
  }, [loadNamespaces]);

  // Update window title when context or config changes
  useEffect(() => {
    windowAPI.updateWindowTitle(
      selectedContext || null,
      kubeconfigPath || null
    );
  }, [selectedContext, kubeconfigPath]);

  // Handle config change
  const handleConfigChange = useCallback((newConfigPath: string) => {
    // Force synchronous render to show loading state immediately
    flushSync(() => {
      setIsConfigChanging(true);
    });

    const startTime = Date.now();
    kubeAPI.setConfig(newConfigPath).then((summary: KubeConfigSummary) => {
      setContexts(summary.contexts);
      setSelectedContext(summary.currentContext || '');
      setKubeconfigPath(summary.kubeconfigPath);
      setAvailableConfigs(summary.availableConfigs || []);

      // Ensure loading is visible for at least 250ms
      const elapsed = Date.now() - startTime;
      const minDisplayTime = 250;
      const remaining = Math.max(0, minDisplayTime - elapsed);
      setTimeout(() => {
        setIsConfigChanging(false);
        // Load namespaces AFTER UI is responsive (deferred to not block)
        if (summary.currentContext) {
          loadNamespaces(summary.currentContext);
        }
      }, remaining);
    }).catch((error) => {
      console.error('Failed to change config:', error);
      setIsConfigChanging(false);
    });
  }, [loadNamespaces]);

  // Handle context change
  const handleContextChange = useCallback((newContext: string) => {
    // Force synchronous render to show loading state immediately
    flushSync(() => {
      setIsConfigChanging(true);
    });

    const startTime = Date.now();
    kubeAPI.setContext(newContext).then((summary: KubeConfigSummary) => {
      setSelectedContext(summary.currentContext || '');

      // Ensure loading is visible for at least 250ms
      const elapsed = Date.now() - startTime;
      const minDisplayTime = 250;
      const remaining = Math.max(0, minDisplayTime - elapsed);
      setTimeout(() => {
        setIsConfigChanging(false);
        // Load namespaces AFTER UI is responsive (deferred to not block)
        if (summary.currentContext) {
          loadNamespaces(summary.currentContext);
        }
      }, remaining);
    }).catch((error) => {
      console.error('Failed to change context:', error);
      setIsConfigChanging(false);
    });
  }, [loadNamespaces]);

  // Handle namespace change
  const handleNamespaceChange = useCallback((namespace: string) => {
    setSelectedNamespace(namespace);

    if (selectedContext) {
      const storageKey = `kubecli-namespace-${selectedContext}`;
      localStorage.setItem(storageKey, namespace);
    }
  }, [selectedContext]);

  // Handle edit mode changes from terminal
  const handleEditModeChange = useCallback((isEditMode: boolean) => {
    setIsInEditMode(isEditMode);
  }, []);

  // Handle resource action
  const handleResourceAction = useCallback(
    (actionId: string, resourceType: ResourceType, resourceName: string, customNamespace?: string) => {
      if (!selectedNamespace) return;

      if (isInEditMode) {
        console.warn('Cannot execute action while terminal is in edit mode');
        return;
      }

      const namespace = customNamespace || selectedNamespace;

      const context: ResourceActionContext = {
        resourceName,
        namespace,
        resourceType,
      };

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

      executeAction(actionId, context, {});
    },
    [selectedNamespace, isInEditMode]
  );

  // Execute action with prompt values
  const executeAction = useCallback((actionId: string, context: ResourceActionContext, promptValues: Record<string, any>) => {
    const resource = getResourceDefinition(context.resourceType);
    if (!resource) return;

    const action = resource.getActions().find(a => a.id === actionId);
    if (!action) return;

    const command = action.getCommand(context, promptValues);
    console.log('[Action] Executing command:', command);

    // Store refresh info if action needs it - will be triggered from onCommandExecuted
    if (action.refreshAfterMs) {
      setPendingRefresh({ type: context.resourceType, delayMs: action.refreshAfterMs });
      console.log(`[Action] Will refresh ${context.resourceType} after ${action.refreshAfterMs}ms`);
    } else {
      setPendingRefresh(null);
    }

    // Ensure terminal is visible and send command
    if (!showTerminal) {
      setShowTerminal(true);
    }
    setPendingCommand(command);
  }, [showTerminal]);

  // Handle command executed callback - clear pending command
  const handleCommandExecuted = useCallback(() => {
    setPendingCommand(null);
    // Clear the pending refresh (the actual refresh is handled by TerminalScreen)
    setPendingRefresh(null);
  }, []);

  // Handle prompt confirm
  const handlePromptConfirm = useCallback((values: Record<string, any>) => {
    if (!promptDialog) return;
    
    executeAction(promptDialog.actionId, promptDialog.context, values);
    setPromptDialog(null);
  }, [promptDialog, executeAction]);

  // Handle prompt cancel
  const handlePromptCancel = useCallback(() => {
    setPromptDialog(null);
  }, []);

  // Handle kubectl palette command execution
  const handleKubectlCommand = useCallback((command: string) => {
    // Extract command ID from the command for recent tracking
    // This is a simple approach - match against known patterns
    if (command.includes('get pods')) addRecentCommand('list-pods');
    else if (command.includes('get deployments')) addRecentCommand('list-deployments');
    else if (command.includes('get services')) addRecentCommand('list-services');
    else if (command.includes('get secrets')) addRecentCommand('list-secrets');
    else if (command.includes('get configmaps')) addRecentCommand('list-configmaps');
    else if (command.includes('get ingresses')) addRecentCommand('list-ingresses');
    else if (command.includes('get nodes')) addRecentCommand('get-nodes');
    else if (command.includes('cluster-info')) addRecentCommand('cluster-info');
    else if (command.includes('get namespaces')) addRecentCommand('get-namespaces');
    else if (command.includes('get events')) addRecentCommand('view-events');
    else if (command.includes('top pods')) addRecentCommand('top-pods');
    else if (command.includes('top nodes')) addRecentCommand('top-nodes');

    // Ensure terminal is visible and send command
    if (!showTerminal) {
      setShowTerminal(true);
    }
    setPendingCommand(command);
  }, [showTerminal]);

  // Handle go home
  const handleGoHome = useCallback(() => {
    setShowTerminal(false);
    setIsInEditMode(false);
  }, []);

  // Handle get started
  const handleGetStarted = useCallback(() => {
    setShowTerminal(true);
    setIsInEditMode(false);
  }, []);

  return (
    <ErrorProvider>
      <AuthSessionProvider configPath={kubeconfigPath} selectedContext={selectedContext}>
        <AuthRecoveryBridge selectedContext={selectedContext} reloadNamespaces={loadNamespaces} />
        <ResourceCacheProvider selectedContext={selectedContext} kubeconfigPath={kubeconfigPath}>
        <ErrorBanner />
        <div style={styles.container}>
          <style>{`
          .home-icon-button:hover {
            background-color: #3e3e42 !important;
          }
          .refresh-all-button:hover:not(:disabled) {
            background-color: #3e3e42 !important;
            border-color: #0e639c !important;
          }
          .new-window-button:hover {
            background-color: #3e3e42 !important;
            border-color: #0e639c !important;
          }
          .get-started-button:hover {
            background-color: #1177bb !important;
          }
          .form-select:hover {
            border-color: #0e639c !important;
          }
          .form-select:focus {
            border-color: #0e639c !important;
            box-shadow: 0 0 0 2px rgba(14, 99, 156, 0.2);
          }
          .home-card {
            animation: fadeIn 0.4s ease-out;
          }
          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }
          @keyframes slideDown {
            from {
              opacity: 0;
              transform: translateY(-20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes spin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
        
        {showTerminal ? (
        <TerminalScreen
          kubeconfigPath={kubeconfigPath}
          availableConfigs={availableConfigs}
          selectedContext={selectedContext}
          contexts={contexts}
          selectedNamespace={selectedNamespace}
          namespaces={namespaces}
          loadingNamespaces={loadingNamespaces}
          isInEditMode={isInEditMode}
          isConfigChanging={isConfigChanging}
          pendingCommand={pendingCommand}
          pendingRefresh={pendingRefresh}
          onCommandExecuted={handleCommandExecuted}
          onConfigChange={handleConfigChange}
          onContextChange={handleContextChange}
          onNamespaceChange={handleNamespaceChange}
          onResourceAction={handleResourceAction}
          onEditModeChange={handleEditModeChange}
          onGoHome={handleGoHome}
          authStatus={<AuthStatusButton />}
        />
      ) : (
        <HomeScreen
          kubeconfigPath={kubeconfigPath}
          availableConfigs={availableConfigs}
          selectedContext={selectedContext}
          contexts={contexts}
          isLoading={isConfigChanging}
          onConfigChange={handleConfigChange}
          onContextChange={handleContextChange}
          onGetStarted={handleGetStarted}
          authStatus={<AuthStatusButton />}
        />
      )}

          <AzureSessionsDialog />
          <ReauthenticationDialog />

          {/* Command Palette */}
          <CommandPalette
            isOpen={isCommandPaletteOpen}
            onClose={() => setIsCommandPaletteOpen(false)}
            onSelectResult={handleResourceAction}
          />

          {/* Kubectl Command Palette */}
          <KubectlPalette
            isOpen={isKubectlPaletteOpen}
            onClose={() => setIsKubectlPaletteOpen(false)}
            onExecute={handleKubectlCommand}
            currentNamespace={selectedNamespace}
            namespaces={namespaces}
          />

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
        </ResourceCacheProvider>
      </AuthSessionProvider>
    </ErrorProvider>
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
};

// Initialize app
const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container not found');
}

console.log('[Renderer] Initializing app...');

const root = createRoot(container);

console.log('[Renderer] Root container found, creating React root...');

root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

console.log('[Renderer] App component rendered successfully');
