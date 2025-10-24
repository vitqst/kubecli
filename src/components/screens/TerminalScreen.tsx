import React, { memo, useMemo } from 'react';
import { Terminal } from '../Terminal';
import { TerminalSidebar } from '../TerminalSidebar';
import { ResourceType } from '../../resources';

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
  onConfigChange: (path: string) => void;
  onContextChange: (context: string) => void;
  onNamespaceChange: (namespace: string) => void;
  onResourceAction: (actionId: string, resourceType: ResourceType, resourceName: string, customNamespace?: string) => void;
  onEditModeChange: (isEditMode: boolean) => void;
  onGoHome: () => void;
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
  onConfigChange,
  onContextChange,
  onNamespaceChange,
  onResourceAction,
  onEditModeChange,
  onGoHome,
}: TerminalScreenProps) {
  // Memoize env object to prevent unnecessary terminal refreshes
  const terminalEnv = useMemo(() => ({
    KUBECONFIG: kubeconfigPath,
    KUBECTL_NAMESPACE: selectedNamespace
  }), [kubeconfigPath, selectedNamespace]);

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
          onConfigChange={onConfigChange}
          onContextChange={onContextChange}
          onNamespaceChange={onNamespaceChange}
          onResourceAction={onResourceAction}
        />
        <div style={styles.terminalMain}>
          <Terminal 
            id="main"
            env={terminalEnv}
            isLoading={isConfigChanging}
            onEditModeChange={onEditModeChange}
          />
        </div>
      </div>
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
  terminalContainer: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  terminalMain: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
};
