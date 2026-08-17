import React from 'react';
import { TabBar } from '../tabs/TabBar';
import type { PaneId, TabId } from '../../workspace/layoutModel';
import type { Tab } from '../../workspace/types';

interface PaneHeaderProps {
  paneId: PaneId;
  tabs: Tab[];
  activeTabId: TabId;
  focused: boolean;
  onFocusPane: (paneId: PaneId) => void;
  onActivateTab: (paneId: PaneId, tabId: TabId) => void;
  onCloseTab: (paneId: PaneId, tabId: TabId) => void;
  onAddTab: (paneId: PaneId) => void;
}

export function PaneHeader({
  paneId,
  tabs,
  activeTabId,
  focused,
  onFocusPane,
  onActivateTab,
  onCloseTab,
  onAddTab,
}: PaneHeaderProps) {
  return (
    <header className="workspace-pane-header">
      <div className="workspace-pane-tabs">
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onTabClick={(tabId) => {
            onFocusPane(paneId);
            onActivateTab(paneId, tabId);
          }}
          onTabClose={(tabId) => {
            onFocusPane(paneId);
            onCloseTab(paneId, tabId);
          }}
          onAddTab={() => {
            onFocusPane(paneId);
            onAddTab(paneId);
          }}
        />
      </div>
      {focused && <span className="workspace-pane-focus-label">FOCUSED</span>}
    </header>
  );
}
