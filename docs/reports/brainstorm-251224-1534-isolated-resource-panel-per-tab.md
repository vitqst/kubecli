# Brainstorm: Isolated Resource Panel Per Terminal Tab

**Date:** 2024-12-24
**Status:** Approved
**Author:** Claude (Brainstormer)

---

## Problem Statement

Currently, ResourcePanel is a single shared instance across all terminal tabs. When user opens ResourcePanel in Tab A, switches to Tab B, the same panel state persists. User expects each terminal tab to have its own isolated resource browsing context.

---

## Requirements

| Requirement | Decision |
|-------------|----------|
| Panel open/closed state | Isolated per tab |
| Selected resource type | Isolated per tab |
| Namespace filter selection | Isolated per tab |
| Search query | Isolated per tab |
| Sort column & direction | Isolated per tab |
| Panel height | Isolated per tab |
| Resource cache (kubectl data) | Shared globally |

---

## Evaluated Approaches

### Approach 1: Extend Tab State (Recommended)

Store panel state in each `Tab` object. `useTabs` hook extended to include panel state per tab.

**Pros:**
- KISS - minimal changes to existing architecture
- Each tab has isolated panel state
- Shared resource cache (efficient, no duplicate kubectl calls)
- State persists when switching between tabs

**Cons:**
- Tab object grows slightly larger

### Approach 2: Instantiate ResourcePanel Per Tab

Render a `ResourcePanel` inside each tab's DOM (hidden when not active).

**Pros:**
- Complete isolation - each panel is independent

**Cons:**
- More DOM elements (N panels for N tabs)
- Memory usage scales with tab count
- Violates DRY - duplicated state management

### Approach 3: Context-based Per-Tab State

Create `TabPanelContext` managing panel states keyed by tab ID.

**Pros:**
- Clean API
- Centralized state management

**Cons:**
- More complex than Approach 1
- Overkill for this use case (YAGNI)

---

## Final Decision: Approach 1

**Rationale:**
1. **KISS**: Minimal code changes, leverages existing tab infrastructure
2. **DRY**: No duplication of panel logic
3. **YAGNI**: Doesn't over-engineer with contexts or multiple panel instances

---

## Implementation Plan

### Data Structure

```typescript
interface PanelState {
  isOpen: boolean;
  selectedResourceType: ResourceType | null;
  selectedNamespaces: string[];
  searchQuery: string;
  sortColumn: string | null;
  sortDirection: 'asc' | 'desc';
}

interface Tab {
  id: string;
  label: string;
  resourceRef?: { type: ResourceType; name: string; namespace: string; action: string };
  panelState: PanelState;
}
```

### Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useTabs.ts` | Add `PanelState` interface, extend `Tab`, add `updateTabPanelState()` |
| `src/hooks/useBottomPanel.ts` | Refactor to work with tab-based state OR remove entirely |
| `src/components/resource-panel/ResourcePanel.tsx` | Convert to controlled component, receive state via props |
| `src/components/screens/TerminalScreen.tsx` | Pass active tab's panel state to ResourcePanel, wire callbacks |

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      TerminalScreen                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    useTabs()                         │   │
│  │  tabs: [                                             │   │
│  │    { id: 'default', panelState: {...} },            │   │
│  │    { id: 'tab_1', panelState: {...} },              │   │
│  │  ]                                                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │   ResourcePanel (controlled)                         │   │
│  │   - Receives: activeTab.panelState                   │   │
│  │   - Callbacks: update activeTab.panelState           │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │   ResourceCacheContext (global, shared)              │   │
│  │   - filterByNamespaces()                             │   │
│  │   - filterByType()                                   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| State sync bugs between tabs | Low | Medium | Unit test tab switching |
| Performance degradation | Low | Low | State is lightweight |
| Breaking existing UX | Low | Medium | Maintain same UI, only change state source |

---

## Success Criteria

1. Opening ResourcePanel in Tab A does not affect Tab B
2. Switching tabs preserves each tab's panel state
3. Resource cache remains shared (no duplicate kubectl calls)
4. Panel height remains global preference

---

## Next Steps

1. Implement changes to `useTabs.ts`
2. Refactor `ResourcePanel.tsx` to controlled component
3. Update `TerminalScreen.tsx` to wire state
4. Remove or simplify `useBottomPanel.ts`
5. Test tab switching scenarios

---

## Unresolved Questions

None - all requirements clarified.
