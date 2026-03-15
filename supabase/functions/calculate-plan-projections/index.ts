import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  buildStructuralGuidance,
  detectPlanArchetype,
  parseRaceDistanceKm,
  type AmbitionTier,
  type PlanArchetype,
  type StructuralGuidance,
} from "../_shared/planStructureBuilder.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ProjectionRequest {
  startingWeeklyKm: number;
  startingLongestRunKm: number;
  totalWeeks: number;
  raceDistanceKm: number;
  paceMinPerKm?: number;
  ambitionTier?: AmbitionTier;
  daysPerWeek?: number;
  forceArchetype?: PlanArchetype;
}

interface ProjectionResponse {
  weeklyVolumes: number[];
  longRunTargets: number[];
  cutbackWeeks: number[];
  peakWeek: number;
  taperStartWeek: number;
  peakCapped: boolean;
  ambitionTier: AmbitionTier;
  qualitySessionsPerWeek: number;
  planArchetype: PlanArchetype;
  projectedPeakVolume: number;
  projectedPeakLongRun: number;
  usefulLongRunTargetKm?: number;
  archetypeRecommendation?: string;
}

function computeProjections(params: ProjectionRequest): ProjectionResponse {
  const guidance = buildStructuralGuidance({
    startingWeeklyKm: params.startingWeeklyKm,
    startingLongestRunKm: params.startingLongestRunKm,
    totalWeeks: params.totalWeeks,
    raceDistanceKm: params.raceDistanceKm,
    paceMinPerKm: params.paceMinPerKm,
    ambitionTier: params.ambitionTier,
    daysPerWeek: params.daysPerWeek,
    forceArchetype: params.forceArchetype,
  });

  const buildVolumes = guidance.weeklyVolumes.slice(0, guidance.taperStartWeek);
  const buildLongRuns = guidance.longRunTargets.slice(0, guidance.taperStartWeek);

  const projectedPeakVolume = buildVolumes.length > 0 ? Math.max(...buildVolumes) : params.startingWeeklyKm;
  const projectedPeakLongRun = buildLongRuns.length > 0 ? Math.max(...buildLongRuns) : params.startingLongestRunKm;

  return {
    weeklyVolumes: guidance.weeklyVolumes,
    longRunTargets: guidance.longRunTargets,
    cutbackWeeks: guidance.cutbackWeeks,
    peakWeek: guidance.peakWeek,
    taperStartWeek: guidance.taperStartWeek,
    peakCapped: guidance.peakCapped,
    ambitionTier: guidance.ambitionTier,
    qualitySessionsPerWeek: guidance.qualitySessionsPerWeek,
    planArchetype: guidance.planArchetype,
    projectedPeakVolume,
    projectedPeakLongRun,
    usefulLongRunTargetKm: guidance.usefulLongRunTargetKm,
    archetypeRecommendation: guidance.archetypeRecommendation,
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
    const body = await req.json() as ProjectionRequest;

    if (typeof body.startingWeeklyKm !== 'number' ||
        typeof body.startingLongestRunKm !== 'number' ||
        typeof body.totalWeeks !== 'number' ||
        typeof body.raceDistanceKm !== 'number') {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: startingWeeklyKm, startingLongestRunKm, totalWeeks, raceDistanceKm' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const result = computeProjections(body);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
