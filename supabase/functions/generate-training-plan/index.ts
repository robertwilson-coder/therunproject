import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { validateTips } from "./tip-validator.ts";
import { buildCoreTrainingGuidance, buildPaceInstructions, buildWorkoutStructureRules, buildSpecificDaysInstructions, REST_DAY_RULES, buildTaperProtocol } from '../_shared/promptBuilder.ts';
import { buildStructuralGuidance, parseRaceDistanceKm, validatePlanDuration, isMicroPlan, MIN_PLAN_WEEKS, MAX_PLAN_WEEKS } from '../_shared/planStructureBuilder.ts';
import { computeFatigueSignals, formatFatigueSignalsForPrompt, type WorkoutHistoryEntry } from '../_shared/fatigueEngine.ts';

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
    ambitionTier?: 'base' | 'performance' | 'competitive';
    includeCalibrationRun?: boolean;
    longRunDay?: string;
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
  workoutHistory?: WorkoutHistoryEntry[];
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

// Interval structure validation guard
// Catches patterns like "5 × 18 km" where rep_distance_km > 5 and rep_count >= 2
const INTERVAL_REP_RE = /(\d+)\s*[×x]\s*(\d+(?:\.\d+)?)\s*km/gi;

function validateIntervalStructure(workout: string): { valid: boolean; reason?: string } {
  if (!workout || workout.toLowerCase() === 'rest') return { valid: true };
  const text = workout;
  let match: RegExpExecArray | null;
  INTERVAL_REP_RE.lastIndex = 0;
  while ((match = INTERVAL_REP_RE.exec(text)) !== null) {
    const repCount = parseInt(match[1], 10);
    const repDistanceKm = parseFloat(match[2]);
    if (repDistanceKm > 3 && repCount >= 2) {
      return {
        valid: false,
        reason: `interval_structure_error: ${repCount} × ${repDistanceKm} km — rep distance ${repDistanceKm} km exceeds 3 km cap with ${repCount} reps`,
      };
    }
  }
  return { valid: true };
}

