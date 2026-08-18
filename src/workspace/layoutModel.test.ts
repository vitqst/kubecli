import { describe, expect, it } from 'vitest';
import {
  collectLeaves,
  findLeaf,
  minimumPaneExtent,
  removeLeaf,
  replaceNode,
  resizeSplit,
  splitLeaf,
  type LayoutNode,
  type PaneLeaf,
} from './layoutModel';

const leaf = (id: string, tabId = `tab-${id}`): PaneLeaf => ({
  kind: 'leaf',
  id,
  tabIds: [tabId],
  activeTabId: tabId,
});

describe('layoutModel', () => {
  it('derives recursive minimum extents for nested splits', () => {
    const inner = splitLeaf(leaf('b'), 'b', 'row', leaf('c'), 'inner');
    const nested: LayoutNode = { kind: 'split', id: 'outer', direction: 'row', ratio: 0.5, first: leaf('a'), second: inner };

    expect(minimumPaneExtent(nested, 'row')).toBe(736);
    expect(minimumPaneExtent(nested, 'column')).toBe(120);
  });

  it('splits a leaf to the right and keeps the existing pane first', () => {
    const root = leaf('left');

    const next = splitLeaf(root, 'left', 'row', leaf('right'), 'split-root');

    expect(next).toEqual({
      kind: 'split',
      id: 'split-root',
      direction: 'row',
      ratio: 0.5,
      first: root,
      second: leaf('right'),
    });
  });

  it('splits a nested leaf down without changing its siblings', () => {
    const root = splitLeaf(leaf('left'), 'left', 'row', leaf('right'), 'outer');

    const next = splitLeaf(root, 'right', 'column', leaf('bottom'), 'inner');

    expect(next.kind).toBe('split');
    expect(findLeaf(next, 'left')).toEqual(leaf('left'));
    expect(findLeaf(next, 'right')).toEqual(leaf('right'));
    expect(findLeaf(next, 'bottom')).toEqual(leaf('bottom'));
    expect((next as Extract<LayoutNode, { kind: 'split' }>).second).toMatchObject({
      kind: 'split',
      id: 'inner',
      direction: 'column',
    });
  });

  it('replaces a node at any depth without mutating the original tree', () => {
    const root = splitLeaf(leaf('left'), 'left', 'row', leaf('right'), 'outer');

    const next = replaceNode(root, 'right', leaf('replacement'));

    expect(findLeaf(next, 'replacement')).toBeDefined();
    expect(findLeaf(next, 'right')).toBeUndefined();
    expect(findLeaf(root, 'right')).toBeDefined();
  });

  it('resizes the requested split and clamps unsafe ratios', () => {
    const root = splitLeaf(leaf('left'), 'left', 'row', leaf('right'), 'split-root');

    expect(resizeSplit(root, 'split-root', 0.62)).toMatchObject({ ratio: 0.62 });
    expect(resizeSplit(root, 'split-root', -1)).toMatchObject({ ratio: 0.05 });
    expect(resizeSplit(root, 'split-root', 2)).toMatchObject({ ratio: 0.95 });
  });

  it('removes a leaf and promotes its sibling', () => {
    const root = splitLeaf(leaf('left'), 'left', 'row', leaf('right'), 'split-root');

    const result = removeLeaf(root, 'left');

    expect(result).toEqual({
      root: leaf('right'),
      removed: leaf('left'),
      focusPaneId: 'right',
    });
  });

  it('normalizes nested splits while preserving unaffected branches', () => {
    const right = splitLeaf(leaf('top'), 'top', 'column', leaf('bottom'), 'right-split');
    const root: LayoutNode = {
      kind: 'split',
      id: 'root-split',
      direction: 'row',
      ratio: 0.5,
      first: leaf('left'),
      second: right,
    };

    const result = removeLeaf(root, 'top');

    expect(result.root).toMatchObject({
      kind: 'split',
      id: 'root-split',
      first: { kind: 'leaf', id: 'left' },
      second: { kind: 'leaf', id: 'bottom' },
    });
    expect(result.focusPaneId).toBe('bottom');
  });

  it('refuses to remove the final leaf', () => {
    const root = leaf('only');

    expect(removeLeaf(root, 'only')).toEqual({ root });
  });

  it('collects leaves in visual order', () => {
    const right = splitLeaf(leaf('top'), 'top', 'column', leaf('bottom'), 'right-split');
    const root: LayoutNode = {
      kind: 'split',
      id: 'root-split',
      direction: 'row',
      ratio: 0.5,
      first: leaf('left'),
      second: right,
    };

    expect(collectLeaves(root).map((pane) => pane.id)).toEqual(['left', 'top', 'bottom']);
  });
});
