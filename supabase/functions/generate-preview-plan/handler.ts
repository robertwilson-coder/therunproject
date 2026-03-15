import { buildStructuralGuidance, parseRaceDistanceKm, isMarathonLikeRace } from '../_shared/planStructureBuilder.ts';

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export interface PreviewRequestBody {
  answers: {
    experience?: string;
    raceDistance?: string;
    raceDate?: string;
    planWeeks?: number;
    longestRun?: number;
    currentWeeklyKm?: string;
    availableDays?: string[];
    daysPerWeek?: number;
    ambitionTier?: 'base' | 'performance' | 'competitive';
    includeCalibrationRun?: boolean;
    raceName?: string;
    raceLocation?: string;
  };
  startDate: string;
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
}

export interface PreviewTestModeResponse {
  _testMode: true;
  structuralGuidance: StructuralGuidanceOutput;
  requestParsed: {
    totalWeeks: number;
    totalDays: number;
    raceDistanceKm: number;
    startingWeeklyKm: number;
    startingLongestRun: number;
    previewRangeDays: number;
  };
}

export function computeStructuralGuidanceForPreview(body: PreviewRequestBody): PreviewTestModeResponse {
  const { answers, startDate, readinessTier = 'green' } = body;
  const paceMinPerKm = body._paceMinPerKm || 6.0;
  const ambitionTier = answers.ambitionTier || 'base';

  const start = new Date(startDate);
  let totalDays: number;
  let totalWeeks: number;

  if (answers.raceDate) {
    const race = new Date(answers.raceDate);
    totalDays = Math.ceil((race.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    totalWeeks = Math.ceil(totalDays / 7);
  } else {
    totalWeeks = answers.planWeeks || 12;
    totalDays = totalWeeks * 7;
  }

  const raceDistanceKm = parseRaceDistanceKm(answers.raceDistance || '');
  const startingWeeklyKm = parseFloat(answers.currentWeeklyKm || '0') || 0;
  const startingLongestRun = answers.longestRun || 0;

  const daysPerWeek = answers.daysPerWeek || answers.availableDays?.length || 4;

  const sg = buildStructuralGuidance({
    startingWeeklyKm,
    startingLongestRunKm: startingLongestRun,
    totalWeeks,
    raceDistanceKm,
    paceMinPerKm,
    ambitionTier,
    daysPerWeek,
  });

  const taperWeeks = totalWeeks - sg.taperStartWeek;
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
      totalWeeks,
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
      totalWeeks,
      totalDays,
      raceDistanceKm,
      startingWeeklyKm,
      startingLongestRun,
      previewRangeDays: 14,
    },
  };
}

export function isTestModeAllowed(): boolean {
  const env = Deno.env.get("DENO_ENV") || Deno.env.get("ENVIRONMENT") || "";
  return env === "test";
}

export async function handleGeneratePreviewPlanRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const body: PreviewRequestBody = await req.json();

    if (!body.startDate) {
      return new Response(
        JSON.stringify({ error: "startDate is required for preview generation" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

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
      const testResponse = computeStructuralGuidanceForPreview(body);
      return new Response(JSON.stringify(testResponse), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Full preview generation requires OpenAI - use _testMode for structural math testing" }),
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
