# Per-Config Resource Cache

## Overview

Enhanced resource caching system that maintains separate caches for each kubeconfig file + context combination, enabling instant switching between configurations without re-fetching.

## Features

### 1. Per-Config Caching
- **Separate cache** for each kubeconfig + context combination
- **Persistent in memory** throughout the session
- **Instant switching** between configs without re-fetching

### 2. Manual Refresh
- **Refresh button (↻)** on each resource section
- **Force refresh** to get latest data from cluster
- **Updates cache** for current config + context

## How It Works

### Cache Key Generation

```typescript
const cacheKey = `${kubeconfigPath}::${selectedContext}`;
// Example: "/home/user/.kube/config::minikube"
```

Each unique combination gets its own cache entry.

### Cache Storage

```typescript
// Global Map stores all caches
const cacheStorage = new Map<string, {
  resources: CachedResource[];
  lastUpdated: Date;
}>();
```

### Cache Lifecycle

```
1. User selects config + context
   ↓
2. Generate cache key: "config::context"
   ↓
3. Check if cache exists
   ↓
   YES → Load from cache (instant!)
   NO  → Fetch from kubectl (500-1000ms)
   ↓
4. Save to cache storage
   ↓
5. User switches to different config
   ↓
6. New cache key generated
   ↓
7. Check cache again...
```

## Benefits

### Speed
- ✅ **Instant config switching** - No re-fetch if cached
- ✅ **Session persistence** - Cache survives component unmount
- ✅ **Multiple configs** - Each config cached separately

### User Experience
- ✅ **No waiting** when switching back to previous config
- ✅ **Manual refresh** when you need fresh data
- ✅ **Automatic refresh** on first visit to config

### Memory Efficient
- ✅ **In-memory only** - Clears on app restart
- ✅ **Reasonable size** - ~500 resources = ~50KB per cache
- ✅ **No disk usage** - Pure memory storage

## Usage

### Automatic Caching

Just use the app normally! Caching happens automatically:

1. **First visit** to a config → Fetches and caches
2. **Return to config** → Loads from cache instantly
3. **Switch configs** → Each has its own cache

### Manual Refresh

Click the **↻ button** on any resource section:

```
┌─────────────────────────────┐
│ 📦 Pods (15)  ↻  ▼         │
└─────────────────────────────┘
```

This will:
1. Show loading indicator
2. Fetch fresh data from kubectl
3. Update cache for current config
4. Display updated resources

## Examples

### Scenario 1: Multiple Clusters

```
User workflow:
1. Select "production" config → Fetch (1s) → Cache
2. View pods, deployments → Instant (from cache)
3. Switch to "staging" config → Fetch (1s) → Cache
4. View resources → Instant (from cache)
5. Switch back to "production" → Instant! (from cache)
```

### Scenario 2: Refresh Data

```
User workflow:
1. View pods in "production" → Loaded from cache
2. Deploy new pod via kubectl
3. Click refresh button (↻) → Fetch fresh data
4. See new pod in list
```

### Scenario 3: Multiple Contexts

```
User workflow:
1. Config: ~/.kube/config, Context: minikube → Cache A
2. Config: ~/.kube/config, Context: docker-desktop → Cache B
3. Config: ~/work/.kube/config, Context: prod → Cache C

Each gets separate cache!
```

## Implementation Details

### Cache Key Format

```
{kubeconfigPath}::{contextName}

Examples:
- "/home/user/.kube/config::minikube"
- "/home/user/.kube/config::docker-desktop"
- "/home/user/work/.kube/config::production"
```

### Storage Structure

```typescript
Map<string, CacheEntry>

where CacheEntry = {
  resources: CachedResource[];  // All resources
  lastUpdated: Date;            // When cached
}
```

### Load Logic

```typescript
useEffect(() => {
  const cached = cacheStorage.get(cacheKey);
  
  if (cached) {
    // Load from cache - instant!
    setResources(cached.resources);
    setLastUpdated(cached.lastUpdated);
  } else {
    // No cache - fetch fresh
    fetchResources();
  }
}, [cacheKey]);
```

### Refresh Logic

```typescript
const refresh = () => {
  // Force fetch, ignore cache
  fetchResources();
  // Automatically updates cache
};
```

## Performance

### Cache Hit (Instant)
```
Load from Map → <1ms
Display resources → <1ms
Total: <1ms
```

### Cache Miss (First Visit)
```
Fetch from kubectl → 500-1000ms
Parse results → 10-20ms
Save to cache → <1ms
Display resources → <1ms
Total: 500-1000ms (one-time cost)
```

### Refresh (Manual)
```
Fetch from kubectl → 500-1000ms
Update cache → <1ms
Display resources → <1ms
Total: 500-1000ms
```

## Memory Usage

### Typical Cluster
- 50 pods = ~5KB
- 20 deployments = ~2KB
- 10 cronjobs = ~1KB
- 30 services = ~3KB
- **Total per config: ~11KB**

### Large Cluster
- 500 pods = ~50KB
- 200 deployments = ~20KB
- 100 cronjobs = ~10KB
- 300 services = ~30KB
- **Total per config: ~110KB**

### Multiple Configs
- 5 configs × 110KB = **550KB total**
- Negligible memory footprint!

## Limitations

### Session Only
- Cache clears on app restart
- No persistent storage
- Fresh fetch on next launch

### Manual Refresh Required
- Cache doesn't auto-update
- User must click refresh for latest data
- Future: Could add auto-refresh interval

### Memory Only
- Not saved to disk
- Lost on app close
- Acceptable trade-off for speed

## Future Enhancements

1. **Auto-refresh interval** - Refresh every N minutes
2. **Persistent cache** - Save to localStorage
3. **Cache expiry** - Auto-refresh after X minutes
4. **Cache size limit** - LRU eviction for old configs
5. **Background refresh** - Update cache without blocking UI
6. **Incremental updates** - Watch API for changes

## Files Modified

- **src/contexts/ResourceCacheContext.tsx**
  - Added `cacheStorage` Map
  - Added `kubeconfigPath` prop
  - Generate cache key from config + context
  - Load from cache if available
  - Save to cache after fetch

- **src/renderer.tsx**
  - Pass `kubeconfigPath` to ResourceCacheProvider

- **src/components/TerminalSidebar.tsx**
  - Connect refresh buttons to `refreshCache()`
  - All resource sections can refresh

## Related Features

- **Global Resource Cache** - Base caching system
- **Instant Search** - Uses cached resources
- **Resource Lists** - Display cached resources
- **Context Switching** - Triggers cache lookup
