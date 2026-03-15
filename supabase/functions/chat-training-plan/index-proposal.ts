import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { logger } from '../_shared/logger.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface RequestBody {
  message: string;
  chatHistory: ChatMessage[];
  planData: any;
  planId: string;
  planType: 'static' | 'responsive';
  answers: any;
  currentWeekNumber?: number;
  planStartDate?: string;
  todaysDate?: string;
  completedWorkouts?: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader }
      }
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error("Unauthorized");
    }

    const {
      message,
      chatHistory,
      planData,
      planId,
      planType,
      answers,
      currentWeekNumber,
      planStartDate,
      todaysDate,
      completedWorkouts
    }: RequestBody = await req.json();

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    let dateContext = '';
    let completedContext = '';

    if (planStartDate && todaysDate) {
      const today = new Date(todaysDate + 'T00:00:00');
      const todayDayOfWeek = today.getDay();
      const todayDayIndex = todayDayOfWeek === 0 ? 6 : todayDayOfWeek - 1;
      const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const currentDayName = dayNames[todayDayIndex];

      dateContext = `\nCURRENT DATE: ${todaysDate} (${currentDayName})`;
    }

    if (completedWorkouts && completedWorkouts.length > 0) {
      const completedList = completedWorkouts.map(key => {
        const [week, day] = key.split('-');
        return `W${week}-${day}`;
      }).join(', ');

      completedContext = `\nCOMPLETED WORKOUTS (IMMUTABLE): ${completedList}`;
    }

    const isBeginnerPlan = answers?.experience?.toLowerCase() === 'beginner';

    const limitedChatHistory = chatHistory.slice(-10);

    const systemPrompt = `You are a running coach assistant. Your role is to understand the athlete's request and classify their intent.

CRITICAL: You do NOT select dates or generate patches. You only identify WHAT the athlete wants and WHICH workouts they're referring to using natural language.

INPUTS:
- Current date: ${todaysDate}
- Plan start date: ${planStartDate}
- Completed workouts: ${completedWorkouts?.join(', ') || 'none'}
- Athlete profile: ${JSON.stringify(answers)}

YOUR TASK:
1. Understand the athlete's request
2. Identify the INTENT (delete, move, modify, reinstate, info)
3. Extract REFERENCE PHRASES they used (e.g., "Tuesday", "next week", "my long run")
4. Provide a warm coach explanation

DO NOT:
- Select specific dates
- Generate patches
- Make assumptions about which Tuesday/weekend/etc.

EXAMPLE:
User: "Delete my Tuesday workout"
Your response:
{
  "intent": "delete",
  "reference_phrases": ["Tuesday"],
  "coach_explanation": "I understand you want to cancel your Tuesday workout. Let me confirm which date you mean.",
  "requires_modification": true
}

EXAMPLE:
User: "What's my next long run?"
Your response:
{
  "intent": "info",
  "reference_phrases": ["next long run"],
  "coach_explanation": "Let me check your upcoming long runs for you.",
  "requires_modification": false
}

OUTPUT FORMAT (JSON only):
{
  "intent": "delete" | "move" | "modify" | "reinstate" | "swap" | "reduce" | "info",
  "reference_phrases": ["phrase1", "phrase2"],
  "coach_explanation": "string",
  "requires_modification": boolean,
  "secondary_references": ["phrase"] (optional, for move/swap operations)
}

CONTEXT:
${dateContext}
${completedContext}

Respond with JSON only.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...limitedChatHistory,
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
        max_tokens: 2000,
        temperature: 0.3
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorText}`);
    }

    const data = await openaiResponse.json();
    const content = JSON.parse(data.choices[0].message.content);

    logger.info('[ProposalMode] LLM classified intent:', content.intent);
    logger.info('[ProposalMode] Reference phrases:', content.reference_phrases);

    if (!content.requires_modification) {
      return new Response(JSON.stringify({
        response: content.coach_explanation,
        requires_modification: false
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: proposal, error: proposalError } = await supabase
      .from('plan_edit_proposals')
      .insert({
        training_plan_id: planId,
        user_id: user.id,
        intent: content.intent,
        reference_phrases: content.reference_phrases || [],
        llm_explanation: content.coach_explanation,
        raw_llm_response: content,
        status: 'pending_resolution'
      })
      .select()
      .single();

    if (proposalError) {
      logger.error('[ProposalMode] Failed to create proposal:', proposalError);
      throw proposalError;
    }

    logger.info('[ProposalMode] Created proposal:', proposal.id);

    return new Response(JSON.stringify({
      response: content.coach_explanation,
      requires_modification: true,
      proposal_id: proposal.id,
      intent: content.intent,
      reference_phrases: content.reference_phrases,
      secondary_references: content.secondary_references
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    logger.error("Error in chat:", err);
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
