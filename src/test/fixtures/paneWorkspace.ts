export const paneWorkspaceFixture = {
  now: '2026-08-17T09:30:00.000Z',
  viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  kubeconfigPath: '/fixtures/kube/config',
  context: 'production-west',
  namespace: 'brand',
  activePaneId: 'pane-api',
  zoomedPaneId: null,
  layout: {
    kind: 'split', direction: 'row', ratio: 0.56,
    first: { kind: 'leaf', id: 'pane-api', tabIds: ['tab-api'], activeTabId: 'tab-api' },
    second: {
      kind: 'split', direction: 'column', ratio: 0.50,
      first: { kind: 'leaf', id: 'pane-shell', tabIds: ['tab-shell'], activeTabId: 'tab-shell' },
      second: { kind: 'leaf', id: 'pane-worker', tabIds: ['tab-worker'], activeTabId: 'tab-worker' },
    },
  },
  tabs: {
    'tab-api': { label: 'api-logs', lines: [
      '$ kubectl -n brand logs api-7c4f9 --tail=200 -f',
      'Defaulted container "api" out of: api, init',
      '{"level":"INFO","message":"Starting up"}',
      '{"level":"WARN","message":"No XML encryptor configured"}',
    ] },
    'tab-shell': { label: 'shell', lines: [
      '$ kubectl get nodes', 'NAME     STATUS   VERSION',
      'node-1   Ready    v1.31.1', 'node-2   Ready    v1.31.1',
    ] },
    'tab-worker': { label: 'worker-logs', lines: [
      '$ kubectl -n brand logs worker --tail=200 -f',
      '{"level":"INFO","msg":"Worker starting"}',
      '{"level":"INFO","msg":"Connected to broker"}',
    ] },
  },
  resources: [
    { namespace: 'brand', name: 'api-7c4f9', ready: '1/1', status: 'Running' },
    { namespace: 'brand', name: 'worker-86bd8', ready: '1/1', status: 'Running' },
    { namespace: 'brand', name: 'gateway-5f6d2', ready: '1/1', status: 'Running' },
  ],
} as const;
