/**
 * Base types and interfaces for the resource action system
 * This file contains only type definitions - no implementations
 */

export type ResourceType =
  | 'pod'
  | 'deployment'
  | 'service'
  | 'job'
  | 'cronjob'
  | 'statefulset'
  | 'daemonset'
  | 'configmap'
  | 'secret'
  | 'ingress';

/**
 * Column definition for displaying resource data in ResourcePanel
 */
export interface ColumnDefinition {
  /** Unique identifier for this column */
  key: string;
  /** Header text displayed in the table */
  label: string;
  /** kubectl JSON path to extract the value (e.g., '.metadata.name') */
  path: string;
  /** CSS grid flex value (fr units) for column width */
  flex: number;
  /** Optional transform function to format the raw value for display */
  transform?: (value: any) => string;
}

export interface ResourceActionContext {
  resourceName: string;
  namespace: string;
  resourceType: ResourceType;
}

/**
 * Helper function to generate kubectl command with namespace
 * Use this for resources that need explicit namespace
 */
export function kubectl(namespace: string, command: string): string {
  return `kubectl -n ${namespace} ${command}`;
}

/**
 * Helper function for resources where namespace is in the resource name
 * (e.g., cronjobs stored as "namespace/name")
 * Uses the namespace from the resource name itself
 */
export function kubectlWithNs(command: string): string {
  return `kubectl ${command}`;
}

export type PromptFieldType = 'text' | 'number' | 'confirm' | 'select';

export interface PromptField {
  name: string;
  label: string;
  type: PromptFieldType;
  placeholder?: string;
  defaultValue?: string | number;
  required?: boolean;
  options?: Array<{ value: string; label: string }>; // For select type
  min?: number; // For number type
  max?: number; // For number type
  /**
   * Get current value from context (e.g., current replica count)
   */
  getCurrentValue?: (context: ResourceActionContext) => Promise<string | number | undefined>;
}

export interface ResourceAction {
  id: string;
  label: string;
  icon: string;
  description: string;
  /**
   * Generate the kubectl command for this action
   * If prompts are defined, values will be passed as second parameter
   */
  getCommand: (context: ResourceActionContext, promptValues?: Record<string, any>) => string;
  /**
   * Optional: Check if this action is available
   */
  isAvailable?: (context: ResourceActionContext) => boolean;
  /**
   * Mark as favorite to show as quick action button
   * If false/undefined, action appears only in context menu
   */
  isFavorite?: boolean;
  /**
   * Optional: Prompt fields for user input
   * If defined, a dialog will appear before executing the action
   */
  prompts?: PromptField[];
  /**
   * Optional: Confirmation message before executing
   * If defined, shows a confirm dialog
   */
  confirmMessage?: string | ((context: ResourceActionContext) => string);
  /**
   * Optional: Delay in ms before auto-refreshing the resource panel after action
   * If defined, triggers a refresh of this resource type after the specified delay
   * Useful for actions like scale where Kubernetes needs time to reconcile
   */
  refreshAfterMs?: number;
}

/**
 * Resource definition - each resource type implements this interface
 */
export interface ResourceDefinition {
  type: ResourceType;
  displayName: string;
  pluralName: string;
  /**
   * kubectl resource name (usually singular, but can be plural like 'cronjobs')
   */
  kubectlName?: string;
  /**
   * Column definitions for displaying this resource in ResourcePanel
   */
  columns: ColumnDefinition[];
  /**
   * Get all available actions for this resource
   */
  getActions: () => ResourceAction[];
}
