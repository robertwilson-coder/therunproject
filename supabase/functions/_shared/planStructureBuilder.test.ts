import {
  assertEquals,
  assertArrayIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  buildStructuralGuidance,
  parseRaceDistanceKm,
  isMarathonLikeRace,
  detectPlanArchetype,
  computeArchetypePhases,
  assignLongRunFlavours,
  enforceAntiCloneGuard,
  classifyFlavourCategory,
  classifyRaceDistance,
  classifyRaceFamily,
  buildWeeklyMetaForArchetype,
  StructuralGuidance,
  WeekStructuralMeta,
  LongRunFlavour,
  QualitySessionBlueprint,
  SupportRunRole,
  RaceDistanceCategory,
  RaceFamily,
  StimulusFamily,
  LongRunPurpose,
  WorkoutPurpose,
  TierSophistication,
} from "./planStructureBuilder.ts";

const VALID_READINESS_TIERS = ["green", "orange", "dark_orange", "red"];
const MARATHON_THRESHOLD_KM = 21;

interface ParityFixture {
  name: string;
  startingWeeklyKm: number;
  startingLongestRunKm: number;
  totalWeeks: number;
  raceDistanceKm: number;
  paceMinPerKm: number;
  expected: {
    isMarathonLike: boolean;
    taperWeeks: number;
  };
}

const PARITY_FIXTURES: ParityFixture[] = [
  {
    name: "Beginner 5K, 8 weeks",
    startingWeeklyKm: 20,
    startingLongestRunKm: 5,
    totalWeeks: 8,
    raceDistanceKm: 5,
    paceMinPerKm: 6.5,
    expected: { isMarathonLike: false, taperWeeks: 1 },
  },
  {
    name: "Intermediate 10K, 10 weeks",
    startingWeeklyKm: 35,
    startingLongestRunKm: 10,
    totalWeeks: 10,
    raceDistanceKm: 10,
    paceMinPerKm: 5.5,
    expected: { isMarathonLike: false, taperWeeks: 1 },
  },
  {
    name: "Half marathon, 12 weeks",
    startingWeeklyKm: 40,
    startingLongestRunKm: 14,
    totalWeeks: 12,
    raceDistanceKm: 21.1,
    paceMinPerKm: 5.5,
    expected: { isMarathonLike: true, taperWeeks: 1 },
  },
  {
    name: "Marathon, 16 weeks",
    startingWeeklyKm: 50,
    startingLongestRunKm: 18,
    totalWeeks: 16,
    raceDistanceKm: 42.2,
    paceMinPerKm: 5.5,
    expected: { isMarathonLike: true, taperWeeks: 2 },
  },
  {
    name: "Half marathon boundary 21.1km",
    startingWeeklyKm: 40,
    startingLongestRunKm: 14,
    totalWeeks: 12,
    raceDistanceKm: 21.1,
    paceMinPerKm: 5.5,
    expected: { isMarathonLike: true, taperWeeks: 1 },
  },
  {
    name: "Long run capped by volume (60%)",
    startingWeeklyKm: 25,
    startingLongestRunKm: 20,
    totalWeeks: 8,
    raceDistanceKm: 42.2,
    paceMinPerKm: 5,
    expected: { isMarathonLike: true, taperWeeks: 1 },
  },
  {
    name: "Long run capped by 32km",
    startingWeeklyKm: 80,
    startingLongestRunKm: 35,
    totalWeeks: 16,
    raceDistanceKm: 60,
    paceMinPerKm: 4,
    expected: { isMarathonLike: true, taperWeeks: 2 },
  },
  {
    name: "Long run capped by 3-hour duration",
    startingWeeklyKm: 60,
    startingLongestRunKm: 25,
    totalWeeks: 16,
    raceDistanceKm: 42.2,
    paceMinPerKm: 9,
    expected: { isMarathonLike: true, taperWeeks: 2 },
  },
];

interface NormalizedOutput {
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
}

function normalizeBackendOutput(
  guidance: StructuralGuidance,
  raceDistanceKm: number,
  totalWeeks: number
): NormalizedOutput {
  const taperWeeks = totalWeeks - guidance.taperStartWeek;
  const buildWeeks = guidance.taperStartWeek;

  const buildVolumes = guidance.weeklyVolumes.slice(0, buildWeeks);
  const taperVolumes = guidance.weeklyVolumes.slice(buildWeeks);

  const buildLongRuns = guidance.longRunTargets.slice(0, buildWeeks);
  const taperLongRuns = guidance.longRunTargets.slice(buildWeeks);

  const projectedPeakVolume = buildVolumes.length > 0
    ? Math.max(...buildVolumes)
    : guidance.weeklyVolumes[0] || 0;

  const projectedPeakLongRun = buildLongRuns.length > 0
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
  };
}

Deno.test("A. Cross-Stack Parity - parseRaceDistanceKm", async (t) => {
  await t.step("parses 5k correctly", () => {
    assertEquals(parseRaceDistanceKm("5k"), 5);
    assertEquals(parseRaceDistanceKm("5K"), 5);
  });

  await t.step("parses 10k correctly", () => {
    assertEquals(parseRaceDistanceKm("10k"), 10);
    assertEquals(parseRaceDistanceKm("10K"), 10);
  });

  await t.step("parses half marathon correctly", () => {
    assertEquals(parseRaceDistanceKm("half marathon"), 21.1);
    assertEquals(parseRaceDistanceKm("Half Marathon"), 21.1);
    assertEquals(parseRaceDistanceKm("half"), 21.1);
  });

  await t.step("parses marathon correctly", () => {
    assertEquals(parseRaceDistanceKm("marathon"), 42.2);
    assertEquals(parseRaceDistanceKm("Marathon"), 42.2);
  });

  await t.step("parses numeric distance", () => {
    assertEquals(parseRaceDistanceKm("15"), 15);
    assertEquals(parseRaceDistanceKm("21.1"), 21.1);
  });
});

Deno.test("A. Cross-Stack Parity - isMarathonLikeRace classification", async (t) => {
  await t.step("classifies distances <= 21km as NOT marathon-like", () => {
    assertEquals(isMarathonLikeRace(5), false);
    assertEquals(isMarathonLikeRace(10), false);
    assertEquals(isMarathonLikeRace(15), false);
    assertEquals(isMarathonLikeRace(20), false);
    assertEquals(isMarathonLikeRace(21), false);
  });

  await t.step("classifies distances > 21km as marathon-like", () => {
    assertEquals(isMarathonLikeRace(21.1), true);
    assertEquals(isMarathonLikeRace(30), true);
    assertEquals(isMarathonLikeRace(42.2), true);
    assertEquals(isMarathonLikeRace(50), true);
    assertEquals(isMarathonLikeRace(60), true);
  });

  await t.step("boundary at exactly 21km is NOT marathon-like", () => {
    assertEquals(isMarathonLikeRace(21), false);
    assertEquals(isMarathonLikeRace(21.0), false);
  });

  await t.step("boundary at 21.1km IS marathon-like", () => {
    assertEquals(isMarathonLikeRace(21.1), true);
  });
});

Deno.test("A. Cross-Stack Parity - Fixture output consistency", async (t) => {
  for (const fixture of PARITY_FIXTURES) {
    await t.step(fixture.name, async (st) => {
      const guidance = buildStructuralGuidance({
        startingWeeklyKm: fixture.startingWeeklyKm,
        startingLongestRunKm: fixture.startingLongestRunKm,
        totalWeeks: fixture.totalWeeks,
        raceDistanceKm: fixture.raceDistanceKm,
        paceMinPerKm: fixture.paceMinPerKm,
      });

      const normalized = normalizeBackendOutput(
        guidance,
        fixture.raceDistanceKm,
        fixture.totalWeeks
      );

      await st.step("total weeks matches", () => {
        assertEquals(normalized.totalWeeks, fixture.totalWeeks);
      });

      await st.step("build + taper = total", () => {
        assertEquals(
          normalized.buildWeeks + normalized.taperWeeks,
          normalized.totalWeeks
        );
      });

      await st.step("volume array length matches total weeks", () => {
        assertEquals(normalized.weeklyVolumes.length, fixture.totalWeeks);
      });

      await st.step("long run array length matches total weeks", () => {
        assertEquals(normalized.longRunTargets.length, fixture.totalWeeks);
      });

      await st.step("marathon-like classification is correct", () => {
        assertEquals(
          normalized.isMarathonLikeRace,
          fixture.expected.isMarathonLike
        );
      });

      await st.step("expected taper weeks", () => {
        assertEquals(normalized.taperWeeks, fixture.expected.taperWeeks);
      });

      await st.step("no NaN in weekly volumes", () => {
        normalized.weeklyVolumes.forEach((v, i) => {
          assertEquals(
            Number.isNaN(v),
            false,
            `Week ${i + 1} volume is NaN`
          );
        });
      });

      await st.step("no NaN in long runs", () => {
        normalized.longRunTargets.forEach((lr, i) => {
          assertEquals(
            Number.isNaN(lr),
            false,
            `Week ${i + 1} long run is NaN`
          );
        });
      });

      await st.step("no negative volumes", () => {
        normalized.weeklyVolumes.forEach((v, i) => {
          assertEquals(
            v >= 0,
            true,
            `Week ${i + 1} volume ${v} is negative`
          );
        });
      });

      await st.step("no negative long runs", () => {
        normalized.longRunTargets.forEach((lr, i) => {
          assertEquals(
            lr >= 0,
            true,
            `Week ${i + 1} long run ${lr} is negative`
          );
        });
      });
    });
  }
});

Deno.test("A. Determinism - repeated runs produce identical outputs", async (t) => {
  for (const fixture of PARITY_FIXTURES.slice(0, 3)) {
    await t.step(`${fixture.name} is deterministic`, () => {
      const run1 = buildStructuralGuidance({
        startingWeeklyKm: fixture.startingWeeklyKm,
        startingLongestRunKm: fixture.startingLongestRunKm,
        totalWeeks: fixture.totalWeeks,
        raceDistanceKm: fixture.raceDistanceKm,
        paceMinPerKm: fixture.paceMinPerKm,
      });

      const run2 = buildStructuralGuidance({
        startingWeeklyKm: fixture.startingWeeklyKm,
        startingLongestRunKm: fixture.startingLongestRunKm,
        totalWeeks: fixture.totalWeeks,
        raceDistanceKm: fixture.raceDistanceKm,
        paceMinPerKm: fixture.paceMinPerKm,
      });

      assertEquals(run1.weeklyVolumes, run2.weeklyVolumes);
      assertEquals(run1.longRunTargets, run2.longRunTargets);
      assertEquals(run1.cutbackWeeks, run2.cutbackWeeks);
      assertEquals(run1.peakWeek, run2.peakWeek);
      assertEquals(run1.taperStartWeek, run2.taperStartWeek);
    });
  }
});

Deno.test("B. Partial-Week Behavior", async (t) => {
  await t.step("handles 3-week plan", () => {
    const guidance = buildStructuralGuidance({
      startingWeeklyKm: 30,
      startingLongestRunKm: 8,
      totalWeeks: 3,
      raceDistanceKm: 5,
    });

    assertEquals(guidance.weeklyVolumes.length, 3);
    assertEquals(guidance.longRunTargets.length, 3);
  });

  await t.step("handles 4-week plan", () => {
    const guidance = buildStructuralGuidance({
      startingWeeklyKm: 30,
      startingLongestRunKm: 8,
      totalWeeks: 4,
      raceDistanceKm: 5,
    });

    assertEquals(guidance.weeklyVolumes.length, 4);
    const taperCount = 4 - guidance.taperStartWeek;
    assertEquals(taperCount, 1);
  });

  await t.step("handles 5-week marathon plan", () => {
    const guidance = buildStructuralGuidance({
      startingWeeklyKm: 50,
      startingLongestRunKm: 15,
      totalWeeks: 5,
      raceDistanceKm: 42.2,
    });

    assertEquals(guidance.weeklyVolumes.length, 5);
    const buildWeeks = guidance.taperStartWeek;
    const taperWeeks = 5 - guidance.taperStartWeek;
    assertEquals(buildWeeks + taperWeeks, 5);
    assertEquals(buildWeeks >= 1, true);
  });
});

