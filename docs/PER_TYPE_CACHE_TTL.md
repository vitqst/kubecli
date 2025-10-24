# Per-Resource-Type Cache with TTL

## Overview

Advanced caching system that stores each resource type separately with configurable Time-To-Live (TTL) expiry. This allows different refresh strategies for different resource types based on how frequently they change.

## Cache Strategy

### TTL Configuration

```typescript
const CACHE_TTL: Record<ResourceType, number> = {
  // Frequently changing resources
  pod: 60 * 60 * 1000,        // 1 hour
  job: 60 * 60 * 1000,        // 1 hour
  
  // Stable resources (rarely change)
  deployment: Infinity,        // Never expire
  cronjob: Infinity,           // Never expire
  service: Infinity,           // Never expire
  statefulset: Infinity,       // Never expire
  daemonset: Infinity,         // Never expire
  configmap: Infinity,         // Never expire
  secret: Infinity,            // Never expire
  ingress: Infinity,           // Never expire
};
```

### Why Different TTLs?

**Pods (1 hour TTL):**
- Pods restart frequently
- Scaling events create/delete pods
- Crashes and restarts common
- Need fresh data regularly

**Deployments (Infinity):**
- Deployments rarely change
- Configuration is stable
- Manual updates only
- Can cache indefinitely

**CronJobs (Infinity):**
- Schedules rarely change
- Configuration is stable
- Manual updates only
- Can cache indefinitely

**Services (Infinity):**
- Service definitions are stable
- Rarely modified
- Manual updates only
- Can cache indefinitely

## How It Works

### Cache Key Structure

```
{kubeconfigPath}::{contextName}::{resourceType}

Examples:
- "/home/user/.kube/config::minikube::pod"
- "/home/user/.kube/config::minikube::deployment"
- "/home/user/.kube/config::docker-desktop::cronjob"
```

### Cache Entry Structure

```typescript
interface TypedCacheEntry {
  resources: CachedResource[];  // Resources of this type
  lastUpdated: Date;            // When cached
  expiresAt: Date | null;       // When expires (null = never)
}
```

### Expiry Check

```typescript
function isCacheExpired(entry: TypedCacheEntry): boolean {
  if (entry.expiresAt === null) return false; // Never expires
  return new Date() > entry.expiresAt;
}
```

## Cache Lifecycle

### First Load

```
1. User selects config + context
   ↓
2. Check cache for each type:
   - pods::cache → Not found
   - deployment::cache → Not found
   - cronjob::cache → Not found
   - service::cache → Not found
   ↓
3. Fetch all resources
   ↓
4. Save each type separately:
   - pods → Expires in 1 hour
   - deployments → Never expires
   - cronjobs → Never expires
   - services → Never expires
```

### Subsequent Load (Within 1 Hour)

```
1. User returns to same config
   ↓
2. Check cache for each type:
   - pods → Found, not expired ✓
   - deployments → Found, never expires ✓
   - cronjobs → Found, never expires ✓
   - services → Found, never expires ✓
   ↓
3. Load all from cache (instant!)
```

### After 1 Hour

```
1. User returns after 1+ hour
   ↓
2. Check cache for each type:
   - pods → Found, EXPIRED ✗
   - deployments → Found, never expires ✓
   - cronjobs → Found, never expires ✓
   - services → Found, never expires ✓
   ↓
3. Load cached deployments/cronjobs/services (instant)
   ↓
4. Fetch fresh pods (500ms)
   ↓
5. Merge and display all
```

## Benefits

### Smart Caching
- ✅ Frequently changing resources expire
- ✅ Stable resources cached indefinitely
- ✅ Optimal balance of freshness vs speed

### Performance
- ✅ Stable resources always instant
- ✅ Only dynamic resources re-fetch
- ✅ Reduced kubectl API calls

### Flexibility
- ✅ Easy to adjust TTL per type
- ✅ Can add new resource types
- ✅ Manual refresh always available

## Usage

### Automatic Expiry

The system automatically handles expiry:

```
Hour 0: Load all → Cache all
Hour 1: Load → Pods expired, fetch fresh
Hour 2: Load → Pods expired again, fetch fresh
...
Deployments/CronJobs/Services: Always cached!
```

