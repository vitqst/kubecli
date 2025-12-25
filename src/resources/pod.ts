/**
 * Pod Resource Definition
 * Independent file containing all pod-specific actions
 */

import { ResourceDefinition, ResourceAction, ResourceActionContext, kubectl, ColumnDefinition } from './types';

/**
 * Helper to format age from timestamp
 */
function formatAge(timestamp: string): string {
  if (!timestamp) return '-';
  const created = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d`;
  if (diffHours > 0) return `${diffHours}h`;
  if (diffMins > 0) return `${diffMins}m`;
  return `${diffSecs}s`;
}

/**
 * Column definitions for pods - matches kubectl get pods -A output
 */
const podColumns: ColumnDefinition[] = [
  { key: 'namespace', label: 'NAMESPACE', path: '.metadata.namespace', flex: 1 },
  { key: 'name', label: 'NAME', path: '.metadata.name', flex: 2 },
  {
    key: 'ready',
    label: 'READY',
    path: '.status.containerStatuses',
    flex: 0.5,
    transform: (statuses: any[] | null) => {
      if (!statuses || !Array.isArray(statuses)) return '0/0';
      const ready = statuses.filter(s => s?.ready).length;
      return `${ready}/${statuses.length}`;
    },
  },
  { key: 'status', label: 'STATUS', path: '.status.phase', flex: 0.7 },
  {
    key: 'restarts',
    label: 'RESTARTS',
    path: '.status.containerStatuses',
    flex: 0.6,
    transform: (statuses: any[] | null) => {
      if (!statuses || !Array.isArray(statuses)) return '0';
      const total = statuses.reduce((sum, s) => sum + (s?.restartCount || 0), 0);
      return String(total);
    },
  },
  {
    key: 'age',
    label: 'AGE',
    path: '.metadata.creationTimestamp',
    flex: 0.5,
    transform: formatAge,
  },
];

// Pod-specific actions
const viewAction: ResourceAction = {
  id: 'view',
  label: 'View',
  icon: '👁️',
  description: 'View pod YAML',
  isFavorite: true,
  getCommand: (ctx) => kubectl(ctx.namespace, `get pod ${ctx.resourceName} -o yaml\n`),
};

const describeAction: ResourceAction = {
  id: 'describe',
  label: 'Describe',
  icon: '📋',
  description: 'Describe pod details',
  getCommand: (ctx) => kubectl(ctx.namespace, `describe pod ${ctx.resourceName}\n`),
};

const editAction: ResourceAction = {
  id: 'edit',
  label: 'Edit',
  icon: '✏️',
  description: 'Edit pod configuration',
  getCommand: (ctx) => kubectl(ctx.namespace, `edit pod ${ctx.resourceName}\n`),
};

const execAction: ResourceAction = {
  id: 'exec',
  label: 'Exec',
  icon: '🖥️',
  description: 'Execute shell in pod',
  isFavorite: true,
  getCommand: (ctx) => 
    kubectl(ctx.namespace, `exec -it ${ctx.resourceName} -- sh || kubectl exec -it ${ctx.resourceName} -n ${ctx.namespace} -- bash\n`),
};

const logsAction: ResourceAction = {
  id: 'logs',
  label: 'Logs',
  icon: '📜',
  description: 'Show pod logs (follow)',
  isFavorite: true,
  getCommand: (ctx) => kubectl(ctx.namespace, `logs ${ctx.resourceName} --tail=200 -f\n`),
};

const portForwardAction: ResourceAction = {
  id: 'port-forward',
  label: 'Port Forward',
  icon: '🔌',
  description: 'Forward port to local machine',
  prompts: [
    {
      name: 'localPort',
      label: 'Local Port',
      type: 'number',
      placeholder: '8080',
      defaultValue: 8080,
      required: true,
      min: 1,
      max: 65535,
    },
    {
      name: 'remotePort',
      label: 'Pod Port',
      type: 'number',
      placeholder: '8080',
      defaultValue: 8080,
      required: true,
      min: 1,
      max: 65535,
    },
  ],
  getCommand: (ctx, values) => {
    const local = values?.localPort || 8080;
    const remote = values?.remotePort || 8080;
    return kubectl(ctx.namespace, `port-forward ${ctx.resourceName} ${local}:${remote}\n`);
  },
};

const eventsAction: ResourceAction = {
  id: 'events',
  label: 'Events',
  icon: '📅',
  description: 'Show pod events',
  getCommand: (ctx) => 
    kubectl(ctx.namespace, `get events --field-selector involvedObject.name=${ctx.resourceName}\n`),
};

const topAction: ResourceAction = {
  id: 'top',
  label: 'Top',
  icon: '📈',
  description: 'Show resource usage',
  getCommand: (ctx) => kubectl(ctx.namespace, `top pod ${ctx.resourceName}\n`),
};

const deleteAction: ResourceAction = {
  id: 'delete',
  label: 'Delete',
  icon: '🗑️',
  description: 'Delete pod',
  refreshAfterMs: 5000, // Auto-refresh to remove from list
  confirmMessage: (ctx) => `Are you sure you want to delete pod "${ctx.resourceName}"? This action cannot be undone.`,
  getCommand: (ctx) => kubectl(ctx.namespace, `delete pod ${ctx.resourceName}\n`),
};

/**
 * Pod Resource Definition
 * Export this to register the resource
 */
export const podResource: ResourceDefinition = {
  type: 'pod',
  displayName: 'Pod',
  pluralName: 'Pods',
  columns: podColumns,
  getActions: () => [
    viewAction,
    describeAction,
    editAction,
    execAction,
    logsAction,
    portForwardAction,
    eventsAction,
    topAction,
    deleteAction,
  ],
};
