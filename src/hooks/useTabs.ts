// src/hooks/useTabs.ts
import { useState, useCallback } from 'react';
import { ResourceType } from '../resources';

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
}

/**
 * Return type for the useTabs hook
 */
interface UseTabsResult {
  /** List of all tabs */
  tabs: Tab[];
  /** ID of the currently active tab */
  activeTabId: string;
  /** Add a new tab and return its ID */
  addTab: (tab: Omit<Tab, 'id'>) => string;
  /** Close a tab by ID (cannot close default tab) */
  closeTab: (id: string) => void;
  /** Set the active tab by ID */
  setActiveTab: (id: string) => void;
  /** Find a tab associated with a specific resource */
  findTabByResource: (type: ResourceType, name: string, namespace: string) => Tab | undefined;
}

let tabIdCounter = 0;
function generateTabId(): string {
  return `tab_${++tabIdCounter}_${Date.now()}`;
}

/**
 * Hook for managing tab state in the terminal interface.
 * Keeps a default tab, tracks the active tab, and provides helpers to add, close, and locate tabs.
 * @returns Tab state and operations
 */
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

  return {
    tabs,
    activeTabId,
    addTab,
    closeTab,
    setActiveTab: setActiveTabId,
    findTabByResource,
  };
}
