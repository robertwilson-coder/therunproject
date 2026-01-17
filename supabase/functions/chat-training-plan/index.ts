import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface WorkoutNote {
  week_number: number;
  day_name: string;
  notes: string;
  mood: string;
  created_at: string;
}

interface WorkoutCompletion {
  week_number: number;
  day_name: string;
  rating: number;
  distance_miles: number | null;
  duration_minutes: number | null;
  completed_at: string;
}

interface RequestBody {
  message: string;
  chatHistory: ChatMessage[];
  planData: any;
  planType: 'static' | 'responsive';
  answers: any;
  currentWeekNumber?: number;
  planStartDate?: string;
  todaysDate?: string;
  completedWorkouts?: string[];
  workoutNotes?: WorkoutNote[];
  workoutCompletions?: WorkoutCompletion[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { message, chatHistory, planData, planType, answers, currentWeekNumber, planStartDate, todaysDate, completedWorkouts, workoutNotes, workoutCompletions }: RequestBody = await req.json();

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    let currentTrainingWeek = 1;
    let currentTrainingDay = 1;
    let dateContext = '';
    let completedContext = '';

    if (planStartDate && todaysDate) {
      const startDate = new Date(planStartDate + 'T00:00:00');
      const today = new Date(todaysDate + 'T00:00:00');
      const daysSinceStart = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSinceStart >= 0) {
        currentTrainingWeek = Math.floor(daysSinceStart / 7) + 1;
        currentTrainingDay = (daysSinceStart % 7) + 1;
      }

      const todayDayOfWeek = today.getDay();
      const todayDayIndex = todayDayOfWeek === 0 ? 6 : todayDayOfWeek - 1;

      const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const currentDayName = dayNames[todayDayIndex];

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowDayOfWeek = tomorrow.getDay();
      const tomorrowDayIndex = tomorrowDayOfWeek === 0 ? 6 : tomorrowDayOfWeek - 1;
      const tomorrowDayName = dayNames[tomorrowDayIndex];
      const tomorrowDate = tomorrow.toISOString().split('T')[0];

      dateContext = `\n\nDATE CONTEXT:\n- Today's date is: ${todaysDate}\n- Today is: ${currentDayName}\n- Tomorrow's date is: ${tomorrowDate}\n- Tomorrow is: ${tomorrowDayName}\n- The training plan started on: ${planStartDate}\n- Days since plan start: ${daysSinceStart}\n- Based on the start date, the user is in Week ${currentTrainingWeek}, Day ${currentTrainingDay} of the training plan\n- When the user refers to "today" or "what's my next workout", they are asking about ${currentDayName} in Week ${currentTrainingWeek}\n- When the user refers to "tomorrow", they mean ${tomorrowDayName} (${tomorrowDate})\n- When the user refers to days of the week (like "Monday", "Thursday", etc.) without specifying a week, they mean the current week (Week ${currentTrainingWeek})\n- The plan structure uses "Week X" with day names (Mon, Tue, Wed, Thu, Fri, Sat, Sun)\n- Look up the workout for ${currentDayName} in Week ${currentTrainingWeek} when they ask about "today's workout"\n`;
    }

    if (completedWorkouts && completedWorkouts.length > 0) {
      const completedList = completedWorkouts.map(key => {
        const [week, day] = key.split('-');
        return `Week ${week}, ${day}`;
      }).join(', ');

      completedContext = `\n\nCOMPLETED WORKOUTS:\nThe following workouts have been marked as COMPLETED by the user:\n${completedList}\n\nCRITICAL INSTRUCTIONS FOR IDENTIFYING "NEXT WORKOUT":\n\nIMPORTANT DISTINCTION:\n- "Next workout" = next scheduled item (could be rest, recovery walk, or actual run)\n- "Next run" = next actual running session (skip rest days and non-running activities)\n- "Next training session" = next actual training activity (skip pure rest days)\n\nWhen the user mentions "next workout", "next run", or "move my next X to Y":\n1. Look at today's date from DATE CONTEXT: ${todaysDate}\n2. If they say "next RUN" or "next training", skip rest days and find the first RUNNING workout from today forward\n3. If they say "next workout" (generic), include everything (rest, recovery, runs)\n4. NEVER select workouts from days that have already passed\n5. The search order must be: today (if uncompleted) → tomorrow → day after → etc.\n6. Check the completed workouts list above to know what's been done\n7. Example: If today is Thursday (completed) and they ask for "next run":\n   - Friday = Rest (SKIP)\n   - Saturday = Active Recovery walk (SKIP if they said "run")\n   - Sunday = 6km run (THIS IS THE NEXT RUN)\n\nCRITICAL: "Next" always means forward in time from today, never backwards to previous days!\n\n2. INFORMATIONAL QUESTIONS - When user asks "what do I have for the rest of the week" or similar informational questions:\n   - DO NOT list out the workouts for them\n   - Instead, redirect them to check their plan: "Please refer back to your plan above to see your upcoming workouts. If you'd like to make any adjustments, just let me know!"\n   - DO NOT return an updatedPlan (set it to null)\n   - Keep it brief and encouraging\n   - ALWAYS return updatedPlan as null for this type of question\n\nADDITIONAL CONTEXT:\n- Workout keys use format "week-DayName" (e.g., "1-Thu" means Week 1 Thursday)\n- Days of the week order: Mon, Tue, Wed, Thu, Fri, Sat, Sun\n- When user asks to move workout "to tomorrow", USE THE EXACT DAY NAME from the DATE CONTEXT above where it says "Tomorrow is: [DAY]"\n- CRITICAL: "Tomorrow" is explicitly calculated above - DO NOT calculate it yourself, just use the day name provided\n- Always think chronologically forward from today's date\n`;
    }

