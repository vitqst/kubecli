import React, { useState, useRef, useEffect } from 'react';
import { ResourceType, getFavoriteActions, getContextMenuActions } from '../resources';
import { useResourceCache } from '../contexts/ResourceCacheContext';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectResult: (actionId: string, resourceType: ResourceType, resourceName: string, namespace: string) => void;
  onShowContextMenu?: (x: number, y: number, resourceType: ResourceType, resourceName: string, namespace: string) => void;
}

interface CommandItem {
  type: 'resource-action' | 'app-action';
  resourceType?: ResourceType;
  resourceName?: string;
  namespace?: string;
  actionId: string;
  actionLabel: string;
  actionIcon: string;
  actionDescription: string;
  searchText: string;
}

interface ScoredCommandItem extends CommandItem {
  score: number; // Fuzzy match score for sorting
}

// Fuzzy match with scoring - returns score (higher is better) or null if no match
function fuzzyMatchScore(target: string, query: string): number | null {
  if (!query) return 0;
  
  const targetLower = target.toLowerCase();
  const queryLower = query.toLowerCase();
  
  // Check for exact match (highest score)
  if (targetLower === queryLower) return 10000;
  
  // Check for exact substring match (very high score)
  if (targetLower.includes(queryLower)) {
    const index = targetLower.indexOf(queryLower);
    // Bonus if match is at start
    const startBonus = index === 0 ? 1000 : 0;
    return 5000 + startBonus;
  }
  
  // Fuzzy match with scoring
  let score = 0;
  let queryIndex = 0;
  let consecutiveMatches = 0;
  let lastMatchIndex = -2;
  
  for (let i = 0; i < targetLower.length && queryIndex < queryLower.length; i++) {
    if (targetLower[i] === queryLower[queryIndex]) {
      // Base score for match
      score += 100;
      
      // Bonus for consecutive matches
      if (i === lastMatchIndex + 1) {
        consecutiveMatches++;
        score += consecutiveMatches * 50; // Increasing bonus for longer sequences
      } else {
        consecutiveMatches = 0;
      }
      
      // Bonus for match at word boundary (start, after dash, underscore, space)
      if (i === 0 || targetLower[i - 1] === '-' || targetLower[i - 1] === '_' || targetLower[i - 1] === ' ') {
        score += 200;
      }
      
      // Bonus for case match
      if (target[i] === query[queryIndex]) {
        score += 50;
      }
      
      lastMatchIndex = i;
      queryIndex++;
    }
  }
  
  // Return null if not all characters matched
  if (queryIndex !== queryLower.length) return null;
  
  // Penalty for length difference (prefer shorter targets)
  score -= (target.length - query.length) * 2;
  
  return score;
}

// Fuzzy match helper - checks if all characters in query appear in target in order
function fuzzyMatch(target: string, query: string): boolean {
  return fuzzyMatchScore(target, query) !== null;
}

// Fuzzy match with indices - returns array of matched character positions
function fuzzyMatchWithIndices(target: string, query: string): number[] | null {
  if (!query) return [];
  
  const targetLower = target.toLowerCase();
  const queryLower = query.toLowerCase();
  const indices: number[] = [];
  
  let queryIndex = 0;
  for (let i = 0; i < targetLower.length && queryIndex < queryLower.length; i++) {
    if (targetLower[i] === queryLower[queryIndex]) {
      indices.push(i);
      queryIndex++;
    }
  }
  
  return queryIndex === queryLower.length ? indices : null;
}

// Highlight component - highlights matched characters
function HighlightedText({ text, query }: { text: string; query: string }) {
  const indices = fuzzyMatchWithIndices(text, query);
  
  if (!indices || indices.length === 0) {
    return <>{text}</>;
  }
  
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  
  indices.forEach((matchIndex, i) => {
    // Add text before match
    if (matchIndex > lastIndex) {
      parts.push(
        <span key={`text-${i}`}>
          {text.substring(lastIndex, matchIndex)}
        </span>
      );
    }
    
    // Add highlighted match
    parts.push(
      <span key={`match-${i}`} style={{
        backgroundColor: '#094771',
        color: '#4fc3f7',
        fontWeight: 600,
        padding: '0 1px',
        borderRadius: '2px',
      }}>
        {text[matchIndex]}
      </span>
    );
    
    lastIndex = matchIndex + 1;
  });
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(
      <span key="text-end">
        {text.substring(lastIndex)}
      </span>
    );
  }
  
  return <>{parts}</>;
}

