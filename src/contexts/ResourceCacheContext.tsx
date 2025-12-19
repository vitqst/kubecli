import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { ResourceType, getResourceDefinition } from '../resources';
import { useError } from './ErrorContext';
import { kube } from '../api';

export interface CachedResource {
  type: ResourceType;
  name: string;
  namespace: string;
  /** Legacy status field for backward compatibility */
  status: string;
  /** Legacy info field for backward compatibility */
  info: string;
  /** Raw column values extracted from JSON, keyed by column key */
  columns: Record<string, any>;
}

export interface ResourceLoadingState {
  status: 'pending' | 'loading' | 'success' | 'error';
  count?: number;       // Number of items fetched
  duration?: number;    // Time in milliseconds
  error?: string;       // Error message if failed
}

interface ResourceCacheContextType {
  resources: CachedResource[];
  isLoading: boolean;
  loadingStates: Record<ResourceType, ResourceLoadingState>;
  lastUpdated: Date | null;
  error: string | null;
  search: (query: string) => CachedResource[];
  filterByType: (type: ResourceType) => CachedResource[];
  filterByNamespace: (namespace: string) => CachedResource[];
  filterByNamespaces: (namespaces?: string[], type?: ResourceType) => CachedResource[];
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

const INITIAL_LOADING_STATES: Record<ResourceType, ResourceLoadingState> = {
  pod: { status: 'pending' },
  deployment: { status: 'pending' },
  cronjob: { status: 'pending' },
  service: { status: 'pending' },
  configmap: { status: 'pending' },
  secret: { status: 'pending' },
  job: { status: 'pending' },
  statefulset: { status: 'pending' },
  daemonset: { status: 'pending' },
  ingress: { status: 'pending' },
};

// Helper to check if cache is expired
function isCacheExpired(entry: TypedCacheEntry): boolean {
  if (entry.expiresAt === null) return false; // Never expires
  return new Date() > entry.expiresAt;
}

export function ResourceCacheProvider({ children, selectedContext, kubeconfigPath = '' }: ResourceCacheProviderProps) {
  const [resources, setResources] = useState<CachedResource[]>([]);
  const [loadingStates, setLoadingStates] = useState<Record<ResourceType, ResourceLoadingState>>(
    INITIAL_LOADING_STATES
  );
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isLoading = useMemo(
    () => Object.values(loadingStates).some(s => s.status === 'loading'),
    [loadingStates]
  );

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
    if (!selectedContext) return;

    setError(null);

    // Reset fetched types to loading (only the 6 we actually fetch)
    setLoadingStates(prev => ({
      ...prev,
      pod: { status: 'loading' },
      deployment: { status: 'loading' },
      cronjob: { status: 'loading' },
      service: { status: 'loading' },
      configmap: { status: 'loading' },
      secret: { status: 'loading' },
    }));

    /**
     * Helper to extract a value from an object using a JSON path like '.metadata.name'
     */
    const getValueByPath = (obj: any, path: string): any => {
      if (!path || !obj) return undefined;
      const cleanPath = path.startsWith('.') ? path.slice(1) : path;
      const parts = cleanPath.split('.');
      let value = obj;
      for (const part of parts) {
        if (value === undefined || value === null) return undefined;
        value = value[part];
      }
      return value;
    };

    /**
     * Process JSON output and extract column values for a resource type
     */
    const processJsonOutput = (
      jsonStr: string,
      resourceType: ResourceType
    ): CachedResource[] => {
      const results: CachedResource[] = [];
      try {
        const parsed = JSON.parse(jsonStr);
        const items = parsed.items || [];
        const resourceDef = getResourceDefinition(resourceType);
        const columns = resourceDef?.columns || [];

        for (const item of items) {
          const columnValues: Record<string, any> = {};

          for (const col of columns) {
            columnValues[col.key] = getValueByPath(item, col.path);
          }

          // Generate legacy status and info fields for backward compatibility
          let status = 'Unknown';
          let info = String(resourceType);

          if (resourceType === 'pod') {
            status = item.status?.phase || 'Unknown';
            const statuses = item.status?.containerStatuses || [];
            const ready = statuses.filter((s: any) => s?.ready).length;
            info = `Pod | ${status} | ${ready}/${statuses.length}`;
          } else if (resourceType === 'deployment') {
            status = 'Active';
            const ready = item.status?.readyReplicas || 0;
            const desired = item.status?.replicas || 0;
            info = `Deployment | ${ready}/${desired}`;
          } else if (resourceType === 'cronjob') {
            status = item.spec?.suspend ? 'Suspended' : 'Active';
            const schedule = item.spec?.schedule || '';
            info = `CronJob | ${schedule}`;
          } else if (resourceType === 'service') {
            const svcType = item.spec?.type || 'ClusterIP';
            status = svcType;
            const clusterIP = item.spec?.clusterIP || 'N/A';
            info = `Service | ${svcType} | ${clusterIP}`;
          } else if (resourceType === 'configmap') {
            status = 'Available';
            info = 'ConfigMap';
          } else if (resourceType === 'secret') {
            const secretType = item.type || 'Opaque';
            status = secretType;
            info = `Secret | ${secretType}`;
          }

          results.push({
            type: resourceType,
            name: item.metadata?.name || '',
            namespace: item.metadata?.namespace || '',
            status,
            info,
            columns: columnValues,
          });
        }
      } catch (e) {
        console.error(`[ResourceCache] Failed to parse ${resourceType} JSON:`, e);
      }
      return results;
    };

    /**
     * Fetch a single resource type and update its loading state
     */
    const fetchOne = async (type: ResourceType, command: string): Promise<CachedResource[]> => {
      const start = Date.now();
      try {
        const result = await kube.runCommand(selectedContext, command);

        if (result.code === 0 && result.stdout) {
          const resources = processJsonOutput(result.stdout, type);
          const duration = Date.now() - start;
          setLoadingStates(prev => ({
            ...prev,
            [type]: { status: 'success', count: resources.length, duration }
          }));
          return resources;
        } else {
          const errorMsg = result.stderr || 'Unknown error';
          const errDuration = Date.now() - start;
          setLoadingStates(prev => ({
            ...prev,
            [type]: { status: 'error', error: errorMsg, duration: errDuration }
          }));
          console.error(`[ResourceCache] ✗ ${type}: ${errorMsg}`);
          return [];
        }
      } catch (err) {
        const duration = Date.now() - start;
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setLoadingStates(prev => ({
          ...prev,
          [type]: { status: 'error', error: errorMsg, duration }
        }));
        console.error(`[ResourceCache] ✗ ${type}: ${errorMsg}`);
        return [];
      }
    };

    try {
      // Run ALL kubectl commands in PARALLEL, each updates its own state
      const results = await Promise.all([
        fetchOne('pod', 'get pods -A -o json'),
        fetchOne('deployment', 'get deployments -A -o json'),
        fetchOne('cronjob', 'get cronjobs -A -o json'),
        fetchOne('service', 'get services -A -o json'),
        fetchOne('configmap', 'get configmaps -A -o json'),
        fetchOne('secret', 'get secrets -A -o json'),
      ]);


      const allResources = results.flat();
      const now = new Date();

      // Cache each resource type with its TTL
      const resourcesByType = new Map<ResourceType, CachedResource[]>();
      allResources.forEach(resource => {
        if (!resourcesByType.has(resource.type)) {
          resourcesByType.set(resource.type, []);
        }
        resourcesByType.get(resource.type)!.push(resource);
      });

      resourcesByType.forEach((resources, type) => {
        const ttl = CACHE_TTL[type];
        const expiresAt = ttl === Infinity ? null as any : new Date(now.getTime() + ttl);
        const typedCacheKey = `${cacheKey}::${type}`;

        cacheStorage.set(typedCacheKey, {
          resources,
          lastUpdated: now,
          expiresAt,
        });
      });

      setResources(allResources);
      setLastUpdated(now);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch resources';
      console.error('[ResourceCache] Failed to fetch resources:', err);
      setError(errorMessage);

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
    }
  }, [selectedContext, cacheKey, addError]);

  // Load from cache or fetch on mount and when context/config changes
  useEffect(() => {
    if (!selectedContext) return;


    // Check each resource type separately
    const resourceTypes: ResourceType[] = ['pod', 'deployment', 'cronjob', 'service', 'configmap', 'secret'];
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
      } else {
        // No cache or expired - need to fetch
        if (cached) {
        }
        needsFetch = true;
      }
    });

    if (cachedResources.length > 0 && !needsFetch) {
      // All types cached and valid - use cache
      setResources(cachedResources);
      setLastUpdated(latestUpdate);
    } else if (cachedResources.length > 0 && needsFetch) {
      // Some cached, some need fetch - show cached first, then fetch
      setResources(cachedResources);
      setLastUpdated(latestUpdate);
      fetchResources();
    } else {
      // No cache at all - fetch fresh data
      fetchResources();
    }
  }, [selectedContext, cacheKey, fetchResources]);

  // Search through cached resources with smart type filtering
  const search = useCallback((query: string): CachedResource[] => {
    if (!query.trim()) return [];

    const lowerQuery = query.toLowerCase();

    // Check for type filter syntax: "type:query" or "type: query"
    const typeFilterMatch = lowerQuery.match(/^(\w+):\s*(.*)$/);

    if (typeFilterMatch) {
      const [, typeFilter, nameQuery] = typeFilterMatch;

      // Filter by type first, then by name
      return resources.filter(resource => {
        const typeMatches = resource.type.toLowerCase().includes(typeFilter);
        const nameMatches = nameQuery
          ? resource.name.toLowerCase().includes(nameQuery) ||
            resource.namespace.toLowerCase().includes(nameQuery)
          : true;
        return typeMatches && nameMatches;
      }).slice(0, 20);
    }

    // Default search: search in name, namespace, and type
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

  // Filter by multiple namespaces (empty list = all)
  const filterByNamespaces = useCallback((namespaces: string[] = [], type?: ResourceType): CachedResource[] => {
    if (!namespaces.length) {
      return type ? resources.filter(resource => resource.type === type) : resources;
    }

    const namespaceSet = new Set(namespaces);
    return resources.filter(resource =>
      namespaceSet.has(resource.namespace) && (!type || resource.type === type)
    );
  }, [resources]);

  // Get resource count by type
  const getCountByType = useCallback((type: ResourceType): number => {
    return resources.filter(resource => resource.type === type).length;
  }, [resources]);

  // Refresh specific resource type
  const refreshType = useCallback((type: ResourceType) => {
    // Invalidate cache for this type
    const typedCacheKey = `${cacheKey}::${type}`;
    cacheStorage.delete(typedCacheKey);
    // Trigger full refresh
    fetchResources();
  }, [cacheKey, fetchResources]);

  const value: ResourceCacheContextType = {
    resources,
    isLoading,
    loadingStates,
    lastUpdated,
    error,
    search,
    filterByType,
    filterByNamespace,
    filterByNamespaces,
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
