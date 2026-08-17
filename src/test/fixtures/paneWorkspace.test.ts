import { describe, expect, it } from 'vitest';
import { collectLeaves, type LayoutNode } from '../../workspace/layoutModel';
import { paneWorkspaceFixture } from './paneWorkspace';

describe('pane workspace screenshot fixture', () => {
  it('uses the frozen public fake dataset expected by the visual baselines', () => {
    expect(paneWorkspaceFixture.now).toBe('2026-08-17T09:30:00.000Z');
    expect(paneWorkspaceFixture.viewport).toEqual({
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
    });
    expect(paneWorkspaceFixture.kubeconfigPath).toBe('/fixtures/kube/config');
    expect(paneWorkspaceFixture.context).toBe('production-west');
    expect(paneWorkspaceFixture.namespace).toBe('brand');
    expect(paneWorkspaceFixture.resources).toHaveLength(3);
  });

  it('references each fake tab exactly once from the three-pane tree', () => {
    const leaves = collectLeaves(paneWorkspaceFixture.layout as unknown as LayoutNode);
    const referencedTabIds = leaves.flatMap((pane) => pane.tabIds);

    expect(leaves.map((pane) => pane.id)).toEqual(['pane-api', 'pane-shell', 'pane-worker']);
    expect(referencedTabIds).toEqual(['tab-api', 'tab-shell', 'tab-worker']);
    expect(new Set(referencedTabIds).size).toBe(referencedTabIds.length);
    expect(Object.keys(paneWorkspaceFixture.tabs)).toEqual(referencedTabIds);
  });
});