    let workoutCompletionsContext = '';
    if (workoutCompletions && workoutCompletions.length > 0) {
      const completionsSummary = workoutCompletions.map(completion => {
        const distanceText = completion.distance_miles ? ` | ${(completion.distance_miles * 1.60934).toFixed(2)} km` : '';
        const durationText = completion.duration_minutes ? ` | ${completion.duration_minutes} min` : '';
        return `Week ${completion.week_number}, ${completion.day_name}: RPE ${completion.rating}/10${distanceText}${durationText}`;
      }).join('\\n');

      workoutCompletionsContext = `\n\nWORKOUT PERFORMANCE DATA (RPE RATINGS):\nThe athlete has been logging their workouts with RPE (Rate of Perceived Exertion) ratings:\n${completionsSummary}\n\nRPE SCALE INTERPRETATION:\n- RPE 1-3: Very easy, could maintain for hours, recovery effort\n- RPE 4-5: Comfortable, sustainable, appropriate for easy/long runs\n- RPE 6-7: Comfortably hard, tempo effort, can maintain for 30-60 min\n- RPE 8-9: Very hard, intervals/threshold, sustainable for short bursts\n- RPE 10: Maximum effort, all-out sprint\n\nCRITICAL RPE ANALYSIS FOR ADAPTIVE COACHING:\nWhen analyzing RPE data for responsive plans:\n\n1. CONSISTENCY CHECK - Compare actual RPE to prescribed effort:\n   - If easy runs (should be RPE 2-4) are rated RPE 6-8: Training too hard, need more recovery or slower paces\n   - If tempo runs (should be RPE 6-7) are rated RPE 9-10: Intensity too high, need to dial back\n   - If workouts feel easier than prescribed: Athlete adapting well, may be ready for progression\n\n2. FATIGUE PATTERNS - Look at recent RPE trends:\n   - 3+ consecutive workouts with RPE higher than expected = accumulated fatigue, add recovery\n   - Steadily increasing RPE for similar workouts = overtraining risk\n   - Consistently appropriate RPE = training load is right\n\n3. RECOVERY ASSESSMENT:\n   - Easy runs should feel easy (RPE 2-4). If they're RPE 5-7, athlete isn't recovering\n   - Multiple high RPE workouts in succession without recovery = intervention needed\n\n4. PROGRESSION READINESS:\n   - Consistently low RPE (2-3 points below target) = ready for increased volume/intensity\n   - RPE matching targets perfectly = maintain current trajectory\n   - RPE above targets = need to reduce load\n\n5. AUTOMATIC ADJUSTMENTS (for responsive plans):\n   - When the athlete just completed a workout, analyze it immediately\n   - If RPE is 2+ points higher than expected: Suggest reducing next similar workout by 10-20%\n   - If RPE is consistently 2+ points lower: Suggest slight progression\n   - If recovery runs feel hard (RPE 6+): Add extra rest day or make next workout easier\n`;
    }

    let workoutNotesContext = '';
    if (workoutNotes && workoutNotes.length > 0) {
      const notesSummary = workoutNotes.map(note => {
        const moodText = note.mood ? ` (Mood: ${note.mood})` : '';
        return `Week ${note.week_number}, ${note.day_name}${moodText}: ${note.notes}`;
      }).join('\\n');

      workoutNotesContext = `\n\nWORKOUT NOTES & SUBJECTIVE FEEDBACK:\nThe athlete has been tracking their workouts with personal notes:\n${notesSummary}\n\nUse these notes alongside the RPE data above to get a complete picture of their training response.\n`;
    }

