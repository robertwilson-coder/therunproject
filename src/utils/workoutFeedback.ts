import { supabase } from '../lib/supabase';
import { logger } from './logger';
import { evaluateWorkoutEffortDeviation, evaluateRecentWorkoutPattern } from './rpeDeviation';
import { sendCoachInterventionMessage } from './coachInterventionMessaging';
import { ChatMessage } from '../types';

interface CheckForAIFeedbackParams {
  user: any;
  savedPlanId: string;
  completionId?: string;
  weekNumber: number;
  dayName: string;
  activity: string;
  rating: number;
  onChatUpdate?: (messages: ChatMessage[]) => void;
  currentChatHistory?: ChatMessage[];
  onInterventionSent?: (params: { source: string; workoutKey: string; completionId?: string }) => void;
}

/**
 * Checks if a coach intervention is warranted based on RPE deviation or patterns.
 * If triggered, sends an ASSISTANT-role message (FROM coach) to the chat thread.
 *
 * This is NOT a draft/prefill - it's a real coach message that appears automatically.
 */
export const checkForAIFeedback = async ({
  user,
  savedPlanId,
  completionId,
  weekNumber,
  dayName,
  activity,
  rating,
  onChatUpdate,
  currentChatHistory = [],
  onInterventionSent
}: CheckForAIFeedbackParams): Promise<void> => {
  console.log('[DEBUG-FEEDBACK] checkForAIFeedback CALLED', {
    hasUser: !!user,
    userId: user?.id,
    savedPlanId,
    completionId,
    weekNumber,
    dayName,
    activity,
    rating,
    hasOnChatUpdate: !!onChatUpdate,
    currentChatHistoryLength: currentChatHistory.length
  });

  if (!user || !savedPlanId) {
    console.log('[DEBUG-FEEDBACK] EARLY EXIT - no user or planId');
    return;
  }

  const workoutKey = `${weekNumber}-${dayName}`;
  console.log('[DEBUG-FEEDBACK] workoutKey:', workoutKey);

  const deviationResult = evaluateWorkoutEffortDeviation(
    activity,
    rating,
    weekNumber,
    dayName,
    workoutKey,
    undefined // No longer using lastTriggeredWorkout - dedupe handled in DB
  );

  console.log('[DEBUG-FEEDBACK] Deviation evaluation result:', deviationResult);
  logger.info('[WorkoutFeedback] Deviation evaluation result:', deviationResult);

  let shouldTriggerFeedback = deviationResult.shouldTrigger;
  let feedbackMessage = deviationResult.message;
  let feedbackSource: 'rpe_deviation' | 'pattern_based' = 'rpe_deviation';
  let deviationValue = 0;

  // Extract deviation value from result if available
  if (deviationResult.shouldTrigger && deviationResult.message) {
    const match = deviationResult.message.match(/RPE was ([-+]?\d+)/);
    if (match) {
      deviationValue = parseInt(match[1]);
    }
  }

  // If no deviation trigger, check for pattern-based feedback
  if (!shouldTriggerFeedback) {
    try {
      const { data: recentCompletions } = await supabase
        .from('workout_completions')
        .select('rating')
        .eq('user_id', user.id)
        .eq('training_plan_id', savedPlanId)
        .order('completed_at', { ascending: false })
        .limit(5);

      if (recentCompletions && recentCompletions.length > 0) {
        const recentRatings = recentCompletions.map(c => c.rating);
        const patternResult = evaluateRecentWorkoutPattern(recentRatings);

        if (patternResult.shouldTrigger) {
          shouldTriggerFeedback = true;
          feedbackMessage = patternResult.message;
          feedbackSource = 'pattern_based';
          logger.info('[WorkoutFeedback] Pattern-based feedback triggered:', patternResult);
        }
      }
    } catch (error) {
      logger.error('[WorkoutFeedback] Error checking recent completions:', error);
    }
  }

  // Send coach intervention message if triggered
  if (shouldTriggerFeedback && feedbackMessage) {
    console.log('[DEBUG-FEEDBACK] INTERVENTION TRIGGERED', {
      source: feedbackSource,
      workoutKey,
      feedbackMessagePreview: feedbackMessage.substring(0, 50)
    });

    logger.info('[WorkoutFeedback] Sending coach intervention message', {
      source: feedbackSource,
      workoutKey
    });

    // Send after a brief delay for better UX (celebration appears first)
    console.log('[DEBUG-FEEDBACK] Setting 2s timeout to send intervention');
    setTimeout(async () => {
      console.log('[DEBUG-FEEDBACK] TIMEOUT FIRED - calling sendCoachInterventionMessage now');
      const success = await sendCoachInterventionMessage({
        userId: user.id,
        planId: savedPlanId,
        content: feedbackMessage,
        metadata: {
          source: feedbackSource,
          completionId,
          workoutKey,
          deviationValue: deviationValue !== 0 ? deviationValue : undefined,
          timestamp: new Date().toISOString()
        },
        onChatUpdate,
        currentChatHistory,
        onInterventionSent
      });

      console.log('[DEBUG-FEEDBACK] sendCoachInterventionMessage returned:', success);
      if (success) {
        logger.info('[WorkoutFeedback] Coach intervention message sent successfully');
      } else {
        logger.warn('[WorkoutFeedback] Coach intervention message not sent (possibly duplicate)');
      }
    }, 2000);
  } else {
    console.log('[DEBUG-FEEDBACK] NO INTERVENTION - shouldTrigger:', shouldTriggerFeedback, 'hasMessage:', !!feedbackMessage);
  }
};
