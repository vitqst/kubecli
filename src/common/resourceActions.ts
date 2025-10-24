/**
 * Resource Action System - SOLID Principles Implementation
 * 
 * This module provides an extensible, configuration-driven approach to defining
 * actions for different Kubernetes resources.
 * 
 * SOLID Principles Applied:
 * - Single Responsibility: Each action has one clear purpose
 * - Open/Closed: Easy to add new resources/actions without modifying existing code
 * - Liskov Substitution: All actions follow the same interface
 * - Interface Segregation: Actions are defined independently
 * - Dependency Inversion: Depends on abstractions (ResourceAction interface)
 */

export type ResourceType = 'pod' | 'deployment' | 'service' | 'job' | 'cronjob' | 'statefulset' | 'daemonset';

export interface ResourceActionContext {
  resourceName: string;
  namespace: string;
  resourceType: ResourceType;
}

export interface ResourceAction {
  id: string;
  label: string;
  icon: string;
  description: string;
  /**
   * Generate the kubectl command for this action
   * @param context - The resource context (name, namespace, type)
   * @returns The kubectl command to execute
   */
  getCommand: (context: ResourceActionContext) => string;
  /**
   * Optional: Check if this action is available for the given resource
   * @param context - The resource context
   * @returns true if action is available, false otherwise
   */
  isAvailable?: (context: ResourceActionContext) => boolean;
}

/**
 * Resource configuration defining which actions are available for each resource type
 */
export interface ResourceConfig {
  type: ResourceType;
  displayName: string;
  pluralName: string;
  actions: ResourceAction[];
}

// ============================================================================
// ACTION DEFINITIONS
// ============================================================================

/**
 * View action - Display resource YAML
 */
export const viewAction: ResourceAction = {
  id: 'view',
  label: 'View',
  icon: '👁️',
  description: 'View resource YAML',
  getCommand: (ctx) => `kubectl get ${ctx.resourceType} ${ctx.resourceName} -n ${ctx.namespace} -o yaml\n`,
};

/**
 * Edit action - Edit resource in default editor
 */
export const editAction: ResourceAction = {
  id: 'edit',
  label: 'Edit',
  icon: '✏️',
  description: 'Edit resource',
  getCommand: (ctx) => `kubectl edit ${ctx.resourceType} ${ctx.resourceName} -n ${ctx.namespace}\n`,
};

/**
 * Describe action - Show detailed resource information
 */
export const describeAction: ResourceAction = {
  id: 'describe',
  label: 'Describe',
  icon: '📋',
  description: 'Describe resource',
  getCommand: (ctx) => `kubectl describe ${ctx.resourceType} ${ctx.resourceName} -n ${ctx.namespace}\n`,
};

/**
 * Delete action - Delete resource
 */
export const deleteAction: ResourceAction = {
  id: 'delete',
  label: 'Delete',
  icon: '🗑️',
  description: 'Delete resource',
  getCommand: (ctx) => `kubectl delete ${ctx.resourceType} ${ctx.resourceName} -n ${ctx.namespace}\n`,
};

/**
 * Exec action - Execute shell in pod
 */
export const execAction: ResourceAction = {
  id: 'exec',
  label: 'Exec',
  icon: '🖥️',
  description: 'Execute shell in container',
  getCommand: (ctx) => 
    `kubectl exec -it ${ctx.resourceName} -n ${ctx.namespace} -- sh || kubectl exec -it ${ctx.resourceName} -n ${ctx.namespace} -- bash\n`,
  isAvailable: (ctx) => ctx.resourceType === 'pod',
};

/**
 * Logs action - Show resource logs
 */
export const logsAction: ResourceAction = {
  id: 'logs',
  label: 'Logs',
  icon: '📜',
  description: 'Show logs',
  getCommand: (ctx) => {
    // For deployments, use deploy/ prefix
    if (ctx.resourceType === 'deployment') {
      return `kubectl logs deploy/${ctx.resourceName} -n ${ctx.namespace} --tail=200 -f\n`;
    }
    // For pods and other resources
    return `kubectl logs ${ctx.resourceName} -n ${ctx.namespace} --tail=200 -f\n`;
  },
  isAvailable: (ctx) => ['pod', 'deployment', 'job', 'statefulset', 'daemonset'].includes(ctx.resourceType),
};

/**
 * Port Forward action - Forward local port to pod
 */
export const portForwardAction: ResourceAction = {
  id: 'port-forward',
  label: 'Port Forward',
  icon: '🔌',
  description: 'Forward port to local machine',
  getCommand: (ctx) => {
    // Default to port 8080, user can modify in terminal
    if (ctx.resourceType === 'service') {
      return `kubectl port-forward svc/${ctx.resourceName} -n ${ctx.namespace} 8080:80\n`;
    }
    return `kubectl port-forward ${ctx.resourceName} -n ${ctx.namespace} 8080:8080\n`;
  },
  isAvailable: (ctx) => ['pod', 'service'].includes(ctx.resourceType),
};

/**
 * Scale action - Scale replicas
 */
export const scaleAction: ResourceAction = {
  id: 'scale',
  label: 'Scale',
  icon: '📊',
  description: 'Scale replicas',
  getCommand: (ctx) => {
    // User will need to specify replica count in terminal
    return `kubectl scale ${ctx.resourceType} ${ctx.resourceName} -n ${ctx.namespace} --replicas=\n`;
  },
  isAvailable: (ctx) => ['deployment', 'statefulset', 'replicaset'].includes(ctx.resourceType),
};

