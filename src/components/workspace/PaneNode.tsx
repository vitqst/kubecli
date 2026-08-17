import React from 'react';
import type { LayoutNode, PaneId, PaneLeaf, TabId } from '../../workspace/layoutModel';
import type { Tab } from '../../workspace/types';
import { PaneHeader } from './PaneHeader';

export interface PaneNodeProps {
  node: LayoutNode;
  tabs: Record<TabId, Tab>;
  activePaneId: PaneId;
  zoomedPaneId: PaneId | null;
  onFocusPane: (paneId: PaneId) => void;
  onActivateTab: (paneId: PaneId, tabId: TabId) => void;
  onCloseTab: (paneId: PaneId, tabId: TabId) => void;
  onAddTab: (paneId: PaneId) => void;
  renderTab: (tab: Tab, active: boolean, paneId: PaneId) => React.ReactNode;
}

function PaneLeafView({
  pane,
  tabs,
  activePaneId,
  zoomedPaneId,
  onFocusPane,
  onActivateTab,
  onCloseTab,
  onAddTab,
  renderTab,
}: Omit<PaneNodeProps, 'node'> & { pane: PaneLeaf }) {
  const paneTabs = pane.tabIds.map((tabId) => tabs[tabId]).filter(Boolean);
  const activeTab = tabs[pane.activeTabId] ?? paneTabs[0];
  const focused = pane.id === activePaneId;
  const hiddenByZoom = zoomedPaneId !== null && zoomedPaneId !== pane.id;
  const zoomed = zoomedPaneId === pane.id;

  return (
    <section
      className={[
        'workspace-pane',
        focused ? 'workspace-pane--active' : '',
        zoomed ? 'workspace-pane--zoomed' : '',
        hiddenByZoom ? 'workspace-pane--zoom-hidden' : '',
      ].filter(Boolean).join(' ')}
      role="group"
      aria-label={`Terminal pane ${activeTab?.label ?? 'Terminal'}`}
      aria-current={focused ? 'true' : 'false'}
      aria-hidden={hiddenByZoom ? 'true' : undefined}
      data-pane-id={pane.id}
      tabIndex={-1}
      onPointerDown={() => onFocusPane(pane.id)}
      onFocusCapture={() => onFocusPane(pane.id)}
    >
      <PaneHeader
        paneId={pane.id}
        tabs={paneTabs}
        activeTabId={pane.activeTabId}
        focused={focused}
        onFocusPane={onFocusPane}
        onActivateTab={onActivateTab}
        onCloseTab={onCloseTab}
        onAddTab={onAddTab}
      />
      <div className="workspace-pane-terminals">
        {paneTabs.map((tab) => {
          const active = tab.id === pane.activeTabId;
          return (
            <div
              key={tab.id}
              className="workspace-terminal-slot"
              hidden={!active}
              aria-hidden={!active ? 'true' : undefined}
            >
              {renderTab(tab, active, pane.id)}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function PaneNode(props: PaneNodeProps) {
  const { node } = props;
  if (node.kind === 'leaf') return <PaneLeafView {...props} pane={node} />;

  return (
    <div
      className={`workspace-split workspace-split--${node.direction}`}
      data-split-id={node.id}
    >
      <div
        className="workspace-split-child workspace-split-child--first"
        style={{ flexBasis: `${node.ratio * 100}%` }}
      >
        <PaneNode {...props} node={node.first} />
      </div>
      <div className={`workspace-divider workspace-divider--${node.direction}`} aria-hidden="true" />
      <div className="workspace-split-child workspace-split-child--second">
        <PaneNode {...props} node={node.second} />
      </div>
    </div>
  );
}
