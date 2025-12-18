# Kubectl Command Palette Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a dedicated Ctrl+K command palette for common kubectl commands with preview dialog and namespace selection.

**Architecture:** Create a new `KubectlPalette` component with command definitions in a separate module. Integrate with existing terminal and namespace state via props from `renderer.tsx`. Use localStorage for tracking recent commands.

**Tech Stack:** React, TypeScript, existing styling patterns from CommandPalette

---

## Task 1: Create Quick Command Definitions

**Files:**
- Create: `src/commands/quickCommands.ts`

**Step 1: Create the commands module**

```typescript
// src/commands/quickCommands.ts

export interface QuickCommand {
  id: string;
  label: string;
  icon: string;
  category: 'resources' | 'cluster' | 'debugging';
  description: string;
  /** Whether this command requires a namespace */
  namespaced: boolean;
  /** Generate the kubectl command */
  getCommand: (namespace?: string) => string;
}

export const QUICK_COMMANDS: QuickCommand[] = [
  // Resources
  {
    id: 'list-pods',
    label: 'List Pods',
    icon: '📦',
    category: 'resources',
    description: 'List all pods in namespace',
    namespaced: true,
    getCommand: (ns) => `kubectl get pods -n ${ns}`,
  },
  {
    id: 'list-deployments',
    label: 'List Deployments',
    icon: '🚀',
    category: 'resources',
    description: 'List all deployments in namespace',
    namespaced: true,
    getCommand: (ns) => `kubectl get deployments -n ${ns}`,
  },
  {
    id: 'list-services',
    label: 'List Services',
    icon: '🌐',
    category: 'resources',
    description: 'List all services in namespace',
    namespaced: true,
    getCommand: (ns) => `kubectl get services -n ${ns}`,
  },
  {
    id: 'list-secrets',
    label: 'List Secrets',
    icon: '🔐',
    category: 'resources',
    description: 'List all secrets in namespace',
    namespaced: true,
    getCommand: (ns) => `kubectl get secrets -n ${ns}`,
  },
  {
    id: 'list-configmaps',
    label: 'List ConfigMaps',
    icon: '📄',
    category: 'resources',
    description: 'List all configmaps in namespace',
    namespaced: true,
    getCommand: (ns) => `kubectl get configmaps -n ${ns}`,
  },
  {
    id: 'list-ingresses',
    label: 'List Ingresses',
    icon: '🌍',
    category: 'resources',
    description: 'List all ingresses in namespace',
    namespaced: true,
    getCommand: (ns) => `kubectl get ingresses -n ${ns}`,
  },
  // Cluster
  {
    id: 'get-nodes',
    label: 'Get Nodes',
    icon: '🖥️',
    category: 'cluster',
    description: 'List all cluster nodes',
    namespaced: false,
    getCommand: () => 'kubectl get nodes',
  },
  {
    id: 'cluster-info',
    label: 'Cluster Info',
    icon: '📊',
    category: 'cluster',
    description: 'Display cluster information',
    namespaced: false,
    getCommand: () => 'kubectl cluster-info',
  },
  {
    id: 'get-namespaces',
    label: 'Get Namespaces',
    icon: '📁',
    category: 'cluster',
    description: 'List all namespaces',
    namespaced: false,
    getCommand: () => 'kubectl get namespaces',
  },
  // Debugging
  {
    id: 'view-events',
    label: 'View Events',
    icon: '📋',
    category: 'debugging',
    description: 'View recent events in namespace',
    namespaced: true,
    getCommand: (ns) => `kubectl get events -n ${ns} --sort-by='.lastTimestamp'`,
  },
  {
    id: 'top-pods',
    label: 'Top Pods',
    icon: '📈',
    category: 'debugging',
    description: 'Show pod resource usage',
    namespaced: true,
    getCommand: (ns) => `kubectl top pods -n ${ns}`,
  },
  {
    id: 'top-nodes',
    label: 'Top Nodes',
    icon: '📉',
    category: 'debugging',
    description: 'Show node resource usage',
    namespaced: false,
    getCommand: () => 'kubectl top nodes',
  },
];

/** Get commands sorted with recent first */
export function getCommandsWithRecent(): QuickCommand[] {
  const recentIds = getRecentCommandIds();
  const recentCommands = recentIds
    .map(id => QUICK_COMMANDS.find(c => c.id === id))
    .filter((c): c is QuickCommand => c !== undefined);

  const otherCommands = QUICK_COMMANDS.filter(c => !recentIds.includes(c.id));

  return [...recentCommands, ...otherCommands];
}

const RECENT_COMMANDS_KEY = 'kubecli-recent-commands';
const MAX_RECENT = 5;

export function getRecentCommandIds(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_COMMANDS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function addRecentCommand(commandId: string): void {
  const recent = getRecentCommandIds().filter(id => id !== commandId);
  recent.unshift(commandId);
  localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}
```

**Step 2: Commit**

```bash
git add src/commands/quickCommands.ts
git commit -m "feat: add quick command definitions for kubectl palette"
```

---

## Task 2: Create KubectlPalette Component - Basic Structure

**Files:**
- Create: `src/components/KubectlPalette.tsx`

**Step 1: Create the component with search and list**