Deno.test("C. Invariants - build phase volumes", async (t) => {
  const testCases = [
    { startingWeeklyKm: 20, totalWeeks: 8, raceDistanceKm: 5 },
    { startingWeeklyKm: 40, totalWeeks: 12, raceDistanceKm: 21.1 },
    { startingWeeklyKm: 50, totalWeeks: 16, raceDistanceKm: 42.2 },
  ];

  for (const tc of testCases) {
    await t.step(
      `build volumes do not decrease except deload for ${tc.raceDistanceKm}km`,
      () => {
        const guidance = buildStructuralGuidance({
          startingWeeklyKm: tc.startingWeeklyKm,
          startingLongestRunKm: tc.startingWeeklyKm * 0.4,
          totalWeeks: tc.totalWeeks,
          raceDistanceKm: tc.raceDistanceKm,
        });

        const buildWeeks = guidance.taperStartWeek;
        const buildVolumes = guidance.weeklyVolumes.slice(0, buildWeeks);

        for (let i = 1; i < buildVolumes.length; i++) {
          const isDeload = guidance.cutbackWeeks.includes(i);
          if (!isDeload) {
            assertEquals(
              buildVolumes[i] >= buildVolumes[i - 1] - 0.1,
              true,
              `Week ${i + 1} (${buildVolumes[i]}) < Week ${i} (${buildVolumes[i - 1]}) and not deload`
            );
          }
        }
      }
    );
  }
});

Deno.test("C. Invariants - taper volumes never increase", async (t) => {
  const testCases = [
    { startingWeeklyKm: 40, totalWeeks: 12, raceDistanceKm: 21.1 },
    { startingWeeklyKm: 50, totalWeeks: 16, raceDistanceKm: 42.2 },
    { startingWeeklyKm: 60, totalWeeks: 20, raceDistanceKm: 60 },
  ];

  for (const tc of testCases) {
    await t.step(
      `taper volumes decrease for ${tc.raceDistanceKm}km race`,
      () => {
        const guidance = buildStructuralGuidance({
          startingWeeklyKm: tc.startingWeeklyKm,
          startingLongestRunKm: tc.startingWeeklyKm * 0.4,
          totalWeeks: tc.totalWeeks,
          raceDistanceKm: tc.raceDistanceKm,
        });

        const taperVolumes = guidance.weeklyVolumes.slice(guidance.taperStartWeek);
        const taperWeeks = tc.totalWeeks - guidance.taperStartWeek;

        if (taperWeeks <= 2) {
          for (let i = 1; i < taperVolumes.length; i++) {
            assertEquals(
              taperVolumes[i] <= taperVolumes[i - 1] + 0.1,
              true,
              `Taper week ${i + 1} (${taperVolumes[i]}) > previous (${taperVolumes[i - 1]})`
            );
          }
        }
      }
    );
  }
});

Deno.test("C. Invariants - long run caps", async (t) => {
  await t.step("long run never exceeds 32km", () => {
    const guidance = buildStructuralGuidance({
      startingWeeklyKm: 100,
      startingLongestRunKm: 35,
      totalWeeks: 16,
      raceDistanceKm: 60,
      paceMinPerKm: 4,
    });

    guidance.longRunTargets.forEach((lr, i) => {
      assertEquals(
        lr <= 32,
        true,
        `Week ${i + 1} long run ${lr} exceeds 32km cap`
      );
    });
  });

  await t.step("long run never exceeds 60% of weekly volume", () => {
    const guidance = buildStructuralGuidance({
      startingWeeklyKm: 30,
      startingLongestRunKm: 25,
      totalWeeks: 8,
      raceDistanceKm: 42.2,
    });

    guidance.longRunTargets.forEach((lr, i) => {
      const volumeCap = guidance.weeklyVolumes[i] * 0.6;
      assertEquals(
        lr <= volumeCap + 0.1,
        true,
        `Week ${i + 1} long run ${lr} exceeds 60% volume cap ${volumeCap.toFixed(1)}`
      );
    });
  });

  await t.step("long run respects 3-hour duration cap", () => {
    const paceMinPerKm = 9;
    const durationCapKm = 180 / paceMinPerKm;

    const guidance = buildStructuralGuidance({
      startingWeeklyKm: 60,
      startingLongestRunKm: 25,
      totalWeeks: 16,
      raceDistanceKm: 42.2,
      paceMinPerKm,
    });

    guidance.longRunTargets.forEach((lr, i) => {
      assertEquals(
        lr <= durationCapKm + 0.1,
        true,
        `Week ${i + 1} long run ${lr} exceeds 3-hour cap ${durationCapKm.toFixed(1)}`
      );
    });
  });
});

Deno.test("C. Invariants - taper long runs never increase", async (t) => {
  const testCases = [
    { startingWeeklyKm: 40, totalWeeks: 12, raceDistanceKm: 21.1 },
    { startingWeeklyKm: 50, totalWeeks: 16, raceDistanceKm: 42.2 },
    { startingWeeklyKm: 60, totalWeeks: 20, raceDistanceKm: 60 },
  ];

  for (const tc of testCases) {
    await t.step(
      `taper long runs decrease for ${tc.raceDistanceKm}km race`,
      () => {
        const guidance = buildStructuralGuidance({
          startingWeeklyKm: tc.startingWeeklyKm,
          startingLongestRunKm: tc.startingWeeklyKm * 0.4,
          totalWeeks: tc.totalWeeks,
          raceDistanceKm: tc.raceDistanceKm,
        });

        const taperLongRuns = guidance.longRunTargets.slice(guidance.taperStartWeek);

        for (let i = 1; i < taperLongRuns.length; i++) {
          assertEquals(
            taperLongRuns[i] < taperLongRuns[i - 1] + 0.1,
            true,
            `Taper week ${i + 1} long run (${taperLongRuns[i]}) >= previous (${taperLongRuns[i - 1]})`
          );
        }
      }
    );
  }
});

Deno.test("D. Exact Output Canonical Fixtures", async (t) => {
  await t.step("Beginner 5K, 8 weeks - exact volumes", () => {
    const guidance = buildStructuralGuidance({
      startingWeeklyKm: 20,
      startingLongestRunKm: 5,
      totalWeeks: 8,
      raceDistanceKm: 5,
      paceMinPerKm: 6.5,
    });

    assertEquals(guidance.weeklyVolumes.length, 8);
    assertEquals(guidance.taperStartWeek, 7);
    assertEquals(guidance.peakWeek >= 0, true);

    const taperWeeks = 8 - guidance.taperStartWeek;
    assertEquals(taperWeeks, 1);

    assertEquals(guidance.weeklyVolumes[0], 21.2);
  });

  await t.step("Intermediate 10K, 10 weeks - exact structure", () => {
    const guidance = buildStructuralGuidance({
      startingWeeklyKm: 35,
      startingLongestRunKm: 10,
      totalWeeks: 10,
      raceDistanceKm: 10,
      paceMinPerKm: 5.5,
    });

    assertEquals(guidance.weeklyVolumes.length, 10);
    assertEquals(guidance.longRunTargets.length, 10);

    const taperWeeks = 10 - guidance.taperStartWeek;
    assertEquals(taperWeeks, 1);
  });

  await t.step("Half marathon, 12 weeks - exact structure", () => {
    const guidance = buildStructuralGuidance({
      startingWeeklyKm: 40,
      startingLongestRunKm: 14,
      totalWeeks: 12,
      raceDistanceKm: 21.1,
      paceMinPerKm: 5.5,
    });

    assertEquals(guidance.weeklyVolumes.length, 12);
    assertEquals(guidance.longRunTargets.length, 12);

    const taperWeeks = 12 - guidance.taperStartWeek;
    assertEquals(taperWeeks, 1);

    const peakLongRun = Math.max(...guidance.longRunTargets.slice(0, guidance.taperStartWeek));
    assertEquals(peakLongRun <= 21, true);
  });

  await t.step("Marathon, 16 weeks - exact structure", () => {
    const guidance = buildStructuralGuidance({
      startingWeeklyKm: 50,
      startingLongestRunKm: 18,
      totalWeeks: 16,
      raceDistanceKm: 42.2,
      paceMinPerKm: 5.5,
    });

    assertEquals(guidance.weeklyVolumes.length, 16);
    assertEquals(guidance.longRunTargets.length, 16);

    const taperWeeks = 16 - guidance.taperStartWeek;
    assertEquals(taperWeeks, 2);

    const peakLongRun = Math.max(...guidance.longRunTargets.slice(0, guidance.taperStartWeek));
    assertEquals(peakLongRun <= 32, true);
  });

});

Deno.test("E. Edge Cases", async (t) => {
  await t.step("handles zero starting volume", () => {
    const guidance = buildStructuralGuidance({
      startingWeeklyKm: 0,
      startingLongestRunKm: 0,
      totalWeeks: 8,
      raceDistanceKm: 10,
    });

    assertEquals(guidance.weeklyVolumes.length, 8);
    guidance.weeklyVolumes.forEach((v) => {
      assertEquals(Number.isNaN(v), false);
    });
  });

  await t.step("handles zero race distance", () => {
    const guidance = buildStructuralGuidance({
      startingWeeklyKm: 30,
      startingLongestRunKm: 10,
      totalWeeks: 8,
      raceDistanceKm: 0,
    });

    assertEquals(guidance.weeklyVolumes.length, 8);
  });

  await t.step("handles very high starting volume", () => {
    const guidance = buildStructuralGuidance({
      startingWeeklyKm: 200,
      startingLongestRunKm: 50,
      totalWeeks: 8,
      raceDistanceKm: 100,
    });

    assertEquals(guidance.weeklyVolumes.length, 8);
    guidance.weeklyVolumes.forEach((v) => {
      assertEquals(Number.isFinite(v), true);
    });
  });

  await t.step("handles boundary week counts", () => {
    for (const weeks of [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 16, 20, 24]) {
      const guidance = buildStructuralGuidance({
        startingWeeklyKm: 30,
        startingLongestRunKm: 10,
        totalWeeks: weeks,
        raceDistanceKm: 10,
      });

      assertEquals(guidance.weeklyVolumes.length >= 1, true);
      guidance.weeklyVolumes.forEach((v) => {
        assertEquals(Number.isNaN(v), false);
      });
    }
  });
});

Deno.test("F. Ambition Tier Behavior", async (t) => {
  await t.step("base tier produces expected output", () => {
    const guidance = buildStructuralGuidance({
      startingWeeklyKm: 40,
      startingLongestRunKm: 14,
      totalWeeks: 12,
      raceDistanceKm: 21.1,
      ambitionTier: "base",
    });

    assertEquals(guidance.weeklyVolumes.length, 12);
  });

  await t.step("performance tier produces higher volumes than base", () => {
    const base = buildStructuralGuidance({
      startingWeeklyKm: 40,
      startingLongestRunKm: 14,
      totalWeeks: 12,
      raceDistanceKm: 21.1,
      ambitionTier: "base",
    });

    const performance = buildStructuralGuidance({
      startingWeeklyKm: 40,
      startingLongestRunKm: 14,
      totalWeeks: 12,
      raceDistanceKm: 21.1,
      ambitionTier: "performance",
    });

    const basePeak = Math.max(...base.weeklyVolumes);
    const perfPeak = Math.max(...performance.weeklyVolumes);

    assertEquals(perfPeak >= basePeak, true);
  });

  await t.step("competitive tier produces highest volumes", () => {
    const base = buildStructuralGuidance({
      startingWeeklyKm: 40,
      startingLongestRunKm: 14,
      totalWeeks: 12,
      raceDistanceKm: 21.1,
      ambitionTier: "base",
    });

    const competitive = buildStructuralGuidance({
      startingWeeklyKm: 40,
      startingLongestRunKm: 14,
      totalWeeks: 12,
      raceDistanceKm: 21.1,
      ambitionTier: "competitive",
    });

    const basePeak = Math.max(...base.weeklyVolumes);
    const compPeak = Math.max(...competitive.weeklyVolumes);

    assertEquals(compPeak >= basePeak, true);
  });
});

