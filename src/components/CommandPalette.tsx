import React, { useState, useRef, useEffect } from 'react';
import { ResourceType, getFavoriteActions, getContextMenuActions } from '../resources';
import { useResourceCache } from '../contexts/ResourceCacheContext';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectResult: (actionId: string, resourceType: ResourceType, resourceName: string, namespace: string) => void;
  onShowContextMenu?: (x: number, y: number, resourceType: ResourceType, resourceName: string, namespace: string) => void;
}

export function CommandPalette({ isOpen, onClose, onSelectResult, onShowContextMenu }: CommandPaletteProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Use global resource cache from context
  const { search, isLoading } = useResourceCache();
  
  // Get search results from cache
  const results = searchQuery ? search(searchQuery) : [];

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      searchInputRef.current?.focus();
      setSearchQuery(''); // Clear on open
    }
  }, [isOpen]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Click outside to close
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div style={styles.backdrop} onClick={handleBackdropClick}>
      {/* Custom Scrollbar Styles */}
      <style>{`
        .command-palette-results::-webkit-scrollbar {
          width: 10px;
        }
        .command-palette-results::-webkit-scrollbar-track {
          background: #1e1e1e;
        }
        .command-palette-results::-webkit-scrollbar-thumb {
          background: #424242;
          border-radius: 5px;
        }
        .command-palette-results::-webkit-scrollbar-thumb:hover {
          background: #4e4e4e;
        }
      `}</style>

      <div style={styles.container}>
        {/* Search Input */}
        <div style={styles.searchBox}>
          <div style={styles.searchIcon}>🔍</div>
          <input
            ref={searchInputRef}
            type="text"
            placeholder={isLoading ? "Loading resources..." : "Search resources (try: pod:nginx or cron:backup)"}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
            disabled={isLoading}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={styles.clearButton}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Search Results */}
        {searchQuery && (
          <div className="command-palette-results" style={styles.resultsContainer}>
            {results.length > 0 ? (
              <>
                <div style={styles.resultsHeader}>
                  {results.length} result{results.length !== 1 ? 's' : ''} found
                </div>
                <div style={styles.resultsList}>
                  {results.map((result, index) => {
                    const actions = getFavoriteActions(result.type, {
                      resourceName: result.name,
                      namespace: result.namespace,
                      resourceType: result.type,
                    });

                    const contextActions = getContextMenuActions(result.type, {
                      resourceName: result.name,
                      namespace: result.namespace,
                      resourceType: result.type,
                    });

                    return (
                      <div
                        key={`${result.type}-${result.namespace}-${result.name}-${index}`}
                        style={styles.resultItem}
                      >
                        <div style={styles.resultHeader}>
                          <div>
                            <div style={styles.resultName}>{result.name}</div>
                            <div style={styles.resultInfo}>
                              <span style={styles.resultNamespace}>{result.namespace}</span>
                              <span style={styles.resultType}>{result.info}</span>
                            </div>
                          </div>
                        </div>
                        <div style={styles.resultActions}>
                          {actions.map((action) => (
                            <button
                              key={action.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectResult(action.id, result.type, result.name, result.namespace);
                                onClose();
                              }}
                              style={styles.actionButton}
                              title={action.description}
                            >
                              {action.icon} {action.label}
                            </button>
                          ))}
                          {/* More actions button */}
                          {contextActions.length > 0 && onShowContextMenu && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onShowContextMenu(e.clientX, e.clientY, result.type, result.name, result.namespace);
                                // Keep palette open when showing context menu
                              }}
                              style={styles.moreButton}
                              title="More actions"
                            >
                              ⋯
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div style={styles.noResults}>No resources found</div>
            )}
          </div>
        )}

        {/* Help Text */}
        {!searchQuery && (
          <div style={styles.helpText}>
            <div style={styles.helpTitle}>Quick Search</div>
            <div style={styles.helpItem}>
              <span style={styles.helpKey}>Type</span> to search resources
            </div>
            <div style={styles.helpItem}>
              <span style={styles.helpKey}>pod:nginx</span> to filter by type
            </div>
            <div style={styles.helpItem}>
              <span style={styles.helpKey}>Esc</span> to close
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: '15vh',
    zIndex: 10001,
    animation: 'fadeIn 0.15s ease-out',
  },
  container: {
    width: '600px',
    maxWidth: '90vw',
    backgroundColor: '#252526',
    borderRadius: '8px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
    overflow: 'hidden',
    animation: 'slideDown 0.2s ease-out',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #3e3e42',
    backgroundColor: '#2d2d30',
  },
  searchIcon: {
    fontSize: '18px',
    marginRight: '12px',
    color: '#858585',
  },
  searchInput: {
    flex: 1,
    padding: '8px 0',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#cccccc',
    fontSize: '15px',
    outline: 'none',
  },
  clearButton: {
    padding: '4px 8px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#858585',
    cursor: 'pointer',
    fontSize: '16px',
  },
  resultsContainer: {
    maxHeight: '500px',
    overflowY: 'auto',
    scrollbarGutter: 'stable',
  },
  resultsHeader: {
    padding: '12px 16px',
    fontSize: '11px',
    color: '#858585',
    borderBottom: '1px solid #3e3e42',
    fontWeight: 600,
    textTransform: 'uppercase',
    backgroundColor: '#2d2d30',
  },
  resultsList: {
    padding: '8px',
  },
  resultItem: {
    padding: '12px 16px',
    borderRadius: '4px',
    marginBottom: '4px',
    backgroundColor: '#1e1e1e',
    border: '1px solid #3e3e42',
    transition: 'background-color 0.15s',
  },
  resultHeader: {
    marginBottom: '8px',
  },
  resultName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#cccccc',
    marginBottom: '4px',
  },
  resultActions: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },
  actionButton: {
    padding: '6px 12px',
    fontSize: '11px',
    backgroundColor: '#0e639c',
    color: '#ffffff',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    fontWeight: 500,
  },
  moreButton: {
    padding: '6px 12px',
    fontSize: '13px',
    backgroundColor: '#3c3c3c',
    color: '#cccccc',
    border: '1px solid #3e3e42',
    borderRadius: '3px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  resultInfo: {
    display: 'flex',
    gap: '12px',
    fontSize: '12px',
  },
  resultNamespace: {
    color: '#4ec9b0',
    fontFamily: 'monospace',
  },
  resultType: {
    color: '#858585',
  },
  noResults: {
    padding: '32px 16px',
    textAlign: 'center',
    color: '#858585',
    fontSize: '13px',
  },
  helpText: {
    padding: '24px 16px',
    color: '#858585',
  },
  helpTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#cccccc',
    marginBottom: '16px',
  },
  helpItem: {
    fontSize: '12px',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
  },
  helpKey: {
    padding: '2px 8px',
    backgroundColor: '#3c3c3c',
    border: '1px solid #3e3e42',
    borderRadius: '3px',
    marginRight: '8px',
    fontFamily: 'monospace',
    fontSize: '11px',
    color: '#cccccc',
  },
};
