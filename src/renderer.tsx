import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
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
import { addRecentCommand } from './commands/quickCommands';
import { kube as kubeAPI, terminal as terminalAPI } from './api';

type LoadState = 'idle' | 'loading' | 'error';

function App() {
  console.log('[App] Component rendering...');
  
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

  // Keyboard shortcuts: Ctrl+Shift+P for command palette, Ctrl+K for kubectl palette
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

  // Handle config change
  const handleConfigChange = useCallback((newConfigPath: string) => {
    setIsConfigChanging(true);
    kubeAPI.setConfig(newConfigPath).then((summary: KubeConfigSummary) => {
      setContexts(summary.contexts);
      setSelectedContext(summary.currentContext || '');
      setKubeconfigPath(summary.kubeconfigPath);
      setAvailableConfigs(summary.availableConfigs || []);
      
      if (summary.currentContext) {
        loadNamespaces(summary.currentContext);
      }
      
      setTimeout(() => setIsConfigChanging(false), 1400);
    }).catch((error) => {
      console.error('Failed to change config:', error);
      setIsConfigChanging(false);
    });
  }, [loadNamespaces]);

  // Handle context change
  const handleContextChange = useCallback((newContext: string) => {
    setIsConfigChanging(true);
    kubeAPI.setContext(newContext).then((summary: KubeConfigSummary) => {
      setSelectedContext(summary.currentContext || '');
      if (summary.currentContext) {
        loadNamespaces(summary.currentContext);
      }
      setTimeout(() => setIsConfigChanging(false), 1400);
    }).catch((error) => {
      console.error('Failed to change context:', error);
      setIsConfigChanging(false);
    });
  }, [loadNamespaces]);

  // Handle namespace change
  const handleNamespaceChange = useCallback((namespace: string) => {
    setTimeout(() => {
      setSelectedNamespace(namespace);
      
      if (selectedContext) {
        const storageKey = `kubecli-namespace-${selectedContext}`;
        localStorage.setItem(storageKey, namespace);
      }
      
      setTimeout(() => setIsConfigChanging(false), 1400);
    }, 50);
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

    // Ensure terminal is visible and send command
    if (!showTerminal) {
      setShowTerminal(true);
    }
    setPendingCommand(command);
  }, [showTerminal]);

  // Handle command executed callback - clear pending command
  const handleCommandExecuted = useCallback(() => {
    setPendingCommand(null);
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
      <ResourceCacheProvider selectedContext={selectedContext} kubeconfigPath={kubeconfigPath}>
        <ErrorBanner />
        <div style={styles.container}>
          <style>{`
          .home-icon-button:hover {
            background-color: #3e3e42 !important;
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
          onCommandExecuted={handleCommandExecuted}
          onConfigChange={handleConfigChange}
          onContextChange={handleContextChange}
          onNamespaceChange={handleNamespaceChange}
          onResourceAction={handleResourceAction}
          onEditModeChange={handleEditModeChange}
          onGoHome={handleGoHome}
        />
      ) : (
        <HomeScreen
          kubeconfigPath={kubeconfigPath}
          availableConfigs={availableConfigs}
          selectedContext={selectedContext}
          contexts={contexts}
          disabled={false}
          onConfigChange={handleConfigChange}
          onContextChange={handleContextChange}
          onGetStarted={handleGetStarted}
        />
      )}

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
    <ResourceCacheProvider selectedContext="">
      <App />
    </ResourceCacheProvider>
  </ErrorBoundary>
);

console.log('[Renderer] App component rendered successfully');
