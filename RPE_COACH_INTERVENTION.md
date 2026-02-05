# RPE Coach Intervention Feature - Implementation Summary

## Overview

The coach intervention feature has been **reinstated and significantly improved**. The coach now appears when users complete workouts with meaningful RPE deviations from prescribed effort levels.

## Current Implementation

### Where RPE Completion is Handled

1. **WorkoutCompletionModal.tsx** (lines 119-160)
   - User enters completed RPE via slider (1-10 scale)
   - Stored in `rating` state variable
   - Submitted when user clicks "Complete" button

2. **useWorkoutOperations.ts** (`submitWorkoutCompletion`, lines 138-222)
   - Saves completion to `workout_completions` database table
   - Updates `completedWorkouts` Set in state
   - **Always** triggers coach feedback evaluation (no longer limited to responsive plans)
   - Works identically from both Week View and Calendar View

3. **workoutFeedback.ts** (`checkForAIFeedback`)
   - Orchestrates the coach intervention logic
   - Calls domain-level evaluation functions
   - Triggers chat interface with appropriate message

### New Architecture: Clean Domain Logic

Created **`src/utils/rpeDeviation.ts`** - a pure domain utility that handles all RPE deviation logic:

#### Key Functions:

**`extractPrescribedRPE(activityDescription: string): RPERange | null`**
- Extracts prescribed RPE from workout description
- Parses explicit "RPE X-Y" or "Effort X-Y" notations
- Falls back to workout type heuristics (easy = 2-3, tempo = 6-7, intervals = 7-9, etc.)
- Returns structured RPERange with min, max, and midpoint

**`calculateDeviation(prescribedRange: RPERange | null, completedRPE: number): number`**
- Deterministic comparison logic
- If completed RPE falls within prescribed range → deviation = 0
- If completed RPE > prescribed max → positive deviation (harder than expected)
- If completed RPE < prescribed min → negative deviation (easier than expected)
- **Example**: Prescribed 2-3, Completed 5 → deviation = +2 (5 - 3)

**`evaluateWorkoutEffortDeviation(...): RPEDeviationResult`**
- Main evaluation function for single workout
- Checks if deviation ≥ 2 points (configurable via `DEVIATION_THRESHOLD` constant)
- Prevents re-triggering on same workout using `lastTriggeredKey` tracking
- Returns structured result with:
  - `shouldTrigger`: boolean
  - `deviationType`: 'much-harder' | 'much-easier' | 'none'
  - `deviation`: numeric value
  - `message`: contextual coaching message

**`evaluateRecentWorkoutPattern(recentRatings: number[]): RecentWorkoutPattern`**
- Analyzes last 3-5 workouts for patterns
- Triggers on consistently high effort (avg ≥ 7.5/10) → suggests recovery
- Triggers on consistently low effort (avg ≤ 3.5/10) → suggests progression
- Independent of single-workout deviation

## Triggering Rules

### Single Workout Deviation
The coach triggers when:
- Completed RPE is **≥ 2 points harder** than prescribed max
  - Example: Prescribed 2-3, Completed 5+ → triggers
- Completed RPE is **≥ 2 points easier** than prescribed min
  - Example: Prescribed 7-9, Completed 5 or less → triggers
- Completed RPE is 9-10 on non-race workout → always triggers

### Pattern-Based Deviation
The coach triggers when:
- Recent 3-5 workouts average ≥ 7.5/10 → "You might be overtraining"
- Recent 3-5 workouts average ≤ 3.5/10 → "You're ready for more challenge"

### Guardrails Against Spam
- **Per-workout tracking**: `lastTriggeredWorkout` state prevents re-triggering on same workout
- **Deterministic logic**: Same inputs always produce same outputs (testable)
- **Clear thresholds**: 2-point deviation is significant, filters out noise

## Deviation Calculation Method

**Midpoint Comparison with Range Boundaries**

1. Extract prescribed RPE range (e.g., "RPE 2-3" → min: 2, max: 3, midpoint: 2.5)
2. Compare completed RPE to range boundaries:
   - **Inside range** (2 ≤ completed ≤ 3) → deviation = 0
   - **Above range** (completed > 3) → deviation = completed - max
   - **Below range** (completed < 2) → deviation = min - completed
3. Check if absolute deviation ≥ threshold (2 points)

**Why this method?**
- Respects the natural variability in prescribed ranges
- Doesn't penalize users for slight variations within target range
- Clear, testable, and easy to adjust

## Example Scenarios

