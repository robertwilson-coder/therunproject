/**
 * coachResponseGenerator.ts
 *
 * Generates natural coaching language AFTER a deterministic action has been executed.
 * The LLM here only produces tone and explanation — it never controls plan logic.
 */

import { type PlanAction } from './planAction.ts';
import { type ActionResult } from './actionExecutor.ts';
import { type ClassifiedIntent } from './intentClassifier.ts';
import { logger } from './logger.ts';

const COACH_SYSTEM_PROMPT = `You are a warm, direct running coach. Your runner just had a change made to their training plan (or asked a question). Write a brief, natural coaching response.

Rules:
- Speak directly to the runner using "you" and "your"
- Be warm but concise — 1–4 sentences for most responses
- NEVER mention: deterministic engine, edge functions, routing, proposals, database, system, rebuild logic, JSON, algorithms
- Describe WHAT changed and WHY it helps the runner — nothing technical
- For questions/explanations, give a clear, helpful answer grounded in training science
- For blocked actions, explain why politely and offer an alternative
- Do not use bullet points unless listing 3+ items
- NEVER use markdown formatting — no **bold** or *italic* text. Write in plain sentences.`;

export async function generateCoachResponse(
  action: PlanAction,
  intent: ClassifiedIntent,
  result: ActionResult,
  originalMessage: string,
  chatHistory: Array<{ role: string; content: string }>,
  planContext: {
    raceDate?: string | null;
    raceDistance?: string;
    userName?: string;
    todayISO: string;
  },
  openaiApiKey: string,
  impactNote?: string,
): Promise<string> {
  const contextLines: string[] = [];

  if (planContext.userName) contextLines.push(`Runner's name: ${planContext.userName}`);
  if (planContext.raceDate) contextLines.push(`Race date: ${planContext.raceDate}`);
  if (planContext.raceDistance) contextLines.push(`Race distance: ${planContext.raceDistance}`);
  contextLines.push(`Today: ${planContext.todayISO}`);

  const actionOutcome = describeOutcome(action, result, intent);

  const recentHistory = chatHistory.slice(-4).map(m => `${m.role}: ${m.content}`).join('\n');
  const historyBlock = recentHistory ? `\nRecent conversation:\n${recentHistory}\n` : '';

  const impactBlock = impactNote
    ? `\n${impactNote}\n\nIMPORTANT: First confirm the action in 1 sentence, then on a new line deliver the impact note and options EXACTLY as written above — do not paraphrase or shorten the options list. Do not use italic or bold formatting.`
    : '';

  const userPrompt = `${contextLines.join('\n')}${historyBlock}

Runner said: "${originalMessage}"

Action taken: ${actionOutcome}${impactBlock}

Write a brief coaching response (1–4 sentences${impactNote ? ', then the impact note and options as instructed' : ''}). Be warm and direct. No technical jargon.`;

  logger.info('[CoachResponse] Generating coach message', { action, planUpdated: result.planUpdated });

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: COACH_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      logger.error('[CoachResponse] OpenAI error', { status: response.status });
      const fallback = getFallbackMessage(action, result, intent);
      return impactNote ? `${fallback}\n\n${impactNote}` : fallback;
    }

    const data = await response.json();
    return data.choices[0]?.message?.content?.trim() ?? (impactNote ? `${getFallbackMessage(action, result, intent)}\n\n${impactNote}` : getFallbackMessage(action, result, intent));
  } catch (err) {
    logger.error('[CoachResponse] Failed to generate coach message', err);
    const fallback = getFallbackMessage(action, result, intent);
    return impactNote ? `${fallback}\n\n${impactNote}` : fallback;
  }
}

