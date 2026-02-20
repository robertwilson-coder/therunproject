import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { validateTips } from "./tip-validator.ts";
import { buildCoreTrainingGuidance, buildPaceInstructions, buildWorkoutStructureRules, buildSpecificDaysInstructions, REST_DAY_RULES, buildTaperProtocol } from '../_shared/promptBuilder.ts';

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

// Helper to generate date list
function generateDateList(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

// Helper to get day name from date
function getDayName(dateStr: string): string {
  const date = new Date(dateStr);
  const dayIndex = date.getDay();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[dayIndex];
}

// Helper to convert day-based response to week structure for backward compatibility
function convertDaysToWeeks(days: any[], startDate: string) {
  const weeks: any[] = [];
  const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Group days by week
  let currentWeek: any = { week: 1, days: {} };
  const startDateObj = new Date(startDate);
  const startDayOfWeek = startDateObj.getDay();
  const startDayIndex = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1; // Convert to Mon=0, Sun=6

  days.forEach((day, index) => {
    const dayDate = new Date(day.date);
    const dayOfWeek = dayDate.getDay();
    const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const dayName = dayOrder[dayIndex];

    // Calculate which week this day belongs to
    const daysFromStart = Math.floor((dayDate.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24));
    const weekNumber = Math.floor(daysFromStart / 7) + 1;

    // Create new week if needed
    if (!currentWeek || currentWeek.week !== weekNumber) {
      if (currentWeek && Object.keys(currentWeek.days).length > 0) {
        weeks.push(currentWeek);
      }
      currentWeek = { week: weekNumber, days: {} };
    }

    currentWeek.days[dayName] = {
      workout: day.workout,
      tips: day.tips,
      date: day.date,
      workoutType: day.workoutType,
      calibrationTag: day.calibrationTag
    };
  });

  // Push the last week
  if (currentWeek && Object.keys(currentWeek.days).length > 0) {
    weeks.push(currentWeek);
  }

  return weeks;
}

// Helper to deterministically insert calibration workout in Week 1
function insertCalibrationWorkoutDeterministic(days: any[], startDate: string, availableDays: string[], raceDistance: string | undefined) {
  if (!raceDistance) return;

  console.log('Inserting calibration workout deterministically for race distance:', raceDistance);

  // Determine calibration workout format based on race distance
  const normalizedDistance = raceDistance.toLowerCase();
  let calibrationWorkout = '';
  let testType = 'MARATHON';

  if (normalizedDistance.includes('5k') || normalizedDistance.includes('10k')) {
    testType = normalizedDistance.includes('5k') ? '5K' : '10K';
    calibrationWorkout = `**Warm up:** 10–15 min easy (RPE 2–3)\n**Work:** 15 min continuous at controlled hard effort (RPE ~8)\n**Cool down:** 10 min easy\n\nThis calibration test will help determine your optimal training paces. Run at a steady, controlled hard effort for the 15-minute work segment. Avoid sprinting or surging - aim for even pacing throughout.`;
  } else if (normalizedDistance.includes('half')) {
    testType = 'HM';
    calibrationWorkout = `**Warm up:** 10–15 min easy\n**Work:** 30 min continuous steady progression (RPE 5 → 7)\n**Cool down:** 10 min easy\n\nThis calibration test will help determine your optimal training paces. Start at a comfortable pace (RPE 5) and gradually build to comfortably hard (RPE 7) by the end. No sharp surges - keep the effort progression smooth and controlled.`;
  } else if (normalizedDistance.includes('ultra')) {
    testType = 'ULTRA';
    calibrationWorkout = `**Warm up:** 10 min easy\n**Work:** 60–120 min easy continuous (RPE 2–3)\n**Cool down:** 5–10 min easy\n\nThis calibration assessment helps us understand your aerobic endurance. Run at a genuinely easy, conversational pace throughout. The goal is time on feet, not intensity.`;
  } else {
    testType = 'MARATHON';
    calibrationWorkout = `**Warm up:** 10–15 min easy\n**Work:** 20 min continuous controlled hard effort (RPE ~7.5–8)\n**Cool down:** 10 min easy\n\nThis calibration test will help determine your optimal training paces. Run at a controlled hard effort for the 20-minute work segment. Aim for steady, even pacing - not a race effort, but a strong sustained push.`;
  }

  // Find Week 1 training days (first 7 days)
  const start = new Date(startDate);
  const weekOneEnd = new Date(start);
  weekOneEnd.setDate(start.getDate() + 6);
  weekOneEnd.setHours(23, 59, 59, 999);

  // Convert available days to day-of-week indices for finding earliest
  const dayNameToDOW: Record<string, number> = {
    'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6
  };

  // Find earliest training day in Week 1
  let earliestTrainingDay: any = null;
  let earliestDate: Date | null = null;

  for (const day of days) {
    const dayDate = new Date(day.date);
    if (dayDate >= start && dayDate <= weekOneEnd) {
      const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayDate.getDay()];

      // Check if this is a training day
      if (availableDays.includes(dayOfWeek)) {
        if (!earliestDate || dayDate < earliestDate) {
          earliestDate = dayDate;
          earliestTrainingDay = day;
        }
      }
    }
  }

  if (!earliestTrainingDay) {
    console.error('No training day found in Week 1 for calibration workout');
    return;
  }

  // Replace that workout with calibration
  earliestTrainingDay.workout = calibrationWorkout;
  earliestTrainingDay.tips = [
    'Record data from the work segment only - exclude warm-up and cool-down',
    'Aim for even pacing throughout the effort - avoid starting too fast',
    'Choose a flat course if possible to get accurate baseline data',
    'Use a GPS watch or app to track distance, pace, and heart rate',
    'After completing, you will be prompted to enter your test results'
  ];

  // Tag with metadata
  earliestTrainingDay.workoutType = 'calibration';
  earliestTrainingDay.calibrationTag = {
    kind: 'calibration',
    testType: testType
  };

  console.log(`Calibration workout inserted on ${earliestTrainingDay.date} (DOW: ${new Date(earliestTrainingDay.date).getDay()})`);
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

    // CRITICAL: Determine generation mode
    const isDateDrivenPlan = !!(startDate && answers.raceDate);
    const planStartDate = startDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let numberOfWeeks = answers.planWeeks || 12;
    let dateList: string[] = [];
    let numberOfDays = 0;

    if (isDateDrivenPlan) {
      // MODE A: Date-driven (day-based generation)
      const start = new Date(planStartDate);
      const raceDate = new Date(answers.raceDate!);

      // Calculate exact number of days
      const diffTime = raceDate.getTime() - start.getTime();
      numberOfDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include race day

      // Generate complete date list
      dateList = generateDateList(planStartDate, answers.raceDate!);

      // Calculate weeks for context (but don't use for generation)
      numberOfWeeks = Math.ceil(numberOfDays / 7);

      console.log(`DATE-DRIVEN MODE: ${numberOfDays} days from ${planStartDate} to ${answers.raceDate}`);
    } else {
      // MODE B: Duration-driven (week-based generation)
      if (answers.raceDate) {
        const today = new Date();
        const raceDate = new Date(answers.raceDate);
        const diffTime = raceDate.getTime() - today.getTime();
        const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
        numberOfWeeks = Math.max(4, Math.min(20, diffWeeks));
      }
      numberOfDays = numberOfWeeks * 7;

      console.log(`WEEK-DRIVEN MODE: ${numberOfWeeks} weeks`);
    }

    const processedAnswers = { ...answers, daysPerWeek, numberOfWeeks, numberOfDays };

    const isBeginnerPlan = answers.experience?.toLowerCase() === 'beginner';
    const hasPaceData = trainingPaces !== null && trainingPaces !== undefined;

    const coreGuidance = buildCoreTrainingGuidance({
      totalWeeks: numberOfWeeks,
      totalDays: numberOfDays,
      raceDistance: answers.raceDistance || 'Unknown',
      longestRun: answers.longestRun || 0,
      currentWeeklyKm: answers.currentWeeklyKm || 'unknown',
      experience: answers.experience || 'Not specified',
      availableDays: answers.availableDays || [],
      daysPerWeek,
      isBeginnerPlan,
      hasPaceData,
      includeCalibrationRun: answers.includeCalibrationRun || false,
      trainingPaces
    });

    const paceInstructions = buildPaceInstructions(hasPaceData, trainingPaces, isBeginnerPlan);
    const specificDaysInstructions = buildSpecificDaysInstructions(answers.availableDays || [], daysPerWeek);
    const workoutRules = buildWorkoutStructureRules(isBeginnerPlan);
    const taperProtocol = buildTaperProtocol(numberOfWeeks, answers.raceDistance || 'Unknown');

    let raceDateInstructions = '';
    if (answers.raceDate) {
      const raceDate = new Date(answers.raceDate);
      const raceDayOfWeek = raceDate.toLocaleDateString('en-US', { weekday: 'long' });
      const raceDateFormatted = raceDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      if (isDateDrivenPlan) {
        raceDateInstructions = `\nRACE DATE: ${raceDateFormatted} (${raceDayOfWeek})\nTOTAL DAYS: ${numberOfDays}\n\nCRITICAL RACE PREPARATION:\nThe plan MUST end EXACTLY on ${raceDateFormatted}. This is a DAY-BY-DAY plan.\n\n⚠️ MANDATORY 14-DAY TAPER PERIOD - NON-NEGOTIABLE ⚠️\nProper tapering is ESSENTIAL for race day performance. You MUST include a full 2-week taper:\n\n📅 WEEK 1 OF TAPER (Days ${numberOfDays - 14} to ${numberOfDays - 8}):\n- Reduce total weekly volume by 30-40% compared to peak week\n- Maintain frequency: Keep same number of run days as peak training weeks\n- Keep intensity but shorten total hard volume by 40-50%\n- Include 1 quality session (marathon pace or threshold, shorter reps)\n  Example: "5 km with 2x1km at ${trainingPaces?.racePace || 'race pace'}" or "8 km with 3 km at ${trainingPaces?.tempoPace || 'tempo pace'}"\n- Reduce long run to 60-70% of peak long run distance\n- Optional: Include final 5-8 km at marathon pace if already practiced in training\n- All other runs should be easy/recovery pace at shorter distances\n\n📅 RACE WEEK (Days ${numberOfDays - 7} to ${numberOfDays - 1}):\n- Reduce total weekly volume by 60-70% compared to peak week\n- Run 4-6 days total (mostly short, easy runs)\n- Include 1 short sharpening session early in the week (Monday-Wednesday)\n  Example: "6 km with 2-3x1km at ${trainingPaces?.racePace || 'marathon pace'} or ${trainingPaces?.tempoPace || 'threshold pace'} with 2 min recovery"\n- Add strides (4-6 x 15-20 seconds) to 2 easy runs during the week\n  Example: "Easy 5 km at ${trainingPaces?.easyPace || 'easy pace'} + 6x20s strides"\n- Optional shakeout run 1 day before race: 10-15 minutes easy + strides\n- Maximum 1 full rest day before race (not mandatory - light activity is fine)\n- Focus on feeling fresh, sharp, and recovered\n\n🏁 Day ${numberOfDays} (${raceDateFormatted}): "RACE DAY: ${answers.raceDistance}"\n\nABSOLUTE REQUIREMENT: The final workout MUST be the race on ${raceDateFormatted}. Do NOT generate workouts after this date.\n\n❌ COMMON TAPER MISTAKES TO AVOID:\n- DO NOT maintain high volume through the taper\n- DO NOT include multiple hard workouts in race week\n- DO NOT skip the taper period\n- DO NOT make the taper too short (it MUST be 14 days)\n- DO NOT reduce frequency too much in week 1 of taper\n`;
      } else {
        raceDateInstructions = `\nRACE DATE: ${raceDateFormatted} (${raceDayOfWeek})\nTOTAL WEEKS: ${numberOfWeeks}\n\nCRITICAL RACE PREPARATION:\nThe plan MUST culminate in the race on ${raceDayOfWeek}, ${raceDateFormatted}. Structure the final weeks as follows:\n\nFINAL 2 WEEKS (Race Week -1 and Race Week):\n- Week ${numberOfWeeks - 1} (second to last week): Taper begins - reduce volume by 30-40%\n  - Maintain intensity but reduce distance\n  - Include 1 shorter quality session (e.g., "4 km with 3x1km at race pace")\n  - Shorten long run to 60-70% of peak long run distance\n\n- Week ${numberOfWeeks} (race week - FINAL WEEK): Sharp taper - reduce volume by 50-60%\n  - Include 1-2 short easy runs (3-5km at ${isBeginnerPlan ? 'Effort: 2-3/10' : 'RPE 2-3'})\n  - Optional: 1 very short shakeout run (2-3km) 2-3 days before race\n  - Rest or very light activity 1-2 days before race\n  - THE RACE MUST BE ON ${raceDayOfWeek.toUpperCase()}: "RACE DAY: ${answers.raceDistance}"\n\nABSOLUTE REQUIREMENT: The race MUST be scheduled on ${raceDayOfWeek} of week ${numberOfWeeks}. This is the ${raceDayOfWeek} that falls on ${raceDateFormatted}. Do NOT schedule the race on any other day of the week.\n`;
      }
    }

    const startDayInfo = startDate && startDayOfWeek
      ? `\nPLAN START DATE: ${startDate} (${startDayOfWeek})\nCRITICAL: This plan starts on ${startDayOfWeek}. Week 1 begins on ${startDayOfWeek}, NOT Monday.\n- Structure each week starting from ${startDayOfWeek} through the following week\n- Schedule workouts throughout the entire week cycle, including all selected training days\n- Do NOT leave early weekdays as Rest just because the plan starts later in the week`
      : '';

    // Different prompts for different modes
    let prompt = '';
    let schema: any = {};

    if (isDateDrivenPlan) {
      // DAY-BASED GENERATION
      const dateListStr = dateList.map((date, index) => {
        const dayName = getDayName(date);
        return `Day ${index + 1} (${date}, ${dayName})`;
      }).join('\n');

      prompt = `You are an experienced running coach creating a comprehensive ${numberOfWeeks}-week training plan.

${coreGuidance}
${taperProtocol}
${paceInstructions}
${startDayInfo}
${specificDaysInstructions}
${raceDateInstructions}

CRITICAL: Generate a DAY-BY-DAY training plan for the following ${numberOfDays} days:
${dateListStr}

The final day (${dateList[dateList.length - 1]}) MUST be the race day.

${REST_DAY_RULES}

${workoutRules}`;

      schema = {
        type: "json_schema",
        json_schema: {
          name: "running_plan_days",
          strict: true,
          schema: {
            type: "object",
            properties: {
              days: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    date: { type: "string" },
                    workout: { type: "string" },
                    tips: {
                      type: "array",
                      items: { type: "string" }
                    }
                  },
                  required: ["date", "workout", "tips"],
                  additionalProperties: false
                }
              }
            },
            required: ["days"],
            additionalProperties: false
          }
        }
      };
    } else {
      // WEEK-BASED GENERATION (original logic)
      prompt = `You are an experienced running coach creating a comprehensive ${numberOfWeeks}-week training plan.

${coreGuidance}
${taperProtocol}
${paceInstructions}
${startDayInfo}
${specificDaysInstructions}
${raceDateInstructions}

Generate a ${numberOfWeeks}-week day-by-day training plan${answers.raceDate ? ` that ends on the race date ${answers.raceDate}` : ''}.

${REST_DAY_RULES}

${workoutRules}

PLAN STRUCTURE:
- Each week must include exactly 7 days (Mon-Sun)
- Schedule workouts on ALL selected training days throughout EVERY week
- The runner trains ${daysPerWeek} days per week
- Include 1 long run per week`;

      schema = {
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
                            tips: { type: "array", items: { type: "string" } }
                          },
                          required: ["workout", "tips"],
                          additionalProperties: false
                        },
                        Tue: {
                          type: "object",
                          properties: {
                            workout: { type: "string" },
                            tips: { type: "array", items: { type: "string" } }
                          },
                          required: ["workout", "tips"],
                          additionalProperties: false
                        },
                        Wed: {
                          type: "object",
                          properties: {
                            workout: { type: "string" },
                            tips: { type: "array", items: { type: "string" } }
                          },
                          required: ["workout", "tips"],
                          additionalProperties: false
                        },
                        Thu: {
                          type: "object",
                          properties: {
                            workout: { type: "string" },
                            tips: { type: "array", items: { type: "string" } }
                          },
                          required: ["workout", "tips"],
                          additionalProperties: false
                        },
                        Fri: {
                          type: "object",
                          properties: {
                            workout: { type: "string" },
                            tips: { type: "array", items: { type: "string" } }
                          },
                          required: ["workout", "tips"],
                          additionalProperties: false
                        },
                        Sat: {
                          type: "object",
                          properties: {
                            workout: { type: "string" },
                            tips: { type: "array", items: { type: "string" } }
                          },
                          required: ["workout", "tips"],
                          additionalProperties: false
                        },
                        Sun: {
                          type: "object",
                          properties: {
                            workout: { type: "string" },
                            tips: { type: "array", items: { type: "string" } }
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
      };
    }

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.7,
        max_tokens: 16000,
        messages: [{ role: "user", content: prompt }],
        response_format: schema
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorText}`);
    }

    const data = await openaiResponse.json();
    console.log('OpenAI response received');

    const content = data.choices[0].message.content;
    let planData;

    try {
      planData = JSON.parse(content);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      throw new Error(`Failed to parse OpenAI response: ${parseError.message}`);
    }

    console.log('=== Validating and fixing coaching tips ===');

    if (isDateDrivenPlan) {
      // Validate day-based plan
      if (!planData.days || !Array.isArray(planData.days)) {
        throw new Error('Invalid day-based plan structure');
      }

      console.log(`Generated ${planData.days.length} days`);

      // ENFORCE REST DAYS - Post-process to ensure only "Rest" on non-training days
      const availableDays = answers.availableDays || [];
      planData.days.forEach((day: any, index: number) => {
        const dayDate = new Date(day.date);
        const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayDate.getDay()];

        // Check if this is a race day
        const isRaceDay = day.workout && (
          day.workout.toLowerCase().includes('race day') ||
          (answers.raceDate && day.date === answers.raceDate)
        );

        // If not a race day and not a training day, force to "Rest"
        if (!isRaceDay && availableDays.length > 0 && !availableDays.includes(dayOfWeek)) {
          const workoutLower = (day.workout || '').toLowerCase();
          if (workoutLower !== 'rest') {
            console.log(`Forcing day ${day.date} (${dayOfWeek}) to Rest (was: ${day.workout})`);
            day.workout = 'Rest';
            day.tips = ["Rest is when your body adapts and gets stronger"];
          }
        }

        // Validate tips for each day
        if (!day.tips || day.tips.length === 0) {
          console.warn(`Day ${index + 1} has no tips, using defaults`);
          day.tips = ["Focus on maintaining consistent effort throughout the workout."];
        }
      });

      // CRITICAL: Insert calibration workout if enabled (deterministic approach)
      if (answers.includeCalibrationRun) {
        insertCalibrationWorkoutDeterministic(planData.days, planStartDate, answers.availableDays || [], answers.raceDistance);
      }

      // Create backward-compatible week structure
      const weekStructure = convertDaysToWeeks(planData.days, planStartDate);
      planData.plan = weekStructure;
      planData.plan_type = 'date_based';

      // VALIDATION: Ensure weeks were created
      if (!weekStructure || weekStructure.length === 0) {
        throw new Error(`Failed to create week structure. Generated ${planData.days.length} days but 0 weeks.`);
      }

      console.log(`Created ${weekStructure.length} weeks for display`);

    } else {
      // Validate week-based plan
      validateTips(planData);

      if (planData.plan && Array.isArray(planData.plan)) {
        // ENFORCE REST DAYS - Post-process to ensure only "Rest" on non-training days
        const availableDays = answers.availableDays || [];
        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

        planData.plan.forEach((week: any, index: number) => {
          const expectedWeekNumber = index + 1;
          if (week.week !== expectedWeekNumber) {
            console.log(`Correcting week number: was ${week.week}, should be ${expectedWeekNumber}`);
            week.week = expectedWeekNumber;
          }

          // Force non-training days to "Rest"
          if (availableDays.length > 0 && week.days) {
            dayNames.forEach(dayName => {
              if (week.days[dayName]) {
                const workout = week.days[dayName].workout || '';
                const workoutLower = workout.toLowerCase();
                const isRaceDay = workoutLower.includes('race day');

                // If not a training day and not a race day, force to "Rest"
                if (!isRaceDay && !availableDays.includes(dayName) && workoutLower !== 'rest') {
                  console.log(`Forcing ${dayName} in week ${week.week} to Rest (was: ${workout})`);
                  week.days[dayName].workout = 'Rest';
                  week.days[dayName].tips = ["Rest is when your body adapts and gets stronger"];
                }
              }
            });
          }
        });
        console.log('Week numbers after validation:', planData.plan.map((w: any) => w.week));
      }

      planData.plan_type = 'weeks_based';
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
