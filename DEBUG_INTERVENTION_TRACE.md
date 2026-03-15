# Coach Intervention Debug Trace

## What Was Added

Minimal console.log statements to trace the coach intervention flow from completion save through message display.

**No architecture changes** - only logging added.

---

## Debug Log Markers

All debug logs use consistent prefixes for easy filtering:

- `[DEBUG-FEEDBACK]` - Intervention trigger logic (`workoutFeedback.ts`)
- `[DEBUG-INTERVENTION]` - Message send/dedupe logic (`coachInterventionMessaging.ts`)
- `[DEBUG-APP]` - State update at App level (`App.tsx`)
- `[DEBUG-CHAT]` - Chat history rendering (`ChatInterface.tsx`)

---

## Test Procedure

### 1. Open Browser Console
- Open DevTools → Console tab
- Optionally filter by `DEBUG` to see only our logs

### 2. Complete a Workout with RPE Deviation
- Mark any workout complete
- Enter RPE that differs from expected by ±2 or more
  - Example: Easy run (expected RPE 5-6) but you enter RPE 8 or higher
  - Or: Hard workout (expected RPE 7-8) but you enter RPE 5 or lower
- Submit the completion

### 3. Watch Console Logs

Expected log sequence (if working):

```
[DEBUG-FEEDBACK] checkForAIFeedback CALLED
  → hasUser: true
  → savedPlanId: "abc-123"
  → completionId: "def-456"
  → rating: 5 (or whatever you entered)
  → hasOnChatUpdate: true ✓
  → currentChatHistoryLength: 1 (or current count)

[DEBUG-FEEDBACK] Deviation evaluation result:
  → shouldTrigger: true ✓
  → message: "I noticed your RPE was..."

[DEBUG-FEEDBACK] INTERVENTION TRIGGERED
  → source: "rpe_deviation"
  → workoutKey: "3-Mon"

[DEBUG-FEEDBACK] Setting 2s timeout to send intervention

--- Wait 2 seconds ---

[DEBUG-FEEDBACK] TIMEOUT FIRED - calling sendCoachInterventionMessage now

[DEBUG-INTERVENTION] sendCoachInterventionMessage CALLED
  → userId: "user-123"
  → planId: "abc-123"
  → hasOnChatUpdate: true ✓
  → currentChatHistoryLength: 1
  → metadata: { source: "rpe_deviation", workoutKey: "3-Mon", ... }

[DEBUG-INTERVENTION] Dedupe query result
  → existingMessagesCount: 0 (or count of previous interventions)

[DEBUG-INTERVENTION] Dedupe decision
  → isDuplicate: false ✓

[DEBUG-INTERVENTION] Inserting message to DB
  → role: "assistant"
  → contentLength: 150

[DEBUG-INTERVENTION] DB INSERT SUCCESS ✓

[DEBUG-INTERVENTION] onChatUpdate callback EXISTS, creating message

[DEBUG-INTERVENTION] Calling onChatUpdate
  → oldLength: 1
  → newLength: 2 ✓
  → newMessageRole: "assistant"

[DEBUG-INTERVENTION] onChatUpdate CALLED ✓

[DEBUG-INTERVENTION] Returning TRUE (success) ✓

[DEBUG-APP] onChatUpdate CALLED
  → oldLength: 1
  → newLength: 2 ✓
  → newMessages: [{ role: "assistant", contentPreview: "I noticed your RPE was..." }]

[DEBUG-CHAT] chatHistory changed
  → length: 2 ✓
  → messages: [
      { idx: 0, role: "assistant", contentPreview: "Hi, I'm your coach..." },
      { idx: 1, role: "assistant", contentPreview: "I noticed your RPE was..." } ✓
    ]
```

---

## Diagnosis Guide

Use the logs to determine which scenario is occurring:

### Scenario A: Message Not Sent

**Symptoms:**
- `[DEBUG-FEEDBACK]` logs appear
- BUT `[DEBUG-FEEDBACK] INTERVENTION TRIGGERED` does NOT appear

**Diagnosis:**
- RPE deviation evaluation is not triggering
- Check: `shouldTrigger: false` in deviation result
- **Root cause:** RPE entered doesn't meet threshold (|deviation| < 2)

---

### Scenario B: Message Sent But Not Appended

**Symptoms:**
- `[DEBUG-INTERVENTION] DB INSERT SUCCESS` ✓
- `[DEBUG-INTERVENTION] Returning TRUE (success)` ✓
- BUT `[DEBUG-APP] onChatUpdate CALLED` does NOT appear

**Diagnosis:**
- Check: `hasOnChatUpdate: true` or `false`?
- If **false**: `onChatUpdate` callback is not being passed down
- **Root cause:** Props not threaded correctly from App → PlanWithChat → TrainingPlanDisplay → useWorkoutOperations → checkForAIFeedback

