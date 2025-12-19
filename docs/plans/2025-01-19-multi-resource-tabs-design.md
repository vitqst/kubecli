# Multi-Resource Tabs Design

## Overview

Add tabbed terminal interface with a collapsible resource panel, allowing users to work with multiple Kubernetes resources simultaneously (e.g., viewing logs from Pod A while describing Deployment B).

## Goals

- View multiple resources at the same time via tabbed terminals
- Quick resource discovery with fuzzy search
- Streamlined sidebar focused on navigation
- Each tab is a full interactive PTY session

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│ [Home] Config: ~/.kube/config                 [RAM: 45MB]  │  header
├──────────┬──────────────────────────────────────────────────┤
│          │ [Terminal] [nginx-abc] [redis-xyz] [+]          │  tab bar
│ Sidebar  ├──────────────────────────────────────────────────┤
│          │                                                  │
│ Context: │              Active Terminal                     │
│ [____▼]  │                                                  │
│          │                                                  │
│ ──────── │                                                  │
│ Pods     │──────────────────────────────────────────────────│  drag handle
│ Deploy   │ [Search pods...]                                 │
│ Services │ nginx-abc123    [Logs] [Desc] [Exec]  ...       │  resource list
│ CronJobs │ redis-xyz789    [Logs] [Desc] [Exec]  ...       │
│ ...      │ mysql-db-0      [Logs] [Desc] [Exec]  ...       │
└──────────┴──────────────────────────────────────────────────┘
```

## Components

### Sidebar (Slim)

- Context selector at top
- List of supported resource types (Pods, Deployments, Services, etc.)
- Clicking a resource type opens the bottom panel with that resource list

### Tab Bar

- Sits between header and terminal content
- Shows open tabs with resource name as label
- "+" button to create blank terminal tab
- Close button (×) on hover (except first tab)
- First "Terminal" tab cannot be closed
- Keyboard: Ctrl+Tab to cycle, Ctrl+W to close

### Bottom Resource Panel

- Collapsible and resizable (drag handle at top)
- Collapsed by default, opens when clicking resource type in sidebar
- Height persisted to localStorage
- Min height: 100px, Max: 50% of terminal area

**Search:**
- Always-visible search bar at top
- Fuzzy search filters as you type
- Clears when switching resource types

**Resource rows:**
- Resource name + inline action buttons
- Inline actions vary by type (e.g., Logs, Describe, Exec for pods)
- "..." button opens context menu with: Delete, Port-forward, Copy name, Edit YAML
- Clicking resource name defaults to "Describe"

## Tab Behavior

**Creation:**
- "+" button creates blank "Terminal" tab
- Inline action (Logs/Describe/Exec) opens new tab with auto-run command
- Tab labeled with resource name

**Duplicate handling:**
- If resource already has open tab, prompt: "Switch to existing tab or open new?"

**State:**
- Each tab has its own PTY session
- Terminal history preserved when switching tabs
- Closing tab kills its PTY session

**Limits:**
- Expected usage: 2-3 tabs
- No scroll/overflow handling needed

## State Structure

```typescript
interface AppState {
  // Existing
  selectedContext: string;
  selectedNamespace: string;

  // Tabs
  tabs: Tab[];
  activeTabId: string;

  // Bottom panel
  bottomPanel: {
    isOpen: boolean;
    height: number;
    selectedResourceType: ResourceType | null;
    searchQuery: string;
  };
}

interface Tab {
  id: string;
  label: string;           // "Terminal" or resource name
  terminalId: string;      // PTY session ID
  resourceRef?: {          // If opened from resource action
    type: ResourceType;
    name: string;
    namespace: string;
  };
}
```

## Action Flow

When clicking "Logs" on a pod:
1. Check if tab with same resourceRef exists
2. If yes, show "Switch or Open new?" prompt
3. If new tab, create PTY session and run `kubectl logs -f pod-name`
4. Add tab to state, set as active
5. Terminal component renders with new PTY

## Files to Create

```
src/components/
├── tabs/
│   └── TabBar.tsx
├── resource-panel/
│   ├── ResourcePanel.tsx
│   └── ResourceRow.tsx
```

## Files to Modify

- `TerminalScreen.tsx` - Orchestrate TabBar, ResourcePanel, multiple terminals
- `Terminal.tsx` - Support multiple instances with unique IDs
- `TerminalSidebar.tsx` - Slim down to context selector + resource type list

## Backend

No changes needed. Rust backend already supports multiple PTY sessions via `terminal_create`.

## Out of Scope

- Tab reordering via drag
- Tab pinning
- Split view within tabs
- Saved tab layouts/sessions
