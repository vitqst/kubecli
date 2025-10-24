/**
 * Resource Registry
 * 
 * This file automatically registers all resource definitions.
 * To add a new resource type:
 * 1. Create a new file in src/resources/ (e.g., statefulset.ts)
 * 2. Define your resource following the ResourceDefinition interface
 * 3. Import and register it here
 * 
 * That's it! The system will automatically pick it up.
 */

import { ResourceType, ResourceDefinition, ResourceAction, ResourceActionContext } from './types';

// Import all resource definitions
import { podResource } from './pod';
import { deploymentResource } from './deployment';
import { cronjobResource } from './cronjob';
import { serviceResource } from './service';

/**
 * Resource Registry
 * Add new resources here to make them available throughout the app
 */
const RESOURCES: ResourceDefinition[] = [
  podResource,
  deploymentResource,
  cronjobResource,
  serviceResource,
  // Add more resources here as you create them
  // Example: statefulsetResource, daemonsetResource, etc.
];

/**
 * Internal registry map for fast lookups
 */
const resourceMap = new Map<ResourceType, ResourceDefinition>(
  RESOURCES.map(resource => [resource.type, resource])
);

/**
 * Get resource definition by type
 */
export function getResourceDefinition(type: ResourceType): ResourceDefinition | undefined {
  return resourceMap.get(type);
}

/**
 * Get all available actions for a resource type
 * Filters actions based on their isAvailable check
 */
export function getAvailableActions(
  type: ResourceType,
  context: ResourceActionContext
): ResourceAction[] {
  const resource = getResourceDefinition(type);
  if (!resource) {
    console.warn(`Resource type "${type}" not found in registry`);
    return [];
  }

  const actions = resource.getActions();
  
  // Filter based on isAvailable check
  return actions.filter(
    action => !action.isAvailable || action.isAvailable(context)
  );
}

/**
 * Get favorite (quick-access) actions for a resource type
 */
export function getFavoriteActions(
  type: ResourceType,
  context: ResourceActionContext
): ResourceAction[] {
  return getAvailableActions(type, context).filter(action => action.isFavorite);
}

/**
 * Get context menu (non-favorite) actions for a resource type
 */
export function getContextMenuActions(
  type: ResourceType,
  context: ResourceActionContext
): ResourceAction[] {
  return getAvailableActions(type, context).filter(action => !action.isFavorite);
}

/**
 * Execute a resource action by generating the command
 */
export function executeResourceAction(
  actionId: string,
  context: ResourceActionContext
): string | null {
  const resource = getResourceDefinition(context.resourceType);
  if (!resource) {
    console.warn(`Resource type "${context.resourceType}" not found`);
    return null;
  }

  const actions = resource.getActions();
  const action = actions.find(a => a.id === actionId);
  
  if (!action) {
    console.warn(`Action "${actionId}" not found for resource type "${context.resourceType}"`);
    return null;
  }

  // Check if action is available
  if (action.isAvailable && !action.isAvailable(context)) {
    console.warn(`Action "${actionId}" is not available for this resource`);
    return null;
  }

  return action.getCommand(context);
}

/**
 * Get all registered resource types
 */
export function getAllResourceTypes(): ResourceType[] {
  return Array.from(resourceMap.keys());
}

/**
 * Get all registered resources
 */
export function getAllResources(): ResourceDefinition[] {
  return RESOURCES;
}

// Re-export types for convenience
export type { ResourceType, ResourceDefinition, ResourceAction, ResourceActionContext };
