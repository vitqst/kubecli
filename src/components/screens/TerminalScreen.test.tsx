import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalScreen } from './TerminalScreen';
import type { CachedResource } from '../../contexts/ResourceCacheContext';

const terminalLifecycle = vi.hoisted(() => ({
  mounts: [] as string[],
  unmounts: [] as string[],
}));

vi.mock('../Terminal', async () => {
  const React = await import('react');
  return {
    Terminal: ({ id, pendingCommand }: { id: string; pendingCommand?: string | null }) => {
      React.useEffect(() => {
        terminalLifecycle.mounts.push(id);
        return () => {
          terminalLifecycle.unmounts.push(id);
        };
      }, [id]);

      return (
        <div data-testid={`terminal-${id}`} data-pending-command={pendingCommand ?? ''}>
          Terminal {id}
        </div>
      );
    },
  };
});

vi.mock('../../contexts/AuthSessionContext', () => ({
  useAuthSession: () => ({ status: { state: 'authenticated' } }),
}));

const resourceCache = {
  refresh: vi.fn(),
  refreshType: vi.fn(),
  isLoading: false,
  filterByNamespaces: vi.fn((_namespaces?: string[], _type?: string): CachedResource[] => []),
  filterByType: vi.fn((_type?: string): CachedResource[] => []),
  loadingStates: {},
};

vi.mock('../../contexts/ResourceCacheContext', () => ({
  useResourceCache: () => resourceCache,
}));

vi.mock('../../api', () => ({
  auth: { runtimeEnv: vi.fn(() => new Promise(() => {})) },
  window: { openNewWindow: vi.fn() },
}));

const defaultProps: React.ComponentProps<typeof TerminalScreen> = {
  kubeconfigPath: '/tmp/config',
  availableConfigs: [],
  selectedContext: 'development',
  contexts: [{ name: 'development' }],
  selectedNamespace: 'default',
  namespaces: ['default'],
  loadingNamespaces: false,
  isInEditMode: false,
  isConfigChanging: false,
  pendingCommand: null,
  pendingRefresh: null,
  onCommandExecuted: vi.fn(),
  onConfigChange: vi.fn(),
  onContextChange: vi.fn(),
  onNamespaceChange: vi.fn(),
  onResourceAction: vi.fn(),
  onEditModeChange: vi.fn(),
  onGoHome: vi.fn(),
};

