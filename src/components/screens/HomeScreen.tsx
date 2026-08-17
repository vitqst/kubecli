import React from 'react';
import { Select } from '../common/Select';

interface HomeScreenProps {
  kubeconfigPath: string;
  availableConfigs: Array<{ path: string; name: string; isDefault: boolean }>;
  selectedContext: string;
  contexts: Array<{ name: string; cluster?: string; server?: string; user?: string }>;
  isLoading: boolean;
  onConfigChange: (path: string) => void;
  onContextChange: (context: string) => void;
  onGetStarted: () => void;
  authStatus?: React.ReactNode;
}

export function HomeScreen({
  kubeconfigPath,
  availableConfigs,
  selectedContext,
  contexts,
  isLoading,
  onConfigChange,
  onContextChange,
  onGetStarted,
  authStatus,
}: HomeScreenProps) {
  const activeContextDetails = contexts.find(c => c.name === selectedContext);

  return (
    <div style={styles.homeContainer}>
      {authStatus && <div style={styles.authStatus}>{authStatus}</div>}
      {/* Spinner animation */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        .loading-overlay {
          animation: fadeIn 0.15s ease-out;
        }
      `}</style>

      {/* Home Screen Header */}
      <div style={styles.homeHeader}>
        <div style={styles.logoContainer}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4ec9b0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        {/* Loading Overlay */}
        {isLoading && (
          <div style={styles.loadingOverlay} className="loading-overlay">
            <div style={styles.loadingSpinner} />
            <span style={styles.loadingText}>Loading...</span>
          </div>
        )}
        <h2 style={styles.cardTitle}>Configuration</h2>
        
        {/* Kubeconfig Selector */}
        {availableConfigs.length > 1 && (
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                <polyline points="13 2 13 9 20 9"></polyline>
              </svg>
              Kubeconfig File
            </label>
            <Select
              value={kubeconfigPath}
              onChange={onConfigChange}
              options={availableConfigs.map((config) => ({
                value: config.path,
                label: `${config.name}${config.isDefault ? ' (default)' : ''}`,
              }))}
              disabled={isLoading}
            />
            <div style={styles.formHint}>
              {kubeconfigPath}
            </div>
          </div>
        )}

        {/* Context Selector */}
        <div style={styles.formGroup}>
          <label style={styles.formLabel}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
            Kubernetes Context
          </label>
          {contexts.length > 0 ? (
            <>
              <Select
                value={selectedContext}
                onChange={onContextChange}
                options={contexts.map((ctx) => ({
                  value: ctx.name,
                  label: ctx.name,
                }))}
                disabled={isLoading}
              />
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
            disabled={isLoading}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    padding: '16px',
    backgroundColor: '#1e1e1e',
    overflow: 'auto',
  },
  authStatus: {
    position: 'absolute',
    top: '16px',
    right: '16px',
  },
  homeHeader: {
    textAlign: 'center',
    marginBottom: '16px',
  },
  logoContainer: {
    marginBottom: '8px',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#cccccc',
    marginTop: 0,
    marginBottom: '4px',
  },
  subtitle: {
    fontSize: '0.875rem',
    color: '#858585',
    marginTop: 0,
    marginBottom: 0,
  },
  homeCard: {
    width: '100%',
    maxWidth: '480px',
    backgroundColor: '#252526',
    border: '1px solid #3e3e42',
    borderRadius: '6px',
    padding: '16px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    position: 'relative' as const,
  },
  loadingOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(30, 30, 30, 0.85)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    borderRadius: '6px',
    zIndex: 10,
  },
  loadingSpinner: {
    width: '24px',
    height: '24px',
    border: '2px solid #3e3e42',
    borderTop: '2px solid #4ec9b0',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    color: '#cccccc',
    fontSize: '0.75rem',
  },
  cardTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#cccccc',
    marginTop: 0,
    marginBottom: '12px',
  },
  formGroup: {
    marginBottom: '12px',
  },
  formLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '0.75rem',
    fontWeight: 500,
    color: '#cccccc',
    marginBottom: '4px',
  },
  formHint: {
    fontSize: '0.625rem',
    color: '#858585',
    marginTop: '4px',
    fontStyle: 'italic',
  },
  contextInfo: {
    marginTop: '8px',
    padding: '8px',
    backgroundColor: '#1e1e1e',
    border: '1px solid #3e3e42',
    borderRadius: '4px',
  },
  contextInfoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '2px 0',
    fontSize: '0.75rem',
  },
  contextInfoLabel: {
    color: '#858585',
    fontWeight: 500,
  },
  contextInfoValue: {
    color: '#4ec9b0',
    fontFamily: 'monospace',
    fontSize: '0.7rem',
  },
  getStartedButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    width: '100%',
    padding: '10px 16px',
    fontSize: '0.875rem',
    fontWeight: 500,
    backgroundColor: '#0e639c',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    marginTop: '4px',
  },
  noDataMessage: {
    padding: '12px',
    color: '#858585',
    fontSize: '0.75rem',
    fontStyle: 'italic',
    textAlign: 'center',
    backgroundColor: '#1e1e1e',
    border: '1px solid #3e3e42',
    borderRadius: '4px',
  },
};
