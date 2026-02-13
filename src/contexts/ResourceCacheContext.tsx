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
     * Fetch a single resource type, immediately update state & cache when done.
     * This allows each resource type to appear in the UI as soon as it loads,
     * without waiting for all other types to finish.
     */
    const fetchOne = async (type: ResourceType, command: string): Promise<void> => {
      const start = Date.now();

      try {
        const result = await kube.runCommand(selectedContext, command);

        if (result.code === 0 && result.stdout) {
          const fetchedResources = processJsonOutput(result.stdout, type);
          const duration = Date.now() - start;
          setLoadingStates(prev => ({
            ...prev,
            [type]: { status: 'success', count: fetchedResources.length, duration }
          }));

          // Immediately push these resources into state so the UI updates
          setResources(prev => {
            const otherResources = prev.filter(r => r.type !== type);
            return [...otherResources, ...fetchedResources];
          });

          // Update cache for this type
          const now = new Date();
          const ttl = CACHE_TTL[type];
          const expiresAt = ttl === Infinity ? null as any : new Date(now.getTime() + ttl);
          const typedCacheKey = `${cacheKey}::${type}`;
          cacheStorage.set(typedCacheKey, {
            resources: fetchedResources,
            lastUpdated: now,
            expiresAt,
          });
          setLastUpdated(now);
        } else {
          const errorMsg = result.stderr || 'Unknown error';
          setLoadingStates(prev => ({
            ...prev,
            [type]: { status: 'error', error: errorMsg, duration: Date.now() - start }
          }));
          console.error(`[ResourceCache] ✗ ${type}: ${errorMsg}`);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setLoadingStates(prev => ({
          ...prev,
          [type]: { status: 'error', error: errorMsg, duration: Date.now() - start }
        }));
        console.error(`[ResourceCache] ✗ ${type}: ${errorMsg}`);
      }
    };

    /**
     * Categorize an error message and return a user-friendly description
     */
    const categorizeError = (errorMsg: string): { details: string; severity: 'error' | 'warning'; category: string } => {
      const lowerErr = errorMsg.toLowerCase();

      if (lowerErr.includes('auth') || lowerErr.includes('token') || lowerErr.includes('certificate') || lowerErr.includes('unauthorized') || lowerErr.includes('401')) {
        return { details: 'Authentication failed. Your credentials may have expired. Try switching contexts or running "kubectl config use-context" to refresh.', severity: 'error', category: 'auth' };
      } else if (lowerErr.includes('forbidden') || lowerErr.includes('403') || lowerErr.includes('permission')) {
        return { details: 'Insufficient permissions. Check your RBAC roles for this cluster.', severity: 'warning', category: 'permission' };
      } else if (lowerErr.includes('connection') || lowerErr.includes('timeout') || lowerErr.includes('refused') || lowerErr.includes('no such host') || lowerErr.includes('network')) {
        return { details: 'Cannot connect to the cluster. Check your network, VPN, or cluster status.', severity: 'error', category: 'connection' };
      } else if (lowerErr.includes('not found') || lowerErr.includes('the server doesn\'t have a resource type')) {
        return { details: 'Some resource types are not available on this cluster.', severity: 'warning', category: 'not_found' };
      } else {
        return { details: errorMsg, severity: 'error', category: 'unknown' };
      }
    };

    const resourceTypes: ResourceType[] = ['pod', 'deployment', 'cronjob', 'service', 'configmap', 'secret'];

    // Fire ALL kubectl commands in PARALLEL.
    // Each fetchOne independently updates resources state as soon as it resolves.
    await Promise.all([
      fetchOne('pod', 'get pods -A -o json'),
      fetchOne('deployment', 'get deployments -A -o json'),
      fetchOne('cronjob', 'get cronjobs -A -o json'),
      fetchOne('service', 'get services -A -o json'),
      fetchOne('configmap', 'get configmaps -A -o json'),
      fetchOne('secret', 'get secrets -A -o json'),
    ]);

    // After all fetches complete, consolidate errors and show user-friendly banners.
    // We read loadingStates via a state updater to get the latest values.
    setLoadingStates(currentStates => {
      if (addError) {
        const failedTypes = resourceTypes.filter(t => currentStates[t]?.status === 'error');

        if (failedTypes.length > 0) {
          // Group failed types by error category
          const byCategory = new Map<string, { types: ResourceType[]; info: ReturnType<typeof categorizeError> }>();
          for (const t of failedTypes) {
            const errMsg = currentStates[t]?.error || 'Unknown error';
            const info = categorizeError(errMsg);
            const existing = byCategory.get(info.category);
            if (existing) {
              existing.types.push(t);
            } else {
              byCategory.set(info.category, { types: [t], info });
            }
          }

          // Show one banner per error category (not per resource type)
          for (const [, { types, info }] of byCategory) {
            if (types.length === resourceTypes.length) {
              // All types failed with same cause → single consolidated banner
              addError({
                message: 'Failed to load Kubernetes resources',
                details: info.details,
                severity: info.severity,
                dismissible: true,
                action: {
                  label: 'Retry All',
                  callback: () => fetchResources(),
                },
              });
            } else {
              // Only some types failed → show which ones
              addError({
                message: `Failed to load ${types.join(', ')}`,
                details: info.details,
                severity: info.severity,
                dismissible: true,
                action: {
                  label: 'Retry',
                  callback: () => { types.forEach(t => refreshType(t)); },
                },
              });
            }
          }
        }
      }

      return currentStates; // Don't mutate, just read
    });
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

  // Refresh specific resource type (background refresh if cached, loading state if not)
  const refreshType = useCallback(async (type: ResourceType) => {
    if (!selectedContext) return;

    // Check cache directly instead of depending on resources state
    const typedCacheKey = `${cacheKey}::${type}`;
    const hasCachedData = cacheStorage.has(typedCacheKey);

    // Only show loading state if there's no cached data
    // If cached, refresh silently in background
    if (!hasCachedData) {
      setLoadingStates(prev => ({
        ...prev,
        [type]: { status: 'loading' }
      }));
    }

    // Map resource type to kubectl command
    const commandMap: Record<ResourceType, string> = {
      pod: 'get pods -A -o json',
      deployment: 'get deployments -A -o json',
      cronjob: 'get cronjobs -A -o json',
      service: 'get services -A -o json',
      configmap: 'get configmaps -A -o json',
      secret: 'get secrets -A -o json',
      job: 'get jobs -A -o json',
      statefulset: 'get statefulsets -A -o json',
      daemonset: 'get daemonsets -A -o json',
      ingress: 'get ingresses -A -o json',
    };

    const command = commandMap[type];
    if (!command) return;

    const start = Date.now();

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

    try {
      const result = await kube.runCommand(selectedContext, command);

      if (result.code === 0 && result.stdout) {
        const parsed = JSON.parse(result.stdout);
        const items = parsed.items || [];
        const resourceDef = getResourceDefinition(type);
        const columns = resourceDef?.columns || [];

        const newResources: CachedResource[] = items.map((item: any) => {
          const columnValues: Record<string, any> = {};
          for (const col of columns) {
            columnValues[col.key] = getValueByPath(item, col.path);
          }

          // Generate legacy status and info fields
          let status = 'Unknown';
          let info = String(type);

          if (type === 'pod') {
            status = item.status?.phase || 'Unknown';
            const statuses = item.status?.containerStatuses || [];
            const ready = statuses.filter((s: any) => s?.ready).length;
            info = `Pod | ${status} | ${ready}/${statuses.length}`;
          } else if (type === 'deployment') {
            status = 'Active';
            const ready = item.status?.readyReplicas || 0;
            const desired = item.status?.replicas || 0;
            info = `Deployment | ${ready}/${desired}`;
          } else if (type === 'cronjob') {
            status = item.spec?.suspend ? 'Suspended' : 'Active';
            const schedule = item.spec?.schedule || '';
            info = `CronJob | ${schedule}`;
          } else if (type === 'service') {
            const svcType = item.spec?.type || 'ClusterIP';
            status = svcType;
            const clusterIP = item.spec?.clusterIP || 'N/A';
            info = `Service | ${svcType} | ${clusterIP}`;
          } else if (type === 'configmap') {
            status = 'Available';
            info = 'ConfigMap';
          } else if (type === 'secret') {
            const secretType = item.type || 'Opaque';
            status = secretType;
            info = `Secret | ${secretType}`;
          }

          return {
            type,
            name: item.metadata?.name || '',
            namespace: item.metadata?.namespace || '',
            status,
            info,
            columns: columnValues,
          };
        });

        const duration = Date.now() - start;
        setLoadingStates(prev => ({
          ...prev,
          [type]: { status: 'success', count: newResources.length, duration }
        }));

        // Update resources: replace only this type, keep others
        setResources(prev => {
          const otherResources = prev.filter(r => r.type !== type);
          return [...otherResources, ...newResources];
        });

        // Update cache for this type
        const now = new Date();
        const ttl = CACHE_TTL[type];
        const expiresAt = ttl === Infinity ? null as any : new Date(now.getTime() + ttl);
        const typedCacheKey = `${cacheKey}::${type}`;
        cacheStorage.set(typedCacheKey, {
          resources: newResources,
          lastUpdated: now,
          expiresAt,
        });

        setLastUpdated(now);
      } else {
        const errorMsg = result.stderr || 'Unknown error';
        const errDuration = Date.now() - start;
        setLoadingStates(prev => ({
          ...prev,
          [type]: { status: 'error', error: errorMsg, duration: errDuration }
        }));

        if (addError) {
          const lowerErr = errorMsg.toLowerCase();
          let details: string;
          let severity: 'error' | 'warning' = 'error';

          if (lowerErr.includes('auth') || lowerErr.includes('token') || lowerErr.includes('certificate') || lowerErr.includes('unauthorized') || lowerErr.includes('401')) {
            details = 'Authentication failed. Your credentials may have expired. Try switching contexts or running "kubectl config use-context" to refresh.';
          } else if (lowerErr.includes('forbidden') || lowerErr.includes('403') || lowerErr.includes('permission')) {
            details = `You don't have permission to list ${type}s in this cluster. Check your RBAC roles.`;
            severity = 'warning';
          } else if (lowerErr.includes('connection') || lowerErr.includes('timeout') || lowerErr.includes('refused') || lowerErr.includes('no such host') || lowerErr.includes('network')) {
            details = 'Cannot connect to the cluster. Check your network, VPN, or cluster status.';
          } else {
            details = errorMsg;
          }

          addError({
            message: `Failed to load ${type}s`,
            details,
            severity,
            dismissible: true,
            action: {
              label: 'Retry',
              callback: () => refreshType(type),
            },
          });
        }
      }
    } catch (err) {
      const duration = Date.now() - start;
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setLoadingStates(prev => ({
        ...prev,
        [type]: { status: 'error', error: errorMsg, duration }
      }));

      if (addError) {
        addError({
          message: `Failed to load ${type}s`,
          details: errorMsg,
          severity: 'error',
          dismissible: true,
          action: {
            label: 'Retry',
            callback: () => refreshType(type),
          },
        });
      }
    }
  }, [selectedContext, cacheKey, addError]);

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
