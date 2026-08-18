import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { LayoutNode } from '../../workspace/layoutModel';
import { DEFAULT_PANEL_STATE, type Tab } from '../../workspace/types';
import { PaneWorkspace } from './PaneWorkspace';

const tab = (id: string, label: string): Tab => ({
  id,
  label,
  panelGroupId: id,
  panelState: { ...DEFAULT_PANEL_STATE },
});

const tabs: Record<string, Tab> = {
  api: tab('api', 'api-logs'),
  debug: tab('debug', 'debug-shell'),
  shell: tab('shell', 'shell'),
};

const root: LayoutNode = {
  kind: 'split',
  id: 'split-root',
  direction: 'row',
  ratio: 0.56,
  first: {
    kind: 'leaf',
    id: 'pane-api',
    tabIds: ['api', 'debug'],
    activeTabId: 'api',
  },
  second: {
    kind: 'leaf',
    id: 'pane-shell',
    tabIds: ['shell'],
    activeTabId: 'shell',
  },
};

function renderWorkspace(overrides: Partial<React.ComponentProps<typeof PaneWorkspace>> = {}) {
  const props: React.ComponentProps<typeof PaneWorkspace> = {
    root,
    tabs,
    activePaneId: 'pane-api',
    zoomedPaneId: null,
    onFocusPane: vi.fn(),
    onActivateTab: vi.fn(),
    onCloseTab: vi.fn(),
    onAddTab: vi.fn(),
    onResizeSplit: vi.fn(),
    onSplitPane: vi.fn(),
    onClosePane: vi.fn(),
    onToggleZoom: vi.fn(),
    renderTab: (currentTab) => (
      <div data-testid={`terminal-${currentTab.id}`}>{currentTab.label} terminal</div>
    ),
    ...overrides,
  };
  return { ...render(<PaneWorkspace {...props} />), props };
}

describe('PaneWorkspace', () => {
  it('renders local tab groups and keeps every terminal mounted', () => {
    renderWorkspace();

    const apiPane = screen.getByRole('group', { name: 'Terminal pane api-logs' });
    const shellPane = screen.getByRole('group', { name: 'Terminal pane shell' });
    expect(within(apiPane).getAllByRole('tab').map((item) => item.textContent)).toEqual([
      'api-logs×',
      'debug-shell×',
    ]);
    expect(within(shellPane).getAllByRole('tab').map((item) => item.textContent)).toEqual(['shell×']);
    expect(screen.getByTestId('terminal-api')).toBeInTheDocument();
    expect(screen.getByTestId('terminal-debug')).toBeInTheDocument();
    expect(screen.getByTestId('terminal-shell')).toBeInTheDocument();
  });

  it('marks exactly one pane as focused', () => {
    renderWorkspace();

    const focused = screen.getByRole('group', { name: 'Terminal pane api-logs' });
    const inactive = screen.getByRole('group', { name: 'Terminal pane shell' });
    expect(focused).toHaveAttribute('aria-current', 'true');
    expect(focused).toHaveClass('workspace-pane--active');
    expect(within(focused).getByText('FOCUSED')).toBeVisible();
    expect(inactive).toHaveAttribute('aria-current', 'false');
    expect(within(inactive).queryByText('FOCUSED')).not.toBeInTheDocument();
  });

  it('focuses a pane on pointer interaction', () => {
    const { props } = renderWorkspace();
    const shellPane = screen.getByRole('group', { name: 'Terminal pane shell' });

    fireEvent.pointerDown(shellPane);

    expect(props.onFocusPane).toHaveBeenCalledWith('pane-shell');
  });

  it('focuses the owning pane when a portaled terminal input receives focus', () => {
    const onFocusPane = vi.fn();
    renderWorkspace({
      onFocusPane,
      renderTab: (currentTab) => <textarea aria-label={`${currentTab.label} input`} />,
    });

    fireEvent.focus(screen.getByRole('textbox', { name: 'shell input' }));

    expect(onFocusPane).toHaveBeenCalledWith('pane-shell');
  });

  it('focuses the owning pane before activating its local tab', () => {
    const calls: string[] = [];
    renderWorkspace({
      onFocusPane: (paneId) => calls.push(`focus:${paneId}`),
      onActivateTab: (paneId, tabId) => calls.push(`tab:${paneId}:${tabId}`),
    });
    const shellPane = screen.getByRole('group', { name: 'Terminal pane shell' });

    fireEvent.click(within(shellPane).getByRole('tab', { name: 'shell' }));

    expect(calls).toEqual(['focus:pane-shell', 'tab:pane-shell:shell']);
  });

  it('keeps inactive local tabs mounted but visually hidden', () => {
    renderWorkspace();

    expect(screen.getByTestId('terminal-api').closest('.workspace-terminal-slot')).not.toHaveAttribute('hidden');
    expect(screen.getByTestId('terminal-debug').closest('.workspace-terminal-slot')).toHaveAttribute('hidden');
  });

  it('zooms one pane without unmounting sibling terminals', () => {
    renderWorkspace({ activePaneId: 'pane-shell', zoomedPaneId: 'pane-shell' });

    const apiPane = document.querySelector('[data-pane-id="pane-api"]');
    const shellPane = screen.getByRole('group', { name: 'Terminal pane shell' });
    expect(apiPane).not.toBeNull();
    expect(apiPane).toHaveAttribute('aria-hidden', 'true');
    expect(shellPane).toHaveClass('workspace-pane--zoomed');
    expect(screen.getByTestId('terminal-api')).toBeInTheDocument();
    expect(screen.getByTestId('terminal-shell')).toBeInTheDocument();
  });

  it('restores keyboard focus to the active terminal after a pane action', async () => {
    function Harness() {
      const [zoomedPaneId, setZoomedPaneId] = useState<string | null>(null);
      return (
        <PaneWorkspace
          root={root}
          tabs={tabs}
          activePaneId="pane-api"
          zoomedPaneId={zoomedPaneId}
          onFocusPane={vi.fn()}
          onActivateTab={vi.fn()}
          onCloseTab={vi.fn()}
          onAddTab={vi.fn()}
          onResizeSplit={vi.fn()}
          onSplitPane={vi.fn()}
          onClosePane={vi.fn()}
          onToggleZoom={(paneId) => setZoomedPaneId(paneId)}
          renderTab={(currentTab) => <textarea aria-label={`${currentTab.label} input`} />}
        />
      );
    }

    render(<Harness />);
    const pane = screen.getAllByRole('group', { name: 'Terminal pane api-logs' })[0];
    fireEvent.contextMenu(pane);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Zoom Pane' }));

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'api-logs input' })).toHaveFocus());
  });
});
