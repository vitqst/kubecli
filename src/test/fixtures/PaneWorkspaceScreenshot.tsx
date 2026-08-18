import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PaneWorkspace } from '../../components/workspace/PaneWorkspace';
import {
  findLeaf,
  removeLeaf,
  resizeSplit,
  splitLeaf,
  type LayoutNode,
  type PaneId,
  type PaneLeaf,
  type TabId,
} from '../../workspace/layoutModel';
import { DEFAULT_PANEL_STATE, type Tab } from '../../workspace/types';
import { paneWorkspaceFixture as fixture } from './paneWorkspace';
import './paneWorkspaceScreenshot.css';

type ScreenshotCase =
  | 'nested'
  | 'menu'
  | 'split-right'
  | 'split-down'
  | 'resized'
  | 'zoomed'
  | 'restored'
  | 'min-size';

const fixtureCase = (new URLSearchParams(window.location.search).get('case') ?? 'nested') as ScreenshotCase;
const baseLayout: LayoutNode = {
  ...fixture.layout,
  id: 'split-workspace',
  first: { ...fixture.layout.first, tabIds: [...fixture.layout.first.tabIds] },
  second: {
    ...fixture.layout.second,
    id: 'split-secondary',
    first: { ...fixture.layout.second.first, tabIds: [...fixture.layout.second.first.tabIds] },
    second: { ...fixture.layout.second.second, tabIds: [...fixture.layout.second.second.tabIds] },
  },
};

function leaf(id: PaneId, tabId: TabId): PaneLeaf {
  return { kind: 'leaf', id, tabIds: [tabId], activeTabId: tabId };
}

function initialLayout(testCase: ScreenshotCase): LayoutNode {
  if (testCase === 'split-right') {
    return {
      kind: 'split', id: 'split-right', direction: 'row', ratio: 0.5,
      first: leaf('pane-api', 'tab-api'),
      second: leaf('pane-shell', 'tab-shell'),
    };
  }
  if (testCase === 'split-down') {
    return {
      kind: 'split', id: 'split-down', direction: 'column', ratio: 0.5,
      first: leaf('pane-api', 'tab-api'),
      second: leaf('pane-shell', 'tab-shell'),
    };
  }
  if (testCase === 'resized' && baseLayout.kind === 'split') {
    return { ...baseLayout, ratio: 0.44 };
  }
  if (testCase === 'min-size' && baseLayout.kind === 'split') {
    return {
      ...baseLayout,
      ratio: 0.19,
      second: baseLayout.second.kind === 'split'
        ? { ...baseLayout.second, ratio: 0.78 }
        : baseLayout.second,
    };
  }
  return baseLayout;
}

function updateLeaf(root: LayoutNode, paneId: PaneId, updater: (pane: PaneLeaf) => PaneLeaf): LayoutNode {
  if (root.kind === 'leaf') return root.id === paneId ? updater(root) : root;
  return {
    ...root,
    first: updateLeaf(root.first, paneId, updater),
    second: updateLeaf(root.second, paneId, updater),
  };
}

function FixtureTerminal({ tabId }: { tabId: TabId }) {
  const data = fixture.tabs[tabId as keyof typeof fixture.tabs] ?? {
    label: 'Terminal',
    lines: ['$ kubectl get pods', 'No resources found'],
  };

  return (
    <div className="fixture-terminal" data-testid={`fixture-terminal-${tabId}`}>
      {data.lines.map((line, index) => (
        <div
          className={line.startsWith('$') ? 'fixture-terminal-command' : ''}
          key={`${tabId}-${index}`}
        >
          {line}
        </div>
      ))}
      <span className="fixture-cursor" aria-hidden="true" />
    </div>
  );
}

function FixtureResourcePanel() {
  return (
    <section className="fixture-resource-panel" aria-label="Shared resource panel">
      <div className="fixture-resource-heading">
        <strong>PODS</strong>
        <span>namespace: {fixture.namespace}</span>
        <span className="fixture-resource-shared">SHARED PANEL</span>
      </div>
      <div className="fixture-resource-row fixture-resource-columns">
        <span>NAMESPACE</span><span>NAME</span><span>READY</span><span>STATUS</span>
      </div>
      {fixture.resources.map((resource) => (
        <div className="fixture-resource-row" key={resource.name}>
          <span>{resource.namespace}</span><span>{resource.name}</span>
          <span>{resource.ready}</span><span className="fixture-running">{resource.status}</span>
        </div>
      ))}
    </section>
  );
}

