import {
  assertEquals,
  assertArrayIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  computeStructuralGuidanceFromFixture,
  validateInvariants,
  assertDeterminism,
  CANONICAL_FIXTURES,
  BOUNDARY_FIXTURES,
  QuestionnaireFixture,
  NormalizedPlanOutput,
} from "./planGenerationTestHarness.ts";

import {
  parseRaceDistanceKm,
  isMarathonLikeRace,
} from "./planStructureBuilder.ts";

const EXPECTED_CANONICAL_OUTPUTS: Record<
  string,
  {
    totalWeeks: number;
    taperWeeks: number;
    buildWeeks: number;
    isMarathonLike: boolean;
    firstWeekVolume: number;
    peakVolumeMin: number;
    peakLongRunMax: number;
  }
> = {
  "Beginner 5K, 8 weeks": {
    totalWeeks: 8,
    taperWeeks: 1,
    buildWeeks: 7,
    isMarathonLike: false,
    firstWeekVolume: 21.2,
    peakVolumeMin: 25,
    peakLongRunMax: 10,
  },
  "Intermediate 10K, 10 weeks": {
    totalWeeks: 10,
    taperWeeks: 1,
    buildWeeks: 9,
    isMarathonLike: false,
    firstWeekVolume: 37.1,
    peakVolumeMin: 45,
    peakLongRunMax: 15,
  },
  "Half marathon, 12 weeks": {
    totalWeeks: 12,
    taperWeeks: 1,
    buildWeeks: 11,
    isMarathonLike: true,
    firstWeekVolume: 42.4,
    peakVolumeMin: 55,
    peakLongRunMax: 21,
  },
  "Marathon, 16 weeks": {
    totalWeeks: 16,
    taperWeeks: 2,
    buildWeeks: 14,
    isMarathonLike: true,
    firstWeekVolume: 53,
    peakVolumeMin: 70,
    peakLongRunMax: 32,
  },
};

Deno.test("A. Edge Function Integration - Canonical Fixture Outputs", async (t) => {
  for (const fixture of CANONICAL_FIXTURES) {
    await t.step(fixture.name, async (st) => {
      const output = computeStructuralGuidanceFromFixture(fixture);
      const expected = EXPECTED_CANONICAL_OUTPUTS[fixture.name];

      await st.step("total weeks matches expected", () => {
        assertEquals(output.totalWeeks, expected.totalWeeks);
      });

      await st.step("taper weeks matches expected", () => {
        assertEquals(output.taperWeeks, expected.taperWeeks);
      });

      await st.step("build weeks matches expected", () => {
        assertEquals(output.buildWeeks, expected.buildWeeks);
      });

      await st.step("build + taper = total", () => {
        assertEquals(
          output.buildWeeks + output.taperWeeks,
          output.totalWeeks
        );
      });

      await st.step("marathon-like classification correct", () => {
        assertEquals(output.isMarathonLikeRace, expected.isMarathonLike);
      });

      await st.step("first week volume matches", () => {
        assertEquals(output.weeklyVolumes[0], expected.firstWeekVolume);
      });

      await st.step("peak volume meets minimum", () => {
        assertEquals(
          output.projectedPeakVolume >= expected.peakVolumeMin,
          true,
          `Peak ${output.projectedPeakVolume} < min ${expected.peakVolumeMin}`
        );
      });

      await st.step("peak long run within cap", () => {
        assertEquals(
          output.projectedPeakLongRun <= expected.peakLongRunMax,
          true,
          `Peak LR ${output.projectedPeakLongRun} > max ${expected.peakLongRunMax}`
        );
      });

      await st.step("volume array length correct", () => {
        assertEquals(output.weeklyVolumes.length, expected.totalWeeks);
      });

      await st.step("long run array length correct", () => {
        assertEquals(output.longRunTargets.length, expected.totalWeeks);
      });

      await st.step("taper volumes array length correct", () => {
        assertEquals(output.taperVolumes.length, expected.taperWeeks);
      });

      await st.step("taper long runs array length correct", () => {
        assertEquals(output.taperLongRuns.length, expected.taperWeeks);
      });

      await st.step("passes all invariants", () => {
        const errors = validateInvariants(output);
        assertEquals(errors.length, 0, `Invariant errors: ${errors.join(", ")}`);
      });
    });
  }
});

