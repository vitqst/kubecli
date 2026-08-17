import { useCallback, useMemo, useReducer, useRef } from 'react';
import type { ResourceType } from '../resources';
import {
  collectLeaves,
  findLeaf,
  removeLeaf,
  resizeSplit as resizeLayoutSplit,
  splitLeaf,
  type PaneId,
  type PaneLeaf,
  type SplitNode,
  type TabId,
} from '../workspace/layoutModel';
import {
  DEFAULT_PANEL_STATE,
  type PanelState,
  type Tab,
  type WorkspaceState,
} from '../workspace/types';

export interface WorkspaceIdFactory {
  nextTabId: () => TabId;
  nextPaneId: () => PaneId;
  nextSplitId: () => string;
}

export interface UseWorkspaceLayoutOptions {
  idFactory?: WorkspaceIdFactory;
}

type NewTab = Omit<Tab, 'id' | 'panelState'>;

type WorkspaceAction =
  | { type: 'focus-pane'; paneId: PaneId }
  | { type: 'add-tab'; paneId: PaneId; tab: Tab }
  | { type: 'activate-tab'; paneId: PaneId; tabId: TabId }
  | { type: 'close-tab'; paneId: PaneId; tabId: TabId }
  | {
      type: 'split-pane';
      paneId: PaneId;
      direction: SplitNode['direction'];
      splitId: string;
      newPane: PaneLeaf;
      newTab: Tab;
    }
  | { type: 'resize-split'; splitId: string; ratio: number }
  | { type: 'close-pane'; paneId: PaneId }
  | { type: 'toggle-zoom'; paneId: PaneId }
  | { type: 'update-tab'; tabId: TabId; updater: (tab: Tab) => Tab }
  | { type: 'update-active-panel'; updater: (panel: PanelState) => Partial<PanelState> }
  | { type: 'toggle-panel'; resourceType: ResourceType }
  | { type: 'close-panel' };

let nextId = 0;
const defaultIdFactory: WorkspaceIdFactory = {
  nextTabId: () => `tab_${++nextId}_${Date.now()}`,
  nextPaneId: () => `pane_${++nextId}_${Date.now()}`,
  nextSplitId: () => `split_${++nextId}_${Date.now()}`,
};

function createTab(id: TabId, tab: NewTab): Tab {
  return { ...tab, id, panelState: { ...DEFAULT_PANEL_STATE } };
}

export function createInitialWorkspace(): WorkspaceState {
  const initialTab = createTab('default', { label: 'Terminal' });
  return {
    root: {
      kind: 'leaf',
      id: 'pane-default',
      tabIds: [initialTab.id],
      activeTabId: initialTab.id,
    },
    tabs: { [initialTab.id]: initialTab },
    activePaneId: 'pane-default',
    zoomedPaneId: null,
  };
}

function updateLeaf(
  state: WorkspaceState,
  paneId: PaneId,
  updater: (pane: PaneLeaf) => PaneLeaf,
): WorkspaceState {
  const updateNode = (node: WorkspaceState['root']): WorkspaceState['root'] => {
    if (node.kind === 'leaf') return node.id === paneId ? updater(node) : node;
    const first = updateNode(node.first);
    const second = updateNode(node.second);
    if (first === node.first && second === node.second) return node;
    return { ...node, first, second };
  };
  return { ...state, root: updateNode(state.root) };
}

