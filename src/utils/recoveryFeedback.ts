import { supabase } from '../lib/supabase';
import { logger } from './logger';
import { evaluateHeartRateDeviation, evaluateSleepDeviation } from './recoveryDeviation';
import { sendCoachInterventionMessage } from './coachInterventionMessaging';
import { ChatMessage } from '../types';

interface HeartRateLog {
  log_date: string;
  heart_rate: number;
}

interface SleepLog {
  log_date: string;
  hours: number;
  quality: number;
  wake_feeling: 'well-rested' | 'normal' | 'fatigued';
}

interface CheckForHRInterventionParams {
  user: any;
  savedPlanId: string;
  logDate: string;
  recentHRLogs: HeartRateLog[];
  onChatUpdate?: (messages: ChatMessage[]) => void;
  currentChatHistory?: ChatMessage[];
  onInterventionSent?: (params: { source: string; workoutKey: string; completionId?: string }) => void;
}

interface CheckForSleepInterventionParams {
  user: any;
  savedPlanId: string;
  logDate: string;
  recentSleepLogs: SleepLog[];
  onChatUpdate?: (messages: ChatMessage[]) => void;
  currentChatHistory?: ChatMessage[];
  onInterventionSent?: (params: { source: string; workoutKey: string; completionId?: string }) => void;
}

export const checkForHRIntervention = async ({
  user,
  savedPlanId,
  logDate,
  recentHRLogs,
  onChatUpdate,
  currentChatHistory = [],
  onInterventionSent
}: CheckForHRInterventionParams): Promise<void> => {
  if (!user || !savedPlanId) return;

  const result = evaluateHeartRateDeviation(recentHRLogs);

  if (!result.shouldTrigger) return;

  logger.info('[RecoveryFeedback] HR intervention triggered', {
    deviationType: result.deviationType,
    logDate
  });

  const workoutKey = `hr-${logDate}`;

  setTimeout(async () => {
    await sendCoachInterventionMessage({
      userId: user.id,
      planId: savedPlanId,
      content: result.message,
      metadata: {
        source: result.deviationType === 'elevated_single' ? 'hr_elevated' : 'hr_sustained',
        workoutKey,
        deviationValue: result.deviation,
        timestamp: new Date().toISOString()
      },
      onChatUpdate,
      currentChatHistory,
      onInterventionSent
    });
  }, 1500);
};

export const checkForSleepIntervention = async ({
  user,
  savedPlanId,
  logDate,
  recentSleepLogs,
  onChatUpdate,
  currentChatHistory = [],
  onInterventionSent
}: CheckForSleepInterventionParams): Promise<void> => {
  if (!user || !savedPlanId) return;

  const result = evaluateSleepDeviation(recentSleepLogs);

  if (!result.shouldTrigger) return;

  logger.info('[RecoveryFeedback] Sleep intervention triggered', {
    deviationType: result.deviationType,
    logDate
  });

  const workoutKey = `sleep-${logDate}`;

  setTimeout(async () => {
    await sendCoachInterventionMessage({
      userId: user.id,
      planId: savedPlanId,
      content: result.message,
      metadata: {
        source: `sleep_${result.deviationType}`,
        workoutKey,
        timestamp: new Date().toISOString()
      },
      onChatUpdate,
      currentChatHistory,
      onInterventionSent
    });
  }, 1500);
};

export const fetchRecentHRLogs = async (userId: string, limit = 8): Promise<HeartRateLog[]> => {
  const { data, error } = await supabase
    .from('resting_heart_rate_logs')
    .select('log_date, heart_rate')
    .eq('user_id', userId)
    .order('log_date', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('[RecoveryFeedback] Error fetching HR logs:', error);
    return [];
  }

  return data || [];
};

export const fetchRecentSleepLogs = async (userId: string, limit = 7): Promise<SleepLog[]> => {
  const { data, error } = await supabase
    .from('sleep_logs')
    .select('log_date, hours, quality, wake_feeling')
    .eq('user_id', userId)
    .order('log_date', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error('[RecoveryFeedback] Error fetching sleep logs:', error);
    return [];
  }

  return data || [];
};
