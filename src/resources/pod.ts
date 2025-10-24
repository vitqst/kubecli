/**
 * Pod Resource Definition
 * Independent file containing all pod-specific actions
 */

import { ResourceDefinition, ResourceAction, ResourceActionContext } from './types';

// Pod-specific actions
const viewAction: ResourceAction = {
  id: 'view',
  label: 'View',
  icon: '👁️',
  description: 'View pod YAML',
  isFavorite: true,
  getCommand: (ctx) => `kubectl get pod ${ctx.resourceName} -n ${ctx.namespace} -o yaml\n`,
};

const describeAction: ResourceAction = {
  id: 'describe',
  label: 'Describe',
  icon: '📋',
  description: 'Describe pod details',
  getCommand: (ctx) => `kubectl describe pod ${ctx.resourceName} -n ${ctx.namespace}\n`,
};

const editAction: ResourceAction = {
  id: 'edit',
  label: 'Edit',
  icon: '✏️',
  description: 'Edit pod configuration',
  getCommand: (ctx) => `kubectl edit pod ${ctx.resourceName} -n ${ctx.namespace}\n`,
};

const execAction: ResourceAction = {
  id: 'exec',
  label: 'Exec',
  icon: '🖥️',
  description: 'Execute shell in pod',
  isFavorite: true,
  getCommand: (ctx) => 
    `kubectl exec -it ${ctx.resourceName} -n ${ctx.namespace} -- sh || kubectl exec -it ${ctx.resourceName} -n ${ctx.namespace} -- bash\n`,
};

const logsAction: ResourceAction = {
  id: 'logs',
  label: 'Logs',
  icon: '📜',
  description: 'Show pod logs (follow)',
  isFavorite: true,
  getCommand: (ctx) => `kubectl logs ${ctx.resourceName} -n ${ctx.namespace} --tail=200 -f\n`,
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
    return `kubectl port-forward ${ctx.resourceName} -n ${ctx.namespace} ${local}:${remote}\n`;
  },
};

const eventsAction: ResourceAction = {
  id: 'events',
  label: 'Events',
  icon: '📅',
  description: 'Show pod events',
  getCommand: (ctx) => 
    `kubectl get events -n ${ctx.namespace} --field-selector involvedObject.name=${ctx.resourceName}\n`,
};

const topAction: ResourceAction = {
  id: 'top',
  label: 'Top',
  icon: '📈',
  description: 'Show resource usage',
  getCommand: (ctx) => `kubectl top pod ${ctx.resourceName} -n ${ctx.namespace}\n`,
};

const deleteAction: ResourceAction = {
  id: 'delete',
  label: 'Delete',
  icon: '🗑️',
  description: 'Delete pod',
  confirmMessage: (ctx) => `Are you sure you want to delete pod "${ctx.resourceName}"? This action cannot be undone.`,
  getCommand: (ctx) => `kubectl delete pod ${ctx.resourceName} -n ${ctx.namespace}\n`,
};

/**
 * Pod Resource Definition
 * Export this to register the resource
 */
export const podResource: ResourceDefinition = {
  type: 'pod',
  displayName: 'Pod',
  pluralName: 'Pods',
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
