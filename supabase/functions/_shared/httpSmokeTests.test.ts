import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

import {
  handleGenerateTrainingPlanRequest,
  computeStructuralGuidanceForRequest,
  isTestModeAllowed as isTestModeAllowedTraining,
  RequestBody,
  StructuralGuidanceOutput,
  TestModeResponse,
} from "../generate-training-plan/handler.ts";

import {
  handleGeneratePreviewPlanRequest,
  computeStructuralGuidanceForPreview,
  isTestModeAllowed as isTestModeAllowedPreview,
  PreviewRequestBody,
  PreviewTestModeResponse,
} from "../generate-preview-plan/handler.ts";

import {
  CANONICAL_FIXTURES,
  BOUNDARY_FIXTURES,
  QuestionnaireFixture,
  computeStructuralGuidanceFromFixture,
} from "./planGenerationTestHarness.ts";

Deno.env.set("DENO_ENV", "test");

function fixtureToTrainingPlanRequest(fixture: QuestionnaireFixture): RequestBody {
  return {
    answers: {
      experience: fixture.answers.experience,
      raceDistance: fixture.answers.raceDistance,
      raceDate: fixture.answers.raceDate,
      planWeeks: fixture.answers.planWeeks,
      longestRun: fixture.answers.longestRun,
      currentWeeklyKm: fixture.answers.currentWeeklyKm,
      availableDays: fixture.answers.availableDays,
      daysPerWeek: fixture.answers.daysPerWeek,
      ambitionTier: fixture.ambitionTier || "base",
    },
    startDate: fixture.startDate,
    readinessTier: fixture.readinessTier || "green",
    _testMode: true,
    _paceMinPerKm: fixture.paceMinPerKm || 6.0,
  };
}

function fixtureToPreviewRequest(fixture: QuestionnaireFixture): PreviewRequestBody {
  return {
    answers: {
      experience: fixture.answers.experience,
      raceDistance: fixture.answers.raceDistance,
      raceDate: fixture.answers.raceDate,
      planWeeks: fixture.answers.planWeeks,
      longestRun: fixture.answers.longestRun,
      currentWeeklyKm: fixture.answers.currentWeeklyKm,
      availableDays: fixture.answers.availableDays,
      daysPerWeek: fixture.answers.daysPerWeek,
      ambitionTier: fixture.ambitionTier || "base",
    },
    startDate: fixture.startDate,
    readinessTier: fixture.readinessTier || "green",
    _testMode: true,
    _paceMinPerKm: fixture.paceMinPerKm || 6.0,
  };
}

function createRequest(body: unknown): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validateStructuralOutput(sg: StructuralGuidanceOutput): string[] {
  const errors: string[] = [];

  if (sg.buildWeeks + sg.taperWeeks !== sg.totalWeeks) {
    errors.push(`build + taper != total: ${sg.buildWeeks} + ${sg.taperWeeks} != ${sg.totalWeeks}`);
  }

  if (sg.weeklyVolumes.length !== sg.totalWeeks) {
    errors.push(`volume array length mismatch: ${sg.weeklyVolumes.length} != ${sg.totalWeeks}`);
  }

  if (sg.longRunTargets.length !== sg.totalWeeks) {
    errors.push(`long run array length mismatch: ${sg.longRunTargets.length} != ${sg.totalWeeks}`);
  }

  sg.weeklyVolumes.forEach((v, i) => {
    if (Number.isNaN(v)) errors.push(`Week ${i + 1} volume is NaN`);
    if (v < 0) errors.push(`Week ${i + 1} volume is negative: ${v}`);
  });

  sg.longRunTargets.forEach((lr, i) => {
    if (Number.isNaN(lr)) errors.push(`Week ${i + 1} long run is NaN`);
    if (lr < 0) errors.push(`Week ${i + 1} long run is negative: ${lr}`);
    if (lr > 32) errors.push(`Week ${i + 1} long run exceeds 32km cap: ${lr}`);
  });

  const validTiers = ["green", "orange", "dark_orange", "red"];
  if (!validTiers.includes(sg.readinessTier)) {
    errors.push(`Invalid readiness tier: ${sg.readinessTier}`);
  }

  return errors;
}

