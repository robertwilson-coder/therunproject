import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';
import { logger } from '../_shared/logger.ts';
import { DateResolver } from '../_shared/dateResolverBackend.ts';
import {
  createClarificationRequest,
  createCoachMessage,
  createPreviewMode,
  validateCommitRequest,
  type ClarificationOption,
  type PreviewOperation,
  type CommitRequest,
  type ChatResponse
} from '../_shared/clarificationWorkflow.ts';
import { extractDatePhrases, hasAmbiguousDateReference } from '../_shared/phraseAnalyzer.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  mode?: 'draft' | 'commit' | 'clarification_response';
  message?: string;
  chatHistory?: Array<{ role: string; content: string }>;
  planId: string;
  planVersion: number;
  userTimezone: string;
  todayISO?: string;

  clarificationId?: string;
  selectedOptionId?: string;
  selectedDate?: string;

  previewId?: string;
  previewHash?: string;
  confirmedWorkoutIds?: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const body: RequestBody = await req.json();
    const { mode = 'draft', planId, planVersion, userTimezone, message, chatHistory } = body;

    logger.info('[Gold Standard Chat] Request received', {
      mode,
      planId,
      planVersion,
      userTimezone,
      hasMessage: !!message
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: plan, error: planError } = await supabase
      .from('training_plans')
      .select('*')
      .eq('id', planId)
      .single();

    if (planError || !plan) {
      logger.error('[Gold Standard Chat] Plan not found', { planId, error: planError });
      return Response.json(
        createCoachMessage('Sorry, I could not find your training plan.'),
        { headers: corsHeaders }
      );
    }

    if (plan.version !== planVersion) {
      logger.warn('[Gold Standard Chat] Version mismatch', {
        expected: planVersion,
        actual: plan.version
      });
      return Response.json({
        mode: 'version_mismatch',
        message: 'Your plan has been updated. Please refresh and try again.',
        currentVersion: plan.version,
      }, { headers: corsHeaders });
    }

    const timezone = userTimezone || plan.timezone || 'Europe/Paris';
    const resolver = new DateResolver(body.todayISO, timezone);
    const todayISO = resolver.toISODate(resolver.nowInTimezone());

    logger.info('[Gold Standard Chat] Date context', {
      timezone,
      todayISO,
      providedToday: body.todayISO
    });

    if (mode === 'commit') {
      return await handleCommit(body as CommitRequest, plan, supabase, resolver);
    }

    if (mode === 'clarification_response') {
      return await handleClarificationResponse(body, plan, supabase, resolver, todayISO);
    }

    if (!message) {
      return Response.json(
        createCoachMessage('Please send a message.'),
        { headers: corsHeaders }
      );
    }

    if (hasAmbiguousDateReference(message)) {
      const phrases = extractDatePhrases(message);
      const ambiguousPhrase = phrases.find(p => p.isAmbiguous);

      if (ambiguousPhrase) {
        const resolution = resolver.resolveRelativeDay(ambiguousPhrase.phrase);

        if (resolution.isAmbiguous && resolution.options) {
          logger.info('[Gold Standard Chat] Ambiguous date detected', {
            phrase: ambiguousPhrase.phrase,
            options: resolution.options
          });

          const clarificationOptions: ClarificationOption[] = resolution.options.map((opt, idx) => ({
            id: `opt-${idx}`,
            isoDate: opt.isoDate,
            displayDate: opt.displayDate,
            label: opt.label,
          }));

          return Response.json(
            createClarificationRequest(
              resolution.requiresClarification || `Which ${ambiguousPhrase.phrase} did you mean?`,
              clarificationOptions,
              message,
              ambiguousPhrase.phrase
            ),
            { headers: corsHeaders }
          );
        }
      }
    }

    return await handleDraft(message, chatHistory || [], plan, supabase, resolver, todayISO);

  } catch (error) {
    logger.error('[Gold Standard Chat] Error', { error: error.message });
    return Response.json(
      createCoachMessage('Sorry, something went wrong. Please try again.'),
      { status: 500, headers: corsHeaders }
    );
  }
});

async function handleDraft(
  message: string,
  chatHistory: Array<{ role: string; content: string }>,
  plan: any,
  supabase: any,
  resolver: DateResolver,
  todayISO: string
): Promise<Response> {
  logger.info('[Gold Standard Chat] Handling draft', { message, todayISO });

  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiApiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const systemPrompt = buildSystemPrompt(plan, resolver, todayISO);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory,
    { role: 'user', content: message },
  ];

  logger.info('[Gold Standard Chat] Calling OpenAI', { messageCount: messages.length });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages,
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('[Gold Standard Chat] OpenAI error', { status: response.status, error: errorText });
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const result = await response.json();
  const aiMessage = result.choices[0]?.message?.content || '';

  logger.info('[Gold Standard Chat] OpenAI response received', { length: aiMessage.length });

  return Response.json(
    createCoachMessage(aiMessage),
    { headers: corsHeaders }
  );
}

async function handleClarificationResponse(
  body: RequestBody,
  plan: any,
  supabase: any,
  resolver: DateResolver,
  todayISO: string
): Promise<Response> {
  logger.info('[Gold Standard Chat] Handling clarification response', {
    clarificationId: body.clarificationId,
    selectedDate: body.selectedDate
  });

  return Response.json(
    createCoachMessage(`Got it! You selected ${body.selectedDate}. Continuing with your request...`),
    { headers: corsHeaders }
  );
}

async function handleCommit(
  commitRequest: CommitRequest,
  plan: any,
  supabase: any,
  resolver: DateResolver
): Promise<Response> {
  logger.info('[Gold Standard Chat] Handling commit', {
    previewId: commitRequest.previewId,
    workoutCount: commitRequest.confirmedWorkoutIds?.length
  });

  return Response.json({
    mode: 'commit_success',
    message: 'Your plan has been updated successfully!',
    newPlanVersion: plan.version + 1,
  }, { headers: corsHeaders });
}

function buildSystemPrompt(plan: any, resolver: DateResolver, todayISO: string): string {
  const todayDisplay = resolver.formatUKDisplay(todayISO);
  const todayDayName = resolver.getDayName(todayISO);

  return `You are an expert running coach helping someone modify their training plan. Always speak directly to them using "you" and "your".

CRITICAL DATE CONTEXT (Authoritative - Do NOT recalculate):
- Today: ${todayISO} (${todayDayName}, ${todayDisplay})
- Your timezone: ${resolver['timezone']}
- All dates provided are in your timezone

RESPONSE RULES:
1. Be conversational and helpful
2. Speak directly to the runner using "you" and "your" (never "the user")
3. If they ask to modify the plan, acknowledge their request directly
4. DO NOT attempt to calculate dates yourself
5. DO NOT generate patches or modifications (handled separately)
6. Focus on understanding intent and providing coaching advice

Your Plan Details:
- Start Date: ${plan.start_date}
- Race Date: ${plan.race_date || 'Not set'}
- Plan Duration: ${plan.duration_weeks} weeks
- Plan Type: ${plan.plan_type}

Your Current Progress:
- Week: ${Math.floor((new Date(todayISO).getTime() - new Date(plan.start_date).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1}
- Days trained: ${plan.days_trained || 0}

Respond naturally and directly. If they want to modify their plan, acknowledge it and explain what will happen next.`;
}
