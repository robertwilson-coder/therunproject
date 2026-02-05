# Plan Normalization Implementation

## Overview

This implementation fixes existing date-based plans by normalizing their week structure on first load, ensuring calendar and week views display identical workouts without requiring plan regeneration.

## Problem Solved

**Before:** Date-based plans had incomplete week structures - weeks contained only days with workouts, not all 7 days (Mon-Sun). This caused:
- Calendar and week views showing different data
- Empty weeks appearing after modifications
- Inconsistent state between `days[]` (source of truth) and `plan[]` (derived view)

**After:** All date-based plans are automatically normalized on load:
- Every week contains all 7 days (Mon-Sun)
- Missing days filled with Rest + empty tips array
- Normalized plan persisted once to database
- Both views show identical workouts

## Implementation Architecture

### Files Created

**`src/utils/planNormalization.ts`** (228 lines)
- Core normalization logic
- Deep equality checker
- Comprehensive logging system

### Files Modified

**`src/hooks/usePlanManagement.ts`**
- Replaced buggy `healPlanStructure()` with `normalizeDateBasedPlan()`
- Updated `loadPlan()` to normalize and persist once
- Updated `generatePreviewPlan()` to normalize new plans

## Call Chain Proof

### When User Loads Existing Plan

```
SavedPlans.tsx:handleLoadPlan()
  ↓
usePlanManagement.loadPlan(plan)
  ↓
[1] Fetch user from Supabase auth
  ↓
[2] normalizeDateBasedPlan(plan.plan_data, plan.start_date, plan.id, user.id)
    ├─ Check: plan_type === 'date_based'? → Continue
    ├─ Check: has days[]? → Continue
    ├─ Check: has start_date? → Continue
    ├─ Sort days[] by date
    ├─ convertDaysToWeeks(sortedDays, startDate)
    │   ├─ Find first Monday (ISO week start)
    │   ├─ Find last Sunday (ISO week end)
    │   └─ Generate complete Mon-Sun weeks:
    │       └─ For each day in each week:
    │           ├─ If day exists in days[]: copy data
    │           └─ If day missing: insert Rest + tips: []
    ├─ Deep equality check: plan[] changed?
    └─ Return { planData, wasNormalized, ...metrics }
  ↓
[3] If wasNormalized === true && plan.id exists:
    ├─ LOG: Persisting normalized plan
    ├─ supabase.from('training_plans').update({ plan_data: normalized })
    └─ LOG: Success or failure
  ↓
[4] setPlanData(normalized.planData)
  ↓
[5] React re-render with normalized data
  ↓
[6] Both WeekView and CalendarView receive same complete weeks
```

### When User Makes Modification

```
User moves workout (Mon → Wed)
  ↓
usePlanModifications.handleMoveWorkout()
  ↓
Update days[] (swap workout data, preserve dates)
  ↓
Rebuild plan[] from days[] using convertDaysToWeeks()
  ↓
onUpdatePlan(updatedPlan) → triggers DB save
  ↓
Both views render with consistent data
```

## Key Features

### 1. Non-Destructive
- **NEVER modifies `days[]` dates** - dates remain unchanged
- Only rebuilds `plan[]` structure from existing `days[]`
- If normalization fails, returns original unchanged

### 2. One-Time Migration
```typescript
// Deep equality check prevents infinite loops
const hasChanged = !deepEqual(planData.plan, normalizedPlan);

// Only write if different
if (hasChanged && plan.id) {
  await supabase.update({ plan_data: normalized });
}
```

### 3. Comprehensive Logging

All operations logged with context:
```typescript
logger.info('[Normalization] Starting normalization', {
  planId,
  userId,
  originalWeeksCount,
  originalDaysCount,
  startDate
});

logger.info('[LoadPlan] Successfully persisted normalized plan', {
  planId,
  originalWeeks,
  normalizedWeeks,
  weeksDiff
});
```

### 4. Safety Guarantees

```typescript
// Prevents 0-week plans
if (normalizedPlan.length === 0) {
  logger.error('[Normalization] Generated 0 weeks - ABORTING');
  return { planData: original, wasNormalized: false };
}

// Try-catch with fallback
try {
  // normalization logic
} catch (error) {
  logger.error('[Normalization] Failed', { error });
  return { planData: original, wasNormalized: false };
}
```

## Logging Output Examples

### Successful Normalization
```
[LoadPlan] Starting plan load
  planId: abc123
  userId: user456
  planType: date_based
  daysCount: 84
  weeksCount: 10

[Normalization] Starting normalization
  originalWeeksCount: 10
  originalDaysCount: 84

[Normalization] Normalization complete
  wasNormalized: true
  normalizedWeeksCount: 12
  normalizedDaysCount: 84
  weeksDiff: +2

[LoadPlan] Plan was normalized - persisting to database
  originalWeeks: 10
  normalizedWeeks: 12

[LoadPlan] Successfully persisted normalized plan

[LoadPlan] Plan load complete
  weeksCount: 12
```

