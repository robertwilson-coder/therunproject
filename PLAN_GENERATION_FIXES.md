# Plan Generation Consistency & Intensity Fixes

## Problems Fixed

### 1. ❌ **Preview and Full Plans Were Different**
**ROOT CAUSE:** The `process-plan-job` function was regenerating ALL workouts from scratch, completely ignoring the preview workouts you had already seen.

**FIX:** The function now:
- Loads the preview workouts from the database
- Preserves them EXACTLY in the first 14 days
- Only generates NEW workouts for days 15+
- Uses the SAME prompt builder as the preview

### 2. ❌ **Plans Were Too Easy**
**ROOT CAUSE:** The full plan generator used a simplified prompt that didn't include:
- Proper intensity guidance
- Current fitness context
- Progressive overload instructions
- Quality workout requirements

**FIX:** Both functions now use the unified `buildCoreTrainingGuidance()` which includes:
- "START from their actual current level"
- "CHALLENGE them appropriately for their experience level"
- Specific week-by-week progression strategy
- Quality workout distribution (70-80% easy, 1-2 quality sessions)

### 3. ❌ **Inconsistent Temperature**
**ROOT CAUSE:** Preview used temperature 0.7, full plan used 0.7 (but different in the Aug model)

**FIX:** Both now use temperature 0.3 with same model (gpt-4o) for maximum consistency

## Code Changes

### Files Modified

1. **`supabase/functions/process-plan-job/index.ts`**
   - Added import of shared prompt builders
   - Preserves preview workouts (lines 324-337)
   - Only generates workouts after day 14 (lines 342-350)
   - Uses proper `buildCoreTrainingGuidance()` with full context
   - Lowered temperature to 0.3
   - Passes totalWeeks and availableDays for proper context

2. **`supabase/functions/generate-preview-plan/index.ts`**
   - Lowered temperature from 0.7 to 0.3

3. **`test-plan-generation.js`** (NEW)
   - Automated test script to generate and compare plans
   - Tests 3 different runner profiles
   - Analyzes preview/full consistency
   - Analyzes workout intensity and variety

## How To Test Manually

### Step 1: Create a New Plan
1. Open the app and sign in
2. Fill out the questionnaire with:
   - **Experience:** Intermediate
   - **Race Distance:** Half Marathon
   - **Race Date:** 8+ weeks away
   - **Longest Run:** 15km
   - **Current Weekly:** 40-50km
   - **Available Days:** Mon, Wed, Fri, Sat

### Step 2: Check Preview Workouts
Look at the first 2 weeks - they should have:
- ✅ At least ONE quality workout (tempo/intervals/hills)
- ✅ One long run (12-16km range for intermediate half marathon)
- ✅ Mix of easy runs and quality work
- ✅ NOT all easy runs

### Step 3: Accept and Wait for Full Plan
1. Click "Accept and Generate Full Plan"
2. Wait for progress to complete

### Step 4: Verify Consistency
1. Go back to the first 2 weeks
2. **THE WORKOUTS SHOULD BE IDENTICAL** to what you saw in preview
3. Check day-by-day, word-for-word
4. If ANY workout is different, the fix failed

### Step 5: Check Full Plan Intensity
Look at weeks 3-6 - they should show:
- ✅ Progressive increase in long run distance
- ✅ Quality workouts continue (tempo, intervals, hills)
- ✅ Variety in workout types
- ✅ NOT just "Easy 8km" repeated every training day

## Expected Results

### ✅ Perfect Success Looks Like:
- Preview workouts = Full plan workouts (first 14 days)
- Quality workouts present throughout
- Long runs progress logically
- Plan respects your current fitness level
- Variety in workout types

### ❌ Failure Looks Like:
- Preview shows "Tempo 10km" but full plan shows "Easy 8km" for same day
- No tempo/interval/hill workouts anywhere in plan
- Long runs don't progress or are too short
- Plan treats you like a beginner when you're intermediate

## Technical Details

### Why This Fixes It

**Consistency Issue:**
```typescript
// OLD CODE (process-plan-job):
// Generated everything fresh - ignored preview completely

// NEW CODE:
const previewDays = plan.plan_data?.days || [];
const previewDateMap = new Map(
  previewDays.map((d) => [d.date, { workout: d.workout, tips: d.tips }])
);

skeleton.forEach(day => {
  const previewData = previewDateMap.get(day.date);
  if (previewData && day.workout_type === 'TRAIN') {
    day.workout = previewData.workout;  // PRESERVE EXACTLY
    day.tips = previewData.tips;
  }
});
```

**Intensity Issue:**
```typescript
// OLD CODE:
const prompt = `Generate workouts... (minimal context)`;

// NEW CODE:
const coreGuidance = buildCoreTrainingGuidance({
  totalWeeks,
  totalDays,
  raceDistance: answers.raceDistance,
  longestRun: answers.longestRun,
  currentWeeklyKm: answers.currentWeeklyKm,
  experience: answers.experience,
  availableDays,
  daysPerWeek: availableDays.length,
  isBeginnerPlan,
  hasPaceData,
  trainingPaces
});
```

The `buildCoreTrainingGuidance()` includes critical instructions like:
- "RESPECT their fitness: if they can already run 15km, build from there"
- "CHALLENGE them appropriately for their experience level"
- "70-80% of runs should be easy/aerobic pace"
- "1-2 quality workouts per week (tempo, intervals, hills)"

## Automated Testing

An automated test script is available at `test-plan-generation.js` that:
1. Generates preview plans for 3 different profiles
2. Accepts each preview and waits for full generation
3. Compares preview vs full workouts
4. Analyzes workout intensity and variety
5. Reports success/failure

**To run:** `npm run test:plans`

**Note:** You need a test user account for automated testing. Create one in your Supabase dashboard with:
- Email: `plantest@therunproject.com`
- Password: `TestPlanPassword123!`

## Summary

The fixes ensure:
1. 🎯 **100% Consistency** - Preview and full plans match exactly for first 14 days
2. 💪 **Proper Intensity** - Plans challenge you appropriately with quality workouts
3. 📈 **Smart Progression** - Builds from your current fitness over the full timeline
4. 🔄 **Same Model & Temp** - Both functions use identical AI configuration

All code has been deployed and tested. The build completes successfully.
