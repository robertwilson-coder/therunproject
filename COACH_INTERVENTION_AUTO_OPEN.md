# Coach Intervention Auto-Open Chat Feature

## Problem Solved

Coach intervention messages were being successfully saved to the database but remained invisible to users because:
- The chat panel stayed closed after message insertion
- No notification/indicator that a coach message arrived
- Users had no way to know they should open the chat

## Solution Overview

Implemented a clean, event-driven architecture that automatically opens the chat when the coach sends an intervention message after workout completion.

---

## Architecture

### Event Flow

```
1. User completes workout with RPE deviation
   ↓
2. useWorkoutOperations.submitWorkoutRating()
   ↓
3. checkForAIFeedback() evaluates deviation
   ↓
4. sendCoachInterventionMessage() inserts to DB
   ↓
5. onInterventionSent callback fired (after DB success)
   ↓
6. handleCoachInterventionSent() in PlanWithChat
   ↓
7. setIsChatOpen(true) → Chat opens automatically
```

### Component Hierarchy

```
PlanWithChat (owns isChatOpen state)
  └─ TrainingPlanDisplay
       └─ useWorkoutOperations hook
            └─ checkForAIFeedback()
                 └─ sendCoachInterventionMessage()
```

---

## Implementation Details

### 1. Chat Visibility Control

**Location:** `PlanWithChat.tsx`

**State:**
```typescript
const [isChatOpen, setIsChatOpen] = useState(false);
const [lastAutoOpenTime, setLastAutoOpenTime] = useState<number>(0);
```

**Control:**
- Chat button (when closed): `onClick={() => setIsChatOpen(true)}`
- Close button (when open): `onClick={() => setIsChatOpen(false)}`
- Auto-open handler: `handleCoachInterventionSent()`

### 2. Event Callback Interface

**Type Signature:**
```typescript
onCoachInterventionSent?: (params: {
  source: string;
  workoutKey: string;
  completionId?: string;
}) => void;
```

**Purpose:**
- Notifies UI that coach message was sent
- Carries minimal metadata (source, workout, completion)
- Only called AFTER successful DB insert

### 3. Callback Threading

The callback flows through these layers:

**sendCoachInterventionMessage** (`coachInterventionMessaging.ts`)
```typescript
// After DB insert success
if (onInterventionSent) {
  onInterventionSent({
    source: metadata.source,
    workoutKey: metadata.workoutKey,
    completionId: metadata.completionId
  });
}
```

**checkForAIFeedback** (`workoutFeedback.ts`)
```typescript
interface CheckForAIFeedbackParams {
  // ... other params
  onInterventionSent?: (params: {...}) => void;
}

// Pass through to sendCoachInterventionMessage
await sendCoachInterventionMessage({
  // ... other params
  onInterventionSent
});
```

**useWorkoutOperations** (`hooks/useWorkoutOperations.ts`)
```typescript
interface UseWorkoutOperationsProps {
  // ... other props
  onCoachInterventionSent?: (params: {...}) => void;
}

// Pass through to checkForAIFeedback
await checkForAIFeedback({
  // ... other params
  onInterventionSent: onCoachInterventionSent
});
```

**TrainingPlanDisplay** (`components/TrainingPlanDisplay.tsx`)
```typescript
interface TrainingPlanDisplayProps {
  // ... other props
  onCoachInterventionSent?: (params: {...}) => void;
}

// Pass through to hook
useWorkoutOperations({
  // ... other props
  onCoachInterventionSent
});
```

**PlanWithChat** (`components/PlanWithChat.tsx`)
```typescript
// Implements the handler
const handleCoachInterventionSent = (params) => {
  // Auto-open logic here
};

// Passes to child
<TrainingPlanDisplay
  // ... other props
  onCoachInterventionSent={handleCoachInterventionSent}
/>
```

---

## Auto-Open Logic

**Location:** `PlanWithChat.handleCoachInterventionSent()`

### Rules

1. **Anti-Spam Protection**
   - Tracks `lastAutoOpenTime` timestamp
   - Prevents auto-open within 10 seconds of previous auto-open
   - Prevents multiple rapid openings if user completes multiple workouts

2. **Source Filtering**
   - Only auto-opens for `source === 'rpe_deviation'`
   - Skips for `source === 'pattern_based'` (less urgent)
   - Can be configured to add more sources

3. **Already Open Detection**
   - Checks if `isChatOpen === true`
   - If already open, does nothing (user can already see message)
   - Avoids redundant state updates

4. **Open Action**
   - Sets `isChatOpen = true`
   - Updates `lastAutoOpenTime = now`
   - Chat panel appears immediately

### Implementation

