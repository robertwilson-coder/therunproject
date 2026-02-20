import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';
import { parseWorkoutDescription } from '../utils/workoutParser';
import { getWorkoutCelebration } from '../utils/workoutCelebration';
import { checkForAIFeedback } from '../utils/workoutFeedback';
import { ChatMessage } from '../types';

interface UseWorkoutOperationsProps {
  user: any;
  savedPlanId: string | null;
  completedWorkouts: Set<string>;
  setCompletedWorkouts: (workouts: Set<string>) => void;
  onCompletedWorkoutsChange?: (workouts: Set<string>) => void;
  planType: 'static' | 'responsive';
  onChatUpdate?: (messages: ChatMessage[]) => void;
  currentChatHistory?: ChatMessage[];
  setNewBadges: (badges: any[]) => void;
  setCelebrationMessage: (message: { title: string; message: string }) => void;
  setShowCelebration: (show: boolean) => void;
  onCoachInterventionSent?: (params: { source: string; workoutKey: string; completionId?: string }) => void;
  planStartDate?: string;
}

export const useWorkoutOperations = ({
  user,
  savedPlanId,
  completedWorkouts,
  setCompletedWorkouts,
  onCompletedWorkoutsChange,
  planType,
  onChatUpdate,
  currentChatHistory,
  setNewBadges,
  setCelebrationMessage,
  setShowCelebration,
  onCoachInterventionSent,
  planStartDate
}: UseWorkoutOperationsProps) => {
  const [workoutToRate, setWorkoutToRate] = useState<{week: number, day: string, activity: string} | null>(null);
  const [rating, setRating] = useState(0);
  const [workoutDistance, setWorkoutDistance] = useState(0);
  const [workoutDuration, setWorkoutDuration] = useState(0);
  const [workoutEnjoyment, setWorkoutEnjoyment] = useState<string>('');
  const [workoutNotes, setWorkoutNotes] = useState<string>('');

  const [calibrationWorkout, setCalibrationWorkout] = useState<{week: number, day: string, activity: string} | null>(null);
  const [calibrationWorkDuration, setCalibrationWorkDuration] = useState(0);
  const [calibrationWorkDistance, setCalibrationWorkDistance] = useState(0);
  const [calibrationAveragePace, setCalibrationAveragePace] = useState(0);
  const [calibrationPaceSplit, setCalibrationPaceSplit] = useState(0);
  const [calibrationElevationGain, setCalibrationElevationGain] = useState(0);
  const [calibrationStartingHeartRate, setCalibrationStartingHeartRate] = useState(0);
  const [calibrationEndingHeartRate, setCalibrationEndingHeartRate] = useState(0);
  const [calibrationStoppedOrWalked, setCalibrationStoppedOrWalked] = useState(false);
  const [calibrationEffortConsistency, setCalibrationEffortConsistency] = useState(0);
  const [calibrationLapSplits, setCalibrationLapSplits] = useState<string[]>([]);
  const [calibrationNotes, setCalibrationNotes] = useState('');

  const isCalibrationWorkout = (weekNumber: number, activity: string): boolean => {
    const activityLower = activity.toLowerCase();
    return activityLower.includes('calibration') ||
      (weekNumber === 1 &&
       activityLower.includes('warm up:') &&
       activityLower.includes('work:') &&
       activityLower.includes('cool down:') &&
       (activityLower.includes('controlled') ||
        activityLower.includes('hard') ||
        activityLower.includes('rpe 7') ||
        activityLower.includes('rpe 8') ||
        activityLower.includes('continuous')) &&
       !activityLower.includes('easy') &&
       !activityLower.includes('x ') &&
       !activityLower.includes(' x') &&
       !activityLower.includes('reps') &&
       !activityLower.includes('recovery') &&
       !activityLower.includes('active recovery'));
  };

  const calculateScheduledDate = (weekNumber: number, dayName: string): string | null => {
    if (!planStartDate) return null;

    const dayMap: { [key: string]: number } = {
      'Mon': 0, 'Monday': 0,
      'Tue': 1, 'Tuesday': 1,
      'Wed': 2, 'Wednesday': 2,
      'Thu': 3, 'Thursday': 3,
      'Fri': 4, 'Friday': 4,
      'Sat': 5, 'Saturday': 5,
      'Sun': 6, 'Sunday': 6
    };

    const dayOffset = dayMap[dayName];
    if (dayOffset === undefined) return null;

    const startDate = new Date(planStartDate + 'T00:00:00');
    const daysToAdd = (weekNumber - 1) * 7 + dayOffset;
    startDate.setDate(startDate.getDate() + daysToAdd);

    const year = startDate.getFullYear();
    const month = String(startDate.getMonth() + 1).padStart(2, '0');
    const day = String(startDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const toggleWorkoutCompletion = async (weekNumber: number, dayName: string, activity: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user || !savedPlanId) return;

    const key = `${weekNumber}-${dayName}`;
    const isCompleted = completedWorkouts.has(key);
    const isCalibration = isCalibrationWorkout(weekNumber, activity);

    try {
      if (isCompleted) {
        if (isCalibration) {
          const { error } = await supabase
            .from('calibration_completions')
            .delete()
            .eq('training_plan_id', savedPlanId)
            .eq('week_number', weekNumber)
            .eq('day_name', dayName);

          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('workout_completions')
            .delete()
            .eq('training_plan_id', savedPlanId)
            .eq('week_number', weekNumber)
            .eq('day_name', dayName);

          if (error) throw error;
        }

        const newCompleted = new Set(completedWorkouts);
        newCompleted.delete(key);
        setCompletedWorkouts(newCompleted);
        if (onCompletedWorkoutsChange) {
          onCompletedWorkoutsChange(newCompleted);
        }
      } else {
        logger.info('Setting workout to rate:', { weekNumber, dayName, activity, isCalibration });

        if (isCalibration) {
          setCalibrationWorkout({ week: weekNumber, day: dayName, activity });
          setCalibrationWorkDuration(0);
          setCalibrationWorkDistance(0);
          setCalibrationAveragePace(0);
          setCalibrationPaceSplit(0);
          setCalibrationElevationGain(0);
          setCalibrationStartingHeartRate(0);
          setCalibrationEndingHeartRate(0);
          setCalibrationStoppedOrWalked(false);
          setCalibrationEffortConsistency(0);
          setCalibrationLapSplits([]);
          setCalibrationNotes('');
        } else {
          const parsed = parseWorkoutDescription(activity);
          setWorkoutToRate({ week: weekNumber, day: dayName, activity });
          setRating(0);

          // Set reasonable defaults if parser didn't find values
          let distance = parsed.distanceKm;
          let duration = parsed.durationMinutes;

          // If we found duration but not distance, estimate distance based on typical paces
          if (duration > 0 && distance === 0) {
            distance = duration * 0.15; // ~6:40/km pace
          }
          // If we found distance but not duration, estimate duration
          else if (distance > 0 && duration === 0) {
            duration = distance * 6.5; // ~6:30/km pace
          }
          // If we found neither, use a typical easy run default
          else if (distance === 0 && duration === 0) {
            distance = 5;
            duration = 30;
          }

          setWorkoutDistance(distance);
          setWorkoutDuration(duration);
        }
      }
    } catch (error) {
      logger.error('Error toggling completion:', error);
    }
  };

  const submitWorkoutCompletion = async (workoutRating: number) => {
    if (!user || !savedPlanId || !workoutToRate || workoutRating === 0) {
      logger.info('Submit validation failed:', { user: !!user, savedPlanId, workoutToRate, workoutRating });
      return;
    }

    logger.info('Submitting workout completion:', { week: workoutToRate.week, day: workoutToRate.day, rating: workoutRating });

    try {
      const scheduledDate = calculateScheduledDate(workoutToRate.week, workoutToRate.day);

      // Insert completion and capture the ID for dedupe
      const { data: completionData, error } = await supabase
        .from('workout_completions')
        .insert({
          user_id: user.id,
          training_plan_id: savedPlanId,
          week_number: workoutToRate.week,
          day_name: workoutToRate.day,
          rating: workoutRating,
          distance_km: workoutDistance > 0 ? workoutDistance : null,
          duration_minutes: workoutDuration > 0 ? workoutDuration : null,
          enjoyment: workoutEnjoyment || null,
          scheduled_date: scheduledDate,
        })
        .select('id')
        .single();

      if (error) {
        logger.error('Database error:', error);
        throw error;
      }

      logger.info('Workout completion saved successfully', { completionId: completionData?.id });

      if (workoutNotes.trim()) {
        try {
          const { error: notesError } = await supabase
            .from('workout_notes')
            .insert({
              user_id: user.id,
              training_plan_id: savedPlanId,
              week_number: workoutToRate.week,
              day_name: workoutToRate.day,
              notes: workoutNotes.trim(),
              mood: workoutEnjoyment || null,
            });

          if (notesError) {
            logger.error('Error saving notes:', notesError);
          }
        } catch (notesError) {
          logger.error('Failed to save workout notes:', notesError);
        }
      }

      const key = `${workoutToRate.week}-${workoutToRate.day}`;
      const newCompleted = new Set(completedWorkouts);
      newCompleted.add(key);
      setCompletedWorkouts(newCompleted);
      if (onCompletedWorkoutsChange) {
        onCompletedWorkoutsChange(newCompleted);
      }

      try {
        const { updateUserStreak } = await import('../utils/streakUpdater');
        const result = await updateUserStreak(user.id, savedPlanId);

        if (result.success && result.newBadges && result.newBadges.length > 0) {
          setNewBadges(result.newBadges);
        }
      } catch (streakError) {
        logger.error('Error updating streak:', streakError);
      }

      // Check for coach intervention (RPE deviation or patterns)
      // This sends an ASSISTANT-role message directly to the chat thread if triggered
      try {
        await checkForAIFeedback({
          user,
          savedPlanId,
          completionId: completionData?.id,
          weekNumber: workoutToRate.week,
          dayName: workoutToRate.day,
          activity: workoutToRate.activity,
          rating: workoutRating,
          onChatUpdate,
          currentChatHistory,
          onInterventionSent: onCoachInterventionSent
        });
      } catch (feedbackError) {
        logger.error('Error checking for AI feedback:', feedbackError);
      }

      const celebration = getWorkoutCelebration(workoutToRate.activity);
      setCelebrationMessage(celebration);
      setShowCelebration(true);
    } catch (error) {
      logger.error('Error submitting completion:', error);
      alert('Failed to save workout completion. Please try again.');
    }
  };

  const submitCalibrationCompletion = async () => {
    if (!user || !savedPlanId || !calibrationWorkout) {
      logger.info('Calibration submit validation failed:', { user: !!user, savedPlanId, calibrationWorkout });
      return;
    }

    if (calibrationWorkDuration === 0 || calibrationWorkDistance === 0 || calibrationAveragePace === 0 || calibrationEffortConsistency === 0) {
      logger.info('Calibration validation failed - missing required fields');
      return;
    }

    logger.info('Submitting calibration completion:', {
      week: calibrationWorkout.week,
      day: calibrationWorkout.day
    });

    try {
      const { assessCalibrationTest } = await import('../utils/calibrationFeedback');

      const lapSplitsSeconds = calibrationLapSplits
        .map(split => {
          const parts = split.split(':');
          if (parts.length === 2) {
            const mins = parseInt(parts[0]) || 0;
            const secs = parseInt(parts[1]) || 0;
            return mins * 60 + secs;
          }
          return 0;
        })
        .filter(s => s > 0);

      const calculatedAvgHeartRate = calibrationStartingHeartRate > 0 && calibrationEndingHeartRate > 0
        ? Math.round((calibrationStartingHeartRate + calibrationEndingHeartRate) / 2)
        : 0;
      const calculatedHeartRateDrift = calibrationStartingHeartRate > 0 && calibrationEndingHeartRate > 0
        ? calibrationEndingHeartRate - calibrationStartingHeartRate
        : 0;

      const assessment = assessCalibrationTest({
        workDuration: calibrationWorkDuration,
        workDistance: calibrationWorkDistance,
        averagePaceSeconds: calibrationAveragePace,
        paceSplitDifference: calibrationPaceSplit,
        elevationGain: calibrationElevationGain,
        averageHeartRate: calculatedAvgHeartRate,
        heartRateDrift: calculatedHeartRateDrift,
        stoppedOrWalked: calibrationStoppedOrWalked,
        effortConsistency: calibrationEffortConsistency,
        lapSplits: lapSplitsSeconds.length > 0 ? lapSplitsSeconds : undefined,
        notes: calibrationNotes
      });

      logger.info('Calibration assessment:', assessment);

      const distanceMeters = calibrationWorkDistance * 1000;
      const paceVariabilityPct = calibrationPaceSplit ? Math.abs(calibrationPaceSplit / calibrationAveragePace * 100) : 0;

      const testType = calibrationWorkout.activity.toLowerCase().includes('5k') ? '5K' :
        calibrationWorkout.activity.toLowerCase().includes('10k') ? '10K' :
        calibrationWorkout.activity.toLowerCase().includes('half') ? 'HM' :
        calibrationWorkout.activity.toLowerCase().includes('ultra') ? 'ULTRA' : 'MARATHON';

      const calibrationResult = {
        testType,
        completedAtISO: new Date().toISOString(),
        workSegmentDurationMinutes: calibrationWorkDuration,
        workSegmentDistanceMeters: distanceMeters,
        averagePaceSecPerKm: calibrationAveragePace,
        paceVariabilityPct: paceVariabilityPct > 0 ? paceVariabilityPct : undefined,
        firstHalfVsSecondHalfSplitPct: calibrationPaceSplit !== 0 ? (calibrationPaceSplit / calibrationAveragePace * 100) : undefined,
        pausedTimeSeconds: 0,
        elevationGainMeters: calibrationElevationGain,
        avgHeartRate: calculatedAvgHeartRate > 0 ? calculatedAvgHeartRate : undefined,
        hrDriftPct: calculatedHeartRateDrift !== 0 ? (calculatedHeartRateDrift / (calculatedAvgHeartRate || 1) * 100) : undefined,
        stoppedOrWalked: calibrationStoppedOrWalked,
        effortConsistency: calibrationEffortConsistency,
        validity: assessment.confidenceLevel.toLowerCase() as 'high' | 'medium' | 'low',
        pacingQuality: assessment.pacingQuality.toLowerCase() as 'excellent' | 'good' | 'poor',
        confidence: assessment.confidenceLevel.toLowerCase() as 'high' | 'medium' | 'low'
      };

      const insertData = {
        user_id: user.id,
        training_plan_id: savedPlanId,
        week_number: calibrationWorkout.week,
        day_name: calibrationWorkout.day,
        test_type: testType,
        work_duration_minutes: calibrationWorkDuration,
        work_distance_km: calibrationWorkDistance,
        average_pace_seconds: calibrationAveragePace,
        pace_split_difference_seconds: calibrationPaceSplit,
        elevation_gain_meters: calibrationElevationGain,
        average_heart_rate: calculatedAvgHeartRate > 0 ? calculatedAvgHeartRate : null,
        heart_rate_drift: calculatedHeartRateDrift !== 0 ? calculatedHeartRateDrift : null,
        stopped_or_walked: calibrationStoppedOrWalked,
        effort_consistency: calibrationEffortConsistency,
        lap_splits: lapSplitsSeconds.length > 0 ? lapSplitsSeconds : null,
        notes: calibrationNotes || null,
        feedback_text: assessment.feedbackText,
        confidence_level: assessment.confidenceLevel,
        pacing_quality: assessment.pacingQuality
      };

      logger.info('Attempting to insert calibration completion:', insertData);

      const { error: calibrationInsertError } = await supabase
        .from('calibration_completions')
        .insert(insertData);

      if (calibrationInsertError) {
        logger.error('Error saving calibration completion:', {
          error: calibrationInsertError,
          message: calibrationInsertError.message,
          details: calibrationInsertError.details,
          hint: calibrationInsertError.hint,
          code: calibrationInsertError.code
        });
        throw new Error(`Failed to save calibration: ${calibrationInsertError.message}`);
      }

      logger.info('Updating training plan with calibration result:', calibrationResult);

      const { error } = await supabase
        .from('training_plans')
        .update({ calibration_result: calibrationResult })
        .eq('id', savedPlanId);

      if (error) {
        logger.error('Error updating training plan:', {
          error: error,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        throw new Error(`Failed to update plan: ${error.message}`);
      }

      logger.info('Calibration result saved successfully:', {
        confidence: assessment.confidenceLevel,
        pacingQuality: assessment.pacingQuality
      });

      const key = `${calibrationWorkout.week}-${calibrationWorkout.day}`;
      const newCompleted = new Set(completedWorkouts);
      newCompleted.add(key);
      setCompletedWorkouts(newCompleted);
      if (onCompletedWorkoutsChange) {
        onCompletedWorkoutsChange(newCompleted);
      }

      try {
        const { updateUserStreak } = await import('../utils/streakUpdater');
        const result = await updateUserStreak(user.id, savedPlanId);

        if (result.success && result.newBadges && result.newBadges.length > 0) {
          setNewBadges(result.newBadges);
        }
      } catch (streakError) {
        logger.error('Error updating streak:', streakError);
      }

      setCelebrationMessage({
        title: 'Calibration Test Complete!',
        message: assessment.feedbackText
      });
      setShowCelebration(true);

      logger.info('Triggering plan regeneration from Week 3 onward...');

      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        const regenerateResponse = await fetch(
          `${supabaseUrl}/functions/v1/regenerate-plan-from-calibration`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseAnonKey}`,
            },
            body: JSON.stringify({ planId: savedPlanId })
          }
        );

        if (!regenerateResponse.ok) {
          throw new Error('Failed to regenerate plan');
        }

        const regenerateData = await regenerateResponse.json();
        logger.info('Plan regeneration response:', regenerateData);

        if (regenerateData.success) {
          logger.info('Plan successfully regenerated from Week 3 onward');
        }
      } catch (regenerateError) {
        logger.error('Error triggering plan regeneration:', regenerateError);
      }
    } catch (error) {
      logger.error('Error submitting calibration:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Failed to save calibration results: ${errorMessage}. Please check your internet connection and try again.`);
    }
  };

  const resetWorkoutForm = () => {
    setWorkoutToRate(null);
    setRating(0);
    setWorkoutDistance(0);
    setWorkoutDuration(0);
    setWorkoutEnjoyment('');
    setWorkoutNotes('');
  };

  const resetCalibrationForm = () => {
    setCalibrationWorkout(null);
    setCalibrationWorkDuration(0);
    setCalibrationWorkDistance(0);
    setCalibrationAveragePace(0);
    setCalibrationPaceSplit(0);
    setCalibrationElevationGain(0);
    setCalibrationStartingHeartRate(0);
    setCalibrationEndingHeartRate(0);
    setCalibrationStoppedOrWalked(false);
    setCalibrationEffortConsistency(0);
    setCalibrationLapSplits([]);
    setCalibrationNotes('');
  };

  return {
    workoutToRate,
    rating,
    workoutDistance,
    workoutDuration,
    workoutEnjoyment,
    workoutNotes,
    setRating,
    setWorkoutDistance,
    setWorkoutDuration,
    setWorkoutEnjoyment,
    setWorkoutNotes,
    toggleWorkoutCompletion,
    submitWorkoutCompletion,
    resetWorkoutForm,
    calibrationWorkout,
    calibrationWorkDuration,
    calibrationWorkDistance,
    calibrationAveragePace,
    calibrationPaceSplit,
    calibrationElevationGain,
    calibrationStartingHeartRate,
    calibrationEndingHeartRate,
    calibrationStoppedOrWalked,
    calibrationEffortConsistency,
    calibrationLapSplits,
    calibrationNotes,
    setCalibrationWorkDuration,
    setCalibrationWorkDistance,
    setCalibrationAveragePace,
    setCalibrationPaceSplit,
    setCalibrationElevationGain,
    setCalibrationStartingHeartRate,
    setCalibrationEndingHeartRate,
    setCalibrationStoppedOrWalked,
    setCalibrationEffortConsistency,
    setCalibrationLapSplits,
    setCalibrationNotes,
    submitCalibrationCompletion,
    resetCalibrationForm
  };
};
