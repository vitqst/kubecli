/**
 * Deployment Resource Definition
 * Independent file containing all deployment-specific actions
 */

import { ResourceDefinition, ResourceAction } from './types';

const viewAction: ResourceAction = {
  id: 'view',
  label: 'View',
  icon: '👁️',
  description: 'View deployment YAML',
  isFavorite: true,
  getCommand: (ctx) => `kubectl get deployment ${ctx.resourceName} -n ${ctx.namespace} -o yaml\n`,
};

const describeAction: ResourceAction = {
  id: 'describe',
  label: 'Describe',
  icon: '📋',
  description: 'Describe deployment details',
  getCommand: (ctx) => `kubectl describe deployment ${ctx.resourceName} -n ${ctx.namespace}\n`,
};

const editAction: ResourceAction = {
  id: 'edit',
  label: 'Edit',
  icon: '✏️',
  description: 'Edit deployment configuration',
  isFavorite: true,
  getCommand: (ctx) => `kubectl edit deployment ${ctx.resourceName} -n ${ctx.namespace}\n`,
};

const logsAction: ResourceAction = {
  id: 'logs',
  label: 'Logs',
  icon: '📜',
  description: 'Show deployment logs (follow)',
  isFavorite: true,
  getCommand: (ctx) => `kubectl logs deploy/${ctx.resourceName} -n ${ctx.namespace} --tail=200 -f\n`,
};

const scaleAction: ResourceAction = {
  id: 'scale',
  label: 'Scale',
  icon: '📊',
  description: 'Scale replicas',
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
    const replicas = values?.replicas || 1;
    return `kubectl scale deployment ${ctx.resourceName} -n ${ctx.namespace} --replicas=${replicas}\n`;
  },
};

const restartAction: ResourceAction = {
  id: 'restart',
  label: 'Restart',
  icon: '🔄',
  description: 'Restart deployment',
  getCommand: (ctx) => `kubectl rollout restart deployment ${ctx.resourceName} -n ${ctx.namespace}\n`,
};

const rolloutStatusAction: ResourceAction = {
  id: 'rollout-status',
  label: 'Rollout Status',
  icon: '📊',
  description: 'Check rollout status',
  getCommand: (ctx) => `kubectl rollout status deployment ${ctx.resourceName} -n ${ctx.namespace}\n`,
};

const rolloutHistoryAction: ResourceAction = {
  id: 'rollout-history',
  label: 'History',
  icon: '📜',
  description: 'View rollout history',
  getCommand: (ctx) => `kubectl rollout history deployment ${ctx.resourceName} -n ${ctx.namespace}\n`,
};

const eventsAction: ResourceAction = {
  id: 'events',
  label: 'Events',
  icon: '📅',
  description: 'Show deployment events',
  getCommand: (ctx) => 
    `kubectl get events -n ${ctx.namespace} --field-selector involvedObject.name=${ctx.resourceName}\n`,
};

const deleteAction: ResourceAction = {
  id: 'delete',
  label: 'Delete',
  icon: '🗑️',
  description: 'Delete deployment',
  confirmMessage: (ctx) => `Are you sure you want to delete deployment "${ctx.resourceName}"? This will terminate all pods. This action cannot be undone.`,
  getCommand: (ctx) => `kubectl delete deployment ${ctx.resourceName} -n ${ctx.namespace}\n`,
};

/**
 * Deployment Resource Definition
 */
export const deploymentResource: ResourceDefinition = {
  type: 'deployment',
  displayName: 'Deployment',
  pluralName: 'Deployments',
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
