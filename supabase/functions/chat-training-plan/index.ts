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
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { message, chatHistory, planData, planType, answers, currentWeekNumber, planStartDate, todaysDate, completedWorkouts }: RequestBody = await req.json();

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    // Calculate current training week and day based on dates
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

      const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const currentDayName = dayNames[currentTrainingDay - 1];

      dateContext = `

DATE CONTEXT:
- Today's date is: ${todaysDate}
- The training plan started on: ${planStartDate}
- Days since plan start: ${daysSinceStart}
- Based on the start date, today is Week ${currentTrainingWeek}, Day ${currentTrainingDay} (${currentDayName}) of the training plan
- When the user refers to "today" or "what's my next workout", they mean Week ${currentTrainingWeek}, Day ${currentTrainingDay} (${currentDayName})
- When the user refers to days of the week (like "Monday", "Thursday", etc.) without specifying a week, they mean the current week (Week ${currentTrainingWeek})
- The plan structure uses "Week X" with day names (Mon, Tue, Wed, Thu, Fri, Sat, Sun)
`;
    }

    // Process completed workouts
    if (completedWorkouts && completedWorkouts.length > 0) {
      const completedList = completedWorkouts.map(key => {
        const [week, day] = key.split('-');
        return `Week ${week}, ${day}`;
      }).join(', ');

      completedContext = `

COMPLETED WORKOUTS:
The following workouts have been marked as completed by the user:
${completedList}

When suggesting "next workout" or identifying where the user is in their plan, skip these completed workouts and suggest the next uncompleted workout after today's date.
`;
    }

    const weekContext = currentWeekNumber ? `

VIEWING CONTEXT: The user is currently viewing Week ${currentWeekNumber} of their training plan in the interface. However, if they mention "today" or current workouts, refer to the DATE CONTEXT above for the actual current training week.` : '';

    const systemPrompt = planType === 'static'
      ? `You are a running coach assistant. The user has a static training plan and wants to make quick adjustments.

Original runner profile: ${JSON.stringify(answers)}

Current training plan:
${JSON.stringify(planData, null, 2)}${dateContext}${weekContext}${completedContext}

IMPORTANT: You MUST ONLY respond to questions and requests that are directly related to this training plan. If the user asks about anything unrelated to their running training plan (e.g., general knowledge, other topics, recipes, programming, etc.), politely remind them that you can only help with their training plan adjustments and questions about running workouts.

Help them with:
- Swapping rest days
- Adjusting distances slightly
- Moving workouts within the same week
- Answering questions about specific workouts
- Explaining what specific workouts mean and how to perform them
- Clarifying RPE levels and effort zones
- Providing guidance on workout execution and technique
- Answering general running-related questions about training concepts

CRITICAL RPE GUIDANCE:
- RPE 2-3 = Very easy, full conversation possible, recovery/easy runs
- RPE 4-5 = Comfortable, some conversation possible, long runs
- RPE 6-7 = Comfortably hard, short phrases only, tempo runs
- RPE 7-9 = Hard to very hard, few words only, intervals/hills/fartlek
- RPE 9-10 = Maximum effort, race day

When giving advice about workouts, ALWAYS match the RPE to the appropriate effort level. For example:
- Interval sessions at RPE 7-9 should be described as "hard efforts where you can only speak a few words"
- Easy runs at RPE 2-3 should be "very easy where you can hold a full conversation"

When you modify the plan, return the COMPLETE updated plan in the same JSON format. Each day should have:
{ "workout": "workout description", "tips": ["tip 1", "tip 2", "tip 3"] }

RESPONSE FORMAT:
- When you make changes to the plan, start your response with "Your plan has been updated." followed by a brief explanation of what changed.
- Do NOT say "I have updated your plan above" or similar phrases.
- Be clear and direct about what changed.

Always respond with: {"response": "your message", "updatedPlan": {updated plan JSON or null if no changes}}`
      : `You are an adaptive running coach. The user has a responsive training plan that evolves with their needs.

Original runner profile: ${JSON.stringify(answers)}

Current training plan:
${JSON.stringify(planData, null, 2)}${dateContext}${weekContext}${completedContext}

IMPORTANT: You MUST ONLY respond to questions and requests that are directly related to this training plan. If the user asks about anything unrelated to their running training plan (e.g., general knowledge, other topics, recipes, programming, etc.), politely remind them that you can only help with their training plan adjustments and questions about running workouts.

Help them with:
- Major schedule adjustments
- Responding to injuries or setbacks
- Increasing or decreasing volume
- Adding or removing training days
- Adjusting race goals
- Planning around life events
- Explaining what specific workouts mean and how to perform them
- Clarifying RPE levels and effort zones
- Providing guidance on workout execution and technique
- Answering general running-related questions about training concepts

CRITICAL RPE GUIDANCE:
- RPE 2-3 = Very easy, full conversation possible, recovery/easy runs
- RPE 4-5 = Comfortable, some conversation possible, long runs
- RPE 6-7 = Comfortably hard, short phrases only, tempo runs
- RPE 7-9 = Hard to very hard, few words only, intervals/hills/fartlek
- RPE 9-10 = Maximum effort, race day

When giving advice about workouts, ALWAYS match the RPE to the appropriate effort level. For example:
- Interval sessions at RPE 7-9 should be described as "hard efforts where you can only speak a few words"
- Easy runs at RPE 2-3 should be "very easy where you can hold a full conversation"

When you modify the plan, return the COMPLETE updated plan in the same JSON format. Each day should have:
{ "workout": "workout description", "tips": ["tip 1", "tip 2", "tip 3"] }

RESPONSE FORMAT:
- When you make changes to the plan, start your response with "Your plan has been updated." followed by a brief explanation of what changed.
- Do NOT say "I have updated your plan above" or similar phrases.
- Be clear and direct about what changed.

Always respond with: {"response": "your message", "updatedPlan": {updated plan JSON or null if no changes}}`;

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
        model: "gpt-4o-mini",
        messages,
        response_format: { type: "json_object" }
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorText}`);
    }

    const data = await openaiResponse.json();
    const content = JSON.parse(data.choices[0].message.content);

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