/**
 * intentClassifier.ts
 *
 * Calls the LLM at temperature 0 to classify the user's message into one
 * deterministic PlanAction. The LLM outputs structured JSON only — it never
 * generates plan edits directly.
 */

import { type PlanAction, PLAN_ACTION_DESCRIPTIONS } from './planAction.ts';
import { logger } from './logger.ts';

export interface ClassifiedIntent {
  action: PlanAction;
  confidence: number;
  parameters: Record<string, string | number | boolean | null>;
  needs_clarification: boolean;
  clarification_question?: string;
}

export interface UpcomingDay {
  date: string;
  dow: string;
  workout_type: string;
  label: string;
}

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function buildUpcomingDaysContext(
  days: Array<{ date: string; workout_type: string; workout?: string }>,
  todayISO: string,
  windowDays: number = 21,
): UpcomingDay[] {
  const endDateISO = addDaysISO(todayISO, windowDays);

  return days
    .filter((d) => d.date >= todayISO && d.date < endDateISO)
    .map((d) => {
      const dow = DOW_NAMES[new Date(d.date + 'T12:00:00Z').getUTCDay()];
      const isRest = d.workout_type === 'REST';
      const label = isRest
        ? 'Rest'
        : (d.workout?.split('\n')[0]?.slice(0, 40) || d.workout_type);
      return { date: d.date, dow, workout_type: d.workout_type, label };
    });
}

