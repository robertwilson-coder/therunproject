import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type QuestionScope = 'today' | 'tomorrow' | 'this_week' | 'next_week' | 'specific_week' | 'full_plan' | 'info_only';

interface ScopeAnalysis {
  scope: QuestionScope;
  specificWeek?: number;
  needsWorkoutData: boolean;
  needsCompletionData: boolean;
  needsNotesData: boolean;
}

const TODAY_PATTERNS = [
  /\btoday\b/i,
  /\btonight\b/i,
  /\bthis morning\b/i,
  /\bthis afternoon\b/i,
  /\bthis evening\b/i,
  /\btoday'?s\b/i,
];

const YESTERDAY_PATTERNS = [
  /\byesterday\b/i,
  /\byesterday'?s\b/i,
  /\blast night\b/i,
];

const PAST_WEEK_PATTERNS = [
  /\blast (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\bearlier this week\b/i,
  /\bprevious (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
];

const TOMORROW_PATTERNS = [
  /\btomorrow\b/i,
  /\btomorrow'?s\b/i,
  /\bnext day\b/i,
];

const THIS_WEEK_PATTERNS = [
  /\bthis week\b/i,
  /\bthis weekend\b/i,
  /\bsaturday\b/i,
  /\bsunday\b/i,
  /\bmonday\b/i,
  /\btuesday\b/i,
  /\bwednesday\b/i,
  /\bthursday\b/i,
  /\bfriday\b/i,
  /\brest of (the )?week\b/i,
];

const NEXT_WEEK_PATTERNS = [
  /\bnext week\b/i,
  /\bfollowing week\b/i,
  /\bupcoming week\b/i,
];

const SPECIFIC_WEEK_PATTERN = /\bweek (\d+)\b/i;

const INFO_ONLY_PATTERNS = [
  /^what'?s (?:my |the )?(?:next|coming|upcoming)/i,
  /^when is (?:my |the )?(?:next|race)/i,
  /^how (?:far|long|many)/i,
  /^explain/i,
  /^what does/i,
  /^tell me about/i,
  /\?$/,
];

const MODIFICATION_PATTERNS = [
  /\b(?:move|swap|change|switch|shift)\b/i,
  /\b(?:cancel|skip|delete|remove)\b/i,
  /\b(?:add|insert|include)\b/i,
  /\b(?:adjust|modify|update|edit)\b/i,
  /\b(?:shorten|lengthen|reduce|increase)\b/i,
  /\bcan'?t (?:do|make|run)\b/i,
  /\bhave (?:a |an )?(?:event|race|competition|injury)\b/i,
];

const ADVICE_SEEKING_PATTERNS = [
  /\bi(?:'?m| am) thinking (?:of|about)\b/i,
  /\bi was wondering\b/i,
  /\bwhat would you recommend\b/i,
  /\bwhat do you (?:think|recommend|suggest)\b/i,
  /\bshould i\b/i,
  /\bis it (?:a good idea|okay|ok|fine|worth)\b/i,
  /\bwould it be\b/i,
  /\bwhat would happen if\b/i,
  /\bwould you recommend\b/i,
  /\bany (?:advice|thoughts|suggestions|recommendations)\b/i,
  /\badvise me\b/i,
  /\bwhat'?s your (?:advice|opinion|take|thought)\b/i,
  /\bdo you think i should\b/i,
  /\bwould it be better\b/i,
];

const PROGRESS_ANALYSIS_PATTERNS = [
  /\banalyze/i,
  /\bhow am i doing/i,
  /\bmy progress/i,
  /\bperformance/i,
  /\badjustments/i,
  /\bhow'?s my training/i,
];

function analyzeQuestionScope(message: string): ScopeAnalysis {
  const lowerMessage = message.toLowerCase();

  const weekMatch = message.match(SPECIFIC_WEEK_PATTERN);
  if (weekMatch) {
    const weekNum = parseInt(weekMatch[1], 10);
    return {
      scope: 'specific_week',
      specificWeek: weekNum,
      needsWorkoutData: true,
      needsCompletionData: false,
      needsNotesData: false,
    };
  }

  const isProgressAnalysis = PROGRESS_ANALYSIS_PATTERNS.some(p => p.test(message));
  if (isProgressAnalysis) {
    return {
      scope: 'this_week',
      needsWorkoutData: true,
      needsCompletionData: true,
      needsNotesData: true,
    };
  }

  const isAdviceSeeking = ADVICE_SEEKING_PATTERNS.some(p => p.test(message));
  if (isAdviceSeeking) {
    return {
      scope: 'info_only',
      needsWorkoutData: true,
      needsCompletionData: false,
      needsNotesData: false,
    };
  }

  const isModification = MODIFICATION_PATTERNS.some(p => p.test(message));

  const isInfoOnly = INFO_ONLY_PATTERNS.some(p => p.test(message)) && !isModification;
  if (isInfoOnly) {
    return {
      scope: 'info_only',
      needsWorkoutData: false,
      needsCompletionData: false,
      needsNotesData: false,
    };
  }

  const isToday = TODAY_PATTERNS.some(p => p.test(message));
  if (isToday) {
    return {
      scope: 'today',
      needsWorkoutData: true,
      needsCompletionData: false,
      needsNotesData: false,
    };
  }

  const isTomorrow = TOMORROW_PATTERNS.some(p => p.test(message));
  if (isTomorrow) {
    return {
      scope: 'tomorrow',
      needsWorkoutData: true,
      needsCompletionData: false,
      needsNotesData: false,
    };
  }

  const isThisWeek = THIS_WEEK_PATTERNS.some(p => p.test(message));
  if (isThisWeek) {
    return {
      scope: 'this_week',
      needsWorkoutData: true,
      needsCompletionData: false,
      needsNotesData: false,
    };
  }

  const isNextWeek = NEXT_WEEK_PATTERNS.some(p => p.test(message));
  if (isNextWeek) {
    return {
      scope: 'next_week',
      needsWorkoutData: true,
      needsCompletionData: false,
      needsNotesData: false,
    };
  }

  if (isModification) {
    return {
      scope: 'this_week',
      needsWorkoutData: true,
      needsCompletionData: false,
      needsNotesData: false,
    };
  }

  return {
    scope: 'full_plan',
    needsWorkoutData: true,
    needsCompletionData: true,
    needsNotesData: true,
  };
}

function filterPlanDataByScope(
  planData: any,
  scope: QuestionScope,
  currentWeekNumber: number,
  specificWeek?: number
): any {
  if (!planData?.plan) return planData;

  let relevantWeeks: any[] = [];

  switch (scope) {
    case 'today':
    case 'tomorrow':
      relevantWeeks = planData.plan.filter((w: any) => w.week === currentWeekNumber);
      break;

    case 'this_week':
      relevantWeeks = planData.plan.filter((w: any) => w.week === currentWeekNumber);
      break;

    case 'next_week':
      relevantWeeks = planData.plan.filter((w: any) => w.week === currentWeekNumber + 1);
      break;

    case 'specific_week':
      if (specificWeek) {
        relevantWeeks = planData.plan.filter((w: any) => w.week === specificWeek);
      }
      break;

    case 'info_only':
      return { ...planData, plan: [] };

    case 'full_plan':
    default:
      const startWeek = Math.max(1, currentWeekNumber - 2);
      const endWeek = Math.min(planData.plan.length, currentWeekNumber + 2);
      relevantWeeks = planData.plan.filter((w: any) => w.week >= startWeek && w.week <= endWeek);
      break;
  }

  return {
    ...planData,
    plan: relevantWeeks,
    _scope: scope,
    _note: `Filtered to ${relevantWeeks.length} week(s) based on question scope: ${scope}`
  };
}

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
  distance_km: number | null;
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
    let workoutDateMap = '';

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

      // Build a concise mapping of calendar dates to workouts (only for optimized weeks)
      if (planStartDate && todaysDate && planData && planData.plan) {
        const dateMapping: string[] = [];
        const startDate = new Date(planStartDate + 'T00:00:00');

        // Only map the weeks we're sending (already optimized)
        planData.plan.forEach((week: any) => {
          const weekNumber = week.week;
          dayNames.forEach((dayName, dayIndex) => {
            const daysFromStart = (weekNumber - 1) * 7 + dayIndex;
            const workoutDate = new Date(startDate);
            workoutDate.setDate(startDate.getDate() + daysFromStart);
            const calendarDate = workoutDate.toISOString().split('T')[0];
            const workout = week.days?.[dayName]?.workout || 'Rest';

            // Shorten workout descriptions to reduce tokens
            const shortWorkout = workout.length > 50 ? workout.substring(0, 47) + '...' : workout;
            dateMapping.push(`${calendarDate}=${dayName} W${weekNumber}: ${shortWorkout}`);
          });
        });

        workoutDateMap = `\nDATE MAP:\n${dateMapping.join('\n')}\n`;
      }

      dateContext = `\nCURRENT: Today=${todaysDate} (${currentDayName}), Tomorrow=${tomorrowDate} (${tomorrowDayName}), Week ${currentTrainingWeek} Day ${currentTrainingDay}, Start=${planStartDate}`;
    }

    if (completedWorkouts && completedWorkouts.length > 0) {
      const completedList = completedWorkouts.map(key => {
        const [week, day] = key.split('-');
        return `W${week}-${day}`;
      }).join(', ');

      completedContext = `\nCOMPLETED WORKOUTS (CANNOT MODIFY): ${completedList}\n\nWORKOUT SELECTION RULES:\n- "next run" = first uncompleted RUNNING workout after today (skip rest/recovery)\n- "next workout" = any uncompleted item after today\n- "last [weekday]" = most recent past occurrence of that weekday\n- Past workouts NOT in completed list CAN be cancelled retroactively\n- Past workouts IN completed list CANNOT be modified\n- For info questions ("what's coming up"), return empty patches[]`;
    }

    const weekContext = currentWeekNumber ? `\nVIEWING: Week ${currentWeekNumber}` : '';

    // Check if race is on the correct day and auto-fix if needed
    let raceDateValidation = '';
    let autoFixRaceMessage = '';
    if (answers?.raceDate && planStartDate && planData?.plan) {
      const raceDate = new Date(answers.raceDate + 'T00:00:00');
      const raceDayOfWeek = raceDate.getDay();
      const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const raceDayIndex = raceDayOfWeek === 0 ? 6 : raceDayOfWeek - 1;
      const correctRaceDayName = dayNames[raceDayIndex];

      logger.info(`Race date check: ${answers.raceDate} falls on ${correctRaceDayName} (day ${raceDayOfWeek})`);

      // Find where the race is actually scheduled in the plan
      let actualRaceDayName = null;
      let actualRaceWeek = null;
      // Improved race detection - look for the last week which is typically the race week
      const lastWeek = planData.plan[planData.plan.length - 1];

      // Search last week first (most likely), then all weeks
      const weeksToSearch = [lastWeek, ...planData.plan.filter((w: any) => w !== lastWeek)];

      const raceKeywords = [
        'race day',
        'race:',
        'goal race',
        '🏁',
        'race!!',
        '5k race',
        '10k race',
        'half marathon race',
        'marathon race',
        answers.goal?.toLowerCase()
      ];

      for (const week of weeksToSearch) {
        for (const dayName of dayNames) {
          const workout = week.days?.[dayName]?.workout?.toLowerCase() || '';
          const hasRace = raceKeywords.some(keyword => workout.includes(keyword));

          if (hasRace) {
            actualRaceDayName = dayName;
            actualRaceWeek = week.week;
            logger.info(`Found race in Week ${actualRaceWeek} on ${dayName}: "${week.days[dayName].workout.substring(0, 50)}..."`);
            break;
          }
        }
        if (actualRaceDayName) break;
      }

      if (!actualRaceDayName) {
        logger.warn('Could not find race workout in plan');
      }

      // If race is on wrong day, force an automatic fix
      if (actualRaceDayName && actualRaceDayName !== correctRaceDayName) {
        raceDateValidation = `\nRACE MISMATCH: Race ${answers.raceDate} is ${correctRaceDayName} but scheduled ${actualRaceDayName} W${actualRaceWeek}. AUTO-FIX: Move race to ${correctRaceDayName}, add 2-3 day taper before, rest/recovery after. Return W${actualRaceWeek} with all 7 days.`;
        autoFixRaceMessage = `I've corrected your race week. Your race on ${answers.raceDate} is now on ${correctRaceDayName} with proper taper.`;
      }
    }

    // Calculate this weekend's dates
    let sundayWeek = currentTrainingWeek;
    let weekendContext = '';
    if (planStartDate && todaysDate) {
      const today = new Date(todaysDate + 'T00:00:00');
      const todayDayOfWeek = today.getDay();
      const daysUntilSaturday = todayDayOfWeek === 6 ? 0 : (6 - todayDayOfWeek + 7) % 7;
      const daysUntilSunday = todayDayOfWeek === 0 ? 0 : (7 - todayDayOfWeek) % 7;

      const thisSaturday = new Date(today);
      thisSaturday.setDate(today.getDate() + daysUntilSaturday);
      const saturdayDate = thisSaturday.toISOString().split('T')[0];

      const thisSunday = new Date(today);
      thisSunday.setDate(today.getDate() + daysUntilSunday);
      const sundayDate = thisSunday.toISOString().split('T')[0];

      const startDate = new Date(planStartDate + 'T00:00:00');
      const daysSinceSatStart = Math.floor((thisSaturday.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const daysSinceSunStart = Math.floor((thisSunday.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const saturdayWeek = Math.floor(daysSinceSatStart / 7) + 1;
      sundayWeek = Math.floor(daysSinceSunStart / 7) + 1;

      weekendContext = `, Sat=${saturdayDate} W${saturdayWeek}, Sun=${sundayDate} W${sundayWeek}`;
    }

    const currentWeekInstructions = (planStartDate && todaysDate) ? `\nWEEK RULES: Current W${currentTrainingWeek}${weekendContext}. Return only modified weeks with correct week numbers. "this weekend"=W${sundayWeek}.` : '';

    const isBeginnerPlan = answers?.experience?.toLowerCase() === 'beginner';
    const effortFormat = isBeginnerPlan ? 'Effort: X-X/10' : 'RPE X-X';
    const effortTerm = isBeginnerPlan ? 'Effort Level' : 'RPE';

    // Analyze question scope to determine what data to send
    const scopeAnalysis = analyzeQuestionScope(message);
    logger.info(`Question scope: ${scopeAnalysis.scope}, needsWorkoutData: ${scopeAnalysis.needsWorkoutData}`);

    // Filter plan data based on scope
    let optimizedPlanData = planData;
    if (scopeAnalysis.needsWorkoutData && planData?.plan && currentTrainingWeek > 0) {
      optimizedPlanData = filterPlanDataByScope(
        planData,
        scopeAnalysis.scope,
        currentTrainingWeek,
        scopeAnalysis.specificWeek
      );
      logger.info(`Filtered plan data: ${optimizedPlanData.plan?.length || 0} weeks (scope: ${scopeAnalysis.scope})`);
    } else if (!scopeAnalysis.needsWorkoutData) {
      // Info-only questions don't need workout data
      optimizedPlanData = { ...planData, plan: [] };
      logger.info(`Info-only question - sending no workout data`);
    }

    // Filter workout completions and notes based on scope
    const filteredCompletions = scopeAnalysis.needsCompletionData ? workoutCompletions : [];
    const filteredNotes = scopeAnalysis.needsNotesData ? workoutNotes : [];

    // Build context strings from filtered data
    let workoutCompletionsContext = '';
    if (filteredCompletions && filteredCompletions.length > 0) {
      const completionsSummary = filteredCompletions.map(completion => {
        const dist = completion.distance_km ? ` ${completion.distance_km.toFixed(1)}k` : '';
        const dur = completion.duration_minutes ? ` ${completion.duration_minutes}m` : '';
        return `W${completion.week_number}-${completion.day_name}: RPE${completion.rating}${dist}${dur}`;
      }).join(', ');

      workoutCompletionsContext = `\nRPE DATA: ${completionsSummary}\nRPE RULES:\n- Easy runs (RPE 2-4) rated 6-8 = too hard, reduce intensity\n- Tempo runs (RPE 6-7) rated 9-10 = too hard, dial back\n- 3+ high RPE = fatigue, add recovery\n- Consistently low RPE = ready for progression`;
    }

    let workoutNotesContext = '';
    if (filteredNotes && filteredNotes.length > 0) {
      const notesSummary = filteredNotes.map(note => {
        const mood = note.mood ? ` [${note.mood}]` : '';
        return `W${note.week_number}-${note.day_name}${mood}: ${note.notes}`;
      }).join('; ');

      workoutNotesContext = `\nNOTES: ${notesSummary}`;
    }

    // Limit chat history to last 10 messages to reduce tokens
    const limitedChatHistory = chatHistory.slice(-10);
    if (chatHistory.length > 10) {
      logger.info(`Limited chat history from ${chatHistory.length} to ${limitedChatHistory.length} messages`);
    }

    const effortGuide = isBeginnerPlan
      ? `${effortFormat} scale: 2-3=easy/recovery, 4-5=comfortable/long, 6-7=tempo, 7-9=intervals/hard, 9-10=max. Use "Effort: X-X/10" format (NOT RPE).`
      : `RPE scale: 2-3=easy/recovery, 4-5=comfortable/long, 6-7=tempo, 7-9=intervals/hard, 9-10=max.`;

    // Classify workout types for intelligent decision-making
    const workoutClassifier = (workout: string) => {
      const lower = workout.toLowerCase();
      if (lower.includes('long run') || lower.includes('long easy')) return 'LONG_RUN';
      if (lower.includes('interval') || lower.includes('speed') || lower.includes('track')) return 'HARD_SESSION';
      if (lower.includes('tempo') || lower.includes('threshold')) return 'HARD_SESSION';
      if (lower.includes('race') || lower.includes('🏁')) return 'RACE';
      if (lower.includes('rest') || lower === 'rest') return 'REST';
      if (lower.includes('easy') || lower.includes('recovery')) return 'EASY';
      return 'MODERATE';
    };

    // Build workout priority context
    let workoutPriorityContext = '';
    if (optimizedPlanData?.plan) {
      const weeksSummary: string[] = [];
      optimizedPlanData.plan.forEach((week: any) => {
        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const workouts = dayNames.map(day => {
          const workout = week.days?.[day]?.workout || 'Rest';
          const type = workoutClassifier(workout);
          if (type === 'LONG_RUN' || type === 'HARD_SESSION' || type === 'RACE') {
            return `${day}=${type}`;
          }
          return null;
        }).filter(Boolean);

        if (workouts.length > 0) {
          weeksSummary.push(`W${week.week}: ${workouts.join(', ')}`);
        }
      });

      if (weeksSummary.length > 0) {
        workoutPriorityContext = `\n\nKEY WORKOUTS:\n${weeksSummary.join('\n')}`;
      }
    }

    const systemPrompt = `GOLD STANDARD COACH CHAT & PLAN ADJUSTMENT PROMPT

You are an experienced endurance running coach AND a scheduling engine.
Your role is to intelligently adjust an existing training plan when life happens, while protecting long-term progress and preventing injury.

You must behave like a decisive, conservative, coach-first professional — not a brainstorming assistant.

CORE COACHING PHILOSOPHY

Understand the intent of every workout (endurance, quality, recovery)

Protect key workouts (long runs, quality sessions)

Easy runs are flexible; key sessions are not

When in doubt, choose the safest, most conservative option

Make the MINIMUM number of changes needed — only modify what the athlete explicitly requested

Never punish the athlete for being honest about fatigue, illness, or schedule conflicts

Explain decisions clearly, like a real coach would

INPUTS YOU CAN TRUST

You are given:

Today's date

The full training plan with dates

Workout metadata per day:

workoutType ∈ {REST, EASY, QUALITY, LONG_RUN, RACE}

priority ∈ {KEY, FLEX}

isCompleted ∈ {true, false}

User profile and race context

Recent effort/RPE feedback (if available)

The week currently being viewed

Do NOT re-classify workouts from text. Use the provided metadata.

CONVERSATIONAL VS. ACTION INTENT — READ THIS FIRST

Before doing anything, classify the athlete's intent:

EXPLORATORY / ADVICE-SEEKING (respond conversationally, return "patches": []):
- Phrases like: "I am thinking about...", "I was wondering if...", "what would you recommend?", "should I...", "what do you think about...", "is it a good idea to...", "would it be okay to...", "what would happen if...", "can I...", "how would I..."
- These are questions asking for coaching advice or a recommendation — NOT a request to change the plan
- Respond with thoughtful coaching advice. Ask a follow-up question if helpful. Do NOT modify the plan.
- Example: "I am thinking about replacing today's run with a row instead. What would you recommend?" → Give advice about cross-training, ask about goals or context, do NOT make a patch.

DEFINITIVE / ACTION (make the change, return patches):
- Phrases like: "please change...", "swap...", "cancel...", "move...", "replace...", "I can't do...", "I need to reschedule...", "make it a rest day", "I'm skipping..."
- These are explicit requests to modify the plan — make the change confidently.

INFORMATIONAL (answer the question, return "patches": []):
- "What's my run tomorrow?", "How many miles this week?", "What is RPE?", "Explain easy pace"
- Pure questions — answer them, no patches.

NATURAL LANGUAGE INTERPRETATION RULES

The athlete may speak casually. You must resolve their meaning silently using context.

Interpret phrases as follows:

"today" → Today's date

"yesterday" → Today - 1 day

"last [weekday]" → Most recent past occurrence of that weekday

"last Tuesday from this week" → The Tuesday that already passed this week (in the past)

"tomorrow" → Today + 1 day

"this week" → the currently viewed week (includes past days of current week)

"next week" → the week after the currently viewed week

"this weekend" → Saturday/Sunday of the current week

"next [weekday]" → Next upcoming occurrence of that weekday (in the future)

"my run tomorrow" → the scheduled workout on Tomorrow

If it is Rest, explain no run is planned

"my next run" → first upcoming non-Rest, non-completed workout

"my next workout" → first upcoming workout of any type

"my long run" → next upcoming LONG_RUN that is not completed

"the hard session" → next upcoming QUALITY workout

"I can't make my run" → athlete unavailable for that workout

"I'm tired / sick / sore" → prioritize recovery over volume

If multiple interpretations are possible:

Choose the most likely and safest

Do NOT ask for clarification unless ambiguity would cause unsafe changes

NON-NEGOTIABLE RULES

Never modify COMPLETED workouts (isCompleted: true)

Past workouts that were NOT completed CAN be cancelled/updated retroactively

Never create back-to-back LONG_RUN days

Never create back-to-back QUALITY or RACE days

QUALITY sessions require at least one EASY or REST day before and after (where possible)

LONG_RUNs should stay on weekends when possible

Preserve REST days unless the athlete explicitly asks to train on them

Do NOT add training days or increase frequency

Do NOT break taper structure near race day

Do NOT invent new workouts

DECISION PRIORITIES (TIE-BREAKERS)

When conflicts exist, apply in this order:

A) Preserve RACE day and taper
B) Preserve LONG_RUN over QUALITY if only one can be saved
C) Preserve QUALITY over EASY
D) Reduce duration before moving workouts mid-week
E) Downgrade QUALITY → EASY if needed
F) Skip EASY workouts last

Always choose the least disruptive option.

ALLOWED OPERATIONS ONLY

You may only:

Swap two future workouts

Move a workout to another future date

Reduce duration (≈10–25%)

Downgrade intensity (QUALITY → EASY)

Replace EASY with REST (for fatigue/illness)

No other operations are allowed.

YOUR TASK

Interpret the athlete's request

Identify the affected dates/workouts

Classify affected workouts using provided metadata

Apply the minimum safe change

Verify all non-negotiable rules

Respond confidently and clearly

CURRENT CONTEXT:
Profile: ${JSON.stringify(answers)}
Plan: ${JSON.stringify(optimizedPlanData)}${workoutPriorityContext}${workoutDateMap}${dateContext}${weekContext}${currentWeekInstructions}${raceDateValidation}${completedContext}${workoutCompletionsContext}${workoutNotesContext}

${effortGuide}

OUTPUT REQUIREMENTS - PATCH MODE

Return JSON only with patches for ONLY the days explicitly requested by the athlete:

{
  "coachExplanation": "Warm, confident coach explanation of what changed and why",
  "patches": [
    {
      "week": number,
      "weekday": "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun",
      "action": "cancel" | "replace",
      "workout": "string (REQUIRED for replace)",
      "tips": ["string"] (optional),
      "workout_type": "TRAIN" | "REST" | "RACE" (optional, defaults to TRAIN for replace, REST for cancel)
    }
  ]
}

CRITICAL PATCH RULES:

Return ONLY patches for days explicitly requested by the user

Do NOT return patches for days you did not modify

Do NOT rebalance or redistribute workouts unless explicitly requested

Use actual weekday names (Mon/Tue/Wed/Thu/Fri/Sat/Sun) that match the calendar

Do NOT compute dates - server will resolve them

action="cancel" → changes workout to "Rest" with workout_type="REST"

action="replace" → requires workout field (non-empty)

If patches span more than 1 week, user must have explicitly requested multi-week changes

Limit patches to maximum 7 per request (safety cap)

If no plan change is needed, return "patches": []

For info-only questions ("what's next?"), return "patches": []

RESPONSE TONE

Warm, encouraging, and human — like a supportive training partner who also happens to be an expert coach.

Use natural, conversational language. Contractions are fine ("you're", "let's", "that's").

Acknowledge how the athlete is feeling before jumping into the solution — a little empathy goes a long way.

Celebrate effort and consistency. If a workout was completed, acknowledge it positively.

Be energising. If a session is coming up, make it sound achievable and worth looking forward to.

No robotic lists of instructions. Speak in sentences like a real person.

No hedging ("maybe", "could", "you might want to") — be decisive and confident.

No judgement — life happens. Always respond with understanding.

No over-explaining technical detail unless the athlete asks.

The athlete should feel:

"My coach gets me, has my back, and I'm excited to keep going."

SUCCESS CRITERION

If a runner says something vague like

"I can't make my run tomorrow"

Your response should:

understand exactly which run they mean

make a sensible adjustment with a SINGLE patch

protect key training

require no follow-up questions

feel obviously correct`;

    // If race date mismatch detected and this is the first user message, auto-inject fix
    let userMessage = message;
    const userMessageCount = chatHistory.filter(msg => msg.role === 'user').length;
    if (raceDateValidation && userMessageCount === 0) {
      userMessage = `SYSTEM AUTO-FIX REQUEST: ${autoFixRaceMessage}\n\nUser's actual message: ${message}`;
    }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...limitedChatHistory,
      { role: 'user', content: userMessage }
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

    // Helper to get weekday name from date (UTC-safe)
    const getWeekdayName = (dateStr: string): string => {
      const date = new Date(dateStr + 'T00:00:00Z');
      const dayIndex = date.getUTCDay();
      const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return weekdays[dayIndex];
    };

    // Helper to resolve weekday to ISO date within a week window
    const resolveWeekdayToDate = (weekNumber: number, weekday: string, startDate: Date): string | null => {
      // Calculate week window
      const weekStartDate = new Date(startDate);
      weekStartDate.setUTCDate(startDate.getUTCDate() + (weekNumber - 1) * 7);

      const weekDates: string[] = [];
      for (let i = 0; i < 7; i++) {
        const dayDate = new Date(weekStartDate);
        dayDate.setUTCDate(weekStartDate.getUTCDate() + i);
        weekDates.push(dayDate.toISOString().split('T')[0]);
      }

      // Find date whose actual weekday matches the requested weekday
      for (const isoDate of weekDates) {
        if (getWeekdayName(isoDate) === weekday) {
          return isoDate;
        }
      }

      return null; // Should not happen with valid input
    };

    // Build valid date set from canonical days[] if available
    const validDates = new Set<string>();
    if (planData.days && Array.isArray(planData.days)) {
      planData.days.forEach((day: any) => {
        if (day.date) validDates.add(day.date);
      });
      logger.info(`[PatchMode] Valid dates from canonical days[]: ${validDates.size}`);
    }

    // PATCH MODE PROCESSING
    if (content.patches && Array.isArray(content.patches) && planStartDate) {
      logger.info('[PatchMode] Processing patches:', content.patches.length);

      if (content.patches.length === 0) {
        logger.info('[PatchMode] No patches to apply');
        return new Response(JSON.stringify({ response: content.coachExplanation || content.response, patches: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const startDate = new Date(planStartDate + 'T00:00:00Z');
      const validationErrors: string[] = [];
      const processedPatches: any[] = [];

      // Safety: Limit patches per request
      if (content.patches.length > 7) {
        validationErrors.push(`Too many patches (${content.patches.length}). Maximum 7 per request.`);
      }

      // Validate and resolve each patch
      const weeks = new Set<number>();
      content.patches.forEach((patch: any, idx: number) => {
        // Validate required fields
        if (!patch.week || typeof patch.week !== 'number' || patch.week < 1) {
          validationErrors.push(`Patch ${idx}: invalid week number`);
          return;
        }
        if (!patch.weekday || !['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].includes(patch.weekday)) {
          validationErrors.push(`Patch ${idx}: invalid or missing weekday`);
          return;
        }
        if (!patch.action || !['cancel', 'replace'].includes(patch.action)) {
          validationErrors.push(`Patch ${idx}: invalid action (must be cancel or replace)`);
          return;
        }
        if (patch.action === 'replace' && (!patch.workout || typeof patch.workout !== 'string' || patch.workout.trim() === '')) {
          validationErrors.push(`Patch ${idx}: action=replace requires non-empty workout field`);
          return;
        }

        weeks.add(patch.week);

        // Resolve weekday to ISO date
        const isoDate = resolveWeekdayToDate(patch.week, patch.weekday, startDate);
        if (!isoDate) {
          validationErrors.push(`Patch ${idx}: could not resolve week ${patch.week} ${patch.weekday} to a date`);
          return;
        }

        // Validate date exists in canonical plan
        if (validDates.size > 0 && !validDates.has(isoDate)) {
          validationErrors.push(`Patch ${idx}: resolved date ${isoDate} not in canonical plan`);
          return;
        }

        logger.info(`[PatchMode] W${patch.week} ${patch.weekday} -> ${isoDate}`);

        // Apply default rules for action
        const processedPatch: any = {
          date: isoDate,
          weekday: patch.weekday,
          week: patch.week,
          action: patch.action,
        };

        if (patch.action === 'cancel') {
          processedPatch.workout = 'Rest';
          processedPatch.workout_type = 'REST';
          processedPatch.tips = [];
        } else if (patch.action === 'replace') {
          processedPatch.workout = patch.workout;
          processedPatch.tips = patch.tips || [];
          processedPatch.workout_type = patch.workout_type || 'TRAIN';
          if (patch.workoutType) processedPatch.workoutType = patch.workoutType;
        }

        processedPatches.push(processedPatch);
      });

      // Multi-week validation
      if (weeks.size > 1) {
        logger.warn(`[PatchMode] Patches span ${weeks.size} weeks - ensure this was explicitly requested`);
      }

      if (validationErrors.length > 0) {
        logger.error('[PatchMode] Validation failed:', validationErrors);
        return new Response(
          JSON.stringify({
            error: 'Coach response has invalid patches. Please try again.',
            details: validationErrors,
            isDateValidationError: true
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      logger.info('[PatchMode] All patches validated and resolved successfully');

      return new Response(JSON.stringify({
        response: content.coachExplanation || content.response,
        patches: processedPatches
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // LEGACY FORMAT SUPPORT (updatedPlan)
    if (content.updatedPlan && content.updatedPlan.plan && planStartDate) {
      logger.info('[Legacy] Processing updatedPlan format - converting to patches');

      const startDate = new Date(planStartDate + 'T00:00:00Z');
      const legacyPatches: any[] = [];
      const validationErrors: string[] = [];

      // Check if using D1-D7 or Mon-Sun format
      const firstWeek = content.updatedPlan.plan[0];
      const usesRollingFormat = firstWeek && ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'].some(d => d in firstWeek.days);

      if (usesRollingFormat) {
        logger.info('[Legacy] Converting D1-D7 format to patches');

        content.updatedPlan.plan.forEach((week: any) => {
          const weekNumber = week.week;
          const weekStartDate = new Date(startDate);
          weekStartDate.setUTCDate(startDate.getUTCDate() + (weekNumber - 1) * 7);

          ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'].forEach((dayKey, dayIndex) => {
            const dayData = week.days?.[dayKey];
            if (!dayData) return;

            const dayDate = new Date(weekStartDate);
            dayDate.setUTCDate(weekStartDate.getUTCDate() + dayIndex);
            const isoDate = dayDate.toISOString().split('T')[0];
            const weekday = getWeekdayName(isoDate);

            if (validDates.size > 0 && !validDates.has(isoDate)) {
              validationErrors.push(`Week ${weekNumber} ${dayKey}: date ${isoDate} not in canonical plan`);
              return;
            }

            legacyPatches.push({
              date: isoDate,
              weekday,
              week: weekNumber,
              action: 'replace',
              workout: dayData.workout,
              tips: dayData.tips || [],
              workout_type: dayData.workout_type || dayData.workoutType || 'TRAIN',
              workoutType: dayData.workoutType
            });
          });
        });
      } else {
        logger.info('[Legacy] Converting Mon-Sun format to patches');

        content.updatedPlan.plan.forEach((week: any) => {
          const weekNumber = week.week;

          ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach((weekday) => {
            const dayData = week.days?.[weekday];
            if (!dayData) return;

            const isoDate = resolveWeekdayToDate(weekNumber, weekday, startDate);
            if (!isoDate) {
              validationErrors.push(`Week ${weekNumber} ${weekday}: could not resolve to date`);
              return;
            }

            if (validDates.size > 0 && !validDates.has(isoDate)) {
              validationErrors.push(`Week ${weekNumber} ${weekday}: date ${isoDate} not in canonical plan`);
              return;
            }

            legacyPatches.push({
              date: isoDate,
              weekday,
              week: weekNumber,
              action: 'replace',
              workout: dayData.workout,
              tips: dayData.tips || [],
              workout_type: dayData.workout_type || dayData.workoutType || 'TRAIN',
              workoutType: dayData.workoutType
            });
          });
        });
      }

      if (validationErrors.length > 0) {
        logger.error('[Legacy] Validation failed:', validationErrors);
        return new Response(
          JSON.stringify({
            error: 'Legacy format conversion failed. Please try again.',
            details: validationErrors,
            isDateValidationError: true
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      logger.info('[Legacy] Converted to', legacyPatches.length, 'patches');

      return new Response(JSON.stringify({
        response: content.response,
        patches: legacyPatches,
        _legacy: true
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
