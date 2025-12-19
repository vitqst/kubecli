# Multi-Resource Tabs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add tabbed terminal interface with collapsible resource panel for working with multiple Kubernetes resources simultaneously.

**Architecture:** Create a tab management system where each tab owns a PTY terminal session. Add a resizable bottom panel for browsing resources with fuzzy search. Slim down the sidebar to just context selector and resource type navigation.

**Tech Stack:** React 19, TypeScript, xterm.js, Tauri (existing PTY backend)

---

## Task 1: Create Tab Types and State Hook

**Files:**
- Create: `src/hooks/useTabs.ts`

**Step 1: Create the useTabs hook with types and state management**

```typescript
// src/hooks/useTabs.ts
import { useState, useCallback } from 'react';
import { ResourceType } from '../resources';

export interface Tab {
  id: string;
  label: string;
  resourceRef?: {
    type: ResourceType;
    name: string;
    namespace: string;
    action: string;
  };
}

interface UseTabsResult {
  tabs: Tab[];
  activeTabId: string;
  addTab: (tab: Omit<Tab, 'id'>) => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  findTabByResource: (type: ResourceType, name: string, namespace: string) => Tab | undefined;
}

let tabIdCounter = 0;
function generateTabId(): string {
  return `tab_${++tabIdCounter}_${Date.now()}`;
}

export function useTabs(): UseTabsResult {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: 'default', label: 'Terminal' }
  ]);
  const [activeTabId, setActiveTabId] = useState('default');

  const addTab = useCallback((tab: Omit<Tab, 'id'>): string => {
    const id = generateTabId();
    const newTab: Tab = { ...tab, id };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
    return id;
  }, []);

  const closeTab = useCallback((id: string) => {
    if (id === 'default') return; // Cannot close default tab

    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== id);
      return newTabs;
    });

    setActiveTabId(prev => {
      if (prev === id) {
        // Switch to previous tab or default
        const currentIndex = tabs.findIndex(t => t.id === id);
        const newIndex = Math.max(0, currentIndex - 1);
        return tabs[newIndex]?.id || 'default';
      }
      return prev;
    });
  }, [tabs]);

  const findTabByResource = useCallback((
    type: ResourceType,
    name: string,
    namespace: string
  ): Tab | undefined => {
    return tabs.find(t =>
      t.resourceRef?.type === type &&
      t.resourceRef?.name === name &&
      t.resourceRef?.namespace === namespace
    );
  }, [tabs]);

  return {
    tabs,
    activeTabId,
    addTab,
    closeTab,
    setActiveTab: setActiveTabId,
    findTabByResource,
  };
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /home/dev/WorkSpace/vit/kubecli/.worktrees/multi-resource-tabs && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/hooks/useTabs.ts
git commit -m "feat: add useTabs hook for tab state management"
```

---

## Task 2: Create TabBar Component

**Files:**
- Create: `src/components/tabs/TabBar.tsx`

**Step 1: Create the TabBar component**

```typescript
// src/components/tabs/TabBar.tsx
import React from 'react';
import { Tab } from '../../hooks/useTabs';

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
  onAddTab: () => void;
}

export function TabBar({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onAddTab,
}: TabBarProps) {
  return (
    <div style={styles.tabBar}>
      {tabs.map(tab => (
        <div
          key={tab.id}
          style={{
            ...styles.tab,
            ...(tab.id === activeTabId ? styles.activeTab : {}),
          }}
          onClick={() => onTabClick(tab.id)}
        >
          <span style={styles.tabLabel}>{tab.label}</span>
          {tab.id !== 'default' && (
            <button
              style={styles.closeButton}
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
              title="Close tab"
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button
        style={styles.addButton}
        onClick={onAddTab}
        title="New terminal tab"
      >
        +
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  tabBar: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: '#252526',
    borderBottom: '1px solid #3e3e42',
    padding: '0 8px',
    height: '36px',
    gap: '2px',
    flexShrink: 0,
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    backgroundColor: '#2d2d2d',
    border: '1px solid transparent',
    borderBottom: 'none',
    borderRadius: '4px 4px 0 0',
    cursor: 'pointer',
    color: '#858585',
    fontSize: '12px',
    maxWidth: '150px',
    transition: 'background-color 0.15s',
  },
  activeTab: {
    backgroundColor: '#1e1e1e',
    color: '#cccccc',
    borderColor: '#3e3e42',
  },
  tabLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px',
    padding: 0,
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '2px',
    color: '#858585',
    fontSize: '14px',
    cursor: 'pointer',
    lineHeight: 1,
  },
  addButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    padding: 0,
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '4px',
    color: '#858585',
    fontSize: '18px',
    cursor: 'pointer',
    marginLeft: '4px',
  },
};
```