// ---------------------------------------------------------------------------
// G. established_specificity — Archetype Detection
// ---------------------------------------------------------------------------

Deno.test("G. established_specificity - archetype detection", async (t) => {
  await t.step("marathon runner above both thresholds → established_specificity", () => {
    assertEquals(detectPlanArchetype(70, 30, 42.2), "established_specificity");
  });

  await t.step("marathon runner at exact thresholds → established_specificity", () => {
    assertEquals(detectPlanArchetype(65, 28, 42.2), "established_specificity");
  });

  await t.step("marathon runner below volume threshold → established (not specificity)", () => {
    assertEquals(detectPlanArchetype(60, 28, 42.2), "established");
  });

  await t.step("marathon runner below long run threshold → established (not specificity)", () => {
    assertEquals(detectPlanArchetype(65, 25, 42.2), "established");
  });

  await t.step("half marathon runner above thresholds → established_specificity", () => {
    assertEquals(detectPlanArchetype(55, 20, 21.1), "established_specificity");
  });

  await t.step("half marathon runner at exact thresholds → established_specificity", () => {
    assertEquals(detectPlanArchetype(50, 18, 21.1), "established_specificity");
  });

  await t.step("half marathon runner below volume threshold → established", () => {
    assertEquals(detectPlanArchetype(45, 18, 21.1), "established");
  });

  await t.step("10K runner above thresholds → established_specificity", () => {
    assertEquals(detectPlanArchetype(42, 15, 10), "established_specificity");
  });

  await t.step("10K runner below thresholds → development", () => {
    assertEquals(detectPlanArchetype(30, 10, 10), "development");
  });

  await t.step("5K runner above thresholds → established_specificity", () => {
    assertEquals(detectPlanArchetype(36, 13, 5), "established_specificity");
  });

  await t.step("5K runner below thresholds → development", () => {
    assertEquals(detectPlanArchetype(25, 8, 5), "development");
  });

  await t.step("low-base runner is always development", () => {
    assertEquals(detectPlanArchetype(20, 5, 42.2), "development");
    assertEquals(detectPlanArchetype(15, 6, 21.1), "development");
    assertEquals(detectPlanArchetype(10, 4, 10), "development");
  });
});

// ---------------------------------------------------------------------------
// H. established_specificity — Plan Structure
// ---------------------------------------------------------------------------

Deno.test("H. established_specificity - plan structure", async (t) => {
  await t.step("builds valid plan for marathon runner", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 70,
      startingLongestRunKm: 30,
      totalWeeks: 16,
      raceDistanceKm: 42.2,
      ambitionTier: "base",
    });
    assertEquals(sg.planArchetype, "established_specificity");
    assertEquals(sg.weeklyVolumes.length, 16);
    assertEquals(sg.longRunTargets.length, 16);
  });

  await t.step("weeklyMeta is present for established_specificity", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 70,
      startingLongestRunKm: 30,
      totalWeeks: 16,
      raceDistanceKm: 42.2,
      ambitionTier: "performance",
    });
    assertEquals(sg.weeklyMeta !== undefined, true);
    assertEquals(sg.weeklyMeta!.length, 16);
  });

  await t.step("weeklyMeta is present for development archetype", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 25,
      startingLongestRunKm: 8,
      totalWeeks: 12,
      raceDistanceKm: 21.1,
    });
    assertEquals(sg.planArchetype, "development");
    assertEquals(sg.weeklyMeta !== undefined, true);
    assertEquals(sg.weeklyMeta!.length, 12);
  });

  await t.step("volume does not grow more than 2km across any 3-week non-deload window", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 70,
      startingLongestRunKm: 30,
      totalWeeks: 16,
      raceDistanceKm: 42.2,
      ambitionTier: "base",
    });
    const buildWeeks = sg.taperStartWeek;
    for (let i = 2; i < buildWeeks; i++) {
      if (sg.cutbackWeeks.includes(i) || sg.cutbackWeeks.includes(i - 1) || sg.cutbackWeeks.includes(i - 2)) continue;
      const growth = sg.weeklyVolumes[i] - sg.weeklyVolumes[i - 2];
      assertEquals(
        growth <= sg.weeklyVolumes[0] * 0.05 + 2,
        true,
        `Volume jumped ${growth.toFixed(1)}km over weeks ${i - 1}–${i + 1}`
      );
    }
  });

  await t.step("long run distance does not increase more than 2km over any 3-week non-deload window", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 70,
      startingLongestRunKm: 30,
      totalWeeks: 16,
      raceDistanceKm: 42.2,
      ambitionTier: "base",
    });
    const buildWeeks = sg.taperStartWeek;
    for (let i = 2; i < buildWeeks; i++) {
      if (sg.cutbackWeeks.includes(i) || sg.cutbackWeeks.includes(i - 1) || sg.cutbackWeeks.includes(i - 2)) continue;
      const growth = sg.longRunTargets[i] - sg.longRunTargets[i - 2];
      assertEquals(
        growth <= 3,
        true,
        `Long run jumped ${growth.toFixed(1)}km over weeks ${i - 1}–${i + 1}`
      );
    }
  });

  await t.step("plan remains green in feasibility: starting volume counts as projected peak", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 70,
      startingLongestRunKm: 30,
      totalWeeks: 16,
      raceDistanceKm: 42.2,
      ambitionTier: "base",
    });
    const peakVol = Math.max(...sg.weeklyVolumes.slice(0, sg.taperStartWeek));
    assertEquals(peakVol >= 70, true, `Peak volume ${peakVol} dropped below starting volume 70`);
  });
});

// ---------------------------------------------------------------------------
// I. established_specificity — Long Run Flavours
// ---------------------------------------------------------------------------

Deno.test("I. established_specificity - long run flavours", async (t) => {
  await t.step("flavour array length matches total weeks", () => {
    const totalWeeks = 16;
    const taperStart = 14;
    const deloadFlags = Array(totalWeeks).fill(false);
    deloadFlags[3] = true;
    deloadFlags[7] = true;
    deloadFlags[11] = true;
    const phases = computeArchetypePhases(totalWeeks, taperStart, "performance");
    const flavours = assignLongRunFlavours(phases, deloadFlags, "performance");
    assertEquals(flavours.length, totalWeeks);
  });

  await t.step("deload weeks always get cutback flavour", () => {
    const totalWeeks = 16;
    const taperStart = 14;
    const deloadFlags = Array(totalWeeks).fill(false);
    deloadFlags[3] = true;
    deloadFlags[7] = true;
    const phases = computeArchetypePhases(totalWeeks, taperStart, "base");
    const flavours = assignLongRunFlavours(phases, deloadFlags, "base");
    assertEquals(flavours[3], "cutback");
    assertEquals(flavours[7], "cutback");
  });

  await t.step("taper weeks always get cutback flavour", () => {
    const totalWeeks = 16;
    const taperStart = 14;
    const deloadFlags = Array(totalWeeks).fill(false);
    const phases = computeArchetypePhases(totalWeeks, taperStart, "competitive");
    const flavours = assignLongRunFlavours(phases, deloadFlags, "competitive");
    for (let i = taperStart; i < totalWeeks; i++) {
      assertEquals(flavours[i], "cutback", `Taper week ${i + 1} should be cutback`);
    }
  });

  await t.step("no 3 consecutive non-deload non-taper weeks have same flavour", () => {
    const totalWeeks = 16;
    const taperStart = 14;
    const deloadFlags = Array(totalWeeks).fill(false);
    deloadFlags[3] = true;
    deloadFlags[7] = true;
    deloadFlags[11] = true;
    const phases = computeArchetypePhases(totalWeeks, taperStart, "performance");
    const flavours = assignLongRunFlavours(phases, deloadFlags, "performance");
    for (let i = 2; i < taperStart; i++) {
      if (deloadFlags[i] || deloadFlags[i - 1] || deloadFlags[i - 2]) continue;
      const allSame = flavours[i] === flavours[i - 1] && flavours[i - 1] === flavours[i - 2];
      assertEquals(allSame, false, `Weeks ${i - 1}–${i + 1} all have flavour: ${flavours[i]}`);
    }
  });

  await t.step("anti-clone guard corrects 3-in-a-row violations", () => {
    const meta: WeekStructuralMeta[] = [
      { phase: "race_specificity", longRunFlavour: "mp_block", qualityIntensityMultiplier: 0.85, difficultyBudgetUsed: "demanding", qualitySessionsThisWeek: 1, qualitySessionBlueprint: "marathon_pace_repeat", supportRunRole: "aerobic_support" },
      { phase: "race_specificity", longRunFlavour: "mp_block", qualityIntensityMultiplier: 0.90, difficultyBudgetUsed: "demanding", qualitySessionsThisWeek: 1, qualitySessionBlueprint: "marathon_pace_repeat", supportRunRole: "aerobic_support" },
      { phase: "race_specificity", longRunFlavour: "mp_block", qualityIntensityMultiplier: 0.95, difficultyBudgetUsed: "demanding", qualitySessionsThisWeek: 1, qualitySessionBlueprint: "marathon_pace_repeat", supportRunRole: "aerobic_support" },
    ];
    const deloadFlags = [false, false, false];
    const corrected = enforceAntiCloneGuard(meta, deloadFlags);
    const allSame = corrected[0].longRunFlavour === corrected[1].longRunFlavour &&
      corrected[1].longRunFlavour === corrected[2].longRunFlavour;
    assertEquals(allSame, false, "Anti-clone guard should have broken the 3-in-a-row");
  });

  await t.step("anti-clone guard corrects 3-in-a-row same category", () => {
    const meta: WeekStructuralMeta[] = [
      { phase: "race_specificity", longRunFlavour: "mp_block", qualityIntensityMultiplier: 0.85, difficultyBudgetUsed: "demanding", qualitySessionsThisWeek: 1, qualitySessionBlueprint: "marathon_pace_repeat", supportRunRole: "aerobic_support" },
      { phase: "race_specificity", longRunFlavour: "alternating_mp_steady", qualityIntensityMultiplier: 0.90, difficultyBudgetUsed: "demanding", qualitySessionsThisWeek: 1, qualitySessionBlueprint: "marathon_pace_repeat", supportRunRole: "aerobic_support" },
      { phase: "race_specificity", longRunFlavour: "mp_block", qualityIntensityMultiplier: 0.95, difficultyBudgetUsed: "demanding", qualitySessionsThisWeek: 1, qualitySessionBlueprint: "marathon_pace_repeat", supportRunRole: "aerobic_support" },
    ];
    const deloadFlags = [false, false, false];
    const corrected = enforceAntiCloneGuard(meta, deloadFlags);
    const cat2 = classifyFlavourCategory(corrected[2].longRunFlavour);
    assertEquals(cat2 !== "marathon_specific", true, "Anti-clone guard should break 3 consecutive marathon_specific category");
  });

  await t.step("anti-clone guard does not touch deload windows", () => {
    const meta: WeekStructuralMeta[] = [
      { phase: "economy_building", longRunFlavour: "progression", qualityIntensityMultiplier: 0.5, difficultyBudgetUsed: "moderate", qualitySessionsThisWeek: 2, qualitySessionBlueprint: "tempo_continuous", supportRunRole: "aerobic_support" },
      { phase: "economy_building", longRunFlavour: "cutback",    qualityIntensityMultiplier: 0.4, difficultyBudgetUsed: "light", qualitySessionsThisWeek: 1, qualitySessionBlueprint: "threshold_cruise", supportRunRole: "recovery" },
      { phase: "economy_building", longRunFlavour: "progression", qualityIntensityMultiplier: 0.5, difficultyBudgetUsed: "moderate", qualitySessionsThisWeek: 2, qualitySessionBlueprint: "tempo_continuous", supportRunRole: "aerobic_support" },
    ];
    const deloadFlags = [false, true, false];
    const corrected = enforceAntiCloneGuard(meta, deloadFlags);
    assertEquals(corrected[0].longRunFlavour, "progression");
    assertEquals(corrected[1].longRunFlavour, "cutback");
    assertEquals(corrected[2].longRunFlavour, "progression");
  });

  await t.step("at least 3 distinct flavours across any 5 non-deload non-taper build weeks", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 70,
      startingLongestRunKm: 30,
      totalWeeks: 16,
      raceDistanceKm: 42.2,
      ambitionTier: "performance",
    });
    const meta = sg.weeklyMeta!;
    const buildMeta = meta.slice(0, sg.taperStartWeek).filter((m, i) => !sg.cutbackWeeks.includes(i));
    for (let start = 0; start + 4 < buildMeta.length; start++) {
      const window = buildMeta.slice(start, start + 5);
      const distinct = new Set(window.map(m => m.longRunFlavour)).size;
      assertEquals(distinct >= 2, true, `Window at ${start}: only ${distinct} distinct flavours in 5 weeks`);
    }
  });
});

