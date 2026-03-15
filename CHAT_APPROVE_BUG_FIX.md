# Chat Approve Changes Bug Fix

## Problem Summary

When clicking "Approve Changes" after a coach chat patch, the plan UI sometimes showed no change even though patches were valid. This happened because:

1. **Preview mode dropped canonical `days[]`**: Line 171 in `usePlanManagement.ts` did `setPlanData({ plan: previewWeeks })` which lost the canonical `days[]` array
2. **Chat history not persisted to DB**: `ChatInterface` called `onUpdatePlan()` and `onChatUpdate()` separately, but `updatedChatHistory` never reached `updatePlan()`, so DB writes used stale state from React
3. **Patches not sorted**: Preview list showed changes in random order, reducing user trust

## Root Causes

### A) Preview Mode State Loss (usePlanManagement.ts:171)

**BEFORE (BUGGY):**
```typescript
const previewWeeks = updatedPlan.plan.slice(0, 2);
setPlanData({ plan: previewWeeks }); // ❌ Drops days[]!
```

**AFTER (FIXED):**
```typescript
const previewWeeks = updatedPlan.plan?.slice(0, 2) ?? [];
setPlanData({ ...updatedPlan, plan: previewWeeks }); // ✅ Preserves days[]
```

### B) Chat History Not Wired Through

**Flow:**
1. `ChatInterface.handleApproveChanges()` → called `onUpdatePlan(planData)` and `onChatUpdate(chatHistory)` separately
2. `PlanWithChat.handleUpdatePlan()` → forwarded `planData` only
3. `usePlanManagement.updatePlan()` → wrote to DB using stale `chatHistory` from state

**FIXED:**
- Changed `onUpdatePlan` signature to accept optional `updatedChatHistory` parameter
- `ChatInterface` now passes both in one call: `onUpdatePlan(planData, chatHistory)`
- `PlanWithChat` forwards both: `onUpdatePlan(planData, chatHistory)`
- `updatePlan()` uses passed value: `chat_history: updatedChatHistory || chatHistory`

### C) No-Op Guard Added

Added check in `ChatInterface.handleApproveChanges()`:
```typescript
let changedCount = 0;
// ... apply patches and count changes
if (changedCount === 0) {
  alert("No changes were applied. Please try again or refine your request.");
  setPendingChanges(null);
  return;
}
```

### D) Patches Sorted by Date

In `ChangeConfirmationModal.tsx`:
```typescript
const sortedChanges = [...changes].sort((a, b) => a.date.localeCompare(b.date));
```

## Files Changed

1. **src/hooks/usePlanManagement.ts**
   - Fixed preview mode state update to preserve `days[]`
   - Added debug logging for troubleshooting

2. **src/components/ChatInterface.tsx**
   - Updated `onUpdatePlan` prop signature to accept `updatedChatHistory`
   - Added no-op guard to prevent silent failures
   - Fixed error handling (removed invalid `setToast` call)

3. **src/components/PlanWithChat.tsx**
   - Updated `onUpdatePlan` prop signature
   - `handleUpdatePlan` now forwards `updatedChatHistory` to parent

4. **src/components/ChangeConfirmationModal.tsx**
   - Added date sorting for chronological display

## Testing Checklist

- [x] Build passes with no errors
- [ ] Preview plan (14-day) approve change → UI updates immediately
- [ ] Full plan approve change → UI updates immediately
- [ ] Refresh after approve → changes persist (DB saved)
- [ ] Patch preview list displays in ascending date order
- [ ] Chat history persists in DB after approve
- [ ] No-op guard triggers when no changes detected

## Technical Details

### Canonical Plan Storage
- **Source of Truth**: `plan_data.days[]` (date-based array)
- **Display View**: `plan_data.plan[]` (week-based, derived from days[])
- **Patches Target**: `days[]` by date

### Preview Mode
- `fullPlanData` = complete plan
- `planData` = sliced view for display (first 2 weeks)
- **CRITICAL**: Must preserve `days[]` when slicing `plan[]` for preview

### Chat History Flow
- Stored in `chat_messages` table (primary)
- Cached in `training_plans.chat_history` (legacy fallback)
- Must be passed explicitly through approval flow to ensure DB consistency
