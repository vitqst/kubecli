# Global Error Handling System

## Overview

Comprehensive error handling system that prevents the app from freezing when kubectl commands fail (e.g., auth expiration, connection issues, context errors).

## Problem

**Before:**
- kubectl failures could freeze the terminal
- No user feedback on errors
- Auth expiration silently fails
- Connection timeouts hang the app
- Users don't know what went wrong

## Solution

Implemented a global error handling system with:
1. **ErrorContext** - Centralized error state management
2. **ErrorBanner** - Visual error notifications
3. **Smart error detection** - Recognizes common error types
4. **Retry actions** - One-click retry for failed operations
5. **Auto-dismiss** - Info messages auto-dismiss after 5s

## Architecture

### 1. Error Context

```typescript
// src/contexts/ErrorContext.tsx
interface AppError {
  id: string;
  message: string;
  details?: string;
  severity: 'error' | 'warning' | 'info';
  timestamp: Date;
  dismissible: boolean;
  action?: {
    label: string;
    callback: () => void;
  };
}

export function ErrorProvider({ children }) {
  const [errors, setErrors] = useState<AppError[]>([]);
  
  const addError = (error) => {
    // Add error to state
    // Auto-dismiss info after 5s
  };
  
  return (
    <ErrorContext.Provider value={{ errors, addError, dismissError, clearErrors }}>
      {children}
    </ErrorContext.Provider>
  );
}
```

### 2. Error Banner

```typescript
// src/components/ErrorBanner.tsx
export function ErrorBanner() {
  const { errors, dismissError } = useError();
  
  return (
    <div style={styles.container}>
      {errors.map((error) => (
        <div style={getErrorStyle(error.severity)}>
          <Icon /> {error.message}
          {error.details}
          {error.action && <Button onClick={error.action.callback} />}
          <DismissButton />
        </div>
      ))}
    </div>
  );
}
```

### 3. Integration

```typescript
// src/renderer.tsx
<ErrorProvider>
  <ResourceCacheProvider>
    <ErrorBanner />
    <App />
  </ResourceCacheProvider>
</ErrorProvider>
```

## Error Types

### Authentication Errors

**Detection:**
```typescript
errorMessage.includes('auth') || errorMessage.includes('permission')
```

**Message:**
```
❌ Failed to load Kubernetes resources
Authentication may have expired. Try switching contexts or reconfiguring kubectl.
[Retry]
```

### Connection Errors

**Detection:**
```typescript
errorMessage.includes('connection') || errorMessage.includes('timeout')
```

**Message:**
```
❌ Failed to load Kubernetes resources
Cannot connect to cluster. Check your network and cluster status.
[Retry]
```

### Generic Errors

**Message:**
```
❌ Failed to load Kubernetes resources
{actual error message}
[Retry]
```

## Severity Levels

### Error (Red)
```typescript
severity: 'error'
backgroundColor: '#5a1d1d'
border: '#f48771'
```
- Critical failures
- Auth issues
- Connection problems
- Not auto-dismissed

### Warning (Yellow)
```typescript
severity: 'warning'
backgroundColor: '#5a4d1d'
border: '#f4c471'
```
- Non-critical issues
- Deprecation warnings
- Performance warnings
- Not auto-dismissed

### Info (Blue)
```typescript
severity: 'info'
backgroundColor: '#1d3a5a'
border: '#71a8f4'
```
- Informational messages
- Success notifications
- Auto-dismissed after 5s

## Usage

### Adding Errors

```typescript
import { useError } from '../contexts/ErrorContext';

function MyComponent() {
  const { addError } = useError();
  
  try {
    await riskyOperation();
  } catch (err) {
    addError({
      message: 'Operation failed',
      details: err.message,
      severity: 'error',
      dismissible: true,
      action: {
        label: 'Retry',
        callback: () => riskyOperation(),
      },
    });
  }
}
```

### With Retry Action

```typescript
addError({
  message: 'Failed to load resources',
  details: 'Connection timeout',
  severity: 'error',
  dismissible: true,
  action: {
    label: 'Retry',
    callback: () => fetchResources(),
  },
});
```

### Info Message (Auto-dismiss)

```typescript
addError({
  message: 'Resources refreshed',
  severity: 'info',
  dismissible: true,
});
// Auto-dismisses after 5 seconds
```

## ResourceCache Integration

The ResourceCacheContext automatically catches kubectl errors:

