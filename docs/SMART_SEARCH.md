# Smart Search with Type Filtering

## Overview

Enhanced search functionality that supports type-based filtering using intuitive syntax: `type:query`

## Syntax

### Basic Search
```
nginx
```
Searches in:
- Resource names
- Namespaces
- Resource types

### Type-Filtered Search
```
type:query
```
Format: `{resourceType}:{nameQuery}`

## Examples

### Search by Type Only

**Find all CronJobs:**
```
cron:
```
- Matches: All resources where type contains "cron"
- Result: All CronJobs

**Find all Pods:**
```
pod:
```
- Matches: All resources where type contains "pod"
- Result: All Pods

**Find all Deployments:**
```
deploy:
```
- Matches: All resources where type contains "deploy"
- Result: All Deployments

### Search by Type + Name

**Find CronJobs with "backup" in name:**
```
cron:backup
```
- Type filter: Contains "cron" → CronJobs
- Name filter: Contains "backup"
- Result: backup-daily, backup-weekly, etc.

**Find Pods with "nginx" in name:**
```
pod:nginx
```
- Type filter: Contains "pod" → Pods
- Name filter: Contains "nginx"
- Result: nginx-deployment-abc123, nginx-service-xyz789, etc.

**Find Deployments in "production" namespace:**
```
deploy:production
```
- Type filter: Contains "deploy" → Deployments
- Name filter: Contains "production" (searches name AND namespace)
- Result: All deployments in production namespace

### Partial Type Matching

**Find all Jobs (including CronJobs):**
```
job:
```
- Matches: "job" and "cronjob"
- Result: All Jobs and CronJobs

**Find Services:**
```
serv:
```
- Matches: "service"
- Result: All Services

## How It Works

### Pattern Matching

```typescript
// Regex pattern: word characters, colon, optional space, then query
const typeFilterMatch = query.match(/^(\w+):\s*(.*)$/);

Examples:
"cron:backup"  → ["cron", "backup"]
"pod: nginx"   → ["pod", "nginx"]
"deploy:"      → ["deploy", ""]
```

### Filtering Logic

```typescript
if (typeFilterMatch) {
  const [, typeFilter, nameQuery] = typeFilterMatch;
  
  return resources.filter(resource => {
    // Type must contain the filter
    const typeMatches = resource.type.includes(typeFilter);
    
    // Name/namespace must contain the query (if provided)
    const nameMatches = nameQuery 
      ? resource.name.includes(nameQuery) ||
        resource.namespace.includes(nameQuery)
      : true;  // No name query = match all
    
    return typeMatches && nameMatches;
  });
}
```

### Search Priority

1. **Type Filter** - Applied first
2. **Name Filter** - Applied second
3. **Namespace Filter** - Applied second (same as name)

## Use Cases

### 1. Find Specific Resource Type

**Problem:** Too many results, want only CronJobs
```
Search: "backup"
Results: 50+ resources (pods, deployments, cronjobs, etc.)

Search: "cron:backup"
Results: 3 cronjobs only ✓
```

### 2. Quick Type Exploration

**Problem:** Want to see all resources of a type
```
Search: "cron:"
Results: All CronJobs in cluster
```

### 3. Namespace-Specific Resources

**Problem:** Find deployments in specific namespace
```
Search: "deploy:staging"
Results: All deployments in staging namespace
```

### 4. Partial Type Matching

**Problem:** Not sure of exact type name
```
Search: "job:"
Results: Both Jobs and CronJobs

Search: "stat:"
Results: StatefulSets
```

## Comparison

### Before (Basic Search)

```
Search: "backup"

Results:
- backup-pod-123 (Pod)
- backup-deployment (Deployment)
- backup-daily (CronJob)
- backup-weekly (CronJob)
- backup-service (Service)
- nginx-backup-pod (Pod)
- ... 20+ more results
```

### After (Smart Search)

```
Search: "cron:backup"

Results:
- backup-daily (CronJob)
- backup-weekly (CronJob)
- backup-monthly (CronJob)

Only 3 results, all CronJobs! ✓
```

## Search Patterns

### Common Patterns

| Pattern | Description | Example Results |
|---------|-------------|-----------------|
| `pod:` | All Pods | nginx-pod, redis-pod |
| `deploy:` | All Deployments | nginx-deployment, api-deployment |
| `cron:` | All CronJobs | backup-daily, cleanup-weekly |
| `service:` | All Services | nginx-service, api-service |
| `job:` | Jobs + CronJobs | backup-job, backup-daily |
| `pod:nginx` | Pods with "nginx" | nginx-deployment-abc, nginx-service-xyz |
| `cron:backup` | CronJobs with "backup" | backup-daily, backup-weekly |
| `deploy:prod` | Deployments in prod | All deployments in prod namespace |

### Advanced Patterns

| Pattern | Description |
|---------|-------------|
| `stat:` | StatefulSets |
| `daemon:` | DaemonSets |
| `config:` | ConfigMaps |
| `secret:` | Secrets |
| `ingress:` | Ingresses |

## Benefits

### Speed
- ✅ Fewer results to scan
- ✅ Instant type filtering
- ✅ No need to expand sections

### Precision
- ✅ Exact resource type
- ✅ Combined type + name filtering
- ✅ Reduced noise

### Discoverability
- ✅ Explore resource types
- ✅ Learn type names
- ✅ Quick overview

### Flexibility
- ✅ Partial matching
- ✅ Optional name filter
- ✅ Works with namespaces

## UI Hints

### Placeholder Text
```
🔍 Search resources (try: pod:nginx or cron:backup)
```

Shows users the syntax directly in the search box.

### Examples in Placeholder
- `pod:nginx` - Find pods with nginx
- `cron:backup` - Find cronjobs with backup

## Technical Details

### Regex Pattern
```typescript
/^(\w+):\s*(.*)$/
```

Breakdown:
- `^` - Start of string
- `(\w+)` - Capture word characters (type)
- `:` - Literal colon
- `\s*` - Optional whitespace
- `(.*)` - Capture everything else (query)
- `$` - End of string

### Case Insensitive
All searches are case-insensitive:
```
"CRON:BACKUP" === "cron:backup" === "Cron:Backup"
```

### Result Limit
Maximum 20 results to keep UI responsive.

## Future Enhancements

### Multiple Filters
```
pod:nginx namespace:production
```

### Exclusion
```
-pod:nginx  (exclude pods with nginx)
```

### OR Logic
```
pod:nginx,redis  (pods with nginx OR redis)
```

### Status Filter
```
pod:nginx status:running
```

### Regex Support
```
pod:/nginx-\d+/
```

### Saved Searches
```
Save: "cron:backup" as "My Backups"
```

## Related Features

- **Global Search** - Base search functionality
- **Resource Cache** - Fast in-memory search
- **Keyboard Shortcuts** - Ctrl+F to focus search
- **Context Menu** - Actions on search results
