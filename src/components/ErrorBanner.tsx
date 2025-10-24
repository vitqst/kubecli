import React from 'react';
import { useError, AppError } from '../contexts/ErrorContext';

export function ErrorBanner() {
  const { errors, dismissError } = useError();

  if (errors.length === 0) return null;

  return (
    <div style={styles.container}>
      {errors.map((error) => (
        <div
          key={error.id}
          style={{
            ...styles.banner,
            ...(error.severity === 'error' ? styles.errorBanner : {}),
            ...(error.severity === 'warning' ? styles.warningBanner : {}),
            ...(error.severity === 'info' ? styles.infoBanner : {}),
          }}
        >
          <div style={styles.content}>
            <div style={styles.icon}>
              {error.severity === 'error' ? '❌' : error.severity === 'warning' ? '⚠️' : 'ℹ️'}
            </div>
            <div style={styles.messageContainer}>
              <div style={styles.message}>{error.message}</div>
              {error.details && (
                <div style={styles.details}>{error.details}</div>
              )}
            </div>
            <div style={styles.actions}>
              {error.action && (
                <button
                  onClick={() => {
                    error.action!.callback();
                    dismissError(error.id);
                  }}
                  style={styles.actionButton}
                >
                  {error.action.label}
                </button>
              )}
              {error.dismissible && (
                <button
                  onClick={() => dismissError(error.id)}
                  style={styles.dismissButton}
                  title="Dismiss"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10000,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '8px',
    pointerEvents: 'none',
  },
  banner: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    borderRadius: '4px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
    pointerEvents: 'auto',
    animation: 'slideDown 0.3s ease-out',
  },
  errorBanner: {
    backgroundColor: '#5a1d1d',
    border: '1px solid #f48771',
  },
  warningBanner: {
    backgroundColor: '#5a4d1d',
    border: '1px solid #f4c471',
  },
  infoBanner: {
    backgroundColor: '#1d3a5a',
    border: '1px solid #71a8f4',
  },
  content: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
  },
  icon: {
    fontSize: '20px',
    flexShrink: 0,
  },
  messageContainer: {
    flex: 1,
    minWidth: 0,
  },
  message: {
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 500,
    marginBottom: '4px',
  },
  details: {
    color: '#cccccc',
    fontSize: '12px',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  actionButton: {
    padding: '6px 12px',
    fontSize: '12px',
    backgroundColor: '#0e639c',
    color: '#ffffff',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    fontWeight: 500,
  },
  dismissButton: {
    padding: '4px 8px',
    fontSize: '16px',
    backgroundColor: 'transparent',
    color: '#cccccc',
    border: 'none',
    cursor: 'pointer',
    borderRadius: '3px',
  },
};
