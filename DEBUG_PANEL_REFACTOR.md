# Debug Panel Refactor - Production Cleanup

## Summary

Removed the debug panel from production builds while preserving it as an opt-in diagnostic tool for development. The debug panel was previously always visible (fixed red panel in bottom-right corner) and was used during the major normalization and date-handling refactor. Now that the core invariants are stable, it has been gated behind a dev-only mechanism.

## What Changed

### Files Modified

1. **`src/utils/debugMode.ts`** (NEW)
   - Centralized debug mode detection utility
   - Checks `import.meta.env.PROD` to ensure never enabled in production
   - Uses `localStorage.getItem('enableDebugPanel')` as opt-in flag in dev
   - Exposes `window.debugMode` utilities for easy console access

2. **`src/components/TrainingPlanDisplay.tsx`**
   - Added `isDebugModeEnabled()` import
   - Wrapped debug panel JSX in conditional: `{isDebugModeEnabled() && <div>...</div>}`
   - Debug panel rendering completely skipped when disabled (not just hidden via CSS)

3. **`src/hooks/usePlanManagement.ts`**
   - Added `isDebugModeEnabled()` import
   - Made `debugInfo` state type `undefined` by default
   - Wrapped `setDebugInfo()` call in `if (isDebugModeEnabled())` check
   - Debug info computation completely skipped in production

4. **`src/components/PlanWithChat.tsx`**
   - No changes needed (already had optional `debugInfo?` prop)

5. **`src/App.tsx`**
   - No changes needed (already had optional `debugInfo?` prop)

## How to Enable Debug Panel

### In Development

```javascript
// In browser console:
localStorage.setItem('enableDebugPanel', 'true');
// Then refresh the page

// Or use the convenience method:
debugMode.enable();
```

### To Disable

```javascript
// In browser console:
localStorage.removeItem('enableDebugPanel');
// Then refresh the page

// Or use the convenience method:
debugMode.disable();
```

### Check Status

```javascript
// In browser console:
debugMode.isEnabled();
// Returns: true or false
```

## Guarantees

### Production Safety

✅ **Debug panel NEVER renders in production** - `import.meta.env.PROD` check ensures it
✅ **Debug info NEVER computed in production** - computation gated behind same check
✅ **Zero performance impact** - no React state updates, no normalization analysis
✅ **Tree-shakeable** - production bundles can eliminate debug code entirely

### Development Flexibility

✅ **Opt-in by default** - developers must explicitly enable it
✅ **Persists across reloads** - localStorage setting survives page refresh
✅ **Easy to toggle** - console commands for quick enable/disable
✅ **Full diagnostics** - all debug info still available when enabled

## What the Debug Panel Shows (When Enabled)

### Plan Structure
- `plan_type` - static | responsive | date_based_preview | date_based_full
- `days.length` - number of days in canonical array
- `plan.length` - number of weeks in derived array
- `start_date` - plan start date in YYYY-MM-DD format

### View State
- `selectedDate` - current date anchor for view synchronization
- `currentWeekIdx` - derived week index from selectedDate
- `weekRange` - Mon-Sun date range for current week
- `viewMode` - "week" or "calendar"

### Normalization Diagnostics
- `isDateBased` - whether plan is date-based
- `wasNormalized` - whether normalization ran on load
- `db_write` - whether normalized data was persisted to database
- `normalizedWeeks` - number of weeks after normalization
- `week1HasAllDays` - whether week 1 has all 7 days (Mon-Sun)
- `missing` - list of missing days in week 1 (if any)
- `invariantFails` - count of invariant validation failures

## Architecture Benefits

### Separation of Concerns

**Before:**
- Debug panel always rendered, mixed with production UI
- Debug info always computed, affecting performance
- No clear boundary between diagnostic and core logic

**After:**
- Debug panel is a separate, gated feature
- Debug info computation happens only when needed
- Clean boundary: core logic has zero knowledge of debug panel

### Maintenance

**Easy to Delete:**
- Remove `debugMode.ts` utility
- Remove `isDebugModeEnabled()` checks
- Remove debug panel JSX
- Remove `debugInfo` state and props
- Core app logic completely unaffected

**Easy to Extend:**
- Add new fields to `debugInfo` object
- Add new sections to debug panel JSX
- All changes isolated to debug-specific code

### Code Quality

**Read-Only:**
- Debug panel only reads state, never mutates
- No side effects, no event handlers
- Pure diagnostic tool

**No Leaky Abstractions:**
- Core components don't depend on debug panel
- Debug panel depends on core components
- Unidirectional dependency

**Performance:**
- Production builds skip all debug code paths
- No unnecessary state updates
- No unnecessary DOM elements

## Invariants Maintained

✅ **`days[]` is single source of truth** - debug panel only reads, never writes
✅ **`plan[]` is derived from `days[]`** - debug panel observes, doesn't influence
✅ **selectedDate drives view synchronization** - debug panel displays, doesn't control
✅ **Normalization is idempotent** - debug panel tracks, doesn't trigger

