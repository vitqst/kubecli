import React from 'react';

interface HomeScreenProps {
  kubeconfigPath: string;
  availableConfigs: Array<{ path: string; name: string; isDefault: boolean }>;
  selectedContext: string;
  contexts: Array<{ name: string; cluster?: string; server?: string; user?: string }>;
  disabled: boolean;
  onConfigChange: (path: string) => void;
  onContextChange: (context: string) => void;
  onGetStarted: () => void;
}

export function HomeScreen({
  kubeconfigPath,
  availableConfigs,
  selectedContext,
  contexts,
  disabled,
  onConfigChange,
  onContextChange,
  onGetStarted,
}: HomeScreenProps) {
  const activeContextDetails = contexts.find(c => c.name === selectedContext);

  return (
    <div style={styles.homeContainer}>
      {/* Home Screen Header */}
      <div style={styles.homeHeader}>
        <div style={styles.logoContainer}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#4ec9b0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
            <polyline points="2 17 12 22 22 17"></polyline>
            <polyline points="2 12 12 17 22 12"></polyline>
          </svg>
        </div>
        <h1 style={styles.title}>Kubernetes CLI Manager</h1>
        <p style={styles.subtitle}>Manage your Kubernetes clusters with ease</p>
      </div>

      {/* Configuration Card */}
      <div style={styles.homeCard} className="home-card">
        <h2 style={styles.cardTitle}>Configuration</h2>
        
        {/* Kubeconfig Selector */}
        {availableConfigs.length > 1 && (
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                <polyline points="13 2 13 9 20 9"></polyline>
              </svg>
              Kubeconfig File
            </label>
            <select
              value={kubeconfigPath}
              onChange={(e) => onConfigChange(e.target.value)}
              style={styles.formSelect}
              className="form-select"
              disabled={disabled}
            >
              {availableConfigs.map((config) => (
                <option key={config.path} value={config.path}>
                  {config.name} {config.isDefault ? '(default)' : ''}
                </option>
              ))}
            </select>
            <div style={styles.formHint}>
              {kubeconfigPath}
            </div>
          </div>
        )}

        {/* Context Selector */}
        <div style={styles.formGroup}>
          <label style={styles.formLabel}>
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
                value={selectedContext}
                onChange={(e) => onContextChange(e.target.value)}
                style={styles.formSelect}
                className="form-select"
                disabled={disabled}
              >
                {contexts.map((ctx) => (
                  <option key={ctx.name} value={ctx.name}>
                    {ctx.name}
                  </option>
                ))}
              </select>
              {activeContextDetails && (
                <div style={styles.contextInfo}>
                  <div style={styles.contextInfoRow}>
                    <span style={styles.contextInfoLabel}>Cluster:</span>
                    <span style={styles.contextInfoValue}>{activeContextDetails.cluster}</span>
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
            onClick={onGetStarted}
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
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  homeContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    padding: '40px',
    backgroundColor: '#1e1e1e',
  },
  homeHeader: {
    textAlign: 'center',
    marginBottom: '48px',
  },
  logoContainer: {
    marginBottom: '24px',
  },
  title: {
    fontSize: '2.5rem',
    fontWeight: 600,
    color: '#cccccc',
    marginTop: 0,
    marginBottom: '12px',
  },
  subtitle: {
    fontSize: '1.125rem',
    color: '#858585',
    marginTop: 0,
    marginBottom: 0,
  },
  homeCard: {
    width: '100%',
    maxWidth: '600px',
    backgroundColor: '#252526',
    border: '1px solid #3e3e42',
    borderRadius: '8px',
    padding: '32px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    padding: '14px 24px',
    fontSize: '1rem',
    fontWeight: 500,
    backgroundColor: '#0e639c',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    marginTop: '8px',
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
};