---

### Scenario C: Message Appended But Not Rendered

**Symptoms:**
- `[DEBUG-APP] onChatUpdate CALLED` with `newLength: 2` ✓
- BUT `[DEBUG-CHAT] chatHistory changed` shows `length: 1` (no change)

**Diagnosis:**
- State update is called but not propagating
- **Root cause:** React state update issue (stale closure, batching, etc.)

---

### Scenario D: Message Rendered But Filtered Out

**Symptoms:**
- `[DEBUG-CHAT] chatHistory changed` shows `length: 2` ✓
- Messages array includes intervention with `role: "assistant"` ✓
- BUT message not visible in UI

**Diagnosis:**
- Rendering logic is filtering/hiding the message
- Check chat interface DOM for hidden messages
- **Root cause:** CSS issue, conditional rendering, or filter logic

---

### Scenario E: Message Sent to Wrong Thread

**Symptoms:**
- All logs look correct ✓
- `DB INSERT SUCCESS` ✓
- But message appears in different plan's chat

**Diagnosis:**
- Check: `planId` in logs - does it match current plan?
- **Root cause:** Wrong planId being passed

---

### Scenario F: Duplicate Prevention (Expected)

**Symptoms:**
- `[DEBUG-INTERVENTION] Dedupe decision` → `isDuplicate: true`
- `[DEBUG-INTERVENTION] SKIPPED - duplicate detected`
- Returns false

**Diagnosis:**
- This is CORRECT behavior if workout already has intervention
- Re-completing same workout should not send again

---

### Scenario G: Timeout Never Fires

**Symptoms:**
- `[DEBUG-FEEDBACK] Setting 2s timeout to send intervention` ✓
- BUT `[DEBUG-FEEDBACK] TIMEOUT FIRED` never appears

**Diagnosis:**
- Component unmounted before timeout completed
- setTimeout cleared or blocked
- **Root cause:** Celebration modal closes component tree

---

### Scenario H: Database Insert Fails

**Symptoms:**
- `[DEBUG-INTERVENTION] Inserting message to DB`
- `[DEBUG-INTERVENTION] DB INSERT FAILED`
- Error details logged

**Diagnosis:**
- Check error message in logs
- Common causes:
  - RLS policy rejection (user not authenticated)
  - Foreign key violation (planId doesn't exist)
  - Null constraint violation (missing required field)
- **Root cause:** Database/permission issue

---

### Scenario I: onChatUpdate is NULL

**Symptoms:**
- `[DEBUG-INTERVENTION] WARNING: onChatUpdate callback is NULL/undefined`
- Message saved to DB but not appended to local state

**Diagnosis:**
- Callback not passed or lost in prop chain
- Message is in database but won't appear until refresh
- **Root cause:** Props not threaded correctly

---

## Quick Filters

### Filter by scenario:

```javascript
// Show only intervention flow
DEBUG-FEEDBACK|DEBUG-INTERVENTION

// Show only state updates
DEBUG-APP|DEBUG-CHAT

// Show only errors
DEBUG.*FAILED|DEBUG.*ERROR|DEBUG.*WARNING

// Show only success path
DEBUG.*SUCCESS|DEBUG.*CALLED
```

---

## Expected Behavior Summary

**If working correctly:**

1. ✅ `checkForAIFeedback` called with `hasOnChatUpdate: true`
2. ✅ `shouldTrigger: true` if RPE deviation qualifies
3. ✅ `TIMEOUT FIRED` after 2 seconds
4. ✅ `sendCoachInterventionMessage CALLED` with correct params
5. ✅ `Dedupe decision` → `isDuplicate: false` (first time)
6. ✅ `DB INSERT SUCCESS`
7. ✅ `onChatUpdate callback EXISTS`
8. ✅ `onChatUpdate CALLED` with `newLength` incremented
9. ✅ `[DEBUG-APP] onChatUpdate CALLED` at App level
10. ✅ `[DEBUG-CHAT] chatHistory changed` with new assistant message
11. ✅ Message visible in chat UI with coach attribution

**If any step fails, the logs will show exactly where.**

---

## Next Steps After Testing

Once you run the test and collect the console logs:

1. **Copy the full console output** (filter by `DEBUG` for clarity)
2. **Identify which scenario** matches the log pattern
3. **Report findings** with:
   - Which scenario (A-I) occurred
   - Copy of relevant log lines
   - Any error messages

Then we can implement the minimal targeted fix for the specific failure point.

---

## Clean Up After Debug

Once issue is identified and fixed, remove debug logs:

```bash
# Find all debug logs
grep -r "console.log.*DEBUG-" src/

# Remove them manually or with sed
```

---

**Status:** Debug logging added, build passing, ready for testing.
