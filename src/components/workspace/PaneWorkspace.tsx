import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

interface StableTabHostProps {
  tab: Tab;
  active: boolean;
  paneId: PaneId;
  layoutRevision: LayoutNode;
  workspaceRef: React.RefObject<HTMLDivElement | null>;
  onFocusPane: (paneId: PaneId) => void;
  onOpenContextMenu: (
    paneId: PaneId,
    x: number,
    y: number,
    terminalRequest?: TerminalMenuRequest,
  ) => void;
  renderTab: PaneWorkspaceProps['renderTab'];
}

function StableTabHost({
  tab,
  active,
  paneId,
  layoutRevision,
  workspaceRef,
  onFocusPane,
  onOpenContextMenu,
  renderTab,
}: StableTabHostProps) {
  const [host] = useState(() => {
    const element = document.createElement('div');
    element.className = 'workspace-terminal-host';
    return element;
  });
  const handleContextMenuRequest = useCallback((request: TerminalMenuRequest) => {
    onFocusPane(paneId);
    onOpenContextMenu(paneId, request.x, request.y, request);
  }, [onFocusPane, onOpenContextMenu, paneId]);

  useEffect(() => {
    const slot = Array.from(
      workspaceRef.current?.querySelectorAll<HTMLElement>('[data-terminal-slot]') ?? [],
    ).find((candidate) => candidate.dataset.terminalSlot === tab.id);
    if (!slot) return;
    slot.appendChild(host);
    return () => host.remove();
  }, [host, layoutRevision, tab.id, workspaceRef]);

  return createPortal(
    <div
      className="workspace-terminal-event-boundary"
      // Portal events follow the React tree, not the pane DOM tree. Capture
      // ownership here before xterm consumes the press or receives keyboard focus.
      onPointerDownCapture={() => onFocusPane(paneId)}
      onFocusCapture={() => onFocusPane(paneId)}
    >
      {renderTab(tab, active, paneId, handleContextMenuRequest)}
    </div>,
    host,
    tab.id,
  );
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
  const visibleTabs = useMemo(() => collectLeaves(props.root).flatMap((pane) =>
    pane.tabIds.flatMap((tabId) => {
      const tab = props.tabs[tabId];
      return tab ? [{ tab, paneId: pane.id, active: pane.activeTabId === tabId }] : [];
    })), [props.root, props.tabs]);
  const openContextMenu = useCallback((
    paneId: PaneId,
    x: number,
    y: number,
    terminalRequest?: TerminalMenuRequest,
  ) => {
    props.onFocusPane(paneId);
    setContextMenu({ paneId, x, y, terminalRequest: terminalRequest ?? null });
  }, [props.onFocusPane]);

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
          onOpenContextMenu={openContextMenu}
        />
        {visibleTabs.map(({ tab, paneId, active }) => (
          <StableTabHost
            key={tab.id}
            tab={tab}
            active={active}
            paneId={paneId}
            layoutRevision={props.root}
            workspaceRef={workspaceRef}
            onFocusPane={props.onFocusPane}
            onOpenContextMenu={openContextMenu}
            renderTab={props.renderTab}
          />
        ))}
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
