/**
 * Deployment Resource Definition
 * Independent file containing all deployment-specific actions
 */

import { ResourceDefinition, ResourceAction, kubectl, ColumnDefinition } from './types';

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
 * Column definitions for deployments - matches kubectl get deployments -A output
 */
const deploymentColumns: ColumnDefinition[] = [
  { key: 'namespace', label: 'NAMESPACE', path: '.metadata.namespace', flex: 1 },
  { key: 'name', label: 'NAME', path: '.metadata.name', flex: 2 },
  {
    key: 'ready',
    label: 'READY',
    path: '.status',
    flex: 0.5,
    transform: (status: any) => {
      const ready = status?.readyReplicas || 0;
      const desired = status?.replicas || 0;
      return `${ready}/${desired}`;
    },
  },
  {
    key: 'upToDate',
    label: 'UP-TO-DATE',
    path: '.status.updatedReplicas',
    flex: 0.7,
    transform: (val: number | null) => String(val ?? 0),
  },
  {
    key: 'available',
    label: 'AVAILABLE',
    path: '.status.availableReplicas',
    flex: 0.7,
    transform: (val: number | null) => String(val ?? 0),
  },
  {
    key: 'age',
    label: 'AGE',
    path: '.metadata.creationTimestamp',
    flex: 0.5,
    transform: formatAge,
  },
];

const viewAction: ResourceAction = {
  id: 'view',
  label: 'View',
  icon: '👁️',
  description: 'View deployment YAML',
  isFavorite: true,
  getCommand: (ctx) => kubectl(ctx.namespace, `get deployment ${ctx.resourceName} -o yaml\n`),
};

const describeAction: ResourceAction = {
  id: 'describe',
  label: 'Describe',
  icon: '📋',
  description: 'Describe deployment details',
  getCommand: (ctx) => kubectl(ctx.namespace, `describe deployment ${ctx.resourceName}\n`),
};

const editAction: ResourceAction = {
  id: 'edit',
  label: 'Edit',
  icon: '✏️',
  description: 'Edit deployment configuration',
  isFavorite: true,
  getCommand: (ctx) => kubectl(ctx.namespace, `edit deployment ${ctx.resourceName}\n`),
};

const logsAction: ResourceAction = {
  id: 'logs',
  label: 'Logs',
  icon: '📜',
  description: 'Show deployment logs (follow)',
  isFavorite: true,
  getCommand: (ctx) => kubectl(ctx.namespace, `logs deploy/${ctx.resourceName} --tail=200 -f\n`),
};

const scaleAction: ResourceAction = {
  id: 'scale',
  label: 'Scale',
  icon: '📊',
  description: 'Scale replicas',
  refreshAfterMs: 5000, // Auto-refresh after 2s to show updated replica count
  prompts: [
    {
      name: 'replicas',
      label: 'Number of Replicas',
      type: 'number',
      placeholder: 'Enter replica count',
      required: true,
      min: 0,
      max: 100,
      getCurrentValue: async (ctx) => {
        // This would need to be implemented in the component to fetch current replicas
        // For now, return undefined and let user enter manually
        return undefined;
      },
    },
  ],
  getCommand: (ctx, values) => {
    const replicas = values?.replicas ?? 1;
    return kubectl(ctx.namespace, `scale deployment ${ctx.resourceName} --replicas=${replicas}\n`);
  },
};

const restartAction: ResourceAction = {
  id: 'restart',
  label: 'Restart',
  icon: '🔄',
  description: 'Restart deployment',
  refreshAfterMs: 5000, // Auto-refresh after 3s to show pod changes
  getCommand: (ctx) => kubectl(ctx.namespace, `rollout restart deployment ${ctx.resourceName}\n`),
};

const rolloutStatusAction: ResourceAction = {
  id: 'rollout-status',
  label: 'Rollout Status',
  icon: '📊',
  description: 'Check rollout status',
  getCommand: (ctx) => kubectl(ctx.namespace, `rollout status deployment ${ctx.resourceName}\n`),
};

const rolloutHistoryAction: ResourceAction = {
  id: 'rollout-history',
  label: 'History',
  icon: '📜',
  description: 'View rollout history',
  getCommand: (ctx) => kubectl(ctx.namespace, `rollout history deployment ${ctx.resourceName}\n`),
};

const eventsAction: ResourceAction = {
  id: 'events',
  label: 'Events',
  icon: '📅',
  description: 'Show deployment events',
  getCommand: (ctx) => 
    kubectl(ctx.namespace, `get events --field-selector involvedObject.name=${ctx.resourceName}\n`),
};

const deleteAction: ResourceAction = {
  id: 'delete',
  label: 'Delete',
  icon: '🗑️',
  description: 'Delete deployment',
  refreshAfterMs: 5000, // Auto-refresh to remove from list
  confirmMessage: (ctx) => `Are you sure you want to delete deployment "${ctx.resourceName}"? This will terminate all pods. This action cannot be undone.`,
  getCommand: (ctx) => kubectl(ctx.namespace, `delete deployment ${ctx.resourceName}\n`),
};

/**
 * Deployment Resource Definition
 */
export const deploymentResource: ResourceDefinition = {
  type: 'deployment',
  displayName: 'Deployment',
  pluralName: 'Deployments',
  columns: deploymentColumns,
  getActions: () => [
    viewAction,
    describeAction,
    editAction,
    logsAction,
    scaleAction,
    restartAction,
    rolloutStatusAction,
    rolloutHistoryAction,
    eventsAction,
    deleteAction,
  ],
};
