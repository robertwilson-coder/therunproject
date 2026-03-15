# Chat Function Diagnostic Guide

## Problem Statement
The chat function is not manipulating workouts upon user request. Changes are not being applied to the training plan.

## Diagnostic Logging Added

I've added comprehensive debug logging throughout the entire chat flow to trace where the issue is occurring. The logs follow this naming pattern for easy filtering:

- `[Chat]` - Main chat request/response flow
- `[DetectChanges]` - Patch-to-changes conversion
- `[ChatApprove]` - Approval and patch application
- `[UpdatePlan]` - Plan state updates
- `[DEBUG-CHAT]` - State change monitoring

## How to Debug

### Step 1: Test the Chat Flow

1. Open your training plan with the chat interface
2. Open browser DevTools Console (F12)
3. Send a chat message requesting a workout change, for example:
   - "Cancel my run tomorrow"
   - "Move my long run to Saturday"
   - "Shorten tomorrow's run to 5k"

### Step 2: Check Console Logs

Look for these key log entries in sequence:

#### A) Request Sent
```
[Chat] Sending request to edge function: {
  message: "...",
  planStartDate: "2025-01-01",
  todaysDate: "2025-01-15",
  currentWeekNumber: 3,
  hasPlanData: true,
  planDataDays: 84,
  planDataWeeks: 12
}
```

**Check:**
- Is `planStartDate` present?
- Is `currentWeekNumber` correct?
- Does `planDataDays` have entries?

#### B) Response Received
```
[Chat] Received response from edge function: {
  hasResponse: true,
  hasPatches: true,
  patchesIsArray: true,
  patchesLength: 1,
  responsePreview: "I've cancelled your run for tomorrow..."
}
```

**Check:**
- Is `hasPatches` true?
- Is `patchesLength` > 0?
- Does the response preview make sense?

#### C) Patches Processing
```
[Chat] Processing patches array, length: 1

[Chat] Patches received: [
  {
    "date": "2025-01-16",
    "weekday": "Wed",
    "week": 3,
    "action": "cancel",
    "workout": "Rest",
    "workout_type": "REST",
    "tips": []
  }
]
```

**Check:**
- Are patches well-formed?
- Do dates match expected calendar dates?
- Are `workout` and `workout_type` fields present?

#### D) Changes Detected
```
[DetectChanges] Starting, patches count: 1
[DetectChanges] planData.days exists: true
[DetectChanges] planData.days is array: true
[DetectChanges] planData.days length: 84
[DetectChanges] Built daysMap with 84 entries
[DetectChanges] Processing patch 0: {
  date: "2025-01-16",
  week: 3,
  weekday: "Wed",
  workout: "Rest"
}
[DetectChanges] Patch 0 mapping: "5km easy run" -> "Rest"
[DetectChanges] Completed, total changes: 1
```

**Check:**
- Is `planData.days` present and populated?
- Does the daysMap have entries?
- Is the before/after mapping correct?

#### E) Modal State Updated
```
[DEBUG-CHAT] pendingChanges changed: {
  hasPendingChanges: true,
  patchesCount: 1,
  changesCount: 1,
  explanation: "I've cancelled your run for tomorrow..."
}
```

**Check:**
- Did `pendingChanges` get set?
- Does it have the correct data?

### Step 3: Identify the Failure Point

Based on where the logs stop or show unexpected values:

#### Scenario 1: No patches in response
**Symptom:** `patchesLength: 0` or `hasPatches: false`

**Likely Cause:** The AI is not generating patches, possibly because:
- Request is interpreted as info-only (e.g., "What's my next workout?")
- Request is ambiguous or unclear
- Context data (dates, plan) is missing or malformed

**Solution:**
- Try a clearer, more specific request
- Check that `planStartDate` and `currentWeekNumber` are valid in the request log

#### Scenario 2: Patches validation fails
**Symptom:** Error response with `isDateValidationError: true`

**Likely Cause:** Patches contain invalid dates or weekdays that don't exist in the plan

**Solution:**
- Check edge function logs in Supabase dashboard
- Verify `planData.days[]` has the expected date range
- Ensure plan start date aligns with plan structure

#### Scenario 3: planData.days is missing
**Symptom:** `[DetectChanges] planData.days is missing or not an array!`

**Likely Cause:**
- Plan hasn't been normalized yet (legacy week-based plan)
- Preview mode dropped the days array (should be fixed now)
- Plan data structure is corrupted

**Solution:**
- Reload the page to trigger plan normalization
- Check that the plan was saved with canonical `days[]`
- Verify `plan_data.days` exists in the database

#### Scenario 4: Modal doesn't appear
**Symptom:** pendingChanges is set but modal doesn't show

**Likely Cause:**
- Modal is being rendered but not visible (z-index issue)
- React rendering issue
- Component structure problem

**Solution:**
- Check React DevTools to see if ChangeConfirmationModal is in the tree
- Look for CSS/styling issues hiding the modal
- Check for JavaScript errors blocking render

#### Scenario 5: Approve does nothing
**Symptom:** Modal appears, approve clicked, but plan doesn't update

**Likely Cause:**
- Patches not being applied correctly
- State update not persisting to DB
- Chat history not being saved

**Solution:**
- Check `[ChatApprove]` logs for patch application
- Verify `[UpdatePlan]` logs show DB write attempt
- Check Supabase logs for database errors

## Common Issues and Fixes

### Issue: AI returns empty patches array
```json
{ "patches": [], "response": "Your next run is tomorrow..." }
```

**Fix:** The request was interpreted as informational. Rephrase to clearly request a modification:
- ❌ "What's my run tomorrow?"
- ✅ "Cancel my run tomorrow"

### Issue: Date validation error
```json
{ "error": "Patch 0: date 2025-01-16 not in canonical plan" }
```

**Fix:** The requested date doesn't exist in the plan. Check:
- Is the plan start date correct?
- Has enough time passed that the plan expired?
- Reload to trigger plan regeneration if needed

### Issue: No changes detected (no-op guard triggered)
```
[ChatApprove] NO-OP: No actual changes detected, aborting save
```

**Fix:** The patches didn't actually change anything (e.g., canceling a rest day that's already rest). This is working as intended to prevent false saves.

## Next Steps

1. **Run a test** with clear debug output
2. **Share console logs** starting from `[Chat] Sending request` through `[ChatApprove]`
3. **Include:**
   - The exact message you sent
   - The plan type (preview vs full)
   - Any error messages or unexpected values

## Files Modified for Debugging

- `src/components/ChatInterface.tsx` - Added comprehensive logging
- `src/hooks/usePlanManagement.ts` - Added preview mode and update logs

## Logging Can Be Disabled Later

Once the issue is resolved, you can reduce log verbosity by:
1. Changing `logger.info` to `logger.debug`
2. Removing logs entirely if performance is critical
3. Wrapping logs in `if (DEBUG_MODE)` checks
