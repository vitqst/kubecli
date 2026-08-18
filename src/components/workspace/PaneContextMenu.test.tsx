import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaneContextMenu, type TerminalMenuRequest } from './PaneContextMenu';

function terminalRequest(selection = 'selected output'): TerminalMenuRequest {
  return {
    x: 790,
    y: 590,
    selection,
    copySelection: vi.fn(),
    paste: vi.fn(),
    clearSelection: vi.fn(),
  };
}

function renderMenu(overrides: Partial<React.ComponentProps<typeof PaneContextMenu>> = {}) {
  const props: React.ComponentProps<typeof PaneContextMenu> = {
    x: 790,
    y: 590,
    isZoomed: false,
    canClose: true,
    terminalRequest: null,
    onZoom: vi.fn(),
    onSplitRight: vi.fn(),
    onSplitDown: vi.fn(),
    onClosePane: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  return { ...render(<PaneContextMenu {...props} />), props };
}

describe('PaneContextMenu', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 });
  });

  it('clamps the menu inside the viewport', () => {
    renderMenu();

    const menu = screen.getByRole('menu');
    expect(Number.parseInt(menu.style.left, 10)).toBeLessThan(790);
    expect(Number.parseInt(menu.style.top, 10)).toBeLessThan(590);
    expect(Number.parseInt(menu.style.left, 10)).toBeGreaterThanOrEqual(8);
    expect(Number.parseInt(menu.style.top, 10)).toBeGreaterThanOrEqual(8);
  });

  it('shows terminal actions before pane actions when opened from xterm', () => {
    renderMenu({ terminalRequest: terminalRequest() });

    const items = screen.getAllByRole('menuitem');

    expect(items).toHaveLength(7);
    [
      'Copy',
      'Paste',
      'Clear Selection',
      'Zoom Pane',
      'Split Right',
      'Split Down',
      'Close Pane',
    ].forEach((name, index) => {
      expect(items[index]).toHaveAccessibleName(name);
    });
  });

  it('hides selection-only actions when xterm has no selection', () => {
    renderMenu({ terminalRequest: terminalRequest('') });

    expect(screen.queryByRole('menuitem', { name: 'Copy' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Clear Selection' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Paste' })).toBeInTheDocument();
  });

  it('shows Restore Pane while zoomed and disables closing the final pane', () => {
    renderMenu({ isZoomed: true, canClose: false });

    expect(screen.getByRole('menuitem', { name: 'Restore Pane' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Close Pane' })).toBeDisabled();
  });

  it('runs the requested action and closes the menu', () => {
    const request = terminalRequest();
    const { props } = renderMenu({ terminalRequest: request });

    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy' }));

    expect(request.copySelection).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape and outside pointer interaction', () => {
    const escape = renderMenu();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(escape.props.onClose).toHaveBeenCalledTimes(1);
    escape.unmount();

    const outside = renderMenu();
    fireEvent.pointerDown(document.body);
    expect(outside.props.onClose).toHaveBeenCalledTimes(1);
  });
});
