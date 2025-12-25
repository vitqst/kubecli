import { ResourceDefinition, ColumnDefinition } from './types';
import { kubectl } from './types';

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
 * Column definitions for configmaps - matches kubectl get configmaps -A output
 */
const configmapColumns: ColumnDefinition[] = [
  { key: 'namespace', label: 'NAMESPACE', path: '.metadata.namespace', flex: 1 },
  { key: 'name', label: 'NAME', path: '.metadata.name', flex: 2 },
  {
    key: 'data',
    label: 'DATA',
    path: '.data',
    flex: 0.5,
    transform: (data: Record<string, string> | null) => String(data ? Object.keys(data).length : 0),
  },
  {
    key: 'age',
    label: 'AGE',
    path: '.metadata.creationTimestamp',
    flex: 0.5,
    transform: formatAge,
  },
];

export const configMapResource: ResourceDefinition = {
  type: 'configmap',
  displayName: 'ConfigMap',
  pluralName: 'ConfigMaps',
  columns: configmapColumns,
  getActions: () => [
    {
      id: 'describe',
      label: 'Describe',
      icon: '🔎',
      description: 'Show details of the ConfigMap',
      isFavorite: true,
      getCommand: ({ namespace, resourceName }) => kubectl(namespace, `describe configmap ${resourceName}`),
    },
    {
      id: 'get-yaml',
      label: 'View YAML',
      icon: '📄',
      description: 'Get ConfigMap YAML',
      getCommand: ({ namespace, resourceName }) => kubectl(namespace, `get configmap ${resourceName} -o yaml`),
    },
    {
      id: 'edit',
      label: 'Edit',
      icon: '✏️',
      description: 'Edit ConfigMap',
      getCommand: ({ namespace, resourceName }) => kubectl(namespace, `edit configmap ${resourceName}`),
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: '🗑️',
      description: 'Delete ConfigMap',
      refreshAfterMs: 5000, // Auto-refresh to remove from list
      confirmMessage: ({ resourceName, namespace }) => `Delete ConfigMap ${resourceName} in ${namespace}?`,
      getCommand: ({ namespace, resourceName }) => kubectl(namespace, `delete configmap ${resourceName}`),
    },
  ],
};
