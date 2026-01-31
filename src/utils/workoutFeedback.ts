import { supabase } from '../lib/supabase';
import { logger } from './logger';
import { extractRPEFromActivity } from './trainingPlanUtils';

export const checkForAIFeedback = async (
  user: any,
  savedPlanId: string,
  weekNumber: number,
  dayName: string,
  activity: string,
  rating: number,
  onTriggerChat: (message: string) => void
) => {
  if (!user || !savedPlanId || !onTriggerChat) return;

  const extractedRPE = extractRPEFromActivity(activity);
  const expectedRPERange = extractedRPE ? extractedRPE.split('-').map(Number) : null;
  const expectedMaxRPE = expectedRPERange ? expectedRPERange[expectedRPERange.length - 1] : null;

  let shouldTriggerFeedback = false;
  let feedbackMessage = '';

  if (activity.toLowerCase().includes('easy') || activity.toLowerCase().includes('recovery')) {
    if (rating >= 6) {
      shouldTriggerFeedback = true;
      feedbackMessage = `Hey! I noticed you rated Week ${weekNumber}, ${dayName}'s easy run as ${rating}/10 - that's harder than it should feel. Easy runs should feel comfortable. Would you like me to adjust your upcoming workouts to help with recovery?`;
    } else if (rating <= 2) {
      shouldTriggerFeedback = true;
      feedbackMessage = `Great work on Week ${weekNumber}, ${dayName}'s easy run! You rated it ${rating}/10 which shows you're recovering well. Would you like me to consider progressing your training slightly?`;
    }
  } else if (expectedMaxRPE && rating > expectedMaxRPE + 1) {
    shouldTriggerFeedback = true;
    feedbackMessage = `I see you rated Week ${weekNumber}, ${dayName}'s workout (${activity}) as ${rating}/10, which is significantly harder than the target ${extractedRPE}. This could indicate you need more recovery. Would you like me to adjust your plan?`;
  } else if (expectedMaxRPE && rating < expectedMaxRPE - 2) {
    shouldTriggerFeedback = true;
    feedbackMessage = `I noticed Week ${weekNumber}, ${dayName}'s workout felt easier than expected - you rated it ${rating}/10 compared to the target ${extractedRPE}. You're adapting well! Would you like me to increase the challenge slightly?`;
  } else if (rating >= 9 && !activity.toLowerCase().includes('race')) {
    shouldTriggerFeedback = true;
    feedbackMessage = `Wow, Week ${weekNumber}, ${dayName}'s workout was really tough - you rated it ${rating}/10! That's higher than ideal for a training session. Would you like me to review your training load and make some adjustments?`;
  }

  try {
    const { data: recentCompletions } = await supabase
      .from('workout_completions')
      .select('rating')
      .eq('user_id', user.id)
      .eq('training_plan_id', savedPlanId)
      .order('completed_at', { ascending: false })
      .limit(5);

    if (recentCompletions && recentCompletions.length >= 3) {
      const avgRating = recentCompletions.reduce((sum, c) => sum + c.rating, 0) / recentCompletions.length;
      if (avgRating >= 7.5) {
        shouldTriggerFeedback = true;
        feedbackMessage = `I've been monitoring your recent workouts and noticed your average RPE is ${avgRating.toFixed(1)}/10 across your last ${recentCompletions.length} sessions. That's consistently high - you might be training too hard and need more recovery. Would you like me to adjust your plan to prevent overtraining?`;
      } else if (avgRating <= 3.5) {
        shouldTriggerFeedback = true;
        feedbackMessage = `Great progress! Your recent workouts have averaged ${avgRating.toFixed(1)}/10 RPE, which shows you're handling your training well. Would you like me to increase the challenge to continue your development?`;
      }
    }
  } catch (error) {
    logger.error('Error checking recent completions:', error);
  }

  if (shouldTriggerFeedback) {
    setTimeout(() => {
      onTriggerChat(feedbackMessage);
    }, 2000);
  }
};
