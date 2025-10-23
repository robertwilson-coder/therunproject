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
  startDate?: string;
  startDayOfWeek?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { answers, startDate, startDayOfWeek }: RequestBody = await req.json();

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const daysPerWeek = answers.availableDays?.length || answers.daysPerWeek || 3;

    let numberOfWeeks = answers.planWeeks || 12;

    if (answers.raceDate) {
      const today = new Date();
      const raceDate = new Date(answers.raceDate);
      const diffTime = raceDate.getTime() - today.getTime();
      const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
      numberOfWeeks = Math.max(4, Math.min(20, diffWeeks));
    }

    const processedAnswers = { ...answers, daysPerWeek, numberOfWeeks };

    const isBeginnerPlan = answers.experience?.toLowerCase() === 'beginner';
    const effortLabel = isBeginnerPlan ? 'Effort: X-X/10' : 'RPE X-X';

    const specificDaysInstructions = answers.availableDays && answers.availableDays.length > 0
      ? `
SPECIFIC TRAINING DAYS:
CRITICAL: The runner can ONLY train on these specific days: ${answers.availableDays.join(', ')}
- Workouts MUST be scheduled ONLY on: ${answers.availableDays.join(', ')}
- All other days MUST be "Rest" or "Active Recovery"
- Do NOT schedule workouts on days not in this list
- Long run should be on ${answers.availableDays.includes('Sun') ? 'Sunday' : answers.availableDays.includes('Sat') ? 'Saturday' : answers.availableDays[answers.availableDays.length - 1]}
`
      : '';

    const couchTo5KInstructions = answers.experience === 'beginner' &&
      (!answers.longestRun || answers.longestRun < 3)
      ? `
CRITICAL: This runner is NEW TO RUNNING (couch to 5k level).
- Start with walk/run intervals (e.g., "Walk/Run: 20min (1min jog, 90s walk) x 8 at Effort: 3-4/10")
- Progress gradually: reduce walking, increase jogging over weeks
- NEVER assign continuous running until week 4-5
- Build up to continuous 3-5km runs by week 8-10
- First 3-4 weeks should be mostly walk/run combinations
- Keep intensity very low (Effort: 2-4/10) for first 6 weeks
`
      : '';

    const raceDateInstructions = answers.raceDate
      ? `
RACE DATE: ${answers.raceDate}
TOTAL WEEKS: ${numberOfWeeks}

CRITICAL RACE PREPARATION:
The plan MUST culminate in the race on ${answers.raceDate}. Structure the final weeks as follows:

FINAL 2 WEEKS (Race Week -1 and Race Week):
- Week ${numberOfWeeks - 1} (second to last week): Taper begins - reduce volume by 30-40%
  - Maintain intensity but reduce distance
  - Include 1 shorter quality session (e.g., "4 km with 3x1km at race pace")
  - Shorten long run to 60-70% of peak long run distance

- Week ${numberOfWeeks} (race week - FINAL WEEK): Sharp taper - reduce volume by 50-60%
  - Include 1-2 short easy runs (3-5km at ${isBeginnerPlan ? 'Effort: 2-3/10' : 'RPE 2-3'})
  - Optional: 1 very short shakeout run (2-3km) 2-3 days before race
  - Rest or very light activity 1-2 days before race
  - FINAL DAY (${answers.raceDate}): "RACE DAY: ${answers.raceDistance}"

IMPORTANT: The race day MUST fall on the correct day of the week based on the date ${answers.raceDate}
` : '';

    const startDayInfo = startDate && startDayOfWeek
      ? `
PLAN START DATE: ${startDate} (${startDayOfWeek})
CRITICAL: This plan starts on ${startDayOfWeek}. Week 1 begins on ${startDayOfWeek}, NOT Monday.
- Structure each week starting from ${startDayOfWeek} through the following week
- Schedule workouts throughout the entire week cycle, including all selected training days
- Do NOT leave early weekdays as Rest just because the plan starts later in the week`
      : '';

    const prompt = `
You are an experienced running coach creating a structured training plan.

Inputs: ${JSON.stringify(processedAnswers)}
${startDayInfo}
${specificDaysInstructions}
${couchTo5KInstructions}
${raceDateInstructions}

Generate a ${numberOfWeeks}-week day-by-day training plan${answers.raceDate ? ` that ends on the race date ${answers.raceDate}` : ''}.

${isBeginnerPlan ? `
CRITICAL: This is a BEGINNER plan. Use "Effort: X-X/10" format instead of "RPE X-X" in ALL workout descriptions.
Examples:
- "Walk/Run: 20min (1min jog, 90s walk) x 8 at Effort: 3-4/10"
- "Easy: 5 km at Effort: 2-3/10"
- "Long run: 16 km at Effort: 4-5/10"
` : ''}

WORKOUT TYPES (use these detailed formats):
- "Rest" - complete rest day
- "Active Recovery" - light activity like walking 20-30min, yoga, or run-focused strength exercises (NO running)
- "Walk/Run: Xmin (Xmin jog, Xmin walk) x N at ${effortLabel}" - for beginners alternating walk and jog (e.g., "Walk/Run: 20min (1min jog, 90s walk) x 8 at ${isBeginnerPlan ? 'Effort: 3-4/10' : 'RPE 3-4'}")
- "Easy: X km at ${effortLabel}" - easy conversational pace (e.g., "Easy: 5 km at ${isBeginnerPlan ? 'Effort: 2-3/10' : 'RPE 2-3'}")
- "Tempo: X km at ${effortLabel}" - comfortably hard pace (e.g., "Tempo: 6 km at ${isBeginnerPlan ? 'Effort: 6-7/10' : 'RPE 6-7'}")
- "Intervals: N x (Distance at ${effortLabel} with ZZs recovery)" - detailed speed work (e.g., "Intervals: 6 x (400m at ${isBeginnerPlan ? 'Effort: 7-9/10' : 'RPE 7-9'} with 90s jog recovery)", "Intervals: 4 x (1km at ${isBeginnerPlan ? 'Effort: 8/10' : 'RPE 8'} with 2min recovery)")
- "Hill reps: N x (Xmin at ${effortLabel} with recovery)" - uphill efforts (e.g., "Hill reps: 8 x (90s at ${isBeginnerPlan ? 'Effort: 8-9/10' : 'RPE 8-9'} with jog down recovery)")
- "Fartlek: X km total with N x (Xmin at ${effortLabel} with Xmin easy)" - varied pace with details (e.g., "Fartlek: 8km total with 5 x (2min at ${isBeginnerPlan ? 'Effort: 7-8/10' : 'RPE 7-8'} with 2min easy)")
- "Long run: X km at ${effortLabel}" - weekly long run (e.g., "Long run: 16 km at ${isBeginnerPlan ? 'Effort: 4-5/10' : 'RPE 4-5'}")
- "Progressive: X km starting ${isBeginnerPlan ? 'Effort: 3/10' : 'RPE 3'} finishing ${isBeginnerPlan ? 'Effort: 6/10' : 'RPE 6'}" - build effort (e.g., "Progressive: 10 km starting ${isBeginnerPlan ? 'Effort: 3/10' : 'RPE 3'} finishing ${isBeginnerPlan ? 'Effort: 6/10' : 'RPE 6'}")
- "Recovery: X km at ${effortLabel}" - very easy recovery (e.g., "Recovery: 4 km at ${isBeginnerPlan ? 'Effort: 2-3/10' : 'RPE 2-3'}")

PLAN STRUCTURE:
- Each week must include exactly 7 days (Mon–Sun) in the JSON structure for consistency
- However, understand that Week 1 starts on the actual start day (${startDayOfWeek || 'varies'})
- CRITICAL: Schedule workouts on ALL the runner's selected training days (${answers.availableDays?.join(', ') || `${daysPerWeek} days per week`}) throughout EVERY week
- The runner can only train ${daysPerWeek} days per week. Of the non-training days, include 1 "Active Recovery" day and the rest as "Rest"
- Do NOT skip training days in ANY week just because the plan starts mid-week
- Base the starting long run distance on the runner's "longest run in the last month"
- Increase long run by 1–2 km per week, never more than 10%
- Every 4th week: cutback week (~20-30% volume reduction)
- Include 1 long run per week (typically Sunday or Saturday)

${isBeginnerPlan ? 'EFFORT LEVEL' : 'RPE'} GUIDANCE ${isBeginnerPlan ? '(Effort Level on 1-10 scale)' : '(Rate of Perceived Effort)'}:
CRITICAL: DO NOT include specific pace targets (e.g., "5:30/km") in workouts. ONLY use ${isBeginnerPlan ? 'effort levels' : 'RPE'} and distance/time.
- Easy / Recovery runs: ${isBeginnerPlan ? 'Effort: 2–3/10' : 'RPE 2–3'}
- Long runs: ${isBeginnerPlan ? 'Effort: 4–5/10' : 'RPE 4–5'}
- Tempo / Progressive runs: ${isBeginnerPlan ? 'Effort: 6–7/10' : 'RPE 6–7'}
- Intervals / Hills / Fartlek: ${isBeginnerPlan ? 'Effort: 7–9/10' : 'RPE 7–9'}
- Race day: ${isBeginnerPlan ? 'Effort: 9–10/10' : 'RPE 9–10'}
CRITICAL: Never assign ${isBeginnerPlan ? 'Effort: 2–3/10' : 'RPE 2–3'} to interval or hill workouts.

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
        max_tokens: 16000,
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
    console.log('OpenAI response data:', JSON.stringify(data, null, 2));

    const content = data.choices[0].message.content;
    console.log('Content string (first 500 chars):', content?.substring(0, 500));
    console.log('Content string (last 500 chars):', content?.substring(content.length - 500));

    let planData;
    try {
      planData = JSON.parse(content);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.error('Content that failed to parse:', content);
      throw new Error(`Failed to parse OpenAI response: ${parseError.message}`);
    }

    // Validate and fix week numbers to ensure they're sequential starting from 1
    if (planData.plan && Array.isArray(planData.plan)) {
      planData.plan.forEach((week: any, index: number) => {
        const expectedWeekNumber = index + 1;
        if (week.week !== expectedWeekNumber) {
          console.log(`Correcting week number: was ${week.week}, should be ${expectedWeekNumber}`);
          week.week = expectedWeekNumber;
        }
      });
      console.log('Week numbers after validation:', planData.plan.map((w: any) => w.week));
    }

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