function sanitizeIntervalWorkout(workout: string): string {
  if (!workout || workout.toLowerCase() === 'rest') return workout;
  INTERVAL_REP_RE.lastIndex = 0;
  return workout.replace(INTERVAL_REP_RE, (match, repCountStr, repKmStr) => {
    const repCount = parseInt(repCountStr, 10);
    const repDistanceKm = parseFloat(repKmStr);
    if (repDistanceKm > 3 && repCount >= 2) {
      const totalKm = Math.round(repCount * repDistanceKm);
      return `${totalKm} km tempo run`;
    }
    return match;
  });
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
    const { answers, startDate, startDayOfWeek, trainingPaces, workoutHistory }: RequestBody = await req.json();

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const daysPerWeek = answers.daysPerWeek || answers.availableDays?.length || 3;

    // CRITICAL: Determine generation mode
    const isDateDrivenPlan = !!(startDate && answers.raceDate);
    const planStartDate = startDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    let numberOfWeeks = answers.planWeeks || 12;
    let dateList: string[] = [];
    let numberOfDays = 0;

    if (isDateDrivenPlan) {
      const start = new Date(planStartDate);
      const raceDate = new Date(answers.raceDate!);

      const diffTime = raceDate.getTime() - start.getTime();
      numberOfDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      dateList = generateDateList(planStartDate, answers.raceDate!);

      numberOfWeeks = Math.ceil(numberOfDays / 7);

      console.log(`DATE-DRIVEN MODE: ${numberOfDays} days from ${planStartDate} to ${answers.raceDate}`);
    } else {
      if (answers.raceDate) {
        const today = new Date();
        const raceDate = new Date(answers.raceDate);
        const diffTime = raceDate.getTime() - today.getTime();
        const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
        numberOfWeeks = Math.max(MIN_PLAN_WEEKS, Math.min(MAX_PLAN_WEEKS, diffWeeks));
      }
      numberOfDays = numberOfWeeks * 7;

      console.log(`WEEK-DRIVEN MODE: ${numberOfWeeks} weeks`);
    }

    const durationValidation = validatePlanDuration(numberOfWeeks);
    if (!durationValidation.valid) {
      console.log(`[Plan Duration] Clamped from ${numberOfWeeks} to ${durationValidation.clampedWeeks} weeks: ${durationValidation.message}`);
      numberOfWeeks = durationValidation.clampedWeeks;
      numberOfDays = numberOfWeeks * 7;
      if (isDateDrivenPlan && answers.raceDate) {
        const raceDate = new Date(answers.raceDate);
        const newStartDate = new Date(raceDate);
        newStartDate.setDate(newStartDate.getDate() - (numberOfWeeks * 7) + 1);
        dateList = generateDateList(newStartDate.toISOString().split('T')[0], answers.raceDate);
        console.log(`[Plan Duration] Adjusted start date to ${newStartDate.toISOString().split('T')[0]} for 20-week cap`);
      }
    }

    const microPlanMode = isMicroPlan(numberOfWeeks);
    if (microPlanMode) {
      console.log(`[Micro Plan] ${numberOfWeeks}-week plan detected - using conservative progression`);
    }

    const processedAnswers = { ...answers, daysPerWeek, numberOfWeeks, numberOfDays };

    const isBeginnerPlan = answers.experience?.toLowerCase() === 'beginner';
    const hasPaceData = trainingPaces !== null && trainingPaces !== undefined;

    const raceDistanceKm = parseRaceDistanceKm(answers.raceDistance || '');
    const startingWeeklyKm = parseFloat(answers.currentWeeklyKm || '0') || 0;
    const startingLongestRun = answers.longestRun || 0;

    let structuralGuidance: Parameters<typeof buildCoreTrainingGuidance>[0]['structuralGuidance'] | undefined;
    const daysPerWeek2 = daysPerWeek;
    const ambitionTier = answers.ambitionTier || 'base';

    let fatigueContext = '';
    if (workoutHistory && workoutHistory.length > 0) {
      try {
        const signals = computeFatigueSignals(workoutHistory);
        fatigueContext = formatFatigueSignalsForPrompt(signals);
        console.log(`[FatigueEngine] level=${signals.fatigueLevel}, loadRatio=${signals.loadRatio}, highRPEStreak=${signals.highRPEStreak}`);
      } catch (fErr) {
        console.error('FatigueEngine failed, continuing without it:', fErr);
      }
    }

    if (raceDistanceKm > 0 && startingWeeklyKm > 0 && numberOfWeeks >= 4) {
      try {
        const sg = buildStructuralGuidance({
          startingWeeklyKm,
          startingLongestRunKm: startingLongestRun,
          totalWeeks: numberOfWeeks,
          raceDistanceKm,
          daysPerWeek: daysPerWeek2,
          ambitionTier,
        });
        structuralGuidance = {
          weeklyVolumes: sg.weeklyVolumes,
          longRunTargets: sg.longRunTargets,
          cutbackWeeks: sg.cutbackWeeks,
          peakWeek: sg.peakWeek,
          taperStartWeek: sg.taperStartWeek,
          ambitionTier: sg.ambitionTier,
          qualitySessionsPerWeek: sg.qualitySessionsPerWeek,
          planArchetype: sg.planArchetype,
          readinessTier: sg.readinessTier,
          weeklyMeta: sg.weeklyMeta,
        };
        console.log(`Structural guidance: peakWeek=${sg.peakWeek}, taperStart=${sg.taperStartWeek}, peakLR=${Math.max(...sg.longRunTargets).toFixed(1)}km, peakVol=${Math.max(...sg.weeklyVolumes).toFixed(1)}km, tier=${sg.ambitionTier}, qualitySessions=${sg.qualitySessionsPerWeek}, archetype=${sg.planArchetype}`);
      } catch (sgErr) {
        console.error('Failed to build structural guidance, proceeding without it:', sgErr);
      }
    }

    const coreGuidance = buildCoreTrainingGuidance({
      totalWeeks: numberOfWeeks,
      totalDays: numberOfDays,
      raceDistance: answers.raceDistance || 'Unknown',
      longestRun: answers.longestRun || 0,
      currentWeeklyKm: answers.currentWeeklyKm || 'unknown',
      experience: answers.experience || 'Not specified',
      availableDays: answers.availableDays || [],
      daysPerWeek,
      longRunDay: answers.longRunDay,
      isBeginnerPlan,
      hasPaceData,
      includeCalibrationRun: answers.includeCalibrationRun || false,
      trainingPaces,
      structuralGuidance,
    });

    const fatigueSection = fatigueContext
      ? `\nATHLETE FATIGUE CONTEXT (from recent training history):\n${fatigueContext}\nIf fatigue level is elevated, ensure Week 1 is conservative and deload weeks are respected strictly. Do not add extra intensity when load ratio exceeds 1.2.\n`
      : '';

    const paceInstructions = buildPaceInstructions(hasPaceData, trainingPaces, isBeginnerPlan);
    const specificDaysInstructions = buildSpecificDaysInstructions(answers.availableDays || [], daysPerWeek, answers.longRunDay);
    const workoutRules = buildWorkoutStructureRules(isBeginnerPlan);
    const taperProtocol = buildTaperProtocol(numberOfWeeks, answers.raceDistance || 'Unknown');

    let raceDateInstructions = '';
    if (answers.raceDate) {
      const raceDate = new Date(answers.raceDate);
      const raceDayOfWeek = raceDate.toLocaleDateString('en-US', { weekday: 'long' });
      const raceDateFormatted = raceDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      if (isDateDrivenPlan) {
        raceDateInstructions = `\nRACE DATE: ${raceDateFormatted} (${raceDayOfWeek})\nTOTAL DAYS: ${numberOfDays}\n\nThe plan MUST end EXACTLY on ${raceDateFormatted}. This is a DAY-BY-DAY plan.\nThe final workout MUST be: "RACE DAY: ${answers.raceDistance}"\nDo NOT generate workouts after this date.\n\nThe taper structure and volume targets are defined in the structural framework above. Populate the taper weeks according to those targets. Do NOT invent or override volume or intensity percentages.\n`;
      } else {
        raceDateInstructions = `\nRACE DATE: ${raceDateFormatted} (${raceDayOfWeek})\nTOTAL WEEKS: ${numberOfWeeks}\n\nThe plan MUST culminate in the race on ${raceDayOfWeek}, ${raceDateFormatted}.\nThe race MUST be scheduled on ${raceDayOfWeek} of week ${numberOfWeeks}. Do NOT schedule it on any other day.\n\nThe taper structure and volume targets are defined in the structural framework above. Populate the final weeks according to those targets. Do NOT invent volume reduction percentages.\n`;
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
${fatigueSection}
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
${fatigueSection}
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

        // Interval structure guard
        const ivCheck = validateIntervalStructure(day.workout || '');
        if (!ivCheck.valid) {
          console.error(`[IntervalGuard] ${day.date}: ${ivCheck.reason}`);
          day.workout = sanitizeIntervalWorkout(day.workout);
          console.log(`[IntervalGuard] Sanitized to: ${day.workout}`);
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

      // Add plan meta with ambition tier
      const ambitionTier = answers.ambitionTier || 'base';
      planData.meta = {
        ...(planData.meta || {}),
        ambitionTier,
        generatorVersion: 'v1.4',
        createdAtISO: new Date().toISOString().split('T')[0],
      };
      console.log(`[generate-training-plan] Plan meta set: ambitionTier=${ambitionTier}, generatorVersion=v1.4`);

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

                // Interval structure guard
                const ivCheck = validateIntervalStructure(week.days[dayName].workout || '');
                if (!ivCheck.valid) {
                  console.error(`[IntervalGuard] W${week.week} ${dayName}: ${ivCheck.reason}`);
                  week.days[dayName].workout = sanitizeIntervalWorkout(week.days[dayName].workout);
                  console.log(`[IntervalGuard] Sanitized to: ${week.days[dayName].workout}`);
                }
              }
            });
          }
        });
        console.log('Week numbers after validation:', planData.plan.map((w: any) => w.week));
      }

      planData.plan_type = 'weeks_based';

      // Add plan meta with ambition tier for week-based plans
      const ambitionTierWeeks = answers.ambitionTier || 'base';
      planData.meta = {
        ...(planData.meta || {}),
        ambitionTier: ambitionTierWeeks,
        generatorVersion: 'v1.4',
        createdAtISO: new Date().toISOString().split('T')[0],
      };
      console.log(`[generate-training-plan] Plan meta set: ambitionTier=${ambitionTierWeeks}, generatorVersion=v1.4`);
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
