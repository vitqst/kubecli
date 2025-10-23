import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    // Send error to main process for logging
    if (window.kube) {
      console.error('[ErrorBoundary] Full error details:', {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
      });
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const { error, errorInfo } = this.state;

      return (
        <div style={styles.container}>
          <div style={styles.errorBox}>
            <h1 style={styles.title}>⚠️ Application Error</h1>
            
            <div style={styles.section}>
              <h2 style={styles.subtitle}>Error Message:</h2>
              <pre style={styles.errorText}>
                {error?.message || 'Unknown error'}
              </pre>
            </div>

            <div style={styles.section}>
              <h2 style={styles.subtitle}>Stack Trace:</h2>
              <pre style={styles.stackTrace}>
                {error?.stack || 'No stack trace available'}
              </pre>
            </div>

            {errorInfo && (
              <div style={styles.section}>
                <h2 style={styles.subtitle}>Component Stack:</h2>
                <pre style={styles.stackTrace}>
                  {errorInfo.componentStack}
                </pre>
              </div>
            )}

            <div style={styles.section}>
              <h2 style={styles.subtitle}>Quick Actions:</h2>
              <button
                style={styles.button}
                onClick={() => window.location.reload()}
              >
                Reload Application
              </button>
              <button
                style={styles.buttonSecondary}
                onClick={() => {
                  navigator.clipboard.writeText(
                    `Error: ${error?.message}\n\nStack:\n${error?.stack}\n\nComponent Stack:\n${errorInfo?.componentStack}`
                  );
                  alert('Error details copied to clipboard!');
                }}
              >
                Copy Error Details
              </button>
            </div>

            <div style={styles.helpText}>
              <p>This error has been logged to the console. Open DevTools to see more details.</p>
              <p>Check the Console tab for the full error output.</p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    padding: '20px',
    fontFamily: 'system-ui, sans-serif',
  },
  errorBox: {
    backgroundColor: '#fff',
    border: '2px solid #dc2626',
    borderRadius: '8px',
    padding: '32px',
    maxWidth: '900px',
    width: '100%',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  },
  title: {
    color: '#dc2626',
    fontSize: '28px',
    marginTop: 0,
    marginBottom: '24px',
  },
  section: {
    marginBottom: '24px',
  },
  subtitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '8px',
    color: '#374151',
  },
  errorText: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    padding: '16px',
    borderRadius: '4px',
    fontSize: '16px',
    fontWeight: 'bold',
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  stackTrace: {
    backgroundColor: '#f3f4f6',
    color: '#1f2937',
    padding: '16px',
    borderRadius: '4px',
    fontSize: '13px',
    margin: 0,
    overflow: 'auto',
    maxHeight: '300px',
    whiteSpace: 'pre',
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  },
  button: {
    backgroundColor: '#2563eb',
    color: '#fff',
    border: 'none',
    padding: '12px 24px',
    fontSize: '16px',
    borderRadius: '6px',
    cursor: 'pointer',
    marginRight: '12px',
    fontWeight: '500',
  },
  buttonSecondary: {
    backgroundColor: '#6b7280',
    color: '#fff',
    border: 'none',
    padding: '12px 24px',
    fontSize: '16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  helpText: {
    marginTop: '24px',
    padding: '16px',
    backgroundColor: '#eff6ff',
    borderRadius: '4px',
    fontSize: '14px',
    color: '#1e40af',
  },
};
