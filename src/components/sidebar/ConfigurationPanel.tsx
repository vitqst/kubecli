import React from 'react';
import { Select } from '../common/Select';

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
          <Select
            value={kubeconfigPath}
            onChange={onConfigChange}
            options={availableConfigs.map((config) => ({
              value: config.path,
              label: `${config.name}${config.isDefault ? ' (default)' : ''}`,
            }))}
            disabled={isInEditMode}
            title={isInEditMode ? 'Cannot change config while in edit mode' : ''}
          />
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
            <Select
              value={selectedContext}
              onChange={onContextChange}
              options={contexts.map((ctx) => ({
                value: ctx.name,
                label: ctx.name,
              }))}
              disabled={isInEditMode}
              title={isInEditMode ? 'Cannot change context while in edit mode' : ''}
            />
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
            <Select
              value={selectedNamespace}
              onChange={onNamespaceChange}
              options={namespaces.map((ns) => ({
                value: ns,
                label: ns,
              }))}
              disabled={isInEditMode}
              title={isInEditMode ? 'Cannot change namespace while in edit mode' : ''}
            />
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
