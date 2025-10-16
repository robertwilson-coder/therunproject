import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  answers: {
    experience?: string;
    raceDistance?: string;
    raceDate?: string;
    planWeeks?: number;
    longestRun?: number;
    currentWeeklyKm?: string;
    availableDays?: string[];
    daysPerWeek?: number;
    injuries?: string;
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { answers }: RequestBody = await req.json();

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const daysPerWeek = answers.availableDays?.length || answers.daysPerWeek || 3;

    const numberOfWeeks = answers.planWeeks || 12;

    const processedAnswers = { ...answers, daysPerWeek, numberOfWeeks };

    const prompt = `
You are an experienced running coach creating a structured training plan.

Inputs: ${JSON.stringify(processedAnswers)}

Generate a ${numberOfWeeks}-week day-by-day training plan that ends on the race date (if provided).

WORKOUT TYPES (use these detailed formats):
- "Rest" - complete rest day
- "Active Recovery" - light activity like walking 20-30min, yoga, or run-focused strength exercises (NO running)
- "Easy: X km at RPE 2-3" - easy conversational pace (e.g., "Easy: 5 km at RPE 2-3")
- "Tempo: X km at RPE 6-7" - comfortably hard pace (e.g., "Tempo: 6 km at RPE 6-7")
- "Intervals: N x (Distance at RPE 7-9 with ZZs recovery)" - detailed speed work (e.g., "Intervals: 6 x (400m at RPE 7-9 with 90s jog recovery)", "Intervals: 4 x (1km at RPE 8 with 2min recovery)")
- "Hill reps: N x (Xmin at RPE 8-9 with recovery)" - uphill efforts (e.g., "Hill reps: 8 x (90s at RPE 8-9 with jog down recovery)")
- "Fartlek: X km total with N x (Xmin at RPE 7-8 with Xmin easy)" - varied pace with details (e.g., "Fartlek: 8km total with 5 x (2min at RPE 7-8 with 2min easy)")
- "Long run: X km at RPE 4-5" - weekly long run (e.g., "Long run: 16 km at RPE 4-5")
- "Progressive: X km starting RPE 3 finishing RPE 6" - build effort (e.g., "Progressive: 10 km starting RPE 3 finishing RPE 6")
- "Recovery: X km at RPE 2-3" - very easy recovery (e.g., "Recovery: 4 km at RPE 2-3")

PLAN STRUCTURE:
- Each week must include exactly 7 days (Mon–Sun)
- CRITICAL: The runner can only train ${daysPerWeek} days per week. Of the non-training days, include 1 "Active Recovery" day and the rest as "Rest"
- Base the starting long run distance on the runner's "longest run in the last month"
- Increase long run by 1–2 km per week, never more than 10%
- Every 4th week: cutback week (~20-30% volume reduction)
- Include 1 long run per week (typically Sunday or Saturday)

RPE GUIDANCE (Rate of Perceived Effort):
CRITICAL: DO NOT include specific pace targets (e.g., "5:30/km") in workouts. ONLY use RPE and distance/time.
- Easy / Recovery runs: RPE 2–3
- Long runs: RPE 4–5
- Tempo / Progressive runs: RPE 6–7
- Intervals / Hills / Fartlek: RPE 7–9
- Race day: RPE 9–10
CRITICAL: Never assign RPE 2–3 to interval or hill workouts.

DAYS PER WEEK GUIDELINES:
The runner trains ${daysPerWeek} days per week. Structure accordingly:

If daysPerWeek = 3:
- 1 easy run
- 1 quality workout (intervals, tempo, or hills)
- 1 long run
- 4 rest days

If daysPerWeek = 4:
- 2 easy runs
- 1 quality workout (intervals, tempo, or hills)
- 1 long run
- 3 rest days

If daysPerWeek = 5:
- 2-3 easy runs
- 1-2 quality workouts (intervals, tempo, hills, or fartlek)
- 1 long run
- 2 rest days

If daysPerWeek = 6:
- 3 easy runs (including recovery runs)
- 2 quality workouts
- 1 long run
- 1 rest day

If daysPerWeek = 7:
- 3-4 easy runs (including recovery runs)
- 2 quality workouts
- 1 long run
- 0 rest days (or 1 active recovery)

FINAL WEEK (Race Week):
- Taper: reduce volume by 40-50%
- Include 1-2 short easy runs
- 1 short workout with race pace (e.g., "4 km with 3×1km at race pace")
- Rest 1-2 days before race
- Race day should say "RACE DAY: [distance]" (e.g., "RACE DAY: Marathon")

COACHING TIPS:
For each workout, provide 3-4 specific coaching tips that are tailored to that exact workout. These should be actionable, specific guidance related to the workout type, distance, and intensity. Be concrete and avoid generic advice.

Examples:
- For "Intervals: 6 x (400m at RPE 7-9 with 90s jog recovery)": tips about pacing the 400m, recovery jog technique, form focus for short intervals
- For "Long run: 16 km at RPE 4-5": tips about starting pace, hydration for this distance, mental strategies for 16km
- For "Tempo: 6 km at RPE 6-7": tips about warm-up for tempo, maintaining steady effort over 6km, breathing rhythm
`;

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "running_plan",
            strict: true,
            schema: {
              type: "object",
              properties: {
                plan: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      week: { type: "integer" },
                      days: {
                        type: "object",
                        properties: {
                          Mon: {
                            type: "object",
                            properties: {
                              workout: { type: "string" },
                              tips: {
                                type: "array",
                                items: { type: "string" }
                              }
                            },
                            required: ["workout", "tips"],
                            additionalProperties: false
                          },
                          Tue: {
                            type: "object",
                            properties: {
                              workout: { type: "string" },
                              tips: {
                                type: "array",
                                items: { type: "string" }
                              }
                            },
                            required: ["workout", "tips"],
                            additionalProperties: false
                          },
                          Wed: {
                            type: "object",
                            properties: {
                              workout: { type: "string" },
                              tips: {
                                type: "array",
                                items: { type: "string" }
                              }
                            },
                            required: ["workout", "tips"],
                            additionalProperties: false
                          },
                          Thu: {
                            type: "object",
                            properties: {
                              workout: { type: "string" },
                              tips: {
                                type: "array",
                                items: { type: "string" }
                              }
                            },
                            required: ["workout", "tips"],
                            additionalProperties: false
                          },
                          Fri: {
                            type: "object",
                            properties: {
                              workout: { type: "string" },
                              tips: {
                                type: "array",
                                items: { type: "string" }
                              }
                            },
                            required: ["workout", "tips"],
                            additionalProperties: false
                          },
                          Sat: {
                            type: "object",
                            properties: {
                              workout: { type: "string" },
                              tips: {
                                type: "array",
                                items: { type: "string" }
                              }
                            },
                            required: ["workout", "tips"],
                            additionalProperties: false
                          },
                          Sun: {
                            type: "object",
                            properties: {
                              workout: { type: "string" },
                              tips: {
                                type: "array",
                                items: { type: "string" }
                              }
                            },
                            required: ["workout", "tips"],
                            additionalProperties: false
                          }
                        },
                        required: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
                        additionalProperties: false
                      }
                    },
                    required: ["week", "days"],
                    additionalProperties: false
                  }
                }
              },
              required: ["plan"],
              additionalProperties: false
            }
          }
        }
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorText}`);
    }

    const data = await openaiResponse.json();
    const content = data.choices[0].message.content;
    const planData = JSON.parse(content);

    return new Response(JSON.stringify(planData), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.error("Error generating plan:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Plan generation failed" }),
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
