import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { KubeConfigSummary, KubectlResult, KubeContext, KubeConfigFile } from './common/kubeTypes';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Terminal } from './components/Terminal';

// Fix for webpack asset relocator __dirname issue in renderer
declare global {
  var __dirname: string;
}
if (typeof __dirname === 'undefined') {
  (globalThis as any).__dirname = '';
}

type LoadState = 'idle' | 'loading' | 'error';

type CommandResult = KubectlResult & {
  completedAt: Date;
};

const kubeAPI = window.kube;

function App() {
  console.log('[App] Component rendering...');
  
  const [contexts, setContexts] = useState<KubeContext[]>([]);
  const [currentContext, setCurrentContext] = useState<string | null>(null);
  const [selectedContext, setSelectedContext] = useState<string>('');
  const [kubeconfigPath, setKubeconfigPath] = useState<string>('');
  const [availableConfigs, setAvailableConfigs] = useState<KubeConfigFile[]>([]);
  const [command, setCommand] = useState<string>('');
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [showTerminal, setShowTerminal] = useState<boolean>(false);

  const applySummary = useCallback((summary: KubeConfigSummary) => {
      setContexts(summary.contexts);
      setCurrentContext(summary.currentContext);
      setKubeconfigPath(summary.kubeconfigPath);
      setAvailableConfigs(summary.availableConfigs || []);

      const availableNames = summary.contexts.map((ctx) => ctx.name);
      const fallback = summary.currentContext ?? availableNames[0] ?? '';

      setSelectedContext((prev) => {
        if (prev && availableNames.includes(prev)) {
          return prev;
        }
        return fallback;
      });
    }, []);

  const refreshContexts = useCallback(async () => {
    if (!kubeAPI) {
      setLoadState('error');
      setLoadError(
        'Renderer bridge unavailable. Ensure the preload script is configured and contextIsolation remains enabled.'
      );
      return;
    }

    setLoadState('loading');
    setLoadError(null);
    try {
      const summary = await kubeAPI.getContexts();
      applySummary(summary);
      setLoadState('idle');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load contexts';
      setLoadError(message);
      setLoadState('error');
    }
  }, [applySummary]);

  useEffect(() => {
    void refreshContexts();
  }, [refreshContexts]);

  const handleContextChange = useCallback(
    async (nextContext: string) => {
      setSelectedContext(nextContext);
      setRunError(null);
      try {
        if (!kubeAPI) {
          throw new Error('Renderer bridge unavailable.');
        }
        const summary = await kubeAPI.setContext(nextContext);
        applySummary(summary);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to switch context';
        setRunError(message);
        await refreshContexts();
      }
    },
    [applySummary, refreshContexts]
  );

  const handleConfigChange = useCallback(
    async (configPath: string) => {
      setLoadState('loading');
      setLoadError(null);
      setRunError(null);
      try {
        if (!kubeAPI) {
          throw new Error('Renderer bridge unavailable.');
        }
        const summary = await kubeAPI.setConfig(configPath);
        applySummary(summary);
        setLoadState('idle');
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to switch kubeconfig';
        setLoadError(message);
        setLoadState('error');
      }
    },
    [applySummary]
  );

  const handleRun = useCallback(async () => {
    if (!selectedContext) {
      setRunError('Select a context before running a command.');
      return;
    }

    if (!command.trim()) {
      setRunError('Enter a kubectl command to run.');
      return;
    }

    setIsRunning(true);
    setRunError(null);
    setResult(null);
    try {
      if (!kubeAPI) {
        throw new Error('Renderer bridge unavailable.');
      }
      const runResult = await kubeAPI.runCommand(selectedContext, command);
      setResult({
        ...runResult,
        completedAt: new Date(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to run kubectl command';
      setRunError(message);
    } finally {
      setIsRunning(false);
    }
  }, [command, selectedContext]);

  const activeContextDetails = useMemo(() => {
    return contexts.find((ctx) => ctx.name === selectedContext) ?? null;
  }, [contexts, selectedContext]);

  const disabled = contexts.length === 0 || loadState === 'loading';

  if (!kubeAPI) {
    return (
      <div style={styles.container}>
        <header style={styles.header}>
          <h1 style={styles.title}>Kubernetes CLI Manager</h1>
        </header>
        <p style={styles.error}>
          Unable to reach Electron preload bridge. Double-check the application
          configuration (`preload.ts`) and restart the app.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Kubernetes CLI Manager</h1>
        {kubeconfigPath && (
          <span style={styles.path}>Config: {kubeconfigPath}</span>
        )}
        <button
          onClick={() => setShowTerminal(!showTerminal)}
          style={styles.toggleButton}
        >
          {showTerminal ? 'Show Command UI' : 'Show Terminal'}
        </button>
      </header>

      {showTerminal ? (
        <div style={styles.terminalContainer}>
          <Terminal id="main" />
        </div>
      ) : (
        <div style={styles.oldUIContainer}>

      <section style={styles.section}>
        <h2 style={styles.subtitle}>Kubeconfig & Context</h2>
        {loadState === 'loading' && <p>Loading contexts…</p>}
        {loadError && (
          <p style={styles.error}>
            {loadError} — check your kubeconfig or kubectl installation.
          </p>
        )}
        
        {availableConfigs.length > 1 && (
          <div style={styles.contextRow}>
            <label htmlFor="config-select" style={styles.label}>
              Kubeconfig file
            </label>
            <select
              id="config-select"
              style={styles.select}
              disabled={disabled}
              value={kubeconfigPath}
              onChange={(event) => handleConfigChange(event.target.value)}
            >
              {availableConfigs.map((config) => (
                <option key={config.path} value={config.path}>
                  {config.name} {config.isDefault ? '(default)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={styles.contextRow}>
          <label htmlFor="context-select" style={styles.label}>
            Active context
          </label>
          <select
            id="context-select"
            style={styles.select}
            disabled={disabled}
            value={selectedContext}
            onChange={(event) => handleContextChange(event.target.value)}
          >
            {contexts.map((ctx) => (
              <option key={ctx.name} value={ctx.name}>
                {ctx.name}
                {ctx.name === currentContext ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </div>
        {contexts.length === 0 && loadState !== 'loading' && (
          <p style={styles.placeholder}>
            No contexts found. Check that your kubeconfig is available.
          </p>
        )}
        {activeContextDetails && (
          <ul style={styles.contextDetails}>
            <li>
              <strong>Cluster:</strong> {activeContextDetails.cluster ?? 'N/A'}
            </li>
            <li>
              <strong>Server:</strong> {activeContextDetails.server ?? 'N/A'}
            </li>
            <li>
              <strong>User:</strong> {activeContextDetails.user ?? 'N/A'}
            </li>
            {activeContextDetails.namespace && (
              <li>
                <strong>Namespace:</strong> {activeContextDetails.namespace}
              </li>
            )}
          </ul>
        )}
      </section>

      <section style={styles.section}>
        <h2 style={styles.subtitle}>kubectl Command Runner</h2>
        <div style={styles.commandRow}>
          <input
            type="text"
            placeholder="e.g. get pods -A"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            style={styles.commandInput}
            disabled={disabled}
          />
          <button
            type="button"
            style={{
              ...styles.runButton,
              opacity: disabled || isRunning ? 0.6 : 1,
              cursor: disabled || isRunning ? 'not-allowed' : 'pointer',
            }}
            onClick={() => void handleRun()}
            disabled={disabled || isRunning}
          >
            {isRunning ? 'Running…' : 'Run'}
          </button>
        </div>
        {runError && <p style={styles.error}>{runError}</p>}
      </section>

      <section style={styles.section}>
        <h2 style={styles.subtitle}>Output</h2>
        {result ? (
          <div style={styles.resultContainer}>
            <div style={styles.resultMeta}>
              <span>Exit code: {result.code ?? 'n/a'}</span>
              <span>
                Completed:{' '}
                {result.completedAt.toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            </div>
            <div style={styles.outputGroup}>
              <h3 style={styles.outputTitle}>STDOUT</h3>
              <pre style={styles.outputBlock}>
                {result.stdout.trim() ? result.stdout : '<no output>'}
              </pre>
            </div>
            <div style={styles.outputGroup}>
              <h3 style={styles.outputTitle}>STDERR</h3>
              <pre style={styles.outputBlock}>
                {result.stderr.trim() ? result.stderr : '<no output>'}
              </pre>
            </div>
          </div>
        ) : (
          <p style={styles.placeholder}>Command output will appear here.</p>
        )}
      </section>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: 'system-ui, sans-serif',
    width: '100%',
    height: '100vh',
    margin: 0,
    padding: 0,
    color: '#1f2933',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px',
    backgroundColor: '#f5f5f5',
    borderBottom: '1px solid #e0e0e0',
    flexShrink: 0,
  },
  title: {
    fontSize: '1.75rem',
    margin: 0,
  },
  path: {
    fontSize: '0.875rem',
    color: '#52606d',
  },
  section: {
    marginBottom: '24px',
  },
  subtitle: {
    fontSize: '1.25rem',
    marginBottom: '12px',
  },
  contextRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  label: {
    minWidth: '120px',
  },
  select: {
    flex: '1',
    padding: '8px',
    fontSize: '1rem',
  },
  contextDetails: {
    marginTop: '12px',
    paddingLeft: '18px',
    color: '#52606d',
  },
  commandRow: {
    display: 'flex',
    gap: '12px',
  },
  commandInput: {
    flex: 1,
    padding: '10px',
    fontSize: '1rem',
    borderRadius: '4px',
    border: '1px solid #cbd2d9',
  },
  runButton: {
    padding: '10px 16px',
    fontSize: '1rem',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: '#2563eb',
    color: '#fff',
  },
  resultContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  resultMeta: {
    display: 'flex',
    gap: '16px',
    fontSize: '0.9rem',
    color: '#52606d',
  },
  outputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  outputTitle: {
    margin: 0,
    fontSize: '1rem',
    color: '#1f2933',
  },
  outputBlock: {
    backgroundColor: '#f5f7fa',
    border: '1px solid #cbd2d9',
    padding: '12px',
    borderRadius: '4px',
    minHeight: '120px',
    whiteSpace: 'pre-wrap',
    fontFamily: 'ui-monospace, SFMono-Regular, SFMono, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace',
    fontSize: '0.95rem',
  },
  placeholder: {
    color: '#52606d',
  },
  error: {
    color: '#c81e1e',
    marginTop: '8px',
  },
  toggleButton: {
    padding: '8px 16px',
    backgroundColor: '#2472c8',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  terminalContainer: {
    flex: 1,
    width: '100%',
    backgroundColor: '#1e1e1e',
    overflow: 'hidden',
  },
  oldUIContainer: {
    flex: 1,
    width: '100%',
    overflowY: 'auto',
    padding: '24px',
  },
};

function initializeApp() {
  console.log('[Renderer] Initializing app...');
  
  const container = document.getElementById('root');

  if (!container) {
    console.error('[Renderer] Root container element not found!');
    throw new Error('Root container element not found');
  }

  console.log('[Renderer] Root container found, creating React root...');
  const root = createRoot(container);

  console.log('[Renderer] Rendering App component...');
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
  
  console.log('[Renderer] App component rendered successfully');
}

// Global error handlers
window.addEventListener('error', (event) => {
  console.error('[Global Error Handler] Uncaught error:', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Global Error Handler] Unhandled promise rejection:', {
    reason: event.reason,
    promise: event.promise,
  });
});

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
