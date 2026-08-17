export type PaneId = string;
export type TabId = string;

export interface PaneLeaf {
  kind: 'leaf';
  id: PaneId;
  tabIds: TabId[];
  activeTabId: TabId;
}

export interface SplitNode {
  kind: 'split';
  id: string;
  direction: 'row' | 'column';
  ratio: number;
  first: LayoutNode;
  second: LayoutNode;
}

export type LayoutNode = PaneLeaf | SplitNode;

export interface RemoveLeafResult {
  root: LayoutNode;
  removed?: PaneLeaf;
  focusPaneId?: PaneId;
}

const MIN_RATIO = 0.05;
const MAX_RATIO = 0.95;

export function findLeaf(node: LayoutNode, paneId: PaneId): PaneLeaf | undefined {
  if (node.kind === 'leaf') return node.id === paneId ? node : undefined;
  return findLeaf(node.first, paneId) ?? findLeaf(node.second, paneId);
}

export function collectLeaves(node: LayoutNode): PaneLeaf[] {
  if (node.kind === 'leaf') return [node];
  return [...collectLeaves(node.first), ...collectLeaves(node.second)];
}

export function replaceNode(
  node: LayoutNode,
  nodeId: string,
  replacement: LayoutNode,
): LayoutNode {
  if (node.id === nodeId) return replacement;
  if (node.kind === 'leaf') return node;

  const first = replaceNode(node.first, nodeId, replacement);
  const second = replaceNode(node.second, nodeId, replacement);
  if (first === node.first && second === node.second) return node;
  return { ...node, first, second };
}

export function splitLeaf(
  root: LayoutNode,
  paneId: PaneId,
  direction: SplitNode['direction'],
  newLeaf: PaneLeaf,
  splitId: string,
): LayoutNode {
  const target = findLeaf(root, paneId);
  if (!target) return root;

  return replaceNode(root, paneId, {
    kind: 'split',
    id: splitId,
    direction,
    ratio: 0.5,
    first: target,
    second: newLeaf,
  });
}

export function resizeSplit(root: LayoutNode, splitId: string, ratio: number): LayoutNode {
  if (root.kind === 'leaf') return root;
  if (root.id === splitId) {
    return { ...root, ratio: Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio)) };
  }

  const first = resizeSplit(root.first, splitId, ratio);
  const second = resizeSplit(root.second, splitId, ratio);
  if (first === root.first && second === root.second) return root;
  return { ...root, first, second };
}

function firstLeaf(node: LayoutNode): PaneLeaf {
  return node.kind === 'leaf' ? node : firstLeaf(node.first);
}

export function removeLeaf(root: LayoutNode, paneId: PaneId): RemoveLeafResult {
  if (root.kind === 'leaf') return { root };

  if (root.first.kind === 'leaf' && root.first.id === paneId) {
    return {
      root: root.second,
      removed: root.first,
      focusPaneId: firstLeaf(root.second).id,
    };
  }

  if (root.second.kind === 'leaf' && root.second.id === paneId) {
    return {
      root: root.first,
      removed: root.second,
      focusPaneId: firstLeaf(root.first).id,
    };
  }

  const firstResult = removeLeaf(root.first, paneId);
  if (firstResult.removed) {
    return {
      ...firstResult,
      root: { ...root, first: firstResult.root },
    };
  }

  const secondResult = removeLeaf(root.second, paneId);
  if (secondResult.removed) {
    return {
      ...secondResult,
      root: { ...root, second: secondResult.root },
    };
  }

  return { root };
}