function addDaysISO(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

export function resolveWeekdayFromPlan(
  dayName: string,
  upcomingDays: UpcomingDay[],
): { resolved: string | null; ambiguous: boolean; options: string[] } {
  const normalized = dayName.toLowerCase().slice(0, 3);
  const dowMap: Record<string, string> = {
    sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat',
  };
  const targetDow = dowMap[normalized];
  if (!targetDow) {
    return { resolved: null, ambiguous: false, options: [] };
  }

  const matches = upcomingDays.filter((d) => d.dow === targetDow).map((d) => d.date);

  if (matches.length === 0) {
    return { resolved: null, ambiguous: false, options: [] };
  }
  if (matches.length === 1) {
    return { resolved: matches[0], ambiguous: false, options: matches };
  }
  return { resolved: null, ambiguous: true, options: matches };
}

const CLASSIFIER_SYSTEM_PROMPT = `You are a training plan intent classifier. Your ONLY job is to read a runner's message and output a JSON object identifying which action they want.

You must output ONLY valid JSON. No explanation. No markdown. No prose.

Available actions:
${Object.entries(PLAN_ACTION_DESCRIPTIONS).map(([k, v]) => `  "${k}": ${v}`).join('\n')}

Output format (REQUIRED — output ONLY this JSON, nothing else):
{
  "action": "<one action from the list above>",
  "confidence": <number between 0.0 and 1.0>,
  "parameters": {
    "date": "<ISO date YYYY-MM-DD if unambiguously specified, else null>",
    "from_date": "<ISO date if moving FROM a date>",
    "to_date": "<ISO date if moving TO a date>",
    "day": "<day name if mentioned but date unclear, e.g. 'Friday'>",
    "from_weekday": "<weekday name for recurring moves, e.g. 'Friday'>",
    "to_weekday": "<target weekday name for recurring moves, e.g. 'Thursday'>",
    "target_weekday": "<weekday for recurring add/remove, e.g. 'Monday'>",
    "level": "<L1|L2|L3|L4 if fatigue level specified>",
    "workout_type": "<type of workout if mentioned>",
    "distance_km": <number if distance mentioned, else null>,
    "week_offset": <0 for this week, 1 for next week, -1 for last week, null if unspecified>
  },
  "needs_clarification": <true if a required parameter is ambiguous, else false>,
  "clarification_question": "<concise question to ask if needs_clarification is true, else null>"
}

CRITICAL: RECURRING WEEKDAY EDIT DETECTION (HIGHEST PRIORITY)
These patterns indicate a RECURRING weekday edit — NOT a single-day edit:
- "all Fridays", "all future Fridays", "every Friday", "all Friday workouts"
- "all Mondays", "every Monday", "all future Monday runs"
- "move all X to Y", "shift all X to Y"
- "add a run to all Mondays", "add a workout every Monday"
- "remove all Tuesday workouts", "cancel all future Fridays"
- "going forward", "for the rest of the plan", "from now on"

When you see these patterns:
1. Use RECURRING_MOVE_WEEKDAY if moving all workouts from one weekday to another
   - Set from_weekday and to_weekday (NOT from_date/to_date)
   - Example: "move all Fridays to Thursday" → from_weekday="Friday", to_weekday="Thursday"
2. Use RECURRING_ADD_WEEKDAY if adding workouts to all occurrences of a weekday
   - Set target_weekday
   - Example: "add a run to all Mondays" → target_weekday="Monday"
3. Use RECURRING_REMOVE_WEEKDAY if removing all workouts on a weekday
   - Set target_weekday
   - Example: "remove all Tuesday workouts" → target_weekday="Tuesday"

DO NOT ask "which Friday?" or "which Monday?" when the user clearly means ALL future occurrences.
DO NOT use MOVE_SESSION for "move all Fridays to Thursday" — use RECURRING_MOVE_WEEKDAY instead.

CRITICAL RULES FOR DATE RESOLUTION (for single-day edits only):
- NEVER guess or infer a date from a weekday name alone (e.g., "Friday", "Saturday").
- If the user mentions a weekday name without specifying "this", "next", or a specific date, AND without recurring markers like "all"/"every"/"future", you MUST set needs_clarification=true and ask which date they mean.
- Use the UPCOMING_PLAN_DAYS provided to see exact dates. If "Friday" appears twice, ask which one.
- Only set date/from_date/to_date to a YYYY-MM-DD value if the user explicitly provides it OR if there is only ONE matching day in the upcoming plan window.
- If user says "this Friday" or "next Friday" with context and UPCOMING_PLAN_DAYS has only one matching Friday, resolve it.

AMBIGUITY HANDLING:
- "Move Friday to Thursday" (no "all"/"every") → MAY need clarification: ask "Did you mean just this Friday, or all future Friday workouts?"
- "Move all Fridays to Thursday" → RECURRING_MOVE_WEEKDAY, NO clarification needed
- "Add a run on Monday" (no "all"/"every") → MAY need clarification
- "Add a run to all Mondays" → RECURRING_ADD_WEEKDAY, NO clarification needed

WEEK_OFFSET RULES (CRITICAL):
- If the user says "next week", "starting next week", "from next week", set week_offset=1
- If the user says "this week", "starting now", or no week qualifier, set week_offset=0
- Examples: "I need a recovery week next week" → week_offset=1, "Give me a recovery week" → week_offset=0

Other rules:
- If the runner says "I'm tired" or "I need a rest", use action="L1_SKIP_WORKOUT" unless they say "recovery week" (L4_INSERT_RECOVERY_WEEK)
- If the runner asks "what is a tempo run" or "why do I do intervals", use action="EXPLAIN_WORKOUT"
- If the runner asks about pace, nutrition, race strategy with no plan edit implied, use action="GENERAL_QUESTION"
- If the runner says "soften this week" or "easier week", use action="L2_SOFTEN_WEEK"
- If the runner says "reduce this week" or "cut back this week", use action="L3_REDUCE_WEEK"
- If the runner says "recovery week" or "deload", use action="L4_INSERT_RECOVERY_WEEK"
- confidence must reflect how certain you are (0.5 = unsure, 0.9+ = very confident)
- Output ONLY the JSON object. Nothing before or after it.`;

export async function classifyChatIntent(
  message: string,
  chatHistory: Array<{ role: string; content: string }>,
  todayISO: string,
  openaiApiKey: string,
  upcomingDays?: UpcomingDay[],
): Promise<ClassifiedIntent> {
  const contextBlock = chatHistory.length > 0
    ? `\nRecent conversation context:\n${chatHistory.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n')}\n`
    : '';

  const planContextBlock = upcomingDays && upcomingDays.length > 0
    ? `\nUPCOMING_PLAN_DAYS (next ${upcomingDays.length} days):\n${upcomingDays.map(d => `  ${d.date} (${d.dow}): ${d.workout_type} — ${d.label}`).join('\n')}\n`
    : '';

  const userPrompt = `Today's date: ${todayISO}${planContextBlock}${contextBlock}
Runner's message: "${message}"

Classify this message into one action. Output ONLY the JSON object.`;

  logger.info('[IntentClassifier] Classifying intent', { message: message.slice(0, 100) });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
      max_tokens: 400,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('[IntentClassifier] OpenAI error', { status: response.status, error: errorText });
    throw new Error(`Intent classifier OpenAI error: ${response.status}`);
  }

  const result = await response.json();
  const raw = result.choices[0]?.message?.content ?? '{}';

  logger.info('[IntentClassifier] Raw classifier response', { raw });

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    logger.error('[IntentClassifier] Failed to parse JSON', { raw });
    return {
      action: 'GENERAL_QUESTION',
      confidence: 0.3,
      parameters: {},
      needs_clarification: false,
    };
  }

  let intent: ClassifiedIntent = {
    action: (parsed.action as PlanAction) ?? 'GENERAL_QUESTION',
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    parameters: parsed.parameters ?? {},
    needs_clarification: parsed.needs_clarification === true,
    clarification_question: parsed.clarification_question ?? undefined,
  };

  if (upcomingDays && upcomingDays.length > 0) {
    intent = applyCodeSideWeekdayResolution(intent, upcomingDays);
  }

  logger.info('[IntentClassifier] Classified intent', {
    action: intent.action,
    confidence: intent.confidence,
    needs_clarification: intent.needs_clarification,
  });

  return intent;
}