```typescript
try {
  // Fetch resources
  const result = await window.kube.runCommand(...);
} catch (err) {
  const errorMessage = err.message;
  
  // Show user-friendly error
  addError({
    message: 'Failed to load Kubernetes resources',
    details: errorMessage.includes('auth')
      ? 'Authentication may have expired...'
      : errorMessage.includes('connection')
      ? 'Cannot connect to cluster...'
      : errorMessage,
    severity: 'error',
    dismissible: true,
    action: {
      label: 'Retry',
      callback: () => fetchResources(),
    },
  });
}
```

## UI Examples

### Error Banner (Top of Screen)

```
┌─────────────────────────────────────────────────────────┐
│ ❌ Failed to load Kubernetes resources                  │
│ Authentication may have expired. Try switching contexts │
│ or reconfiguring kubectl.                         [Retry] [✕] │
└─────────────────────────────────────────────────────────┘
```

### Multiple Errors

```
┌─────────────────────────────────────────────────────────┐
│ ❌ Failed to load Kubernetes resources            [Retry] [✕] │
│ Authentication may have expired...                      │
├─────────────────────────────────────────────────────────┤
│ ⚠️  Cache expired for pods                         [✕] │
│ Refreshing data...                                      │
└─────────────────────────────────────────────────────────┘
```

## Benefits

### Prevents Freezing
- ✅ Errors don't freeze the terminal
- ✅ App remains responsive
- ✅ Users can continue working

### Clear Feedback
- ✅ Users see what went wrong
- ✅ Helpful error messages
- ✅ Actionable suggestions

### Easy Recovery
- ✅ One-click retry
- ✅ No need to restart app
- ✅ Graceful degradation

### Smart Detection
- ✅ Recognizes auth errors
- ✅ Detects connection issues
- ✅ Context-aware messages

## Common Scenarios

### Scenario 1: Auth Expired

```
User opens app → Fetch resources → Auth expired
↓
❌ Failed to load Kubernetes resources
Authentication may have expired. Try switching contexts
or reconfiguring kubectl.
[Retry] [✕]
↓
User clicks Retry → Re-authenticates → Success
```

### Scenario 2: Connection Timeout

```
User switches context → Fetch resources → Connection timeout
↓
❌ Failed to load Kubernetes resources
Cannot connect to cluster. Check your network and
cluster status.
[Retry] [✕]
↓
User fixes network → Clicks Retry → Success
```

### Scenario 3: Invalid Context

```
User selects invalid context → Fetch resources → Error
↓
❌ Failed to load Kubernetes resources
context "invalid" does not exist
[Retry] [✕]
↓
User switches to valid context → Auto-retry → Success
```

## Error Handling Best Practices

### 1. Always Catch Errors

```typescript
try {
  await kubectlOperation();
} catch (err) {
  addError({...});
}
```

### 2. Provide Context

```typescript
addError({
  message: 'Failed to load pods',  // What failed
  details: err.message,            // Why it failed
  severity: 'error',
});
```

### 3. Offer Actions

```typescript
addError({
  message: 'Failed to load resources',
  action: {
    label: 'Retry',
    callback: () => retry(),
  },
});
```

### 4. Use Appropriate Severity

```typescript
// Critical - use 'error'
addError({ severity: 'error', ... });

// Non-critical - use 'warning'
addError({ severity: 'warning', ... });

// Informational - use 'info'
addError({ severity: 'info', ... });
```

## Files Created

- **src/contexts/ErrorContext.tsx** - Error state management
- **src/components/ErrorBanner.tsx** - Visual error display

## Files Modified

- **src/contexts/ResourceCacheContext.tsx** - Added error handling
- **src/renderer.tsx** - Wrapped with ErrorProvider, added ErrorBanner

## Future Enhancements

1. **Error Logging** - Send errors to logging service
2. **Error Analytics** - Track error frequency
3. **Offline Mode** - Better offline error handling
4. **Error Recovery** - Automatic retry with backoff
5. **Error History** - View past errors
6. **Custom Error Pages** - Full-page error states
7. **Toast Notifications** - Alternative to banner
8. **Sound Alerts** - Audio feedback for errors

## Testing

### Simulate Auth Error

```bash
# Corrupt kubeconfig
echo "invalid" > ~/.kube/config

# Open app → See auth error banner
```

### Simulate Connection Error

```bash
# Stop cluster
minikube stop

# Open app → See connection error banner
```

### Simulate Invalid Context

```bash
# Set invalid context
kubectl config use-context invalid

# Open app → See context error banner
```

## Related Features

- **Resource Cache** - Catches fetch errors
- **Terminal** - Handles command errors
- **Context Switching** - Validates contexts
- **Error Boundary** - Catches React errors
