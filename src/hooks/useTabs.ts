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