**Step 2: Verify TypeScript compiles**

Run: `cd /home/dev/WorkSpace/vit/kubecli/.worktrees/multi-resource-tabs && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/tabs/TabBar.tsx
git commit -m "feat: add TabBar component"
```

---

## Task 3: Create ResourcePanel Component

**Files:**
- Create: `src/components/resource-panel/ResourcePanel.tsx`

**Step 1: Create the ResourcePanel component with search and resizing**

```typescript
// src/components/resource-panel/ResourcePanel.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ResourceType, getAllResources, getFavoriteActions } from '../../resources';
import { useResourceCache } from '../../contexts/ResourceCacheContext';

interface ResourcePanelProps {
  isOpen: boolean;
  selectedResourceType: ResourceType | null;
  namespace: string;
  onAction: (actionId: string, resourceType: ResourceType, resourceName: string, namespace: string) => void;
  onClose: () => void;
}

const MIN_HEIGHT = 100;
const MAX_HEIGHT_PERCENT = 0.5;
const DEFAULT_HEIGHT = 200;

export function ResourcePanel({
  isOpen,
  selectedResourceType,
  namespace,
  onAction,
  onClose,
}: ResourcePanelProps) {
  const [height, setHeight] = useState(() => {
    const saved = localStorage.getItem('resourcePanelHeight');
    return saved ? parseInt(saved, 10) : DEFAULT_HEIGHT;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { filterByNamespace, filterByType, isLoading } = useResourceCache();

  // Get resources based on selected type
  const resources = React.useMemo(() => {
    if (!selectedResourceType) return [];

    // CronJobs are cluster-wide, others are namespace-scoped
    if (selectedResourceType === 'cronjob') {
      return filterByType('cronjob');
    }
    return filterByNamespace(namespace).filter(r => r.type === selectedResourceType);
  }, [selectedResourceType, namespace, filterByNamespace, filterByType]);

  // Filter by search query (fuzzy)
  const filteredResources = React.useMemo(() => {
    if (!searchQuery.trim()) return resources;
    const query = searchQuery.toLowerCase();
    return resources.filter(r => r.name.toLowerCase().includes(query));
  }, [resources, searchQuery]);

  // Handle resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!panelRef.current) return;
      const containerRect = panelRef.current.parentElement?.getBoundingClientRect();
      if (!containerRect) return;

      const maxHeight = containerRect.height * MAX_HEIGHT_PERCENT;
      const newHeight = containerRect.bottom - e.clientY;
      const clampedHeight = Math.min(maxHeight, Math.max(MIN_HEIGHT, newHeight));
      setHeight(clampedHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem('resourcePanelHeight', height.toString());
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, height]);

  // Clear search when resource type changes
  useEffect(() => {
    setSearchQuery('');
  }, [selectedResourceType]);

  if (!isOpen || !selectedResourceType) return null;

  const resourceDef = getAllResources().find(r => r.type === selectedResourceType);
  const title = resourceDef?.pluralName || selectedResourceType;

  return (
    <div ref={panelRef} style={{ ...styles.panel, height }}>
      {/* Resize handle */}
      <div
        style={styles.resizeHandle}
        onMouseDown={handleMouseDown}
      />

      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>{title}</span>
        <input
          type="text"
          placeholder={`Search ${title.toLowerCase()}...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={styles.searchInput}
        />
        <button style={styles.closeButton} onClick={onClose} title="Close panel">
          ×
        </button>
      </div>

      {/* Resource list */}
      <div style={styles.list}>
        {isLoading ? (
          <div style={styles.loading}>Loading...</div>
        ) : filteredResources.length === 0 ? (
          <div style={styles.empty}>
            {searchQuery ? 'No matching resources' : 'No resources found'}
          </div>
        ) : (
          filteredResources.map(resource => {
            const context = {
              resourceName: resource.name,
              namespace: resource.namespace,
              resourceType: selectedResourceType,
            };
            const actions = getFavoriteActions(selectedResourceType, context);

            return (
              <div key={`${resource.namespace}/${resource.name}`} style={styles.row}>
                <span style={styles.resourceName}>{resource.name}</span>
                <div style={styles.actions}>
                  {actions.slice(0, 3).map(action => (
                    <button
                      key={action.id}
                      style={styles.actionButton}
                      onClick={() => onAction(action.id, selectedResourceType, resource.name, resource.namespace)}
                      title={action.description}
                    >
                      {action.label}
                    </button>
                  ))}
                  <button style={styles.moreButton} title="More actions">
                    ⋮
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'relative',
    backgroundColor: '#252526',
    borderTop: '1px solid #3e3e42',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  resizeHandle: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '4px',
    cursor: 'ns-resize',
    backgroundColor: 'transparent',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 12px',
    borderBottom: '1px solid #3e3e42',
    flexShrink: 0,
  },
  title: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#cccccc',
    textTransform: 'uppercase',
  },
  searchInput: {
    flex: 1,
    padding: '4px 8px',
    fontSize: '12px',
    backgroundColor: '#3c3c3c',
    border: '1px solid #3e3e42',
    borderRadius: '4px',
    color: '#cccccc',
    outline: 'none',
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '20px',
    padding: 0,
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '4px',
    color: '#858585',
    fontSize: '16px',
    cursor: 'pointer',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 0',
  },
  loading: {
    padding: '16px',
    textAlign: 'center',
    color: '#858585',
    fontSize: '12px',
  },
  empty: {
    padding: '16px',
    textAlign: 'center',
    color: '#858585',
    fontSize: '12px',
    fontStyle: 'italic',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px',
    cursor: 'pointer',
  },
  resourceName: {
    fontSize: '12px',
    color: '#cccccc',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  actions: {
    display: 'flex',
    gap: '4px',
  },
  actionButton: {
    padding: '2px 8px',
    fontSize: '11px',
    backgroundColor: '#3c3c3c',
    border: '1px solid #3e3e42',
    borderRadius: '3px',
    color: '#cccccc',
    cursor: 'pointer',
  },
  moreButton: {
    padding: '2px 6px',
    fontSize: '14px',
    backgroundColor: 'transparent',
    border: 'none',
    color: '#858585',
    cursor: 'pointer',
  },
};
```

**Step 2: Verify TypeScript compiles**

Run: `cd /home/dev/WorkSpace/vit/kubecli/.worktrees/multi-resource-tabs && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/resource-panel/ResourcePanel.tsx
git commit -m "feat: add ResourcePanel component with search and resize"
```

---

## Task 4: Create Slim Sidebar Component

**Files:**
- Create: `src/components/sidebar/SlimSidebar.tsx`

**Step 1: Create the SlimSidebar with context selector and resource type navigation**

```typescript
// src/components/sidebar/SlimSidebar.tsx
import React from 'react';
import { ResourceType, getAllResources } from '../../resources';
import { Select } from '../common/Select';

interface SlimSidebarProps {
  selectedContext: string;
  contexts: Array<{ name: string; cluster?: string }>;
  selectedResourceType: ResourceType | null;
  onContextChange: (context: string) => void;
  onResourceTypeClick: (type: ResourceType) => void;
}

const RESOURCE_ICONS: Record<ResourceType, string> = {
  pod: '📦',
  deployment: '🚀',
  service: '🌐',
  job: '⚡',
  cronjob: '⏰',
  statefulset: '📊',
  daemonset: '👹',
  configmap: '📝',
  secret: '🔐',
  ingress: '🚪',
};

export function SlimSidebar({
  selectedContext,
  contexts,
  selectedResourceType,
  onContextChange,
  onResourceTypeClick,
}: SlimSidebarProps) {
  const resources = getAllResources();

  return (
    <div style={styles.sidebar}>
      {/* Context Selector */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Context</div>
        <Select
          value={selectedContext}
          onChange={onContextChange}
          options={contexts.map(ctx => ({
            value: ctx.name,
            label: ctx.name,
          }))}
        />
      </div>

      {/* Resource Types */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Resources</div>
        <div style={styles.resourceList}>
          {resources.map(resource => (
            <button
              key={resource.type}
              style={{
                ...styles.resourceButton,
                ...(selectedResourceType === resource.type ? styles.activeResource : {}),
              }}
              onClick={() => onResourceTypeClick(resource.type)}
            >
              <span style={styles.resourceIcon}>
                {RESOURCE_ICONS[resource.type] || '📄'}
              </span>
              <span style={styles.resourceLabel}>{resource.pluralName}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: '160px',
    height: '100%',
    backgroundColor: '#252526',
    borderRight: '1px solid #3e3e42',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    padding: '12px',
    gap: '16px',
    overflowY: 'auto',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sectionTitle: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#858585',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  resourceList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  resourceButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    color: '#cccccc',
    fontSize: '12px',
    textAlign: 'left',
    transition: 'background-color 0.15s',
  },
  activeResource: {
    backgroundColor: '#094771',
  },
  resourceIcon: {
    fontSize: '14px',
  },
  resourceLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};
```

**Step 2: Verify TypeScript compiles**

Run: `cd /home/dev/WorkSpace/vit/kubecli/.worktrees/multi-resource-tabs && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/sidebar/SlimSidebar.tsx
git commit -m "feat: add SlimSidebar component with context and resource nav"
```

---

## Task 5: Create DuplicateTabDialog Component

**Files:**
- Create: `src/components/tabs/DuplicateTabDialog.tsx`

**Step 1: Create the dialog for handling duplicate tab prompts**

```typescript
// src/components/tabs/DuplicateTabDialog.tsx
import React from 'react';

interface DuplicateTabDialogProps {
  resourceName: string;
  onSwitch: () => void;
  onOpenNew: () => void;
  onCancel: () => void;
}

export function DuplicateTabDialog({
  resourceName,
  onSwitch,
  onOpenNew,
  onCancel,
}: DuplicateTabDialogProps) {
  return (
    <div style={styles.overlay} onClick={onCancel}>
      <div style={styles.dialog} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>Tab Already Open</h3>
        </div>
        <div style={styles.content}>
          <p style={styles.message}>
            A tab for <strong>{resourceName}</strong> is already open.
          </p>
          <p style={styles.question}>What would you like to do?</p>
        </div>
        <div style={styles.footer}>
          <button style={styles.cancelButton} onClick={onCancel}>
            Cancel
          </button>
          <button style={styles.switchButton} onClick={onSwitch}>
            Switch to Tab
          </button>
          <button style={styles.newButton} onClick={onOpenNew}>
            Open New
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10001,
  },
  dialog: {
    backgroundColor: '#252526',
    border: '1px solid #454545',
    borderRadius: '6px',
    minWidth: '360px',
    maxWidth: '450px',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)',
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid #3e3e42',
  },
  title: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 600,
    color: '#cccccc',
  },
  content: {
    padding: '16px 20px',
  },
  message: {
    margin: '0 0 8px 0',
    color: '#cccccc',
    fontSize: '13px',
  },
  question: {
    margin: 0,
    color: '#858585',
    fontSize: '12px',
  },
  footer: {
    padding: '12px 20px',
    borderTop: '1px solid #3e3e42',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  },
  cancelButton: {
    padding: '6px 12px',
    fontSize: '12px',
    backgroundColor: 'transparent',
    color: '#cccccc',
    border: '1px solid #3e3e42',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  switchButton: {
    padding: '6px 12px',
    fontSize: '12px',
    backgroundColor: '#3c3c3c',
    color: '#cccccc',
    border: '1px solid #3e3e42',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  newButton: {
    padding: '6px 12px',
    fontSize: '12px',
    backgroundColor: '#0e639c',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
};
```

**Step 2: Verify TypeScript compiles**

Run: `cd /home/dev/WorkSpace/vit/kubecli/.worktrees/multi-resource-tabs && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/tabs/DuplicateTabDialog.tsx
git commit -m "feat: add DuplicateTabDialog for handling existing tabs"
```

---

## Task 6: Create useBottomPanel Hook

**Files:**
- Create: `src/hooks/useBottomPanel.ts`

**Step 1: Create the hook for bottom panel state**

```typescript
// src/hooks/useBottomPanel.ts
import { useState, useCallback } from 'react';
import { ResourceType } from '../resources';

interface BottomPanelState {
  isOpen: boolean;
  selectedResourceType: ResourceType | null;
}

interface UseBottomPanelResult {
  isOpen: boolean;
  selectedResourceType: ResourceType | null;
  openPanel: (type: ResourceType) => void;
  closePanel: () => void;
  togglePanel: (type: ResourceType) => void;
}

export function useBottomPanel(): UseBottomPanelResult {
  const [state, setState] = useState<BottomPanelState>({
    isOpen: false,
    selectedResourceType: null,
  });

  const openPanel = useCallback((type: ResourceType) => {
    setState({ isOpen: true, selectedResourceType: type });
  }, []);

  const closePanel = useCallback(() => {
    setState({ isOpen: false, selectedResourceType: null });
  }, []);

  const togglePanel = useCallback((type: ResourceType) => {
    setState(prev => {
      if (prev.isOpen && prev.selectedResourceType === type) {
        return { isOpen: false, selectedResourceType: null };
      }
      return { isOpen: true, selectedResourceType: type };
    });
  }, []);

  return {
    isOpen: state.isOpen,
    selectedResourceType: state.selectedResourceType,
    openPanel,
    closePanel,
    togglePanel,
  };
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd /home/dev/WorkSpace/vit/kubecli/.worktrees/multi-resource-tabs && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/hooks/useBottomPanel.ts
git commit -m "feat: add useBottomPanel hook for panel state"
```

---

## Task 7: Update TerminalScreen to Integrate All Components

**Files:**
- Modify: `src/components/screens/TerminalScreen.tsx`

**Step 1: Update TerminalScreen with tabs, slim sidebar, and resource panel**

Replace the entire TerminalScreen component:

```typescript
// src/components/screens/TerminalScreen.tsx
import React, { memo, useMemo, useState, useCallback } from 'react';
import { Terminal } from '../Terminal';
import { TabBar } from '../tabs/TabBar';
import { SlimSidebar } from '../sidebar/SlimSidebar';
import { ResourcePanel } from '../resource-panel/ResourcePanel';
import { DuplicateTabDialog } from '../tabs/DuplicateTabDialog';
import { ResourceType, getResourceDefinition } from '../../resources';
import { useTabs, Tab } from '../../hooks/useTabs';
import { useBottomPanel } from '../../hooks/useBottomPanel';

// Memoized Memory Display Component
const MemoryDisplay = memo(() => {
  const [memoryUsage, setMemoryUsage] = React.useState<{ used: number; total: number }>({ used: 0, total: 0 });

  React.useEffect(() => {
    const updateMemory = () => {
      if (performance && (performance as any).memory) {
        const memory = (performance as any).memory;
        setMemoryUsage({
          used: memory.usedJSHeapSize,
          total: memory.jsHeapSizeLimit,
        });
      }
    };

    updateMemory();
    const interval = setInterval(updateMemory, 2000);
    return () => clearInterval(interval);
  }, []);

  if (memoryUsage.total === 0) return null;

  const usedMB = (memoryUsage.used / 1024 / 1024).toFixed(1);
  const totalMB = (memoryUsage.total / 1024 / 1024).toFixed(0);
  const percentage = (memoryUsage.used / memoryUsage.total) * 100;
  const color = percentage > 90 ? '#f48771' : percentage > 70 ? '#dcdcaa' : '#4ec9b0';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '4px 12px',
      backgroundColor: '#1e1e1e',
      borderRadius: '4px',
      border: '1px solid #3e3e42',
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
        <path d="M4 6h16M4 12h16M4 18h16"></path>
      </svg>
      <span style={{
        fontSize: '0.75rem',
        fontFamily: 'monospace',
        fontWeight: 500,
        color,
      }}>
        RAM: {usedMB} / {totalMB} MB ({percentage.toFixed(1)}%)
      </span>
    </div>
  );
});

MemoryDisplay.displayName = 'MemoryDisplay';

interface TerminalScreenProps {
  kubeconfigPath: string;
  availableConfigs: Array<{ path: string; name: string; isDefault: boolean }>;
  selectedContext: string;
  contexts: Array<{ name: string; cluster?: string; user?: string }>;
  selectedNamespace: string;
  namespaces: string[];
  loadingNamespaces: boolean;
  isInEditMode: boolean;
  isConfigChanging: boolean;
  pendingCommand?: string | null;
  onCommandExecuted?: () => void;
  onConfigChange: (path: string) => void;
  onContextChange: (context: string) => void;
  onNamespaceChange: (namespace: string) => void;
  onResourceAction: (actionId: string, resourceType: ResourceType, resourceName: string, customNamespace?: string) => void;
  onEditModeChange: (isEditMode: boolean) => void;
  onGoHome: () => void;
}

interface PendingAction {
  actionId: string;
  resourceType: ResourceType;
  resourceName: string;
  namespace: string;
  existingTab: Tab;
}

export function TerminalScreen({
  kubeconfigPath,
  availableConfigs,
  selectedContext,
  contexts,
  selectedNamespace,
  namespaces,
  loadingNamespaces,
  isInEditMode,
  isConfigChanging,
  pendingCommand,
  onCommandExecuted,
  onConfigChange,
  onContextChange,
  onNamespaceChange,
  onResourceAction,
  onEditModeChange,
  onGoHome,
}: TerminalScreenProps) {
  // Tab management
  const { tabs, activeTabId, addTab, closeTab, setActiveTab, findTabByResource } = useTabs();

  // Bottom panel
  const { isOpen: isPanelOpen, selectedResourceType, openPanel, closePanel, togglePanel } = useBottomPanel();

  // Duplicate tab dialog
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  // Memoize env object
  const terminalEnv = useMemo(() => ({
    KUBECONFIG: kubeconfigPath,
    KUBECTL_NAMESPACE: selectedNamespace
  }), [kubeconfigPath, selectedNamespace]);

  // Handle resource action from panel
  const handleResourceAction = useCallback((
    actionId: string,
    resourceType: ResourceType,
    resourceName: string,
    namespace: string
  ) => {
    // Check if tab already exists
    const existingTab = findTabByResource(resourceType, resourceName, namespace);

    if (existingTab) {
      // Show duplicate dialog
      setPendingAction({ actionId, resourceType, resourceName, namespace, existingTab });
      return;
    }

    // Create new tab
    const resourceDef = getResourceDefinition(resourceType);
    const label = resourceName.length > 20 ? resourceName.substring(0, 17) + '...' : resourceName;

    addTab({
      label,
      resourceRef: { type: resourceType, name: resourceName, namespace, action: actionId },
    });

    // Execute the action in the parent
    onResourceAction(actionId, resourceType, resourceName, namespace);
  }, [findTabByResource, addTab, onResourceAction]);

  // Handle duplicate dialog actions
  const handleSwitchToTab = useCallback(() => {
    if (pendingAction) {
      setActiveTab(pendingAction.existingTab.id);
      setPendingAction(null);
    }
  }, [pendingAction, setActiveTab]);

  const handleOpenNewTab = useCallback(() => {
    if (pendingAction) {
      const { actionId, resourceType, resourceName, namespace } = pendingAction;
      const label = resourceName.length > 20 ? resourceName.substring(0, 17) + '...' : resourceName;

      addTab({
        label,
        resourceRef: { type: resourceType, name: resourceName, namespace, action: actionId },
      });

      onResourceAction(actionId, resourceType, resourceName, namespace);
      setPendingAction(null);
    }
  }, [pendingAction, addTab, onResourceAction]);

  // Add new blank tab
  const handleAddTab = useCallback(() => {
    addTab({ label: 'Terminal' });
  }, [addTab]);

  return (
    <>
      {/* Terminal Top Bar */}
      <header style={styles.terminalHeader}>
        <button
          onClick={onGoHome}
          style={styles.homeIconButton}
          className="home-icon-button"
          title="Go back to home"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
        </button>
        <div style={styles.configPathDisplay}>
          <span style={styles.configLabel}>Config:</span>
          <span style={styles.configPath}>{kubeconfigPath}</span>
        </div>
        <MemoryDisplay />
      </header>

      {/* Main Content */}
      <div style={styles.mainContainer}>
        {/* Slim Sidebar */}
        <SlimSidebar
          selectedContext={selectedContext}
          contexts={contexts}
          selectedResourceType={selectedResourceType}
          onContextChange={onContextChange}
          onResourceTypeClick={togglePanel}
        />

        {/* Terminal Area */}
        <div style={styles.terminalArea}>
          {/* Tab Bar */}
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onTabClick={setActiveTab}
            onTabClose={closeTab}
            onAddTab={handleAddTab}
          />

          {/* Terminal Content */}
          <div style={styles.terminalContent}>
            {/* Terminals - show only active */}
            <div style={styles.terminalWrapper}>
              {tabs.map(tab => (
                <div
                  key={tab.id}
                  style={{
                    ...styles.terminalPane,
                    display: tab.id === activeTabId ? 'flex' : 'none',
                  }}
                >
                  <Terminal
                    id={tab.id}
                    env={terminalEnv}
                    isLoading={isConfigChanging}
                    pendingCommand={tab.id === activeTabId ? pendingCommand : null}
                    onCommandExecuted={onCommandExecuted}
                    onEditModeChange={onEditModeChange}
                  />
                </div>
              ))}
            </div>

            {/* Resource Panel */}
            <ResourcePanel
              isOpen={isPanelOpen}
              selectedResourceType={selectedResourceType}
              namespace={selectedNamespace}
              onAction={handleResourceAction}
              onClose={closePanel}
            />
          </div>
        </div>
      </div>

      {/* Duplicate Tab Dialog */}
      {pendingAction && (
        <DuplicateTabDialog
          resourceName={pendingAction.resourceName}
          onSwitch={handleSwitchToTab}
          onOpenNew={handleOpenNewTab}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  terminalHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '12px 16px',
    backgroundColor: '#252526',
    borderBottom: '1px solid #3e3e42',
    flexShrink: 0,
  },
  homeIconButton: {
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    color: '#cccccc',
    transition: 'background-color 0.2s',
  },
  configPathDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
  },
  configLabel: {
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#858585',
  },
  configPath: {
    fontSize: '0.875rem',
    color: '#4ec9b0',
    fontFamily: 'monospace',
  },
  mainContainer: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  terminalArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  terminalContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  terminalWrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'relative',
  },
  terminalPane: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'column',
  },
};
```

**Step 2: Verify TypeScript compiles**

Run: `cd /home/dev/WorkSpace/vit/kubecli/.worktrees/multi-resource-tabs && npx tsc --noEmit`
Expected: No errors (may need to fix imports)

**Step 3: Fix any import errors**

If there are missing exports, add them:
- Add `export { Tab }` in useTabs.ts if needed
- Add index exports if needed

**Step 4: Commit**

```bash
git add src/components/screens/TerminalScreen.tsx
git commit -m "feat: integrate tabs, slim sidebar, and resource panel"
```

---

## Task 8: Add Keyboard Shortcuts for Tab Navigation

**Files:**
- Modify: `src/components/screens/TerminalScreen.tsx`

**Step 1: Add keyboard event handler for Ctrl+Tab and Ctrl+W**

Add this useEffect in TerminalScreen before the return statement:

```typescript
// Keyboard shortcuts for tabs
React.useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl+Tab - cycle to next tab
    if (e.ctrlKey && e.key === 'Tab') {
      e.preventDefault();
      const currentIndex = tabs.findIndex(t => t.id === activeTabId);
      const nextIndex = e.shiftKey
        ? (currentIndex - 1 + tabs.length) % tabs.length
        : (currentIndex + 1) % tabs.length;
      setActiveTab(tabs[nextIndex].id);
    }

    // Ctrl+W - close current tab (except default)
    if (e.ctrlKey && e.key === 'w') {
      e.preventDefault();
      if (activeTabId !== 'default') {
        closeTab(activeTabId);
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [tabs, activeTabId, setActiveTab, closeTab]);
```

**Step 2: Verify TypeScript compiles**

Run: `cd /home/dev/WorkSpace/vit/kubecli/.worktrees/multi-resource-tabs && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/screens/TerminalScreen.tsx
git commit -m "feat: add keyboard shortcuts for tab navigation"
```

---

## Task 9: Run Full Test Suite

**Step 1: Run all tests**

Run: `cd /home/dev/WorkSpace/vit/kubecli/.worktrees/multi-resource-tabs && npm test`
Expected: All tests pass

**Step 2: Run TypeScript check**

Run: `cd /home/dev/WorkSpace/vit/kubecli/.worktrees/multi-resource-tabs && npx tsc --noEmit`
Expected: No errors

**Step 3: Start dev server and verify manually**

Run: `cd /home/dev/WorkSpace/vit/kubecli/.worktrees/multi-resource-tabs && npm run dev`
Expected: Application starts, new UI visible

---

## Task 10: Final Cleanup and Documentation

**Step 1: Remove old TerminalSidebar import if no longer used**

Check if TerminalSidebar is still imported anywhere. If not used, the old file can remain for reference but won't be imported.

**Step 2: Update CLAUDE.md with new component structure**

Add to the Source Structure section:

```markdown
├── components/
│   ├── tabs/
│   │   ├── TabBar.tsx           # Tab strip component
│   │   └── DuplicateTabDialog.tsx
│   ├── resource-panel/
│   │   └── ResourcePanel.tsx    # Bottom resource browser
│   ├── sidebar/
│   │   ├── SlimSidebar.tsx      # Minimal sidebar with context + resource nav
│   │   └── ...existing files...
```

**Step 3: Commit documentation update**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with new component structure"
```

---

## Summary

**New files created:**
- `src/hooks/useTabs.ts`
- `src/hooks/useBottomPanel.ts`
- `src/components/tabs/TabBar.tsx`
- `src/components/tabs/DuplicateTabDialog.tsx`
- `src/components/resource-panel/ResourcePanel.tsx`
- `src/components/sidebar/SlimSidebar.tsx`

**Files modified:**
- `src/components/screens/TerminalScreen.tsx`
- `CLAUDE.md`

**Total commits:** 10
