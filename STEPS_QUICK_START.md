# Steps System - Quick Start Guide

## For Developers: Enabling Steps in Your Plans

### 1. Generate Steps Metadata (During Plan Creation)

```typescript
import { generateStepsMeta, addStepsMetaToPlanData } from '@/utils/stepsMetadataGenerator';

// After generating plan_data from AI
const stepsMeta = generateStepsMeta({
  durationWeeks: answers.planWeeks || 12,
  raceDate: answers.raceDate,
  startDate: startDate,
  planData: generatedPlanData
});

const planDataWithSteps = addStepsMetaToPlanData(generatedPlanData, stepsMeta);

// Save to database
const { data: plan, error } = await supabase
  .from('training_plans')
  .insert({
    user_id: userId,
    answers: answers,
    plan_data: planDataWithSteps,  // ← Contains steps_meta
    start_date: startDate,
    race_date: answers.raceDate,
    duration_weeks: answers.planWeeks
  });
```

### 2. Display Progress Panel (In Plan View)

```typescript
import { ProgressPanel } from '@/components/ProgressPanel';
import { normalizeDateBasedPlan } from '@/utils/planNormalization';

// Fetch plan and feedback
const { data: plan } = await supabase
  .from('training_plans')
  .select('*')
  .eq('id', planId)
  .single();

const { data: feedback } = await supabase
  .from('training_plan_workout_feedback')
  .select('*')
  .eq('training_plan_id', planId);

// Normalize and compute progress
const normalized = normalizeDateBasedPlan(
  plan.plan_data,
  plan.start_date,
  plan.id,
  plan.user_id,
  feedback || []
);

// Render progress panel
{normalized.progressPanel && (
  <ProgressPanel progressPanel={normalized.progressPanel} />
)}
```

### 3. Submit Feedback (On Workout Completion)

```typescript
import { generateNormalizedWorkoutId } from '@/utils/stepProgressSystem';

// After user rates workout
const submitFeedback = async () => {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-workout-feedback`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        training_plan_id: planId,
        workout_date: workoutDate,        // "2024-01-15"
        week_number: weekNumber,          // 1, 2, 3...
        dow: dayOfWeek,                   // "Mon", "Tue", etc.
        workout_text: workoutDescription, // Full workout text
        workout_type: 'TRAIN',           // 'TRAIN' | 'REST' | 'RACE'
        workoutType: 'normal',           // 'normal' | 'calibration'
        rpe: userRating,                 // 1-10
        completed: true,                 // true | false
        notes: userNotes                 // Optional
      })
    }
  );

  const result = await response.json();

  if (result.is_key_workout) {
    console.log('Feedback stored for key workout');
  } else {
    console.log('Not a key workout, no feedback stored');
  }
};
```

## What Gets Tracked?

### Key Workouts (Tracked):
- Long runs
- Tempo/threshold runs
- Interval sessions
- Race pace workouts
- Calibration tests

### Not Tracked:
- Easy recovery runs
- Rest days
- Cross-training

## Step Usage Policy

The system automatically determines which steps to enable:

| Plan Duration | Steps Enabled | Notes |
|--------------|---------------|-------|
| ≤ 4 weeks | None | Shows "Current Focus" only |
| 5-7 weeks | 2 steps | Aerobic Base + Race-Specific |
| 8-11 weeks | 2-3 steps | Base, Threshold, Race-Specific |
| ≥ 12 weeks | All 4 steps | Base, Threshold, Economy, Race-Specific |

### Race Proximity Override:
- Within 3 weeks of race: Steps become informational only
- Within 6 weeks: Influence reduced to 30%

## Progress Panel States

### With Steps Enabled:
```
┌─────────────────────────────────────┐
│ 🎯 Current Focus: Threshold Development │
│ Improve lactate threshold and...    │
│                                      │
│ Progress: ████████░░ 75%  🟢 Strong  │
│                                      │
│ 📈 This Week's Strategy              │
│ Continue building on your strong...  │
└─────────────────────────────────────┘
```

### Without Steps (Short Plans):
```
┌─────────────────────────────────────┐
│ 🎯 Current Focus: Building Fitness   │
│ Each workout builds your foundation  │
│                                      │
│ 📈 This Week's Strategy              │
│ Focus on completing workouts...      │
└─────────────────────────────────────┘
```

## Confidence Levels

- **Low** (🟡 Building Data): < 3 key workouts completed
- **Med** (🔵 On Track): 3-5 key workouts, decent progress
- **High** (🟢 Strong Progress): 6+ key workouts, high completion

## Troubleshooting

### Progress panel not showing?
Check: Does `plan.plan_data.steps_meta` exist?

```typescript
console.log('Steps enabled:', plan.plan_data.steps_meta?.steps_enabled);
```

### Feedback not being stored?
Check: Is it a key workout?

```typescript
import { isKeyWorkout } from '@/utils/stepProgressSystem';
console.log('Is key:', isKeyWorkout(workoutText));
```

### Progress not updating?
Check: Are you passing feedback to normalization?

```typescript
const normalized = normalizeDateBasedPlan(
  plan.plan_data,
  plan.start_date,
  plan.id,
  plan.user_id,
  feedback  // ← Must pass this
);
```

## Database Queries

### Check if plan has steps:
```sql
SELECT
  id,
  plan_data->'steps_meta'->>'steps_enabled' as steps_enabled,
  plan_data->'steps_meta'->>'allowed_steps' as allowed_steps
