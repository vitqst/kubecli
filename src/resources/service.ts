/**
 * Service Resource Definition
 * Independent file containing all service-specific actions
 */

import { ResourceDefinition, ResourceAction, kubectl } from './types';

const viewAction: ResourceAction = {
  id: 'view',
  label: 'View',
  icon: '👁️',
  description: 'View service YAML',
  getCommand: (ctx) => kubectl(ctx.namespace, `get service ${ctx.resourceName} -o yaml\n`),
};

const describeAction: ResourceAction = {
  id: 'describe',
  label: 'Describe',
  icon: '📋',
  description: 'Describe service details',
  getCommand: (ctx) => kubectl(ctx.namespace, `describe service ${ctx.resourceName}\n`),
};

const editAction: ResourceAction = {
  id: 'edit',
  label: 'Edit',
  icon: '✏️',
  description: 'Edit service configuration',
  getCommand: (ctx) => kubectl(ctx.namespace, `edit service ${ctx.resourceName}\n`),
};

const endpointsAction: ResourceAction = {
  id: 'endpoints',
  label: 'Endpoints',
  icon: '🔗',
  description: 'Show service endpoints',
  getCommand: (ctx) => kubectl(ctx.namespace, `get endpoints ${ctx.resourceName}\n`),
};

const portForwardAction: ResourceAction = {
  id: 'port-forward',
  label: 'Port Forward',
  icon: '🔌',
  description: 'Forward service port',
  getCommand: (ctx) => kubectl(ctx.namespace, `port-forward svc/${ctx.resourceName} 8080:80\n`),
};

const eventsAction: ResourceAction = {
  id: 'events',
  label: 'Events',
  icon: '📅',
  description: 'Show service events',
  getCommand: (ctx) => 
    kubectl(ctx.namespace, `get events --field-selector involvedObject.name=${ctx.resourceName}\n`),
};

const deleteAction: ResourceAction = {
  id: 'delete',
  label: 'Delete',
  icon: '🗑️',
  description: 'Delete service',
  confirmMessage: (ctx) => `Are you sure you want to delete service "${ctx.resourceName}"? This action cannot be undone.`,
  getCommand: (ctx) => kubectl(ctx.namespace, `delete service ${ctx.resourceName}\n`),
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