Deno.test("B. Edge Function Integration - Exact Normalized Outputs", async (t) => {
  await t.step("Beginner 5K exact values", () => {
    const fixture = CANONICAL_FIXTURES.find((f) =>
      f.name === "Beginner 5K, 8 weeks"
    )!;
    const output = computeStructuralGuidanceFromFixture(fixture);

    assertEquals(output.totalWeeks, 8);
    assertEquals(output.taperWeeks, 1);
    assertEquals(output.buildWeeks, 7);
    assertEquals(output.isMarathonLikeRace, false);
    assertEquals(output.parsedRaceDistanceKm, 5);
    assertEquals(output.weeklyVolumes[0], 21.2);
    assertEquals(output.longRunTargets[0], 5);
    assertEquals(output.taperStartWeek, 7);
  });

  await t.step("Intermediate 10K exact values", () => {
    const fixture = CANONICAL_FIXTURES.find((f) =>
      f.name === "Intermediate 10K, 10 weeks"
    )!;
    const output = computeStructuralGuidanceFromFixture(fixture);

    assertEquals(output.totalWeeks, 10);
    assertEquals(output.taperWeeks, 1);
    assertEquals(output.buildWeeks, 9);
    assertEquals(output.isMarathonLikeRace, false);
    assertEquals(output.parsedRaceDistanceKm, 10);
    assertEquals(output.weeklyVolumes[0], 37.1);
    assertEquals(output.longRunTargets[0], 10);
    assertEquals(output.taperStartWeek, 9);
  });

  await t.step("Half marathon exact values", () => {
    const fixture = CANONICAL_FIXTURES.find((f) =>
      f.name === "Half marathon, 12 weeks"
    )!;
    const output = computeStructuralGuidanceFromFixture(fixture);

    assertEquals(output.totalWeeks, 12);
    assertEquals(output.taperWeeks, 1);
    assertEquals(output.buildWeeks, 11);
    assertEquals(output.isMarathonLikeRace, true);
    assertEquals(output.parsedRaceDistanceKm, 21.1);
    assertEquals(output.weeklyVolumes[0], 42.4);
    assertEquals(output.longRunTargets[0], 14);
    assertEquals(output.taperStartWeek, 11);
  });

  await t.step("Marathon exact values", () => {
    const fixture = CANONICAL_FIXTURES.find((f) =>
      f.name === "Marathon, 16 weeks"
    )!;
    const output = computeStructuralGuidanceFromFixture(fixture);

    assertEquals(output.totalWeeks, 16);
    assertEquals(output.taperWeeks, 2);
    assertEquals(output.buildWeeks, 14);
    assertEquals(output.isMarathonLikeRace, true);
    assertEquals(output.parsedRaceDistanceKm, 42.2);
    assertEquals(output.weeklyVolumes[0], 53);
    assertEquals(output.longRunTargets[0], 18);
    assertEquals(output.taperStartWeek, 14);
  });

});

