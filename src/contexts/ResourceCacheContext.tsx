import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { ResourceType } from '../resources';
import { useError } from './ErrorContext';

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
  refreshType: (type: ResourceType) => void;
}

const ResourceCacheContext = createContext<ResourceCacheContextType | undefined>(undefined);

interface ResourceCacheProviderProps {
  children: ReactNode;
  selectedContext: string;
  kubeconfigPath?: string;
}

// Per-resource-type cache entry
interface TypedCacheEntry {
  resources: CachedResource[];
  lastUpdated: Date;
  expiresAt: Date;
}

// Cache storage: Map<cacheKey::resourceType, TypedCacheEntry>
const cacheStorage = new Map<string, TypedCacheEntry>();

// TTL (Time To Live) configuration per resource type (in milliseconds)
const CACHE_TTL: Record<ResourceType, number> = {
  pod: 60 * 60 * 1000,        // 1 hour (pods change frequently)
  deployment: Infinity,        // Never expire (deployments are stable)
  cronjob: Infinity,           // Never expire (cronjobs are stable)
  service: Infinity,           // Never expire (services are stable)
  job: 60 * 60 * 1000,        // 1 hour (jobs change frequently)
  statefulset: Infinity,       // Never expire (statefulsets are stable)
  daemonset: Infinity,         // Never expire (daemonsets are stable)
  configmap: Infinity,         // Never expire (configmaps are stable)
  secret: Infinity,            // Never expire (secrets are stable)
  ingress: Infinity,           // Never expire (ingresses are stable)
};

// Helper to check if cache is expired
function isCacheExpired(entry: TypedCacheEntry): boolean {
  if (entry.expiresAt === null) return false; // Never expires
  return new Date() > entry.expiresAt;
}

export function ResourceCacheProvider({ children, selectedContext, kubeconfigPath = '' }: ResourceCacheProviderProps) {
  const [resources, setResources] = useState<CachedResource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Try to get error context, but don't fail if not available
  let addError: ((error: any) => void) | undefined;
  try {
    const errorContext = useError();
    addError = errorContext.addError;
  } catch (e) {
    // ErrorProvider not available, that's ok
    addError = undefined;
  }

  // Generate cache key from config + context
  const cacheKey = `${kubeconfigPath}::${selectedContext}`;

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

      const now = new Date();
      
      // Save each resource type separately with expiry
      const resourcesByType = new Map<ResourceType, CachedResource[]>();
      allResources.forEach(resource => {
        if (!resourcesByType.has(resource.type)) {
          resourcesByType.set(resource.type, []);
        }
        resourcesByType.get(resource.type)!.push(resource);
      });

      // Cache each type with its TTL
      resourcesByType.forEach((resources, type) => {
        const ttl = CACHE_TTL[type];
        const expiresAt = ttl === Infinity ? null as any : new Date(now.getTime() + ttl);
        const typedCacheKey = `${cacheKey}::${type}`;
        
        cacheStorage.set(typedCacheKey, {
          resources,
          lastUpdated: now,
          expiresAt,
        });
        
        console.log(`[ResourceCache] Cached ${resources.length} ${type}s for ${cacheKey} (expires: ${ttl === Infinity ? 'never' : expiresAt.toLocaleTimeString()})`);
      });
      
      setResources(allResources);
      setLastUpdated(now);
      console.log(`[ResourceCache] Cached ${allResources.length} total resources for ${cacheKey}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch resources';
      console.error('[ResourceCache] Failed to fetch resources:', err);
      setError(errorMessage);
      
      // Show user-friendly error banner if error context is available
      if (addError) {
        addError({
          message: 'Failed to load Kubernetes resources',
          details: errorMessage.includes('auth') || errorMessage.includes('permission')
            ? 'Authentication may have expired. Try switching contexts or reconfiguring kubectl.'
            : errorMessage.includes('connection') || errorMessage.includes('timeout')
            ? 'Cannot connect to cluster. Check your network and cluster status.'
            : errorMessage,
          severity: 'error',
          dismissible: true,
          action: {
            label: 'Retry',
            callback: () => fetchResources(),
          },
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [selectedContext, cacheKey, addError]);

  // Load from cache or fetch on mount and when context/config changes
  useEffect(() => {
    if (!selectedContext) return;

    // Check each resource type separately
    const resourceTypes: ResourceType[] = ['pod', 'deployment', 'cronjob', 'service'];
    const cachedResources: CachedResource[] = [];
    let needsFetch = false;
    let latestUpdate: Date | null = null;

    resourceTypes.forEach(type => {
      const typedCacheKey = `${cacheKey}::${type}`;
      const cached = cacheStorage.get(typedCacheKey);
      
      if (cached && !isCacheExpired(cached)) {
        // Valid cache - load it
        cachedResources.push(...cached.resources);
        if (!latestUpdate || cached.lastUpdated > latestUpdate) {
          latestUpdate = cached.lastUpdated;
        }
        console.log(`[ResourceCache] Loaded ${cached.resources.length} ${type}s from cache for ${cacheKey}`);
      } else {
        // No cache or expired - need to fetch
        if (cached) {
          console.log(`[ResourceCache] Cache expired for ${type}s in ${cacheKey}, will refresh`);
        }
        needsFetch = true;
      }
    });

    if (cachedResources.length > 0 && !needsFetch) {
      // All types cached and valid - use cache
      setResources(cachedResources);
      setLastUpdated(latestUpdate);
      console.log(`[ResourceCache] Loaded ${cachedResources.length} total resources from cache for ${cacheKey}`);
    } else if (cachedResources.length > 0 && needsFetch) {
      // Some cached, some need fetch - show cached first, then fetch
      setResources(cachedResources);
      setLastUpdated(latestUpdate);
      console.log(`[ResourceCache] Loaded ${cachedResources.length} cached resources, fetching fresh data...`);
      fetchResources();
    } else {
      // No cache at all - fetch fresh data
      fetchResources();
    }
  }, [selectedContext, cacheKey, fetchResources]);

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

  // Refresh specific resource type
  const refreshType = useCallback((type: ResourceType) => {
    console.log(`[ResourceCache] Refreshing ${type}s for ${cacheKey}`);
    // Invalidate cache for this type
    const typedCacheKey = `${cacheKey}::${type}`;
    cacheStorage.delete(typedCacheKey);
    // Trigger full refresh
    fetchResources();
  }, [cacheKey, fetchResources]);

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
    refreshType,
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