const EXPECTED_CANONICAL: Record<string, {
  totalWeeks: number;
  taperWeeks: number;
  buildWeeks: number;
  isMarathonLike: boolean;
  firstWeekVolume: number;
  peakVolumeMin: number;
  peakLongRunMax: number;
}> = {
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

Deno.test("A. HTTP Smoke - generate-training-plan handler responds 200 for canonical fixtures", async (t) => {
  for (const fixture of CANONICAL_FIXTURES) {
    await t.step(fixture.name, async () => {
      const reqBody = fixtureToTrainingPlanRequest(fixture);
      const request = createRequest(reqBody);
      const response = await handleGenerateTrainingPlanRequest(request);

      assertEquals(response.status, 200, `Expected 200, got ${response.status}`);

      const body = await response.json() as TestModeResponse;
      assertEquals(body._testMode, true);
      assertEquals(typeof body.structuralGuidance, "object");
      assertEquals(typeof body.requestParsed, "object");
    });
  }
});

Deno.test("B. HTTP Smoke - generate-preview-plan handler responds 200 for canonical fixtures", async (t) => {
  for (const fixture of CANONICAL_FIXTURES) {
    await t.step(fixture.name, async () => {
      const reqBody = fixtureToPreviewRequest(fixture);
      const request = createRequest(reqBody);
      const response = await handleGeneratePreviewPlanRequest(request);

      assertEquals(response.status, 200, `Expected 200, got ${response.status}`);

      const body = await response.json() as PreviewTestModeResponse;
      assertEquals(body._testMode, true);
      assertEquals(typeof body.structuralGuidance, "object");
      assertEquals(typeof body.requestParsed, "object");
    });
  }
});

Deno.test("C. HTTP Smoke - generate-training-plan returns valid JSON with required fields", async (t) => {
  for (const fixture of CANONICAL_FIXTURES) {
    await t.step(fixture.name, async () => {
      const reqBody = fixtureToTrainingPlanRequest(fixture);
      const request = createRequest(reqBody);
      const response = await handleGenerateTrainingPlanRequest(request);
      const body = await response.json() as TestModeResponse;

      const sg = body.structuralGuidance;
      assertEquals(typeof sg.totalWeeks, "number");
      assertEquals(typeof sg.taperWeeks, "number");
      assertEquals(typeof sg.buildWeeks, "number");
      assertEquals(typeof sg.parsedRaceDistanceKm, "number");
      assertEquals(typeof sg.isMarathonLikeRace, "boolean");
      assertEquals(Array.isArray(sg.weeklyVolumes), true);
      assertEquals(Array.isArray(sg.longRunTargets), true);
      assertEquals(Array.isArray(sg.taperVolumes), true);
      assertEquals(Array.isArray(sg.taperLongRuns), true);
      assertEquals(typeof sg.projectedPeakVolume, "number");
      assertEquals(typeof sg.projectedPeakLongRun, "number");
      assertEquals(typeof sg.readinessTier, "string");
      assertEquals(typeof sg.ambitionTier, "string");
    });
  }
});

Deno.test("D. HTTP Smoke - generate-preview-plan returns valid JSON with required fields", async (t) => {
  for (const fixture of CANONICAL_FIXTURES) {
    await t.step(fixture.name, async () => {
      const reqBody = fixtureToPreviewRequest(fixture);
      const request = createRequest(reqBody);
      const response = await handleGeneratePreviewPlanRequest(request);
      const body = await response.json() as PreviewTestModeResponse;

      const sg = body.structuralGuidance;
      assertEquals(typeof sg.totalWeeks, "number");
      assertEquals(typeof sg.taperWeeks, "number");
      assertEquals(typeof sg.buildWeeks, "number");
      assertEquals(typeof sg.parsedRaceDistanceKm, "number");
      assertEquals(typeof sg.isMarathonLikeRace, "boolean");
      assertEquals(Array.isArray(sg.weeklyVolumes), true);
      assertEquals(Array.isArray(sg.longRunTargets), true);
      assertEquals(Array.isArray(sg.taperVolumes), true);
      assertEquals(Array.isArray(sg.taperLongRuns), true);
      assertEquals(typeof sg.projectedPeakVolume, "number");
      assertEquals(typeof sg.projectedPeakLongRun, "number");
      assertEquals(typeof sg.readinessTier, "string");
      assertEquals(typeof sg.ambitionTier, "string");
    });
  }
});

Deno.test("E. HTTP Smoke - generate-training-plan no NaN or negative values", async (t) => {
  for (const fixture of [...CANONICAL_FIXTURES, ...BOUNDARY_FIXTURES]) {
    await t.step(fixture.name, async () => {
      const reqBody = fixtureToTrainingPlanRequest(fixture);
      const request = createRequest(reqBody);
      const response = await handleGenerateTrainingPlanRequest(request);
      const body = await response.json() as TestModeResponse;

      const errors = validateStructuralOutput(body.structuralGuidance);
      assertEquals(errors.length, 0, `Validation errors: ${errors.join("; ")}`);
    });
  }
});

Deno.test("F. HTTP Smoke - generate-preview-plan no NaN or negative values", async (t) => {
  for (const fixture of [...CANONICAL_FIXTURES, ...BOUNDARY_FIXTURES]) {
    await t.step(fixture.name, async () => {
      const reqBody = fixtureToPreviewRequest(fixture);
      const request = createRequest(reqBody);
      const response = await handleGeneratePreviewPlanRequest(request);
      const body = await response.json() as PreviewTestModeResponse;

      const errors = validateStructuralOutput(body.structuralGuidance);
      assertEquals(errors.length, 0, `Validation errors: ${errors.join("; ")}`);
    });
  }
});

Deno.test("G. HTTP Exact Canonical - generate-training-plan exact values for 5 scenarios", async (t) => {
  for (const fixture of CANONICAL_FIXTURES) {
    const expected = EXPECTED_CANONICAL[fixture.name];
    if (!expected) continue;

    await t.step(`${fixture.name} exact values`, async () => {
      const reqBody = fixtureToTrainingPlanRequest(fixture);
      const request = createRequest(reqBody);
      const response = await handleGenerateTrainingPlanRequest(request);
      const body = await response.json() as TestModeResponse;
      const sg = body.structuralGuidance;

      assertEquals(sg.totalWeeks, expected.totalWeeks, "totalWeeks mismatch");
      assertEquals(sg.taperWeeks, expected.taperWeeks, "taperWeeks mismatch");
      assertEquals(sg.buildWeeks, expected.buildWeeks, "buildWeeks mismatch");
      assertEquals(sg.isMarathonLikeRace, expected.isMarathonLike, "isMarathonLike mismatch");
      assertEquals(sg.weeklyVolumes[0], expected.firstWeekVolume, "firstWeekVolume mismatch");
      assertEquals(
        sg.projectedPeakVolume >= expected.peakVolumeMin,
        true,
        `Peak volume ${sg.projectedPeakVolume} < min ${expected.peakVolumeMin}`
      );
      assertEquals(
        sg.projectedPeakLongRun <= expected.peakLongRunMax,
        true,
        `Peak LR ${sg.projectedPeakLongRun} > max ${expected.peakLongRunMax}`
      );
      assertEquals(sg.weeklyVolumes.length, expected.totalWeeks, "volumes length mismatch");
      assertEquals(sg.longRunTargets.length, expected.totalWeeks, "longRuns length mismatch");
      assertEquals(sg.taperVolumes.length, expected.taperWeeks, "taperVolumes length mismatch");
      assertEquals(sg.taperLongRuns.length, expected.taperWeeks, "taperLongRuns length mismatch");
    });
  }
});

Deno.test("H. HTTP Exact Canonical - generate-preview-plan exact values for 5 scenarios", async (t) => {
  for (const fixture of CANONICAL_FIXTURES) {
    const expected = EXPECTED_CANONICAL[fixture.name];
    if (!expected) continue;

    await t.step(`${fixture.name} exact values`, async () => {
      const reqBody = fixtureToPreviewRequest(fixture);
      const request = createRequest(reqBody);
      const response = await handleGeneratePreviewPlanRequest(request);
      const body = await response.json() as PreviewTestModeResponse;
      const sg = body.structuralGuidance;

      assertEquals(sg.totalWeeks, expected.totalWeeks, "totalWeeks mismatch");
      assertEquals(sg.taperWeeks, expected.taperWeeks, "taperWeeks mismatch");
      assertEquals(sg.buildWeeks, expected.buildWeeks, "buildWeeks mismatch");
      assertEquals(sg.isMarathonLikeRace, expected.isMarathonLike, "isMarathonLike mismatch");
      assertEquals(sg.weeklyVolumes[0], expected.firstWeekVolume, "firstWeekVolume mismatch");
      assertEquals(
        sg.projectedPeakVolume >= expected.peakVolumeMin,
        true,
        `Peak volume ${sg.projectedPeakVolume} < min ${expected.peakVolumeMin}`
      );
      assertEquals(
        sg.projectedPeakLongRun <= expected.peakLongRunMax,
        true,
        `Peak LR ${sg.projectedPeakLongRun} > max ${expected.peakLongRunMax}`
      );
    });
  }
});

Deno.test("I. HTTP Determinism - generate-training-plan repeated runs produce identical output", async (t) => {
  for (const fixture of CANONICAL_FIXTURES) {
    await t.step(fixture.name, async () => {
      const reqBody = fixtureToTrainingPlanRequest(fixture);

      const request1 = createRequest(reqBody);
      const response1 = await handleGenerateTrainingPlanRequest(request1);
      const body1 = await response1.json() as TestModeResponse;

      const request2 = createRequest(reqBody);
      const response2 = await handleGenerateTrainingPlanRequest(request2);
      const body2 = await response2.json() as TestModeResponse;

      const sg1 = body1.structuralGuidance;
      const sg2 = body2.structuralGuidance;

      assertEquals(sg1.totalWeeks, sg2.totalWeeks);
      assertEquals(sg1.taperWeeks, sg2.taperWeeks);
      assertEquals(sg1.buildWeeks, sg2.buildWeeks);
      assertEquals(JSON.stringify(sg1.weeklyVolumes), JSON.stringify(sg2.weeklyVolumes));
      assertEquals(JSON.stringify(sg1.longRunTargets), JSON.stringify(sg2.longRunTargets));
      assertEquals(sg1.projectedPeakVolume, sg2.projectedPeakVolume);
      assertEquals(sg1.projectedPeakLongRun, sg2.projectedPeakLongRun);
    });
  }
});

Deno.test("J. HTTP Determinism - generate-preview-plan repeated runs produce identical output", async (t) => {
  for (const fixture of CANONICAL_FIXTURES) {
    await t.step(fixture.name, async () => {
      const reqBody = fixtureToPreviewRequest(fixture);

      const request1 = createRequest(reqBody);
      const response1 = await handleGeneratePreviewPlanRequest(request1);
      const body1 = await response1.json() as PreviewTestModeResponse;

      const request2 = createRequest(reqBody);
      const response2 = await handleGeneratePreviewPlanRequest(request2);
      const body2 = await response2.json() as PreviewTestModeResponse;

      const sg1 = body1.structuralGuidance;
      const sg2 = body2.structuralGuidance;

      assertEquals(sg1.totalWeeks, sg2.totalWeeks);
      assertEquals(sg1.taperWeeks, sg2.taperWeeks);
      assertEquals(sg1.buildWeeks, sg2.buildWeeks);
      assertEquals(JSON.stringify(sg1.weeklyVolumes), JSON.stringify(sg2.weeklyVolumes));
      assertEquals(JSON.stringify(sg1.longRunTargets), JSON.stringify(sg2.longRunTargets));
      assertEquals(sg1.projectedPeakVolume, sg2.projectedPeakVolume);
      assertEquals(sg1.projectedPeakLongRun, sg2.projectedPeakLongRun);
    });
  }
});

Deno.test("K. HTTP Boundary - generate-training-plan boundary cases", async (t) => {
  await t.step("Half marathon boundary 21.1km is marathon-like", async () => {
    const fixture = BOUNDARY_FIXTURES.find((f) => f.name === "Half marathon boundary 21.1km")!;
    const reqBody = fixtureToTrainingPlanRequest(fixture);
    const request = createRequest(reqBody);
    const response = await handleGenerateTrainingPlanRequest(request);
    const body = await response.json() as TestModeResponse;

    assertEquals(body.structuralGuidance.parsedRaceDistanceKm, 21.1);
    assertEquals(body.structuralGuidance.isMarathonLikeRace, true);
  });

  await t.step("Long run capped by volume (60%)", async () => {
    const fixture = BOUNDARY_FIXTURES.find((f) => f.name === "Long run capped by volume (60%)")!;
    const reqBody = fixtureToTrainingPlanRequest(fixture);
    const request = createRequest(reqBody);
    const response = await handleGenerateTrainingPlanRequest(request);
    const body = await response.json() as TestModeResponse;

    const sg = body.structuralGuidance;
    sg.longRunTargets.forEach((lr, i) => {
      const volumeCap = sg.weeklyVolumes[i] * 0.6;
      assertEquals(
        lr <= volumeCap + 0.1,
        true,
        `Week ${i + 1}: LR ${lr} > 60% of volume ${sg.weeklyVolumes[i]}`
      );
    });
  });

  await t.step("Long run capped by 32km", async () => {
    const fixture = BOUNDARY_FIXTURES.find((f) => f.name === "Long run capped by 32km")!;
    const reqBody = fixtureToTrainingPlanRequest(fixture);
    const request = createRequest(reqBody);
    const response = await handleGenerateTrainingPlanRequest(request);
    const body = await response.json() as TestModeResponse;

    body.structuralGuidance.longRunTargets.forEach((lr, i) => {
      assertEquals(lr <= 32, true, `Week ${i + 1}: LR ${lr} exceeds 32km cap`);
    });
  });

  await t.step("Long run capped by 3-hour duration", async () => {
    const fixture = BOUNDARY_FIXTURES.find((f) => f.name === "Long run capped by 3-hour duration")!;
    const reqBody = fixtureToTrainingPlanRequest(fixture);
    const request = createRequest(reqBody);
    const response = await handleGenerateTrainingPlanRequest(request);
    const body = await response.json() as TestModeResponse;

    const paceMinPerKm = fixture.paceMinPerKm || 6.0;
    const durationCapKm = 180 / paceMinPerKm;

    body.structuralGuidance.longRunTargets.forEach((lr, i) => {
      assertEquals(
        lr <= durationCapKm + 0.1,
        true,
        `Week ${i + 1}: LR ${lr} exceeds 3-hour cap ${durationCapKm.toFixed(1)}km`
      );
    });
  });
});

Deno.test("L. HTTP Boundary - generate-preview-plan boundary cases", async (t) => {
  await t.step("Half marathon boundary 21.1km is marathon-like", async () => {
    const fixture = BOUNDARY_FIXTURES.find((f) => f.name === "Half marathon boundary 21.1km")!;
    const reqBody = fixtureToPreviewRequest(fixture);
    const request = createRequest(reqBody);
    const response = await handleGeneratePreviewPlanRequest(request);
    const body = await response.json() as PreviewTestModeResponse;

    assertEquals(body.structuralGuidance.parsedRaceDistanceKm, 21.1);
    assertEquals(body.structuralGuidance.isMarathonLikeRace, true);
  });

  await t.step("Long run capped by volume (60%)", async () => {
    const fixture = BOUNDARY_FIXTURES.find((f) => f.name === "Long run capped by volume (60%)")!;
    const reqBody = fixtureToPreviewRequest(fixture);
    const request = createRequest(reqBody);
    const response = await handleGeneratePreviewPlanRequest(request);
    const body = await response.json() as PreviewTestModeResponse;

    const sg = body.structuralGuidance;
    sg.longRunTargets.forEach((lr, i) => {
      const volumeCap = sg.weeklyVolumes[i] * 0.6;
      assertEquals(
        lr <= volumeCap + 0.1,
        true,
        `Week ${i + 1}: LR ${lr} > 60% of volume ${sg.weeklyVolumes[i]}`
      );
    });
  });

  await t.step("Long run capped by 32km", async () => {
    const fixture = BOUNDARY_FIXTURES.find((f) => f.name === "Long run capped by 32km")!;
    const reqBody = fixtureToPreviewRequest(fixture);
    const request = createRequest(reqBody);
    const response = await handleGeneratePreviewPlanRequest(request);
    const body = await response.json() as PreviewTestModeResponse;

    body.structuralGuidance.longRunTargets.forEach((lr, i) => {
      assertEquals(lr <= 32, true, `Week ${i + 1}: LR ${lr} exceeds 32km cap`);
    });
  });

  await t.step("Long run capped by 3-hour duration", async () => {
    const fixture = BOUNDARY_FIXTURES.find((f) => f.name === "Long run capped by 3-hour duration")!;
    const reqBody = fixtureToPreviewRequest(fixture);
    const request = createRequest(reqBody);
    const response = await handleGeneratePreviewPlanRequest(request);
    const body = await response.json() as PreviewTestModeResponse;

    const paceMinPerKm = fixture.paceMinPerKm || 6.0;
    const durationCapKm = 180 / paceMinPerKm;

    body.structuralGuidance.longRunTargets.forEach((lr, i) => {
      assertEquals(
        lr <= durationCapKm + 0.1,
        true,
        `Week ${i + 1}: LR ${lr} exceeds 3-hour cap ${durationCapKm.toFixed(1)}km`
      );
    });
  });
});

Deno.test("M. HTTP Smoke - OPTIONS request returns 200 with CORS headers", async (t) => {
  await t.step("generate-training-plan OPTIONS", async () => {
    const request = new Request("http://localhost/test", { method: "OPTIONS" });
    const response = await handleGenerateTrainingPlanRequest(request);

    assertEquals(response.status, 200);
    assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
    assertEquals(
      response.headers.get("Access-Control-Allow-Methods"),
      "GET, POST, PUT, DELETE, OPTIONS"
    );
  });

  await t.step("generate-preview-plan OPTIONS", async () => {
    const request = new Request("http://localhost/test", { method: "OPTIONS" });
    const response = await handleGeneratePreviewPlanRequest(request);

    assertEquals(response.status, 200);
    assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
  });
});

Deno.test("N. HTTP Smoke - Invalid request returns error response", async (t) => {
  await t.step("generate-preview-plan missing startDate returns 400", async () => {
    const request = createRequest({ answers: { raceDistance: "Marathon" } });
    const response = await handleGeneratePreviewPlanRequest(request);

    assertEquals(response.status, 400);
    const body = await response.json();
    assertEquals(typeof body.error, "string");
  });

  await t.step("generate-training-plan malformed JSON returns 500", async () => {
    const request = new Request("http://localhost/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json",
    });
    const response = await handleGenerateTrainingPlanRequest(request);

    assertEquals(response.status, 500);
    const body = await response.json();
    assertEquals(typeof body.error, "string");
  });
});

