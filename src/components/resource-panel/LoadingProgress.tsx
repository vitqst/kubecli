// src/components/resource-panel/LoadingProgress.tsx
import React from 'react';
import { ResourceType } from '../../resources';
import { ResourceLoadingState } from '../../contexts/ResourceCacheContext';

interface LoadingProgressProps {
  loadingStates: Record<ResourceType, ResourceLoadingState>;
}

// Resource types to display (in order)
const DISPLAY_TYPES: { type: ResourceType; label: string }[] = [
  { type: 'pod', label: 'Pods' },
  { type: 'deployment', label: 'Deployments' },
  { type: 'cronjob', label: 'CronJobs' },
  { type: 'service', label: 'Services' },
  { type: 'configmap', label: 'ConfigMaps' },
  { type: 'secret', label: 'Secrets' },
];

// Inject spinner animation keyframes
if (typeof document !== 'undefined') {
  const styleId = 'loading-progress-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
}

export function LoadingProgress({ loadingStates }: LoadingProgressProps) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>Fetching resources...</div>
      <div style={styles.list}>
        {DISPLAY_TYPES.map(({ type, label }) => {
          const state = loadingStates[type];
          return (
            <div key={type} style={styles.row}>
              <span style={styles.icon}>
                {state.status === 'pending' && <span style={styles.pending}>○</span>}
                {state.status === 'loading' && <span style={styles.spinner}>⟳</span>}
                {state.status === 'success' && <span style={styles.success}>✓</span>}
                {state.status === 'error' && <span style={styles.error}>✗</span>}
              </span>
              <span style={styles.label}>{label}</span>
              <span style={styles.info}>
                {state.status === 'success' && (
                  <>
                    {state.count} items
                    {state.duration !== undefined && (
                      <span style={styles.timing}> ({(state.duration / 1000).toFixed(1)}s)</span>
                    )}
                  </>
                )}
                {state.status === 'error' && (
                  <span style={styles.errorText}>{state.error}</span>
                )}
                {state.status === 'loading' && '...'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '16px',
    fontFamily: 'monospace',
  },
  header: {
    fontSize: '12px',
    color: '#cccccc',
    marginBottom: '12px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
  },
  icon: {
    width: '16px',
    textAlign: 'center',
  },
  pending: {
    color: '#6e6e6e',
  },
  spinner: {
    color: '#cccccc',
    display: 'inline-block',
    animation: 'spin 1s linear infinite',
  },
  success: {
    color: '#4ec9b0',
  },
  error: {
    color: '#f14c4c',
  },
  label: {
    color: '#cccccc',
    minWidth: '100px',
  },
  info: {
    color: '#858585',
  },
  timing: {
    color: '#6e6e6e',
  },
  errorText: {
    color: '#f14c4c',
  },
};