```typescript
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

  // Get commands with recent first
  const allCommands = useMemo(() => getCommandsWithRecent(), []);
  const recentIds = useMemo(() => getRecentCommandIds(), []);

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
```

**Step 2: Commit**

```bash
git add src/components/KubectlPalette.tsx
git commit -m "feat: add KubectlPalette component with search and preview"
```

---

## Task 3: Integrate KubectlPalette into App

**Files:**
- Modify: `src/renderer.tsx`

**Step 1: Add import and state for kubectl palette**

In `src/renderer.tsx`, add import at line 12:

```typescript
import { KubectlPalette } from './components/KubectlPalette';
import { addRecentCommand } from './commands/quickCommands';
```

**Step 2: Add state for kubectl palette**

After line 38 (`isCommandPaletteOpen` state), add:

```typescript
const [isKubectlPaletteOpen, setIsKubectlPaletteOpen] = useState<boolean>(false);
```

**Step 3: Add keyboard shortcut for Ctrl+K**

Modify the keyboard handler around line 71-81. Replace the existing `useEffect` with:

```typescript
// Keyboard shortcuts: Ctrl+Shift+P for command palette, Ctrl+K for kubectl palette
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl+Shift+P or Cmd+Shift+P (Mac) - Resource Command Palette
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
      e.preventDefault();
      setIsCommandPaletteOpen(true);
    }
    // Ctrl+K or Cmd+K - Kubectl Command Palette
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      setIsKubectlPaletteOpen(true);
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);
```

**Step 4: Add handler for executing kubectl commands**

After the `handlePromptCancel` callback (around line 237), add:

```typescript
// Handle kubectl palette command execution
const handleKubectlCommand = useCallback((command: string) => {
  // Extract command ID from the command for recent tracking
  // This is a simple approach - match against known patterns
  if (command.includes('get pods')) addRecentCommand('list-pods');
  else if (command.includes('get deployments')) addRecentCommand('list-deployments');
  else if (command.includes('get services')) addRecentCommand('list-services');
  else if (command.includes('get secrets')) addRecentCommand('list-secrets');
  else if (command.includes('get configmaps')) addRecentCommand('list-configmaps');
  else if (command.includes('get ingresses')) addRecentCommand('list-ingresses');
  else if (command.includes('get nodes')) addRecentCommand('get-nodes');
  else if (command.includes('cluster-info')) addRecentCommand('cluster-info');
  else if (command.includes('get namespaces')) addRecentCommand('get-namespaces');
  else if (command.includes('get events')) addRecentCommand('view-events');
  else if (command.includes('top pods')) addRecentCommand('top-pods');
  else if (command.includes('top nodes')) addRecentCommand('top-nodes');

  // Ensure terminal is visible and send command
  if (!showTerminal) {
    setShowTerminal(true);
  }
  setPendingCommand(command);
}, [showTerminal]);
```

**Step 5: Add KubectlPalette component to render**

After the CommandPalette component (around line 331), add:

```typescript
{/* Kubectl Command Palette */}
<KubectlPalette
  isOpen={isKubectlPaletteOpen}
  onClose={() => setIsKubectlPaletteOpen(false)}
  onExecute={handleKubectlCommand}
  currentNamespace={selectedNamespace}
  namespaces={namespaces}
/>
```

**Step 6: Commit**

```bash
git add src/renderer.tsx
git commit -m "feat: integrate KubectlPalette with Ctrl+K shortcut"
```

---

## Task 4: Create Index Export for Commands

**Files:**
- Create: `src/commands/index.ts`

**Step 1: Create the index file**

```typescript
// src/commands/index.ts

export {
  QuickCommand,
  QUICK_COMMANDS,
  getCommandsWithRecent,
  getRecentCommandIds,
  addRecentCommand,
} from './quickCommands';
```

**Step 2: Update import in renderer.tsx**

Change the import from:
```typescript
import { addRecentCommand } from './commands/quickCommands';
```
To:
```typescript
import { addRecentCommand } from './commands';
```

**Step 3: Commit**

```bash
git add src/commands/index.ts src/renderer.tsx
git commit -m "refactor: add commands index for cleaner imports"
```

---

## Task 5: Test and Verify

**Step 1: Run the development server**

```bash
npm run dev
```

**Step 2: Manual testing checklist**

1. Press Ctrl+K - kubectl palette should open
2. Type "secret" - should filter to "List Secrets"
3. Arrow down/up - should navigate
4. Press Enter - should show preview dialog with command
5. Change namespace in dropdown - command should update
6. Click Run - command should execute in terminal
7. Press Ctrl+K again - "List Secrets" should appear with "Recent" badge
8. Press Esc - should close palette
9. Ctrl+Shift+P should still open the resource palette (not conflict)

**Step 3: Type check**

```bash
npx tsc --noEmit
```

**Step 4: Final commit if all tests pass**

```bash
git add -A
git commit -m "feat: complete kubectl command palette implementation"
```

---

## Summary

This implementation adds:
1. **Quick command definitions** (`src/commands/quickCommands.ts`) - 12 common kubectl commands
2. **KubectlPalette component** (`src/components/KubectlPalette.tsx`) - searchable palette with preview
3. **Ctrl+K hotkey** - integrated in `renderer.tsx`
4. **Recent commands tracking** - stored in localStorage, shown first with badge
5. **Namespace selection** - editable in preview dialog before running
