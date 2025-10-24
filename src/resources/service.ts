/**
 * Service Resource Definition
 * Independent file containing all service-specific actions
 */

import { ResourceDefinition, ResourceAction } from './types';

const viewAction: ResourceAction = {
  id: 'view',
  label: 'View',
  icon: '👁️',
  description: 'View service YAML',
  getCommand: (ctx) => `kubectl get service ${ctx.resourceName} -n ${ctx.namespace} -o yaml\n`,
};

const describeAction: ResourceAction = {
  id: 'describe',
  label: 'Describe',
  icon: '📋',
  description: 'Describe service details',
  getCommand: (ctx) => `kubectl describe service ${ctx.resourceName} -n ${ctx.namespace}\n`,
};

const editAction: ResourceAction = {
  id: 'edit',
  label: 'Edit',
  icon: '✏️',
  description: 'Edit service configuration',
  getCommand: (ctx) => `kubectl edit service ${ctx.resourceName} -n ${ctx.namespace}\n`,
};

const endpointsAction: ResourceAction = {
  id: 'endpoints',
  label: 'Endpoints',
  icon: '🔗',
  description: 'Show service endpoints',
  getCommand: (ctx) => `kubectl get endpoints ${ctx.resourceName} -n ${ctx.namespace}\n`,
};

const portForwardAction: ResourceAction = {
  id: 'port-forward',
  label: 'Port Forward',
  icon: '🔌',
  description: 'Forward service port',
  getCommand: (ctx) => `kubectl port-forward svc/${ctx.resourceName} -n ${ctx.namespace} 8080:80\n`,
};

const eventsAction: ResourceAction = {
  id: 'events',
  label: 'Events',
  icon: '📅',
  description: 'Show service events',
  getCommand: (ctx) => 
    `kubectl get events -n ${ctx.namespace} --field-selector involvedObject.name=${ctx.resourceName}\n`,
};

const deleteAction: ResourceAction = {
  id: 'delete',
  label: 'Delete',
  icon: '🗑️',
  description: 'Delete service',
  getCommand: (ctx) => `kubectl delete service ${ctx.resourceName} -n ${ctx.namespace}\n`,
};

/**
 * Service Resource Definition
 */
export const serviceResource: ResourceDefinition = {
  type: 'service',
  displayName: 'Service',
  pluralName: 'Services',
  getActions: () => [
    viewAction,
    describeAction,
    editAction,
    endpointsAction,
    portForwardAction,
    eventsAction,
    deleteAction,
  ],
};
