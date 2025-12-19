import { ResourceDefinition } from './types';
import { kubectl } from './types';

export const configMapResource: ResourceDefinition = {
  type: 'configmap',
  displayName: 'ConfigMap',
  pluralName: 'ConfigMaps',
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
      confirmMessage: ({ resourceName, namespace }) => `Delete ConfigMap ${resourceName} in ${namespace}?`,
      getCommand: ({ namespace, resourceName }) => kubectl(namespace, `delete configmap ${resourceName}`),
    },
  ],
};
