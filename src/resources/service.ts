/**
 * Service Resource Definition
 * Independent file containing all service-specific actions
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
 * Column definitions for services - matches kubectl get services -A output
 */
const serviceColumns: ColumnDefinition[] = [
  { key: 'namespace', label: 'NAMESPACE', path: '.metadata.namespace', flex: 1 },
  { key: 'name', label: 'NAME', path: '.metadata.name', flex: 2 },
  { key: 'type', label: 'TYPE', path: '.spec.type', flex: 0.7 },
  { key: 'clusterIP', label: 'CLUSTER-IP', path: '.spec.clusterIP', flex: 1 },
  {
    key: 'externalIP',
    label: 'EXTERNAL-IP',
    path: '.status.loadBalancer.ingress',
    flex: 1,
    transform: (ingress: any[] | null) => {
      if (!ingress || ingress.length === 0) return '<none>';
      return ingress.map(i => i.ip || i.hostname).join(',');
    },
  },
  {
    key: 'ports',
    label: 'PORT(S)',
    path: '.spec.ports',
    flex: 1.2,
    transform: (ports: any[] | null) => {
      if (!ports || ports.length === 0) return '<none>';
      return ports.map(p => `${p.port}${p.nodePort ? ':' + p.nodePort : ''}/${p.protocol || 'TCP'}`).join(',');
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
  columns: serviceColumns,
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
