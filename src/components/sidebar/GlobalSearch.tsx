import React, { useState, useRef, useEffect } from 'react';
import { ResourceType, getFavoriteActions, getContextMenuActions } from '../../resources';
import { useResourceCache } from '../../contexts/ResourceCacheContext';

interface GlobalSearchProps {
  selectedContext: string;
  onSelectResult: (actionId: string, resourceType: ResourceType, resourceName: string, namespace: string) => void;
  onShowContextMenu?: (x: number, y: number, resourceType: ResourceType, resourceName: string, namespace: string) => void;
}

export function GlobalSearch({ selectedContext, onSelectResult, onShowContextMenu }: GlobalSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Use global resource cache from context
  const { search, isLoading } = useResourceCache();
  
  // Get search results from cache
  const results = searchQuery ? search(searchQuery) : [];

  // Keyboard shortcut: Ctrl+F to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+F or Cmd+F (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsExpanded(true);
      }
      
      // Escape to clear and blur
      if (e.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setSearchQuery('');
        setIsExpanded(false);
        searchInputRef.current?.blur();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div style={styles.container}>
      {/* Custom Scrollbar Styles */}
      <style>{`
        .global-search-results::-webkit-scrollbar {
          width: 10px;
        }
        .global-search-results::-webkit-scrollbar-track {
          background: #1e1e1e;
        }
        .global-search-results::-webkit-scrollbar-thumb {
          background: #424242;
          border-radius: 5px;
        }
        .global-search-results::-webkit-scrollbar-thumb:hover {
          background: #4e4e4e;
        }
      `}</style>
      
      {/* Search Input */}
      <div style={styles.searchBox}>
        <input
          ref={searchInputRef}
          type="text"
          placeholder={isLoading ? "🔄 Loading resources..." : "🔍 Search resources (try: pod:nginx or cron:backup)"}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => setIsExpanded(true)}
          style={styles.searchInput}
          disabled={isLoading}
        />
        {searchQuery && (
          <button
            onClick={() => {
              setSearchQuery('');
              setIsExpanded(false);
            }}
            style={styles.clearButton}
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Search Results */}
      {isExpanded && (searchQuery || results.length > 0) && (
        <div className="global-search-results" style={styles.resultsContainer}>
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
                              setSearchQuery('');
                              setIsExpanded(false);
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
                              // Keep search open when showing context menu
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
          ) : searchQuery ? (
            <div style={styles.noResults}>No resources found</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    marginBottom: '16px',
    position: 'relative',
  },
  searchBox: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  searchInput: {
    width: '100%',
    padding: '8px 32px 8px 12px',
    backgroundColor: '#3c3c3c',
    border: '1px solid #3e3e42',
    borderRadius: '4px',
    color: '#cccccc',
    fontSize: '13px',
    outline: 'none',
  },
  clearButton: {
    position: 'absolute',
    right: '8px',
    padding: '4px 8px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#858585',
    cursor: 'pointer',
    fontSize: '14px',
  },
  resultsContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: '4px',
    backgroundColor: '#2d2d30',
    border: '1px solid #3e3e42',
    borderRadius: '4px',
    maxHeight: '400px',
    overflowY: 'auto',
    scrollbarGutter: 'stable', // Reserve space for scrollbar to prevent layout shift
    zIndex: 1000,
    boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
  },
  resultsHeader: {
    padding: '8px 12px',
    fontSize: '11px',
    color: '#858585',
    borderBottom: '1px solid #3e3e42',
    fontWeight: 600,
    textTransform: 'uppercase',
  },
  resultsList: {
    padding: '4px',
  },
  resultItem: {
    padding: '8px 12px',
    borderRadius: '3px',
    marginBottom: '4px',
    backgroundColor: '#1e1e1e',
    border: '1px solid #3e3e42',
  },
  resultHeader: {
    marginBottom: '8px',
  },
  resultName: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#cccccc',
    marginBottom: '4px',
  },
  resultActions: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
  },
  actionButton: {
    padding: '4px 8px',
    fontSize: '10px',
    backgroundColor: '#0e639c',
    color: '#ffffff',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  moreButton: {
    padding: '4px 8px',
    fontSize: '12px',
    backgroundColor: '#3c3c3c',
    color: '#cccccc',
    border: '1px solid #3e3e42',
    borderRadius: '3px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  resultInfo: {
    display: 'flex',
    gap: '8px',
    fontSize: '11px',
  },
  resultNamespace: {
    color: '#4ec9b0',
    fontFamily: 'monospace',
  },
  resultType: {
    color: '#858585',
  },
  noResults: {
    padding: '16px',
    textAlign: 'center',
    color: '#858585',
    fontSize: '12px',
    fontStyle: 'italic',
  },
};