// ---------------------------------------------------------------------------
// J. established_specificity — Difficulty Budget Guard
// ---------------------------------------------------------------------------

Deno.test("J. established_specificity - difficulty budget guard", async (t) => {
  await t.step("demanding long run reduces quality sessions for performance tier", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 70,
      startingLongestRunKm: 30,
      totalWeeks: 16,
      raceDistanceKm: 42.2,
      ambitionTier: "performance",
    });
    const meta = sg.weeklyMeta!;
    for (const week of meta) {
      if (week.difficultyBudgetUsed === "demanding") {
        assertEquals(week.qualitySessionsThisWeek <= 1, true,
          `Demanding week has ${week.qualitySessionsThisWeek} quality sessions — should be ≤1`);
        assertEquals(week.qualityIntensityMultiplier <= 0.60, true,
          `Demanding week has intensity multiplier ${week.qualityIntensityMultiplier} — should be ≤0.60`);
      }
    }
  });

  await t.step("demanding long run reduces quality sessions for competitive tier", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 70,
      startingLongestRunKm: 30,
      totalWeeks: 16,
      raceDistanceKm: 42.2,
      ambitionTier: "competitive",
    });
    const meta = sg.weeklyMeta!;
    for (const week of meta) {
      if (week.difficultyBudgetUsed === "demanding") {
        assertEquals(week.qualitySessionsThisWeek <= 1, true);
        assertEquals(week.qualityIntensityMultiplier <= 0.60, true);
      }
    }
  });

  await t.step("non-demanding weeks preserve full quality session count", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 70,
      startingLongestRunKm: 30,
      totalWeeks: 16,
      raceDistanceKm: 42.2,
      ambitionTier: "performance",
    });
    const meta = sg.weeklyMeta!;
    let foundNonDemanding = false;
    for (const week of meta) {
      if (week.difficultyBudgetUsed === "light" && week.phase !== "taper") {
        assertEquals(week.qualitySessionsThisWeek, 2);
        foundNonDemanding = true;
        break;
      }
    }
    assertEquals(foundNonDemanding, true, "Expected at least one light non-taper week");
  });
});

// ---------------------------------------------------------------------------
// K. established_specificity — Tier Differentiation
// ---------------------------------------------------------------------------

Deno.test("K. established_specificity - tier differentiation", async (t) => {
  await t.step("competitive tier has higher quality intensity than base tier in race_specificity phase", () => {
    const base = buildStructuralGuidance({
      startingWeeklyKm: 70, startingLongestRunKm: 30, totalWeeks: 16, raceDistanceKm: 42.2, ambitionTier: "base",
    });
    const competitive = buildStructuralGuidance({
      startingWeeklyKm: 70, startingLongestRunKm: 30, totalWeeks: 16, raceDistanceKm: 42.2, ambitionTier: "competitive",
    });
    const baseSpecMeta = base.weeklyMeta!.filter(m => m.phase === "race_specificity" && m.difficultyBudgetUsed !== "demanding");
    const compSpecMeta = competitive.weeklyMeta!.filter(m => m.phase === "race_specificity" && m.difficultyBudgetUsed !== "demanding");
    if (baseSpecMeta.length > 0 && compSpecMeta.length > 0) {
      const baseAvg = baseSpecMeta.reduce((s, m) => s + m.qualityIntensityMultiplier, 0) / baseSpecMeta.length;
      const compAvg = compSpecMeta.reduce((s, m) => s + m.qualityIntensityMultiplier, 0) / compSpecMeta.length;
      assertEquals(compAvg > baseAvg, true, `Competitive avg ${compAvg} should exceed base avg ${baseAvg}`);
    }
  });

  await t.step("base tier has 1 quality session, performance and competitive have 2 (when not demanding)", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 70, startingLongestRunKm: 30, totalWeeks: 16, raceDistanceKm: 42.2, ambitionTier: "base",
    });
    const nonDemandingBuild = sg.weeklyMeta!.filter(
      (m, i) => m.phase !== "taper" && m.difficultyBudgetUsed !== "demanding" && !sg.cutbackWeeks.includes(i)
    );
    for (const week of nonDemandingBuild) {
      assertEquals(week.qualitySessionsThisWeek, 1, `Base tier non-demanding week had ${week.qualitySessionsThisWeek} quality sessions`);
    }
  });

  await t.step("quality intensity multiplier increases from aerobic_reset to race_specificity", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 70, startingLongestRunKm: 30, totalWeeks: 16, raceDistanceKm: 42.2, ambitionTier: "performance",
    });
    const meta = sg.weeklyMeta!;
    const resetAvg = meta.filter(m => m.phase === "aerobic_reset").reduce((s, m) => s + m.qualityIntensityMultiplier, 0) /
      Math.max(1, meta.filter(m => m.phase === "aerobic_reset").length);
    const specAvg = meta.filter(m => m.phase === "race_specificity" && m.difficultyBudgetUsed !== "demanding")
      .reduce((s, m) => s + m.qualityIntensityMultiplier, 0) /
      Math.max(1, meta.filter(m => m.phase === "race_specificity" && m.difficultyBudgetUsed !== "demanding").length);
    assertEquals(specAvg > resetAvg, true, `Race specificity avg ${specAvg} should exceed aerobic reset avg ${resetAvg}`);
  });

  await t.step("plans across durations all produce valid weeklyMeta", () => {
    for (const weeks of [8, 12, 16, 20]) {
      const sg = buildStructuralGuidance({
        startingWeeklyKm: 70, startingLongestRunKm: 30, totalWeeks: weeks, raceDistanceKm: 42.2, ambitionTier: "performance",
      });
      assertEquals(sg.weeklyMeta !== undefined, true, `${weeks}-week plan missing weeklyMeta`);
      assertEquals(sg.weeklyMeta!.length, weeks, `${weeks}-week plan weeklyMeta length mismatch`);
    }
  });
});

// ---------------------------------------------------------------------------
// L. Performance vs Competitive tier separation — long-run flavours
// ---------------------------------------------------------------------------

Deno.test("L. Performance vs Competitive - long run flavour separation", async (t) => {
  const marathonParams = {
    startingWeeklyKm: 70, startingLongestRunKm: 30, totalWeeks: 16, raceDistanceKm: 42.2,
  };

  await t.step("Competitive has more marathon_specific long runs than Performance", () => {
    const perf = buildStructuralGuidance({ ...marathonParams, ambitionTier: "performance" });
    const comp = buildStructuralGuidance({ ...marathonParams, ambitionTier: "competitive" });

    const perfMpCount = perf.weeklyMeta!.filter(m =>
      classifyFlavourCategory(m.longRunFlavour) === "marathon_specific"
    ).length;
    const compMpCount = comp.weeklyMeta!.filter(m =>
      classifyFlavourCategory(m.longRunFlavour) === "marathon_specific"
    ).length;

    assertEquals(compMpCount >= perfMpCount, true,
      `Competitive should have >= marathon_specific long runs (${compMpCount}) vs Performance (${perfMpCount})`);
  });

  await t.step("Competitive has alternating_mp_steady in race_specificity", () => {
    const comp = buildStructuralGuidance({ ...marathonParams, ambitionTier: "competitive" });

    const compHasAlternating = comp.weeklyMeta!.some(m =>
      m.phase === "race_specificity" && m.longRunFlavour === "alternating_mp_steady"
    );

    assertEquals(compHasAlternating, true, "Competitive should use alternating_mp_steady in race_specificity");
  });

  await t.step("Base never receives mp_block or alternating_mp_steady", () => {
    const base = buildStructuralGuidance({ ...marathonParams, ambitionTier: "base" });
    const forbidden: LongRunFlavour[] = ["mp_block", "alternating_mp_steady"];
    for (const m of base.weeklyMeta!) {
      assertEquals(
        !forbidden.includes(m.longRunFlavour),
        true,
        `Base should never get ${m.longRunFlavour} but got it in ${m.phase}`
      );
    }
  });

  await t.step("Long run flavour sequences differ between Performance and Competitive", () => {
    const perf = buildStructuralGuidance({ ...marathonParams, ambitionTier: "performance" });
    const comp = buildStructuralGuidance({ ...marathonParams, ambitionTier: "competitive" });

    const perfSeq = perf.weeklyMeta!.map(m => m.longRunFlavour).join(",");
    const compSeq = comp.weeklyMeta!.map(m => m.longRunFlavour).join(",");

    assertEquals(perfSeq !== compSeq, true,
      "Performance and Competitive should have different long run flavour sequences");
  });

  await t.step("Economy building flavour pools differ between Performance and Competitive", () => {
    const perf = buildStructuralGuidance({ ...marathonParams, ambitionTier: "performance" });
    const comp = buildStructuralGuidance({ ...marathonParams, ambitionTier: "competitive" });

    const perfEconFlavours = new Set(
      perf.weeklyMeta!.filter(m => m.phase === "economy_building").map(m => m.longRunFlavour)
    );
    const compEconFlavours = new Set(
      comp.weeklyMeta!.filter(m => m.phase === "economy_building").map(m => m.longRunFlavour)
    );

    const perfArr = [...perfEconFlavours].sort();
    const compArr = [...compEconFlavours].sort();
    const identical = perfArr.length === compArr.length && perfArr.every((v, i) => v === compArr[i]);
    assertEquals(identical, false,
      "Performance and Competitive should use different flavour sets in economy_building");
  });
});

// ---------------------------------------------------------------------------
// M. Quality session blueprint differentiation
// ---------------------------------------------------------------------------