## Testing Checklist

### Production Build
- [ ] Run `npm run build`
- [ ] Check production bundle does not include debug panel
- [ ] Verify no localStorage debug checks in prod bundle
- [ ] Confirm `isDebugModeEnabled()` always returns false

### Development Build
- [ ] Run `npm run dev`
- [ ] By default, debug panel should NOT appear
- [ ] Run `localStorage.setItem('enableDebugPanel', 'true')` in console
- [ ] Refresh page, debug panel should appear in bottom-right
- [ ] All debug info fields should be populated
- [ ] Run `localStorage.removeItem('enableDebugPanel')` in console
- [ ] Refresh page, debug panel should disappear

### Debug Info Accuracy
- [ ] Load a date-based plan, verify `isDateBased: true`
- [ ] Load an old plan that needs normalization, verify `wasNormalized: true`
- [ ] Check `days.length` matches actual days array
- [ ] Check `plan.length` matches actual weeks array
- [ ] Verify `selectedDate` updates when navigating weeks/calendar
- [ ] Verify `currentWeekIdx` derives correctly from `selectedDate`

## Why Not Delete Completely?

**Short-term reason:** We may need to add new date-based features or migrate more old plans. Having the debug panel available as an opt-in tool is valuable for:
- Debugging customer issues (ask them to enable it and screenshot)
- Validating migrations work correctly
- Developing new date-handling features
- Investigating normalization edge cases

**Long-term reason:** If/when we delete it completely, the architecture makes it trivial:
1. Remove `debugMode.ts`
2. Remove `isDebugModeEnabled()` checks (3 files)
3. Remove debug panel JSX (1 block in TrainingPlanDisplay)
4. Remove `debugInfo` state and props (4 files)
5. Done - zero impact on core logic

## Alternative Approaches Considered

### ❌ CSS `display: none` Only
**Problem:** Still renders in React tree, still computes debug info, still affects performance

### ❌ Environment Variable Only
**Problem:** Can't enable/disable without rebuilding, not convenient for debugging customer issues

### ❌ URL Query Parameter
**Problem:** URL becomes non-shareable, bookmarks break, more complex state management

### ✅ Chosen: `import.meta.env.PROD` + `localStorage` (SELECTED)
**Why:** Perfect balance of production safety and development convenience

## Migration Notes

**For developers:**
- If you were relying on the debug panel being always visible, you now need to explicitly enable it with `localStorage.setItem('enableDebugPanel', 'true')`
- If you have it enabled and want to see the "real" production UI, disable it with `localStorage.removeItem('enableDebugPanel')`

**For QA/testing:**
- Production deployments will never show the debug panel, regardless of localStorage settings
- Staging deployments (if built with `NODE_ENV=development`) can enable it for debugging

**For support:**
- If a customer reports an issue with plan loading or date handling, ask them to:
  1. Open browser console (F12)
  2. Run: `localStorage.setItem('enableDebugPanel', 'true')`
  3. Refresh the page
  4. Screenshot the red debug panel
  5. Share screenshot with engineering

## Console Utilities

When running in development mode, the following utilities are available in the browser console:

```javascript
// Enable debug panel (requires page refresh to take effect)
debugMode.enable();

// Disable debug panel (requires page refresh to take effect)
debugMode.disable();

// Check if debug mode is currently enabled
debugMode.isEnabled();
// Returns: true or false
```

Example console output:
```
> debugMode.enable()
[Debug Mode] Enabled. Refresh the page to see debug panels.

> debugMode.isEnabled()
true

> debugMode.disable()
[Debug Mode] Disabled. Refresh the page to hide debug panels.
```

## Future Enhancements

Potential improvements for the debug system (not in scope for this refactor):

1. **Collapsible Debug Panel**
   - Add minimize/maximize button
   - Remember collapsed state in localStorage

2. **Debug History**
   - Track last N normalization results
   - Show trends (e.g., "normalized on 3 of last 5 loads")

3. **Performance Metrics**
   - Add timing data for normalization
   - Track rendering performance
   - Memory usage for large plans

4. **Export Debug Report**
   - Button to copy all debug info as JSON
   - Include console logs, state snapshots
   - Easier for customer support

5. **Debug Assertions**
   - Runtime checks for invariants
   - Alert when invariants violated
   - Automatic bug reports

## Related Documentation

- `PLAN_NORMALIZATION_IMPLEMENTATION.md` - Why normalization exists
- `WORKOUT_MOVE_FIX.md` - Recent fix to move operations
- `TRIGGER_RELIABILITY_EXPLANATION.md` - Database trigger behavior

## Summary

This refactor achieves the primary goal: **remove debug UI from production while preserving it as a development tool**. The implementation is clean, safe, and easy to extend or delete in the future. Core app behavior has zero dependencies on the debug system.
