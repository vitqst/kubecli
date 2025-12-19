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