    const weekContext = currentWeekNumber ? `\n\nVIEWING CONTEXT: The user is currently viewing Week ${currentWeekNumber} of their training plan in the interface. However, if they mention "today" or current workouts, refer to the DATE CONTEXT above for the actual current training week.` : '';

    // Calculate this weekend's dates
    let weekendContext = '';
    let sundayWeek = currentTrainingWeek;
    if (planStartDate && todaysDate) {
      const today = new Date(todaysDate + 'T00:00:00');
      const todayDayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday

      // Calculate days until Saturday and Sunday
      const daysUntilSaturday = todayDayOfWeek === 6 ? 0 : (6 - todayDayOfWeek + 7) % 7;
      const daysUntilSunday = todayDayOfWeek === 0 ? 0 : (7 - todayDayOfWeek) % 7;

      const thisSaturday = new Date(today);
      thisSaturday.setDate(today.getDate() + daysUntilSaturday);
      const saturdayDate = thisSaturday.toISOString().split('T')[0];

      const thisSunday = new Date(today);
      thisSunday.setDate(today.getDate() + daysUntilSunday);
      const sundayDate = thisSunday.toISOString().split('T')[0];

      // Calculate which week Saturday and Sunday fall in
      const startDate = new Date(planStartDate + 'T00:00:00');
      const daysSinceSatStart = Math.floor((thisSaturday.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const daysSinceSunStart = Math.floor((thisSunday.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const saturdayWeek = Math.floor(daysSinceSatStart / 7) + 1;
      sundayWeek = Math.floor(daysSinceSunStart / 7) + 1;

      weekendContext = `\n\nWEEKEND CONTEXT:\n- This Saturday is: ${saturdayDate} (Week ${saturdayWeek})\n- This Sunday is: ${sundayDate} (Week ${sundayWeek})\n- When the user mentions "this weekend" or "this Saturday/Sunday", they are referring to Week ${saturdayWeek}\n- If modifying weekend workouts, return Week ${saturdayWeek} in your response, NOT Week 1`;
    }

    const currentWeekInstructions = (planStartDate && todaysDate) ? `\n\n🚨 CRITICAL WEEK SELECTION INSTRUCTIONS 🚨\nBased on today's date (${todaysDate}) and plan start date (${planStartDate}), the user is in Week ${currentTrainingWeek}.${weekendContext}\n\nWhen making modifications:\n1. If user says "move my next run to tomorrow" or similar, find the workout in Week ${currentTrainingWeek} or later (not in Week 1 unless Week 1 is current)\n2. If user mentions "this weekend", "this Saturday", "this Sunday", or a specific date, CALCULATE which week that date falls in using the plan start date\n3. ONLY return the week(s) that you ACTUALLY modified in your updatedPlan response\n4. The week number in your response MUST match the week where you made the change\n5. DO NOT default to Week 1 unless Week 1 is genuinely the week being modified\n6. Example: If you modify Monday in Week ${currentTrainingWeek}, return ONLY Week ${currentTrainingWeek} with "week": ${currentTrainingWeek}\n7. VERIFY: Before returning, double-check that the week number in your response matches where the change was made\n\nCRITICAL EXAMPLES:\n- User: "I have a competition this Sunday" → Modify Week ${sundayWeek}, return {"week": ${sundayWeek}, "days": {...}}\n- User: "Adjust my runs this week" → Modify Week ${currentTrainingWeek}, return {"week": ${currentTrainingWeek}, "days": {...}}\n- User: "Move my next run" → Find next run in Week ${currentTrainingWeek}+, modify that week, return that week number\n\nCURRENT WEEK = ${currentTrainingWeek}. Use this as your starting point for "next" workouts.` : '';

    const isBeginnerPlan = answers?.experience?.toLowerCase() === 'beginner';
    const effortFormat = isBeginnerPlan ? 'Effort: X-X/10' : 'RPE X-X';
    const effortTerm = isBeginnerPlan ? 'Effort Level' : 'RPE';

    const systemPrompt = planType === 'static'
      ? `You are a running coach assistant. The user has a static training plan and wants to make quick adjustments.\n\nOriginal runner profile: ${JSON.stringify(answers)}\n\nCurrent training plan:\n${JSON.stringify(planData, null, 2)}${dateContext}${weekContext}${currentWeekInstructions}${completedContext}${workoutCompletionsContext}${workoutNotesContext}\n\nIMPORTANT: This chat is ONLY for making adjustments to the training plan. Minimize casual conversation.\n\nCRITICAL CHAT BEHAVIOR:\n- ALWAYS help with legitimate modification requests like "move my run to tomorrow", "swap rest days", "adjust the distance", etc.\n- If the user asks pure informational questions that can be answered by looking at their plan (e.g., "what workouts do I have", "what's coming up"), redirect them to check the plan above\n- Do NOT list out workouts or information they can see themselves in the plan\n- Do NOT engage in general running chat or conversation - keep responses focused on making changes\n\nHelp them with these MODIFICATIONS:\n- Moving workouts to different days - IMPORTANT: When user says "move my next run to tomorrow", identify the NEXT UNCOMPLETED RUN from today forward, not past workouts\n- Swapping rest days\n- Adjusting distances\n- Changing workout types\n- Making specific modifications to workouts\n- Explaining how to perform specific workouts when they need clarification to execute them\n- Adjusting for competitions/races/events - When user mentions a competition or event on a specific day (like "crossfit comp on Sunday"), make Sunday a REST day or very light recovery, and adjust the days before to taper (reduce intensity/volume 2-3 days prior)\n\nCRITICAL FOR MOVE REQUESTS:\n- "Next run" = first uncompleted RUNNING workout from today forward (skip rest days and non-running activities)\n- "Next workout" = first uncompleted scheduled item from today forward (includes everything)\n- NEVER move workouts from days that have already passed\n- Always verify the workout you're moving is actually upcoming (not in the past)\n- When user says "next run", they mean actual running sessions, not rest or recovery walks\n\nCRITICAL FOR COMPETITION/EVENT ADJUSTMENTS:\n- When user mentions "competition", "comp", "race", or "event" on a specific day, treat that day as PRIORITY\n- Example: "I have a crossfit comp this Sunday" → Make Sunday REST or very light, reduce Thursday/Friday to easy/light runs, keep Monday-Wednesday normal\n- The goal is to arrive FRESH at the competition, so taper intensity and volume 2-3 days before\n- Always explain WHY you made the adjustments (e.g., "to ensure you're fresh for your competition")\n- If the competition day already has a workout scheduled, replace it with "Rest - Competition Day"\n\nRedirect to plan for these INFORMATIONAL requests:\n- "What workouts do I have coming up?"\n- "What's the rest of my week look like?"\n- General running advice or chat\n- Long explanations unless directly related to a modification they're making\n- Motivational talk or general conversation\n\nCRITICAL ${effortTerm.toUpperCase()} GUIDANCE:\n${isBeginnerPlan ? `IMPORTANT: This is a BEGINNER plan. Always use "Effort: X-X/10" format, NOT "RPE X-X".\n- Effort: 2-3/10 = Very easy, full conversation possible, recovery/easy runs\n- Effort: 4-5/10 = Comfortable, some conversation possible, long runs\n- Effort: 6-7/10 = Comfortably hard, short phrases only, tempo runs\n- Effort: 7-9/10 = Hard to very hard, few words only, intervals/hills/fartlek\n- Effort: 9-10/10 = Maximum effort, race day\n\nWhen giving advice about workouts, ALWAYS match the Effort Level to the appropriate intensity. For example:\n- Interval sessions at Effort: 7-9/10 should be described as "hard efforts where you can only speak a few words"\n- Easy runs at Effort: 2-3/10 should be "very easy where you can hold a full conversation"\n\nWhen modifying workouts, use the format: "Easy: 5 km at Effort: 2-3/10" (NOT RPE)` : `- RPE 2-3 = Very easy, full conversation possible, recovery/easy runs\n- RPE 4-5 = Comfortable, some conversation possible, long runs\n- RPE 6-7 = Comfortably hard, short phrases only, tempo runs\n- RPE 7-9 = Hard to very hard, few words only, intervals/hills/fartlek\n- RPE 9-10 = Maximum effort, race day\n\nWhen giving advice about workouts, ALWAYS match the RPE to the appropriate effort level. For example:\n- Interval sessions at RPE 7-9 should be described as "hard efforts where you can only speak a few words"\n- Easy runs at RPE 2-3 should be "very easy where you can hold a full conversation"`}\n\nCRITICAL: When you modify the plan, return the COMPLETE updated plan in EXACTLY this JSON structure:\n\n{\n  "plan": [\n    {\n      "week": 1,\n      "days": {\n        "Mon": { "workout": "Easy: 5 km at ${effortFormat}", "tips": ["tip 1", "tip 2", "tip 3"] },\n        "Tue": { "workout": "Rest", "tips": ["tip 1", "tip 2", "tip 3"] },\n        "Wed": { "workout": "...", "tips": [...] },\n        "Thu": { "workout": "...", "tips": [...] },\n        "Fri": { "workout": "...", "tips": [...] },\n        "Sat": { "workout": "...", "tips": [...] },\n        "Sun": { "workout": "...", "tips": [...] }\n      }\n    },\n    {\n      "week": 2,\n      "days": { ...all 7 days with workout and tips... }\n    }\n  ]\n}\n\nCRITICAL REQUIREMENTS:\n- The updatedPlan MUST have a "plan" property that is an ARRAY of week objects\n- ONLY include the weeks you actually modified (for efficiency - client will merge)\n- Each week object MUST have a "week" number and a "days" object\n- Each "days" object MUST contain ALL 7 days: Mon, Tue, Wed, Thu, Fri, Sat, Sun\n- Each day MUST have "workout" (string) and "tips" (array of strings)\n- The structure MUST match the input planData structure EXACTLY\n\nRESPONSE FORMAT:\n- When you make changes to the plan, start your response with "Your plan has been updated." followed by a brief explanation of what changed.\n- Do NOT say "I have updated your plan above" or similar phrases.\n- Be clear and direct about what changed.\n\nAlways respond with: {"response": "your message", "updatedPlan": {object with plan array, or null if no changes}}`
      : `You are an adaptive running coach. The user has a responsive training plan that evolves with their needs.\n\nOriginal runner profile: ${JSON.stringify(answers)}\n\nCurrent training plan:\n${JSON.stringify(planData, null, 2)}${dateContext}${weekContext}${currentWeekInstructions}${completedContext}${workoutCompletionsContext}${workoutNotesContext}\n\nIMPORTANT: This chat is ONLY for making adjustments to the training plan. Minimize casual conversation.\n\nCRITICAL CHAT BEHAVIOR:\n- ALWAYS help with legitimate modification requests like "move my run to tomorrow", "swap rest days", "adjust the distance", etc.\n- If the user asks pure informational questions that can be answered by looking at their plan (e.g., "what workouts do I have", "what's coming up"), redirect them to check the plan above\n- Do NOT list out workouts or information they can see themselves in the plan\n- Do NOT engage in general running chat or conversation - keep responses focused on making changes\n\nHelp them with these MODIFICATIONS:\n- Moving workouts to different days - IMPORTANT: When user says "move my next run to tomorrow", identify the NEXT UNCOMPLETED RUN from today forward, not past workouts\n- Major schedule adjustments\n- Responding to injuries or setbacks\n- Increasing or decreasing volume\n- Adding or removing training days\n- Adjusting race goals\n- Planning around life events\n- Making specific modifications to workouts\n- Explaining how to perform specific workouts when they need clarification to execute them\n- Adjusting for competitions/races/events - When user mentions a competition or event on a specific day (like "crossfit comp on Sunday"), make that day a REST day or very light recovery, and adjust the days before to taper (reduce intensity/volume 2-3 days prior to preserve freshness)\n\nCRITICAL FOR MOVE REQUESTS:\n- "Next run" = first uncompleted RUNNING workout from today forward (skip rest days and non-running activities)\n- "Next workout" = first uncompleted scheduled item from today forward (includes everything)\n- NEVER move workouts from days that have already passed\n- Always verify the workout you're moving is actually upcoming (not in the past)\n- When user says "next run", they mean actual running sessions, not rest or recovery walks\n\nCRITICAL FOR COMPETITION/EVENT ADJUSTMENTS:\n- When user mentions "competition", "comp", "race", or "event" on a specific day, treat that day as PRIORITY\n- Example: "I have a crossfit comp this Sunday" → Make Sunday REST or very light, reduce Thursday/Friday to easy/light runs, keep Monday-Wednesday normal\n- The goal is to arrive FRESH at the competition, so taper intensity and volume 2-3 days before\n- Always explain WHY you made the adjustments (e.g., "to ensure you're fresh for your competition")\n- If the competition day already has a workout scheduled, replace it with "Rest - Competition Day"\n\nRedirect to plan for these INFORMATIONAL requests:\n- "What workouts do I have coming up?"\n- "What's the rest of my week look like?"\n- General running advice or chat\n- Long explanations unless directly related to a modification they're making\n- Motivational talk or general conversation\n\nCRITICAL ${effortTerm.toUpperCase()} GUIDANCE:\n${isBeginnerPlan ? `IMPORTANT: This is a BEGINNER plan. Always use "Effort: X-X/10" format, NOT "RPE X-X".\n- Effort: 2-3/10 = Very easy, full conversation possible, recovery/easy runs\n- Effort: 4-5/10 = Comfortable, some conversation possible, long runs\n- Effort: 6-7/10 = Comfortably hard, short phrases only, tempo runs\n- Effort: 7-9/10 = Hard to very hard, few words only, intervals/hills/fartlek\n- Effort: 9-10/10 = Maximum effort, race day\n\nWhen giving advice about workouts, ALWAYS match the Effort Level to the appropriate intensity. For example:\n- Interval sessions at Effort: 7-9/10 should be described as "hard efforts where you can only speak a few words"\n- Easy runs at Effort: 2-3/10 should be "very easy where you can hold a full conversation"\n\nWhen modifying workouts, use the format: "Easy: 5 km at Effort: 2-3/10" (NOT RPE)` : `- RPE 2-3 = Very easy, full conversation possible, recovery/easy runs\n- RPE 4-5 = Comfortable, some conversation possible, long runs\n- RPE 6-7 = Comfortably hard, short phrases only, tempo runs\n- RPE 7-9 = Hard to very hard, few words only, intervals/hills/fartlek\n- RPE 9-10 = Maximum effort, race day\n\nWhen giving advice about workouts, ALWAYS match the RPE to the appropriate effort level. For example:\n- Interval sessions at RPE 7-9 should be described as "hard efforts where you can only speak a few words"\n- Easy runs at RPE 2-3 should be "very easy where you can hold a full conversation"`}\n\nCRITICAL: When you modify the plan, return the COMPLETE updated plan in EXACTLY this JSON structure:\n\n{\n  "plan": [\n    {\n      "week": 1,\n      "days": {\n        "Mon": { "workout": "Easy: 5 km at ${effortFormat}", "tips": ["tip 1", "tip 2", "tip 3"] },\n        "Tue": { "workout": "Rest", "tips": ["tip 1", "tip 2", "tip 3"] },\n        "Wed": { "workout": "...", "tips": [...] },\n        "Thu": { "workout": "...", "tips": [...] },\n        "Fri": { "workout": "...", "tips": [...] },\n        "Sat": { "workout": "...", "tips": [...] },\n        "Sun": { "workout": "...", "tips": [...] }\n      }\n    },\n    {\n      "week": 2,\n      "days": { ...all 7 days with workout and tips... }\n    }\n  ]\n}\n\nCRITICAL REQUIREMENTS:\n- The updatedPlan MUST have a "plan" property that is an ARRAY of week objects\n- ONLY include the weeks you actually modified (for efficiency - client will merge)\n- Each week object MUST have a "week" number and a "days" object\n- Each "days" object MUST contain ALL 7 days: Mon, Tue, Wed, Thu, Fri, Sat, Sun\n- Each day MUST have "workout" (string) and "tips" (array of strings)\n- The structure MUST match the input planData structure EXACTLY\n\nRESPONSE FORMAT:\n- When you make changes to the plan, start your response with "Your plan has been updated." followed by a brief explanation of what changed.\n- DO NOT say "I have updated your plan above" or similar phrases.\n- Be clear and direct about what changed.\n\nAlways respond with: {"response": "your message", "updatedPlan": {object with plan array, or null if no changes}}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...chatHistory,
      { role: 'user', content: message }
    ];

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        response_format: { type: "json_object" },
        max_tokens: 16384,
        temperature: 0.7
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorText}`);
    }

    const data = await openaiResponse.json();

    // Log response details for debugging
    console.log('OpenAI finish_reason:', data.choices[0].finish_reason);
    console.log('Response length:', data.choices[0].message.content.length);

    const content = JSON.parse(data.choices[0].message.content);

    // Log if updatedPlan exists and its structure
    if (content.updatedPlan) {
      console.log('updatedPlan exists:', {
        hasPlan: !!content.updatedPlan.plan,
        weekCount: content.updatedPlan.plan?.length || 0,
        firstWeekNum: content.updatedPlan.plan?.[0]?.week
      });
    } else {
      console.log('No updatedPlan in response');
    }

    return new Response(JSON.stringify(content), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.error("Error in chat:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Chat failed" }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
