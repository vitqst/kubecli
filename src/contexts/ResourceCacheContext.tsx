import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { ResourceType } from '../resources';

export interface CachedResource {
  type: ResourceType;
  name: string;
  namespace: string;
  status: string;
  info: string;
  raw?: any;
}

interface ResourceCacheContextType {
  resources: CachedResource[];
  isLoading: boolean;
  lastUpdated: Date | null;
  error: string | null;
  search: (query: string) => CachedResource[];
  filterByType: (type: ResourceType) => CachedResource[];
  filterByNamespace: (namespace: string) => CachedResource[];
  getCountByType: (type: ResourceType) => number;
  refresh: () => void;
}

const ResourceCacheContext = createContext<ResourceCacheContextType | undefined>(undefined);

interface ResourceCacheProviderProps {
  children: ReactNode;
  selectedContext: string;
}

export function ResourceCacheProvider({ children, selectedContext }: ResourceCacheProviderProps) {
  const [resources, setResources] = useState<CachedResource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch all resources
  const fetchResources = useCallback(async () => {
    if (!selectedContext || !window.kube) return;

    setIsLoading(true);
    setError(null);

    try {
      const allResources: CachedResource[] = [];

      // Fetch pods
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

      // Fetch deployments
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

      // Fetch cronjobs
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

      // Fetch services
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

      setResources(allResources);
      setLastUpdated(new Date());
      console.log(`[ResourceCache] Cached ${allResources.length} resources`);
    } catch (err) {
      console.error('[ResourceCache] Failed to fetch resources:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch resources');
    } finally {
      setIsLoading(false);
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
    return resources.filter(resource =>
      resource.name.toLowerCase().includes(lowerQuery) ||
      resource.namespace.toLowerCase().includes(lowerQuery) ||
      resource.type.toLowerCase().includes(lowerQuery)
    ).slice(0, 20);
  }, [resources]);

  // Filter by resource type
  const filterByType = useCallback((type: ResourceType): CachedResource[] => {
    return resources.filter(resource => resource.type === type);
  }, [resources]);

  // Filter by namespace
  const filterByNamespace = useCallback((namespace: string): CachedResource[] => {
    return resources.filter(resource => resource.namespace === namespace);
  }, [resources]);

  // Get resource count by type
  const getCountByType = useCallback((type: ResourceType): number => {
    return resources.filter(resource => resource.type === type).length;
  }, [resources]);

  const value: ResourceCacheContextType = {
    resources,
    isLoading,
    lastUpdated,
    error,
    search,
    filterByType,
    filterByNamespace,
    getCountByType,
    refresh: fetchResources,
  };

  return (
    <ResourceCacheContext.Provider value={value}>
      {children}
    </ResourceCacheContext.Provider>
  );
}

export function useResourceCache(): ResourceCacheContextType {
  const context = useContext(ResourceCacheContext);
  if (!context) {
    throw new Error('useResourceCache must be used within ResourceCacheProvider');
  }
  return context;
}
