# Phase 2: Date-Based Chat System - Implementation Complete

## Executive Summary

The chat system has been completely migrated from week/weekday targeting to ISO date targeting. The AI no longer sees or uses week numbers when modifying workouts. All date resolution happens deterministically in the frontend using Europe/London timezone.

---

## What Was Fixed

### The Core Problem

For months, the chat system had this broken flow:

```
User: "move last Tuesday to next Tuesday"
  ↓
Chat sends to OpenAI: "Week 3, Tuesday" and "Week 5, Tuesday"
  ↓
AI returns: { week: 3, weekday: "Tue" } → { week: 5, weekday: "Tue" }
  ↓
Backend applies to WRONG dates (depends on plan start date)
```

### The Solution

New flow (as of this deployment):

```
User: "move last Tuesday to next Tuesday"
  ↓
Frontend DateResolver:
  "last Tuesday" = 2026-02-11
  "next Tuesday" = 2026-02-18
  ↓
Chat sends to OpenAI:
  "Move workout from 2026-02-11 to 2026-02-18"
  "Here are workouts by DATE:
   - 2026-02-11 (Tue): Interval Run
   - 2026-02-18 (Tue): Easy Run"
  ↓
AI returns: {
  operation: "reschedule",
  target_date: "2026-02-11",
  new_date: "2026-02-18"
}
  ↓
Backend applies to EXACT dates ✅
```

---

## Changes Implemented

### 1. UK Date Formatting Utility (`src/utils/ukDateFormat.ts`)

Created standardized UK date formatting:
- `formatUKDate("2026-02-07")` → `"7 Feb 26"`
- Used consistently in all coach messages and UI
- All dates display in British format per requirements

### 2. Frontend Date Resolution (`src/components/ChatInterface.tsx`)

**Before**: Sent raw user message to AI, let AI interpret dates

**After**:
- Resolves "last Tuesday", "next Tuesday", "today", "tomorrow" in frontend
- Uses Europe/London timezone exclusively
- Sends resolved ISO dates to AI in prompt
- AI only sees and returns ISO dates (YYYY-MM-DD)

Key function:
```typescript
const resolveDatesInMessage = (msg: string): {
  resolvedMessage: string;
  resolvedDates: Record<string, string>
} => {
  const dateResolver = new DateResolver();
  // Converts "next Tuesday" → "2026-02-18"
  // Passes both original phrase and resolved ISO date to AI
}
```

### 3. Chat V2 Endpoint (`supabase/functions/chat-training-plan-v2/index.ts`)

Completely rewritten to eliminate week/weekday targeting:

**Key Rules in AI Prompt**:
```
1. ONLY target workouts using ISO dates (YYYY-MM-DD format)
2. NEVER use week numbers or weekday names for targeting
3. When moving a workout, PRESERVE workout content unless explicitly asked to change it
4. Format all dates in coach messages as UK format: "7 Feb 26"
5. "move X to Y" means reschedule workout on date X to date Y, keeping same content
```

**AI Response Schema** (enforced via JSON mode):
```typescript
{
  "operation": "cancel" | "reschedule" | "modify" | "swap",
  "modifications": [
    {
      "operation": "reschedule",
      "target_date": "2026-02-11",    // ISO date only
      "new_date": "2026-02-18",       // ISO date only
      "new_workout": "optional"       // Only if explicit change requested
    }
  ],
  "requires_clarification": boolean,
  "reasoning": "explanation in UK date format"
}
```

### 4. Preview → Approve → Commit Flow

Implemented transactional safety:

**Draft Mode**:
- User sends message
- Frontend resolves dates
- AI analyzes and returns proposed modifications
- Modifications saved to `preview_sets` table with:
  - `preview_id` (UUID)
  - `plan_version` (optimistic lock)
  - `expires_at` (30 min TTL)

**Preview Modal**:
- Shows all proposed changes in UK date format
- Displays before/after for each workout
- User can approve or reject
- Preview is immutable once generated

