import { ResourceDefinition } from './types';
import { kubectl } from './types';

export const secretResource: ResourceDefinition = {
  type: 'secret',
  displayName: 'Secret',
  pluralName: 'Secrets',
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
      getCommand: ({ namespace, resourceName }) => kubectl(namespace, `get secret ${resourceName} -o json | jq -r '.data | to_entries[] | "\(.key): \(.value | @base64d)"'`),
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
