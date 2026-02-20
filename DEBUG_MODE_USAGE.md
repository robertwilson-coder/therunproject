# Debug Mode - Quick Start Guide

## For Developers

### Enable Debug Panel

**Option 1: Browser Console**
```javascript
localStorage.setItem('enableDebugPanel', 'true');
location.reload();
```

**Option 2: Helper Function**
```javascript
debugMode.enable();  // Auto-reloads page
```

### Disable Debug Panel

**Option 1: Browser Console**
```javascript
localStorage.removeItem('enableDebugPanel');
location.reload();
```

**Option 2: Helper Function**
```javascript
debugMode.disable();  // Auto-reloads page
```

### Check Status

```javascript
debugMode.isEnabled();  // Returns: true or false
```

## What You'll See

When enabled, a **red panel** appears in the **bottom-right corner** showing:

### Plan Structure Info
```
plan_type: date_based_full
days.length: 84
plan.length: 12
start_date: 2026-01-26
```

### Current View State
```
selectedDate: 2026-02-09
currentWeekIdx: 2
weekRange: Feb 9 - Feb 15
viewMode: week
```

### Normalization Status
```
isDateBased: ✓ true (green)
wasNormalized: ✓ true (green)
db_write: ✓ true (green)
normalizedWeeks: 12
week1HasAllDays: ✓ true (green)
invariantFails: ✓ 0 (green)
```

## Use Cases

### 1. Debugging Plan Loading Issues

**Scenario:** Customer reports their plan isn't loading correctly after editing.

**Steps:**
1. Enable debug panel: `debugMode.enable()`
2. Navigate to their saved plan
3. Check debug panel:
   - Is `isDateBased` correct?
   - Did normalization run (`wasNormalized`)?
   - Were changes persisted (`db_write`)?
   - Are there any `invariantFails`?
4. Check browser console for `[Normalization]` logs

### 2. Verifying Move Operations

**Scenario:** Testing workout move functionality.

**Steps:**
1. Enable debug panel
2. Note the current `days.length` (e.g., 84)
3. Move a workout from Monday to Wednesday
4. Check debug panel:
   - `days.length` should be unchanged (84)
   - `invariantFails` should be 0
5. Check console for `[usePlanModifications]` logs

### 3. Investigating Date Handling

**Scenario:** Views seem out of sync between week and calendar.

**Steps:**
1. Enable debug panel
2. Navigate to Week View
3. Note `selectedDate` and `currentWeekIdx`
4. Switch to Calendar View
5. Verify same `selectedDate` is shown
6. Click a calendar date
7. Check `selectedDate` updates
8. Switch back to Week View
9. Verify `currentWeekIdx` is derived correctly

### 4. Validating Normalization

**Scenario:** Testing an old plan that needs migration.

**Steps:**
1. Enable debug panel
2. Load an old plan (pre-normalization format)
3. Check debug panel immediately:
   - `wasNormalized` should be ✓ true (green)
   - `db_write` should be ✓ true (green) if user owns the plan
   - `week1HasAllDays` should be ✓ true (green)
   - `invariantFails` should be ✓ 0 (green)
4. Check console for detailed normalization logs

## Visual Guide

### Before Enabling
```
┌─────────────────────────────────┐
│                                 │
│    Training Plan (Week View)   │
│                                 │
│  Mon: Easy 8 km                │
│  Tue: Rest                     │
│  Wed: Tempo 6 km               │
│  ...                           │
│                                 │
└─────────────────────────────────┘
```

### After Enabling
```
┌─────────────────────────────────┐
│                                 │
│    Training Plan (Week View)   │
│                                 │
│  Mon: Easy 8 km                │
│  Tue: Rest                     │
│  Wed: Tempo 6 km               │
│  ...                           │
│                    ┌────────────┴─┐
│                    │ DEBUG PANEL  │
│                    ├──────────────┤
│                    │ plan_type:   │
│                    │ date_based_  │
│                    │ full         │
│                    │              │
│                    │ days.length: │
│                    │ 84           │
│                    │ ...          │
└────────────────────┴──────────────┘
```

## Production Behavior

