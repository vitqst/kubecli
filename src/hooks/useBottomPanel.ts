// src/hooks/useBottomPanel.ts
import { useState, useCallback } from 'react';
import { ResourceType } from '../resources';

/**
 * State of the bottom resource panel
 */
interface BottomPanelState {
  /** Whether the panel is open */
  isOpen: boolean;
  /** Currently selected resource type */
  selectedResourceType: ResourceType | null;
}

/**
 * Return type for the useBottomPanel hook
 */
interface UseBottomPanelResult {
  /** Whether the panel is open */
  isOpen: boolean;
  /** Currently selected resource type */
  selectedResourceType: ResourceType | null;
  /** Open the panel with a specific resource type */
  openPanel: (type: ResourceType) => void;
  /** Close the panel */
  closePanel: () => void;
  /** Toggle panel state (open if closed, close if open with same type, switch type if open with different type) */
  togglePanel: (type: ResourceType) => void;
}

/**
 * Hook for managing bottom resource panel state.
 * Tracks openness and selected resource type with helpers to open, close, and toggle.
 * @returns Panel state and operations
 */
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