function PaneWorkspaceScreenshot() {
  const [root, setRoot] = useState<LayoutNode>(() => initialLayout(fixtureCase));
  const [activePaneId, setActivePaneId] = useState<PaneId>(
    ['menu', 'zoomed', 'restored'].includes(fixtureCase) ? 'pane-shell' : fixture.activePaneId,
  );
  const [zoomedPaneId, setZoomedPaneId] = useState<PaneId | null>(
    fixtureCase === 'zoomed' ? 'pane-shell' : null,
  );
  const [tabs, setTabs] = useState<Record<TabId, Tab>>(() => Object.fromEntries(
    Object.entries(fixture.tabs).map(([id, tab]) => [id, {
      id,
      label: tab.label,
      panelGroupId: id,
      panelState: { ...DEFAULT_PANEL_STATE },
    }]),
  ));
  const [nextId, setNextId] = useState(1);

  const caseLabel = useMemo(() => fixtureCase.replace('-', ' '), []);

  return (
    <main className="fixture-app" data-screenshot-case={fixtureCase}>
      <header className="fixture-topbar">
        <div className="fixture-brand">KUBECLI</div>
        <div className="fixture-config"><span>CONFIG</span>{fixture.kubeconfigPath}</div>
        <div className="fixture-context"><span>CONTEXT</span>{fixture.context}</div>
        <div className="fixture-case">VISUAL FIXTURE · {caseLabel}</div>
      </header>
      <div className="fixture-main">
        <aside className="fixture-sidebar">
          <div className="fixture-sidebar-label">RESOURCES</div>
          {['📦 Pods', '🚀 Deployments', '⏰ CronJobs', '🌐 Services', '📝 ConfigMaps', '🔐 Secrets'].map((item, index) => (
            <div className={index === 0 ? 'fixture-sidebar-item active' : 'fixture-sidebar-item'} key={item}>{item}</div>
          ))}
        </aside>
        <div className="fixture-content">
          <div className="fixture-workspace-stage">
            <PaneWorkspace
              root={root}
              tabs={tabs}
              activePaneId={activePaneId}
              zoomedPaneId={zoomedPaneId}
              onFocusPane={setActivePaneId}
              onActivateTab={(paneId, tabId) => {
                setActivePaneId(paneId);
                setRoot((current) => updateLeaf(current, paneId, (pane) => ({ ...pane, activeTabId: tabId })));
              }}
              onCloseTab={(paneId, tabId) => {
                const pane = findLeaf(root, paneId);
                if (!pane || pane.tabIds.length === 1) return;
                setRoot((current) => updateLeaf(current, paneId, (currentPane) => {
                  const tabIds = currentPane.tabIds.filter((id) => id !== tabId);
                  return { ...currentPane, tabIds, activeTabId: tabIds[0] };
                }));
                setTabs((current) => {
                  const next = { ...current };
                  delete next[tabId];
                  return next;
                });
              }}
              onAddTab={(paneId) => {
                const tabId = `tab-new-${nextId}`;
                setNextId((value) => value + 1);
                setTabs((current) => ({
                  ...current,
                  [tabId]: {
                    id: tabId,
                    label: 'Terminal',
                    panelGroupId: tabId,
                    panelState: { ...DEFAULT_PANEL_STATE },
                  },
                }));
                setRoot((current) => updateLeaf(current, paneId, (pane) => ({
                  ...pane,
                  tabIds: [...pane.tabIds, tabId],
                  activeTabId: tabId,
                })));
                setActivePaneId(paneId);
              }}
              onResizeSplit={(splitId, ratio) => setRoot((current) => resizeSplit(current, splitId, ratio))}
              onSplitPane={(paneId, direction) => {
                const tabId = `tab-new-${nextId}`;
                const newPaneId = `pane-new-${nextId}`;
                setNextId((value) => value + 1);
                setTabs((current) => ({
                  ...current,
                  [tabId]: {
                    id: tabId,
                    label: 'Terminal',
                    panelGroupId: tabId,
                    panelState: { ...DEFAULT_PANEL_STATE },
                  },
                }));
                setRoot((current) => splitLeaf(
                  current,
                  paneId,
                  direction,
                  leaf(newPaneId, tabId),
                  `split-new-${nextId}`,
                ));
                setActivePaneId(newPaneId);
                setZoomedPaneId(null);
              }}
              onClosePane={(paneId) => {
                const result = removeLeaf(root, paneId);
                if (!result.removed || !result.focusPaneId) return;
                setRoot(result.root);
                setActivePaneId(result.focusPaneId);
                setZoomedPaneId(null);
              }}
              onToggleZoom={(paneId) => {
                setActivePaneId(paneId);
                setZoomedPaneId((current) => current === paneId ? null : paneId);
              }}
              renderTab={(tab) => <FixtureTerminal tabId={tab.id} />}
            />
          </div>
          <FixtureResourcePanel />
        </div>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<PaneWorkspaceScreenshot />);