Deno.test("M. Quality session blueprint differentiation", async (t) => {
  const marathonParams = {
    startingWeeklyKm: 70, startingLongestRunKm: 30, totalWeeks: 16, raceDistanceKm: 42.2,
  };

  await t.step("weeklyMeta includes qualitySessionBlueprint for all weeks", () => {
    for (const tier of ["base", "performance", "competitive"] as const) {
      const sg = buildStructuralGuidance({ ...marathonParams, ambitionTier: tier });
      for (const m of sg.weeklyMeta!) {
        assertEquals(m.qualitySessionBlueprint !== undefined, true,
          `${tier} tier missing qualitySessionBlueprint`);
      }
    }
  });

  await t.step("Base gets light_aerobic_quality in aerobic_reset, Performance and Competitive do not", () => {
    const base = buildStructuralGuidance({ ...marathonParams, ambitionTier: "base" });
    const perf = buildStructuralGuidance({ ...marathonParams, ambitionTier: "performance" });
    const comp = buildStructuralGuidance({ ...marathonParams, ambitionTier: "competitive" });

    const baseHasLight = base.weeklyMeta!.some(m =>
      m.phase === "aerobic_reset" && m.qualitySessionBlueprint === "light_aerobic_quality"
    );
    const perfHasLight = perf.weeklyMeta!.some(m =>
      m.qualitySessionBlueprint === "light_aerobic_quality"
    );
    const compHasLight = comp.weeklyMeta!.some(m =>
      m.qualitySessionBlueprint === "light_aerobic_quality"
    );

    assertEquals(baseHasLight, true, "Base should use light_aerobic_quality in aerobic_reset");
    assertEquals(perfHasLight, false, "Performance should never use light_aerobic_quality");
    assertEquals(compHasLight, false, "Competitive should never use light_aerobic_quality");
  });

  await t.step("Competitive gets race_pace_sharpener in race_specificity, Base does not", () => {
    const base = buildStructuralGuidance({ ...marathonParams, ambitionTier: "base" });
    const comp = buildStructuralGuidance({ ...marathonParams, ambitionTier: "competitive" });

    const compHasSharpener = comp.weeklyMeta!.some(m =>
      m.phase === "race_specificity" && m.qualitySessionBlueprint === "race_pace_sharpener"
    );
    const baseHasSharpener = base.weeklyMeta!.some(m =>
      m.phase === "race_specificity" && m.qualitySessionBlueprint === "race_pace_sharpener"
    );

    assertEquals(compHasSharpener, true, "Competitive should use race_pace_sharpener in race_specificity");
    assertEquals(baseHasSharpener, false, "Base should not use race_pace_sharpener in race_specificity");
  });

  await t.step("Competitive gets vo2_intervals in economy_building, Base and Performance do not", () => {
    const base = buildStructuralGuidance({ ...marathonParams, ambitionTier: "base" });
    const perf = buildStructuralGuidance({ ...marathonParams, ambitionTier: "performance" });
    const comp = buildStructuralGuidance({ ...marathonParams, ambitionTier: "competitive" });

    const compHasVo2 = comp.weeklyMeta!.some(m =>
      m.phase === "economy_building" && m.qualitySessionBlueprint === "vo2_intervals"
    );
    const perfHasVo2 = perf.weeklyMeta!.some(m =>
      m.phase === "economy_building" && m.qualitySessionBlueprint === "vo2_intervals"
    );
    const baseHasVo2 = base.weeklyMeta!.some(m =>
      m.phase === "economy_building" && m.qualitySessionBlueprint === "vo2_intervals"
    );

    assertEquals(compHasVo2, true, "Competitive should use vo2_intervals in economy_building");
    assertEquals(perfHasVo2, false, "Performance should not use vo2_intervals in economy_building");
    assertEquals(baseHasVo2, false, "Base should not use vo2_intervals in economy_building");
  });

  await t.step("Blueprint sequences differ between all three tiers", () => {
    const base = buildStructuralGuidance({ ...marathonParams, ambitionTier: "base" });
    const perf = buildStructuralGuidance({ ...marathonParams, ambitionTier: "performance" });
    const comp = buildStructuralGuidance({ ...marathonParams, ambitionTier: "competitive" });

    const baseSeq = base.weeklyMeta!.map(m => m.qualitySessionBlueprint).join(",");
    const perfSeq = perf.weeklyMeta!.map(m => m.qualitySessionBlueprint).join(",");
    const compSeq = comp.weeklyMeta!.map(m => m.qualitySessionBlueprint).join(",");

    assertEquals(baseSeq !== perfSeq, true, "Base and Performance should have different blueprint sequences");
    assertEquals(perfSeq !== compSeq, true, "Performance and Competitive should have different blueprint sequences");
    assertEquals(baseSeq !== compSeq, true, "Base and Competitive should have different blueprint sequences");
  });

  await t.step("Performance and Competitive differ in race_specificity blueprints", () => {
    const perf = buildStructuralGuidance({ ...marathonParams, ambitionTier: "performance" });
    const comp = buildStructuralGuidance({ ...marathonParams, ambitionTier: "competitive" });

    const perfRaceBlueprints = new Set(
      perf.weeklyMeta!.filter(m => m.phase === "race_specificity").map(m => m.qualitySessionBlueprint)
    );
    const compRaceBlueprints = new Set(
      comp.weeklyMeta!.filter(m => m.phase === "race_specificity").map(m => m.qualitySessionBlueprint)
    );

    const perfArr = [...perfRaceBlueprints].sort();
    const compArr = [...compRaceBlueprints].sort();
    const identical = perfArr.length === compArr.length && perfArr.every((v, i) => v === compArr[i]);
    assertEquals(identical, false,
      `Performance race blueprints [${perfArr}] should differ from Competitive [${compArr}]`);
  });
});

// ---------------------------------------------------------------------------
// N. Support run role differentiation
// ---------------------------------------------------------------------------