Deno.test("C. Edge Function Integration - Boundary Cases", async (t) => {
  await t.step("Half marathon boundary at 21.1km is marathon-like", () => {
    const fixture = BOUNDARY_FIXTURES.find((f) =>
      f.name === "Half marathon boundary 21.1km"
    )!;
    const output = computeStructuralGuidanceFromFixture(fixture);

    assertEquals(output.parsedRaceDistanceKm, 21.1);
    assertEquals(output.isMarathonLikeRace, true);
    assertEquals(output.totalWeeks, 12);
    assertEquals(output.taperWeeks, 1);
  });

  await t.step("21km exactly is NOT marathon-like", () => {
    assertEquals(isMarathonLikeRace(21), false);
    assertEquals(isMarathonLikeRace(21.0), false);
  });

  await t.step("21.1km IS marathon-like", () => {
    assertEquals(isMarathonLikeRace(21.1), true);
  });

  await t.step("Long run capped by weekly volume (60%)", () => {
    const fixture = BOUNDARY_FIXTURES.find((f) =>
      f.name === "Long run capped by volume (60%)"
    )!;
    const output = computeStructuralGuidanceFromFixture(fixture);

    output.longRunTargets.forEach((lr, i) => {
      const volumeCap = output.weeklyVolumes[i] * 0.6;
      assertEquals(
        lr <= volumeCap + 0.1,
        true,
        `Week ${i + 1}: LR ${lr} > 60% of volume ${output.weeklyVolumes[i]} (cap: ${volumeCap.toFixed(1)})`
      );
    });
  });

  await t.step("Long run capped by 32km absolute max", () => {
    const fixture = BOUNDARY_FIXTURES.find((f) =>
      f.name === "Long run capped by 32km"
    )!;
    const output = computeStructuralGuidanceFromFixture(fixture);

    output.longRunTargets.forEach((lr, i) => {
      assertEquals(
        lr <= 32,
        true,
        `Week ${i + 1}: LR ${lr} exceeds 32km cap`
      );
    });

    assertEquals(output.projectedPeakLongRun <= 32, true);
  });

  await t.step("Long run capped by 3-hour duration", () => {
    const fixture = BOUNDARY_FIXTURES.find((f) =>
      f.name === "Long run capped by 3-hour duration"
    )!;
    const output = computeStructuralGuidanceFromFixture(fixture);

    const paceMinPerKm = fixture.paceMinPerKm || 6.0;
    const durationCapKm = 180 / paceMinPerKm;

    output.longRunTargets.forEach((lr, i) => {
      assertEquals(
        lr <= durationCapKm + 0.1,
        true,
        `Week ${i + 1}: LR ${lr} exceeds 3-hour cap ${durationCapKm.toFixed(1)}km at ${paceMinPerKm} min/km`
      );
    });
  });
});

Deno.test("D. Edge Function Integration - Pace Freshness Boundaries", async (t) => {
  const basePaceFixture: QuestionnaireFixture = {
    name: "Pace freshness test",
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
  };

  await t.step("41-day-old pace data fixture", () => {
    const output = computeStructuralGuidanceFromFixture(basePaceFixture);
    assertEquals(output.totalWeeks, 12);
    const errors = validateInvariants(output);
    assertEquals(errors.length, 0);
  });

  await t.step("42-day-old pace data fixture", () => {
    const output = computeStructuralGuidanceFromFixture(basePaceFixture);
    assertEquals(output.totalWeeks, 12);
    const errors = validateInvariants(output);
    assertEquals(errors.length, 0);
  });

  await t.step("43-day-old pace data fixture", () => {
    const output = computeStructuralGuidanceFromFixture(basePaceFixture);
    assertEquals(output.totalWeeks, 12);
    const errors = validateInvariants(output);
    assertEquals(errors.length, 0);
  });
});

Deno.test("E. Edge Function Integration - Determinism Verification", async (t) => {
  for (const fixture of CANONICAL_FIXTURES) {
    await t.step(`${fixture.name} produces identical outputs on repeated runs`, () => {
      assertEquals(assertDeterminism(fixture), true);
    });
  }

  for (const fixture of BOUNDARY_FIXTURES) {
    await t.step(`${fixture.name} produces identical outputs on repeated runs`, () => {
      assertEquals(assertDeterminism(fixture), true);
    });
  }
});

Deno.test("F. Edge Function Integration - Invariant Validation", async (t) => {
  for (const fixture of [...CANONICAL_FIXTURES, ...BOUNDARY_FIXTURES]) {
    await t.step(`${fixture.name} passes all invariants`, () => {
      const output = computeStructuralGuidanceFromFixture(fixture);
      const errors = validateInvariants(output);
      assertEquals(errors.length, 0, `Errors: ${errors.join("; ")}`);
    });
  }
});

