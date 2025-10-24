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

export interface ResourceActionContext {
  resourceName: string;
  namespace: string;
  resourceType: ResourceType;
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
}

/**
 * Resource definition - each resource type implements this interface
 */
export interface ResourceDefinition {
  type: ResourceType;
  displayName: string;
  pluralName: string;
  /**
   * Get all available actions for this resource
   */
  getActions: () => ResourceAction[];
}