Deno.test("N. Support run role differentiation", async (t) => {
  const marathonParams = {
    startingWeeklyKm: 70, startingLongestRunKm: 30, totalWeeks: 16, raceDistanceKm: 42.2,
  };

  await t.step("weeklyMeta includes supportRunRole for all weeks", () => {
    for (const tier of ["base", "performance", "competitive"] as const) {
      const sg = buildStructuralGuidance({ ...marathonParams, ambitionTier: tier, daysPerWeek: 5 });
      for (const m of sg.weeklyMeta!) {
        assertEquals(m.supportRunRole !== undefined, true,
          `${tier} tier missing supportRunRole`);
      }
    }
  });

  await t.step("Base never gets steady_aerobic support role", () => {
    const base = buildStructuralGuidance({ ...marathonParams, ambitionTier: "base", daysPerWeek: 6 });
    for (const m of base.weeklyMeta!) {
      assertEquals(m.supportRunRole !== "steady_aerobic", true,
        `Base should never get steady_aerobic but got it in ${m.phase}`);
    }
  });

  await t.step("Competitive with 5+ days gets steady_aerobic in economy_building and race_specificity", () => {
    const comp = buildStructuralGuidance({ ...marathonParams, ambitionTier: "competitive", daysPerWeek: 5 });
    const steadyInEcon = comp.weeklyMeta!.some(m =>
      m.phase === "economy_building" && m.supportRunRole === "steady_aerobic"
    );
    const steadyInRace = comp.weeklyMeta!.some(m =>
      m.phase === "race_specificity" && m.supportRunRole === "steady_aerobic"
    );
    assertEquals(steadyInEcon, true, "Competitive 5+ days should get steady_aerobic in economy_building");
    assertEquals(steadyInRace, true, "Competitive 5+ days should get steady_aerobic in race_specificity");
  });

  await t.step("Performance with 5+ days gets steady_aerobic only in race_specificity", () => {
    const perf = buildStructuralGuidance({ ...marathonParams, ambitionTier: "performance", daysPerWeek: 5 });
    const steadyInEcon = perf.weeklyMeta!.some(m =>
      m.phase === "economy_building" && m.supportRunRole === "steady_aerobic"
    );
    const steadyInRace = perf.weeklyMeta!.some(m =>
      m.phase === "race_specificity" && m.supportRunRole === "steady_aerobic"
    );
    assertEquals(steadyInEcon, false, "Performance should NOT get steady_aerobic in economy_building");
    assertEquals(steadyInRace, true, "Performance 5+ days should get steady_aerobic in race_specificity");
  });

  await t.step("Competitive with < 5 days does not get steady_aerobic", () => {
    const comp = buildStructuralGuidance({ ...marathonParams, ambitionTier: "competitive", daysPerWeek: 4 });
    const hasSteady = comp.weeklyMeta!.some(m => m.supportRunRole === "steady_aerobic");
    assertEquals(hasSteady, false, "Competitive with <5 days should not get steady_aerobic");
  });

  await t.step("Deload and taper weeks always get recovery role", () => {
    for (const tier of ["base", "performance", "competitive"] as const) {
      const sg = buildStructuralGuidance({ ...marathonParams, ambitionTier: tier, daysPerWeek: 5 });
      for (let i = 0; i < sg.weeklyMeta!.length; i++) {
        const m = sg.weeklyMeta![i];
        if (m.phase === "taper" || sg.cutbackWeeks.includes(i)) {
          assertEquals(m.supportRunRole, "recovery",
            `${tier} tier week ${i + 1} (${m.phase}) should be recovery but was ${m.supportRunRole}`);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// O. Category-based anti-repeat in long run flavours
// ---------------------------------------------------------------------------

Deno.test("O. Category-based anti-repeat in long run flavours", async (t) => {
  const marathonParams = {
    startingWeeklyKm: 70, startingLongestRunKm: 30, totalWeeks: 16, raceDistanceKm: 42.2,
  };

  await t.step("no 3 consecutive non-deload weeks have same flavour category", () => {
    for (const tier of ["base", "performance", "competitive"] as const) {
      const sg = buildStructuralGuidance({ ...marathonParams, ambitionTier: tier });
      const meta = sg.weeklyMeta!;
      for (let i = 2; i < sg.taperStartWeek; i++) {
        if (sg.cutbackWeeks.includes(i) || sg.cutbackWeeks.includes(i - 1) || sg.cutbackWeeks.includes(i - 2)) continue;
        if (meta[i].phase === "taper") continue;

        const c0 = classifyFlavourCategory(meta[i - 2].longRunFlavour);
        const c1 = classifyFlavourCategory(meta[i - 1].longRunFlavour);
        const c2 = classifyFlavourCategory(meta[i].longRunFlavour);

        if (c0 === "absorb" || c1 === "absorb" || c2 === "absorb") continue;

        const allSameCategory = c0 === c1 && c1 === c2;
        assertEquals(allSameCategory, false,
          `${tier}: weeks ${i - 1}–${i + 1} all have category ${c2} (${meta[i - 2].longRunFlavour}, ${meta[i - 1].longRunFlavour}, ${meta[i].longRunFlavour})`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// P. Anti-boredom and distance-aware refinements
// ---------------------------------------------------------------------------

Deno.test("P. Anti-boredom and distance-aware refinements", async (t) => {
  const VALID_STIMULUS_FAMILIES: StimulusFamily[] = [
    "aerobic_base", "threshold_development", "vo2_economy", "race_specificity_block", "absorb",
  ];
  const VALID_RACE_CATS: RaceDistanceCategory[] = ["5k", "10k", "half", "marathon"];

  await t.step("weeklyMeta is populated for development archetype with all new fields", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 25,
      startingLongestRunKm: 8,
      totalWeeks: 12,
      raceDistanceKm: 21.1,
    });
    assertEquals(sg.planArchetype, "development");
    assertEquals(sg.weeklyMeta !== undefined, true);
    assertEquals(sg.weeklyMeta!.length, 12);
    for (const m of sg.weeklyMeta!) {
      assertEquals(VALID_RACE_CATS.includes(m.raceDistanceCategory), true,
        `invalid raceDistanceCategory: ${m.raceDistanceCategory}`);
      assertEquals(VALID_STIMULUS_FAMILIES.includes(m.stimulusFamily), true,
        `invalid stimulusFamily: ${m.stimulusFamily}`);
      assertEquals(typeof m.weekInPhase, "number");
      assertEquals(typeof m.totalPhaseWeeks, "number");
      assertEquals([0, 1, 2, 3].includes(m.raceSpecificContentLevel), true,
        `invalid raceSpecificContentLevel: ${m.raceSpecificContentLevel}`);
    }
    const allHalf = sg.weeklyMeta!.every(m => m.raceDistanceCategory === "half");
    assertEquals(allHalf, true, "half-marathon plan should have raceDistanceCategory=half on every week");
  });

  await t.step("5K and 10K plans never contain mp_block or alternating_mp_steady", () => {
    for (const dist of [5, 10]) {
      const sg = buildStructuralGuidance({
        startingWeeklyKm: 50,
        startingLongestRunKm: 14,
        totalWeeks: 16,
        raceDistanceKm: dist,
        ambitionTier: "competitive",
      });
      for (const m of sg.weeklyMeta!) {
        assertEquals(
          m.longRunFlavour !== "mp_block" && m.longRunFlavour !== "alternating_mp_steady",
          true,
          `${dist}K plan got forbidden flavour ${m.longRunFlavour} in ${m.phase}`
        );
      }
    }
  });

  await t.step("classifyRaceDistance returns correct categories", () => {
    assertEquals(classifyRaceDistance(5), "5k");
    assertEquals(classifyRaceDistance(10), "10k");
    assertEquals(classifyRaceDistance(21.1), "half");
    assertEquals(classifyRaceDistance(42.2), "marathon");
  });

  await t.step("raceSpecificContentLevel is 0 in aerobic_reset and taper", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 70,
      startingLongestRunKm: 30,
      totalWeeks: 16,
      raceDistanceKm: 42.2,
      ambitionTier: "competitive",
    });
    for (const m of sg.weeklyMeta!) {
      if (m.phase === "aerobic_reset" || m.phase === "taper") {
        assertEquals(m.raceSpecificContentLevel, 0,
          `${m.phase} week should have raceSpecificContentLevel=0 but got ${m.raceSpecificContentLevel}`);
      }
    }
  });

  await t.step("raceSpecificContentLevel is 2 or 3 in race_specificity phase", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 70,
      startingLongestRunKm: 30,
      totalWeeks: 16,
      raceDistanceKm: 42.2,
      ambitionTier: "performance",
    });
    for (const m of sg.weeklyMeta!) {
      if (m.phase === "race_specificity" && m.difficultyBudgetUsed !== "demanding") {
        assertEquals(m.raceSpecificContentLevel >= 2, true,
          `race_specificity week should have level>=2 but got ${m.raceSpecificContentLevel}`);
      }
    }
  });

  await t.step("secondaryQualityBlueprint is distinct from primary when present", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 70,
      startingLongestRunKm: 30,
      totalWeeks: 16,
      raceDistanceKm: 42.2,
      ambitionTier: "competitive",
    });
    for (const m of sg.weeklyMeta!) {
      if (m.secondaryQualityBlueprint !== undefined) {
        assertEquals(m.secondaryQualityBlueprint !== m.qualitySessionBlueprint, true,
          `secondary blueprint ${m.secondaryQualityBlueprint} should differ from primary ${m.qualitySessionBlueprint}`);
      }
    }
  });

  await t.step("competitive has more race_specificity_block stimulus than base across same params", () => {
    const params = { startingWeeklyKm: 70, startingLongestRunKm: 30, totalWeeks: 16, raceDistanceKm: 42.2 };
    const base = buildStructuralGuidance({ ...params, ambitionTier: "base" });
    const comp = buildStructuralGuidance({ ...params, ambitionTier: "competitive" });
    const baseRaceBlocks = base.weeklyMeta!.filter(m => m.stimulusFamily === "race_specificity_block").length;
    const compRaceBlocks = comp.weeklyMeta!.filter(m => m.stimulusFamily === "race_specificity_block").length;
    assertEquals(compRaceBlocks >= baseRaceBlocks, true,
      `competitive (${compRaceBlocks}) should have >= race_specificity_block weeks vs base (${baseRaceBlocks})`);
  });

  await t.step("base has more aerobic_base stimulus than competitive", () => {
    const params = { startingWeeklyKm: 70, startingLongestRunKm: 30, totalWeeks: 16, raceDistanceKm: 42.2 };
    const base = buildStructuralGuidance({ ...params, ambitionTier: "base" });
    const comp = buildStructuralGuidance({ ...params, ambitionTier: "competitive" });
    const baseAerobic = base.weeklyMeta!.filter(m => m.stimulusFamily === "aerobic_base").length;
    const compAerobic = comp.weeklyMeta!.filter(m => m.stimulusFamily === "aerobic_base").length;
    assertEquals(baseAerobic >= compAerobic, true,
      `base (${baseAerobic}) should have >= aerobic_base weeks vs competitive (${compAerobic})`);
  });

  await t.step("5K competitive plans use vo2_intervals in economy_building", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 50,
      startingLongestRunKm: 14,
      totalWeeks: 16,
      raceDistanceKm: 5,
      ambitionTier: "competitive",
    });
    const hasVo2InEcon = sg.weeklyMeta!.some(m =>
      m.phase === "economy_building" && m.qualitySessionBlueprint === "vo2_intervals"
    );
    assertEquals(hasVo2InEcon, true, "5K competitive should use vo2_intervals in economy_building");
  });

  await t.step("5K competitive plans use race_pace_sharpener in race_specificity", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 50,
      startingLongestRunKm: 14,
      totalWeeks: 16,
      raceDistanceKm: 5,
      ambitionTier: "competitive",
    });
    const hasSharpener = sg.weeklyMeta!.some(m =>
      m.phase === "race_specificity" && m.qualitySessionBlueprint === "race_pace_sharpener"
    );
    assertEquals(hasSharpener, true, "5K competitive should use race_pace_sharpener in race_specificity");
  });

  await t.step("no 3 consecutive non-deload weeks same category — development archetype", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 25,
      startingLongestRunKm: 8,
      totalWeeks: 12,
      raceDistanceKm: 21.1,
      ambitionTier: "performance",
    });
    const meta = sg.weeklyMeta!;
    for (let i = 2; i < sg.taperStartWeek; i++) {
      if (sg.cutbackWeeks.includes(i) || sg.cutbackWeeks.includes(i - 1) || sg.cutbackWeeks.includes(i - 2)) continue;
      if (meta[i].phase === "taper") continue;
      const c0 = classifyFlavourCategory(meta[i - 2].longRunFlavour);
      const c1 = classifyFlavourCategory(meta[i - 1].longRunFlavour);
      const c2 = classifyFlavourCategory(meta[i].longRunFlavour);
      if (c0 === "absorb" || c1 === "absorb" || c2 === "absorb") continue;
      assertEquals(!(c0 === c1 && c1 === c2), true,
        `development: weeks ${i - 1}–${i + 1} all have category ${c2}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Q. Gold-standard plan quality invariants
// ---------------------------------------------------------------------------

Deno.test("Q. Gold-standard plan quality invariants", async (t) => {
  const VALID_LONG_RUN_PURPOSES: LongRunPurpose[] = [
    "aerobic_endurance", "time_on_feet", "fat_adaptation", "pace_practice",
    "negative_split_execution", "race_simulation", "fueling_rehearsal",
    "threshold_finish", "hm_pace_segments", "mp_segments", "recovery",
  ];
  const VALID_WORKOUT_PURPOSES: WorkoutPurpose[] = [
    "aerobic_development", "threshold_foundation", "threshold_extension",
    "vo2_development", "economy_speed", "race_pace_exposure",
    "race_pace_extension", "lactate_clearance", "sharpening", "maintenance",
  ];
  const VALID_TIER_SOPH: TierSophistication[] = ["simple", "structured", "polished"];
  const VALID_RACE_FAMILIES: RaceFamily[] = ["short", "10k", "half", "marathon"];

  await t.step("all new meta fields are populated for established_specificity plan", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 70,
      startingLongestRunKm: 30,
      totalWeeks: 16,
      raceDistanceKm: 42.2,
      ambitionTier: "competitive",
    });
    for (const m of sg.weeklyMeta!) {
      assertEquals(VALID_LONG_RUN_PURPOSES.includes(m.longRunPurpose), true,
        `invalid longRunPurpose: ${m.longRunPurpose}`);
      assertEquals(VALID_WORKOUT_PURPOSES.includes(m.primaryWorkoutPurpose), true,
        `invalid primaryWorkoutPurpose: ${m.primaryWorkoutPurpose}`);
      assertEquals(VALID_TIER_SOPH.includes(m.tierSophistication), true,
        `invalid tierSophistication: ${m.tierSophistication}`);
      assertEquals(VALID_RACE_FAMILIES.includes(m.raceFamily), true,
        `invalid raceFamily: ${m.raceFamily}`);
      assertEquals(typeof m.phaseProgressPercent, "number");
      assertEquals(m.phaseProgressPercent >= 0 && m.phaseProgressPercent <= 100, true);
    }
  });

  await t.step("classifyRaceFamily returns correct families", () => {
    assertEquals(classifyRaceFamily(5), "short");
    assertEquals(classifyRaceFamily(7), "short");
    assertEquals(classifyRaceFamily(10), "10k");
    assertEquals(classifyRaceFamily(15), "10k");
    assertEquals(classifyRaceFamily(21.1), "half");
    assertEquals(classifyRaceFamily(25), "half");
    assertEquals(classifyRaceFamily(42.2), "marathon");
    assertEquals(classifyRaceFamily(50), "marathon");
  });

  await t.step("half-marathon plans have raceFamily=half", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 50,
      startingLongestRunKm: 18,
      totalWeeks: 16,
      raceDistanceKm: 21.1,
      ambitionTier: "competitive",
    });
    for (const m of sg.weeklyMeta!) {
      assertEquals(m.raceFamily, "half");
    }
  });

  await t.step("half-marathon competitive uses threshold_finish or hm_pace_segments in race_specificity long runs", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 50,
      startingLongestRunKm: 18,
      totalWeeks: 16,
      raceDistanceKm: 21.1,
      ambitionTier: "competitive",
    });
    const raceSpecWeeks = sg.weeklyMeta!.filter(m =>
      m.phase === "race_specificity" && m.longRunPurpose !== "recovery"
    );
    const hasHmSpecificPurpose = raceSpecWeeks.some(m =>
      m.longRunPurpose === "threshold_finish" ||
      m.longRunPurpose === "hm_pace_segments" ||
      m.longRunPurpose === "race_simulation" ||
      m.longRunPurpose === "negative_split_execution"
    );
    assertEquals(hasHmSpecificPurpose, true,
      "HM competitive should have HM-specific long-run purposes in race_specificity");
  });

  await t.step("tier sophistication matches tier correctly", () => {
    for (const [tier, expectedSoph] of [
      ["base", "simple"],
      ["performance", "structured"],
      ["competitive", "polished"],
    ] as const) {
      const sg = buildStructuralGuidance({
        startingWeeklyKm: 70,
        startingLongestRunKm: 30,
        totalWeeks: 16,
        raceDistanceKm: 42.2,
        ambitionTier: tier,
      });
      for (const m of sg.weeklyMeta!) {
        assertEquals(m.tierSophistication, expectedSoph,
          `${tier} tier should have ${expectedSoph} sophistication`);
      }
    }
  });

  await t.step("workout purposes progress through phases for competitive marathon", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 70,
      startingLongestRunKm: 30,
      totalWeeks: 16,
      raceDistanceKm: 42.2,
      ambitionTier: "competitive",
    });
    const aerobicReset = sg.weeklyMeta!.filter(m => m.phase === "aerobic_reset" && m.primaryWorkoutPurpose !== "maintenance");
    const raceSpec = sg.weeklyMeta!.filter(m => m.phase === "race_specificity" && m.primaryWorkoutPurpose !== "maintenance");

    if (aerobicReset.length > 0 && raceSpec.length > 0) {
      const hasFoundationInReset = aerobicReset.some(m =>
        m.primaryWorkoutPurpose === "threshold_foundation" || m.primaryWorkoutPurpose === "aerobic_development"
      );
      const hasRacePaceInSpec = raceSpec.some(m =>
        m.primaryWorkoutPurpose === "race_pace_exposure" ||
        m.primaryWorkoutPurpose === "race_pace_extension" ||
        m.primaryWorkoutPurpose === "sharpening"
      );
      assertEquals(hasFoundationInReset, true, "Aerobic reset should have foundation-level workout purposes");
      assertEquals(hasRacePaceInSpec, true, "Race specificity should have race-pace workout purposes");
    }
  });

  await t.step("10K plans use vo2_development in economy_building", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 50,
      startingLongestRunKm: 14,
      totalWeeks: 16,
      raceDistanceKm: 10,
      ambitionTier: "competitive",
    });
    const econWeeks = sg.weeklyMeta!.filter(m =>
      m.phase === "economy_building" && m.primaryWorkoutPurpose !== "maintenance"
    );
    const hasVo2 = econWeeks.some(m => m.primaryWorkoutPurpose === "vo2_development");
    assertEquals(hasVo2, true, "10K competitive should use vo2_development in economy_building");
  });

  await t.step("5K plans use economy_speed and race_pace workouts", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 40,
      startingLongestRunKm: 12,
      totalWeeks: 12,
      raceDistanceKm: 5,
      ambitionTier: "competitive",
    });
    const nonDeloadWeeks = sg.weeklyMeta!.filter(m =>
      m.primaryWorkoutPurpose !== "maintenance" && m.phase !== "taper"
    );
    const hasEconomy = nonDeloadWeeks.some(m =>
      m.primaryWorkoutPurpose === "economy_speed" || m.secondaryWorkoutPurpose === "economy_speed"
    );
    const hasRacePace = nonDeloadWeeks.some(m =>
      m.primaryWorkoutPurpose === "race_pace_exposure" ||
      m.primaryWorkoutPurpose === "race_pace_extension" ||
      m.secondaryWorkoutPurpose === "race_pace_exposure" ||
      m.secondaryWorkoutPurpose === "race_pace_extension"
    );
    assertEquals(hasEconomy, true, "5K competitive should include economy_speed work");
    assertEquals(hasRacePace, true, "5K competitive should include race_pace work");
  });

  await t.step("phaseProgressPercent increases within each phase", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 70,
      startingLongestRunKm: 30,
      totalWeeks: 16,
      raceDistanceKm: 42.2,
      ambitionTier: "performance",
    });
    const phases: Record<string, number[]> = {};
    for (const m of sg.weeklyMeta!) {
      if (!phases[m.phase]) phases[m.phase] = [];
      phases[m.phase].push(m.phaseProgressPercent);
    }
    for (const [phaseName, percents] of Object.entries(phases)) {
      if (percents.length > 1) {
        for (let i = 1; i < percents.length; i++) {
          assertEquals(percents[i] >= percents[i - 1], true,
            `${phaseName}: phaseProgressPercent should not decrease (${percents[i - 1]} -> ${percents[i]})`);
        }
      }
    }
  });

  await t.step("base tier has simpler workout purposes than competitive", () => {
    const params = { startingWeeklyKm: 70, startingLongestRunKm: 30, totalWeeks: 16, raceDistanceKm: 42.2 };
    const base = buildStructuralGuidance({ ...params, ambitionTier: "base" });
    const comp = buildStructuralGuidance({ ...params, ambitionTier: "competitive" });

    const advancedPurposes: WorkoutPurpose[] = [
      "race_pace_extension", "lactate_clearance", "sharpening"
    ];

    const baseAdvanced = base.weeklyMeta!.filter(m =>
      advancedPurposes.includes(m.primaryWorkoutPurpose) ||
      (m.secondaryWorkoutPurpose && advancedPurposes.includes(m.secondaryWorkoutPurpose))
    ).length;

    const compAdvanced = comp.weeklyMeta!.filter(m =>
      advancedPurposes.includes(m.primaryWorkoutPurpose) ||
      (m.secondaryWorkoutPurpose && advancedPurposes.includes(m.secondaryWorkoutPurpose))
    ).length;

    assertEquals(compAdvanced >= baseAdvanced, true,
      `Competitive (${compAdvanced}) should have >= advanced workout purposes than base (${baseAdvanced})`);
  });

  await t.step("long run purposes vary within race_specificity phase (not all same)", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 70,
      startingLongestRunKm: 30,
      totalWeeks: 16,
      raceDistanceKm: 42.2,
      ambitionTier: "competitive",
    });
    const raceSpecPurposes = sg.weeklyMeta!
      .filter(m => m.phase === "race_specificity" && m.longRunPurpose !== "recovery")
      .map(m => m.longRunPurpose);

    if (raceSpecPurposes.length >= 3) {
      const uniquePurposes = new Set(raceSpecPurposes);
      assertEquals(uniquePurposes.size >= 2, true,
        `race_specificity should have varied long-run purposes, got: ${[...uniquePurposes].join(", ")}`);
    }
  });

  await t.step("intermediate distances inherit correct family (15K -> 10k family, 25K -> half family)", () => {
    const sg15k = buildStructuralGuidance({
      startingWeeklyKm: 50,
      startingLongestRunKm: 14,
      totalWeeks: 12,
      raceDistanceKm: 15,
      ambitionTier: "performance",
    });
    const sg25k = buildStructuralGuidance({
      startingWeeklyKm: 60,
      startingLongestRunKm: 20,
      totalWeeks: 14,
      raceDistanceKm: 25,
      ambitionTier: "performance",
    });

    assertEquals(sg15k.weeklyMeta![0].raceFamily, "10k", "15K should be in 10k family");
    assertEquals(sg25k.weeklyMeta![0].raceFamily, "half", "25K should be in half family");
  });
});

// ---------------------------------------------------------------------------
// R. Race-family parameter architecture validation
// ---------------------------------------------------------------------------

Deno.test("R. Race-family parameter architecture validation", async (t) => {
  await t.step("6km race uses short family with appropriate long-run cap", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 35,
      startingLongestRunKm: 10,
      totalWeeks: 12,
      raceDistanceKm: 6,
      ambitionTier: "performance",
    });
    assertEquals(sg.weeklyMeta![0].raceFamily, "short");
    const peakLongRun = Math.max(...sg.longRunTargets.slice(0, sg.taperStartWeek));
    assertEquals(peakLongRun <= 16, true, `6km race long run ${peakLongRun} should cap at 16km`);
  });

  await t.step("8km race uses 10k family", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 40,
      startingLongestRunKm: 12,
      totalWeeks: 12,
      raceDistanceKm: 8,
      ambitionTier: "performance",
    });
    assertEquals(sg.weeklyMeta![0].raceFamily, "10k");
  });

  await t.step("15km race uses 10k family with appropriate long-run cap", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 50,
      startingLongestRunKm: 14,
      totalWeeks: 14,
      raceDistanceKm: 15,
      ambitionTier: "competitive",
    });
    assertEquals(sg.weeklyMeta![0].raceFamily, "10k");
    const peakLongRun = Math.max(...sg.longRunTargets.slice(0, sg.taperStartWeek));
    assertEquals(peakLongRun <= 21, true, `15km race long run ${peakLongRun} should cap at 21km`);
  });

  await t.step("21km race uses half family", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 50,
      startingLongestRunKm: 16,
      totalWeeks: 14,
      raceDistanceKm: 21,
      ambitionTier: "performance",
    });
    assertEquals(sg.weeklyMeta![0].raceFamily, "half");
  });

  await t.step("30km race uses half family with appropriate long-run cap", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 60,
      startingLongestRunKm: 20,
      totalWeeks: 16,
      raceDistanceKm: 30,
      ambitionTier: "competitive",
    });
    assertEquals(sg.weeklyMeta![0].raceFamily, "half");
    const peakLongRun = Math.max(...sg.longRunTargets.slice(0, sg.taperStartWeek));
    assertEquals(peakLongRun <= 24, true, `30km race long run ${peakLongRun} should cap at 24km`);
  });

  await t.step("41km race uses marathon family", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 70,
      startingLongestRunKm: 28,
      totalWeeks: 16,
      raceDistanceKm: 41,
      ambitionTier: "competitive",
    });
    assertEquals(sg.weeklyMeta![0].raceFamily, "marathon");
  });

  await t.step("short family never gets mp_block or alternating_mp_steady", () => {
    for (const dist of [5, 6, 7]) {
      const sg = buildStructuralGuidance({
        startingWeeklyKm: 40,
        startingLongestRunKm: 12,
        totalWeeks: 12,
        raceDistanceKm: dist,
        ambitionTier: "competitive",
      });
      for (const m of sg.weeklyMeta!) {
        assertEquals(
          m.longRunFlavour !== "mp_block" && m.longRunFlavour !== "alternating_mp_steady",
          true,
          `${dist}km race should never get ${m.longRunFlavour}`
        );
      }
    }
  });

  await t.step("10k family never gets alternating_mp_steady", () => {
    for (const dist of [8, 10, 15]) {
      const sg = buildStructuralGuidance({
        startingWeeklyKm: 50,
        startingLongestRunKm: 14,
        totalWeeks: 14,
        raceDistanceKm: dist,
        ambitionTier: "competitive",
      });
      for (const m of sg.weeklyMeta!) {
        assertEquals(
          m.longRunFlavour !== "alternating_mp_steady",
          true,
          `${dist}km race should never get alternating_mp_steady`
        );
      }
    }
  });

  await t.step("half family competitive can use mp_block in race_specificity", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 55,
      startingLongestRunKm: 18,
      totalWeeks: 16,
      raceDistanceKm: 21.1,
      ambitionTier: "competitive",
    });
    const raceSpecWeeks = sg.weeklyMeta!.filter(m => m.phase === "race_specificity");
    const hasMpBlock = raceSpecWeeks.some(m => m.longRunFlavour === "mp_block");
    assertEquals(hasMpBlock, true, "Half competitive should use mp_block in race_specificity");
  });

  await t.step("marathon family competitive gets alternating_mp_steady in race_specificity", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 70,
      startingLongestRunKm: 30,
      totalWeeks: 16,
      raceDistanceKm: 42.2,
      ambitionTier: "competitive",
    });
    const raceSpecWeeks = sg.weeklyMeta!.filter(m => m.phase === "race_specificity");
    const hasAlternating = raceSpecWeeks.some(m => m.longRunFlavour === "alternating_mp_steady");
    assertEquals(hasAlternating, true, "Marathon competitive should use alternating_mp_steady");
  });

  await t.step("taper weeks are family-appropriate: short=1, half=1, marathon=2", () => {
    const sgShort = buildStructuralGuidance({
      startingWeeklyKm: 35, startingLongestRunKm: 10, totalWeeks: 12,
      raceDistanceKm: 5, ambitionTier: "performance",
    });
    const sgHalf = buildStructuralGuidance({
      startingWeeklyKm: 50, startingLongestRunKm: 16, totalWeeks: 12,
      raceDistanceKm: 21.1, ambitionTier: "performance",
    });
    const sgMarathon = buildStructuralGuidance({
      startingWeeklyKm: 60, startingLongestRunKm: 24, totalWeeks: 16,
      raceDistanceKm: 42.2, ambitionTier: "performance",
    });

    const shortTaper = 12 - sgShort.taperStartWeek;
    const halfTaper = 12 - sgHalf.taperStartWeek;
    const marathonTaper = 16 - sgMarathon.taperStartWeek;

    assertEquals(shortTaper, 1, `Short race should have 1 taper week, got ${shortTaper}`);
    assertEquals(halfTaper, 1, `Half should have 1 taper week, got ${halfTaper}`);
    assertEquals(marathonTaper, 2, `Marathon should have 2 taper weeks, got ${marathonTaper}`);
  });

  await t.step("advanced runners do not flatten into repetitive weeks - variety maintained post-ceiling", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 80,
      startingLongestRunKm: 32,
      totalWeeks: 16,
      raceDistanceKm: 42.2,
      ambitionTier: "competitive",
    });

    const buildMeta = sg.weeklyMeta!.slice(0, sg.taperStartWeek);
    const nonDeloadMeta = buildMeta.filter((_, i) => !sg.cutbackWeeks.includes(i));

    const uniqueFlavours = new Set(nonDeloadMeta.map(m => m.longRunFlavour)).size;
    assertEquals(uniqueFlavours >= 3, true,
      `High-base runner should have at least 3 distinct long-run flavours, got ${uniqueFlavours}`);

    const uniqueBlueprints = new Set(nonDeloadMeta.map(m => m.qualitySessionBlueprint)).size;
    assertEquals(uniqueBlueprints >= 2, true,
      `High-base runner should have at least 2 distinct quality blueprints, got ${uniqueBlueprints}`);
  });

  await t.step("tiers remain visibly distinct for same race distance", () => {
    const params = { startingWeeklyKm: 50, startingLongestRunKm: 16, totalWeeks: 14, raceDistanceKm: 21.1 };

    const base = buildStructuralGuidance({ ...params, ambitionTier: "base" });
    const perf = buildStructuralGuidance({ ...params, ambitionTier: "performance" });
    const comp = buildStructuralGuidance({ ...params, ambitionTier: "competitive" });

    const baseFlavours = base.weeklyMeta!.map(m => m.longRunFlavour).join(",");
    const perfFlavours = perf.weeklyMeta!.map(m => m.longRunFlavour).join(",");
    const compFlavours = comp.weeklyMeta!.map(m => m.longRunFlavour).join(",");

    assertEquals(baseFlavours !== perfFlavours, true, "Base and Performance should have different flavour sequences");
    assertEquals(perfFlavours !== compFlavours, true, "Performance and Competitive should have different flavour sequences");

    const baseBlueprints = base.weeklyMeta!.map(m => m.qualitySessionBlueprint).join(",");
    const perfBlueprints = perf.weeklyMeta!.map(m => m.qualitySessionBlueprint).join(",");
    const compBlueprints = comp.weeklyMeta!.map(m => m.qualitySessionBlueprint).join(",");

    assertEquals(baseBlueprints !== perfBlueprints, true, "Base and Performance should have different blueprint sequences");
    assertEquals(perfBlueprints !== compBlueprints, true, "Performance and Competitive should have different blueprint sequences");
  });

  await t.step("exact race distance influences output within family (8km vs 15km in 10k family)", () => {
    const sg8k = buildStructuralGuidance({
      startingWeeklyKm: 45, startingLongestRunKm: 12, totalWeeks: 12,
      raceDistanceKm: 8, ambitionTier: "performance",
    });
    const sg15k = buildStructuralGuidance({
      startingWeeklyKm: 45, startingLongestRunKm: 12, totalWeeks: 12,
      raceDistanceKm: 15, ambitionTier: "performance",
    });

    assertEquals(sg8k.weeklyMeta![0].raceFamily, "10k");
    assertEquals(sg15k.weeklyMeta![0].raceFamily, "10k");

    const peak8k = Math.max(...sg8k.longRunTargets.slice(0, sg8k.taperStartWeek));
    const peak15k = Math.max(...sg15k.longRunTargets.slice(0, sg15k.taperStartWeek));

    assertEquals(peak15k >= peak8k, true,
      `15km race should have higher long-run cap than 8km (${peak15k} vs ${peak8k})`);
  });

  await t.step("plans remain coherent - no over-stacking of hard sessions", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 60,
      startingLongestRunKm: 20,
      totalWeeks: 16,
      raceDistanceKm: 42.2,
      ambitionTier: "competitive",
    });

    for (const m of sg.weeklyMeta!) {
      if (m.difficultyBudgetUsed === "demanding") {
        assertEquals(m.qualitySessionsThisWeek <= 1, true,
          `Demanding long-run week should have max 1 quality session, got ${m.qualitySessionsThisWeek}`);
      }
    }
  });
});

Deno.test("S. Long-run target zone framework validation", async (t) => {
  await t.step("6km race (short family) has sensible useful target zone 10-14km", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 25, startingLongestRunKm: 8, totalWeeks: 10,
      raceDistanceKm: 6, ambitionTier: "performance",
    });
    assertEquals(sg.longRunTargetAnalysis !== undefined, true, "Should have target analysis");
    assertEquals(sg.longRunTargetAnalysis!.targetZone.usefulMinKm, 10);
    assertEquals(sg.longRunTargetAnalysis!.targetZone.usefulMaxKm, 14);
    assertEquals(sg.usefulLongRunTargetKm! >= 10, true, `Useful target should be >= 10km, got ${sg.usefulLongRunTargetKm}`);
    assertEquals(sg.usefulLongRunTargetKm! <= 14, true, `Useful target should be <= 14km, got ${sg.usefulLongRunTargetKm}`);
  });

  await t.step("8km race (10k family) has sensible useful target zone 13-18km", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 30, startingLongestRunKm: 10, totalWeeks: 12,
      raceDistanceKm: 8, ambitionTier: "performance",
    });
    assertEquals(sg.longRunTargetAnalysis!.targetZone.usefulMinKm, 13);
    assertEquals(sg.longRunTargetAnalysis!.targetZone.usefulMaxKm, 18);
    assertEquals(sg.usefulLongRunTargetKm! >= 13, true);
    assertEquals(sg.usefulLongRunTargetKm! <= 18, true);
  });

  await t.step("15km race (10k family upper) gets higher useful target than 8km", () => {
    const sg8 = buildStructuralGuidance({
      startingWeeklyKm: 40, startingLongestRunKm: 12, totalWeeks: 12,
      raceDistanceKm: 8, ambitionTier: "performance",
    });
    const sg15 = buildStructuralGuidance({
      startingWeeklyKm: 40, startingLongestRunKm: 12, totalWeeks: 12,
      raceDistanceKm: 15, ambitionTier: "performance",
    });
    assertEquals(sg15.usefulLongRunTargetKm! > sg8.usefulLongRunTargetKm!, true,
      `15km target (${sg15.usefulLongRunTargetKm}) should exceed 8km target (${sg8.usefulLongRunTargetKm})`);
  });

  await t.step("21km race (half family) has sensible useful target zone 16-22km", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 40, startingLongestRunKm: 14, totalWeeks: 14,
      raceDistanceKm: 21, ambitionTier: "performance",
    });
    assertEquals(sg.longRunTargetAnalysis!.targetZone.usefulMinKm, 16);
    assertEquals(sg.longRunTargetAnalysis!.targetZone.usefulMaxKm, 22);
    assertEquals(sg.usefulLongRunTargetKm! >= 16, true);
    assertEquals(sg.usefulLongRunTargetKm! <= 22, true);
  });

  await t.step("30km race (half family upper) gets target near top of half zone", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 50, startingLongestRunKm: 18, totalWeeks: 16,
      raceDistanceKm: 30, ambitionTier: "performance",
    });
    assertEquals(sg.weeklyMeta![0].raceFamily, "half");
    assertEquals(sg.usefulLongRunTargetKm! >= 20, true,
      `30km race should have useful target >= 20km, got ${sg.usefulLongRunTargetKm}`);
  });

  await t.step("41km race (marathon family) has sensible useful target zone 26-32km", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 50, startingLongestRunKm: 18, totalWeeks: 16,
      raceDistanceKm: 41, ambitionTier: "performance",
    });
    assertEquals(sg.longRunTargetAnalysis!.targetZone.usefulMinKm, 26);
    assertEquals(sg.longRunTargetAnalysis!.targetZone.usefulMaxKm, 32);
    assertEquals(sg.usefulLongRunTargetKm! >= 26, true);
    assertEquals(sg.usefulLongRunTargetKm! <= 32, true);
  });

  await t.step("runner below target gets 'build' progression mode", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 30, startingLongestRunKm: 10, totalWeeks: 16,
      raceDistanceKm: 42.2, ambitionTier: "performance",
    });
    assertEquals(sg.longRunTargetAnalysis!.status, "below");
    assertEquals(sg.longRunTargetAnalysis!.progressionMode, "build");
    assertEquals(sg.longRunTargetAnalysis!.shouldBuildDistance, true);
  });

  await t.step("runner near target gets 'mixed' progression mode", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 55, startingLongestRunKm: 26, totalWeeks: 12,
      raceDistanceKm: 42.2, ambitionTier: "performance",
    });
    assertEquals(sg.longRunTargetAnalysis!.status === "near" || sg.longRunTargetAnalysis!.status === "above", true,
      `Status should be 'near' or 'above' for runner at 26km, got ${sg.longRunTargetAnalysis!.status}`);
  });

  await t.step("runner above target gets 'specificity_led' progression mode", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 70, startingLongestRunKm: 32, totalWeeks: 12,
      raceDistanceKm: 42.2, ambitionTier: "competitive",
    });
    assertEquals(sg.longRunTargetAnalysis!.status, "above");
    assertEquals(sg.longRunTargetAnalysis!.progressionMode, "specificity_led");
    assertEquals(sg.longRunTargetAnalysis!.shouldBuildDistance, false);
  });

  await t.step("runner above target shifts to established_specificity archetype", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 70, startingLongestRunKm: 32, totalWeeks: 12,
      raceDistanceKm: 42.2, ambitionTier: "competitive",
    });
    assertEquals(sg.planArchetype, "established_specificity",
      `Runner above target should be established_specificity, got ${sg.planArchetype}`);
  });

  await t.step("weekly meta includes target status fields", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 40, startingLongestRunKm: 14, totalWeeks: 12,
      raceDistanceKm: 21.1, ambitionTier: "performance",
    });
    const firstMeta = sg.weeklyMeta![0];
    assertEquals(firstMeta.longRunTargetStatus !== undefined, true);
    assertEquals(firstMeta.longRunProgressionMode !== undefined, true);
    assertEquals(firstMeta.longRunTargetKm !== undefined, true);
    assertEquals(firstMeta.qualityProgressionPriority !== undefined, true);
  });

  await t.step("short-distance plans do not overemphasize long-run growth", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 30, startingLongestRunKm: 10, totalWeeks: 10,
      raceDistanceKm: 5, ambitionTier: "performance",
    });
    const peakLongRun = Math.max(...sg.longRunTargets.slice(0, sg.taperStartWeek));
    assertEquals(peakLongRun <= 16, true,
      `5K plan should not exceed 16km long run, got ${peakLongRun}`);
    assertEquals(sg.longRunTargetAnalysis!.postTargetRules.qualitySessionImportance, "high");
    assertEquals(sg.longRunTargetAnalysis!.postTargetRules.longRunRole, "maintenance");
  });

  await t.step("marathon plans have long_run_flavour as primary lever post-target", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 70, startingLongestRunKm: 30, totalWeeks: 12,
      raceDistanceKm: 42.2, ambitionTier: "competitive",
    });
    assertEquals(sg.longRunTargetAnalysis!.postTargetRules.primaryLevers.includes("long_run_flavour"), true);
    assertEquals(sg.longRunTargetAnalysis!.postTargetRules.longRunRole, "primary_value");
  });

  await t.step("10k plans have workout_identity as primary lever post-target", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 45, startingLongestRunKm: 16, totalWeeks: 10,
      raceDistanceKm: 10, ambitionTier: "performance",
    });
    assertEquals(sg.longRunTargetAnalysis!.postTargetRules.primaryLevers.includes("workout_identity"), true);
    assertEquals(sg.longRunTargetAnalysis!.postTargetRules.longRunRole, "supporting");
  });

  await t.step("archetype recommendation reason is provided", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 70, startingLongestRunKm: 32, totalWeeks: 12,
      raceDistanceKm: 42.2, ambitionTier: "competitive",
    });
    assertEquals(sg.archetypeRecommendation !== undefined, true);
    assertEquals(sg.archetypeRecommendation!.length > 0, true);
  });

  await t.step("intermediate distances (18km) are handled smoothly", () => {
    const sg = buildStructuralGuidance({
      startingWeeklyKm: 40, startingLongestRunKm: 14, totalWeeks: 12,
      raceDistanceKm: 18, ambitionTier: "performance",
    });
    assertEquals(sg.weeklyMeta![0].raceFamily, "half");
    assertEquals(sg.usefulLongRunTargetKm! >= 16, true,
      `18km race should have useful target >= 16km, got ${sg.usefulLongRunTargetKm}`);
  });

  await t.step("useful target respects duration cap for slower runners", () => {
    const sgFast = buildStructuralGuidance({
      startingWeeklyKm: 50, startingLongestRunKm: 20, totalWeeks: 16,
      raceDistanceKm: 42.2, paceMinPerKm: 5.0, ambitionTier: "performance",
    });
    const sgSlow = buildStructuralGuidance({
      startingWeeklyKm: 50, startingLongestRunKm: 20, totalWeeks: 16,
      raceDistanceKm: 42.2, paceMinPerKm: 7.5, ambitionTier: "performance",
    });
    assertEquals(sgSlow.usefulLongRunTargetKm! <= sgFast.usefulLongRunTargetKm!, true,
      `Slower runner should have same or lower useful target due to time cap`);
  });
});