```typescript
const handleCoachInterventionSent = (params: {
  source: string;
  workoutKey: string;
  completionId?: string;
}) => {
  console.log('[DEBUG-CHAT-AUTO-OPEN] Coach intervention sent:', params);

  // Anti-spam check
  const now = Date.now();
  const timeSinceLastOpen = now - lastAutoOpenTime;
  if (timeSinceLastOpen < 10000) {
    console.log('[DEBUG-CHAT-AUTO-OPEN] Skipping - too soon');
    return;
  }

  // Source filter
  if (params.source !== 'rpe_deviation') {
    console.log('[DEBUG-CHAT-AUTO-OPEN] Skipping - not RPE deviation');
    return;
  }

  // Already open check
  if (isChatOpen) {
    console.log('[DEBUG-CHAT-AUTO-OPEN] Chat already open');
    return;
  }

  // Auto-open
  console.log('[DEBUG-CHAT-AUTO-OPEN] Opening chat');
  setIsChatOpen(true);
  setLastAutoOpenTime(now);
};
```

---

## Debug Logging

### Log Prefixes

**[DEBUG-INTERVENTION]** - Dedupe and DB insert logging
```
[DEBUG-INTERVENTION] sendCoachInterventionMessage CALLED
[DEBUG-INTERVENTION] DB INSERT SUCCESS
[DEBUG-INTERVENTION] Calling onInterventionSent callback
```

**[DEBUG-CHAT-AUTO-OPEN]** - Auto-open decision logging
```
[DEBUG-CHAT-AUTO-OPEN] Coach intervention sent: {source, workoutKey, completionId}
[DEBUG-CHAT-AUTO-OPEN] Skipping auto-open - too soon since last open
[DEBUG-CHAT-AUTO-OPEN] Skipping auto-open - not RPE deviation source
[DEBUG-CHAT-AUTO-OPEN] Chat already open, no action needed
[DEBUG-CHAT-AUTO-OPEN] Opening chat automatically
```

### Trace Full Flow

To trace a complete intervention:
1. Filter console by `[DEBUG-FEEDBACK]` - See when intervention triggers
2. Filter by `[DEBUG-INTERVENTION]` - See DB insert and callback
3. Filter by `[DEBUG-CHAT-AUTO-OPEN]` - See auto-open decision

---

## Behavior Matrix

| Scenario | Chat State Before | Auto-Open? | Reason |
|----------|------------------|------------|--------|
| RPE deviation, first time | Closed | ✅ Yes | Primary use case |
| RPE deviation, chat open | Open | ❌ No | Already visible |
| RPE deviation, 5s after last open | Closed | ❌ No | Anti-spam (< 10s) |
| RPE deviation, 15s after last open | Closed | ✅ Yes | Anti-spam cleared |
| Pattern-based intervention | Closed | ❌ No | Not urgent source |
| Manual completion (no deviation) | Closed | ❌ No | No intervention sent |

---

## Testing Scenarios

### Test 1: Basic Auto-Open
**Steps:**
1. Complete workout with RPE deviation (±2 from expected)
2. Wait 2 seconds (celebration + intervention delay)
3. **Expected:** Chat opens automatically, message visible

**Logs:**
```
[DEBUG-FEEDBACK] INTERVENTION TRIGGERED
[DEBUG-INTERVENTION] DB INSERT SUCCESS
[DEBUG-INTERVENTION] Calling onInterventionSent callback
[DEBUG-CHAT-AUTO-OPEN] Coach intervention sent
[DEBUG-CHAT-AUTO-OPEN] Opening chat automatically
```

### Test 2: Chat Already Open
**Steps:**
1. Manually open chat before completing workout
2. Complete workout with RPE deviation
3. **Expected:** Chat stays open, no re-open action

**Logs:**
```
[DEBUG-INTERVENTION] DB INSERT SUCCESS
[DEBUG-INTERVENTION] Calling onInterventionSent callback
[DEBUG-CHAT-AUTO-OPEN] Chat already open, no action needed
```

### Test 3: Anti-Spam Protection
**Steps:**
1. Complete workout #1 with deviation → chat opens
2. Close chat
3. Immediately complete workout #2 with deviation
4. **Expected:** Chat does NOT auto-open (< 10s)

**Logs:**
```
// Workout 1
[DEBUG-CHAT-AUTO-OPEN] Opening chat automatically

// Workout 2 (< 10s later)
[DEBUG-CHAT-AUTO-OPEN] Skipping auto-open - too soon since last open
  timeSinceLastOpen: 3245
  antiSpamWindow: 10000
```

### Test 4: Pattern-Based (No Auto-Open)
**Steps:**
1. Complete 5 hard workouts in a row → pattern detected
2. **Expected:** Message sent but chat does NOT auto-open

**Logs:**
```
[DEBUG-INTERVENTION] DB INSERT SUCCESS (source: pattern_based)
[DEBUG-INTERVENTION] Calling onInterventionSent callback
[DEBUG-CHAT-AUTO-OPEN] Skipping auto-open - not RPE deviation source
```

### Test 5: Works in Both Views
**Steps:**
1. Complete workout from Week View with deviation → chat opens
2. Switch to Calendar View, complete another workout with deviation
3. **Expected:** Chat opens from both views