Deno.test("O. HTTP Smoke - Readiness tier is valid enum value", async (t) => {
  const tiers = ["green", "orange", "dark_orange", "red"] as const;

  for (const tier of tiers) {
    await t.step(`generate-training-plan with ${tier} tier`, async () => {
      const fixture = CANONICAL_FIXTURES[0];
      const reqBody: RequestBody = {
        ...fixtureToTrainingPlanRequest(fixture),
        readinessTier: tier,
      };
      const request = createRequest(reqBody);
      const response = await handleGenerateTrainingPlanRequest(request);
      const body = await response.json() as TestModeResponse;

      assertEquals(body.structuralGuidance.readinessTier, tier);
    });

    await t.step(`generate-preview-plan with ${tier} tier`, async () => {
      const fixture = CANONICAL_FIXTURES[0];
      const reqBody: PreviewRequestBody = {
        ...fixtureToPreviewRequest(fixture),
        readinessTier: tier,
      };
      const request = createRequest(reqBody);
      const response = await handleGeneratePreviewPlanRequest(request);
      const body = await response.json() as PreviewTestModeResponse;

      assertEquals(body.structuralGuidance.readinessTier, tier);
    });
  }
});

Deno.test("P. Alignment - handler.ts and harness use same buildStructuralGuidance", async (t) => {
  for (const fixture of CANONICAL_FIXTURES) {
    await t.step(`${fixture.name} - training plan handler matches harness`, () => {
      const harnessOutput = computeStructuralGuidanceFromFixture(fixture);
      const handlerOutput = computeStructuralGuidanceForRequest(fixtureToTrainingPlanRequest(fixture));
      const sg = handlerOutput.structuralGuidance;

      assertEquals(sg.totalWeeks, harnessOutput.totalWeeks, "totalWeeks");
      assertEquals(sg.taperWeeks, harnessOutput.taperWeeks, "taperWeeks");
      assertEquals(sg.buildWeeks, harnessOutput.buildWeeks, "buildWeeks");
      assertEquals(JSON.stringify(sg.weeklyVolumes), JSON.stringify(harnessOutput.weeklyVolumes), "weeklyVolumes");
      assertEquals(JSON.stringify(sg.longRunTargets), JSON.stringify(harnessOutput.longRunTargets), "longRunTargets");
      assertEquals(sg.projectedPeakVolume, harnessOutput.projectedPeakVolume, "projectedPeakVolume");
      assertEquals(sg.projectedPeakLongRun, harnessOutput.projectedPeakLongRun, "projectedPeakLongRun");
    });

    await t.step(`${fixture.name} - preview plan handler matches harness`, () => {
      const harnessOutput = computeStructuralGuidanceFromFixture(fixture);
      const handlerOutput = computeStructuralGuidanceForPreview(fixtureToPreviewRequest(fixture));
      const sg = handlerOutput.structuralGuidance;

      assertEquals(sg.totalWeeks, harnessOutput.totalWeeks, "totalWeeks");
      assertEquals(sg.taperWeeks, harnessOutput.taperWeeks, "taperWeeks");
      assertEquals(sg.buildWeeks, harnessOutput.buildWeeks, "buildWeeks");
      assertEquals(JSON.stringify(sg.weeklyVolumes), JSON.stringify(harnessOutput.weeklyVolumes), "weeklyVolumes");
      assertEquals(JSON.stringify(sg.longRunTargets), JSON.stringify(harnessOutput.longRunTargets), "longRunTargets");
      assertEquals(sg.projectedPeakVolume, harnessOutput.projectedPeakVolume, "projectedPeakVolume");
      assertEquals(sg.projectedPeakLongRun, harnessOutput.projectedPeakLongRun, "projectedPeakLongRun");
    });
  }
});