function removeTabs(tabs: WorkspaceState['tabs'], tabIds: TabId[]): WorkspaceState['tabs'] {
  const next = { ...tabs };
  tabIds.forEach((tabId) => delete next[tabId]);
  return next;
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'focus-pane':
      return findLeaf(state.root, action.paneId)
        ? { ...state, activePaneId: action.paneId }
        : state;

    case 'add-tab': {
      if (!findLeaf(state.root, action.paneId)) return state;
      const next = updateLeaf(state, action.paneId, (pane) => ({
        ...pane,
        tabIds: [...pane.tabIds, action.tab.id],
        activeTabId: action.tab.id,
      }));
      return {
        ...next,
        tabs: { ...state.tabs, [action.tab.id]: action.tab },
        activePaneId: action.paneId,
      };
    }

    case 'activate-tab': {
      const pane = findLeaf(state.root, action.paneId);
      if (!pane?.tabIds.includes(action.tabId)) return state;
      const next = updateLeaf(state, action.paneId, (leaf) => ({
        ...leaf,
        activeTabId: action.tabId,
      }));
      return { ...next, activePaneId: action.paneId };
    }

    case 'close-tab': {
      const pane = findLeaf(state.root, action.paneId);
      if (!pane?.tabIds.includes(action.tabId)) return state;
      if (pane.tabIds.length === 1) {
        if (collectLeaves(state.root).length === 1) return state;
        const removed = removeLeaf(state.root, action.paneId);
        if (!removed.removed || !removed.focusPaneId) return state;
        return {
          ...state,
          root: removed.root,
          tabs: removeTabs(state.tabs, removed.removed.tabIds),
          activePaneId: removed.focusPaneId,
          zoomedPaneId: state.zoomedPaneId === action.paneId ? null : state.zoomedPaneId,
        };
      }

      const index = pane.tabIds.indexOf(action.tabId);
      const tabIds = pane.tabIds.filter((tabId) => tabId !== action.tabId);
      const activeTabId = pane.activeTabId === action.tabId
        ? tabIds[Math.max(0, index - 1)]
        : pane.activeTabId;
      const next = updateLeaf(state, action.paneId, (leaf) => ({ ...leaf, tabIds, activeTabId }));
      return {
        ...next,
        tabs: removeTabs(state.tabs, [action.tabId]),
        activePaneId: action.paneId,
      };
    }

    case 'split-pane': {
      if (!findLeaf(state.root, action.paneId)) return state;
      return {
        ...state,
        root: splitLeaf(
          state.root,
          action.paneId,
          action.direction,
          action.newPane,
          action.splitId,
        ),
        tabs: { ...state.tabs, [action.newTab.id]: action.newTab },
        activePaneId: action.newPane.id,
        zoomedPaneId: null,
      };
    }

    case 'resize-split':
      return { ...state, root: resizeLayoutSplit(state.root, action.splitId, action.ratio) };

    case 'close-pane': {
      if (collectLeaves(state.root).length === 1) return state;
      const removed = removeLeaf(state.root, action.paneId);
      if (!removed.removed || !removed.focusPaneId) return state;
      return {
        ...state,
        root: removed.root,
        tabs: removeTabs(state.tabs, removed.removed.tabIds),
        activePaneId: removed.focusPaneId,
        zoomedPaneId: state.zoomedPaneId === action.paneId ? null : state.zoomedPaneId,
      };
    }

    case 'toggle-zoom':
      return findLeaf(state.root, action.paneId)
        ? {
            ...state,
            activePaneId: action.paneId,
            zoomedPaneId: state.zoomedPaneId === action.paneId ? null : action.paneId,
          }
        : state;

    case 'update-tab': {
      const tab = state.tabs[action.tabId];
      if (!tab) return state;
      return {
        ...state,
        tabs: { ...state.tabs, [action.tabId]: action.updater(tab) },
      };
    }

    case 'update-active-panel': {
      const pane = findLeaf(state.root, state.activePaneId);
      if (!pane) return state;
      const tab = state.tabs[pane.activeTabId];
      if (!tab) return state;
      return {
        ...state,
        tabs: {
          ...state.tabs,
          [tab.id]: {
            ...tab,
            panelState: { ...tab.panelState, ...action.updater(tab.panelState) },
          },
        },
      };
    }

    case 'toggle-panel':
      return workspaceReducer(state, {
        type: 'update-active-panel',
        updater: (panel) => panel.isOpen && panel.selectedResourceType === action.resourceType
          ? { isOpen: false, selectedResourceType: null }
          : {
              isOpen: true,
              selectedResourceType: action.resourceType,
              searchQuery: '',
              sortColumn: null,
              sortDirection: 'asc',
            },
      });

    case 'close-panel':
      return workspaceReducer(state, {
        type: 'update-active-panel',
        updater: () => ({ isOpen: false, selectedResourceType: null }),
      });
  }
}

