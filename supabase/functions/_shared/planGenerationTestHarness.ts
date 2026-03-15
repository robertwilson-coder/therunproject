import {
  buildStructuralGuidance,
  parseRaceDistanceKm,
  isMarathonLikeRace,
  StructuralGuidance,
  AmbitionTier,
} from "./planStructureBuilder.ts";

export interface QuestionnaireFixture {
  name: string;
  answers: {
    experience: string;
    raceDistance: string;
    raceDate?: string;
    planWeeks: number;
    longestRun: number;
    currentWeeklyKm: string;
    availableDays: string[];
    daysPerWeek: number;
  };
  startDate: string;
  paceMinPerKm?: number;
  ambitionTier?: AmbitionTier;
  readinessTier?: "green" | "orange" | "dark_orange" | "red";
}

export interface NormalizedPlanOutput {
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

export function computeStructuralGuidanceFromFixture(
  fixture: QuestionnaireFixture
): NormalizedPlanOutput {
  const raceDistanceKm = parseRaceDistanceKm(fixture.answers.raceDistance);
  const startingWeeklyKm = parseFloat(fixture.answers.currentWeeklyKm) || 0;
  const startingLongestRunKm = fixture.answers.longestRun || 0;
  const totalWeeks = fixture.answers.planWeeks;
  const paceMinPerKm = fixture.paceMinPerKm || 6.0;
  const ambitionTier = fixture.ambitionTier || "base";
  const readinessTier = fixture.readinessTier || "green";

  const guidance = buildStructuralGuidance({
    startingWeeklyKm,
    startingLongestRunKm,
    totalWeeks,
    raceDistanceKm,
    paceMinPerKm,
    ambitionTier,
  });

  return normalizeGuidanceOutput(
    guidance,
    raceDistanceKm,
    totalWeeks,
    readinessTier,
    ambitionTier
  );
}

export function normalizeGuidanceOutput(
  guidance: StructuralGuidance,
  raceDistanceKm: number,
  totalWeeks: number,
  readinessTier: string,
  ambitionTier: string
): NormalizedPlanOutput {
  const taperWeeks = totalWeeks - guidance.taperStartWeek;
  const buildWeeks = guidance.taperStartWeek;

  const buildVolumes = guidance.weeklyVolumes.slice(0, buildWeeks);
  const taperVolumes = guidance.weeklyVolumes.slice(buildWeeks);

  const buildLongRuns = guidance.longRunTargets.slice(0, buildWeeks);
  const taperLongRuns = guidance.longRunTargets.slice(buildWeeks);

  const projectedPeakVolume =
    buildVolumes.length > 0
      ? Math.max(...buildVolumes)
      : guidance.weeklyVolumes[0] || 0;

  const projectedPeakLongRun =
    buildLongRuns.length > 0
      ? Math.max(...buildLongRuns)
      : guidance.longRunTargets[0] || 0;

  return {
    parsedRaceDistanceKm: raceDistanceKm,
    isMarathonLikeRace: isMarathonLikeRace(raceDistanceKm),
    totalWeeks,
    taperWeeks,
    buildWeeks,
    weeklyVolumes: guidance.weeklyVolumes,
    longRunTargets: guidance.longRunTargets,
    taperVolumes,
    taperLongRuns,
    projectedPeakVolume,
    projectedPeakLongRun,
    readinessTier,
    ambitionTier,
    cutbackWeeks: guidance.cutbackWeeks,
    peakWeek: guidance.peakWeek,
    taperStartWeek: guidance.taperStartWeek,
    peakCapped: guidance.peakCapped,
  };
}

export const CANONICAL_FIXTURES: QuestionnaireFixture[] = [
  {
    name: "Beginner 5K, 8 weeks",
    answers: {
      experience: "beginner",
      raceDistance: "5K",
      planWeeks: 8,
      longestRun: 5,
      currentWeeklyKm: "20",
      availableDays: ["Tue", "Thu", "Sat"],
      daysPerWeek: 3,
    },
    startDate: "2026-01-06",
    paceMinPerKm: 6.5,
  },
  {
    name: "Intermediate 10K, 10 weeks",
    answers: {
      experience: "intermediate",
      raceDistance: "10K",
      planWeeks: 10,
      longestRun: 10,
      currentWeeklyKm: "35",
      availableDays: ["Mon", "Wed", "Fri", "Sun"],
      daysPerWeek: 4,
    },
    startDate: "2026-01-06",
    paceMinPerKm: 5.5,
  },
  {
    name: "Half marathon, 12 weeks",
    answers: {
      experience: "intermediate",
      raceDistance: "Half Marathon",
      planWeeks: 12,
      longestRun: 14,
      currentWeeklyKm: "40",
      availableDays: ["Tue", "Thu", "Sat", "Sun"],
      daysPerWeek: 4,
    },
    startDate: "2026-01-06",
    paceMinPerKm: 5.5,
  },
  {
    name: "Marathon, 16 weeks",
    answers: {
      experience: "intermediate",
      raceDistance: "Marathon",
      planWeeks: 16,
      longestRun: 18,
      currentWeeklyKm: "50",
      availableDays: ["Tue", "Thu", "Sat", "Sun"],
      daysPerWeek: 4,
    },
    startDate: "2026-01-06",
    paceMinPerKm: 5.5,
  },
];

export const BOUNDARY_FIXTURES: QuestionnaireFixture[] = [
  {
    name: "Half marathon boundary 21.1km",
    answers: {
      experience: "intermediate",
      raceDistance: "21.1",
      planWeeks: 12,
      longestRun: 14,
      currentWeeklyKm: "40",
      availableDays: ["Tue", "Thu", "Sat", "Sun"],
      daysPerWeek: 4,
    },
    startDate: "2026-01-06",
    paceMinPerKm: 5.5,
  },
  {
    name: "Long run capped by volume (60%)",
    answers: {
      experience: "intermediate",
      raceDistance: "Marathon",
      planWeeks: 8,
      longestRun: 20,
      currentWeeklyKm: "25",
      availableDays: ["Tue", "Thu", "Sat", "Sun"],
      daysPerWeek: 4,
    },
    startDate: "2026-01-06",
    paceMinPerKm: 5.0,
  },
  {
    name: "Long run capped by 32km",
    answers: {
      experience: "advanced",
      raceDistance: "Marathon",
      planWeeks: 16,
      longestRun: 35,
      currentWeeklyKm: "80",
      availableDays: ["Tue", "Thu", "Sat", "Sun"],
      daysPerWeek: 4,
    },
    startDate: "2026-01-06",
    paceMinPerKm: 4.0,
  },
  {
    name: "Long run capped by 3-hour duration",
    answers: {
      experience: "intermediate",
      raceDistance: "Marathon",
      planWeeks: 16,
      longestRun: 25,
      currentWeeklyKm: "60",
      availableDays: ["Tue", "Thu", "Sat", "Sun"],
      daysPerWeek: 4,
    },
    startDate: "2026-01-06",
    paceMinPerKm: 9.0,
  },
];

export interface ExpectedCanonicalOutput {
  name: string;
  totalWeeks: number;
  taperWeeks: number;
  buildWeeks: number;
  isMarathonLike: boolean;
  weeklyVolumes: number[];
  longRunTargets: number[];
  projectedPeakVolume: number;
  projectedPeakLongRun: number;
}

export function generateExpectedOutputs(): ExpectedCanonicalOutput[] {
  return CANONICAL_FIXTURES.map((fixture) => {
    const output = computeStructuralGuidanceFromFixture(fixture);
    return {
      name: fixture.name,
      totalWeeks: output.totalWeeks,
      taperWeeks: output.taperWeeks,
      buildWeeks: output.buildWeeks,
      isMarathonLike: output.isMarathonLikeRace,
      weeklyVolumes: output.weeklyVolumes,
      longRunTargets: output.longRunTargets,
      projectedPeakVolume: output.projectedPeakVolume,
      projectedPeakLongRun: output.projectedPeakLongRun,
    };
  });
}

export function validateInvariants(output: NormalizedPlanOutput): string[] {
  const errors: string[] = [];

  if (output.buildWeeks + output.taperWeeks !== output.totalWeeks) {
    errors.push(
      `build + taper != total: ${output.buildWeeks} + ${output.taperWeeks} != ${output.totalWeeks}`
    );
  }

  if (output.weeklyVolumes.length !== output.totalWeeks) {
    errors.push(
      `volume array length mismatch: ${output.weeklyVolumes.length} != ${output.totalWeeks}`
    );
  }

  if (output.longRunTargets.length !== output.totalWeeks) {
    errors.push(
      `long run array length mismatch: ${output.longRunTargets.length} != ${output.totalWeeks}`
    );
  }

  output.weeklyVolumes.forEach((v, i) => {
    if (Number.isNaN(v)) {
      errors.push(`Week ${i + 1} volume is NaN`);
    }
    if (v < 0) {
      errors.push(`Week ${i + 1} volume is negative: ${v}`);
    }
  });

  output.longRunTargets.forEach((lr, i) => {
    if (Number.isNaN(lr)) {
      errors.push(`Week ${i + 1} long run is NaN`);
    }
    if (lr < 0) {
      errors.push(`Week ${i + 1} long run is negative: ${lr}`);
    }
    if (lr > 32) {
      errors.push(`Week ${i + 1} long run exceeds 32km cap: ${lr}`);
    }
  });

  for (let i = 1; i < output.taperVolumes.length; i++) {
    if (output.taperVolumes[i] > output.taperVolumes[i - 1] + 0.1) {
      errors.push(
        `Taper volume increased: week ${i} (${output.taperVolumes[i - 1]}) -> week ${i + 1} (${output.taperVolumes[i]})`
      );
    }
  }

  for (let i = 1; i < output.taperLongRuns.length; i++) {
    if (output.taperLongRuns[i] >= output.taperLongRuns[i - 1]) {
      errors.push(
        `Taper long run did not decrease: week ${i} (${output.taperLongRuns[i - 1]}) -> week ${i + 1} (${output.taperLongRuns[i]})`
      );
    }
  }

  return errors;
}

export function assertDeterminism(fixture: QuestionnaireFixture): boolean {
  const run1 = computeStructuralGuidanceFromFixture(fixture);
  const run2 = computeStructuralGuidanceFromFixture(fixture);

  return (
    JSON.stringify(run1.weeklyVolumes) === JSON.stringify(run2.weeklyVolumes) &&
    JSON.stringify(run1.longRunTargets) ===
      JSON.stringify(run2.longRunTargets) &&
    run1.taperWeeks === run2.taperWeeks &&
    run1.buildWeeks === run2.buildWeeks &&
    run1.projectedPeakVolume === run2.projectedPeakVolume &&
    run1.projectedPeakLongRun === run2.projectedPeakLongRun
  );
}
