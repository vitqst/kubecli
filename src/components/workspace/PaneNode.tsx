import React, { useEffect, useState } from 'react';
import { minimumPaneExtent, type LayoutNode, type PaneId, type PaneLeaf, type TabId } from '../../workspace/layoutModel';
import type { Tab } from '../../workspace/types';
import { PaneHeader } from './PaneHeader';
import { SplitHandle } from './SplitHandle';
import type { TerminalMenuRequest } from './PaneContextMenu';

export interface PaneNodeProps {
  node: LayoutNode;
  tabs: Record<TabId, Tab>;
  activePaneId: PaneId;
  zoomedPaneId: PaneId | null;
  canCloseLastTab: boolean;
  onFocusPane: (paneId: PaneId) => void;
  onActivateTab: (paneId: PaneId, tabId: TabId) => void;
  onCloseTab: (paneId: PaneId, tabId: TabId) => void;
  onAddTab: (paneId: PaneId) => void;
  onResizeSplit: (splitId: string, ratio: number) => void;
  onOpenContextMenu: (
    paneId: PaneId,
    x: number,
    y: number,
    terminalRequest?: TerminalMenuRequest,
  ) => void;
}

function SplitPaneView(props: PaneNodeProps & { node: Extract<LayoutNode, { kind: 'split' }> }) {
  const { node } = props;
  const [previewRatio, setPreviewRatio] = useState(node.ratio);

  useEffect(() => setPreviewRatio(node.ratio), [node.ratio]);

  return (
    <div
      className={`workspace-split workspace-split--${node.direction}`}
      data-split-id={node.id}
    >
      <div
        className="workspace-split-child workspace-split-child--first"
        style={{ flexBasis: `calc((100% - 8px) * ${previewRatio})` }}
      >
        <PaneNode {...props} node={node.first} />
      </div>
      <SplitHandle
        direction={node.direction}
        ratio={node.ratio}
        minimumFirstPixels={minimumPaneExtent(node.first, node.direction)}
        minimumSecondPixels={minimumPaneExtent(node.second, node.direction)}
        onPreviewRatio={setPreviewRatio}
        onResize={(ratio) => props.onResizeSplit(node.id, ratio)}
      />
      <div className="workspace-split-child workspace-split-child--second">
        <PaneNode {...props} node={node.second} />
      </div>
    </div>
  );
}

function PaneLeafView({
  pane,
  tabs,
  activePaneId,
  zoomedPaneId,
  canCloseLastTab,
  onFocusPane,
  onActivateTab,
  onCloseTab,
  onAddTab,
  onOpenContextMenu,
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
      onContextMenu={(event) => {
        event.preventDefault();
        onFocusPane(pane.id);
        onOpenContextMenu(pane.id, event.clientX, event.clientY);
      }}
    >
      <PaneHeader
        paneId={pane.id}
        tabs={paneTabs}
        activeTabId={pane.activeTabId}
        focused={focused}
        canCloseTabs={paneTabs.length > 1 || canCloseLastTab}
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
              data-terminal-slot={tab.id}
              hidden={!active}
              aria-hidden={!active ? 'true' : undefined}
            />
          );
        })}
      </div>
    </section>
  );
}

export function PaneNode(props: PaneNodeProps) {
  const { node } = props;
  if (node.kind === 'leaf') return <PaneLeafView {...props} pane={node} />;
  return <SplitPaneView {...props} node={node} />;
}
