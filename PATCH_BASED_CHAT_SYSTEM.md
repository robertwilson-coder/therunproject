# Patch-Based Coach Chat System

**Implementation Date**: February 12, 2026
**Status**: Production Ready

---

## Executive Summary

The coach chat system has been upgraded from full-week rewrites to **surgical patch-based modifications**. This eliminates unintended changes, prevents wrong-day edits, and ensures the AI only modifies days explicitly requested by the user.

**Key Improvement**: "Cancel Tuesday's workout" now changes ONLY Tuesday, not the entire week.

---

## What Changed

### Before (Full Week Rewrites)
- AI returned complete 7-day week structure (D1-D7)
- All days in the week were rewritten even if only 1 changed
- Risk of unintended modifications to other days
- D1-D7 positional slots caused confusion

### After (Patch-Based System)
- AI returns ONLY patches for explicitly requested days
- Each patch targets a specific weekday + week
- Server resolves weekday names to actual ISO dates
- Zero risk of modifying unintended days
- User-friendly weekday names (Mon/Tue/Wed...)

---

## Architecture

```
User: "Cancel Tuesday's workout"
  ↓
Frontend: Sends request with plan data
  ↓
Edge Function: Builds LLM prompt with patch schema
  ↓
OpenAI: Returns patches array
  ↓
Edge Function: Resolves weekday → ISO date, validates
  ↓
Frontend: Shows pending changes for approval
  ↓
User: Approves
  ↓
Frontend: Applies ONLY patched dates to canonical days[]
  ↓
Database: Saves updated plan
```

---

## AI Output Contract

### New Schema (Patch Mode)

```json
{
  "coachExplanation": "I've cancelled your Tuesday workout so you can rest and recover.",
  "patches": [
    {
      "week": 1,
      "weekday": "Tue",
      "action": "cancel",
      "workout": "Rest",
      "tips": [],
      "workout_type": "REST"
    }
  ]
}
```

### Patch Fields

- **week** (number, required): Week number (1-based)
- **weekday** (string, required): Mon | Tue | Wed | Thu | Fri | Sat | Sun
- **action** (string, required): cancel | replace
- **workout** (string, required for replace): New workout description
- **tips** (array, optional): Coaching tips
- **workout_type** (string, optional): TRAIN | REST | RACE (defaults: REST for cancel, TRAIN for replace)

### Actions

**cancel**:
- Sets workout to "Rest"
- Sets workout_type to "REST"
- Clears tips

**replace**:
- Sets workout to provided value
- Sets tips to provided array or []
- Sets workout_type to provided value or "TRAIN"

---

## Weekday-Aware Date Resolution

### The Problem
Plans can start on any day of the week (not just Monday). If a plan starts on Wednesday and the AI says "Tuesday", we need to resolve which Tuesday is meant.

### The Solution
Server-side deterministic date resolution:

1. Calculate week window: `start_date + (week-1) * 7 days`
2. Generate all 7 dates in that week
3. For each date, compute its actual weekday name (UTC-safe)
4. Find the date whose weekday matches the patch weekday
5. Inject the resolved ISO date into the patch
6. Validate the date exists in canonical `days[]`

### Example

Plan starts: **Wednesday, March 18, 2026**

Week 1 window:
```
2026-03-18 = Wed (start date)
2026-03-19 = Thu
2026-03-20 = Fri
2026-03-21 = Sat
2026-03-22 = Sun
2026-03-23 = Mon
2026-03-24 = Tue
```

Patch: `{ week: 1, weekday: "Tue" }`
Resolution: **2026-03-24** (the actual Tuesday in week 1)

**Critical**: "Tue" always means an actual Tuesday date, not a positional slot. The server computes this, not the AI.

---

## Validation Layers

### 1. Schema Validation
- `patches` must be an array
- Each patch must have: week, weekday, action
- `action=replace` requires non-empty `workout`
- weekday must be valid day name

### 2. Safety Caps
- Maximum 7 patches per request
- Multi-week patches require explicit user intent

### 3. Date Resolution Validation
- Weekday must resolve to a date within the week window
- Resolved date must exist in canonical `days[]`

### 4. Frontend Pre-Apply Validation (All-or-Nothing)
- All patches must have valid dates
- All dates must exist in plan
- If ANY patch fails validation, NO patches are applied

---

## Frontend Apply Flow

### Old Approach (Week Rewrites)
```typescript
// Replace entire week structure
updatedPlan.plan.forEach(week => {
  week.days.forEach(day => {
    // Overwrites ALL days in week
    daysMap.set(day.date, day);
  });
});
```

### New Approach (Patch-Only)
```typescript
// Apply ONLY the specific patches
patches.forEach(patch => {
  const existing = daysMap.get(patch.date);
  daysMap.set(patch.date, {
    ...existing,              // Preserve other fields
    workout: patch.workout,   // Update only these
    tips: patch.tips,
    workout_type: patch.workout_type
  });
});
```

**Result**: Only patched dates change. All other days remain identical.

---

## Backward Compatibility

The system supports legacy formats during the transition:

### Legacy Format 1: D1-D7 (Rolling Days)
```json
{
  "updatedPlan": {
    "plan": [{
      "week": 1,
      "days": {
        "D1": { "workout": "..." },
        "D2": { "workout": "..." },
        ...
      }
    }]
  }
}
```

**Handling**: Convert D1-D7 to patches using positional dates

### Legacy Format 2: Mon-Sun (Weekdays)
```json
{
  "updatedPlan": {
    "plan": [{
      "week": 1,
      "days": {
        "Mon": { "workout": "..." },
        "Tue": { "workout": "..." },
        ...
      }
    }]
  }
}
```

