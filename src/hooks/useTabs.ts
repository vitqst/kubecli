// src/hooks/useTabs.ts
import { useState, useCallback } from 'react';
import { ResourceType } from '../resources';

/**
 * State of the resource panel for a specific tab.
 * Each tab maintains its own isolated panel state.
 */
export interface PanelState {
  /** Whether the panel is open */
  isOpen: boolean;
  /** Currently selected resource type */
  selectedResourceType: ResourceType | null;
  /** Selected namespaces for filtering (empty = all) */
  selectedNamespaces: string[];
  /** Search query for filtering resources */
  searchQuery: string;
  /** Column key used for sorting */
  sortColumn: string | null;
  /** Sort direction */
  sortDirection: 'asc' | 'desc';
  /** Panel height in pixels */
  height: number;
}

/** Default panel state for new tabs */
const DEFAULT_PANEL_STATE: PanelState = {
  isOpen: false,
  selectedResourceType: null,
  selectedNamespaces: [],
  searchQuery: '',
  sortColumn: null,
  sortDirection: 'asc',
  height: 200,
};

/**
 * Represents a tab in the terminal interface
 */
export interface Tab {
  id: string;
  label: string;
  resourceRef?: {
    type: ResourceType;
    name: string;
    namespace: string;
    action: string;
  };
  /** Isolated resource panel state for this tab */
  panelState: PanelState;
}

/**
 * Return type for the useTabs hook
 */
export interface UseTabsResult {
  /** List of all tabs */
  tabs: Tab[];
  /** ID of the currently active tab */
  activeTabId: string;
  /** The currently active tab object */
  activeTab: Tab;
  /** Add a new tab and return its ID */
  addTab: (tab: Omit<Tab, 'id' | 'panelState'>) => string;
  /** Close a tab by ID (cannot close default tab) */
  closeTab: (id: string) => void;
  /** Set the active tab by ID */
  setActiveTab: (id: string) => void;
  /** Update tabs in-place */
  updateTabs: (updater: (prev: Tab[]) => Tab[]) => void;
  /** Find a tab associated with a specific resource */
  findTabByResource: (type: ResourceType, name: string, namespace: string) => Tab | undefined;
  /** Update the active tab's panel state */
  updateActivePanelState: (updater: (prev: PanelState) => Partial<PanelState>) => void;
  /** Toggle panel for active tab (open/close or switch resource type) */
  togglePanel: (type: ResourceType) => void;
  /** Close panel for active tab */
  closePanel: () => void;
}

let tabIdCounter = 0;
function generateTabId(): string {
  return `tab_${++tabIdCounter}_${Date.now()}`;
}

/**
 * Hook for managing tab state in the terminal interface.
 * Keeps a default tab, tracks the active tab, and provides helpers to add, close, and locate tabs.
 * Each tab has its own isolated panel state.
 * @returns Tab state and operations
 */
export function useTabs(): UseTabsResult {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: 'default', label: 'Terminal', panelState: { ...DEFAULT_PANEL_STATE } }
  ]);
  const [activeTabId, setActiveTabId] = useState('default');

  // Get active tab object
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  const addTab = useCallback((tab: Omit<Tab, 'id' | 'panelState'>): string => {
    const id = generateTabId();
    const newTab: Tab = { ...tab, id, panelState: { ...DEFAULT_PANEL_STATE } };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
    return id;
  }, []);

  const closeTab = useCallback((id: string) => {
    if (id === 'default') return; // Cannot close default tab

    setTabs(prev => {
      const currentIndex = prev.findIndex(t => t.id === id);
      const newTabs = prev.filter(t => t.id !== id);

      // Update active tab if we're closing the current one
      setActiveTabId(currentActiveId => {
        if (currentActiveId === id) {
          const newIndex = Math.max(0, currentIndex - 1);
          return prev[newIndex]?.id || 'default';
        }
        return currentActiveId;
      });

      return newTabs;
    });
  }, []);

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

  const updateTabs = useCallback((updater: (prev: Tab[]) => Tab[]) => {
    setTabs(updater);
  }, []);

  // Update the active tab's panel state
  const updateActivePanelState = useCallback((updater: (prev: PanelState) => Partial<PanelState>) => {
    setTabs(prev => prev.map(tab =>
      tab.id === activeTabId
        ? { ...tab, panelState: { ...tab.panelState, ...updater(tab.panelState) } }
        : tab
    ));
  }, [activeTabId]);

  // Toggle panel for active tab
  const togglePanel = useCallback((type: ResourceType) => {
    setTabs(prev => prev.map(tab => {
      if (tab.id !== activeTabId) return tab;

      const { panelState } = tab;
      if (panelState.isOpen && panelState.selectedResourceType === type) {
        // Close panel if same type clicked
        return { ...tab, panelState: { ...panelState, isOpen: false, selectedResourceType: null } };
      }
      // Open panel with new type (reset search/sort when changing type)
      return {
        ...tab,
        panelState: {
          ...panelState,
          isOpen: true,
          selectedResourceType: type,
          searchQuery: '',
          sortColumn: null,
          sortDirection: 'asc',
        }
      };
    }));
  }, [activeTabId]);

  // Close panel for active tab
  const closePanel = useCallback(() => {
    setTabs(prev => prev.map(tab =>
      tab.id === activeTabId
        ? { ...tab, panelState: { ...tab.panelState, isOpen: false, selectedResourceType: null } }
        : tab
    ));
  }, [activeTabId]);

  return {
    tabs,
    activeTabId,
    activeTab,
    addTab,
    closeTab,
    setActiveTab: setActiveTabId,
    updateTabs,
    findTabByResource,
    updateActivePanelState,
    togglePanel,
    closePanel,
  };
}
