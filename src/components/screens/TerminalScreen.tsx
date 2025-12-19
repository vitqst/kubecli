import React, { memo, useMemo, useState, useCallback } from 'react';
import { Terminal } from '../Terminal';
import { TabBar } from '../tabs/TabBar';
import { SlimSidebar } from '../sidebar/SlimSidebar';
import { ResourcePanel } from '../resource-panel/ResourcePanel';
import { DuplicateTabDialog } from '../tabs/DuplicateTabDialog';
import { ResourceType, getResourceDefinition } from '../../resources';
import { useTabs, Tab } from '../../hooks/useTabs';
import { useBottomPanel } from '../../hooks/useBottomPanel';

// Memoized Memory Display Component
const MemoryDisplay = memo(() => {
  const [memoryUsage, setMemoryUsage] = React.useState<{ used: number; total: number }>({ used: 0, total: 0 });

  React.useEffect(() => {
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

interface TerminalScreenProps {
  kubeconfigPath: string;
  availableConfigs: Array<{ path: string; name: string; isDefault: boolean }>;
  selectedContext: string;
  contexts: Array<{ name: string; cluster?: string; user?: string }>;
  selectedNamespace: string;
  namespaces: string[];
  loadingNamespaces: boolean;
  isInEditMode: boolean;
  isConfigChanging: boolean;
  pendingCommand?: string | null;
  onCommandExecuted?: () => void;
  onConfigChange: (path: string) => void;
  onContextChange: (context: string) => void;
  onNamespaceChange: (namespace: string) => void;
  onResourceAction: (actionId: string, resourceType: ResourceType, resourceName: string, customNamespace?: string) => void;
  onEditModeChange: (isEditMode: boolean) => void;
  onGoHome: () => void;
}

interface PendingAction {
  actionId: string;
  resourceType: ResourceType;
  resourceName: string;
  namespace: string;
  existingTab: Tab;
}

export function TerminalScreen({
  kubeconfigPath,
  availableConfigs,
  selectedContext,
  contexts,
  selectedNamespace,
  namespaces,
  loadingNamespaces,
  isInEditMode,
  isConfigChanging,
  pendingCommand,
  onCommandExecuted,
  onConfigChange,
  onContextChange,
  onNamespaceChange,
  onResourceAction,
  onEditModeChange,
  onGoHome,
}: TerminalScreenProps) {
  // Tab management
  const { tabs, activeTabId, addTab, closeTab, setActiveTab, findTabByResource } = useTabs();

  // Bottom panel
  const { isOpen: isPanelOpen, selectedResourceType, openPanel, closePanel, togglePanel } = useBottomPanel();

  // Duplicate tab dialog
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  // Memoize env object
  const terminalEnv = useMemo(() => ({
    KUBECONFIG: kubeconfigPath,
    KUBECTL_NAMESPACE: selectedNamespace
  }), [kubeconfigPath, selectedNamespace]);

  // Handle resource action from panel
  const handleResourceAction = useCallback((
    actionId: string,
    resourceType: ResourceType,
    resourceName: string,
    namespace: string
  ) => {
    // Check if tab already exists
    const existingTab = findTabByResource(resourceType, resourceName, namespace);

    if (existingTab) {
      // Show duplicate dialog
      setPendingAction({ actionId, resourceType, resourceName, namespace, existingTab });
      return;
    }

    // Create new tab
    const label = resourceName.length > 20 ? resourceName.substring(0, 17) + '...' : resourceName;

    addTab({
      label,
      resourceRef: { type: resourceType, name: resourceName, namespace, action: actionId },
    });

    // Execute the action in the parent
    onResourceAction(actionId, resourceType, resourceName, namespace);
  }, [findTabByResource, addTab, onResourceAction]);

  // Handle duplicate dialog actions
  const handleSwitchToTab = useCallback(() => {
    if (pendingAction) {
      setActiveTab(pendingAction.existingTab.id);
      setPendingAction(null);
    }
  }, [pendingAction, setActiveTab]);

  const handleOpenNewTab = useCallback(() => {
    if (pendingAction) {
      const { actionId, resourceType, resourceName, namespace } = pendingAction;
      const label = resourceName.length > 20 ? resourceName.substring(0, 17) + '...' : resourceName;

      addTab({
        label,
        resourceRef: { type: resourceType, name: resourceName, namespace, action: actionId },
      });

      onResourceAction(actionId, resourceType, resourceName, namespace);
      setPendingAction(null);
    }
  }, [pendingAction, addTab, onResourceAction]);

  // Add new blank tab
  const handleAddTab = useCallback(() => {
    addTab({ label: 'Terminal' });
  }, [addTab]);

  // Handle context menu for resources (placeholder - not used in this version)
  const handleShowContextMenu = useCallback((
    x: number,
    y: number,
    resourceType: ResourceType,
    resourceName: string,
    namespace: string
  ) => {
    // Context menu functionality can be added later if needed
    console.log('Context menu requested for', resourceType, resourceName);
  }, []);

  // Keyboard shortcuts for tab navigation
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Tab - cycle to next tab
      // Ctrl+Shift+Tab - cycle to previous tab
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const currentIndex = tabs.findIndex(t => t.id === activeTabId);
        const nextIndex = e.shiftKey
          ? (currentIndex - 1 + tabs.length) % tabs.length
          : (currentIndex + 1) % tabs.length;
        setActiveTab(tabs[nextIndex].id);
      }

      // Ctrl+W - close current tab (except default)
      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        if (activeTabId !== 'default') {
          closeTab(activeTabId);
        }
      }

      // Ctrl+T - open new blank terminal tab
      if (e.ctrlKey && e.key === 't') {
        e.preventDefault();
        handleAddTab();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tabs, activeTabId, setActiveTab, closeTab, handleAddTab]);

  return (
    <>
      {/* Terminal Top Bar */}
      <header style={styles.terminalHeader}>
        <button
          onClick={onGoHome}
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

      {/* Main Content */}
      <div style={styles.mainContainer}>
        {/* Slim Sidebar */}
        <SlimSidebar
          selectedContext={selectedContext}
          contexts={contexts}
          selectedResourceType={selectedResourceType}
          onContextChange={onContextChange}
          onResourceTypeClick={togglePanel}
        />

        {/* Terminal Area */}
        <div style={styles.terminalArea}>
          {/* Tab Bar */}
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onTabClick={setActiveTab}
            onTabClose={closeTab}
            onAddTab={handleAddTab}
          />

          {/* Terminal Content */}
          <div style={styles.terminalContent}>
            {/* Terminals - show only active */}
            <div style={styles.terminalWrapper}>
              {tabs.map(tab => (
                <div
                  key={tab.id}
                  style={{
                    ...styles.terminalPane,
                    display: tab.id === activeTabId ? 'flex' : 'none',
                  }}
                >
                  <Terminal
                    id={tab.id}
                    env={terminalEnv}
                    isLoading={isConfigChanging}
                    pendingCommand={tab.id === activeTabId ? pendingCommand : null}
                    onCommandExecuted={onCommandExecuted}
                    onEditModeChange={onEditModeChange}
                  />
                </div>
              ))}
            </div>

            {/* Resource Panel */}
            <ResourcePanel
              isOpen={isPanelOpen}
              selectedResourceType={selectedResourceType}
              namespace={selectedNamespace}
              onAction={handleResourceAction}
              onShowContextMenu={handleShowContextMenu}
              onClose={closePanel}
            />
          </div>
        </div>
      </div>

      {/* Duplicate Tab Dialog */}
      {pendingAction && (
        <DuplicateTabDialog
          resourceName={pendingAction.resourceName}
          onSwitch={handleSwitchToTab}
          onOpenNew={handleOpenNewTab}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    color: '#cccccc',
    transition: 'background-color 0.2s',
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
  mainContainer: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  terminalArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  terminalContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  terminalWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'relative',
  },
  terminalPane: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'column',
  },
};