describe('TerminalScreen workspace integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    terminalLifecycle.mounts.length = 0;
    terminalLifecycle.unmounts.length = 0;
    resourceCache.filterByNamespaces.mockReturnValue([]);
    resourceCache.filterByType.mockReturnValue([]);
  });

  it('keeps split PTY work linear by mounting only one terminal per split', () => {
    render(<TerminalScreen {...defaultProps} />);

    expect(terminalLifecycle.mounts).toEqual(['default']);
    for (let split = 0; split < 6; split += 1) {
      const activePane = screen
        .getAllByRole('group', { name: 'Terminal pane Terminal' })
        .find((pane) => pane.getAttribute('aria-current') === 'true');
      expect(activePane).toBeDefined();

      fireEvent.contextMenu(activePane!);
      fireEvent.click(screen.getByRole('menuitem', { name: 'Split Right' }));

      expect(terminalLifecycle.mounts).toHaveLength(split + 2);
      expect(new Set(terminalLifecycle.mounts)).toHaveProperty('size', split + 2);
      expect(terminalLifecycle.unmounts).toEqual([]);
    }
  });

  it('keeps one bottom resource panel visible across terminals split from the same tab', () => {
    render(<TerminalScreen {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /Pods/ }));
    expect(screen.getByPlaceholderText('Search pods...')).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByRole('group', { name: 'Terminal pane Terminal' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Split Right' }));

    expect(screen.getAllByPlaceholderText('Search pods...')).toHaveLength(1);

    const originalPane = screen.getAllByRole('group', { name: 'Terminal pane Terminal' })[0];
    fireEvent.pointerDown(originalPane);
    expect(screen.getAllByPlaceholderText('Search pods...')).toHaveLength(1);
  });

  it('splits the active pane and targets a pending command to that pane only', async () => {
    const view = render(<TerminalScreen {...defaultProps} />);

    fireEvent.contextMenu(screen.getByRole('group', { name: 'Terminal pane Terminal' }), {
      clientX: 400,
      clientY: 300,
    });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Split Right' }));

    const panes = screen.getAllByRole('group', { name: 'Terminal pane Terminal' });
    expect(panes).toHaveLength(2);
    expect(panes[1]).toHaveAttribute('aria-current', 'true');

    view.rerender(
      <TerminalScreen {...defaultProps} pendingCommand="kubectl get pods --all-namespaces" />,
    );

    await waitFor(() => {
      const targeted = screen.getAllByTestId(/^terminal-/).filter(
        (terminal) => terminal.dataset.pendingCommand === 'kubectl get pods --all-namespaces',
      );
      expect(targeted).toHaveLength(1);
      expect(panes[1]).toContainElement(targeted[0]);
    });

    fireEvent.pointerDown(panes[0]);
    expect(
      screen.getAllByTestId(/^terminal-/).filter(
        (terminal) => terminal.dataset.pendingCommand === 'kubectl get pods --all-namespaces',
      ),
    ).toHaveLength(1);
    expect(panes[1]).toContainElement(
      screen.getAllByTestId(/^terminal-/).find(
        (terminal) => terminal.dataset.pendingCommand === 'kubectl get pods --all-namespaces',
      )!,
    );
  });

  it('applies tab shortcuts only to the focused pane', () => {
    render(<TerminalScreen {...defaultProps} />);

    fireEvent.contextMenu(screen.getByRole('group', { name: 'Terminal pane Terminal' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Split Down' }));
    fireEvent.keyDown(window, { key: 't', ctrlKey: true });

    const tablists = screen.getAllByRole('tablist', { name: 'Terminal tabs' });
    expect(within(tablists[0]).getAllByRole('tab')).toHaveLength(1);
    expect(within(tablists[1]).getAllByRole('tab')).toHaveLength(2);

    const activeTabsBefore = within(tablists[1]).getAllByRole('tab');
    expect(activeTabsBefore[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true });
    expect(activeTabsBefore[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(window, { key: 'w', ctrlKey: true });
    expect(within(tablists[1]).getAllByRole('tab')).toHaveLength(1);
    expect(within(tablists[0]).getAllByRole('tab')).toHaveLength(1);
  });

  it('keeps a resource action bound to the pane that launched it', async () => {
    resourceCache.filterByNamespaces.mockReturnValue([{
      type: 'pod',
      name: 'api-server-7d9c',
      namespace: 'default',
      status: 'Running',
      info: '',
      columns: {
        namespace: 'default',
        name: 'api-server-7d9c',
        ready: [{ ready: true, restartCount: 0 }],
        status: 'Running',
        restarts: [{ ready: true, restartCount: 0 }],
        age: '2026-08-17T00:00:00.000Z',
      },
    }]);

    function ResourceCommandHarness() {
      const [command, setCommand] = useState<string | null>(null);
      return (
        <TerminalScreen
          {...defaultProps}
          pendingCommand={command}
          onResourceAction={() => setCommand('kubectl get pod api-server-7d9c -o yaml')}
        />
      );
    }

    render(<ResourceCommandHarness />);
    fireEvent.contextMenu(screen.getByRole('group', { name: 'Terminal pane Terminal' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Split Right' }));
    const launchedFromPane = screen.getAllByRole('group', { name: 'Terminal pane Terminal' })[1];

    fireEvent.click(screen.getByRole('button', { name: /Pods/ }));
    const resourceCell = await screen.findByText('api-server-7d9c');
    fireEvent.contextMenu(resourceCell.parentElement!);
    fireEvent.click(screen.getByText('View'));

    await waitFor(() => {
      const targeted = screen.getAllByTestId(/^terminal-/).filter(
        (terminal) => terminal.dataset.pendingCommand === 'kubectl get pod api-server-7d9c -o yaml',
      );
      expect(targeted).toHaveLength(1);
      expect(launchedFromPane).toContainElement(targeted[0]);
    });
    expect(launchedFromPane).toHaveAccessibleName('Terminal pane api-server-7d9c');
  });

  it('honors an explicit target captured before a delayed action is confirmed', async () => {
    const view = render(<TerminalScreen {...defaultProps} />);
    fireEvent.contextMenu(screen.getByRole('group', { name: 'Terminal pane Terminal' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Split Right' }));

    const panes = screen.getAllByRole('group', { name: 'Terminal pane Terminal' });
    const targetTerminal = within(panes[1]).getByTestId(/^terminal-/);
    const targetTabId = targetTerminal.dataset.testid!.replace('terminal-', '');
    fireEvent.pointerDown(panes[0]);

    view.rerender(
      <TerminalScreen
        {...defaultProps}
        pendingCommand="kubectl describe pod api-server-7d9c"
        pendingCommandTargetTabId={targetTabId}
      />,
    );

    await waitFor(() => {
      expect(targetTerminal).toHaveAttribute(
        'data-pending-command',
        'kubectl describe pod api-server-7d9c',
      );
    });
    expect(within(panes[0]).getByTestId(/^terminal-/)).toHaveAttribute('data-pending-command', '');
  });

  it('clears a delayed command instead of redirecting it after its target pane closes', async () => {
    const onCommandExecuted = vi.fn();
    const view = render(
      <TerminalScreen {...defaultProps} onCommandExecuted={onCommandExecuted} />,
    );
    fireEvent.contextMenu(screen.getByRole('group', { name: 'Terminal pane Terminal' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Split Right' }));

    const targetPane = screen.getAllByRole('group', { name: 'Terminal pane Terminal' })[1];
    const targetTabId = within(targetPane)
      .getByTestId(/^terminal-/)
      .dataset.testid!.replace('terminal-', '');
    fireEvent.contextMenu(targetPane);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Close Pane' }));

    view.rerender(
      <TerminalScreen
        {...defaultProps}
        onCommandExecuted={onCommandExecuted}
        pendingCommand="kubectl delete pod api-server-7d9c"
        pendingCommandTargetTabId={targetTabId}
      />,
    );

    await waitFor(() => expect(onCommandExecuted).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('terminal-default')).toHaveAttribute('data-pending-command', '');
  });
});