function applyCodeSideWeekdayResolution(
  intent: ClassifiedIntent,
  upcomingDays: UpcomingDay[],
): ClassifiedIntent {
  const RECURRING_ACTIONS = ['RECURRING_MOVE_WEEKDAY', 'RECURRING_ADD_WEEKDAY', 'RECURRING_REMOVE_WEEKDAY'];
  if (RECURRING_ACTIONS.includes(intent.action)) {
    return intent;
  }

  const params = { ...intent.parameters };
  let needsClarification = intent.needs_clarification;
  let clarificationQuestion = intent.clarification_question;

  const dayParam = params.day as string | null;
  const dateParam = params.date as string | null;
  const fromDateParam = params.from_date as string | null;
  const toDateParam = params.to_date as string | null;

  if (dayParam && !dateParam && !fromDateParam && !toDateParam) {
    const resolution = resolveWeekdayFromPlan(dayParam, upcomingDays);

    if (resolution.resolved) {
      const dateActions = ['CANCEL_SESSION', 'SKIP_SESSION', 'CONVERT_TO_EASY_RUN', 'ADD_EXTRA_RUN'];
      const fromDateActions = ['MOVE_SESSION', 'SWAP_SESSIONS'];

      if (dateActions.includes(intent.action)) {
        params.date = resolution.resolved;
      } else if (fromDateActions.includes(intent.action)) {
        params.from_date = resolution.resolved;
      }
    } else if (resolution.ambiguous && resolution.options.length > 1) {
      needsClarification = true;
      const formattedOptions = resolution.options.map((d) => {
        const dayOfWeek = DOW_NAMES[new Date(d + 'T12:00:00Z').getUTCDay()];
        return `${d} (${dayOfWeek})`;
      }).join(' or ');
      clarificationQuestion = `Which ${dayParam} did you mean? ${formattedOptions}`;
    }
  }

  return {
    ...intent,
    parameters: params,
    needs_clarification: needsClarification,
    clarification_question: clarificationQuestion,
  };
}
