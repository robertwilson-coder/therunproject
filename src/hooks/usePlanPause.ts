import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { buildPauseResult, resumePlanAsync } from '../utils/planPause';
import type { ResumeResult } from '../utils/planPause';
import { parseRaceDistanceKmFromAnswers } from '../utils/recoveryWeekInsertion';
import { logger } from '../utils/logger';
import type { PlanStatus } from '../types';

export interface UsePlanPauseParams {
  planId: string | null;
  currentWeekIndex: number;
  answers: any;
  raceDate: string | undefined;
  planStatus: PlanStatus;
  pauseStartDate: string | null | undefined;
  pauseWeekIndex: number | null | undefined;
  pauseStructuralVolume: number | null | undefined;
  pauseLongRunTarget: number | null | undefined;
  totalPausedDays: number;
  onRaceDateChange?: (newRaceDate: string) => void;
}

export interface UsePlanPauseReturn {
  isPaused: boolean;
  isProcessing: boolean;
  pendingResumeResult: ResumeResult | null;
  pausePlan: () => Promise<void>;
  initResume: () => void;
  confirmResume: () => Promise<void>;
  cancelResume: () => void;
}

export function usePlanPause({
  planId,
  currentWeekIndex,
  answers,
  raceDate,
  planStatus,
  pauseStartDate,
  pauseWeekIndex,
  pauseStructuralVolume,
  pauseLongRunTarget,
  totalPausedDays,
  onRaceDateChange,
}: UsePlanPauseParams): UsePlanPauseReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingResumeResult, setPendingResumeResult] = useState<ResumeResult | null>(null);

  const isPaused = planStatus === 'paused';

  const pausePlan = async () => {
    if (!planId || isPaused) return;
    setIsProcessing(true);

    try {
      const today = new Date().toISOString().split('T')[0];
      const structuralVolume = answers?.currentWeeklyKm ?? 20;
      const longRunTarget = answers?.longestRun ?? 10;

      const pauseResult = buildPauseResult(today, currentWeekIndex, structuralVolume, longRunTarget);

      const { error } = await supabase
        .from('training_plans')
        .update({
          plan_status: 'paused',
          pause_start_date: pauseResult.pauseStartDate,
          pause_week_index: pauseResult.pauseWeekIndex,
          pause_structural_volume: pauseResult.pauseStructuralVolume,
          pause_long_run_target: pauseResult.pauseLongRunTarget,
          original_race_date: raceDate ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', planId);

      if (error) {
        logger.error('[PlanPause] Failed to pause plan', { planId, error: error.message });
      } else {
        logger.info('[PlanPause] Plan paused', {
          planId,
          weekIndex: currentWeekIndex,
          pauseDate: today,
          structuralVolume,
          longRunTarget,
        });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const initResume = async () => {
    if (!isPaused || !pauseStartDate) return;

    const raceDistanceKm = parseRaceDistanceKmFromAnswers(answers?.raceDistance);
    const startingWeeklyKm = answers?.currentWeeklyKm ?? 20;
    const startingLongestRunKm = answers?.longestRun ?? 10;

    try {
      const result = await resumePlanAsync({
        pauseStartDate,
        pauseWeekIndex: pauseWeekIndex ?? currentWeekIndex,
        pauseStructuralVolume: pauseStructuralVolume ?? startingWeeklyKm,
        pauseLongRunTarget: pauseLongRunTarget ?? startingLongestRunKm,
        totalPausedDaysBefore: totalPausedDays,
        originalRaceDate: raceDate ?? '',
        currentRaceDate: raceDate ?? '',
        raceDistanceKm,
        startingWeeklyKm,
        startingLongestRunKm,
        trainingFocus: answers?.trainingFocus ?? 'durability',
      });

      setPendingResumeResult(result);
    } catch (err) {
      logger.error('[PlanPause] Failed to calculate resume projections', { error: err });
    }
  };

  const confirmResume = async () => {
    if (!planId || !pendingResumeResult) return;
    setIsProcessing(true);

    try {
      const { error } = await supabase
        .from('training_plans')
        .update({
          plan_status: 'active',
          race_date: pendingResumeResult.newRaceDate,
          total_paused_days: pendingResumeResult.totalPausedDays,
          pause_start_date: null,
          pause_week_index: null,
          pause_structural_volume: null,
          pause_long_run_target: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', planId);

      if (error) {
        logger.error('[PlanPause] Failed to resume plan', { planId, error: error.message });
      } else {
        logger.info('[PlanPause] Plan resumed', {
          planId,
          newRaceDate: pendingResumeResult.newRaceDate,
          pauseDurationDays: pendingResumeResult.pauseDurationDays,
          totalPausedDays: pendingResumeResult.totalPausedDays,
        });

        if (onRaceDateChange) {
          onRaceDateChange(pendingResumeResult.newRaceDate);
        }
      }
    } finally {
      setIsProcessing(false);
      setPendingResumeResult(null);
    }
  };

  const cancelResume = () => {
    setPendingResumeResult(null);
  };

  return {
    isPaused,
    isProcessing,
    pendingResumeResult,
    pausePlan,
    initResume,
    confirmResume,
    cancelResume,
  };
}