FROM training_plans
WHERE id = 'your-plan-id';
```

### View all feedback for plan:
```sql
SELECT
  workout_date,
  completion_status,
  effort_vs_expected,
  workout_role,
  notes
FROM training_plan_workout_feedback
WHERE training_plan_id = 'your-plan-id'
ORDER BY workout_date DESC;
```

### Completion rate by role:
```sql
SELECT
  workout_role,
  COUNT(*) as total,
  SUM(CASE WHEN completion_status = 'completed' THEN 1 ELSE 0 END) as completed,
  ROUND(100.0 * SUM(CASE WHEN completion_status = 'completed' THEN 1 ELSE 0 END) / COUNT(*), 1) as rate
FROM training_plan_workout_feedback
WHERE training_plan_id = 'your-plan-id'
  AND is_key_workout = true
GROUP BY workout_role;
```

## Migration for Existing Plans

To add steps to existing plans without steps_meta:

```typescript
import { generateStepsMeta, addStepsMetaToPlanData } from '@/utils/stepsMetadataGenerator';

async function migrateExistingPlan(planId: string) {
  const { data: plan } = await supabase
    .from('training_plans')
    .select('*')
    .eq('id', planId)
    .single();

  // Check if already has steps
  if (plan.plan_data.steps_meta) {
    console.log('Plan already has steps metadata');
    return;
  }

  // Generate steps
  const stepsMeta = generateStepsMeta({
    durationWeeks: plan.duration_weeks || 12,
    raceDate: plan.race_date,
    startDate: plan.start_date,
    planData: plan.plan_data
  });

  const updatedPlanData = addStepsMetaToPlanData(plan.plan_data, stepsMeta);

  // Update plan
  await supabase
    .from('training_plans')
    .update({ plan_data: updatedPlanData })
    .eq('id', planId);

  console.log('Steps metadata added successfully');
}
```

## Best Practices

1. **Always pass feedback to normalization** - Even if empty array
2. **Check steps_enabled before rendering** - Short plans don't use steps
3. **Handle missing progressPanel gracefully** - Older plans may not have it
4. **Use normalized_workout_id consistently** - Required for feedback matching
5. **Let the system detect key workouts** - Don't manually flag them

## Common Patterns

### Conditional rendering:
```typescript
{plan.plan_data.steps_meta?.steps_enabled ? (
  <ProgressPanel progressPanel={normalized.progressPanel} />
) : (
  <div>Complete workouts to track your progress</div>
)}
```

### Feedback button:
```typescript
const handleWorkoutComplete = async () => {
  // Submit to edge function
  await fetch(...);

  // Refresh plan to update progress
  refetchPlan();
};
```

### Loading state:
```typescript
const [progressPanel, setProgressPanel] = useState<ProgressPanel | null>(null);

useEffect(() => {
  if (normalized.progressPanel) {
    setProgressPanel(normalized.progressPanel);
  }
}, [normalized]);

{progressPanel ? (
  <ProgressPanel progressPanel={progressPanel} />
) : (
  <LoadingSkeletons />
)}
```

---

**Need help?** Check `STEPS_PROGRESS_SYSTEM_DOCUMENTATION.md` for detailed technical docs.
