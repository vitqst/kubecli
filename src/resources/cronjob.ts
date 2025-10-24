/**
 * CronJob Resource Definition
 * Independent file containing all cronjob-specific actions
 * 
 * Note: CronJobs in TerminalSidebar are stored as "namespace/name"
 * so we use kubectlWithNs() helper which doesn't add -n flag
 */

import { ResourceDefinition, ResourceAction, kubectl } from './types';

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