### Test 6: Dedupe Still Works
**Steps:**
1. Complete workout with deviation → chat opens, message sent
2. Re-open completion modal without editing
3. **Expected:** No new message sent, no duplicate auto-open

**Logs:**
```
[DEBUG-INTERVENTION] Dedupe decision
  isDuplicate: true
  matchedCompletionId: "abc-123"
[DEBUG-INTERVENTION] SKIPPED - duplicate detected
// onInterventionSent NOT called
```

---

## Edge Cases Handled

### 1. Multiple Rapid Completions
**Problem:** User completes 3 workouts in quick succession
**Solution:** Anti-spam window prevents chat from opening/closing repeatedly
**Behavior:** First opens chat, subsequent ones wait 10s

### 2. User Closes Chat Immediately
**Problem:** User closes chat after auto-open
**Solution:** No special handling needed - user action takes precedence
**Behavior:** Chat closes, stays closed until next intervention (if > 10s)

### 3. Callback Called Before Chat Mounted
**Problem:** Intervention sent before UI is ready
**Solution:** Callback is optional, only called if provided
**Behavior:** No error, graceful degradation

### 4. No savedPlanId (Anonymous User)
**Problem:** checkForAIFeedback exits early if no user/planId
**Solution:** Callback never called, no auto-open attempt
**Behavior:** Silent skip, no errors

### 5. DB Insert Fails
**Problem:** sendCoachInterventionMessage returns false on error
**Solution:** onInterventionSent only called AFTER successful insert
**Behavior:** No callback fired, no false auto-open

---

## Configuration

### Adjustable Parameters

**Anti-Spam Window** (PlanWithChat.tsx)
```typescript
const ANTI_SPAM_WINDOW = 10000; // 10 seconds
```
- Increase to prevent frequent opens
- Decrease to allow quicker re-opens

**Auto-Open Sources** (PlanWithChat.tsx)
```typescript
// Current: only 'rpe_deviation'
if (params.source !== 'rpe_deviation') {
  return;
}

// To enable pattern-based auto-open:
if (!['rpe_deviation', 'pattern_based'].includes(params.source)) {
  return;
}
```

**Intervention Delay** (workoutFeedback.ts)
```typescript
setTimeout(async () => {
  await sendCoachInterventionMessage({ ... });
}, 2000); // 2 seconds after celebration
```
- Currently delays message send for UX
- Chat opens immediately after message saves

---

## Future Enhancements (Optional)

### 1. Toast Notification Alternative
Instead of auto-opening, show a toast:
```typescript
if (!isChatOpen) {
  showToast({
    message: "Your coach has feedback on your last workout",
    action: "Open Chat",
    onAction: () => setIsChatOpen(true)
  });
}
```

### 2. Badge Indicator
Add unread count badge on chat button:
```typescript
const [unreadCoachMessages, setUnreadCoachMessages] = useState(0);

// When intervention sent
setUnreadCoachMessages(prev => prev + 1);

// Clear when chat opened
useEffect(() => {
  if (isChatOpen) {
    setUnreadCoachMessages(0);
  }
}, [isChatOpen]);
```

### 3. Configurable Auto-Open
Let users choose in settings:
```typescript
const { autoOpenChat } = useSettings();

if (!autoOpenChat) {
  // Show badge instead
  return;
}
```

### 4. Smart Timing
Open after longer delay if user is mid-navigation:
```typescript
const { isNavigating } = useNavigationState();

if (isNavigating) {
  // Wait until settled
  setTimeout(() => setIsChatOpen(true), 5000);
} else {
  setIsChatOpen(true);
}
```

---

## Files Modified

1. **src/utils/coachInterventionMessaging.ts**
   - Added `onInterventionSent` callback parameter
   - Called after successful DB insert
   - Carries intervention metadata

2. **src/utils/workoutFeedback.ts**
   - Added `onInterventionSent` to interface
   - Passed through to `sendCoachInterventionMessage`

3. **src/hooks/useWorkoutOperations.ts**
   - Added `onCoachInterventionSent` prop
   - Passed through to `checkForAIFeedback`

4. **src/components/TrainingPlanDisplay.tsx**
   - Added `onCoachInterventionSent` prop
   - Passed through to `useWorkoutOperations`

5. **src/components/PlanWithChat.tsx**
   - Added `lastAutoOpenTime` state for anti-spam
   - Implemented `handleCoachInterventionSent` handler
   - Auto-opens chat with guard logic
   - Passed handler to `TrainingPlanDisplay`

---

## Summary

**Architecture:** Clean event-driven callback pattern
**Flow:** DB insert → callback → UI state update
**Safety:** Anti-spam, source filtering, duplicate prevention
**UX:** Chat opens automatically for urgent messages
**Logging:** Comprehensive debug traces

**Status:** ✅ Implemented, built successfully, ready for testing

The solution is minimal, robust, and follows clean architecture principles. No fragile UI hacks, no setTimeout-based button clicking, just a straightforward event flow from data layer to presentation layer.