function describeOutcome(action: PlanAction, result: ActionResult, intent: ClassifiedIntent): string {
  if (!result.success) {
    if (result.blockedReason === 'taper_guard') {
      return 'BLOCKED — runner is in taper period, structural changes not allowed';
    }
    if (result.blockedReason === 'past_session') {
      return 'BLOCKED — session is in the past, cannot be modified';
    }
    if (result.blockedReason === 'requires_plan_settings') {
      return 'BLOCKED — this type of change requires using the plan settings';
    }
    return `FAILED — ${result.message}`;
  }

  const msg = result.message;
  const params = intent.parameters;

  switch (action) {
    case 'CANCEL_SESSION':
    case 'SKIP_SESSION': {
      const date = msg.split(':')[1];
      return `Successfully cancelled the training session on ${date}. It is now a rest day.`;
    }
    case 'MOVE_SESSION': {
      const parts = msg.split(':');
      return `Successfully moved the session from ${parts[1]} to ${parts[2]}.`;
    }
    case 'SWAP_SESSIONS': {
      const parts = msg.split(':');
      return `Successfully swapped the sessions on ${parts[1]} and ${parts[2]}.`;
    }
    case 'CONVERT_TO_EASY_RUN': {
      const date = msg.split(':')[1];
      return `Successfully converted the session on ${date} to an easy run.`;
    }
    case 'SOFTEN_WEEK':
    case 'L2_SOFTEN_WEEK':
      return `This week has been softened — quality session converted to easy run, long run reduced by ~12%.`;
    case 'REDUCE_WEEK_VOLUME':
    case 'L3_REDUCE_WEEK':
      return `This week's volume has been reduced by ~15% across all sessions.`;
    case 'TRAVEL_WEEK':
      return `This week has been adjusted for travel — reduced volume and simplified sessions.`;
    case 'REPEAT_WEEK':
      return `Next week will repeat this week's structure rather than progressing.`;
    case 'L1_SKIP_WORKOUT': {
      const parts = msg.split(':');
      return `Skipped the next workout (${parts[1]}): "${parts[2]}". Converted to a rest day.`;
    }
    case 'L4_INSERT_RECOVERY_WEEK':
    case 'REBUILD_PLAN': {
      const parts = msg.split(':');
      return `Full recovery week inserted. This week: ~${parts[1]} km. Next build week: ~${parts[2]} km. Plan rebuilt across ${parts[3]} weeks.`;
    }
    case 'ADD_EXTRA_RUN': {
      const date = msg.split(':')[1];
      return `Added an easy 5 km run on ${date}.`;
    }
    case 'RECURRING_MOVE_WEEKDAY': {
      const parts = msg.split(':');
      const fromDay = parts[1];
      const toDay = parts[2];
      const count = parts[3];
      const swapped = msg.includes('swapped=');
      const swapNote = swapped ? ' Some sessions were swapped where the target day already had a workout.' : '';
      return `Successfully moved all future ${fromDay} workouts to ${toDay}. ${count} workouts were rescheduled.${swapNote}`;
    }
    case 'RECURRING_ADD_WEEKDAY': {
      const parts = msg.split(':');
      const weekday = parts[1];
      const count = parts[2];
      return `Successfully added easy runs to all future ${weekday}s. ${count} workouts were added.`;
    }
    case 'RECURRING_REMOVE_WEEKDAY': {
      const parts = msg.split(':');
      const weekday = parts[1];
      const count = parts[2];
      return `Successfully removed all future ${weekday} workouts. ${count} sessions are now rest days.`;
    }
    case 'EXPLAIN_WORKOUT':
      return `Runner asked for an explanation about their workout. Answer their question about: "${intent.parameters.workout_type ?? 'the workout'}".`;
    case 'GENERAL_QUESTION':
      return `Runner asked a general training question: "${params.topic ?? 'training'}". Answer their question helpfully.`;
    case 'CHANGE_RACE_GOAL':
      return `Runner mentioned a race goal change. Acknowledge this and suggest they update their plan settings if needed.`;
    default:
      return result.planUpdated ? 'Plan updated successfully.' : 'No changes made.';
  }
}

function getFallbackMessage(action: PlanAction, result: ActionResult, intent: ClassifiedIntent): string {
  if (!result.success) {
    if (result.blockedReason === 'taper_guard') {
      return "I can't make structural changes during your taper — that window is protected to keep your race preparation on track. I can still help with individual session adjustments if needed.";
    }
    if (result.blockedReason === 'past_session') {
      return "That session is in the past, so I can't modify it. Let me know if there's an upcoming session you'd like to adjust.";
    }
    if (result.blockedReason === 'needs_clarification') {
      return intent.clarification_question ?? "Could you give me a bit more detail? I want to make sure I make the right change.";
    }
    if (result.blockedReason === 'requires_plan_settings') {
      return "That type of change requires updating your plan settings — you can do that from the plan header. Let me know if you have questions about anything else.";
    }
    return result.message || "I wasn't able to make that change. Could you try rephrasing what you'd like me to do?";
  }

  switch (action) {
    case 'CANCEL_SESSION':
    case 'SKIP_SESSION':
      return "Done — that session has been removed. The rest of your plan stays exactly the same.";
    case 'MOVE_SESSION':
      return "Done — I've moved that session for you. Everything else stays as planned.";
    case 'SWAP_SESSIONS':
      return "Done — I've swapped those sessions. Your plan is updated.";
    case 'CONVERT_TO_EASY_RUN':
      return "Done — that session has been converted to an easy run. Keep the effort conversational.";
    case 'SOFTEN_WEEK':
    case 'L2_SOFTEN_WEEK':
      return "Done — your week has been softened. Quality session is now easy, and the long run is trimmed slightly. You should feel a lot better by the end of the week.";
    case 'REDUCE_WEEK_VOLUME':
    case 'L3_REDUCE_WEEK':
      return "Done — this week's volume has been reduced by about 15%. You'll pick back up next week feeling fresher.";
    case 'L1_SKIP_WORKOUT':
      return "Done — your next workout has been converted to a rest day. Check back in tomorrow and see how you're feeling.";
    case 'L4_INSERT_RECOVERY_WEEK':
    case 'REBUILD_PLAN':
      return "Your recovery week has been inserted and the plan rebuilt. Take it easy this week — you've earned the rest.";
    case 'TRAVEL_WEEK':
      return "Done — your week has been adjusted for travel. Keep things easy and consistent while you're away.";
    case 'REPEAT_WEEK':
      return "Done — next week will mirror this week's structure. Sometimes repeating a week is exactly the right call.";
    case 'RECURRING_MOVE_WEEKDAY':
      return "Done — I've moved all future workouts from that day to your new preferred day. Your schedule is updated.";
    case 'RECURRING_ADD_WEEKDAY':
      return "Done — I've added easy runs to all future occurrences of that day. Keep these sessions conversational.";
    case 'RECURRING_REMOVE_WEEKDAY':
      return "Done — all future workouts on that day have been converted to rest days.";
    default:
      return result.planUpdated ? "Done — your plan has been updated." : "Got it — let me know if there's anything else I can help with.";
  }
}