### Plan Already Normalized
```
[LoadPlan] Starting plan load
  weeksCount: 12

[Normalization] Starting normalization

[Normalization] Normalization complete
  wasNormalized: false

[LoadPlan] Plan did not require normalization
```

### Skip Non-Date-Based Plan
```
[Normalization] Skipping non-date-based plan
  planType: weeks_based
```

## Week Structure Guarantee

**Before Normalization:**
```javascript
{
  week: 1,
  days: {
    Tue: { workout: "Easy 5km", date: "2025-01-02" },
    Thu: { workout: "Tempo 8km", date: "2025-01-04" },
    Sat: { workout: "Long 15km", date: "2025-01-06" }
  }
}
// Missing: Mon, Wed, Fri, Sun
```

**After Normalization:**
```javascript
{
  week: 1,
  days: {
    Mon: { workout: "Rest", tips: [], date: "2025-01-01" },
    Tue: { workout: "Easy 5km", tips: [...], date: "2025-01-02" },
    Wed: { workout: "Rest", tips: [], date: "2025-01-03" },
    Thu: { workout: "Tempo 8km", tips: [...], date: "2025-01-04" },
    Fri: { workout: "Rest", tips: [], date: "2025-01-05" },
    Sat: { workout: "Long 15km", tips: [...], date: "2025-01-06" },
    Sun: { workout: "Rest", tips: [], date: "2025-01-07" }
  }
}
// All 7 days present
```

## Algorithm: `convertDaysToWeeks()`

```
INPUT: days[], startDate

1. Sort days by date (CRITICAL: prevents order bugs)
2. Build map: date → dayData (O(1) lookup)
3. Find first Monday of plan (ISO week: Mon-Sun)
4. Find last Sunday of plan
5. Loop through complete weeks (Monday to Monday):
   For each week:
     For each day (Mon-Sun):
       - Calculate date for this day
       - Check if daysMap has data for this date
       - If YES: copy workout, tips, date, metadata
       - If NO: insert Rest workout, empty tips
     Add week to weeks[]
6. Return complete weeks[]

OUTPUT: weeks[] with all 7 days per week
```

## Testing Scenarios

### ✅ Scenario 1: Load Old Incomplete Plan
1. User has plan with incomplete weeks
2. User loads plan from SavedPlans
3. Normalization detects missing days
4. Rebuilds complete weeks
5. Persists to DB once
6. Both views show complete weeks

### ✅ Scenario 2: Load Already-Normalized Plan
1. User loads previously normalized plan
2. Deep equality check detects no change
3. No DB write occurs
4. Plan loads normally

### ✅ Scenario 3: User Modifies Workout
1. User moves workout Mon → Wed
2. days[] updated (dates preserved)
3. plan[] regenerated with convertDaysToWeeks()
4. Both views stay synchronized
5. DB updated with consistent structure

### ✅ Scenario 4: Generate New Preview Plan
1. User creates new plan
2. Edge function returns incomplete weeks
3. Normalization fills missing days
4. User sees complete week immediately

### ✅ Scenario 5: Non-Date-Based Plan
1. User loads weeks_based plan
2. Normalization skips (plan_type check)
3. Returns original unchanged
4. No DB write

## Definition of Done Checklist

- [x] `normalizeDateBasedPlan()` function created
- [x] Uses `convertDaysToWeeks()` to rebuild weeks
- [x] Fills missing Mon-Sun days with Rest + tips: []
- [x] Deep equality check prevents unnecessary writes
- [x] One-time DB migration write on load
- [x] Comprehensive logging with context
- [x] Normalization runs at real hydration point (loadPlan)
- [x] No scenario produces 0-week plans silently
- [x] Build passes successfully
- [x] Calendar and week views show identical workouts
- [x] Moving workout updates both views consistently
- [x] Dates in days[] never modified
- [x] Silent failures prevented (try-catch + logging)

## Files Summary

**Created:**
- `src/utils/planNormalization.ts` (228 lines)

**Modified:**
- `src/hooks/usePlanManagement.ts`
  - Removed: `healPlanStructure()` (buggy implementation)
  - Added: `normalizeDateBasedPlan()` integration
  - Updated: `loadPlan()` with normalization + DB persistence
  - Updated: `generatePreviewPlan()` with normalization

**Total Implementation:**
- 228 lines new utility code
- 80+ lines updated in usePlanManagement
- Full logging instrumentation
- Zero breaking changes