**Important:** In production builds (`npm run build`), the debug panel:
- ❌ Never appears, even if localStorage flag is set
- ❌ Never computes debug info (zero performance cost)
- ❌ Never affects core app behavior
- ✅ Is completely tree-shaken out of bundle

## Development Workflow

### Standard Workflow (No Debug)
```bash
npm run dev
# Debug panel NOT visible (default)
# Work on features as normal
```

### Debugging Workflow (With Debug)
```bash
npm run dev
# In browser console:
debugMode.enable()
# Page reloads, debug panel appears
# Debug the issue
# When done:
debugMode.disable()
# Page reloads, debug panel disappears
```

### Always-On Debug Mode (Optional)
```bash
npm run dev
# In browser console (once):
localStorage.setItem('enableDebugPanel', 'true')
# Debug panel will appear on every page load
# Persists until you explicitly disable it
```

## Troubleshooting

### Debug Panel Not Appearing

**Check 1:** Are you in development mode?
```javascript
console.log(import.meta.env.MODE);
// Should output: "development"
```

**Check 2:** Is the flag set correctly?
```javascript
console.log(localStorage.getItem('enableDebugPanel'));
// Should output: "true"
```

**Check 3:** Did you refresh the page after enabling?
```javascript
debugMode.enable();  // This auto-reloads
// OR manually:
location.reload();
```

### Debug Panel Appearing in Production

**This should never happen.** If it does:
1. Check your build command is using production mode
2. Verify `import.meta.env.PROD` is `true` in built files
3. Report as a critical bug

### Debug Info Shows Incorrect Values

**Check 1:** Is the plan loaded correctly?
- Open browser DevTools → Network tab
- Look for `/training_plans` API call
- Verify response contains expected data

**Check 2:** Check console logs
```javascript
// Look for these log patterns:
[LoadPlan] Loaded plan from database
[Normalization] Starting normalization
[usePlanModifications] Moving workout in date-based plan
```

**Check 3:** Verify state in React DevTools
- Install React DevTools extension
- Find `TrainingPlanDisplay` component
- Inspect `planData`, `selectedDate`, `currentWeekIndex` props

## Best Practices

### DO ✅
- Enable debug mode when investigating issues
- Disable debug mode when doing normal development
- Share debug panel screenshots with engineering when reporting bugs
- Use console logs in conjunction with debug panel
- Check both debug panel AND console for full picture

### DON'T ❌
- Leave debug mode enabled all the time (clutters UI)
- Rely on debug panel for production monitoring (not available)
- Mutate values in debug panel (read-only, can't edit)
- Share screenshots with sensitive user data
- Forget that production builds don't have debug mode

## Quick Reference

| Task | Command |
|------|---------|
| Enable debug panel | `debugMode.enable()` |
| Disable debug panel | `debugMode.disable()` |
| Check if enabled | `debugMode.isEnabled()` |
| Enable via localStorage | `localStorage.setItem('enableDebugPanel', 'true')` |
| Disable via localStorage | `localStorage.removeItem('enableDebugPanel')` |
| Check localStorage | `localStorage.getItem('enableDebugPanel')` |
| Force reload | `location.reload()` |

## Support Script

When helping customers debug issues:

```markdown
Hi! To help us debug this issue, please follow these steps:

1. Open your browser console:
   - Chrome/Edge: Press F12 or Ctrl+Shift+J (Windows) / Cmd+Option+J (Mac)
   - Firefox: Press F12 or Ctrl+Shift+K (Windows) / Cmd+Option+K (Mac)
   - Safari: Enable Developer menu, then Cmd+Option+C

2. In the console, type this command and press Enter:
   localStorage.setItem('enableDebugPanel', 'true');

3. Refresh the page (F5 or Cmd+R)

4. You should see a red panel in the bottom-right corner

5. Take a screenshot that includes the red debug panel

6. Share the screenshot with us

Thank you!
```

## Related Files

- `src/utils/debugMode.ts` - Debug mode utility implementation
- `src/components/TrainingPlanDisplay.tsx` - Debug panel UI
- `src/hooks/usePlanManagement.ts` - Debug info computation
- `DEBUG_PANEL_REFACTOR.md` - Full technical documentation
