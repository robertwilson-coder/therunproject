# Coach Intervention Dedupe Fix

## Problem Identified

The dedupe logic was too aggressive:
- Matched on `source + workoutKey` only
- Blocked ALL future messages for that workout, even after editing
- Prevented re-evaluation when user changes RPE and saves again

Example scenario that was blocked incorrectly:
1. Complete workout with RPE 8 → intervention sent ✓
2. Edit completion, change RPE to 9 → re-save
3. Dedupe finds existing message for workoutKey → blocks ✗

## Solution Implemented

### Changed Dedupe Key

**Before:** `source + workoutKey`
**After:** `source + workoutKey + completionId`

### New Behavior

**RPE Deviation Messages (have completionId):**
- ✅ First completion: sends message
- ✅ Re-opening modal without changes: skips (same completionId)
- ✅ Edit RPE and save again: NEW completionId → sends new message
- ✅ Different completion of same workout: different completionId → sends

**Pattern-Based Messages (no completionId):**
- Fallback to `source + workoutKey` matching
- Maintains backward compatibility

---

## Code Changes

### File: `src/utils/coachInterventionMessaging.ts`

#### Updated Dedupe Logic (lines 73-133)

```typescript
if (existingMessages) {
  // Check if any message has matching source + workoutKey + completionId
  let matchedMessage = null;
  const isDuplicate = existingMessages.some(msg => {
    const meta = msg.metadata as CoachInterventionMetadata | null;

    // Match requires: same source AND same workoutKey
    const sourceAndKeyMatch = meta?.source === metadata.source &&
                              meta?.workoutKey === metadata.workoutKey;

    if (!sourceAndKeyMatch) {
      return false;
    }

    // If NEW message has completionId, also require completionId match
    // This allows re-send if workout is edited (new completionId)
    if (metadata.completionId) {
      const completionIdMatch = meta?.completionId === metadata.completionId;
      if (completionIdMatch) {
        matchedMessage = msg;
        return true;
      }
      return false;
    }

    // If NEW message has no completionId (pattern-based), match on source+key only
    if (sourceAndKeyMatch) {
      matchedMessage = msg;
      return true;
    }
    return false;
  });
}
```

#### Enhanced Debug Logging

Added logs to show:
- `completionIdMatch` comparison
- Which completionId was matched when skipping
- Whether message has completionId or not

---

## Expected Behavior After Fix

### Scenario 1: First Completion with RPE Deviation
**Action:** Complete workout, enter RPE that deviates ±2
**Result:** ✅ Message sent
**Log:** `isDuplicate: false` → `DB INSERT SUCCESS`

### Scenario 2: Re-open Same Completion (No Changes)
**Action:** View completion details again without editing
**Result:** ✅ Message skipped (same completionId)
**Log:** `isDuplicate: true, completionIdMatch: true` → `SKIPPED`

### Scenario 3: Edit Completion, Save New RPE
**Action:** Edit RPE from 8 → 9, save
**Result:** ✅ New message sent (new completionId)
**Log:** `isDuplicate: false` (different completionId) → `DB INSERT SUCCESS`

### Scenario 4: Complete Different Workout on Same Day
**Action:** Complete Monday's workout twice (two separate completions)
**Result:** ✅ Both can send messages (different completionIds)
**Log:** Each has unique completionId → both send

### Scenario 5: Pattern-Based Intervention
**Action:** Multiple hard workouts trigger pattern detection
**Result:** ✅ Message sent once for pattern
**Log:** `no completionId` → matches on `source + workoutKey` only

---

## Testing Instructions

### Test 1: Verify First Send Works
1. Complete workout with RPE deviation (±2 from expected)
2. Wait 2s after celebration
3. **Expected:** Coach message appears in chat
4. **Debug Log:**
   ```
   [DEBUG-INTERVENTION] Dedupe decision
     isDuplicate: false
   [DEBUG-INTERVENTION] DB INSERT SUCCESS
   ```

### Test 2: Verify Re-open Doesn't Duplicate
1. Use same completion from Test 1
2. Trigger checkForAIFeedback again (e.g., view details)
3. **Expected:** No new message
4. **Debug Log:**
   ```
   [DEBUG-INTERVENTION] Dedupe decision
     isDuplicate: true
     matchedCompletionId: "abc-123"
   [DEBUG-INTERVENTION] SKIPPED - duplicate detected for completionId: abc-123
   ```

### Test 3: Verify Edit Allows Re-send
1. Edit the completion from Test 1
2. Change RPE to different value that still deviates
3. Save completion (creates new completionId)
4. **Expected:** NEW coach message appears
5. **Debug Log:**
   ```
   [DEBUG-INTERVENTION] Checking message
     msgCompletionId: "abc-123"
     newCompletionId: "def-456"
     completionIdMatch: false
   [DEBUG-INTERVENTION] Dedupe decision
     isDuplicate: false
   [DEBUG-INTERVENTION] DB INSERT SUCCESS
   ```

### Test 4: Check Database
Query chat_messages to verify metadata structure:

```sql
SELECT
  id,
  role,
  content,
  metadata->>'source' as source,
  metadata->>'workoutKey' as workout_key,
  metadata->>'completionId' as completion_id,
  created_at
FROM chat_messages
WHERE role = 'assistant'
  AND metadata->>'source' IN ('rpe_deviation', 'pattern_based')
ORDER BY created_at DESC
LIMIT 10;
```

**Expected:** Each RPE deviation message has unique completionId

---

## Metadata Structure

All coach intervention messages include:

```typescript
{
  source: 'rpe_deviation' | 'pattern_based',
  completionId: string,  // Present for RPE deviation, optional for pattern
  workoutKey: string,    // Format: "weekNumber-dayName" e.g., "3-Mon"
  deviationValue?: number,  // RPE deviation amount (e.g., +3, -2)
  timestamp: string      // ISO timestamp
}
```

---

## Backward Compatibility

**Old messages without completionId:**
- Still matched on `source + workoutKey`
- Will block new messages with same workoutKey until user edits completion

**New messages with completionId:**
- Use refined matching with completionId
- Allow multiple interventions per workoutKey if different completions

**Migration:** No database migration needed. New logic handles both cases.

---

## Debug Log Markers

Filter console by these to trace dedupe decisions:

```
[DEBUG-INTERVENTION] Checking message
  → Shows completionId comparison for each existing message

[DEBUG-INTERVENTION] Dedupe decision
  → Final decision with matched completionId

[DEBUG-INTERVENTION] SKIPPED - duplicate detected for completionId: xxx
  → Message blocked, shows which completionId matched
```

---

## Files Modified

1. **src/utils/coachInterventionMessaging.ts**
   - Updated dedupe logic to check completionId
   - Enhanced debug logging
   - Updated JSDoc comments

2. **src/utils/workoutFeedback.ts**
   - Already passing completionId in metadata (verified)
   - No changes needed

3. **src/hooks/useWorkoutOperations.ts**
   - Already passing completionData.id as completionId (verified)
   - No changes needed

---

## Summary

**Before:** Dedupe blocked all messages for a workout after first intervention
**After:** Dedupe only blocks duplicate of SAME completion event

**Result:** Users can edit RPE and get fresh coach feedback, while preventing spam from re-renders.

**Status:** ✅ Built successfully, ready for testing
