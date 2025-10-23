# Use Case 001 — Verification Checklist

This document provides a comprehensive checklist to verify that Use Case 001 has been correctly implemented.

## Implementation Status: ✅ COMPLETE

All requirements from `use_case_001.md` have been implemented and are ready for testing.

---

## Verification Steps

### Preconditions Check

- [ ] kubectl is installed: `kubectl version --client`
- [ ] Kubeconfig exists: `ls ~/.kube/config` or check `$KUBECONFIG`
- [ ] Kubeconfig contains at least one valid context: `kubectl config get-contexts`
- [ ] Application dependencies installed: `npm install`

### Main Flow Verification

#### 1. Load Contexts

**Expected Behavior:**
- App lists every context from kubeconfig
- Current context is highlighted with "(current)" suffix
- Cluster name, server URL, user, and namespace (if set) are displayed

**Test Steps:**
```bash
# Start the application
npm start
```

**Verify:**
- [ ] Context dropdown is populated
- [ ] Current context shows "(current)" marker
- [ ] Context details section shows cluster, server, user
- [ ] Namespace appears if configured in context
- [ ] Kubeconfig path is displayed in header

**Code References:**
- `src/main/kube.ts`: `loadKubeConfig()` (lines 23-65)
- `src/renderer.tsx`: Context loading (lines 41-65)

---

#### 2. Select Context

**Expected Behavior:**
- User selects a context from dropdown
- App calls `kubectl config use-context <name>`
- List refreshes to confirm the change
- New context is marked as "(current)"

**Test Steps:**
1. Note the current context
2. Select a different context from dropdown
3. Observe the UI update

**Verify:**
- [ ] Dropdown value changes immediately
- [ ] Context details update to show new context info
- [ ] New context is marked "(current)" after refresh
- [ ] No errors appear

**Code References:**
- `src/main/kube.ts`: `useContext()` (lines 176-187)
- `src/main.ts`: IPC handler `kube:set-context` (lines 52-67)
- `src/renderer.tsx`: `handleContextChange()` (lines 67-85)

---

#### 3. Enter Command

**Expected Behavior:**
- Input field accepts plain text kubectl commands
- Both formats work: `get pods` and `kubectl get pods -A`

**Test Steps:**
1. Type `get pods -A` in the command input
2. Type `kubectl get nodes` in the command input

**Verify:**
- [ ] Input field is enabled when contexts are loaded
- [ ] Text can be typed freely
- [ ] No automatic formatting or restrictions

**Code References:**
- `src/renderer.tsx`: Command input (lines 203-210)

---

#### 4. Run Command

**Expected Behavior:**
- Clicking "Run" triggers command execution
- Command runs with `--context <selected>` flag
- "Running…" state is shown during execution

**Test Steps:**
1. Enter command: `get pods -A`
2. Click "Run" button
3. Wait for completion

**Verify:**
- [ ] Button shows "Running…" during execution
- [ ] Button is disabled while running
- [ ] Command executes successfully

**Code References:**
- `src/main/kube.ts`: `runKubectlCommand()` (lines 116-135)
- `src/main/kube.ts`: `executeKubectl()` (lines 137-174)
- `src/renderer.tsx`: `handleRun()` (lines 87-117)

---

#### 5. Review Output

**Expected Behavior:**
- STDOUT and STDERR display in separate panes
- Exit code is shown
- Timestamp indicates when command completed

**Test Steps:**
1. Run a successful command: `get pods -A`
2. Run a failing command: `get invalidresource`

**Verify:**
- [ ] Exit code shows 0 for success
- [ ] Exit code shows non-zero for failure
- [ ] STDOUT contains expected output
- [ ] STDERR contains error messages (for failing commands)
- [ ] Timestamp shows completion time in HH:MM:SS format
- [ ] Empty output shows "<no output>" placeholder

**Code References:**
- `src/renderer.tsx`: Output display (lines 227-258)
- `src/common/kubeTypes.ts`: `KubectlResult` interface (lines 15-19)