export function CommandPalette({ isOpen, onClose, onSelectResult, onShowContextMenu }: CommandPaletteProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Use global resource cache from context
  const { resources, isLoading, refresh } = useResourceCache();
  
  // Build ALL command items from ALL resources (memoized for performance)
  const allCommandItems = React.useMemo(() => {
    const items: CommandItem[] = [];
    
    // Add app-level actions first
    items.push({
      type: 'app-action',
      actionId: 'app:reload',
      actionLabel: 'Reload Application',
      actionIcon: '🔄',
      actionDescription: 'Reload the entire application',
      searchText: 'reload application refresh restart'.toLowerCase(),
    });
    
    items.push({
      type: 'app-action',
      actionId: 'app:refresh-cache',
      actionLabel: 'Refresh Resource Cache',
      actionIcon: '♻️',
      actionDescription: 'Refresh all cached Kubernetes resources',
      searchText: 'refresh cache reload resources update'.toLowerCase(),
    });
    
    // Add resource-based actions
    resources.forEach(resource => {
      // Get all actions (favorites + context menu)
      const favoriteActions = getFavoriteActions(resource.type, {
        resourceName: resource.name,
        namespace: resource.namespace,
        resourceType: resource.type,
      });
      
      const contextActions = getContextMenuActions(resource.type, {
        resourceName: resource.name,
        namespace: resource.namespace,
        resourceType: resource.type,
      });
      
      const allActions = [...favoriteActions, ...contextActions];
      
      // Create a command item for each action
      allActions.forEach(action => {
        items.push({
          type: 'resource-action',
          resourceType: resource.type,
          resourceName: resource.name,
          namespace: resource.namespace,
          actionId: action.id,
          actionLabel: action.label,
          actionIcon: action.icon,
          actionDescription: action.description,
          searchText: `${resource.name} ${resource.namespace} ${resource.type} ${action.label} ${action.description}`.toLowerCase(),
        });
      });
    });
    
    return items;
  }, [resources]);
  
  // Extract query parts for highlighting
  const queryParts = React.useMemo(() => {
    if (!searchQuery) return { action: '', type: '', name: '' };
    
    const lowerQuery = searchQuery.toLowerCase();
    
    // action@type:name
    const actionAtTypeNameMatch = lowerQuery.match(/^([^@]+)@([^:]+):(.*)$/);
    if (actionAtTypeNameMatch) {
      return {
        action: actionAtTypeNameMatch[1],
        type: actionAtTypeNameMatch[2],
        name: actionAtTypeNameMatch[3],
      };
    }
    
    // action@name
    const actionAtMatch = lowerQuery.match(/^(\w+)@(.*)$/);
    if (actionAtMatch) {
      return {
        action: actionAtMatch[1],
        type: '',
        name: actionAtMatch[2],
      };
    }
    
    // @action
    if (lowerQuery.startsWith('@')) {
      return {
        action: lowerQuery.substring(1),
        type: '',
        name: '',
      };
    }
    
    // resource:name@action or resource:name
    if (lowerQuery.includes(':')) {
      const [beforeAt, afterAt] = lowerQuery.split('@');
      const [type, name] = beforeAt.split(':');
      return {
        action: afterAt || '',
        type: type || '',
        name: name || '',
      };
    }
    
    // Plain search - highlight everywhere
    return {
      action: lowerQuery,
      type: lowerQuery,
      name: lowerQuery,
    };
  }, [searchQuery]);
  
  // Filter command items by search query
  const filteredCommands = React.useMemo(() => {
    if (!searchQuery) return [];
    
    const lowerQuery = searchQuery.toLowerCase();
    
    // Check for action@type:name syntax (e.g., logs@pod:nginx or exec@deploy:api)
    const actionAtTypeNameMatch = lowerQuery.match(/^([^@]+)@([^:]+):(.*)$/);
    if (actionAtTypeNameMatch) {
      const [, actionFilter, typeFilter, nameFilter] = actionAtTypeNameMatch;
      
      const results = allCommandItems
        .map(item => {
          // Skip app actions for resource-specific syntax
          if (item.type === 'app-action') return null;
          
          const actionScore = fuzzyMatchScore(item.actionLabel, actionFilter) ?? 
                             fuzzyMatchScore(item.actionId, actionFilter) ?? 0;
          const typeScore = fuzzyMatchScore(item.resourceType!, typeFilter) ?? 0;
          const nameScore = !nameFilter.trim() ? 0 : 
                           Math.max(
                             fuzzyMatchScore(item.resourceName!, nameFilter.trim()) ?? 0,
                             fuzzyMatchScore(item.namespace!, nameFilter.trim()) ?? 0
                           );
          
          const actionMatches = actionScore > 0;
          const typeMatches = typeScore > 0;
          const nameMatches = !nameFilter.trim() || nameScore > 0;
          
          if (!actionMatches || !typeMatches || !nameMatches) return null;
          
          return { ...item, score: actionScore + typeScore + nameScore } as ScoredCommandItem;
        })
        .filter((item): item is ScoredCommandItem => item !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);
      
      return results;
    }
    
    // Check for action@resourcename syntax (e.g., logs@nginx or exec@api or trigg@)
    const actionAtMatch = lowerQuery.match(/^(\w+)@(.*)$/);
    if (actionAtMatch) {
      const [, actionFilter, nameFilter] = actionAtMatch;
      
      const results = allCommandItems
        .map(item => {
          const actionScore = fuzzyMatchScore(item.actionLabel, actionFilter) ?? 
                             fuzzyMatchScore(item.actionId, actionFilter) ?? 0;
          
          // App actions don't have resource names
          if (item.type === 'app-action') {
            return actionScore > 0 ? { ...item, score: actionScore } as ScoredCommandItem : null;
          }
          
          const nameScore = !nameFilter.trim() ? 0 : 
                           Math.max(
                             fuzzyMatchScore(item.resourceName!, nameFilter.trim()) ?? 0,
                             fuzzyMatchScore(item.namespace!, nameFilter.trim()) ?? 0
                           );
          
          const actionMatches = actionScore > 0;
          const nameMatches = !nameFilter.trim() || nameScore > 0;
          
          if (!actionMatches || !nameMatches) return null;
          
          return { ...item, score: actionScore + nameScore } as ScoredCommandItem;
        })
        .filter((item): item is ScoredCommandItem => item !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);
      
      return results;
    }
    
    // Check for @action syntax (e.g., @logs or @exec)
    if (lowerQuery.startsWith('@')) {
      const actionFilter = lowerQuery.substring(1);
      
      if (!actionFilter) return []; // Just "@" with nothing after
      
      const results = allCommandItems
        .map(item => {
          const actionScore = fuzzyMatchScore(item.actionLabel, actionFilter) ?? 
                             fuzzyMatchScore(item.actionId, actionFilter) ?? 0;
          
          return actionScore > 0 ? { ...item, score: actionScore } as ScoredCommandItem : null;
        })
        .filter((item): item is ScoredCommandItem => item !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);
      
      return results;
    }
    
    // Check for resource:name@action syntax (e.g., pod:nginx@logs)
    if (lowerQuery.includes('@')) {
      const [beforeAt, actionFilter = ''] = lowerQuery.split('@');
      const [resourceType, name = ''] = beforeAt.split(':');
      
      const results = allCommandItems
        .map(item => {
          // Skip app actions for resource-specific syntax
          if (item.type === 'app-action') return null;
          
          const typeScore = fuzzyMatchScore(item.resourceType!, resourceType) ?? 0;
          const nameScore = !name ? 0 : 
                           Math.max(
                             fuzzyMatchScore(item.resourceName!, name) ?? 0,
                             fuzzyMatchScore(item.namespace!, name) ?? 0
                           );
          const actionScore = !actionFilter ? 0 : 
                             Math.max(
                               fuzzyMatchScore(item.actionLabel, actionFilter) ?? 0,
                               fuzzyMatchScore(item.actionId, actionFilter) ?? 0
                             );
          
          const typeMatches = typeScore > 0;
          const nameMatches = !name || nameScore > 0;
          const actionMatches = !actionFilter || actionScore > 0;
          
          if (!typeMatches || !nameMatches || !actionMatches) return null;
          
          return { ...item, score: typeScore + nameScore + actionScore } as ScoredCommandItem;
        })
        .filter((item): item is ScoredCommandItem => item !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);
      
      return results;
    }
    
    // Check for resource:name syntax (e.g., pod:nginx)
    if (lowerQuery.includes(':')) {
      const parts = lowerQuery.split(':');
      const resourceTypeFilter = parts[0];
      const nameFilter = parts[1] || '';
      
      const results = allCommandItems
        .map(item => {
          // Skip app actions for resource-specific syntax
          if (item.type === 'app-action') return null;
          
          const typeScore = fuzzyMatchScore(item.resourceType!, resourceTypeFilter) ?? 0;
          const nameScore = !nameFilter.trim() ? 0 : 
                           Math.max(
                             fuzzyMatchScore(item.resourceName!, nameFilter.trim()) ?? 0,
                             fuzzyMatchScore(item.namespace!, nameFilter.trim()) ?? 0
                           );
          
          const typeMatches = typeScore > 0;
          const nameMatches = !nameFilter.trim() || nameScore > 0;
          
          if (!typeMatches || !nameMatches) return null;
          
          return { ...item, score: typeScore + nameScore } as ScoredCommandItem;
        })
        .filter((item): item is ScoredCommandItem => item !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);
      
      return results;
    }
    
    // Plain search - search in all fields with scoring
    const results = allCommandItems
      .map(item => {
        const score = fuzzyMatchScore(item.searchText, lowerQuery) ?? 0;
        return score > 0 ? { ...item, score } as ScoredCommandItem : null;
      })
      .filter((item): item is ScoredCommandItem => item !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
    
    return results;
  }, [searchQuery, allCommandItems]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      searchInputRef.current?.focus();
      setSearchQuery(''); // Clear on open
      setSelectedIndex(0); // Reset selection
    }
  }, [isOpen]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands.length]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Arrow Down - Move selection down
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < filteredCommands.length - 1 ? prev + 1 : prev
        );
        return;
      }

      // Arrow Up - Move selection up
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
        return;
      }

      // Enter - Execute selected command
      if (e.key === 'Enter' && filteredCommands.length > 0) {
        e.preventDefault();
        const selected = filteredCommands[selectedIndex];
        if (selected) {
          // Handle app-level actions
          if (selected.type === 'app-action') {
            if (selected.actionId === 'app:reload') {
              // Cleanup terminals before reload
              if (window.terminal) {
                window.terminal.close('main').catch(console.error);
              }
              setTimeout(() => window.location.reload(), 100);
            } else if (selected.actionId === 'app:refresh-cache') {
              refresh();
            }
            onClose();
          } else {
            // Handle resource actions
            onSelectResult(selected.actionId, selected.resourceType!, selected.resourceName!, selected.namespace!);
            onClose();
            // Focus terminal after closing
            setTimeout(() => {
              const terminalElement = document.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement;
              if (terminalElement) {
                terminalElement.focus();
              }
            }, 100);
          }
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, filteredCommands, selectedIndex, onSelectResult, refresh]);

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
        .command-item:hover {
          background-color: #2a2d2e !important;
        }
      `}</style>

      <div style={styles.container}>
        {/* Search Input */}
        <div style={styles.searchBox}>
          <div style={styles.searchIcon}>🔍</div>
          <input
            ref={searchInputRef}
            type="text"
            placeholder={isLoading ? "Loading resources..." : "Type to search commands..."}
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

        {/* Command Results */}
        {searchQuery && (
          <div className="command-palette-results" style={styles.resultsContainer}>
            {filteredCommands.length > 0 ? (
              <>
                <div style={styles.resultsHeader}>
                  {filteredCommands.length} command{filteredCommands.length !== 1 ? 's' : ''} found
                </div>
                <div style={styles.resultsList}>
                  {filteredCommands.map((command, index) => {
                    // Find the full resource object for detailed info (only for resource actions)
                    const resource = command.type === 'resource-action' 
                      ? resources.find(r => 
                          r.type === command.resourceType && 
                          r.name === command.resourceName && 
                          r.namespace === command.namespace
                        )
                      : null;
                    
                    const isSelected = index === selectedIndex;
                    
                    return (
                      <div
                        key={`${command.type}-${command.actionId}-${index}`}
                        className="command-item"
                        style={{
                          ...styles.commandItem,
                          ...(isSelected ? styles.commandItemSelected : {}),
                        }}
                        onClick={() => {
                          if (command.type === 'app-action') {
                            if (command.actionId === 'app:reload') {
                              // Cleanup terminals before reload
                              if (window.terminal) {
                                window.terminal.close('main').catch(console.error);
                              }
                              setTimeout(() => window.location.reload(), 100);
                            } else if (command.actionId === 'app:refresh-cache') {
                              refresh();
                            }
                            onClose();
                          } else {
                            onSelectResult(command.actionId, command.resourceType!, command.resourceName!, command.namespace!);
                            onClose();
                            // Focus terminal after closing
                            setTimeout(() => {
                              const terminalElement = document.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement;
                              if (terminalElement) {
                                terminalElement.focus();
                              }
                            }, 100);
                          }
                        }}
                        onMouseEnter={() => setSelectedIndex(index)}
                      >
                        <div style={styles.commandIcon}>{command.actionIcon}</div>
                        <div style={styles.commandContent}>
                          <div style={styles.commandTitle}>
                            {command.type === 'app-action' ? (
                              <HighlightedText text={command.actionLabel} query={queryParts.action} />
                            ) : (
                              <>
                                <HighlightedText text={command.actionLabel} query={queryParts.action} />
                                {': '}
                                <HighlightedText text={command.resourceName!} query={queryParts.name} />
                              </>
                            )}
                          </div>
                          <div style={styles.commandSubtitle}>
                            {command.type === 'resource-action' ? (
                              <>
                                <span style={styles.commandNamespace}>
                                  <HighlightedText text={command.namespace!} query={queryParts.name} />
                                </span>
                                <span style={styles.commandSeparator}>•</span>
                                <span style={styles.commandType}>
                                  <HighlightedText text={command.resourceType!} query={queryParts.type} />
                                </span>
                                {resource?.info && (
                                  <>
                                    <span style={styles.commandSeparator}>•</span>
                                    <span style={styles.commandInfo}>{resource.info}</span>
                                  </>
                                )}
                              </>
                            ) : (
                              <span style={styles.commandType}>Application</span>
                            )}
                          </div>
                          <div style={styles.commandAction}>
                            {command.actionDescription}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div style={styles.noResults}>No commands found</div>
            )}
          </div>
        )}

        {/* Instructions */}
        {!searchQuery && (
          <div style={styles.instructionsContainer}>
            <div style={styles.instructionsTitle}>🎯 Quick Command Search</div>
            <div style={styles.instructionsGrid}>
              <div style={styles.instructionSection}>
                <div style={styles.sectionTitle}>Search by Resource</div>
                <div style={styles.exampleItem}>
                  <code style={styles.exampleCode}>pod:nginx</code>
                  <span style={styles.exampleDesc}>All actions for nginx pods</span>
                </div>
                <div style={styles.exampleItem}>
                  <code style={styles.exampleCode}>deploy:api</code>
                  <span style={styles.exampleDesc}>All actions for api deployments</span>
                </div>
              </div>
              
              <div style={styles.instructionSection}>
                <div style={styles.sectionTitle}>Quick Actions</div>
                <div style={styles.exampleItem}>
                  <code style={styles.exampleCode}>logs@nginx</code>
                  <span style={styles.exampleDesc}>Logs for nginx resources</span>
                </div>
                <div style={styles.exampleItem}>
                  <code style={styles.exampleCode}>exec@pod:api</code>
                  <span style={styles.exampleDesc}>Exec into api pods</span>
                </div>
                <div style={styles.exampleItem}>
                  <code style={styles.exampleCode}>@logs</code>
                  <span style={styles.exampleDesc}>All logs actions</span>
                </div>
              </div>
              
              <div style={styles.instructionSection}>
                <div style={styles.sectionTitle}>Combine Filters</div>
                <div style={styles.exampleItem}>
                  <code style={styles.exampleCode}>logs@pod:nginx</code>
                  <span style={styles.exampleDesc}>Logs for nginx pods</span>
                </div>
                <div style={styles.exampleItem}>
                  <code style={styles.exampleCode}>scale@deploy:api</code>
                  <span style={styles.exampleDesc}>Scale api deployments</span>
                </div>
                <div style={styles.exampleItem}>
                  <code style={styles.exampleCode}>edit@cron:backup</code>
                  <span style={styles.exampleDesc}>Edit backup cronjobs</span>
                </div>
              </div>
            </div>
            <div style={styles.instructionsTip}>
              💡 <strong>Tip:</strong> Just type any keyword to search everywhere • Press <kbd style={styles.kbd}>Esc</kbd> to close
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
  commandItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '8px 12px',
    borderRadius: '3px',
    marginBottom: '1px',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  commandItemSelected: {
    backgroundColor: '#094771',
    border: '1px solid #0e639c',
    marginLeft: '-1px',
    marginRight: '-1px',
    paddingLeft: '13px',
    paddingRight: '13px',
  },
  commandIcon: {
    fontSize: '16px',
    flexShrink: 0,
    width: '20px',
    textAlign: 'center',
  },
  commandContent: {
    flex: 1,
    minWidth: 0,
  },
  commandTitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#cccccc',
    marginBottom: '2px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  commandSubtitle: {
    fontSize: '11px',
    color: '#858585',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  commandNamespace: {
    color: '#4ec9b0',
    fontFamily: 'monospace',
  },
  commandType: {
    color: '#858585',
    textTransform: 'capitalize',
  },
  commandDescription: {
    color: '#858585',
  },
  commandSeparator: {
    color: '#3e3e42',
  },
  commandInfo: {
    color: '#858585',
    fontSize: '10px',
  },
  commandAction: {
    fontSize: '10px',
    color: '#6a9955',
    marginTop: '2px',
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
  instructionsContainer: {
    padding: '20px',
    backgroundColor: '#1e1e1e',
  },
  instructionsTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#cccccc',
    marginBottom: '16px',
    textAlign: 'center',
  },
  instructionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '16px',
  },
  instructionSection: {
    backgroundColor: '#252526',
    padding: '12px',
    borderRadius: '4px',
    border: '1px solid #3e3e42',
  },
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#858585',
    textTransform: 'uppercase',
    marginBottom: '8px',
    letterSpacing: '0.5px',
  },
  exampleItem: {
    marginBottom: '6px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  exampleCode: {
    padding: '3px 6px',
    backgroundColor: '#3c3c3c',
    border: '1px solid #3e3e42',
    borderRadius: '3px',
    fontFamily: 'monospace',
    fontSize: '11px',
    color: '#4ec9b0',
    display: 'inline-block',
  },
  exampleDesc: {
    fontSize: '10px',
    color: '#858585',
    marginLeft: '2px',
  },
  instructionsTip: {
    fontSize: '11px',
    color: '#858585',
    textAlign: 'center',
    padding: '12px',
    backgroundColor: '#252526',
    borderRadius: '4px',
    border: '1px solid #3e3e42',
  },
  kbd: {
    padding: '2px 6px',
    backgroundColor: '#3c3c3c',
    border: '1px solid #3e3e42',
    borderRadius: '3px',
    fontFamily: 'monospace',
    fontSize: '10px',
    color: '#cccccc',
  },
};
