import { useState } from 'react';
import { logger } from '../utils/logger';
import { supabase } from '../lib/supabase';
import type { PlanData, RunnerAnswers, TrainingPlan, TrainingPaces, ChatMessage, AppState, DateBasedPlanData } from '../types';

export function usePlanManagement() {
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [fullPlanData, setFullPlanData] = useState<PlanData | null>(null);
  const [answers, setAnswers] = useState<RunnerAnswers | null>(null);
  const [planType, setPlanType] = useState<'static' | 'responsive' | 'weeks_based' | 'date_based_preview' | 'date_based_full' | null>(null);
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null);
  const [planStartDate, setPlanStartDate] = useState<string | null>(null);
  const [trainingPaces, setTrainingPaces] = useState<TrainingPaces | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculateTrainingPaces = (runnerAnswers: RunnerAnswers): TrainingPaces | null => {
    const { recentRaceDistance, recentRaceHours, recentRaceMinutes, recentRaceSeconds } = runnerAnswers;

    if (!recentRaceDistance || recentRaceDistance === '') return null;

    const distances: Record<string, number> = {
      '5K': 5,
      '10K': 10,
      'Half Marathon': 21.0975,
      'Marathon': 42.195
    };

    const totalSeconds = (recentRaceHours || 0) * 3600 + (recentRaceMinutes || 0) * 60 + (recentRaceSeconds || 0);
    if (totalSeconds === 0) return null;

    const distanceKm = distances[recentRaceDistance];
    const raceSecondsPerKm = totalSeconds / distanceKm;

    const formatPace = (secondsPerKm: number): string => {
      const mins = Math.floor(secondsPerKm / 60);
      const secs = Math.round(secondsPerKm % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}/km`;
    };

    return {
      racePace: formatPace(raceSecondsPerKm),
      easyPace: formatPace(raceSecondsPerKm * 1.25),
      longRunPace: formatPace(raceSecondsPerKm * 1.20),
      tempoPace: formatPace(raceSecondsPerKm * 1.08),
      intervalPace: formatPace(raceSecondsPerKm * 0.95),
    };
  };

  const generatePlan = async (runnerAnswers: RunnerAnswers): Promise<void> => {
    setAnswers(runnerAnswers);
    const paces = calculateTrainingPaces(runnerAnswers);
    setTrainingPaces(paces);
    setSavedPlanId(null);

    setPlanType('responsive');
    setIsLoading(true);
    setError(null);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-training-plan`;

      const { data: { session } } = await supabase.auth.getSession();

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      };

      const startDateObj = runnerAnswers.customStartDate
        ? new Date(runnerAnswers.customStartDate)
        : (() => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            return tomorrow;
          })();
      const startDate = startDateObj.toISOString().split('T')[0];
      const startDayOfWeek = startDateObj.toLocaleDateString('en-US', { weekday: 'long' });

      const dayNameMap: Record<string, string> = {
        'Monday': 'Mon',
        'Tuesday': 'Tue',
        'Wednesday': 'Wed',
        'Thursday': 'Thu',
        'Friday': 'Fri',
        'Saturday': 'Sat',
        'Sunday': 'Sun'
      };

      const convertedAvailableDays = (runnerAnswers.availableDays || []).map(day => dayNameMap[day] || day);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          answers: {
            ...runnerAnswers,
            availableDays: convertedAvailableDays
          },
          startDate,
          startDayOfWeek,
          trainingPaces: paces
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to generate training plan');
        } else {
          const errorText = await response.text();
          logger.error('API Error:', errorText);
          throw new Error(`API Error: ${response.status} - ${response.statusText}`);
        }
      }

      const data = await response.json();

      setPlanStartDate(startDate);
      setFullPlanData(data);

      const previewWeeks = data.plan.slice(0, 2);
      const previewData = {
        plan: previewWeeks
      };
      setPlanData(previewData);

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Request timed out. Please try again with a shorter plan duration.');
      } else {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
      logger.error('Error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const updatePlan = async (updatedPlan: PlanData, isPreviewMode: boolean = false, updatedChatHistory?: ChatMessage[]) => {
    if (isPreviewMode && fullPlanData) {
      setFullPlanData(updatedPlan);
      const previewWeeks = updatedPlan.plan.slice(0, 2);
      setPlanData({ plan: previewWeeks });

      if (savedPlanId) {
        try {
          const { error } = await supabase
            .from('training_plans')
            .update({
              plan_data: updatedPlan,
              chat_history: updatedChatHistory || chatHistory,
              updated_at: new Date().toISOString()
            })
            .eq('id', savedPlanId);

          if (error) {
            logger.error('Error updating plan in database:', error);
          }
        } catch (error) {
          logger.error('Error updating plan:', error);
        }
      }
    } else {
      setPlanData(updatedPlan);
      if (savedPlanId) {
        try {
          const { error } = await supabase
            .from('training_plans')
            .update({
              plan_data: updatedPlan,
              chat_history: updatedChatHistory || chatHistory,
              updated_at: new Date().toISOString()
            })
            .eq('id', savedPlanId);

          if (error) {
            logger.error('Error updating plan in database:', error);
          }
        } catch (error) {
          logger.error('Error updating plan:', error);
        }
      }
    }
  };

  const loadPlan = async (plan: TrainingPlan) => {
    setPlanData(plan.plan_data);
    setFullPlanData(null);
    setAnswers(plan.answers);
    setPlanType(plan.plan_type);
    setSavedPlanId(plan.id);
    setPlanStartDate(plan.start_date);
    setTrainingPaces(plan.training_paces || null);

    // Load chat history from database
    try {
      const { data: messages, error } = await supabase
        .from('chat_messages')
        .select('role, content')
        .eq('training_plan_id', plan.id)
        .order('created_at', { ascending: true });

      if (error) {
        logger.error('Error loading chat messages:', error);
        setChatHistory(plan.chat_history || []);
      } else {
        setChatHistory(messages || []);
      }
    } catch (error) {
      logger.error('Error loading chat messages:', error);
      setChatHistory(plan.chat_history || []);
    }
  };

  const saveFullPlan = async (userId: string | undefined) => {
    if (userId && planData && answers && planType && planStartDate) {
      try {
        if (savedPlanId) {
          const planToSave = fullPlanData || planData;
          const { error: updateError } = await supabase
            .from('training_plans')
            .update({
              plan_data: planToSave,
              chat_history: chatHistory,
              training_paces: trainingPaces,
            })
            .eq('id', savedPlanId);

          if (updateError) {
            logger.error('Error updating plan:', updateError);
          } else {
            if (fullPlanData) {
              setPlanData(fullPlanData);
              setFullPlanData(null);
            }
          }
        } else if (fullPlanData) {
          const { data: savedData, error: saveError } = await supabase
            .from('training_plans')
            .insert({
              user_id: userId,
              answers,
              plan_data: fullPlanData,
              plan_type: planType,
              chat_history: chatHistory,
              start_date: planStartDate,
              training_paces: trainingPaces,
            })
            .select();

          if (!saveError && savedData && savedData[0]?.id) {
            setSavedPlanId(savedData[0].id);
            setPlanData(fullPlanData);
            setFullPlanData(null);
          }
        }
      } catch (error) {
        logger.error('Error saving plan:', error);
      }
    }
  };

  const generatePreviewPlan = async (runnerAnswers: RunnerAnswers): Promise<void> => {
    setAnswers(runnerAnswers);
    const paces = calculateTrainingPaces(runnerAnswers);
    setTrainingPaces(paces);
    setSavedPlanId(null);

    setPlanType('date_based_preview');
    setIsLoading(true);
    setError(null);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-preview-plan`;
      logger.info('Generating preview plan', { apiUrl });

      const { data: { session } } = await supabase.auth.getSession();
      logger.info('Session obtained', { hasSession: !!session });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      };

      const startDateObj = runnerAnswers.customStartDate
        ? new Date(runnerAnswers.customStartDate)
        : (() => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            return tomorrow;
          })();
      const startDate = startDateObj.toISOString().split('T')[0];

      const dayNameMap: Record<string, string> = {
        'Monday': 'Mon',
        'Tuesday': 'Tue',
        'Wednesday': 'Wed',
        'Thursday': 'Thu',
        'Friday': 'Fri',
        'Saturday': 'Sat',
        'Sunday': 'Sun'
      };

      const convertedAvailableDays = (runnerAnswers.availableDays || []).map(day => dayNameMap[day] || day);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      logger.info('Sending preview plan request', {
        startDate,
        availableDays: convertedAvailableDays,
        hasPaces: !!paces
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          answers: {
            ...runnerAnswers,
            availableDays: convertedAvailableDays
          },
          startDate,
          trainingPaces: paces
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      logger.info('Preview plan response received', { status: response.status, ok: response.ok });

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to generate preview plan');
        } else {
          const errorText = await response.text();
          logger.error('API Error:', errorText);
          throw new Error(`API Error: ${response.status} - ${response.statusText}`);
        }
      }

      const data = await response.json();
      logger.info('Preview plan data parsed', { hasPlanId: !!data.plan_id, weeksCount: data.plan?.length, daysCount: data.days?.length });

      setPlanStartDate(startDate);
      setPlanData(data as DateBasedPlanData);
      setSavedPlanId(data.plan_id);
      logger.info('Preview plan state updated successfully');

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Request timed out. Please try again.');
      } else {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
      logger.error('Error generating preview:', err);
      throw err;
    } finally {
      logger.info('Preview plan generation complete, setting isLoading to false');
      setIsLoading(false);
    }
  };

  const acceptPreviewPlan = async (): Promise<string> => {
    if (!savedPlanId) {
      throw new Error('No preview plan to accept');
    }

    setIsLoading(true);
    setError(null);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/accept-preview-plan`;

      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Authentication required');
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            planId: savedPlanId
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorMessage = 'Failed to accept preview plan';
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        logger.info('Preview accepted, job ID:', data.job_id);
        return data.job_id;
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
          throw new Error('Request timed out. Please try again.');
        }
        throw fetchErr;
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      logger.error('Error accepting preview:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const regeneratePreview = async (): Promise<void> => {
    if (!answers || !savedPlanId) {
      throw new Error('No preview plan to regenerate');
    }

    const { data: plan } = await supabase
      .from('training_plans')
      .select('final_preferences, start_date')
      .eq('id', savedPlanId)
      .single();

    if (plan) {
      const updatedAnswers = plan.final_preferences || answers;
      await generatePreviewPlan(updatedAnswers);
    }
  };

  const resetPlan = () => {
    setPlanData(null);
    setFullPlanData(null);
    setAnswers(null);
    setPlanType(null);
    setChatHistory([]);
    setError(null);
    setSavedPlanId(null);
    setPlanStartDate(null);
    setTrainingPaces(null);
  };

  return {
    planData,
    fullPlanData,
    answers,
    planType,
    savedPlanId,
    planStartDate,
    trainingPaces,
    chatHistory,
    isLoading,
    error,
    setPlanData,
    setFullPlanData,
    setAnswers,
    setPlanType,
    setSavedPlanId,
    setPlanStartDate,
    setTrainingPaces,
    setChatHistory,
    setError,
    generatePlan,
    generatePreviewPlan,
    acceptPreviewPlan,
    regeneratePreview,
    updatePlan,
    loadPlan,
    saveFullPlan,
    resetPlan,
  };
}
