import React from 'react';
import type { LayoutNode, PaneId, TabId } from '../../workspace/layoutModel';
import type { Tab } from '../../workspace/types';
import { PaneNode } from './PaneNode';
import './workspace.css';

export interface PaneWorkspaceProps {
  root: LayoutNode;
  tabs: Record<TabId, Tab>;
  activePaneId: PaneId;
  zoomedPaneId: PaneId | null;
  onFocusPane: (paneId: PaneId) => void;
  onActivateTab: (paneId: PaneId, tabId: TabId) => void;
  onCloseTab: (paneId: PaneId, tabId: TabId) => void;
  onAddTab: (paneId: PaneId) => void;
  onResizeSplit: (splitId: string, ratio: number) => void;
  renderTab: (tab: Tab, active: boolean, paneId: PaneId) => React.ReactNode;
}

export function PaneWorkspace(props: PaneWorkspaceProps) {
  return (
    <div className={`workspace-layout${props.zoomedPaneId ? ' workspace-layout--zoomed' : ''}`}>
      <PaneNode {...props} node={props.root} />
    </div>
  );
}