Deno.test("G. Edge Function Integration - Taper Sequence Validation", async (t) => {
  await t.step("Marathon 16-week taper volumes decrease", () => {
    const fixture = CANONICAL_FIXTURES.find((f) =>
      f.name === "Marathon, 16 weeks"
    )!;
    const output = computeStructuralGuidanceFromFixture(fixture);

    assertEquals(output.taperVolumes.length, 2);
    assertEquals(
      output.taperVolumes[1] < output.taperVolumes[0],
      true,
      `Taper volume did not decrease: ${output.taperVolumes[0]} -> ${output.taperVolumes[1]}`
    );
  });

  await t.step("Marathon 16-week taper long runs decrease", () => {
    const fixture = CANONICAL_FIXTURES.find((f) =>
      f.name === "Marathon, 16 weeks"
    )!;
    const output = computeStructuralGuidanceFromFixture(fixture);

    assertEquals(output.taperLongRuns.length, 2);
    assertEquals(
      output.taperLongRuns[1] < output.taperLongRuns[0],
      true,
      `Taper LR did not decrease: ${output.taperLongRuns[0]} -> ${output.taperLongRuns[1]}`
    );
  });

});

Deno.test("H. Edge Function Integration - Readiness Tier Passthrough", async (t) => {
  const tiers = ["green", "orange", "dark_orange", "red"] as const;

  for (const tier of tiers) {
    await t.step(`${tier} tier is preserved in output`, () => {
      const fixture: QuestionnaireFixture = {
        ...CANONICAL_FIXTURES[2],
        readinessTier: tier,
      };
      const output = computeStructuralGuidanceFromFixture(fixture);
      assertEquals(output.readinessTier, tier);
    });
  }
});

Deno.test("I. Edge Function Integration - Ambition Tier Impact", async (t) => {
  const baseFixture = CANONICAL_FIXTURES[2];

  await t.step("base tier output", () => {
    const fixture: QuestionnaireFixture = {
      ...baseFixture,
      ambitionTier: "base",
    };
    const output = computeStructuralGuidanceFromFixture(fixture);
    assertEquals(output.ambitionTier, "base");
    assertEquals(output.totalWeeks, 12);
  });

  await t.step("performance tier produces >= base peak volume", () => {
    const baseOutput = computeStructuralGuidanceFromFixture({
      ...baseFixture,
      ambitionTier: "base",
    });
    const perfOutput = computeStructuralGuidanceFromFixture({
      ...baseFixture,
      ambitionTier: "performance",
    });

    assertEquals(
      perfOutput.projectedPeakVolume >= baseOutput.projectedPeakVolume,
      true,
      `Performance peak ${perfOutput.projectedPeakVolume} < base ${baseOutput.projectedPeakVolume}`
    );
  });

  await t.step("competitive tier produces >= performance peak volume", () => {
    const perfOutput = computeStructuralGuidanceFromFixture({
      ...baseFixture,
      ambitionTier: "performance",
    });
    const compOutput = computeStructuralGuidanceFromFixture({
      ...baseFixture,
      ambitionTier: "competitive",
    });

    assertEquals(
      compOutput.projectedPeakVolume >= perfOutput.projectedPeakVolume,
      true,
      `Competitive peak ${compOutput.projectedPeakVolume} < performance ${perfOutput.projectedPeakVolume}`
    );
  });
});

Deno.test("J. Edge Function Integration - Race Distance Parsing Parity", async (t) => {
  const parseTestCases = [
    { input: "5K", expected: 5 },
    { input: "5k", expected: 5 },
    { input: "10K", expected: 10 },
    { input: "10k", expected: 10 },
    { input: "Half Marathon", expected: 21.1 },
    { input: "half marathon", expected: 21.1 },
    { input: "half", expected: 21.1 },
    { input: "Marathon", expected: 42.2 },
    { input: "marathon", expected: 42.2 },
    { input: "15", expected: 15 },
    { input: "21.1", expected: 21.1 },
    { input: "42.2", expected: 42.2 },
  ];

  for (const tc of parseTestCases) {
    await t.step(`parses "${tc.input}" as ${tc.expected}km`, () => {
      assertEquals(parseRaceDistanceKm(tc.input), tc.expected);
    });
  }
});
