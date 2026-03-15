# Past Workout Cancellation Fix

## Problem

When users requested to cancel a past workout (e.g., "cancel last Tuesday's workout from this week"), the chat function would incorrectly interpret it as the **next** Tuesday instead of the Tuesday that already passed. This was because the AI was programmed to only look at future workouts.

## Root Cause

The system prompt had a blanket rule: "Never modify completed workouts or past dates". This prevented ALL past modifications, even for workouts that were never completed.

The natural language patterns didn't include support for past-tense references like "last Tuesday", "yesterday", "earlier this week".

## Solution

### 1. Added Past-Tense Pattern Recognition

Added new pattern sets to detect past references:

```typescript
const YESTERDAY_PATTERNS = [
  /\byesterday\b/i,
  /\byesterday'?s\b/i,
  /\blast night\b/i,
];

const PAST_WEEK_PATTERNS = [
  /\blast (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\bearlier this week\b/i,
  /\bprevious (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
];
```

### 2. Updated Natural Language Rules

Added explicit interpretations for past references:

```
"yesterday" → Today - 1 day
"last [weekday]" → Most recent past occurrence of that weekday
"last Tuesday from this week" → The Tuesday that already passed this week (in the past)
```

Added distinction between "next [weekday]" (future) and "last [weekday]" (past).

### 3. Modified Non-Negotiable Rules

Changed from:
```
Never modify completed workouts or past dates
```

To:
```
Never modify COMPLETED workouts (isCompleted: true)
Past workouts that were NOT completed CAN be cancelled/updated retroactively
```

### 4. Enhanced Workout Selection Context

Updated the completed workouts context to clarify:

```
COMPLETED WORKOUTS (CANNOT MODIFY): W1-Mon, W1-Wed, W2-Tue

WORKOUT SELECTION RULES:
- "next run" = first uncompleted RUNNING workout after today
- "next workout" = any uncompleted item after today
- "last [weekday]" = most recent past occurrence of that weekday
- Past workouts NOT in completed list CAN be cancelled retroactively
- Past workouts IN completed list CANNOT be modified
```

## Behavior Changes

### Before Fix
- "Cancel last Tuesday's workout" → Cancels NEXT Tuesday
- "Cancel yesterday's run" → Error or cancels tomorrow
- Past workouts could never be modified, even if never completed

### After Fix
- "Cancel last Tuesday's workout" → Cancels the Tuesday that passed
- "Cancel yesterday's run" → Cancels yesterday's workout (if not completed)
- "Cancel last Tuesday from this week" → Cancels this week's Tuesday (past)
- "Cancel next Tuesday" → Cancels the upcoming Tuesday (future)

## Safety Guardrails

The fix maintains safety by:

1. **Completed workouts still protected**: If a workout is marked as completed (user logged it), it CANNOT be modified
2. **Clear past/future distinction**: AI now understands temporal context better
3. **Retroactive cancellations allowed**: Users can cancel past workouts they missed or couldn't complete
4. **Minimal changes**: Only affects the specific workout requested

## Use Cases

### Valid Past Cancellations
✅ "I missed last Tuesday's run, cancel it"
✅ "Cancel yesterday's workout, I was sick"
✅ "I couldn't do Monday's long run, cancel it"
✅ "Remove last week's interval workout"

### Blocked Modifications
❌ "Cancel the run I logged yesterday" (already completed)
❌ "Change Tuesday's workout" (if it was logged/completed)
❌ "I want to modify my completed race" (race was logged)

## Testing

Test phrases to verify fix:
- "Cancel last Tuesday's workout"
- "I missed yesterday's run, cancel it"
- "Remove last Monday from this week"
- "Cancel last week's long run"

Expected behavior:
1. AI identifies the correct past date
2. Generates patch for that specific date
3. User sees confirmation with correct date
4. Only applies if workout wasn't completed

## Files Modified

1. `supabase/functions/chat-training-plan/index.ts`
   - Added YESTERDAY_PATTERNS (lines 29-33)
   - Added PAST_WEEK_PATTERNS (lines 35-39)
   - Updated system prompt natural language rules (lines 599-604)
   - Updated non-negotiable rules (lines 639-641)
   - Enhanced completed workouts context (lines 354)

## Deployment

Edge function deployed successfully with these changes.

## Related Issues

This fix addresses the temporal ambiguity problem where users referring to past events were having their requests interpreted as future events. The distinction between completed (cannot modify) and uncompleted past workouts (can cancel) provides the right balance of flexibility and data integrity.
