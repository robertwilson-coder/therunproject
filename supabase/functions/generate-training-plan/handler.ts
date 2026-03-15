import { buildStructuralGuidance, parseRaceDistanceKm, isMarathonLikeRace, validatePlanDuration, isMicroPlan, MIN_PLAN_WEEKS, MAX_PLAN_WEEKS } from '../_shared/planStructureBuilder.ts';

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export interface RequestBody {
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
  readinessTier?: 'green' | 'orange' | 'dark_orange' | 'red';
  _testMode?: boolean;
  _paceMinPerKm?: number;
}

export interface StructuralGuidanceOutput {
  parsedRaceDistanceKm: number;
  isMarathonLikeRace: boolean;
  totalWeeks: number;
  taperWeeks: number;
  buildWeeks: number;
  weeklyVolumes: number[];
  longRunTargets: number[];
  taperVolumes: number[];
  taperLongRuns: number[];
  projectedPeakVolume: number;
  projectedPeakLongRun: number;
  readinessTier: string;
  ambitionTier: string;
  cutbackWeeks: number[];
  peakWeek: number;
  taperStartWeek: number;
  peakCapped: boolean;
  planArchetype: string;
  weeklyMeta?: unknown[];
}

export interface TestModeResponse {
  _testMode: true;
  structuralGuidance: StructuralGuidanceOutput;
  requestParsed: {
    numberOfWeeks: number;
    numberOfDays: number;
    isDateDrivenPlan: boolean;
    raceDistanceKm: number;
    startingWeeklyKm: number;
    startingLongestRun: number;
  };
}

export function computeStructuralGuidanceForRequest(body: RequestBody): TestModeResponse {
  const { answers, startDate, readinessTier = 'green' } = body;
  const paceMinPerKm = body._paceMinPerKm || 6.0;
  const ambitionTier = answers.ambitionTier || 'base';

  const isDateDrivenPlan = !!(startDate && answers.raceDate);
  const planStartDate = startDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  let numberOfWeeks = answers.planWeeks || 12;
  let numberOfDays = 0;

  if (isDateDrivenPlan) {
    const start = new Date(planStartDate);
    const raceDate = new Date(answers.raceDate!);
    const diffTime = raceDate.getTime() - start.getTime();
    numberOfDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    numberOfWeeks = Math.ceil(numberOfDays / 7);
  } else {
    if (answers.raceDate) {
      const today = new Date();
      const raceDate = new Date(answers.raceDate);
      const diffTime = raceDate.getTime() - today.getTime();
      const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
      numberOfWeeks = Math.max(MIN_PLAN_WEEKS, Math.min(MAX_PLAN_WEEKS, diffWeeks));
    }
    numberOfDays = numberOfWeeks * 7;
  }

  const durationValidation = validatePlanDuration(numberOfWeeks);
  if (!durationValidation.valid) {
    console.log(`[Plan Duration] Clamped from ${numberOfWeeks} to ${durationValidation.clampedWeeks} weeks: ${durationValidation.message}`);
    numberOfWeeks = durationValidation.clampedWeeks;
    numberOfDays = numberOfWeeks * 7;
  }

  const microPlanMode = isMicroPlan(numberOfWeeks);
  if (microPlanMode) {
    console.log(`[Micro Plan] ${numberOfWeeks}-week plan detected - using conservative progression`);
  }

  const raceDistanceKm = parseRaceDistanceKm(answers.raceDistance || '');
  const startingWeeklyKm = parseFloat(answers.currentWeeklyKm || '0') || 0;
  const startingLongestRun = answers.longestRun || 0;
  const daysPerWeek = answers.daysPerWeek || answers.availableDays?.length || 4;

  const sg = buildStructuralGuidance({
    startingWeeklyKm,
    startingLongestRunKm: startingLongestRun,
    totalWeeks: numberOfWeeks,
    raceDistanceKm,
    paceMinPerKm,
    ambitionTier,
    daysPerWeek,
  });

  const taperWeeks = numberOfWeeks - sg.taperStartWeek;
  const buildWeeks = sg.taperStartWeek;

  const buildVolumes = sg.weeklyVolumes.slice(0, buildWeeks);
  const taperVolumes = sg.weeklyVolumes.slice(buildWeeks);
  const buildLongRuns = sg.longRunTargets.slice(0, buildWeeks);
  const taperLongRuns = sg.longRunTargets.slice(buildWeeks);

  const projectedPeakVolume = buildVolumes.length > 0 ? Math.max(...buildVolumes) : sg.weeklyVolumes[0] || 0;
  const projectedPeakLongRun = buildLongRuns.length > 0 ? Math.max(...buildLongRuns) : sg.longRunTargets[0] || 0;

  return {
    _testMode: true,
    structuralGuidance: {
      parsedRaceDistanceKm: raceDistanceKm,
      isMarathonLikeRace: isMarathonLikeRace(raceDistanceKm),
      totalWeeks: numberOfWeeks,
      taperWeeks,
      buildWeeks,
      weeklyVolumes: sg.weeklyVolumes,
      longRunTargets: sg.longRunTargets,
      taperVolumes,
      taperLongRuns,
      projectedPeakVolume,
      projectedPeakLongRun,
      readinessTier,
      ambitionTier,
      cutbackWeeks: sg.cutbackWeeks,
      peakWeek: sg.peakWeek,
      taperStartWeek: sg.taperStartWeek,
      peakCapped: sg.peakCapped,
      planArchetype: sg.planArchetype,
      weeklyMeta: sg.weeklyMeta,
    },
    requestParsed: {
      numberOfWeeks,
      numberOfDays,
      isDateDrivenPlan,
      raceDistanceKm,
      startingWeeklyKm,
      startingLongestRun,
    },
  };
}

export function isTestModeAllowed(): boolean {
  const env = Deno.env.get("DENO_ENV") || Deno.env.get("ENVIRONMENT") || "";
  return env === "test";
}

export async function handleGenerateTrainingPlanRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const body: RequestBody = await req.json();

    if (body._testMode) {
      if (!isTestModeAllowed()) {
        return new Response(
          JSON.stringify({ error: "_testMode is not allowed in production" }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      const testResponse = computeStructuralGuidanceForRequest(body);
      return new Response(JSON.stringify(testResponse), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Full plan generation requires OpenAI - use _testMode for structural math testing" }),
      {
        status: 501,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Request processing failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}