export function useWorkspaceLayout(options: UseWorkspaceLayoutOptions = {}) {
  const idFactoryRef = useRef(options.idFactory ?? defaultIdFactory);
  const idFactory = idFactoryRef.current;
  const [state, dispatch] = useReducer(workspaceReducer, undefined, createInitialWorkspace);
  const activePane = findLeaf(state.root, state.activePaneId) ?? collectLeaves(state.root)[0];
  const activeTab = state.tabs[activePane.activeTabId];
  const visibleTabIds = useMemo(
    () => collectLeaves(state.root).flatMap((pane) => pane.tabIds),
    [state.root],
  );

  const addTab = useCallback((tab: NewTab, paneId = state.activePaneId): TabId => {
    const id = idFactory.nextTabId();
    dispatch({ type: 'add-tab', paneId, tab: createTab(id, tab) });
    return id;
  }, [idFactory, state.activePaneId]);

  const splitPane = useCallback((paneId: PaneId, direction: SplitNode['direction']) => {
    const tabId = idFactory.nextTabId();
    const newTab = createTab(tabId, { label: 'Terminal' });
    const newPane: PaneLeaf = {
      kind: 'leaf',
      id: idFactory.nextPaneId(),
      tabIds: [tabId],
      activeTabId: tabId,
    };
    dispatch({
      type: 'split-pane',
      paneId,
      direction,
      splitId: idFactory.nextSplitId(),
      newPane,
      newTab,
    });
    return { paneId: newPane.id, tabId };
  }, [idFactory]);

  const updateActivePanelState = useCallback(
    (updater: (panel: PanelState) => Partial<PanelState>) => {
      dispatch({ type: 'update-active-panel', updater });
    },
    [],
  );

  return {
    state,
    root: state.root,
    tabs: state.tabs,
    activePaneId: state.activePaneId,
    activePane,
    activeTabId: activePane.activeTabId,
    activeTab,
    zoomedPaneId: state.zoomedPaneId,
    visibleTabIds,
    paneCount: collectLeaves(state.root).length,
    addTab,
    splitPane,
    focusPane: (paneId: PaneId) => dispatch({ type: 'focus-pane', paneId }),
    setActiveTab: (paneId: PaneId, tabId: TabId) => dispatch({ type: 'activate-tab', paneId, tabId }),
    closeTab: (tabId: TabId, paneId = state.activePaneId) => dispatch({ type: 'close-tab', paneId, tabId }),
    closePane: (paneId: PaneId) => dispatch({ type: 'close-pane', paneId }),
    resizeSplit: (splitId: string, ratio: number) => dispatch({ type: 'resize-split', splitId, ratio }),
    toggleZoom: (paneId: PaneId) => dispatch({ type: 'toggle-zoom', paneId }),
    updateTab: (tabId: TabId, updater: (tab: Tab) => Tab) => dispatch({ type: 'update-tab', tabId, updater }),
    updateActivePanelState,
    togglePanel: (resourceType: ResourceType) => dispatch({ type: 'toggle-panel', resourceType }),
    closePanel: () => dispatch({ type: 'close-panel' }),
    findTabByResource: (type: ResourceType, name: string, namespace: string) =>
      Object.values(state.tabs).find((tab) =>
        tab.resourceRef?.type === type
        && tab.resourceRef.name === name
        && tab.resourceRef.namespace === namespace),
  };
}

export type UseWorkspaceLayoutResult = ReturnType<typeof useWorkspaceLayout>;