**Handling**: Convert weekday names to patches using resolved dates

**Recommendation**: Prefer patch mode. Legacy support is temporary.

---

## Edge Function Implementation

**File**: `supabase/functions/chat-training-plan/index.ts`

### Key Functions

**`getWeekdayName(dateStr: string): string`**
- Input: ISO date string
- Output: Weekday name (Mon-Sun)
- Implementation: UTC-safe date parsing

**`resolveWeekdayToDate(weekNumber, weekday, startDate): string | null`**
- Calculates week window from start date + week number
- Generates all 7 dates in window
- Finds date matching requested weekday
- Returns ISO date or null if not found

### Processing Flow

```typescript
// 1. Parse AI response
const content = JSON.parse(data.choices[0].message.content);

// 2. Check for patches
if (content.patches && Array.isArray(content.patches)) {

  // 3. Validate and resolve each patch
  content.patches.forEach(patch => {
    // Validate structure
    if (!patch.week || !patch.weekday || !patch.action) {
      validationErrors.push(...);
      return;
    }

    // Resolve weekday to ISO date
    const isoDate = resolveWeekdayToDate(
      patch.week,
      patch.weekday,
      startDate
    );

    // Validate resolved date exists in plan
    if (!validDates.has(isoDate)) {
      validationErrors.push(...);
      return;
    }

    // Inject date into patch
    patch.date = isoDate;

    // Apply action defaults
    if (patch.action === 'cancel') {
      patch.workout = 'Rest';
      patch.workout_type = 'REST';
      patch.tips = [];
    }
  });

  // 4. Return processed patches
  return Response(JSON.stringify({
    response: content.coachExplanation,
    patches: processedPatches
  }));
}
```

---

## Test Results

All tests pass (see `test-patch-system.js`):

✅ **Test 1: Weekday Resolution**
Plan starts Wednesday → "Tue" correctly resolves to actual Tuesday date

✅ **Test 2: Non-Monday Start**
All weekday names resolve to correct dates regardless of plan start day

✅ **Test 3: Patch-Only Modification**
Cancelling 1 workout changes ONLY that day, all 6 other days unchanged

✅ **Test 4: All-or-Nothing Validation**
Invalid date in patches → all patches rejected, no partial apply

---

## Why This Eliminates Wrong-Day Edits

### Problem Scenario (Before)
Plan starts Wednesday. User says "Cancel Tuesday's workout."

**Old System (D1-D7)**:
- AI returns D1-D7 structure
- D2 gets set to "Rest"
- Server injects dates: D2 → Thursday (start_date + 1)
- **Wrong day cancelled** ❌

### Solution (After)
**New System (Weekday + Resolution)**:
- AI returns patch: `{ week: 1, weekday: "Tue", action: "cancel" }`
- Server resolves "Tue" within week 1 window
- Finds actual Tuesday date (2026-03-24)
- Injects date: `patch.date = "2026-03-24"`
- **Correct day cancelled** ✅

---

## Why This Prevents Over-Modification

### Problem Scenario (Before)
User says "Cancel tomorrow's workout."

**Old System**:
- AI returns entire week (7 days)
- Risk of AI "rebalancing" other days
- User only wanted 1 change, got 7

**Example**:
```
User Request: Cancel Thursday
AI Returns:   7 days (all rewritten)
              - Wednesday changed from "Tempo" to "Easy" (unintended)
              - Thursday changed to "Rest" (intended)
              - Friday changed from "Easy" to "Tempo" (unintended)
```

### Solution (After)
**New System**:
- AI returns 1 patch for Thursday
- No other days in response
- Frontend applies ONLY that patch
- 6 other days remain identical

**Example**:
```
User Request: Cancel Thursday
AI Returns:   1 patch (Thursday only)
Frontend:     Changes Thursday, preserves all others
Result:       Exactly what user requested ✅
```

---

## Deployment

### Edge Function
```bash
# Already deployed
supabase functions deploy chat-training-plan
```

### Frontend
```bash
# Already built and tested
npm run build
```

### Status
✅ Deployed
✅ Tested
✅ Production Ready

---

## Future Enhancements

### Potential Additions
1. **Swap action**: Move workout from one day to another in single patch
2. **Multi-patch validation**: Detect conflicting patches (e.g., back-to-back hard sessions)
3. **Undo history**: Store patch history for rollback capability
4. **Batch operations**: "Cancel all easy runs this week" → multiple patches

### Not Planned
- Full week rewrites (deprecated)
- AI-computed dates (always server-side)
- Partial apply (all-or-nothing is safer)

---

## Key Files

**Edge Function**:
- `supabase/functions/chat-training-plan/index.ts` (lines 805-1060)

**Frontend**:
- `src/components/ChatInterface.tsx` (handleApproveChanges, detectChangesFromPatches)
- `src/components/ChangeConfirmationModal.tsx` (displays patch changes)

**Tests**:
- `test-patch-system.js` (verification suite)

---

## Summary

The patch-based system delivers **surgical precision** for plan modifications:

1. ✅ **Weekday-aware**: "Tuesday" means actual Tuesday, not slot 2
2. ✅ **Patch-only**: Changes ONLY requested days, nothing else
3. ✅ **Validated**: All-or-nothing, date checks, safety caps
4. ✅ **Deterministic**: Server resolves dates, AI never computes them
5. ✅ **Production-safe**: Multiple validation layers prevent bad data

**Result**: Users get exactly what they ask for, with zero unintended modifications.
