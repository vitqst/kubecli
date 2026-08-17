import React, { useEffect, useRef, useState } from 'react';
import { collectLeaves, type LayoutNode, type PaneId, type TabId } from '../../workspace/layoutModel';
import type { Tab } from '../../workspace/types';
import { PaneNode } from './PaneNode';
import { PaneContextMenu, type TerminalMenuRequest } from './PaneContextMenu';
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
  onSplitPane: (paneId: PaneId, direction: 'row' | 'column') => void;
  onClosePane: (paneId: PaneId) => void;
  onToggleZoom: (paneId: PaneId) => void;
  renderTab: (
    tab: Tab,
    active: boolean,
    paneId: PaneId,
    onContextMenuRequest: (request: TerminalMenuRequest) => void,
  ) => React.ReactNode;
}

export function PaneWorkspace(props: PaneWorkspaceProps) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const focusAfterActionRef = useRef(false);
  const [contextMenu, setContextMenu] = useState<{
    paneId: PaneId;
    x: number;
    y: number;
    terminalRequest: TerminalMenuRequest | null;
  } | null>(null);

  useEffect(() => {
    if (!focusAfterActionRef.current) return;
    const frame = requestAnimationFrame(() => {
      const pane = Array.from(workspaceRef.current?.querySelectorAll<HTMLElement>('[data-pane-id]') ?? [])
        .find((candidate) => candidate.dataset.paneId === props.activePaneId);
      const terminalInput = pane?.querySelector<HTMLElement>('.xterm-helper-textarea, textarea');
      (terminalInput ?? pane)?.focus();
      focusAfterActionRef.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [props.activePaneId, props.root, props.zoomedPaneId]);

  const runPaneAction = (action: () => void) => {
    focusAfterActionRef.current = true;
    action();
  };

  return (
    <>
      <div ref={workspaceRef} className={`workspace-layout${props.zoomedPaneId ? ' workspace-layout--zoomed' : ''}`}>
        <PaneNode
          {...props}
          node={props.root}
          canCloseLastTab={collectLeaves(props.root).length > 1}
          onOpenContextMenu={(paneId, x, y, terminalRequest) => {
            props.onFocusPane(paneId);
            setContextMenu({ paneId, x, y, terminalRequest: terminalRequest ?? null });
          }}
        />
      </div>
      {contextMenu && (
        <PaneContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          terminalRequest={contextMenu.terminalRequest}
          isZoomed={props.zoomedPaneId === contextMenu.paneId}
          canClose={collectLeaves(props.root).length > 1}
          onZoom={() => runPaneAction(() => props.onToggleZoom(contextMenu.paneId))}
          onSplitRight={() => runPaneAction(() => props.onSplitPane(contextMenu.paneId, 'row'))}
          onSplitDown={() => runPaneAction(() => props.onSplitPane(contextMenu.paneId, 'column'))}
          onClosePane={() => runPaneAction(() => props.onClosePane(contextMenu.paneId))}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
