// src/components/KubectlPalette.tsx

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { QuickCommand, getCommandsWithRecent, getRecentCommandIds } from '../commands/quickCommands';

interface KubectlPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onExecute: (command: string) => void;
  currentNamespace: string;
  namespaces: string[];
}

export function KubectlPalette({
  isOpen,
  onClose,
  onExecute,
  currentNamespace,
  namespaces,
}: KubectlPaletteProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedCommand, setSelectedCommand] = useState<QuickCommand | null>(null);
  const [previewNamespace, setPreviewNamespace] = useState(currentNamespace);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Get commands with recent first (recalculate when palette opens)
  const allCommands = useMemo(() => getCommandsWithRecent(), [isOpen]);
  const recentIds = useMemo(() => getRecentCommandIds(), [isOpen]);

  // Filter commands by search
  const filteredCommands = useMemo(() => {
    if (!searchQuery.trim()) return allCommands;

    const query = searchQuery.toLowerCase();
    return allCommands.filter(cmd =>
      cmd.label.toLowerCase().includes(query) ||
      cmd.description.toLowerCase().includes(query) ||
      cmd.category.toLowerCase().includes(query)
    );
  }, [searchQuery, allCommands]);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSelectedIndex(0);
      setSelectedCommand(null);
      setPreviewNamespace(currentNamespace);
      searchInputRef.current?.focus();
    }
  }, [isOpen, currentNamespace]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedCommand) {
          setSelectedCommand(null);
        } else {
          onClose();
        }
        return;
      }

      // When in preview mode, only handle Escape
      if (selectedCommand) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < filteredCommands.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
      } else if (e.key === 'Enter' && filteredCommands.length > 0) {
        e.preventDefault();
        setSelectedCommand(filteredCommands[selectedIndex]);
        setPreviewNamespace(currentNamespace);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedCommand, filteredCommands, selectedIndex, currentNamespace, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleCommandClick = (command: QuickCommand) => {
    setSelectedCommand(command);
    setPreviewNamespace(currentNamespace);
  };

  const handleRun = () => {
    if (!selectedCommand) return;

    const command = selectedCommand.namespaced
      ? selectedCommand.getCommand(previewNamespace)
      : selectedCommand.getCommand();

    onExecute(command);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={styles.backdrop} onClick={handleBackdropClick}>
      <style>{`
        .kubectl-palette-results::-webkit-scrollbar {
          width: 10px;
        }
        .kubectl-palette-results::-webkit-scrollbar-track {
          background: #1e1e1e;
        }
        .kubectl-palette-results::-webkit-scrollbar-thumb {
          background: #424242;
          border-radius: 5px;
        }
        .kubectl-command-item:hover {
          background-color: #2a2d2e !important;
        }
      `}</style>

      <div style={styles.container}>
        {/* Search Box */}
        <div style={styles.searchBox}>
          <div style={styles.searchIcon}>⚡</div>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search kubectl commands..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
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

        {/* Preview Dialog */}
        {selectedCommand ? (
          <div style={styles.previewContainer}>
            <div style={styles.previewHeader}>
              <span style={styles.previewIcon}>{selectedCommand.icon}</span>
              <span style={styles.previewTitle}>{selectedCommand.label}</span>
            </div>

            <div style={styles.previewContent}>
              <div style={styles.commandPreview}>
                <code style={styles.commandCode}>
                  {selectedCommand.namespaced
                    ? selectedCommand.getCommand(previewNamespace)
                    : selectedCommand.getCommand()}
                </code>
              </div>

              {selectedCommand.namespaced && (
                <div style={styles.namespaceField}>
                  <label style={styles.namespaceLabel}>Namespace:</label>
                  <select
                    value={previewNamespace}
                    onChange={(e) => setPreviewNamespace(e.target.value)}
                    style={styles.namespaceSelect}
                  >
                    {namespaces.map(ns => (
                      <option key={ns} value={ns}>{ns}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div style={styles.previewFooter}>
              <button
                onClick={() => setSelectedCommand(null)}
                style={styles.cancelButton}
              >
                Cancel
              </button>
              <button onClick={handleRun} style={styles.runButton}>
                Run
              </button>
            </div>
          </div>
        ) : (
          /* Command List */
          <div className="kubectl-palette-results" style={styles.resultsContainer}>
            {filteredCommands.length > 0 ? (
              <div style={styles.resultsList}>
                {filteredCommands.map((command, index) => {
                  const isRecent = recentIds.includes(command.id);
                  const isSelected = index === selectedIndex;

                  return (
                    <div
                      key={command.id}
                      className="kubectl-command-item"
                      style={{
                        ...styles.commandItem,
                        ...(isSelected ? styles.commandItemSelected : {}),
                      }}
                      onClick={() => handleCommandClick(command)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <div style={styles.commandIcon}>{command.icon}</div>
                      <div style={styles.commandContent}>
                        <div style={styles.commandLabel}>
                          {command.label}
                          {isRecent && <span style={styles.recentBadge}>Recent</span>}
                        </div>
                        <div style={styles.commandDescription}>
                          {command.description}
                        </div>
                      </div>
                      <div style={styles.commandCategory}>{command.category}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={styles.noResults}>No commands found</div>
            )}
          </div>
        )}

        {/* Footer hint */}
        {!selectedCommand && (
          <div style={styles.footer}>
            <span style={styles.footerHint}>
              <kbd style={styles.kbd}>↑↓</kbd> Navigate
              <kbd style={styles.kbd}>Enter</kbd> Select
              <kbd style={styles.kbd}>Esc</kbd> Close
            </span>
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
  },
  container: {
    width: '500px',
    maxWidth: '90vw',
    backgroundColor: '#252526',
    borderRadius: '8px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
    overflow: 'hidden',
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
    color: '#dcdcaa',
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
    maxHeight: '400px',
    overflowY: 'auto',
  },
  resultsList: {
    padding: '8px',
  },
  commandItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  commandItemSelected: {
    backgroundColor: '#094771',
  },
  commandIcon: {
    fontSize: '18px',
    width: '24px',
    textAlign: 'center',
  },
  commandContent: {
    flex: 1,
    minWidth: 0,
  },
  commandLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#cccccc',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  recentBadge: {
    fontSize: '10px',
    padding: '2px 6px',
    backgroundColor: '#4ec9b0',
    color: '#1e1e1e',
    borderRadius: '3px',
    fontWeight: 600,
  },
  commandDescription: {
    fontSize: '12px',
    color: '#858585',
    marginTop: '2px',
  },
  commandCategory: {
    fontSize: '11px',
    color: '#858585',
    textTransform: 'capitalize',
    padding: '2px 8px',
    backgroundColor: '#3c3c3c',
    borderRadius: '3px',
  },
  noResults: {
    padding: '32px 16px',
    textAlign: 'center',
    color: '#858585',
    fontSize: '13px',
  },
  footer: {
    padding: '10px 16px',
    borderTop: '1px solid #3e3e42',
    backgroundColor: '#2d2d30',
  },
  footerHint: {
    fontSize: '11px',
    color: '#858585',
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  kbd: {
    padding: '2px 6px',
    backgroundColor: '#3c3c3c',
    border: '1px solid #3e3e42',
    borderRadius: '3px',
    fontFamily: 'monospace',
    fontSize: '10px',
    color: '#cccccc',
    marginRight: '4px',
  },
  // Preview styles
  previewContainer: {
    padding: '16px',
  },
  previewHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  previewIcon: {
    fontSize: '24px',
  },
  previewTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#cccccc',
  },
  previewContent: {
    marginBottom: '16px',
  },
  commandPreview: {
    padding: '12px',
    backgroundColor: '#1e1e1e',
    borderRadius: '4px',
    border: '1px solid #3e3e42',
    marginBottom: '12px',
  },
  commandCode: {
    fontFamily: 'monospace',
    fontSize: '13px',
    color: '#4ec9b0',
    wordBreak: 'break-all',
  },
  namespaceField: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  namespaceLabel: {
    fontSize: '13px',
    color: '#cccccc',
    fontWeight: 500,
  },
  namespaceSelect: {
    flex: 1,
    padding: '8px 12px',
    fontSize: '14px',
    backgroundColor: '#3c3c3c',
    border: '1px solid #3e3e42',
    borderRadius: '4px',
    color: '#cccccc',
    outline: 'none',
    cursor: 'pointer',
  },
  previewFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  cancelButton: {
    padding: '8px 16px',
    fontSize: '14px',
    backgroundColor: '#3c3c3c',
    color: '#cccccc',
    border: '1px solid #3e3e42',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  runButton: {
    padding: '8px 16px',
    fontSize: '14px',
    backgroundColor: '#0e639c',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 500,
  },
};
