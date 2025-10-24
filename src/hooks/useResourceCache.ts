import { useState, useEffect, useCallback } from 'react';
import { ResourceType } from '../resources';

export interface CachedResource {
  type: ResourceType;
  name: string;
  namespace: string;
  status: string;
  info: string;
  raw?: any; // Store raw data if needed
}

interface ResourceCacheState {
  resources: CachedResource[];
  isLoading: boolean;
  lastUpdated: Date | null;
  error: string | null;
}

/**
 * Global resource cache hook
 * Pre-fetches and caches all resources across all namespaces
 * Automatically refreshes when context changes
 */
export function useResourceCache(selectedContext: string) {
  const [state, setState] = useState<ResourceCacheState>({
    resources: [],
    isLoading: false,
    lastUpdated: null,
    error: null,
  });

  // Fetch all resources
  const fetchResources = useCallback(async () => {
    if (!selectedContext || !window.kube) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const allResources: CachedResource[] = [];

      // Fetch pods from all namespaces
      const podsResult = await window.kube.runCommand(
        selectedContext,
        'get pods -A --no-headers -o custom-columns=NAMESPACE:.metadata.namespace,NAME:.metadata.name,STATUS:.status.phase,READY:.status.containerStatuses[*].ready,RESTARTS:.status.containerStatuses[*].restartCount'
      );

      if (podsResult.code === 0 && podsResult.stdout) {
        const lines = podsResult.stdout.trim().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          const parts = line.split(/\s+/);
          if (parts.length >= 3) {
            const [namespace, name, status, readyStr] = parts;
            const readyArr = readyStr?.split(',').filter(r => r === 'true') || [];
            const totalArr = readyStr?.split(',') || [];
            const ready = `${readyArr.length}/${totalArr.length}`;
            
            allResources.push({
              type: 'pod',
              name,
              namespace,
              status,
              info: `Pod | ${status} | ${ready}`,
            });
          }
        });
      }

      // Fetch deployments from all namespaces
      const deploymentsResult = await window.kube.runCommand(
        selectedContext,
        'get deployments -A --no-headers -o custom-columns=NAMESPACE:.metadata.namespace,NAME:.metadata.name,READY:.status.readyReplicas,DESIRED:.spec.replicas'
      );

      if (deploymentsResult.code === 0 && deploymentsResult.stdout) {
        const lines = deploymentsResult.stdout.trim().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          const parts = line.split(/\s+/);
          if (parts.length >= 3) {
            const [namespace, name, ready, desired] = parts;
            allResources.push({
              type: 'deployment',
              name,
              namespace,
              status: 'Active',
              info: `Deployment | ${ready || 0}/${desired || 0}`,
            });
          }
        });
      }

      // Fetch cronjobs from all namespaces
      const cronjobsResult = await window.kube.runCommand(
        selectedContext,
        'get cronjobs -A --no-headers -o custom-columns=NAMESPACE:.metadata.namespace,NAME:.metadata.name,SCHEDULE:.spec.schedule,SUSPEND:.spec.suspend'
      );

      if (cronjobsResult.code === 0 && cronjobsResult.stdout) {
        const lines = cronjobsResult.stdout.trim().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          const parts = line.split(/\s+/);
          if (parts.length >= 3) {
            const [namespace, name, schedule, suspend] = parts;
            const status = suspend === 'true' ? 'Suspended' : 'Active';
            allResources.push({
              type: 'cronjob',
              name,
              namespace,
              status,
              info: `CronJob | ${schedule}`,
            });
          }
        });
      }

      // Fetch services from all namespaces
      const servicesResult = await window.kube.runCommand(
        selectedContext,
        'get services -A --no-headers -o custom-columns=NAMESPACE:.metadata.namespace,NAME:.metadata.name,TYPE:.spec.type,CLUSTER-IP:.spec.clusterIP'
      );

      if (servicesResult.code === 0 && servicesResult.stdout) {
        const lines = servicesResult.stdout.trim().split('\n').filter(line => line.trim());
        lines.forEach(line => {
          const parts = line.split(/\s+/);
          if (parts.length >= 3) {
            const [namespace, name, type, clusterIP] = parts;
            allResources.push({
              type: 'service',
              name,
              namespace,
              status: type || 'ClusterIP',
              info: `Service | ${type} | ${clusterIP || 'N/A'}`,
            });
          }
        });
      }

      setState({
        resources: allResources,
        isLoading: false,
        lastUpdated: new Date(),
        error: null,
      });

      console.log(`[ResourceCache] Cached ${allResources.length} resources`);
    } catch (error) {
      console.error('[ResourceCache] Failed to fetch resources:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch resources',
      }));
    }
  }, [selectedContext]);

  // Auto-fetch on mount and when context changes
  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  // Search through cached resources
  const search = useCallback((query: string): CachedResource[] => {
    if (!query.trim()) return [];

    const lowerQuery = query.toLowerCase();
    return state.resources.filter(resource =>
      resource.name.toLowerCase().includes(lowerQuery) ||
      resource.namespace.toLowerCase().includes(lowerQuery) ||
      resource.type.toLowerCase().includes(lowerQuery)
    ).slice(0, 20); // Limit to 20 results
  }, [state.resources]);

  // Filter by resource type
  const filterByType = useCallback((type: ResourceType): CachedResource[] => {
    return state.resources.filter(resource => resource.type === type);
  }, [state.resources]);

  // Filter by namespace
  const filterByNamespace = useCallback((namespace: string): CachedResource[] => {
    return state.resources.filter(resource => resource.namespace === namespace);
  }, [state.resources]);

  // Get resource count by type
  const getCountByType = useCallback((type: ResourceType): number => {
    return state.resources.filter(resource => resource.type === type).length;
  }, [state.resources]);

  // Manual refresh
  const refresh = useCallback(() => {
    fetchResources();
  }, [fetchResources]);

  return {
    resources: state.resources,
    isLoading: state.isLoading,
    lastUpdated: state.lastUpdated,
    error: state.error,
    search,
    filterByType,
    filterByNamespace,
    getCountByType,
    refresh,
  };
}
