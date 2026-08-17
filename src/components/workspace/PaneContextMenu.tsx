import React, { useEffect, useRef } from 'react';

export interface TerminalMenuRequest {
  x: number;
  y: number;
  selection: string;
  copySelection: () => void | Promise<void>;
  paste: () => void | Promise<void>;
  clearSelection: () => void;
  focus?: () => void;
}

interface PaneContextMenuProps {
  x: number;
  y: number;
  isZoomed: boolean;
  canClose: boolean;
  terminalRequest: TerminalMenuRequest | null;
  onZoom: () => void;
  onSplitRight: () => void;
  onSplitDown: () => void;
  onClosePane: () => void;
  onClose: () => void;
}

const MENU_WIDTH = 190;
const MENU_MAX_HEIGHT = 300;
const VIEWPORT_GUTTER = 8;

export function PaneContextMenu({
  x,
  y,
  isZoomed,
  canClose,
  terminalRequest,
  onZoom,
  onSplitRight,
  onSplitDown,
  onClosePane,
  onClose,
}: PaneContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const left = Math.max(
    VIEWPORT_GUTTER,
    Math.min(x, window.innerWidth - MENU_WIDTH - VIEWPORT_GUTTER),
  );
  const top = Math.max(
    VIEWPORT_GUTTER,
    Math.min(y, window.innerHeight - MENU_MAX_HEIGHT - VIEWPORT_GUTTER),
  );

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const run = (action: () => void | Promise<void>, restoreTerminalFocus = false) => {
    void action();
    onClose();
    if (restoreTerminalFocus) requestAnimationFrame(() => terminalRequest?.focus?.());
  };

  return (
    <div
      ref={menuRef}
      className="workspace-context-menu"
      role="menu"
      aria-label="Terminal pane actions"
      style={{ left, top }}
    >
      {terminalRequest && (
        <>
          {terminalRequest.selection && (
            <button role="menuitem" onClick={() => run(terminalRequest.copySelection, true)}>
              <span aria-hidden="true">⧉</span><span>Copy</span>
            </button>
          )}
          <button role="menuitem" onClick={() => run(terminalRequest.paste, true)}>
            <span aria-hidden="true">▣</span><span>Paste</span>
          </button>
          {terminalRequest.selection && (
            <button role="menuitem" onClick={() => run(terminalRequest.clearSelection, true)}>
              <span aria-hidden="true">⌫</span><span>Clear Selection</span>
            </button>
          )}
          <div className="workspace-context-separator" role="separator" />
        </>
      )}

      <button role="menuitem" onClick={() => run(onZoom)}>
        <span aria-hidden="true">⛶</span><span>{isZoomed ? 'Restore Pane' : 'Zoom Pane'}</span>
      </button>
      <button role="menuitem" onClick={() => run(onSplitRight)}>
        <span aria-hidden="true">◫</span><span>Split Right</span>
      </button>
      <button role="menuitem" onClick={() => run(onSplitDown)}>
        <span aria-hidden="true">⊟</span><span>Split Down</span>
      </button>
      <div className="workspace-context-separator" role="separator" />
      <button
        className="workspace-context-danger"
        role="menuitem"
        disabled={!canClose}
        onClick={() => run(onClosePane)}
      >
        <span aria-hidden="true">×</span><span>Close Pane</span>
      </button>
    </div>
  );
}
