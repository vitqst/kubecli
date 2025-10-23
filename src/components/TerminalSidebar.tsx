import React, { useState, useEffect } from 'react';

interface TerminalSidebarProps {
  kubeconfigPath: string;
  selectedContext: string;
  selectedNamespace: string;
  namespaces: string[];
  loadingNamespaces: boolean;
  onNamespaceChange: (namespace: string) => void;
}

export function TerminalSidebar({
  kubeconfigPath,
  selectedContext,
  selectedNamespace,
  namespaces,
  loadingNamespaces,
  onNamespaceChange,
}: TerminalSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div style={isCollapsed ? styles.sidebarCollapsed : styles.sidebar}>
      {/* Collapse/Expand Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        style={styles.collapseButton}
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed ? '▶' : '◀'}
      </button>

      {!isCollapsed && (
        <div style={styles.content}>
          {/* Header */}
          <div style={styles.header}>
            <h3 style={styles.title}>Kubernetes</h3>
          </div>

          {/* Context Info */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Context</div>
            <div style={styles.contextInfo}>
              <div style={styles.contextName}>{selectedContext || 'None'}</div>
              <div style={styles.configPath} title={kubeconfigPath}>
                {kubeconfigPath ? kubeconfigPath.split('/').pop() : 'No config'}
              </div>
            </div>
          </div>

          {/* Namespace Selector */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Namespace</div>
            {loadingNamespaces ? (
              <div style={styles.loading}>Loading...</div>
            ) : namespaces.length > 0 ? (
              <>
                <select
                  value={selectedNamespace}
                  onChange={(e) => onNamespaceChange(e.target.value)}
                  style={styles.select}
                >
                  {namespaces.map((ns) => (
                    <option key={ns} value={ns}>
                      {ns}
                    </option>
                  ))}
                </select>
                <div style={styles.hint}>
                  kubectl will use -n {selectedNamespace}
                </div>
              </>
            ) : (
              <div style={styles.noData}>No namespaces</div>
            )}
          </div>

          {/* Resources Section (Placeholder for future) */}
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Resources</div>
            <div style={styles.resourceList}>
              <div style={styles.resourceItem}>
                <span style={styles.resourceIcon}>📦</span>
                <span style={styles.resourceLabel}>Pods</span>
                <span style={styles.comingSoon}>Coming soon</span>
              </div>
              <div style={styles.resourceItem}>
                <span style={styles.resourceIcon}>🔌</span>
                <span style={styles.resourceLabel}>Services</span>
                <span style={styles.comingSoon}>Coming soon</span>
              </div>
              <div style={styles.resourceItem}>
                <span style={styles.resourceIcon}>🚀</span>
                <span style={styles.resourceLabel}>Deployments</span>
                <span style={styles.comingSoon}>Coming soon</span>
              </div>
              <div style={styles.resourceItem}>
                <span style={styles.resourceIcon}>⚙️</span>
                <span style={styles.resourceLabel}>ConfigMaps</span>
                <span style={styles.comingSoon}>Coming soon</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: '280px',
    height: '100%',
    backgroundColor: '#252526',
    borderRight: '1px solid #3e3e42',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    transition: 'width 0.2s ease',
  },
  sidebarCollapsed: {
    width: '40px',
    height: '100%',
    backgroundColor: '#252526',
    borderRight: '1px solid #3e3e42',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    transition: 'width 0.2s ease',
  },
  collapseButton: {
    position: 'absolute',
    top: '10px',
    right: '8px',
    width: '24px',
    height: '24px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#cccccc',
    cursor: 'pointer',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    zIndex: 10,
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
    paddingTop: '40px',
  },
  header: {
    marginBottom: '20px',
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: '#cccccc',
  },
  section: {
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#858585',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
  },
  contextInfo: {
    padding: '8px',
    backgroundColor: '#1e1e1e',
    borderRadius: '4px',
    border: '1px solid #3e3e42',
  },
  contextName: {
    fontSize: '13px',
    color: '#4ec9b0',
    fontWeight: 500,
    marginBottom: '4px',
  },
  configPath: {
    fontSize: '11px',
    color: '#858585',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  select: {
    width: '100%',
    padding: '6px 8px',
    backgroundColor: '#3c3c3c',
    border: '1px solid #3e3e42',
    borderRadius: '4px',
    color: '#cccccc',
    fontSize: '13px',
    cursor: 'pointer',
    outline: 'none',
  },
  hint: {
    fontSize: '11px',
    color: '#858585',
    marginTop: '6px',
    fontStyle: 'italic',
  },
  loading: {
    fontSize: '12px',
    color: '#858585',
    padding: '8px',
  },
  noData: {
    fontSize: '12px',
    color: '#858585',
    padding: '8px',
    fontStyle: 'italic',
  },
  resourceList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  resourceItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px',
    backgroundColor: '#1e1e1e',
    borderRadius: '4px',
    border: '1px solid #3e3e42',
    cursor: 'not-allowed',
    opacity: 0.6,
  },
  resourceIcon: {
    fontSize: '14px',
    marginRight: '8px',
  },
  resourceLabel: {
    fontSize: '13px',
    color: '#cccccc',
    flex: 1,
  },
  comingSoon: {
    fontSize: '10px',
    color: '#858585',
    fontStyle: 'italic',
  },
};