### Scenario 1: Easy Run Felt Too Hard
```
Prescribed: "Easy 5 km (RPE 2-3)"
Completed: RPE 5
Deviation: +2 (5 - 3)
Coach: "Hey! I noticed you rated Week 3, Tuesday's workout as 5/10 -
that's significantly harder than the target RPE 2-3. This could indicate
you need more recovery. Would you like me to adjust your plan?"
```

### Scenario 2: Tempo Run Felt Easy
```
Prescribed: "Tempo 6 km (RPE 6-7)"
Completed: RPE 4
Deviation: -2 (6 - 4)
Coach: "Great work on Week 5, Thursday's workout! You rated it 4/10
compared to the target 6-7. You're adapting really well! Would you like
me to increase the challenge slightly?"
```

### Scenario 3: Within Expected Range (No Trigger)
```
Prescribed: "Intervals 8 x 400m (RPE 7-9)"
Completed: RPE 8
Deviation: 0 (within range)
Coach: [silent]
```

### Scenario 4: Re-opening Same Workout (No Trigger)
```
User completes workout → Coach appears
User un-completes workout (deletes completion)
User completes same workout again → Coach appears again (new completion)

Note: Current UX doesn't support "edit completion" - only complete/uncomplete
```

## Cross-View Consistency

Both **Week View** and **Calendar View** use the same `toggleWorkoutCompletion` function from `useWorkoutOperations.ts`, ensuring:
- Identical evaluation logic
- Same database operations
- Same coach triggering behavior
- Single source of truth in `days[]` array

## Data Flow

```
User enters RPE in WorkoutCompletionModal
↓
useWorkoutOperations.submitWorkoutCompletion()
↓
Save to workout_completions table
↓
Update completedWorkouts Set
↓
checkForAIFeedback() [if onTriggerChat exists]
↓
evaluateWorkoutEffortDeviation() [domain logic]
↓
Coach appears via onTriggerChat() [if triggered]
↓
Update lastTriggeredWorkout state [prevents spam]
```

## Why This Placement is Architecturally Correct

1. **Domain logic in pure utilities** (`rpeDeviation.ts`)
   - No React dependencies
   - Fully testable
   - Reusable across components
   - Clear input/output contracts

2. **Orchestration in application layer** (`workoutFeedback.ts`)
   - Handles database queries
   - Coordinates domain functions
   - Manages side effects

3. **State management in hooks** (`useWorkoutOperations.ts`)
   - Owns workout completion state
   - Tracks re-trigger prevention
   - Integrates with React lifecycle

4. **UI as pure presentation** (`WorkoutCompletionModal.tsx`)
   - No business logic
   - Controlled by parent state
   - Reusable component

## Configuration

**Easy to adjust thresholds:**

```typescript
// In src/utils/rpeDeviation.ts
export const DEVIATION_THRESHOLD = 2; // Change to 1.5 or 3 as needed

// For pattern detection
const HIGH_THRESHOLD = 7.5;  // Consistently too hard
const LOW_THRESHOLD = 3.5;   // Consistently too easy
const minWorkoutsForPattern = 3; // Minimum workouts to detect pattern
```

## Testing Recommendations

1. **Unit tests for domain logic:**
   ```typescript
   test('calculates deviation correctly', () => {
     const prescribed = { min: 2, max: 3, midpoint: 2.5 };
     expect(calculateDeviation(prescribed, 5)).toBe(2);
     expect(calculateDeviation(prescribed, 2.5)).toBe(0);
   });
   ```

2. **Integration tests for feedback:**
   - Complete workout with +2 deviation → verify coach appears
   - Complete workout within range → verify coach stays silent
   - Complete 5 hard workouts → verify pattern detection

3. **Manual QA:**
   - Test from Week View
   - Test from Calendar View
   - Test with different plan types (static, responsive, beginner)
   - Verify messages are contextually appropriate

## Known Behavior

- Coach feedback only available when `onTriggerChat` prop exists (PlanWithChat component)
- Static plans without chat interface won't show coach interventions
- Calibration workouts use different completion flow (not affected by this feature)
- Uncompleting a workout removes the completion but keeps the trigger state (by design)

## Future Enhancements

Potential improvements:
1. Add "edit completion" flow to allow RPE changes without uncomplete/recomplete
2. Store trigger history in database for analytics
3. Add user preference to disable/customize trigger sensitivity
4. Implement ML-based pattern detection for more sophisticated recommendations
5. Add A/B testing for different message tones/styles
