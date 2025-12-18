// src/commands/quickCommands.ts

export interface QuickCommand {
  id: string;
  label: string;
  icon: string;
  category: 'resources' | 'cluster' | 'debugging';
  description: string;
  /** Whether this command requires a namespace */
  namespaced: boolean;
  /** Generate the kubectl command */
  getCommand: (namespace?: string) => string;
}

export const QUICK_COMMANDS: QuickCommand[] = [
  // Resources
  {
    id: 'list-pods',
    label: 'List Pods',
    icon: '📦',
    category: 'resources',
    description: 'List all pods in namespace',
    namespaced: true,
    getCommand: (ns) => `kubectl get pods -n ${ns}`,
  },
  {
    id: 'list-deployments',
    label: 'List Deployments',
    icon: '🚀',
    category: 'resources',
    description: 'List all deployments in namespace',
    namespaced: true,
    getCommand: (ns) => `kubectl get deployments -n ${ns}`,
  },
  {
    id: 'list-services',
    label: 'List Services',
    icon: '🌐',
    category: 'resources',
    description: 'List all services in namespace',
    namespaced: true,
    getCommand: (ns) => `kubectl get services -n ${ns}`,
  },
  {
    id: 'list-secrets',
    label: 'List Secrets',
    icon: '🔐',
    category: 'resources',
    description: 'List all secrets in namespace',
    namespaced: true,
    getCommand: (ns) => `kubectl get secrets -n ${ns}`,
  },
  {
    id: 'list-configmaps',
    label: 'List ConfigMaps',
    icon: '📄',
    category: 'resources',
    description: 'List all configmaps in namespace',
    namespaced: true,
    getCommand: (ns) => `kubectl get configmaps -n ${ns}`,
  },
  {
    id: 'list-ingresses',
    label: 'List Ingresses',
    icon: '🌍',
    category: 'resources',
    description: 'List all ingresses in namespace',
    namespaced: true,
    getCommand: (ns) => `kubectl get ingresses -n ${ns}`,
  },
  // Cluster
  {
    id: 'get-nodes',
    label: 'Get Nodes',
    icon: '🖥️',
    category: 'cluster',
    description: 'List all cluster nodes',
    namespaced: false,
    getCommand: () => 'kubectl get nodes',
  },
  {
    id: 'cluster-info',
    label: 'Cluster Info',
    icon: '📊',
    category: 'cluster',
    description: 'Display cluster information',
    namespaced: false,
    getCommand: () => 'kubectl cluster-info',
  },
  {
    id: 'get-namespaces',
    label: 'Get Namespaces',
    icon: '📁',
    category: 'cluster',
    description: 'List all namespaces',
    namespaced: false,
    getCommand: () => 'kubectl get namespaces',
  },
  // Debugging
  {
    id: 'view-events',
    label: 'View Events',
    icon: '📋',
    category: 'debugging',
    description: 'View recent events in namespace',
    namespaced: true,
    getCommand: (ns) => `kubectl get events -n ${ns} --sort-by='.lastTimestamp'`,
  },
  {
    id: 'top-pods',
    label: 'Top Pods',
    icon: '📈',
    category: 'debugging',
    description: 'Show pod resource usage',
    namespaced: true,
    getCommand: (ns) => `kubectl top pods -n ${ns}`,
  },
  {
    id: 'top-nodes',
    label: 'Top Nodes',
    icon: '📉',
    category: 'debugging',
    description: 'Show node resource usage',
    namespaced: false,
    getCommand: () => 'kubectl top nodes',
  },
];

/** Get commands sorted with recent first */
export function getCommandsWithRecent(): QuickCommand[] {
  const recentIds = getRecentCommandIds();
  const recentCommands = recentIds
    .map(id => QUICK_COMMANDS.find(c => c.id === id))
    .filter((c): c is QuickCommand => c !== undefined);

  const otherCommands = QUICK_COMMANDS.filter(c => !recentIds.includes(c.id));

  return [...recentCommands, ...otherCommands];
}

const RECENT_COMMANDS_KEY = 'kubecli-recent-commands';
const MAX_RECENT = 5;

export function getRecentCommandIds(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_COMMANDS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function addRecentCommand(commandId: string): void {
  const recent = getRecentCommandIds().filter(id => id !== commandId);
  recent.unshift(commandId);
  localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}
