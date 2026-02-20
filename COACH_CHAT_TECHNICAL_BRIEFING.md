# Coach Chat System - Technical Briefing

## Quick Start Summary

The coach chat system allows users to modify their training plans through natural language conversation with an AI coach powered by OpenAI's GPT-4. This document explains the complete data flow, API communication, and the recent D1-D7 rolling day schema fix.

**Key Files:**
- Edge Function: `supabase/functions/chat-training-plan/index.ts`
- Frontend: `src/components/ChatInterface.tsx`
- Types: `src/types/index.ts`

---

## Architecture Overview

```
┌─────────────┐
│   User UI   │
│ (Frontend)  │
└──────┬──────┘
       │ 1. POST /functions/v1/chat-training-plan
       │    { message, planData, chatHistory, ... }
       ▼
┌──────────────────────────────────────────────┐
│  Supabase Edge Function                      │
│  chat-training-plan/index.ts                 │
│                                              │
│  ┌────────────────────────────────────┐    │
│  │ 1. Parse & validate request        │    │
│  │ 2. Build context from:             │    │
│  │    - Plan data (weeks, days)       │    │
│  │    - User profile                  │    │
│  │    - Workout completions (RPE)     │    │
│  │    - Chat history                  │    │
│  │ 3. Construct system prompt         │    │
│  └────────────────┬───────────────────┘    │
│                   │                          │
│                   │ 2. POST to OpenAI API    │
│                   │    with structured prompt │
│                   ▼                          │
│          ┌──────────────────┐               │
│          │  OpenAI GPT-4    │               │
│          │  (gpt-4o model)  │               │
│          └────────┬─────────┘               │
│                   │ 3. JSON response         │
│                   ▼                          │
│  ┌────────────────────────────────────┐    │
│  │ 4. Parse AI response               │    │
│  │ 5. Canonicalize (Mon-Sun → D1-D7)  │    │
│  │ 6. Validate structure              │    │
│  │ 7. Inject dates deterministically  │    │
│  │ 8. Validate dates vs canonical     │    │
│  └────────────────┬───────────────────┘    │
└───────────────────┼──────────────────────────┘
                    │ 4. Return to frontend
                    ▼
         ┌─────────────────────┐
         │  Frontend handles:  │
         │  - Show response    │
         │  - Detect changes   │
         │  - Prompt user      │
         │  - Apply on approve │
         └─────────────────────┘
```

---

## Data Flow: Step-by-Step

### Step 1: User Sends Chat Message

**Location**: `src/components/ChatInterface.tsx:285-330`

```typescript
const handleSendMessage = async () => {
  // User types: "Cancel Tuesday's workout"
  const message = inputMessage.trim();

  // Call edge function
  const { data, error } = await supabase.functions.invoke(
    'chat-training-plan',
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: {
        message: message,                    // User's natural language request
        chatHistory: chatHistory,            // Previous conversation context
        planData: planData,                  // Full plan (weeks + canonical days[])
        answers: answers,                    // User profile (experience, goal, etc.)
        currentWeekNumber: currentWeek,      // Week user is viewing
        planStartDate: planData.start_date,  // Plan anchor date (ISO)
        completedWorkouts: completions,      // Past RPE ratings
        planId: planId                       // Database ID
      }
    }
  );

  // Response contains:
  // - data.response: Coach's natural language explanation
  // - data.updatedPlan: Modified weeks with D1-D7 structure (if plan change)
  // - data.diagnostics: Metadata about changes made
};
```

**Key Points:**
- Frontend sends FULL plan context (not just current week)
- Includes canonical `days[]` array (date-based source of truth)
- Includes chat history for conversational context
- Passes user profile for personalized coaching

---

### Step 2: Edge Function Receives Request

**Location**: `supabase/functions/chat-training-plan/index.ts:60-120`

```typescript
Deno.serve(async (req: Request) => {
  // Parse request body
  const {
    message,           // "Cancel Tuesday's workout"
    chatHistory,       // Previous messages
    planData,          // { plan: [...], days: [...], start_date: "2026-03-18" }
    answers,           // User profile
    currentWeekNumber, // Week number being viewed
    planStartDate,     // ISO date string
    completedWorkouts, // Array of { week_number, day_name, rating, ... }
    planId
  } = await req.json();

  // Validate required fields
  if (!message || !planData || !answers) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields' }),
      { status: 400, headers: corsHeaders }
    );
  }

  // Extract canonical days array (source of truth)
  const validDates = new Set<string>();
  if (planData.days && Array.isArray(planData.days)) {
    planData.days.forEach((day: any) => {
      if (day.date) validDates.add(day.date);
    });
  }
  // validDates now contains all valid ISO dates in the plan
});
```

**Key Points:**
- Edge function validates all required fields
- Extracts canonical `days[]` array for later validation
- `planData.days[]` is the source of truth (date-based, sorted)
- `planData.plan[]` is the week-based view (for AI context)

