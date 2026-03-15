import { describe, it, expect } from 'vitest';

interface PlanState {
  longRunExists: boolean;
  qualitySessionExists: boolean;
  easyRunsRemaining: number;
  weeklyVolumeKm: number;
}

function actionPreconditions(
  action: 'L2_SOFTEN_WEEK' | 'L3_REDUCE_WEEK' | 'L4_INSERT_RECOVERY_WEEK',
  state: PlanState,
): boolean {
  switch (action) {
    case 'L2_SOFTEN_WEEK':
      return state.qualitySessionExists || state.longRunExists;
    case 'L3_REDUCE_WEEK':
      return state.weeklyVolumeKm > 0;
    case 'L4_INSERT_RECOVERY_WEEK':
      return true;
  }
}

const CANDIDATE_ACTIONS = [
  'L2_SOFTEN_WEEK',
  'L3_REDUCE_WEEK',
  'L4_INSERT_RECOVERY_WEEK',
] as const;

function filterAvailableActions(state: PlanState) {
  return CANDIDATE_ACTIONS.filter((action) => actionPreconditions(action, state));
}

describe('actionPreconditions', () => {
  describe('L2_SOFTEN_WEEK', () => {
    it('is valid when a long run exists', () => {
      const state: PlanState = { longRunExists: true, qualitySessionExists: false, easyRunsRemaining: 2, weeklyVolumeKm: 30 };
      expect(actionPreconditions('L2_SOFTEN_WEEK', state)).toBe(true);
    });

    it('is valid when a quality session exists', () => {
      const state: PlanState = { longRunExists: false, qualitySessionExists: true, easyRunsRemaining: 2, weeklyVolumeKm: 25 };
      expect(actionPreconditions('L2_SOFTEN_WEEK', state)).toBe(true);
    });

    it('is valid when both long run and quality session exist', () => {
      const state: PlanState = { longRunExists: true, qualitySessionExists: true, easyRunsRemaining: 1, weeklyVolumeKm: 40 };
      expect(actionPreconditions('L2_SOFTEN_WEEK', state)).toBe(true);
    });

    it('is invalid when neither long run nor quality session exists', () => {
      const state: PlanState = { longRunExists: false, qualitySessionExists: false, easyRunsRemaining: 2, weeklyVolumeKm: 15 };
      expect(actionPreconditions('L2_SOFTEN_WEEK', state)).toBe(false);
    });
  });

  describe('L3_REDUCE_WEEK', () => {
    it('is valid when weekly volume is greater than zero', () => {
      const state: PlanState = { longRunExists: false, qualitySessionExists: false, easyRunsRemaining: 2, weeklyVolumeKm: 10 };
      expect(actionPreconditions('L3_REDUCE_WEEK', state)).toBe(true);
    });

    it('is invalid when weekly volume is zero', () => {
      const state: PlanState = { longRunExists: false, qualitySessionExists: false, easyRunsRemaining: 0, weeklyVolumeKm: 0 };
      expect(actionPreconditions('L3_REDUCE_WEEK', state)).toBe(false);
    });
  });

  describe('L4_INSERT_RECOVERY_WEEK', () => {
    it('is always valid regardless of plan state', () => {
      const empty: PlanState = { longRunExists: false, qualitySessionExists: false, easyRunsRemaining: 0, weeklyVolumeKm: 0 };
      expect(actionPreconditions('L4_INSERT_RECOVERY_WEEK', empty)).toBe(true);
    });

    it('is valid when plan has sessions', () => {
      const full: PlanState = { longRunExists: true, qualitySessionExists: true, easyRunsRemaining: 3, weeklyVolumeKm: 50 };
      expect(actionPreconditions('L4_INSERT_RECOVERY_WEEK', full)).toBe(true);
    });
  });
});

describe('filterAvailableActions', () => {
  it('excludes L2_SOFTEN_WEEK when long run and quality are both gone', () => {
    const state: PlanState = {
      longRunExists: false,
      qualitySessionExists: false,
      easyRunsRemaining: 2,
      weeklyVolumeKm: 15,
    };
    const available = filterAvailableActions(state);
    expect(available).not.toContain('L2_SOFTEN_WEEK');
    expect(available).toContain('L3_REDUCE_WEEK');
    expect(available).toContain('L4_INSERT_RECOVERY_WEEK');
  });

  it('excludes L3_REDUCE_WEEK when weekly volume is zero', () => {
    const state: PlanState = {
      longRunExists: false,
      qualitySessionExists: false,
      easyRunsRemaining: 0,
      weeklyVolumeKm: 0,
    };
    const available = filterAvailableActions(state);
    expect(available).not.toContain('L2_SOFTEN_WEEK');
    expect(available).not.toContain('L3_REDUCE_WEEK');
    expect(available).toContain('L4_INSERT_RECOVERY_WEEK');
  });

  it('includes all options when a full week is present', () => {
    const state: PlanState = {
      longRunExists: true,
      qualitySessionExists: true,
      easyRunsRemaining: 2,
      weeklyVolumeKm: 45,
    };
    const available = filterAvailableActions(state);
    expect(available).toContain('L2_SOFTEN_WEEK');
    expect(available).toContain('L3_REDUCE_WEEK');
    expect(available).toContain('L4_INSERT_RECOVERY_WEEK');
  });

  it('excludes L2 but includes L3 and L4 when only easy runs remain after long run cancellation', () => {
    const state: PlanState = {
      longRunExists: false,
      qualitySessionExists: false,
      easyRunsRemaining: 3,
      weeklyVolumeKm: 20,
    };
    const available = filterAvailableActions(state);
    expect(available).not.toContain('L2_SOFTEN_WEEK');
    expect(available).toContain('L3_REDUCE_WEEK');
    expect(available).toContain('L4_INSERT_RECOVERY_WEEK');
  });

  it('includes L2 when only quality session remains (no long run)', () => {
    const state: PlanState = {
      longRunExists: false,
      qualitySessionExists: true,
      easyRunsRemaining: 1,
      weeklyVolumeKm: 12,
    };
    const available = filterAvailableActions(state);
    expect(available).toContain('L2_SOFTEN_WEEK');
  });
});
