import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { validateTips } from "./tip-validator.ts";

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
    recentRaceTime?: string;
    recentRaceDistance?: string;
  };
  startDate?: string;
  startDayOfWeek?: string;
  trainingPaces?: {
    easyPace: string;
    longRunPace: string;
    tempoPace: string;
    intervalPace: string;
    racePace: string;
  } | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { answers, startDate, startDayOfWeek, trainingPaces }: RequestBody = await req.json();

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
    const isIntermediateOrAdvanced = answers.experience?.toLowerCase() === 'intermediate' || answers.experience?.toLowerCase() === 'advanced';
    const effortLabel = isBeginnerPlan ? 'Effort: X-X/10' : 'RPE X-X';

    const hasPaceData = trainingPaces !== null && trainingPaces !== undefined;

    const paceInstructions = hasPaceData && trainingPaces
      ? `\n\nTRAINING PACES - USE THESE IN ALL WORKOUTS:\nEasy/Recovery: ${trainingPaces.easyPace}\nLong Run: ${trainingPaces.longRunPace}\nTempo: ${trainingPaces.tempoPace}\nInterval: ${trainingPaces.intervalPace}\nRace: ${trainingPaces.racePace}\n\nWORKOUT FORMAT RULES:\n1. Use "RPE" never "Rate of Perceived Exertion"\n2. ALWAYS include paces in workout descriptions (except Rest/Active Recovery)\n3. Format: "[workout] at [pace] (RPE X-X)"\n\nEXAMPLES BY WORKOUT TYPE:\nEasy: "Easy 8 km at ${trainingPaces.easyPace} (RPE 2-3)"\nLong: "Long run 16 km at ${trainingPaces.longRunPace} (RPE 4-5)"\nTempo: "6 km tempo at ${trainingPaces.tempoPace} (RPE 6-7)"\nIntervals: "8 x (400m at ${trainingPaces.intervalPace} with 200m jog at ${trainingPaces.easyPace})"\nFartlek: "8 km: 6 x (2min at ${trainingPaces.intervalPace}, 2min at ${trainingPaces.easyPace})"\n`
      : `\n\nNO PACE DATA: Use RPE/Effort levels only (no specific paces).\n`;

    const specificDaysInstructions = answers.availableDays && answers.availableDays.length > 0
      ? `\nSPECIFIC TRAINING DAYS - ABSOLUTE REQUIREMENT:\nThe runner can train ${daysPerWeek} days per week on these EXACT days: ${answers.availableDays.join(', ')}\n\nNON-NEGOTIABLE RULES:\n- You MUST schedule EXACTLY ${daysPerWeek} workouts per week\n- Workouts can ONLY be on: ${answers.availableDays.join(', ')}\n- All ${daysPerWeek} selected days MUST have workouts (NOT rest)\n- All other days MUST be "Rest" or "Active Recovery"\n- DO NOT leave any selected training days as Rest\n- DO NOT schedule workouts on days not in the list\n- Long run should be on ${answers.availableDays.includes('Sun') ? 'Sunday' : answers.availableDays.includes('Sat') ? 'Saturday' : answers.availableDays[answers.availableDays.length - 1]}\n\nEXAMPLE: If the runner selected Monday, Wednesday, Friday, Saturday (4 days), then EVERY WEEK must have workouts on all 4 of these days. The other 3 days (Tue, Thu, Sun) must be Rest.\n`
      : '';

    const couchTo5KInstructions = answers.experience === 'beginner' &&
      (!answers.longestRun || answers.longestRun < 3)
      ? `\nCRITICAL: This runner is COMPLETELY NEW TO RUNNING (couch to 5k level).\n\nDISTANCE CONSTRAINTS FOR COUCH TO 5K:\n- MAXIMUM distance in ANY workout: 5km (this is the GOAL distance, not a starting point)\n- Week 1-2: 20-25 minutes of walk/run intervals (DO NOT specify distance in km)\n- Week 3-4: 25-30 minutes of walk/run intervals (DO NOT specify distance in km)\n- Week 5-6: 30-35 minutes with more running, less walking\n- Week 7-8: First continuous runs of 3-4km maximum\n- Week 9-10: Build to 4-5km continuous running\n- Week 11-12: Maintain 5km, focus on consistency\n- NEVER EVER assign runs longer than 5km in a couch to 5k plan - this is NON-NEGOTIABLE\n\nPROGRESSION GUIDELINES:\n- Start with walk/run intervals (e.g., "Walk/Run: 20min (1min jog at Effort: 3-4/10, 90s walk) x 8")\n- Progress gradually: reduce walking, increase jogging over weeks\n- NEVER assign continuous running until week 6-7\n- NEVER assign speed workouts (intervals, tempo, hills) until week 10+ and only if appropriate\n- First 5-6 weeks should be walk/run combinations only\n- Keep intensity very low (Effort: 2-4/10) for first 8 weeks\n- Focus on TIME on feet, not distance, for the first 6 weeks\n- Use format "Walk/Run: Xmin" not "Walk/Run: Xkm" for early weeks\n\nINTENSITY LIMITS:\n- Weeks 1-8: Effort 2-4/10 only (easy/comfortable)\n- Weeks 9-10: Can introduce Effort 5-6/10 for short portions\n- Week 11+: Can carefully introduce Effort 6-7/10 for brief intervals if appropriate\n- NEVER assign Effort 8-10/10 in a couch to 5k plan\n`
      : '';

    const raceDateInstructions = answers.raceDate
      ? `\nRACE DATE: ${answers.raceDate}\nTOTAL WEEKS: ${numberOfWeeks}\n\nCRITICAL RACE PREPARATION:\nThe plan MUST culminate in the race on ${answers.raceDate}. Structure the final weeks as follows:\n\nFINAL 2 WEEKS (Race Week -1 and Race Week):\n- Week ${numberOfWeeks - 1} (second to last week): Taper begins - reduce volume by 30-40%\n  - Maintain intensity but reduce distance\n  - Include 1 shorter quality session (e.g., "4 km with 3x1km at race pace")\n  - Shorten long run to 60-70% of peak long run distance\n\n- Week ${numberOfWeeks} (race week - FINAL WEEK): Sharp taper - reduce volume by 50-60%\n  - Include 1-2 short easy runs (3-5km at ${isBeginnerPlan ? 'Effort: 2-3/10' : 'RPE 2-3'})\n  - Optional: 1 very short shakeout run (2-3km) 2-3 days before race\n  - Rest or very light activity 1-2 days before race\n  - FINAL DAY (${answers.raceDate}): "RACE DAY: ${answers.raceDistance}"\n\nIMPORTANT: The race day MUST fall on the correct day of the week based on the date ${answers.raceDate}\n` : '';

    const startDayInfo = startDate && startDayOfWeek
      ? `\nPLAN START DATE: ${startDate} (${startDayOfWeek})\nCRITICAL: This plan starts on ${startDayOfWeek}. Week 1 begins on ${startDayOfWeek}, NOT Monday.\n- Structure each week starting from ${startDayOfWeek} through the following week\n- Schedule workouts throughout the entire week cycle, including all selected training days\n- Do NOT leave early weekdays as Rest just because the plan starts later in the week`
      : '';

    const prompt = `\nYou are an experienced running coach creating a structured training plan.\n\nInputs: ${JSON.stringify(processedAnswers)}\n${startDayInfo}\n${specificDaysInstructions}\n${couchTo5KInstructions}\n${raceDateInstructions}\n${paceInstructions}\n\nGenerate a ${numberOfWeeks}-week day-by-day training plan${answers.raceDate ? ` that ends on the race date ${answers.raceDate}` : ''}.\n\n${!isBeginnerPlan ? `\nCRITICAL FORMAT RULE:\nALWAYS use the abbreviation "RPE" - NEVER write out "Rate of Perceived Exertion (RPE)" or "Rate of Perceived Exertion".\n` : ''}\n\n${isBeginnerPlan ? `\nCRITICAL: This is a BEGINNER plan. Use "Effort: X-X/10" format instead of "RPE X-X" in ALL workout descriptions.\nExamples:\n- "Walk/Run: 20min (1min jog, 90s walk) x 8 at Effort: 3-4/10"\n- "Easy: 5 km at Effort: 2-3/10"\n- "Long run: 16 km at Effort: 4-5/10"\n` : ''}\n\nCRITICAL WORKOUT STRUCTURE - NON-NEGOTIABLE:\nEVERY SINGLE workout (except Rest and Active Recovery) MUST include these three parts in the workout description:\n1. **Warm up:** Always start with a warm-up appropriate to the session\n2. **Work:** The main workout portion\n3. **Cool down:** Always end with a cool-down\n\nThis is MANDATORY - NO EXCEPTIONS. If you write a workout without all three sections, it is WRONG.\n\nFormat for structured workouts (each section on a new line):\n"**Warm up:** [details]\n**Work:** [main workout]\n**Cool down:** [details]"\n\nCORRECT Examples (with all three sections):\n- "**Warm up:** 10min easy\n**Work:** 6 x (400m at quick interval pace with 90s jog recovery)\n**Cool down:** 10min easy"\n- "**Warm up:** 15min easy\n**Work:** 5km tempo\n**Cool down:** 10min easy"\n- "**Warm up:** First km easy\n**Work:** Easy run 8km\n**Cool down:** Final km easy"\n- "**Warm up:** First 1-2km easy\n**Work:** Long run 16km\n**Cool down:** Final 1km easy"\n\nWRONG Examples (missing sections - DO NOT DO THIS):\n- "6 x 400m at interval pace" ❌ Missing warm-up and cool-down\n- "Easy run 8km" ❌ Missing warm-up and cool-down\n- "Long run 16km" ❌ Missing warm-up and cool-down\n- "Tempo 5km" ❌ Missing warm-up and cool-down\n\nWORKOUT TYPES:\n- "Rest" - complete rest day\n- "Active Recovery" - light activity like walking 20-30min, yoga, or run-focused strength exercises (NO running)\n\n${isBeginnerPlan ? `\nBEGINNER WORKOUTS (use Effort levels):\n\nFor COMPLETE beginners (cannot run 3km continuously):\n- Walk/Run intervals: "**Warm up:** 5min walk\n**Work:** Walk/Run 20min (1min jog at Effort: 3-4/10, 90s walk) x 8\n**Cool down:** 5min walk"\n\nFor beginners who CAN run continuously:\n- Easy runs: "**Warm up:** First km easy\n**Work:** Easy 5km at Effort: 2-3/10\n**Cool down:** Final km easy"\n- Long runs: "**Warm up:** First km easy\n**Work:** Long run 10km at Effort: 4-5/10\n**Cool down:** Final km easy"\n- Interval workouts: "**Warm up:** 10min easy\n**Work:** 6 x (1min fast at Effort: 7-8/10 with 90s easy jog recovery)\n**Cool down:** 10min easy"\n- Fartlek: "**Warm up:** 10min easy\n**Work:** 6km fartlek (5 x 2min at Effort: 6-7/10 with 2min easy)\n**Cool down:** 10min easy"\n- Tempo: "**Warm up:** 10min easy\n**Work:** 3km tempo at Effort: 6-7/10\n**Cool down:** 10min easy"\n` : ''}\n\n\n\nPLAN STRUCTURE:\n- Each week must include exactly 7 days (Mon-Sun) in the JSON structure for consistency\n- However, understand that Week 1 starts on the actual start day (${startDayOfWeek || 'varies'})\n- CRITICAL: Schedule workouts on ALL the runner's selected training days (${answers.availableDays?.join(', ') || `${daysPerWeek} days per week`}) throughout EVERY week\n- The runner can only train ${daysPerWeek} days per week. Of the non-training days, include 1 "Active Recovery" day and the rest as "Rest"\n- Do NOT skip training days in ANY week just because the plan starts mid-week\n- Base the starting long run distance on the runner's "longest run in the last month"\n- Increase long run by 1-2 km per week, never more than 10%\n- Every 4th week: cutback week (~20-30% volume reduction)\n- Include 1 long run per week (typically Sunday or Saturday)\n\n${isBeginnerPlan ? 'EFFORT LEVEL' : 'RPE'} GUIDANCE ${isBeginnerPlan ? '(Effort Level on 1-10 scale)' : '(Rate of Perceived Effort)'}:\n${hasPaceData ? 'When pace data is available, include BOTH specific paces AND RPE/effort levels for context.' : 'Use only RPE/effort levels since no pace data is available.'}\n- Easy / Recovery runs: ${isBeginnerPlan ? 'Effort: 2-3/10' : 'RPE 2-3'}\n- Long runs: ${isBeginnerPlan ? 'Effort: 4-5/10' : 'RPE 4-5'}\n- Tempo / Progressive runs: ${isBeginnerPlan ? 'Effort: 6-7/10' : 'RPE 6-7'}\n- Intervals / Hills / Fartlek: ${isBeginnerPlan ? 'Effort: 7-9/10' : 'RPE 7-9'}\n- Race day: ${isBeginnerPlan ? 'Effort: 9-10/10' : 'RPE 9-10'}\nCRITICAL: Never assign ${isBeginnerPlan ? 'Effort: 2-3/10' : 'RPE 2-3'} to interval or hill workouts.\n\nDAYS PER WEEK GUIDELINES:\nThe runner trains ${daysPerWeek} days per week. Structure accordingly:\n\nIf daysPerWeek = 3:\n- 1 easy run\n- 1 quality workout (intervals, tempo, or hills)\n- 1 long run\n- 4 rest days\n\nIf daysPerWeek = 4:\n- 2 easy runs\n- 1 quality workout (intervals, tempo, or hills)\n- 1 long run\n- 3 rest days\n\nIf daysPerWeek = 5:\n- 2-3 easy runs\n- 1-2 quality workouts (intervals, tempo, hills, or fartlek)\n- 1 long run\n- 2 rest days\n\nIf daysPerWeek = 6:\n- 3 easy runs (including recovery runs)\n- 2 quality workouts\n- 1 long run\n- 1 rest day\n\nIf daysPerWeek = 7:\n- 3-4 easy runs (including recovery runs)\n- 2 quality workouts\n- 1 long run\n- 0 rest days (or 1 active recovery)\n\nFINAL WEEK (Race Week):\n- Taper: reduce volume by 40-50%\n- Include 1-2 short easy runs\n- 1 short workout with race pace (e.g., \"4 km with 3x1km at race pace\")\n- Rest 1-2 days before race\n- Race day should say \"RACE DAY: [distance]\" (e.g., \"RACE DAY: Marathon\")\n\nCOACHING TIPS - FOLLOW THESE STEPS:\n\nSTEP 1: Identify the workout type and write the Goal line\n- Intervals: \"**Goal:** Strengthen aerobic capacity and increase sustained speed.\"\n- Tempo: \"**Goal:** Improve lactate threshold and your ability to hold faster paces.\"\n- Easy: \"**Goal:** Build aerobic endurance and support recovery from harder sessions.\"\n- Long: \"**Goal:** Increase overall endurance and strengthen fatigue resistance.\"\n- Hills: \"**Goal:** Build leg strength, power and improve running economy uphill.\"\n- Rest: \"**Goal:** Allow your body to recover and adapt to training stress.\"\n\nSTEP 2: Look at what RPE you assigned in the workout description\nIf intervals (RPE 7-9): Write tips about HARD EFFORT\n- \"Focus on quick turnover during the hard efforts\"\n- \"Keep recovery jogs light between intervals\"\n- \"Don't skip the warm-up for hard sessions\"\n\nIf tempo (RPE 6-7): Write tips about COMFORTABLY HARD\n- \"This should feel comfortably hard\"\n- \"Maintain steady breathing rhythm\"\n- \"You can speak a few words but not chat\"\n\nIf easy (RPE 2-3): Write tips about CONVERSATIONAL\n- \"Keep it conversational - you should chat easily\"\n- \"Focus on relaxed form\"\n- \"This should feel comfortable throughout\"\n\nIf long (RPE 4-5): Write tips about ENDURANCE\n- \"Start conservatively and build rhythm\"\n- \"Practice your fueling strategy\"\n- \"Focus on consistent effort\"\n\nCRITICAL ERROR CHECK:\nDO NOT write \"conversational\" or \"easy\" tips for RPE 7-9 intervals\nDO NOT write \"hard\" or \"push\" tips for RPE 2-3 easy runs\nThe tips MUST match the RPE you wrote in the workout\n`;

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

    console.log('=== Validating and fixing coaching tips ===');
    validateTips(planData);

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
