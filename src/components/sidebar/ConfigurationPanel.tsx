import React from 'react';

interface ConfigurationPanelProps {
  kubeconfigPath: string;
  availableConfigs: Array<{ path: string; name: string; isDefault: boolean }>;
  selectedContext: string;
  contexts: Array<{ name: string; cluster?: string; user?: string }>;
  selectedNamespace: string;
  namespaces: string[];
  loadingNamespaces: boolean;
  isInEditMode: boolean;
  onConfigChange: (path: string) => void;
  onContextChange: (context: string) => void;
  onNamespaceChange: (namespace: string) => void;
}

export function ConfigurationPanel({
  kubeconfigPath,
  availableConfigs,
  selectedContext,
  contexts,
  selectedNamespace,
  namespaces,
  loadingNamespaces,
  isInEditMode,
  onConfigChange,
  onContextChange,
  onNamespaceChange,
}: ConfigurationPanelProps) {
  return (
    <>
      {/* Kubeconfig File Selector */}
      {availableConfigs.length > 1 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Kubeconfig File</div>
          <select
            value={kubeconfigPath}
            onChange={(e) => onConfigChange(e.target.value)}
            style={isInEditMode ? {...styles.select, ...styles.disabledSelect} : styles.select}
            disabled={isInEditMode}
            title={isInEditMode ? 'Cannot change config while in edit mode' : ''}
          >
            {availableConfigs.map((config) => (
              <option key={config.path} value={config.path}>
                {config.name} {config.isDefault ? '(default)' : ''}
              </option>
            ))}
          </select>
          <div style={styles.hint}>
            {kubeconfigPath.split('/').pop()}
          </div>
        </div>
      )}

      {/* Context Selector */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Context</div>
        {contexts.length > 0 ? (
          <>
            <select
              value={selectedContext}
              onChange={(e) => onContextChange(e.target.value)}
              style={isInEditMode ? {...styles.select, ...styles.disabledSelect} : styles.select}
              disabled={isInEditMode}
              title={isInEditMode ? 'Cannot change context while in edit mode' : ''}
            >
              {contexts.map((ctx) => (
                <option key={ctx.name} value={ctx.name}>
                  {ctx.name}
                </option>
              ))}
            </select>
            <div style={styles.hint}>
              Cluster: {contexts.find(c => c.name === selectedContext)?.cluster || 'N/A'}
            </div>
          </>
        ) : (
          <div style={styles.noData}>No contexts available</div>
        )}
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
              style={isInEditMode ? {...styles.select, ...styles.disabledSelect} : styles.select}
              disabled={isInEditMode}
              title={isInEditMode ? 'Cannot change namespace while in edit mode' : ''}
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
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  section: {
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#858585',
    marginBottom: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
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
  disabledSelect: {
    opacity: 0.5,
    cursor: 'not-allowed',
    backgroundColor: '#2d2d2d',
  },
  hint: {
    fontSize: '10px',
    color: '#858585',
    marginTop: '4px',
  },
  noData: {
    fontSize: '11px',
    color: '#858585',
    fontStyle: 'italic',
    padding: '8px',
    textAlign: 'center',
  },
  loading: {
    fontSize: '11px',
    color: '#858585',
    padding: '8px',
    textAlign: 'center',
  },
};
