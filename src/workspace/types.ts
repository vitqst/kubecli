import type { ResourceType } from '../resources';
import type { LayoutNode, PaneId, TabId } from './layoutModel';

export interface PanelState {
  isOpen: boolean;
  selectedResourceType: ResourceType | null;
  selectedNamespaces: string[];
  searchQuery: string;
  sortColumn: string | null;
  sortDirection: 'asc' | 'desc';
  height: number;
}

export const DEFAULT_PANEL_STATE: PanelState = {
  isOpen: false,
  selectedResourceType: null,
  selectedNamespaces: [],
  searchQuery: '',
  sortColumn: null,
  sortDirection: 'asc',
  height: 200,
};

export interface Tab {
  id: TabId;
  label: string;
  resourceRef?: {
    type: ResourceType;
    name: string;
    namespace: string;
    action: string;
  };
  panelState: PanelState;
}

export interface WorkspaceState {
  root: LayoutNode;
  tabs: Record<TabId, Tab>;
  activePaneId: PaneId;
  zoomedPaneId: PaneId | null;
}