---

### Alternate / Error Paths Verification

#### Missing Contexts

**Expected Behavior:**
- Show "No contexts found" message
- Display guidance to check kubeconfig paths

**Test Steps:**
1. Temporarily rename kubeconfig: `mv ~/.kube/config ~/.kube/config.bak`
2. Restart the app
3. Restore kubeconfig: `mv ~/.kube/config.bak ~/.kube/config`

**Verify:**
- [ ] Error message appears
- [ ] Message mentions checking kubeconfig
- [ ] UI is disabled (dropdown, input, button)

**Code References:**
- `src/renderer.tsx`: Error display (lines 151-154)
- `src/renderer.tsx`: No contexts message (lines 175-179)

---

#### Context Switch Failure

**Expected Behavior:**
- Display kubectl error message
- Revert to previous selection

**Test Steps:**
1. Manually edit kubeconfig to add invalid context
2. Try to switch to the invalid context
3. Observe error handling

**Verify:**
- [ ] Error message displays kubectl's error output
- [ ] Selection reverts to previous valid context
- [ ] App remains functional

**Code References:**
- `src/renderer.tsx`: Context change error handling (lines 77-82)
- `src/main/kube.ts`: `useContext()` error handling (lines 183-186)

---

#### Command Validation

**Expected Behavior:**
- Prevent empty command submissions
- Show validation error above input

**Test Steps:**
1. Leave command input empty
2. Click "Run" button
3. Try with only whitespace: `   `

**Verify:**
- [ ] Error message: "Enter a kubectl command to run."
- [ ] Command does not execute
- [ ] Error appears in red text

**Code References:**
- `src/renderer.tsx`: Validation (lines 88-96)
- `src/main.ts`: Server-side validation (lines 79-81)

---

#### kubectl Not Installed

**Expected Behavior:**
- Surface spawn error
- Advise installing or fixing PATH

**Test Steps:**
1. Temporarily remove kubectl from PATH: `export PATH=/usr/bin:/bin`
2. Try to run a command
3. Restore PATH

**Verify:**
- [ ] Error message mentions kubectl not found
- [ ] Message advises installing or checking PATH
- [ ] No app crash

**Code References:**
- `src/main/kube.ts`: ENOENT error handling (lines 154-162)

---

## Postconditions Verification

**Verify:**
- [ ] Selected context remains active for subsequent commands
- [ ] No kubeconfig data is modified beyond `use-context` calls
- [ ] Command history is not persisted (expected behavior)

---

## Code Coverage Summary

| Component | File | Lines | Status |
|-----------|------|-------|--------|
| Main Process | `src/main.ts` | 41-92 | ✅ Complete |
| Kube Operations | `src/main/kube.ts` | 23-187 | ✅ Complete |
| Renderer UI | `src/renderer.tsx` | 13-260 | ✅ Complete |
| Preload Bridge | `src/preload.ts` | 22-42 | ✅ Complete |
| Type Definitions | `src/common/kubeTypes.ts` | 1-20 | ✅ Complete |

---

## Known Limitations (As Designed)

1. **No Command History**: Commands are not persisted between sessions (future enhancement)
2. **Single Command**: Only one command can run at a time
3. **No Command Cancellation**: Running commands cannot be interrupted
4. **No Output Streaming**: Output appears only after command completes

---

## Regression Test Commands

Use these commands to quickly verify functionality:

```bash
# Successful commands
kubectl get pods -A
kubectl get nodes
kubectl version

# Commands that should show errors
kubectl get invalidresource
kubectl get pods -n nonexistent-namespace

# Edge cases
kubectl get pods --help
kubectl cluster-info
```

---

## Sign-off

- [ ] All main flow steps verified
- [ ] All error paths tested
- [ ] Code reviewed for completeness
- [ ] Documentation is accurate

**Verified by:** _________________  
**Date:** _________________  
**Notes:** _________________