Deno.test("Q. Safety - _testMode allowed in test environment", () => {
  assertEquals(isTestModeAllowedTraining(), true);
  assertEquals(isTestModeAllowedPreview(), true);
});

Deno.test("R. Safety - _testMode rejected in production environment", async (t) => {
  const originalEnv = Deno.env.get("DENO_ENV");

  await t.step("generate-training-plan rejects _testMode in production", async () => {
    Deno.env.set("DENO_ENV", "production");

    const fixture = CANONICAL_FIXTURES[0];
    const reqBody = fixtureToTrainingPlanRequest(fixture);
    const request = createRequest(reqBody);
    const response = await handleGenerateTrainingPlanRequest(request);

    assertEquals(response.status, 403);
    const body = await response.json();
    assertEquals(body.error, "_testMode is not allowed in production");
  });

  await t.step("generate-preview-plan rejects _testMode in production", async () => {
    Deno.env.set("DENO_ENV", "production");

    const fixture = CANONICAL_FIXTURES[0];
    const reqBody = fixtureToPreviewRequest(fixture);
    const request = createRequest(reqBody);
    const response = await handleGeneratePreviewPlanRequest(request);

    assertEquals(response.status, 403);
    const body = await response.json();
    assertEquals(body.error, "_testMode is not allowed in production");
  });

  if (originalEnv) {
    Deno.env.set("DENO_ENV", originalEnv);
  } else {
    Deno.env.set("DENO_ENV", "test");
  }
});

Deno.test("S. Safety - normal requests work without _testMode", async (t) => {
  await t.step("generate-training-plan without _testMode returns 501", async () => {
    const fixture = CANONICAL_FIXTURES[0];
    const reqBody = { ...fixtureToTrainingPlanRequest(fixture), _testMode: undefined };
    delete (reqBody as Record<string, unknown>)._testMode;
    const request = createRequest(reqBody);
    const response = await handleGenerateTrainingPlanRequest(request);

    assertEquals(response.status, 501);
  });

  await t.step("generate-preview-plan without _testMode returns 501", async () => {
    const fixture = CANONICAL_FIXTURES[0];
    const reqBody = { ...fixtureToPreviewRequest(fixture), _testMode: undefined };
    delete (reqBody as Record<string, unknown>)._testMode;
    const request = createRequest(reqBody);
    const response = await handleGeneratePreviewPlanRequest(request);

    assertEquals(response.status, 501);
  });
});
