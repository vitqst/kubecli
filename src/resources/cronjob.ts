/**
 * CronJob Resource Definition
 * Independent file containing all cronjob-specific actions
 *
 * Note: CronJobs in TerminalSidebar are stored as "namespace/name"
 * so we use kubectlWithNs() helper which doesn't add -n flag
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
 * Column definitions for cronjobs - matches kubectl get cronjobs -A output
 */
const cronjobColumns: ColumnDefinition[] = [
  { key: 'namespace', label: 'NAMESPACE', path: '.metadata.namespace', flex: 1 },
  { key: 'name', label: 'NAME', path: '.metadata.name', flex: 2 },
  { key: 'schedule', label: 'SCHEDULE', path: '.spec.schedule', flex: 1 },
  {
    key: 'suspend',
    label: 'SUSPEND',
    path: '.spec.suspend',
    flex: 0.5,
    transform: (val: boolean | null) => val ? 'True' : 'False',
  },
  {
    key: 'active',
    label: 'ACTIVE',
    path: '.status.active',
    flex: 0.5,
    transform: (val: any[] | null) => String(val?.length ?? 0),
  },
  {
    key: 'lastSchedule',
    label: 'LAST SCHEDULE',
    path: '.status.lastScheduleTime',
    flex: 0.8,
    transform: formatAge,
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
  description: 'View cronjob YAML',
  isFavorite: true,
  getCommand: (ctx) =>  kubectl(ctx.namespace, `get cronjobs/${ctx.resourceName} -o yaml\n`),
};

const describeAction: ResourceAction = {
  id: 'describe',
  label: 'Describe',
  icon: '📋',
  description: 'Describe cronjob details',
  getCommand: (ctx) => kubectl(ctx.namespace, `describe cronjobs/${ctx.resourceName}\n`),
};

const editAction: ResourceAction = {
  id: 'edit',
  label: 'Edit',
  icon: '✏️',
  description: 'Edit cronjob configuration',
  isFavorite: true,
  getCommand: (ctx) => kubectl(ctx.namespace, `edit cronjobs/${ctx.resourceName}\n`),
};

const triggerAction: ResourceAction = {
  id: 'trigger',
  label: 'Trigger',
  icon: '▶️',
  description: 'Create job from cronjob',
  getCommand: (ctx) => kubectl(ctx.namespace, `create job --from=cronjobs/${ctx.resourceName} ${ctx.resourceName}-manual-$(date +%s)\n`),
};

const suspendAction: ResourceAction = {
  id: 'suspend',
  label: 'Suspend',
  icon: '⏸️',
  description: 'Suspend cronjob',
  getCommand: (ctx) => kubectl(ctx.namespace, `patch cronjobs/${ctx.resourceName} -p '{"spec":{"suspend":true}}'\n`),
};

const resumeAction: ResourceAction = {
  id: 'resume',
  label: 'Resume',
  icon: '▶️',
  description: 'Resume cronjob',
  getCommand: (ctx) => kubectl(ctx.namespace, `patch cronjobs/${ctx.resourceName} -p '{"spec":{"suspend":false}}'\n`),
};

const eventsAction: ResourceAction = {
  id: 'events',
  label: 'Events',
  icon: '📅',
  description: 'Show cronjob events',
  getCommand: (ctx) => 
    kubectl(ctx.namespace, `get events --field-selector involvedObject.name=${ctx.resourceName}\n`),
};

const deleteAction: ResourceAction = {
  id: 'delete',
  label: 'Delete',
  icon: '🗑️',
  description: 'Delete cronjob',
  confirmMessage: (ctx) => `Are you sure you want to delete cronjob "${ctx.resourceName}"? This action cannot be undone.`,
  getCommand: (ctx) => kubectl(ctx.namespace, `delete cronjobs/${ctx.resourceName}\n`),
};

/**
 * CronJob Resource Definition
 */
export const cronjobResource: ResourceDefinition = {
  type: 'cronjob',
  displayName: 'CronJob',
  pluralName: 'CronJobs',
  kubectlName: 'cronjobs',  // kubectl uses plural form
  columns: cronjobColumns,
  getActions: () => [
    viewAction,
    describeAction,
    editAction,
    triggerAction,
    suspendAction,
    resumeAction,
    eventsAction,
    deleteAction,
  ],
};