### Manual Refresh

Users can force refresh any type:

```typescript
// Refresh all resources
refreshCache();

// Refresh specific type
refreshType('pod');
refreshType('deployment');
```

## Examples

### Scenario 1: Active Development

```
9:00 AM - Load cluster
  → Fetch all (1s)
  → Cache: pods (expires 10:00), deployments (∞)

9:30 AM - Check cluster
  → Load from cache (instant!)
  → Pods still valid

10:30 AM - Check cluster
  → Deployments from cache (instant!)
  → Pods expired, fetch fresh (500ms)
  → Total: 500ms (vs 1s full fetch)
```

### Scenario 2: Stable Cluster

```
Day 1 - Load cluster
  → Fetch all (1s)
  → Cache everything

Day 2 - Load cluster
  → Deployments/CronJobs/Services from cache (instant!)
  → Pods expired, fetch fresh (500ms)
  → Total: 500ms

Day 30 - Load cluster
  → Still same behavior!
  → Deployments cached for 30 days ✓
```

### Scenario 3: Pod Scaling Event

```
Before scale:
  → 10 pods cached

User scales deployment:
  → kubectl scale deployment nginx --replicas=20

User clicks refresh (↻):
  → Invalidate pod cache
  → Fetch fresh pods
  → Now shows 20 pods
```

## Performance Impact

### Cache Hit (All Valid)
```
Load pods → <1ms (cache)
Load deployments → <1ms (cache)
Load cronjobs → <1ms (cache)
Load services → <1ms (cache)
Total: <1ms
```

### Partial Cache Hit (Pods Expired)
```
Load pods → 500ms (fetch)
Load deployments → <1ms (cache)
Load cronjobs → <1ms (cache)
Load services → <1ms (cache)
Total: 500ms (50% faster than full fetch!)
```

### Cache Miss (First Load)
```
Fetch all → 1000ms
Total: 1000ms (one-time cost)
```

## Configuration

### Adjusting TTL

To change expiry time for a resource type:

```typescript
const CACHE_TTL: Record<ResourceType, number> = {
  pod: 30 * 60 * 1000,  // 30 minutes (more aggressive)
  pod: 2 * 60 * 60 * 1000,  // 2 hours (more relaxed)
  
  deployment: 24 * 60 * 60 * 1000,  // 24 hours (instead of infinity)
};
```

### Adding New Resource Types

1. Add to TTL config:
```typescript
const CACHE_TTL: Record<ResourceType, number> = {
  // ... existing types
  configmap: Infinity,  // New type
};
```

2. Add fetch logic in `fetchResources()`
3. Add to `resourceTypes` array in load logic

## Logging

The system logs cache operations:

```
[ResourceCache] Cached 50 pods for config::context (expires: 10:30:15 AM)
[ResourceCache] Cached 10 deployments for config::context (expires: never)
[ResourceCache] Loaded 50 pods from cache for config::context
[ResourceCache] Cache expired for pods in config::context, will refresh
```

## Limitations

### Session Only
- Cache clears on app restart
- TTL resets on restart
- Fresh fetch on next launch

### All-or-Nothing Fetch
- Expired type triggers full fetch
- Can't fetch single resource
- Future: Incremental updates

### Fixed TTL
- TTL set at cache time
- Can't adjust dynamically
- Future: Adaptive TTL

## Future Enhancements

1. **Adaptive TTL** - Adjust based on change frequency
2. **Incremental Updates** - Fetch only changed resources
3. **Background Refresh** - Auto-refresh before expiry
4. **Persistent Cache** - Save to disk with TTL
5. **Per-Resource TTL** - Different TTL per resource instance
6. **Watch API** - Real-time updates instead of polling

## Files Modified

- **src/contexts/ResourceCacheContext.tsx**
  - Added `TypedCacheEntry` interface with `expiresAt`
  - Added `CACHE_TTL` configuration
  - Added `isCacheExpired()` helper
  - Refactored to cache per resource type
  - Added expiry checking on load
  - Added `refreshType()` function

## Related Features

- **Per-Config Cache** - Separate cache per kubeconfig
- **Manual Refresh** - Force refresh any type
- **Global Search** - Uses cached resources
- **Resource Lists** - Display cached resources
