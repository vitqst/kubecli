import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { collectLeaves } from '../workspace/layoutModel';
import { useWorkspaceLayout, type WorkspaceIdFactory } from './useWorkspaceLayout';

function deterministicIds(): WorkspaceIdFactory {
  const tabs = ['tab-2', 'tab-3', 'tab-4'];
  const panes = ['pane-2', 'pane-3'];
  const splits = ['split-1', 'split-2'];
  return {
    nextTabId: () => tabs.shift()!,
    nextPaneId: () => panes.shift()!,
    nextSplitId: () => splits.shift()!,
  };
}

describe('useWorkspaceLayout', () => {
  it('starts with one focused pane and one terminal tab', () => {
    const { result } = renderHook(() => useWorkspaceLayout({ idFactory: deterministicIds() }));

    expect(result.current.activePane.id).toBe('pane-default');
    expect(result.current.activeTab).toMatchObject({ id: 'default', label: 'Terminal' });
    expect(result.current.paneCount).toBe(1);
    expect(result.current.visibleTabIds).toEqual(['default']);
  });

  it('adds and activates a tab in the focused pane', () => {
    const { result } = renderHook(() => useWorkspaceLayout({ idFactory: deterministicIds() }));

    act(() => result.current.addTab({ label: 'shell' }));

    expect(result.current.activePane.tabIds).toEqual(['default', 'tab-2']);
    expect(result.current.activeTab).toMatchObject({ id: 'tab-2', label: 'shell' });
  });

  it('splits the focused pane with a new terminal and focuses the new pane', () => {
    const { result } = renderHook(() => useWorkspaceLayout({ idFactory: deterministicIds() }));

    act(() => result.current.splitPane('pane-default', 'row'));

    expect(result.current.paneCount).toBe(2);
    expect(result.current.activePane.id).toBe('pane-2');
    expect(result.current.activeTab.id).toBe('tab-2');
    expect(collectLeaves(result.current.root).map((pane) => pane.id)).toEqual([
      'pane-default',
      'pane-2',
    ]);
  });

  it('keeps new tabs local to the currently focused pane', () => {
    const { result } = renderHook(() => useWorkspaceLayout({ idFactory: deterministicIds() }));

    act(() => result.current.splitPane('pane-default', 'column'));
    act(() => result.current.addTab({ label: 'worker' }));

    expect(result.current.activePane.tabIds).toEqual(['tab-2', 'tab-3']);
    expect(result.current.visibleTabIds).toEqual(['default', 'tab-2', 'tab-3']);
  });

  it('closes a local tab and activates its nearest sibling tab', () => {
    const { result } = renderHook(() => useWorkspaceLayout({ idFactory: deterministicIds() }));
    act(() => result.current.addTab({ label: 'second' }));
    act(() => result.current.addTab({ label: 'third' }));

    act(() => result.current.closeTab('tab-3', 'pane-default'));

    expect(result.current.activePane.tabIds).toEqual(['default', 'tab-2']);
    expect(result.current.activeTab.id).toBe('tab-2');
    expect(result.current.tabs['tab-3']).toBeUndefined();
  });

  it('closes a pane when its last tab closes but keeps the final workspace tab', () => {
    const { result } = renderHook(() => useWorkspaceLayout({ idFactory: deterministicIds() }));
    act(() => result.current.splitPane('pane-default', 'row'));

    act(() => result.current.closeTab('tab-2', 'pane-2'));

    expect(result.current.paneCount).toBe(1);
    expect(result.current.activePane.id).toBe('pane-default');
    expect(result.current.tabs['tab-2']).toBeUndefined();

    act(() => result.current.closeTab('default', 'pane-default'));
    expect(result.current.visibleTabIds).toEqual(['default']);
  });

  it('clears zoom when the zoomed pane closes', () => {
    const { result } = renderHook(() => useWorkspaceLayout({ idFactory: deterministicIds() }));
    act(() => result.current.splitPane('pane-default', 'row'));
    act(() => result.current.toggleZoom('pane-2'));
    expect(result.current.zoomedPaneId).toBe('pane-2');

    act(() => result.current.closePane('pane-2'));

    expect(result.current.zoomedPaneId).toBeNull();
    expect(result.current.activePane.id).toBe('pane-default');
  });

  it('updates resource panel state only for the focused pane active tab', () => {
    const { result } = renderHook(() => useWorkspaceLayout({ idFactory: deterministicIds() }));
    act(() => result.current.splitPane('pane-default', 'row'));

    act(() => result.current.togglePanel('pod'));

    expect(result.current.activeTab.panelState).toMatchObject({
      isOpen: true,
      selectedResourceType: 'pod',
    });
    expect(result.current.tabs.default.panelState.isOpen).toBe(false);
  });
});