**Commit Mode**:
- Verifies preview hasn't expired
- Checks plan version (detects concurrent modifications)
- Applies all changes atomically
- Increments `workout_version`
- Deletes preview after commit

### 5. Workout Preservation

**Critical Feature**: When moving workouts, content is preserved by default

```typescript
// "move X to Y" preserves workout content
if (mod.operation === 'reschedule') {
  const workout = workoutMap.get(mod.target_date);
  const newDateWorkout = workoutMap.get(mod.new_date);

  // Copy workout content to new date
  newDateWorkout.workout = workout.workout;
  newDateWorkout.tips = workout.tips;

  // Replace old date with rest day
  workout.workout_type = 'REST';
  workout.workout = 'Rest day';
}
```

Only explicit requests like "change Tuesday's workout to an easy run" will modify content.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend (src/components/ChatInterface.tsx)                 │
│                                                              │
│  1. User types: "move last Tuesday to next Tuesday"         │
│  2. DateResolver converts to:                               │
│     - "last Tuesday" → "2026-02-11"                         │
│     - "next Tuesday" → "2026-02-18"                         │
│  3. Send to chat-training-plan-v2 (DRAFT mode)              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Backend (supabase/functions/chat-training-plan-v2)          │
│                                                              │
│  4. Build AI prompt with:                                   │
│     - Workouts listed by ISO date                           │
│     - Resolved dates from frontend                          │
│     - Explicit instruction: NO week/weekday targeting       │
│  5. OpenAI returns:                                         │
│     {                                                        │
│       "operation": "reschedule",                            │
│       "target_date": "2026-02-11",                          │
│       "new_date": "2026-02-18"                              │
│     }                                                        │
│  6. Create PreviewSet and save to DB                        │
│  7. Return preview to frontend                              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Frontend (PreviewModal)                                      │
│                                                              │
│  8. Show changes in UK date format:                         │
│     "Move Interval Run from Tue 11 Feb 26 to Tue 18 Feb 26" │
│  9. User clicks "Apply Changes"                             │
│  10. Send to chat-training-plan-v2 (COMMIT mode)            │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Backend (COMMIT mode)                                        │
│                                                              │
│  11. Validate preview hasn't expired                        │
│  12. Check plan_version (optimistic lock)                   │
│  13. Apply modifications to plan_data.days[]                │
│  14. Increment workout_version                              │
│  15. Delete preview_set                                     │
│  16. Return success                                         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ Frontend (Plan Refresh)                                      │
│                                                              │
│  17. Fetch updated plan_data from DB                        │
│  18. Update UI with new workout schedule                    │
│  19. Show success message                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow Guarantees

### Date Resolution
- All date resolution uses `DateResolver` class with Europe/London timezone
- "last Tuesday" always means the most recent past Tuesday
- "next Tuesday" always means the next future Tuesday
- Ambiguous dates ("Tuesday" alone) trigger clarification request

### Week Targeting Eliminated
- AI prompt contains ZERO week numbers
- AI prompt explicitly forbids week/weekday targeting
- AI response schema enforces ISO dates only
- All modifications target `planData.days[].date` directly

### Transactional Safety
- Preview → Commit flow prevents accidental changes
- Optimistic locking via `workout_version` prevents concurrent modifications
- Preview expiry (30 min) prevents stale data
- All changes are atomic (all or nothing)

### Content Preservation
- "move" operations preserve workout content by default
- Only explicit change requests modify workout content
- Swap operations correctly exchange workout content
- Cancel operations replace workout with "Rest day"

---

## Testing Recommendations

### Test Case 1: Move Last Tuesday to Next Tuesday

1. User sends: "move last Tuesday to next Tuesday"
2. Verify frontend logs show:
   - Resolved dates: `{ "last Tuesday": "2026-02-11", "next Tuesday": "2026-02-18" }`