---

### Step 3: Build Context & Prompt for OpenAI

**Location**: `supabase/functions/chat-training-plan/index.ts:200-771`

#### A) Calculate Current Context

```typescript
// Calculate what training week we're in
const today = new Date(todaysDate + 'T00:00:00');
const startDate = new Date(planStartDate + 'T00:00:00');
const daysSinceStart = Math.floor(
  (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
);
const currentTrainingWeek = Math.floor(daysSinceStart / 7) + 1;

// Calculate this weekend's dates (for "this weekend" references)
const thisSaturday = new Date(today);
thisSaturday.setDate(today.getDate() + daysUntilSaturday);
const saturdayDate = thisSaturday.toISOString().split('T')[0];

const weekendContext = `, Sat=${saturdayDate} W${saturdayWeek}, Sun=${sundayDate} W${sundayWeek}`;
```

**Purpose**: AI needs to know:
- What week is "current" (today's date vs start date)
- What specific dates "this weekend" refers to
- Which workouts are in the past (completed/missed)

#### B) Filter Plan Data by Question Scope

```typescript
// Analyze question scope to determine what data to send
const scopeAnalysis = analyzeQuestionScope(message);
// Returns: { scope: 'current_week' | 'specific_week' | 'full_plan' | 'info_only' }

// Filter plan data to reduce token usage
if (scopeAnalysis.scope === 'current_week') {
  optimizedPlanData.plan = planData.plan.filter(w => w.week === currentTrainingWeek);
} else if (scopeAnalysis.scope === 'specific_week') {
  optimizedPlanData.plan = planData.plan.filter(w => w.week === scopeAnalysis.specificWeek);
}
// For info-only questions, send no workout data (save tokens)
```

**Purpose**:
- Reduce token usage by sending only relevant weeks
- Info-only questions ("What's my next workout?") don't need full plan
- Specific week questions only need that week

#### C) Build RPE Context

```typescript
// Add RPE feedback from completed workouts
if (workoutCompletions.length > 0) {
  const completionsSummary = workoutCompletions.map(completion => {
    const dist = completion.distance_km ? ` ${completion.distance_km.toFixed(1)}k` : '';
    const dur = completion.duration_minutes ? ` ${completion.duration_minutes}m` : '';
    return `W${completion.week_number}-${completion.day_name}: RPE${completion.rating}${dist}${dur}`;
  }).join(', ');

  workoutCompletionsContext = `\nRPE DATA: ${completionsSummary}\nRPE RULES:\n- Easy runs (RPE 2-4) rated 6-8 = too hard, reduce intensity\n- Tempo runs (RPE 6-7) rated 9-10 = too hard, dial back\n- 3+ high RPE = fatigue, add recovery\n- Consistently low RPE = ready for progression`;
}
```

**Purpose**: AI can see if runner is:
- Struggling (high RPE on easy runs) → reduce intensity
- Crushing it (low RPE consistently) → ready to progress
- Fatigued (multiple high RPEs) → add recovery

#### D) Construct System Prompt

**Location**: Lines 532-771

```typescript
const systemPrompt = `GOLD STANDARD COACH CHAT & PLAN ADJUSTMENT PROMPT

You are an experienced endurance running coach AND a scheduling engine.
Your role is to intelligently adjust an existing training plan when life happens,
while protecting long-term progress and preventing injury.

CORE COACHING PHILOSOPHY
- Understand the intent of every workout (endurance, quality, recovery)
- Protect key workouts (long runs, quality sessions)
- Easy runs are flexible; key sessions are not
- When in doubt, choose the safest, most conservative option
- Make the minimum number of changes needed

INPUTS YOU CAN TRUST
- Today's date
- The full training plan with dates
- Workout metadata per day:
  - workoutType ∈ {REST, EASY, QUALITY, LONG_RUN, RACE}
  - priority ∈ {KEY, FLEX}
  - isCompleted ∈ {true, false}

NATURAL LANGUAGE INTERPRETATION RULES
- "today" → Today's date (${todaysDate})
- "tomorrow" → Today + 1 day
- "this week" → the currently viewed week (W${currentWeekNumber})
- "next week" → the week after currently viewed
- "this weekend" → Saturday/Sunday of current week${weekendContext}
- "my next run" → first upcoming non-Rest, non-completed workout
- "my long run" → next upcoming LONG_RUN that is not completed

NON-NEGOTIABLE RULES
- Never modify completed workouts or past dates
- Never create back-to-back LONG_RUN days
- Never create back-to-back QUALITY or RACE days
- QUALITY sessions require at least one EASY or REST day before and after
- Preserve REST days unless athlete explicitly asks to train on them
- Do NOT add training days or increase frequency
- Do NOT break taper structure near race day

ALLOWED OPERATIONS ONLY
You may only:
- Swap two future workouts
- Move a workout to another future date
- Reduce duration (≈10–25%)
- Downgrade intensity (QUALITY → EASY)
- Replace EASY with REST (for fatigue/illness)

CURRENT CONTEXT:
Profile: ${JSON.stringify(answers)}
Plan: ${JSON.stringify(optimizedPlanData)}${workoutPriorityContext}${workoutDateMap}${dateContext}${weekContext}${currentWeekInstructions}${raceDateValidation}${completedContext}${workoutCompletionsContext}${workoutNotesContext}

OUTPUT REQUIREMENTS

Return JSON only:

{
  "response": "Warm, confident coach explanation of what changed and why",
  "diagnostics": {
    "affectedDates": ["YYYY-MM-DD"],
    "changes": [
      {
        "type": "move | swap | reduce | downgrade | rest",
        "from": "YYYY-MM-DD",
        "to": "YYYY-MM-DD",
        "note": "short explanation"
      }
    ]
  },
  "updatedPlan": {
    "plan": [
      {
        "week": N,
        "days": {
          "D1": {"workout": "...", "tips": [...]},
          "D2": {"workout": "...", "tips": [...]},
          "D3": {"workout": "...", "tips": [...]},
          "D4": {"workout": "...", "tips": [...]},
          "D5": {"workout": "...", "tips": [...]},
          "D6": {"workout": "...", "tips": [...]},
          "D7": {"workout": "...", "tips": [...]}
        }
      }
    ]
  }
}

CRITICAL SCHEMA RULES:
- Use D1-D7 keys for days (NOT Mon-Sun weekday names)
- D1-D7 are rolling 7-day slots anchored to the plan's start_date, NOT calendar weekdays
- D1 = start_date, D2 = start_date+1, ..., D7 = start_date+6
- Include ONLY modified weeks in updatedPlan
- Each included week MUST include all 7 days (D1 through D7)
- DO NOT compute or include date fields; server will inject dates
- If no plan change is needed, return "updatedPlan": null
- For info-only questions ("what's next?"), return "updatedPlan": null`;
```

**Key Elements of Prompt:**

1. **Role Definition**: Coach + scheduling engine (not just chatbot)

2. **Context Injection**:
   - User profile (experience level, goal, race date)
   - Full plan structure OR filtered scope
   - Current week number and today's date
   - Weekend dates for "this weekend" references
   - Completed workouts context
   - RPE feedback if available

3. **Coaching Philosophy**:
   - Conservative, safety-first
   - Protect key sessions (long runs, quality)
   - Flexible with easy runs

4. **Rules & Constraints**:
   - No back-to-back hard days
   - No modifying past workouts
   - No adding volume
   - Preserve taper

5. **Output Schema** (D1-D7):
   - Explicitly uses rolling day slots
   - NOT weekday names
   - Must include all 7 days per week

---

### Step 4: Call OpenAI API

**Location**: `supabase/functions/chat-training-plan/index.ts:786-799`

```typescript
const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${openaiApiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-4o",                           // OpenAI's GPT-4 Optimized model
    messages: [
      { role: 'system', content: systemPrompt },  // The massive prompt above
      ...limitedChatHistory,                      // Last 10 messages for context
      { role: 'user', content: userMessage }      // Current user message
    ],
    response_format: { type: "json_object" },  // Force valid JSON response
    max_tokens: 16384,                         // Allow long responses
    temperature: 0.7                           // Some creativity, not too random
  }),
});

const data = await openaiResponse.json();
const content = JSON.parse(data.choices[0].message.content);
```

**OpenAI Configuration:**
- **Model**: `gpt-4o` (GPT-4 Optimized - fast, high quality)
- **Response Format**: Structured JSON (not free text)
- **Temperature**: 0.7 (balanced between deterministic and creative)
- **Max Tokens**: 16384 (allows for large plan modifications)

**Response Structure from OpenAI:**
```json
{
  "response": "I've moved your Tuesday tempo run to Thursday to give you more recovery after Monday's long run. Your schedule now has proper spacing between hard efforts.",
  "diagnostics": {
    "affectedDates": ["2026-03-19", "2026-03-21"],
    "changes": [
      {
        "type": "move",
        "from": "2026-03-19",
        "to": "2026-03-21",
        "note": "Tempo run moved for better recovery"
      }
    ]
  },
  "updatedPlan": {
    "plan": [
      {
        "week": 1,
        "days": {
          "D1": {"workout": "Easy 5K", "tips": ["Start relaxed"]},
          "D2": {"workout": "Rest", "tips": []},
          "D3": {"workout": "Easy 5K", "tips": []},
          "D4": {"workout": "Tempo 6K", "tips": ["Moved from D2"]},
          "D5": {"workout": "Rest", "tips": []},
          "D6": {"workout": "Long 10K", "tips": []},
          "D7": {"workout": "Rest", "tips": []}
        }
      }
    ]
  }
}
```

**Important**:
- AI returns D1-D7 keys (rolling slots)
- No dates computed by AI (server injects them)
- All 7 days included per week

---

### Step 5: Server-Side Processing (The Critical Fix)

**Location**: `supabase/functions/chat-training-plan/index.ts:833-998`

This is where the D1-D7 fix happens.

#### A) Canonicalization (Backward Compatibility)

```typescript
// STEP 1: Canonicalize Mon-Sun to D1-D7 (backward compatibility)
content.updatedPlan.plan.forEach((week: any) => {
  // Check if using legacy Mon-Sun format
  const hasLegacyFormat = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].some(
    day => day in week.days
  );

  if (hasLegacyFormat) {
    logger.info(`Week ${week.week} uses legacy Mon-Sun format, converting to D1-D7`);

    // Map Mon->D1, Tue->D2, etc. (treating them as ordered slots, NOT weekdays)
    const legacyOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const newDays: any = {};

    legacyOrder.forEach((dayName, idx) => {
      if (week.days[dayName]) {
        newDays[`D${idx + 1}`] = week.days[dayName];
      }
    });

    week.days = newDays;
  }
});
```

**What This Does:**
- If AI returns old Mon-Sun format, convert it
- Mapping: Mon→D1, Tue→D2, Wed→D3, Thu→D4, Fri→D5, Sat→D6, Sun→D7
- **Critical**: Treats Mon-Sun as ORDERED SLOTS, not weekday names
- This is why the bug is fixed: no weekday interpretation

**Example:**
```
Plan starts: Wednesday, March 18, 2026

Old AI response:
{
  "Mon": { workout: "Easy 5K" },   // Intended as slot 1
  "Tue": { workout: "Rest" },      // Intended as slot 2
  ...
}

After canonicalization:
{
  "D1": { workout: "Easy 5K" },    // Explicitly slot 1 = Wed Mar 18
  "D2": { workout: "Rest" },       // Explicitly slot 2 = Thu Mar 19
  ...
}
```

#### B) Structure Validation

```typescript
// STEP 2: Validate structure - each week must have exactly D1-D7
const rollingDayOrder = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'];

content.updatedPlan.plan.forEach((week: any) => {
  const presentKeys = Object.keys(week.days);
  const missingKeys = rollingDayOrder.filter(d => !presentKeys.includes(d));
  const extraKeys = presentKeys.filter(d => !rollingDayOrder.includes(d));

  if (missingKeys.length > 0) {
    injectionErrors.push(`Week ${weekNumber}: missing required days ${missingKeys.join(', ')}`);
  }
  if (extraKeys.length > 0) {
    injectionErrors.push(`Week ${weekNumber}: unexpected keys ${extraKeys.join(', ')}`);
  }
});

if (injectionErrors.length > 0) {
  // REJECT and return error to frontend
  return new Response(
    JSON.stringify({
      error: 'Coach response has invalid structure. Please try again.',
      details: injectionErrors,
      isDateValidationError: true
    }),
    { status: 400, headers: corsHeaders }
  );
}
```

**What Gets Rejected:**
- ❌ Missing D3 key → "Week 1: missing required days D3"
- ❌ Extra D8 key → "Week 1: unexpected keys D8"
- ❌ Mixed format (D1-D6 + Mon) → "Week 1: unexpected keys Mon"

**Why This Matters:**
- Prevents partial updates (all-or-nothing)
- Ensures data integrity
- Forces AI to return complete weeks

#### C) Date Injection

```typescript
// STEP 3: Inject dates into AI response using D1-D7
const startDate = new Date(planStartDate + 'T00:00:00');  // e.g., 2026-03-18 (Wed)

content.updatedPlan.plan.forEach((week: any) => {
  const weekNumber = week.week;  // e.g., 1

  // Calculate week start date (rolling 7-day weeks anchored to start_date)
  const weekStartDate = new Date(startDate);
  weekStartDate.setDate(startDate.getDate() + (weekNumber - 1) * 7);
  // Week 1: start_date + 0*7 = Wed Mar 18
  // Week 2: start_date + 1*7 = Wed Mar 25

  rollingDayOrder.forEach((dayKey, dayIndex) => {
    const dayData = week.days[dayKey];

    // Calculate deterministic date: D1 = weekStart+0, D2 = weekStart+1, etc.
    const dayDate = new Date(weekStartDate);
    dayDate.setDate(weekStartDate.getDate() + dayIndex);
    // D1 (dayIndex=0): Wed Mar 18 + 0 = Wed Mar 18
    // D2 (dayIndex=1): Wed Mar 18 + 1 = Thu Mar 19
    // D3 (dayIndex=2): Wed Mar 18 + 2 = Fri Mar 20
    // D4 (dayIndex=3): Wed Mar 18 + 3 = Sat Mar 21
    // D5 (dayIndex=4): Wed Mar 18 + 4 = Sun Mar 22
    // D6 (dayIndex=5): Wed Mar 18 + 5 = Mon Mar 23
    // D7 (dayIndex=6): Wed Mar 18 + 6 = Tue Mar 24

    const isoDate = dayDate.toISOString().split('T')[0];  // "2026-03-19"

    // Inject date into response
    dayData.date = isoDate;

    logger.info(`[DateInjection] W${weekNumber} ${dayKey} -> ${isoDate}`);
  });
});
```

**Date Calculation Formula:**
```
weekStartDate = start_date + (weekNumber - 1) * 7 days
dayDate = weekStartDate + dayIndex
where dayIndex = 0 for D1, 1 for D2, ..., 6 for D7
```

**Example for Plan Starting Wednesday:**
```
start_date = 2026-03-18 (Wednesday)
Week 1:
  D1 (idx 0): 2026-03-18 + 0 = Wed Mar 18
  D2 (idx 1): 2026-03-18 + 1 = Thu Mar 19
  D3 (idx 2): 2026-03-18 + 2 = Fri Mar 20
  D4 (idx 3): 2026-03-18 + 3 = Sat Mar 21
  D5 (idx 4): 2026-03-18 + 4 = Sun Mar 22
  D6 (idx 5): 2026-03-18 + 5 = Mon Mar 23
  D7 (idx 6): 2026-03-18 + 6 = Tue Mar 24
```

**Why This Works:**
- No ambiguity: D2 always means "start_date + 1"
- Works for any start day of week
- Deterministic and testable

#### D) Date Validation

```typescript
// Validate against canonical days[] if we have them
if (validDates.size > 0 && !validDates.has(isoDate)) {
  injectionErrors.push(`Week ${weekNumber} ${dayKey}: date ${isoDate} not in canonical days[]`);
}
```

**Purpose**:
- `validDates` is a Set of all dates in canonical `planData.days[]`
- Ensures AI's modified week dates actually exist in the plan
- Prevents AI from inventing dates outside the plan range

**Example Rejection:**
```
Plan has days: 2026-03-18 to 2026-03-31 (14 days, 2 weeks)
AI modifies Week 3 (would be 2026-04-01 to 2026-04-07)
Validation fails: "Week 3 D1: date 2026-04-01 not in canonical days[]"
→ REJECTED
```

#### E) Final Safety Check

```typescript
// STEP 5: Final safety check - ensure no days are missing dates
const missingDates: string[] = [];
content.updatedPlan.plan.forEach((week: any) => {
  rollingDayOrder.forEach((dayKey) => {
    if (week.days?.[dayKey] && !week.days[dayKey].date) {
      missingDates.push(`Week ${week.week} ${dayKey}`);
    }
  });
});

if (missingDates.length > 0) {
  return new Response(
    JSON.stringify({
      error: 'Coach response missing dates after injection. Please try again.',
      details: missingDates,
      isDateValidationError: true
    }),
    { status: 400, headers: corsHeaders }
  );
}
```

**Purpose**: Belt-and-suspenders check
- Ensures every day has a date after injection
- Should never trigger if code is correct, but safety first

---

### Step 6: Return to Frontend

**Location**: `supabase/functions/chat-training-plan/index.ts:1000-1010`

```typescript
logger.info('[DateInjection] Canonicalization, date injection, and validation successful');

return new Response(JSON.stringify(content), {
  headers: {
    ...corsHeaders,
    "Content-Type": "application/json",
  },
});
```

**Response to Frontend:**
```json
{
  "response": "I've moved Tuesday's tempo to Thursday...",
  "diagnostics": { ... },
  "updatedPlan": {
    "plan": [
      {
        "week": 1,
        "days": {
          "D1": { "workout": "Easy 5K", "date": "2026-03-18", "tips": [...] },
          "D2": { "workout": "Rest", "date": "2026-03-19", "tips": [] },
          "D3": { "workout": "Easy 5K", "date": "2026-03-20", "tips": [] },
          "D4": { "workout": "Tempo 6K", "date": "2026-03-21", "tips": [...] },
          "D5": { "workout": "Rest", "date": "2026-03-22", "tips": [] },
          "D6": { "workout": "Long 10K", "date": "2026-03-23", "tips": [] },
          "D7": { "workout": "Rest", "date": "2026-03-24", "tips": [] }
        }
      }
    ]
  }
}
```

**Key: Every day now has a `date` field injected server-side**

---

### Step 7: Frontend Displays Response

**Location**: `src/components/ChatInterface.tsx:319-358`

```typescript
// Show coach's response text
await saveChatMessage('assistant', data.response);

// If there's an updatedPlan, validate and show changes
if (data.updatedPlan && data.updatedPlan.plan) {
  // Validate structure (support both D1-D7 and Mon-Sun)
  const rollingDays = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'];
  const legacyDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const usesRollingFormat = rollingDays.some(d => d in data.updatedPlan.plan[0].days);
  const days = usesRollingFormat ? rollingDays : legacyDays;

  // Validate all weeks have all days
  const isValid = data.updatedPlan.plan.every((week: any) => {
    return days.every(day => {
      const hasDay = week.days[day] && typeof week.days[day] === 'object' && 'workout' in week.days[day];
      if (!hasDay) {
        logger.error(`Week ${week.week}, ${day} is missing or invalid`);
      }
      return hasDay;
    });
  });

  if (!isValid) {
    // Show error to user
    setToast({
      message: "We couldn't apply that change. Please try again.",
      type: 'error'
    });
    return;
  }

  // Detect what changed
  const changes = detectChanges(planData, data.updatedPlan);

  // Show pending changes UI
  setPendingChanges({
    updatedPlan: data.updatedPlan,
    changes: changes,
    response: data.response
  });
}
```

**Frontend Validation:**
- Supports both D1-D7 (new) and Mon-Sun (legacy during transition)
- Auto-detects format
- Validates all days present
- Detects specific changes
- Shows pending changes UI (user must approve)

---

### Step 8: User Approves Changes

**Location**: `src/components/ChatInterface.tsx:184-270`

```typescript
const handleApproveChanges = () => {
  // Build a map of all existing days (canonical source of truth)
  const daysMap = new Map<string, any>();
  if (planData.days && Array.isArray(planData.days)) {
    planData.days.forEach(day => {
      daysMap.set(day.date, day);  // Key by date (ISO string)
    });
  }

  // Detect format (D1-D7 or Mon-Sun)
  const rollingDays = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'];
  const legacyDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const firstWeek = pendingChanges.updatedPlan.plan[0];
  const usesRollingFormat = rollingDays.some(d => d in firstWeek.days);
  const dayOrder = usesRollingFormat ? rollingDays : legacyDays;

  // Pre-validate: all days have dates
  const missingDates: string[] = [];
  pendingChanges.updatedPlan.plan.forEach((updatedWeek: any) => {
    dayOrder.forEach((dayName) => {
      const dayData = updatedWeek.days?.[dayName];
      if (dayData && !dayData.date) {
        missingDates.push(`Week ${updatedWeek.week} ${dayName}`);
      }
    });
  });

  if (missingDates.length > 0) {
    // ABORT: missing dates means server-side injection failed
    setToast({
      message: "We couldn't apply that change because the coach response was incomplete.",
      type: 'error'
    });
    return;
  }

  // Patch canonical days[] array by DATE
  pendingChanges.updatedPlan.plan.forEach((updatedWeek: any) => {
    dayOrder.forEach((dayName) => {
      const dayData = updatedWeek.days?.[dayName];
      if (!dayData) return;  // Day not in update

      const date = dayData.date;  // Server-injected date

      // Patch this specific date in canonical array
      daysMap.set(date, {
        date: date,
        dow: dayName,
        workout: dayData.workout,
        tips: dayData.tips || [],
        workoutType: dayData.workoutType,
        workout_type: dayData.workout_type || dayData.workoutType,
        calibrationTag: dayData.calibrationTag
      });
    });
  });

  // Convert map back to sorted array
  const updatedDays = Array.from(daysMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  // Save to database
  const updatedPlanData = {
    ...planData,
    days: updatedDays,  // Canonical source of truth
    plan: planData.plan  // Keep week-based view unchanged (rebuilt from days[])
  };

  // Update in Supabase
  await supabase
    .from('training_plans')
    .update({ plan_data: updatedPlanData })
    .eq('id', planId);

  // Update local state
  onPlanUpdate(updatedPlanData);
};
```

**Key Points:**

1. **Date-Based Patching**:
   - Build map keyed by date (not week/day names)
   - Patch specific dates
   - Preserves all other days untouched

2. **Canonical Storage**:
   - `days[]` array is source of truth (date-based)
   - `plan[]` array is derived view (week-based)
   - Changes applied to `days[]` only

3. **All-or-Nothing**:
   - If any date missing, ABORT entire update
   - No partial modifications

4. **Format Agnostic**:
   - Works with D1-D7 (new) or Mon-Sun (legacy)
   - Patches by date regardless of key names

---

## Key Data Structures

### Training Plan Object (Database)

```typescript
interface TrainingPlan {
  id: string;
  user_id: string;
  experience: string;
  goal: string;
  race_date: string;
  start_date: string;          // ISO date - anchor for rolling weeks
  race_duration: string;
  available_days: number;
  injuries_limitations: string;
  plan_data: {
    plan: Week[];              // Week-based view (for AI context)
    days: Day[];               // CANONICAL: date-based source of truth
    start_date: string;
    race_date: string;
    duration_weeks: number;
  };
  plan_type: 'structured' | 'responsive';
  created_at: string;
  updated_at: string;
}

interface Week {
  week: number;
  days: {
    [key: string]: {          // "D1"-"D7" or "Mon"-"Sun"
      workout: string;
      tips: string[];
      workoutType?: string;
      date?: string;          // Injected server-side
    }
  };
}

interface Day {
  date: string;               // ISO date (YYYY-MM-DD) - PRIMARY KEY
  dow: string;                // Day name (Mon-Sun or D1-D7)
  workout: string;
  tips: string[];
  workoutType: string;        // REST | EASY | QUALITY | LONG_RUN | RACE
  workout_type?: string;
  calibrationTag?: string;
  priority?: string;          // KEY | FLEX
  isCompleted?: boolean;
}
```

### Chat Message

```typescript
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    planModified?: boolean;
    affectedDates?: string[];
  };
}
```

---

## Why the D1-D7 Fix Works

### The Problem (Old Mon-Sun Schema)

```
Plan starts: Wednesday, March 18, 2026

AI returns:
{
  "Mon": { "workout": "Easy 5K" },
  "Tue": { "workout": "Tempo 6K" },
  ...
}

Old interpretation:
- "Mon" ambiguous: calendar Monday? Or slot 1?
- Code mapped Mon→0, Tue→1 (treating as slots)
- But users thought "Tuesday" = calendar Tuesday
- Result: confusion and wrong-day edits
```

### The Solution (New D1-D7 Schema)

```
Plan starts: Wednesday, March 18, 2026

AI returns:
{
  "D1": { "workout": "Easy 5K" },
  "D2": { "workout": "Tempo 6K" },
  ...
}

New interpretation:
- "D1" unambiguous: slot 1 of rolling week
- Date injection: D1 = start_date = Wed Mar 18
- D2 = start_date + 1 = Thu Mar 19
- No calendar weekday connotation
- Result: always correct dates
```

### Date Calculation Comparison

| Format | Key | Interpretation | Date Calculation | Result for Wed start |
|--------|-----|----------------|------------------|---------------------|
| **Old** | "Mon" | Ambiguous (weekday? slot?) | `weekStart + 0` | Wed Mar 18 ✓ (accidental) |
| **Old** | "Tue" | Ambiguous (weekday? slot?) | `weekStart + 1` | Thu Mar 19 ✓ (accidental) |
| **New** | "D1" | Explicit slot 1 | `weekStart + 0` | Wed Mar 18 ✓ (intentional) |
| **New** | "D2" | Explicit slot 2 | `weekStart + 1` | Thu Mar 19 ✓ (intentional) |

**Key Difference**:
- Old schema worked by accident (treated Mon as slot 1)
- New schema works by design (D1 explicitly means slot 1)
- Removes semantic ambiguity

---

## Error Handling & Validation Layers

### Layer 1: Edge Function Input Validation
```typescript
if (!message || !planData || !answers) {
  return 400 "Missing required fields"
}
```

### Layer 2: OpenAI Response Validation
```typescript
if (!openaiResponse.ok) {
  return 500 "OpenAI API error"
}
```

### Layer 3: Structure Validation
```typescript
// Missing D1-D7 keys
if (missingKeys.length > 0) {
  return 400 "Week X: missing required days D1, D3"
}

// Extra keys
if (extraKeys.length > 0) {
  return 400 "Week X: unexpected keys D8, Mon"
}
```

### Layer 4: Date Validation
```typescript
// Date not in canonical days[]
if (!validDates.has(isoDate)) {
  return 400 "Week X D2: date 2026-03-19 not in canonical days[]"
}

// Missing date after injection
if (!dayData.date) {
  return 400 "Week X D5 missing date after injection"
}
```

### Layer 5: Frontend Pre-Apply Validation
```typescript
// All days have dates
if (missingDates.length > 0) {
  abort "Coach response incomplete, please try again"
}
```

**Result**: Multiple validation layers prevent bad data from reaching database

---

## Token Usage Optimization

### Problem
Full training plans can be 10K+ tokens, exhausting GPT-4 context window.

### Solution: Scope-Based Filtering

```typescript
const scopeAnalysis = analyzeQuestionScope(message);

if (scopeAnalysis.scope === 'info_only') {
  // "What's my next workout?"
  optimizedPlanData.plan = [];  // Send NO workout data (just profile)
} else if (scopeAnalysis.scope === 'current_week') {
  // "Cancel tomorrow's run"
  optimizedPlanData.plan = planData.plan.filter(w => w.week === currentTrainingWeek);
} else if (scopeAnalysis.scope === 'specific_week') {
  // "What's on week 5?"
  optimizedPlanData.plan = planData.plan.filter(w => w.week === specificWeek);
} else {
  // "Move all my long runs to Sundays"
  optimizedPlanData.plan = planData.plan;  // Send full plan
}
```

**Token Savings**:
- Info-only: ~90% reduction (no workout data)
- Current week: ~85% reduction (1 week instead of 12)
- Specific week: ~85% reduction
- Full plan: No reduction (necessary)

---

## Common Use Cases & Examples

### Use Case 1: Cancel Tomorrow's Workout

**User**: "I can't make tomorrow's run"

**Edge Function**:
1. Interprets "tomorrow" as today + 1 day
2. Finds workout scheduled for that date
3. Sends context to OpenAI with that workout highlighted

**OpenAI**:
```json
{
  "response": "No problem! I've changed tomorrow's tempo run to a rest day. You can make it up later this week if you're feeling better.",
  "updatedPlan": {
    "plan": [{
      "week": 2,
      "days": {
        "D1": {...},
        "D2": {"workout": "Rest", "tips": ["Recovery day"]},  // Changed
        ...
      }
    }]
  }
}
```

**Server**: Injects dates, validates, returns to frontend
**Frontend**: Shows change, user approves, saves to DB

---

### Use Case 2: Move Long Run

**User**: "Move this Saturday's long run to Sunday"

**Edge Function**:
1. Calculates "this Saturday" = ISO date
2. Finds long run in plan
3. Sends to OpenAI with context

**OpenAI**:
```json
{
  "response": "Done! I've moved your 15K long run from Saturday to Sunday. Make sure to hydrate well the night before.",
  "updatedPlan": {
    "plan": [{
      "week": 3,
      "days": {
        "D1": {...},
        ...
        "D6": {"workout": "Easy 5K", "tips": []},           // Was long run
        "D7": {"workout": "Long 15K", "tips": ["Hydrate"]}  // Moved here
      }
    }]
  }
}
```

---

### Use Case 3: Info-Only Query

**User**: "What's my next workout?"

**Edge Function**: Sends NO workout data (info-only scope)

**OpenAI**:
```json
{
  "response": "Your next workout is tomorrow (Thursday, March 19): an easy 5K recovery run. Take it slow and relaxed!",
  "updatedPlan": null  // No plan changes
}
```

**Frontend**: Shows response, no approval needed

---

## Testing & Debugging

### Enable Debug Logs

```typescript
// In edge function
logger.info('[DateInjection] W1 D2 -> 2026-03-19');

// In frontend
logger.info(`[ChatApprove] Detected format: D1-D7`);
```

### Check Edge Function Logs

```bash
# Via Supabase CLI
supabase functions logs chat-training-plan --follow

# Look for:
# - [DateInjection] entries
# - [Canonicalize] entries
# - Validation errors
```

### Test Suite

```bash
# Run automated tests
deno run --allow-net --allow-env test-rolling-day-fix.js

# Tests:
# 1. Mid-week start with D1-D7
# 2. Legacy Mon-Sun backward compatibility
# 3. Weekday name interpretation
# 4. Missing day validation
# 5. Extra key validation
```

---

## GPT-4 Briefing Summary

**For quick problem-solving with GPT-4, share:**

1. **System Architecture**: Frontend → Edge Function → OpenAI → Edge Function → Frontend

2. **Key Insight**: Plans use rolling 7-day weeks (not calendar weeks)
   - `start_date` = anchor (can be any day)
   - Week 1 Day 1 = `start_date + 0`
   - Week 1 Day 7 = `start_date + 6`

3. **D1-D7 Schema**:
   - AI returns `{D1: {...}, D2: {...}, ..., D7: {...}}`
   - Server injects dates: `D1.date = start_date + (week-1)*7 + 0`
   - Frontend patches canonical `days[]` array by date

4. **Validation**: Multiple layers ensure:
   - All D1-D7 keys present (no missing, no extras)
   - All dates in canonical `days[]` array
   - All days have dates after injection

5. **Storage**: `days[]` is source of truth (date-based), `plan[]` is view (week-based)

6. **Backward Compatible**: Supports legacy Mon-Sun (canonicalizes to D1-D7)

---

## Quick Reference: Key Files & Line Numbers

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| **Edge Function** | `chat-training-plan/index.ts` | 60-1010 | Full chat handler |
| - System Prompt | Same | 532-771 | OpenAI prompt construction |
| - OpenAI Call | Same | 786-812 | API request |
| - Canonicalization | Same | 849-873 | Mon-Sun → D1-D7 |
| - Validation | Same | 875-919 | Structure checks |
| - Date Injection | Same | 921-948 | Deterministic dates |
| **Frontend** | `ChatInterface.tsx` | 1-600 | Chat UI & logic |
| - Send Message | Same | 285-330 | Call edge function |
| - Display Response | Same | 319-358 | Show AI response |
| - Approve Changes | Same | 184-270 | Patch canonical days[] |
| **Types** | `types/index.ts` | 1-200 | TypeScript interfaces |
| **Tests** | `test-rolling-day-fix.js` | 1-483 | Automated tests |
| **Docs** | `ROLLING_DAY_SCHEMA_FIX.md` | 1-485 | Complete documentation |

---

This briefing should give GPT-4 (or any AI assistant) a complete understanding of the coach chat system architecture, data flow, and the recent D1-D7 rolling day fix.
