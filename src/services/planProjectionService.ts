import { supabase } from '../lib/supabase';

export type AmbitionTier = 'base' | 'performance' | 'competitive';
export type PlanArchetype = 'development' | 'established' | 'established_specificity';

export interface ProjectionRequest {
  startingWeeklyKm: number;
  startingLongestRunKm: number;
  totalWeeks: number;
  raceDistanceKm: number;
  paceMinPerKm?: number;
  ambitionTier?: AmbitionTier;
  daysPerWeek?: number;
  forceArchetype?: PlanArchetype;
}

export interface ProjectionResponse {
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

let cachedResult: { key: string; response: ProjectionResponse } | null = null;

function buildCacheKey(params: ProjectionRequest): string {
  return JSON.stringify({
    v: params.startingWeeklyKm,
    lr: params.startingLongestRunKm,
    w: params.totalWeeks,
    d: params.raceDistanceKm,
    p: params.paceMinPerKm ?? 6,
    t: params.ambitionTier ?? 'base',
    dpw: params.daysPerWeek ?? 4,
  });
}

export async function fetchPlanProjections(params: ProjectionRequest): Promise<ProjectionResponse> {
  const cacheKey = buildCacheKey(params);

  if (cachedResult && cachedResult.key === cacheKey) {
    return cachedResult.response;
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const response = await fetch(`${supabaseUrl}/functions/v1/calculate-plan-projections`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'apikey': supabaseAnonKey,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Plan projection request failed: ${errorText}`);
  }

  const result = await response.json() as ProjectionResponse;

  cachedResult = { key: cacheKey, response: result };

  return result;
}

export function clearProjectionCache(): void {
  cachedResult = null;
}