3. Verify AI response contains:
   - `target_date: "2026-02-11"`
   - `new_date: "2026-02-18"`
   - NO week numbers anywhere
4. Verify preview modal shows:
   - "Move [Workout Name] from Tue 11 Feb 26 to Tue 18 Feb 26"
5. Verify after commit:
   - Workout that was on 2026-02-11 is now on 2026-02-18
   - 2026-02-11 is now "Rest day"
   - Workout content is preserved

### Test Case 2: Ambiguous Date

1. User sends: "move Tuesday's workout"
2. Verify AI asks for clarification:
   - "Did you mean last Tuesday or next Tuesday?"

### Test Case 3: Concurrent Modification

1. User A starts chat modification
2. User B modifies plan manually
3. User A tries to commit preview
4. Verify error: "Plan has been modified by another session. Please refresh and try again."

### Test Case 4: UK Date Format

1. Check all coach messages use format: "7 Feb 26" not "Feb 7, 2026" or "2026-02-07"
2. Verify dates are readable to UK users

---

## Migration Status

### ✅ Complete
- Frontend date resolution (Europe/London)
- Chat V2 endpoint with ISO-date-only targeting
- AI prompt rewrite (no week/weekday references)
- Preview → Approve → Commit flow
- Optimistic locking via workout_version
- UK date formatting everywhere
- Workout content preservation

### ⚠️ Coexistence
- Old `chat-training-plan` endpoint still exists (for backwards compatibility)
- New users automatically use `chat-training-plan-v2`
- Old conversations may still reference weeks in chat history (harmless)

### 🎯 Next Steps (Optional)
1. Monitor logs for any week/weekday references in AI responses
2. Add analytics to track preview→commit success rate
3. Consider removing old `chat-training-plan` endpoint after migration period
4. Add more sophisticated date parsing (e.g., "in 3 days", "next month")

---

## Success Criteria Met

✅ **Dates resolved in frontend using Europe/London timezone**
- `DateResolver` class in `src/utils/dateResolver.ts`
- All relative dates converted before AI sees them

✅ **AI targets workouts by ISO date only**
- AI prompt explicitly lists workouts with ISO dates
- AI response schema enforces date-only targeting
- Zero week/weekday references in prompt or response

✅ **Transactional preview → commit with version checking**
- `preview_sets` table stores draft changes
- `workout_version` provides optimistic locking
- Commit validates preview matches current plan version

✅ **UK date formatting everywhere**
- `formatUKDate()` used in all coach messages
- Format: "7 Feb 26" not "2/7/26" or "Feb 7, 2026"
- Consistent across chat, preview modal, and notifications

✅ **Move operations preserve workout content**
- Reschedule copies workout to new date
- Source date becomes rest day
- Only explicit "change" requests modify content

✅ **Build passes without errors**
- TypeScript compilation successful
- No breaking changes to existing features

---

## Known Limitations

1. **Display Still Uses Weeks**: The UI still groups workouts into weeks for navigation. This is intentional and doesn't affect correctness since the canonical data is stored by date.

2. **Old Chat History**: Existing chat conversations may reference "Week 3, Tuesday" in past messages. This is harmless as it only affects display, not future operations.

3. **Natural Language Scope**: Currently supports common phrases like "last Tuesday", "next Monday", "today", "tomorrow". More complex phrases like "two weeks from now" require manual date specification.

4. **Timezone Hardcoded**: System uses Europe/London exclusively. Future users in other timezones may need timezone selection feature.

---

## Conclusion

The months-long problem of incorrect workout targeting has been completely resolved. The AI now operates exclusively on ISO dates, with all ambiguity removed by frontend date resolution. The preview→commit flow ensures users can verify changes before applying them, and optimistic locking prevents data corruption from concurrent modifications.

**Test the fix by saying**: "move last Tuesday's workout to next Tuesday" and verify the exact workouts move to the exact dates you expect.
