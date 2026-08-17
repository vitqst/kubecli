import React, { memo, useMemo, useState, useCallback } from 'react';
import { Terminal } from '../Terminal';
import { TabBar } from '../tabs/TabBar';
import { SlimSidebar } from '../sidebar/SlimSidebar';
import { ResourcePanel } from '../resource-panel/ResourcePanel';
import { ContextMenu } from '../sidebar/ContextMenu';
import { ResourceType } from '../../resources';
import { useTabs } from '../../hooks/useTabs';
import type { PanelState } from '../../hooks/useTabs';
import { useResourceCache } from '../../contexts/ResourceCacheContext';
import { useAuthSession } from '../../contexts/AuthSessionContext';
import { auth, window as windowAPI } from '../../api';

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
  pendingRefresh?: { type: ResourceType; delayMs: number } | null;
  onCommandExecuted?: () => void;
  onConfigChange: (path: string) => void;
  onContextChange: (context: string) => void;
  onNamespaceChange: (namespace: string) => void;
  onResourceAction: (actionId: string, resourceType: ResourceType, resourceName: string, customNamespace?: string) => void;
  onEditModeChange: (isEditMode: boolean) => void;
  onGoHome: () => void;
  authStatus?: React.ReactNode;
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
  pendingRefresh,
  onCommandExecuted,
  onConfigChange,
  onContextChange,
  onNamespaceChange,
  onResourceAction,
  onEditModeChange,
  onGoHome,
  authStatus,
}: TerminalScreenProps) {
  const { status: azureAuthStatus } = useAuthSession();
  const runtimeEnvKey = `${kubeconfigPath}\0${selectedContext}`;
  const authRuntimeRevision = [
    azureAuthStatus.state,
    azureAuthStatus.tenantId ?? '',
    azureAuthStatus.expiresAtEpochSeconds ?? '',
  ].join('\0');
  const [runtimeAuthEnv, setRuntimeAuthEnv] = useState<{
    key: string;
    env: Record<string, string>;
  }>({ key: '', env: {} });

  React.useEffect(() => {
    let cancelled = false;

    auth.runtimeEnv(kubeconfigPath, selectedContext)
      .then((env) => {
        if (!cancelled) setRuntimeAuthEnv({ key: runtimeEnvKey, env });
      })
      .catch((error) => {
        console.warn('[TerminalScreen] Failed to resolve kubelogin runtime environment:', error);
        if (!cancelled) setRuntimeAuthEnv({ key: runtimeEnvKey, env: {} });
      });

    return () => {
      cancelled = true;
    };
  }, [authRuntimeRevision, kubeconfigPath, selectedContext, runtimeEnvKey]);

  // Tab management (includes per-tab panel state)
  const {
    tabs,
    activeTabId,
    activeTab,
    addTab,
    closeTab,
    setActiveTab,
    updateTabs,
    updateActivePanelState,
    togglePanel,
    closePanel,
  } = useTabs();

  // Global resource cache refresh
  const { refresh: refreshAllResources, refreshType, isLoading: isRefreshingResources } = useResourceCache();

  // Store pending refresh to trigger after command completes
  const pendingRefreshRef = React.useRef<{ type: ResourceType; delayMs: number } | null>(null);

  // Update pending refresh ref when prop changes
  React.useEffect(() => {
    if (pendingRefresh) {
      pendingRefreshRef.current = pendingRefresh;
    }
  }, [pendingRefresh]);

  // Handle command executed - trigger delayed refresh if scheduled
  const handleCommandExecuted = useCallback(() => {
    onCommandExecuted?.();

    const pending = pendingRefreshRef.current;
    if (pending) {
      pendingRefreshRef.current = null;
      console.log(`[TerminalScreen] Command executed, scheduling refresh for ${pending.type} in ${pending.delayMs}ms`);
      setTimeout(() => {
        console.log(`[TerminalScreen] Refreshing ${pending.type}`);
        refreshType(pending.type);
      }, pending.delayMs);
    }
  }, [onCommandExecuted, refreshType]);


  // Memoize env object
  const terminalEnv = useMemo(() => ({
    KUBECONFIG: kubeconfigPath,
    KUBECTL_NAMESPACE: selectedNamespace,
    ...(runtimeAuthEnv.key === runtimeEnvKey ? runtimeAuthEnv.env : {}),
  }), [kubeconfigPath, selectedNamespace, runtimeAuthEnv, runtimeEnvKey]);

  // Callback to update active tab's panel state
  const handlePanelStateChange = useCallback((updates: Partial<PanelState>) => {
    updateActivePanelState(() => updates);
  }, [updateActivePanelState]);

  // Handle resource action: run in the active tab and rename it to the resource
  const handleResourceAction = useCallback((
    actionId: string,
    resourceType: ResourceType,
    resourceName: string,
    namespace?: string
  ) => {
    const ns = namespace || selectedNamespace;
    // Rename the active tab to the resource
    updateTabs(prev => prev.map(tab => (
      tab.id === activeTabId
        ? { ...tab, label: resourceName, resourceRef: { type: resourceType, name: resourceName, namespace: ns, action: actionId } }
        : tab
    )));

    onResourceAction(actionId, resourceType, resourceName, ns);
  }, [activeTabId, onResourceAction, selectedNamespace, updateTabs]);

  // Duplicate dialog is no longer needed (no new tabs on action)

  // Add new blank tab
  const handleAddTab = useCallback(() => {
    addTab({ label: 'Terminal' });
  }, [addTab]);

  // Context menu state for resource actions
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    resourceType: ResourceType;
    resourceName: string;
    namespace: string;
  } | null>(null);

  const handleShowContextMenu = useCallback((
    x: number,
    y: number,
    resourceType: ResourceType,
    resourceName: string,
    namespace: string
  ) => {
    setContextMenu({ x, y, resourceType, resourceName, namespace });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  /**
   * Global keyboard shortcuts for tab navigation
   * - Ctrl+Tab / Ctrl+Shift+Tab: cycle tabs
   * - Ctrl+W: close current tab (except default)
   * - Ctrl+T: open new blank tab
   */
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        const currentIndex = tabs.findIndex(t => t.id === activeTabId);
        const nextIndex = e.shiftKey
          ? (currentIndex - 1 + tabs.length) % tabs.length
          : (currentIndex + 1) % tabs.length;
        setActiveTab(tabs[nextIndex].id);
      }

      if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        if (activeTabId !== 'default') {
          closeTab(activeTabId);
        }
      }

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
        {authStatus}
        <button
          onClick={refreshAllResources}
          disabled={isRefreshingResources}
          style={{
            ...styles.refreshAllButton,
            opacity: isRefreshingResources ? 0.6 : 1,
            cursor: isRefreshingResources ? 'not-allowed' : 'pointer',
          }}
          className="refresh-all-button"
          title="Refresh all resources (F5)"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              animation: isRefreshingResources ? 'spin 1s linear infinite' : 'none',
            }}
          >
            <path d="M23 4v6h-6M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
        <button
          onClick={() => windowAPI.openNewWindow()}
          style={styles.newWindowButton}
          className="new-window-button"
          title="Open new window (Ctrl+Shift+N)"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        </button>
        <MemoryDisplay />
      </header>

      {/* Main Content */}
      <div style={styles.mainContainer}>
        {/* Slim Sidebar */}
        <SlimSidebar
          selectedContext={selectedContext}
          contexts={contexts}
          selectedResourceType={activeTab.panelState.selectedResourceType}
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
                    onCommandExecuted={handleCommandExecuted}
                    onEditModeChange={onEditModeChange}
                  />
                </div>
              ))}
            </div>

          {/* Resource Panel - now controlled, uses active tab's panel state */}
            <ResourcePanel
              panelState={activeTab.panelState}
              onPanelStateChange={handlePanelStateChange}
              namespaces={namespaces}
              onShowContextMenu={handleShowContextMenu}
              onClose={closePanel}
            />
          </div>
        </div>
      </div>

      {/* Resource Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          resourceType={contextMenu.resourceType}
          resourceName={contextMenu.resourceName}
          namespace={contextMenu.namespace}
          onAction={handleResourceAction}
          onClose={handleCloseContextMenu}
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
  refreshAllButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    backgroundColor: 'transparent',
    border: '1px solid #3e3e42',
    borderRadius: '4px',
    color: '#cccccc',
    transition: 'background-color 0.2s, border-color 0.2s',
  },
  newWindowButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    backgroundColor: 'transparent',
    border: '1px solid #3e3e42',
    borderRadius: '4px',
    color: '#cccccc',
    cursor: 'pointer',
    transition: 'background-color 0.2s, border-color 0.2s',
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