/**
 * Restart action - Restart deployment/statefulset
 */
export const restartAction: ResourceAction = {
  id: 'restart',
  label: 'Restart',
  icon: '🔄',
  description: 'Restart rollout',
  getCommand: (ctx) => `kubectl rollout restart ${ctx.resourceType} ${ctx.resourceName} -n ${ctx.namespace}\n`,
  isAvailable: (ctx) => ['deployment', 'statefulset', 'daemonset'].includes(ctx.resourceType),
};

/**
 * Events action - Show resource events
 */
export const eventsAction: ResourceAction = {
  id: 'events',
  label: 'Events',
  icon: '📅',
  description: 'Show events',
  getCommand: (ctx) => `kubectl get events -n ${ctx.namespace} --field-selector involvedObject.name=${ctx.resourceName}\n`,
};

/**
 * Top action - Show resource usage
 */
export const topAction: ResourceAction = {
  id: 'top',
  label: 'Top',
  icon: '📈',
  description: 'Show resource usage',
  getCommand: (ctx) => `kubectl top ${ctx.resourceType} ${ctx.resourceName} -n ${ctx.namespace}\n`,
  isAvailable: (ctx) => ['pod', 'node'].includes(ctx.resourceType),
};

// ============================================================================
// RESOURCE CONFIGURATIONS
// ============================================================================

/**
 * Pod resource configuration
 */
export const podConfig: ResourceConfig = {
  type: 'pod',
  displayName: 'Pod',
  pluralName: 'Pods',
  actions: [
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

/**
 * Deployment resource configuration
 */
export const deploymentConfig: ResourceConfig = {
  type: 'deployment',
  displayName: 'Deployment',
  pluralName: 'Deployments',
  actions: [
    viewAction,
    describeAction,
    editAction,
    logsAction,
    scaleAction,
    restartAction,
    eventsAction,
    deleteAction,
  ],
};

/**
 * Service resource configuration
 */
export const serviceConfig: ResourceConfig = {
  type: 'service',
  displayName: 'Service',
  pluralName: 'Services',
  actions: [
    viewAction,
    describeAction,
    editAction,
    portForwardAction,
    eventsAction,
    deleteAction,
  ],
};

/**
 * Job resource configuration
 */
export const jobConfig: ResourceConfig = {
  type: 'job',
  displayName: 'Job',
  pluralName: 'Jobs',
  actions: [
    viewAction,
    describeAction,
    editAction,
    logsAction,
    eventsAction,
    deleteAction,
  ],
};

/**
 * CronJob resource configuration
 */
export const cronjobConfig: ResourceConfig = {
  type: 'cronjob',
  displayName: 'CronJob',
  pluralName: 'CronJobs',
  actions: [
    viewAction,
    describeAction,
    editAction,
    eventsAction,
    deleteAction,
  ],
};

/**
 * StatefulSet resource configuration
 */
export const statefulsetConfig: ResourceConfig = {
  type: 'statefulset',
  displayName: 'StatefulSet',
  pluralName: 'StatefulSets',
  actions: [
    viewAction,
    describeAction,
    editAction,
    logsAction,
    scaleAction,
    restartAction,
    eventsAction,
    deleteAction,
  ],
};

/**
 * DaemonSet resource configuration
 */
export const daemonsetConfig: ResourceConfig = {
  type: 'daemonset',
  displayName: 'DaemonSet',
  pluralName: 'DaemonSets',
  actions: [
    viewAction,
    describeAction,
    editAction,
    logsAction,
    restartAction,
    eventsAction,
    deleteAction,
  ],
};

// ============================================================================
// RESOURCE REGISTRY
// ============================================================================

/**
 * Central registry of all resource configurations
 * To add a new resource type, simply add it to this map
 */
export const RESOURCE_CONFIGS: Map<ResourceType, ResourceConfig> = new Map([
  ['pod', podConfig],
  ['deployment', deploymentConfig],
  ['service', serviceConfig],
  ['job', jobConfig],
  ['cronjob', cronjobConfig],
  ['statefulset', statefulsetConfig],
  ['daemonset', daemonsetConfig],
]);

/**
 * Get resource configuration by type
 */
export function getResourceConfig(type: ResourceType): ResourceConfig | undefined {
  return RESOURCE_CONFIGS.get(type);
}

/**
 * Get available actions for a resource
 * Filters out actions that are not available based on their isAvailable check
 */
export function getAvailableActions(
  type: ResourceType,
  context: ResourceActionContext
): ResourceAction[] {
  const config = getResourceConfig(type);
  if (!config) return [];

  return config.actions.filter(
    (action) => !action.isAvailable || action.isAvailable(context)
  );
}

/**
 * Execute a resource action by generating and returning the command
 */
export function executeResourceAction(
  actionId: string,
  context: ResourceActionContext
): string | null {
  const config = getResourceConfig(context.resourceType);
  if (!config) return null;

  const action = config.actions.find((a) => a.id === actionId);
  if (!action) return null;

  // Check if action is available
  if (action.isAvailable && !action.isAvailable(context)) {
    return null;
  }

  return action.getCommand(context);
}
