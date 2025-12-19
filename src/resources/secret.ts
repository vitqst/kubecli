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
 * Column definitions for secrets - matches kubectl get secrets -A output
 */
const secretColumns: ColumnDefinition[] = [
  { key: 'namespace', label: 'NAMESPACE', path: '.metadata.namespace', flex: 1 },
  { key: 'name', label: 'NAME', path: '.metadata.name', flex: 2 },
  { key: 'type', label: 'TYPE', path: '.type', flex: 1.5 },
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

export const secretResource: ResourceDefinition = {
  type: 'secret',
  displayName: 'Secret',
  pluralName: 'Secrets',
  columns: secretColumns,
  getActions: () => [
    {
      id: 'describe',
      label: 'Describe',
      icon: '🔎',
      description: 'Show details of the Secret',
      isFavorite: true,
      getCommand: ({ namespace, resourceName }) => kubectl(namespace, `describe secret ${resourceName}`),
    },
    {
      id: 'get-yaml',
      label: 'View YAML (base64)',
      icon: '📄',
      description: 'Get Secret YAML (encoded)',
      getCommand: ({ namespace, resourceName }) => kubectl(namespace, `get secret ${resourceName} -o yaml`),
    },
    {
      id: 'decode-all',
      label: 'Decode data',
      icon: '🔐',
      description: 'Decode all secret data keys',
      getCommand: ({ namespace, resourceName }) => kubectl(namespace, `get secret ${resourceName} -o json | jq -r '.data | to_entries[] | "\\(.key): \\(.value | @base64d)"'`),
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: '🗑️',
      description: 'Delete Secret',
      confirmMessage: ({ resourceName, namespace }) => `Delete Secret ${resourceName} in ${namespace}?`,
      getCommand: ({ namespace, resourceName }) => kubectl(namespace, `delete secret ${resourceName}`),
    },
  ],
};
