/**
 * CronJob Resource Definition
 * Independent file containing all cronjob-specific actions
 */

import { ResourceDefinition, ResourceAction } from './types';

const viewAction: ResourceAction = {
  id: 'view',
  label: 'View',
  icon: '👁️',
  description: 'View cronjob YAML',
  isFavorite: true,
  getCommand: (ctx) => `kubectl get cronjob ${ctx.resourceName} -n ${ctx.namespace} -o yaml\n`,
};

const describeAction: ResourceAction = {
  id: 'describe',
  label: 'Describe',
  icon: '📋',
  description: 'Describe cronjob details',
  getCommand: (ctx) => `kubectl describe cronjob ${ctx.resourceName} -n ${ctx.namespace}\n`,
};

const editAction: ResourceAction = {
  id: 'edit',
  label: 'Edit',
  icon: '✏️',
  description: 'Edit cronjob configuration',
  isFavorite: true,
  getCommand: (ctx) => `kubectl edit cronjob ${ctx.resourceName} -n ${ctx.namespace}\n`,
};

const triggerAction: ResourceAction = {
  id: 'trigger',
  label: 'Trigger',
  icon: '▶️',
  description: 'Create job from cronjob',
  getCommand: (ctx) => `kubectl create job --from=cronjob/${ctx.resourceName} ${ctx.resourceName}-manual-$(date +%s) -n ${ctx.namespace}\n`,
};

const suspendAction: ResourceAction = {
  id: 'suspend',
  label: 'Suspend',
  icon: '⏸️',
  description: 'Suspend cronjob',
  getCommand: (ctx) => `kubectl patch cronjob ${ctx.resourceName} -n ${ctx.namespace} -p '{"spec":{"suspend":true}}'\n`,
};

const resumeAction: ResourceAction = {
  id: 'resume',
  label: 'Resume',
  icon: '▶️',
  description: 'Resume cronjob',
  getCommand: (ctx) => `kubectl patch cronjob ${ctx.resourceName} -n ${ctx.namespace} -p '{"spec":{"suspend":false}}'\n`,
};

const eventsAction: ResourceAction = {
  id: 'events',
  label: 'Events',
  icon: '📅',
  description: 'Show cronjob events',
  getCommand: (ctx) => 
    `kubectl get events -n ${ctx.namespace} --field-selector involvedObject.name=${ctx.resourceName}\n`,
};

const deleteAction: ResourceAction = {
  id: 'delete',
  label: 'Delete',
  icon: '🗑️',
  description: 'Delete cronjob',
  getCommand: (ctx) => `kubectl delete cronjob ${ctx.resourceName} -n ${ctx.namespace}\n`,
};

/**
 * CronJob Resource Definition
 */
export const cronjobResource: ResourceDefinition = {
  type: 'cronjob',
  displayName: 'CronJob',
  pluralName: 'CronJobs',
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
