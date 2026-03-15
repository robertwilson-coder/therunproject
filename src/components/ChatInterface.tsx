import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../utils/logger';
import { getUserFriendlyError, ErrorMessages } from '../utils/errorMessages';
import { DateResolver } from '../utils/dateResolver';
import { formatUKDate } from '../utils/ukDateFormat';
import { getUserTimezone, getTodayISO } from '../utils/timezoneUtils';
import { normalizeDateBasedPlan } from '../utils/planNormalization';
import { generateContextAwareWorkout, shouldSkipInsertion } from '../utils/contextAwareWorkoutInsertion';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface PreviewChange {
  date: string;
  operation: 'cancel' | 'reschedule' | 'modify';
  before: {
    title: string;
    description?: string;
  };
  after?: {
    title: string;
    description?: string;
    scheduled_for?: string;
  };
}

interface PreviewSet {
  preview_id: string;
  modifications: PreviewChange[];
  summary: string;
  expires_at: string;
}

interface ClarificationOption {
  id: string;
  isoDate: string;
  displayDate: string;
  label: string;
}

interface ClarificationRequest {
  mode: 'clarification_required';
  clarificationId: string;
  question: string;
  options: ClarificationOption[];
  context: {
    originalMessage: string;
    detectedPhrase: string;
  };
}

type ModificationIntent =
  | 'none'
  | 'insert_recovery_week'
  | 'suggest_pause'
  | 'suggest_recalibration';

type InterventionLevel = 'L1' | 'L2' | 'L3' | 'L4';

interface FatigueOption {
  level: InterventionLevel;
  label: string;
  shortLabel: string;
  description: string;
  consequence: string;
  intent: string;
  requiresStructuralRebuild: boolean;
}

interface FatigueOptionsState {
  message: string;
  options: FatigueOption[];
  isInTaper: boolean;
}

interface WorkoutModificationIntent {
  type: string;
  details: Record<string, unknown>;
}

interface PendingModificationIntent {
  intent: ModificationIntent;
  modificationIntents: WorkoutModificationIntent[];
  message: string;
  reasoning: string;
  proposal_id: string | null;
}

interface RecurringWeekdayEditState {
  recurring_operation: 'recurring_move' | 'recurring_add' | 'recurring_remove';
  from_weekday?: string;
  to_weekday?: string;
  target_weekday?: string;
  coachMessage: string;
}

type PlanTier = 'base' | 'performance' | 'competitive';

interface TierChangeProposalState {
  proposal_id: string | null;
  currentTier?: PlanTier;
  targetTier?: PlanTier;
  isUpgrade: boolean;
  message: string;
  availableTiers?: PlanTier[];
}

interface ChatInterfaceProps {
  planType: 'static' | 'responsive' | 'date_based_preview' | 'date_based_full';
  onUpdatePlan: (updatedPlan: any, isPreviewMode?: boolean, updatedChatHistory?: ChatMessage[]) => void;
  chatHistory: ChatMessage[];
  onChatUpdate: (history: ChatMessage[]) => void;
  planData: any;
  answers: any;
  onAnswersUpdate?: (updatedAnswers: any) => void;
  currentWeekNumber?: number;
  planStartDate?: string;
  completedWorkouts?: Set<string>;
  planId?: string;
  isPreviewMode?: boolean;
  onModificationIntent?: (intent: ModificationIntent, workoutIntents: WorkoutModificationIntent[]) => void;
}

export function ChatInterface({
  planType,
  onUpdatePlan,
  chatHistory,
  onChatUpdate,
  planData,
  answers,
  onAnswersUpdate,
  currentWeekNumber,
  planStartDate,
  completedWorkouts,
  planId,
  isPreviewMode = false,
  onModificationIntent,
}: ChatInterfaceProps) {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [previewSet, setPreviewSet] = useState<PreviewSet | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [clarificationRequest, setClarificationRequest] = useState<ClarificationRequest | null>(null);
  const [showClarificationModal, setShowClarificationModal] = useState(false);

  const [pendingIntent, setPendingIntent] = useState<PendingModificationIntent | null>(null);
  const [fatigueOptions, setFatigueOptions] = useState<FatigueOptionsState | null>(null);
  const [recurringWeekdayEdit, setRecurringWeekdayEdit] = useState<RecurringWeekdayEditState | null>(null);
  const [tierChangeProposal, setTierChangeProposal] = useState<TierChangeProposalState | null>(null);

  // Inline proposal buffer — holds the active draft proposal without applying it
  const [proposedPatches, setProposedPatches] = useState<{
    advisoryId: string;
    explanation: string;
    modifications: PreviewChange[];
    rawModifications: Array<{ operation: string; target_date: string; new_date?: string }>;
    version: number;
  } | null>(null);
  const proposalVersionRef = useRef(0);

  const stripMarkdown = (text: string): string => {
    if (!text) return '';
    return text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      .replace(/~~(.*?)~~/g, '$1');
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  const isAwaitingName = (): boolean => {
    if (isPreviewMode) return false;
    if (answers?.userName) return false;
    if (chatHistory.length === 0) return false;
    const lastAssistantMessage = [...chatHistory].reverse().find(m => m.role === 'assistant');
    if (lastAssistantMessage?.content.includes("what's your name")) return true;
    if (chatHistory.length === 1 && chatHistory[0].role === 'assistant') return true;
    return false;
  };

  const extractNameFromMessage = (text: string): string | null => {
    const trimmed = text.trim();
    if (trimmed.length === 0 || trimmed.length > 60) return null;
    const workoutWords = ['run', 'workout', 'plan', 'training', 'race', 'week', 'move', 'cancel', 'help', 'change', 'reduce', 'increase', 'swap', 'rest', 'easy', 'tempo', 'long'];
    const lower = trimmed.toLowerCase();
    if (workoutWords.some(w => lower.includes(w))) return null;

    const namePatterns = [
      /(?:my name is|i'm|i am|it's|its|call me)\s+([a-z]+(?:\s+[a-z]+)?)/i,
      /^(?:hi[,!]?\s+)?(?:i'm|i am)\s+([a-z]+(?:\s+[a-z]+)?)/i,
    ];
    for (const pattern of namePatterns) {
      const match = trimmed.match(pattern);
      if (match) return match[1].trim();
    }

    if (trimmed.split(' ').length <= 3) return trimmed;
    return null;
  };

  const looksLikeAName = (text: string): boolean => {
    return extractNameFromMessage(text) !== null;
  };

  const saveUserName = async (name: string) => {
    if (!planId || !user) return;
    const updatedAnswers = { ...answers, userName: name };
    try {
      await supabase
        .from('training_plans')
        .update({ answers: updatedAnswers })
        .eq('id', planId)
        .eq('user_id', user.id);
      onAnswersUpdate?.(updatedAnswers);
    } catch (err) {
      logger.error('[ChatInterface] Failed to save user name:', err);
    }
  };

  useEffect(() => {
    if ((planType === 'responsive' || planType === 'date_based_preview' || planType === 'date_based_full') && chatHistory.length === 0) {
      const welcomeMessage: ChatMessage = {
        role: 'assistant',
        content: isPreviewMode
          ? "Hi, I'm your AI running coach! I'm here to make your training fit your life.\n\nI can help you:\n• Move workouts around your schedule (e.g., 'move my long run to Saturday')\n• Adjust distances or intensity (e.g., 'reduce this week's mileage by 20%')\n• Handle life changes (e.g., 'I'm traveling next week, can we adjust?')\n• Swap workout types (e.g., 'replace tomorrow's tempo with an easy run')\n\nThis is a preview of the chat feature. Once you sign up, I'll be able to actually modify your full training plan and help you all the way to race day.\n\nGo ahead and try asking me something - see how it works!"
          : answers?.userName
            ? `Welcome back, ${answers.userName}! I'm here whenever you need to adjust your plan. What can I help you with?`
            : "Hi, I'm your running coach and I'm here to help you find your flow.\n\nBefore we get started - what's your name?"
      };
      onChatUpdate([welcomeMessage]);
      if (planId) {
        saveChatMessage('assistant', welcomeMessage.content);
      }
    }
  }, []);

  const resolveDatesInMessage = (msg: string): { resolvedMessage: string; resolvedDates: Record<string, string> } => {
    const dateResolver = new DateResolver();
    const resolvedDates: Record<string, string> = {};

    const patterns = [
      /\b(next|last)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
      /\b(today|tomorrow|yesterday)\b/gi,
    ];

    let resolvedMessage = msg;

    patterns.forEach(pattern => {
      const matches = msg.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const resolution = dateResolver.resolveRelativeDay(match);
          if (!resolution.isAmbiguous) {
            resolvedDates[match] = resolution.isoDate;
            resolvedMessage = resolvedMessage.replace(
              new RegExp(match, 'gi'),
              `${match} (${formatUKDate(resolution.isoDate)})`
            );
          }
        });
      }
    });

    logger.info('[ChatInterface] Resolved dates:', resolvedDates);
    return { resolvedMessage, resolvedDates };
  };

  const fetchWorkoutNotes = async () => {
    if (!user || !planId) return [];

    try {
      const { data, error } = await supabase
        .from('workout_notes')
        .select('*')
        .eq('user_id', user.id)
        .eq('training_plan_id', planId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Error fetching workout notes', error);
      return [];
    }
  };

  const fetchWorkoutCompletions = async () => {
    if (!user || !planId) return [];

    try {
      const { data, error } = await supabase
        .from('workout_completions')
        .select('week_number, day_name, rating, distance_km, duration_minutes, completed_at')
        .eq('user_id', user.id)
        .eq('training_plan_id', planId)
        .order('completed_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Error fetching workout completions', error);
      return [];
    }
  };

  const fetchHealthData = async () => {
    if (!user) return { sleepLogs: [], hrLogs: [], injuryLogs: [], fuelingLogs: [] };

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString().split('T')[0];

    try {
      const [sleepResult, hrResult, injuryResult, fuelingResult] = await Promise.all([
        supabase
          .from('sleep_logs')
          .select('log_date, hours, quality, wake_feeling, notes')
          .eq('user_id', user.id)
          .gte('log_date', sevenDaysAgoISO)
          .order('log_date', { ascending: false }),
        supabase
          .from('resting_heart_rate_logs')
          .select('log_date, heart_rate, notes')
          .eq('user_id', user.id)
          .gte('log_date', sevenDaysAgoISO)
          .order('log_date', { ascending: false }),
        supabase
          .from('injury_logs')
          .select('log_date, body_area, severity_int, pain_type, status, notes')
          .eq('user_id', user.id)
          .in('status', ['active', 'recovering'])
          .order('log_date', { ascending: false })
          .limit(5),
        supabase
          .from('fueling_logs')
          .select('stomach_comfort_rating, energy_rating, notes, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      return {
        sleepLogs: sleepResult.data || [],
        hrLogs: hrResult.data || [],
        injuryLogs: injuryResult.data || [],
        fuelingLogs: fuelingResult.data || [],
      };
    } catch (error) {
      logger.error('Error fetching health data', error);
      return { sleepLogs: [], hrLogs: [], injuryLogs: [], fuelingLogs: [] };
    }
  };

  const handleAnalyzeProgress = async () => {
    const analysisMessage = "Based on my recent workout completions, RPE ratings, and performance notes, can you analyze how I'm doing and suggest any adjustments to my upcoming training?";
    await handleSend(analysisMessage);
  };

  const saveChatMessage = async (role: 'user' | 'assistant', content: string) => {
    if (!user || !planId || isPreviewMode) return;

    try {
      const { error } = await supabase
        .from('chat_messages')
        .insert({
          user_id: user.id,
          training_plan_id: planId,
          role,
          content
        });

      if (error) {
        logger.error('Error saving chat message:', error);
      }
    } catch (error) {
      logger.error('Error saving chat message:', error);
    }
  };

  const handleApprovePreview = async () => {
    if (!previewSet || !planId || !user) return;

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      logger.error('[ChatInterface] No valid session for approval', { error: sessionError });
      alert('Your session has expired. Please refresh the page and sign in again.');
      setShowPreviewModal(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data: planRecord, error: planError } = await supabase
        .from('training_plans')
        .select('workout_version, plan_data')
        .eq('id', planId)
        .eq('user_id', user.id)
        .single();

      if (planError) throw planError;

      console.log('[ChatInterface] Before commit - Plan data sample:', {
        firstDay: planRecord.plan_data?.days?.[0],
        workoutVersion: planRecord.workout_version
      });

      const requestBody = {
        mode: 'commit',
        previewId: previewSet.preview_id,
        planId: planId,
        planVersion: planRecord.workout_version
      };

      console.log('[ChatInterface] Sending commit request:', requestBody);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-training-plan`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        console.error('[ChatInterface] Commit failed:', error);
        throw new Error(error.error || 'Failed to apply changes');
      }

      const commitResult = await response.json();
      console.log('[ChatInterface] Commit result:', commitResult);

      const { data: updatedPlan, error: fetchError } = await supabase
        .from('training_plans')
        .select('plan_data, workout_version, start_date')
        .eq('id', planId)
        .single();

      if (fetchError) throw fetchError;

      console.log('[ChatInterface] After commit - Plan data sample (BEFORE normalization):', {
        firstDay: updatedPlan.plan_data?.days?.[0],
        workoutVersion: updatedPlan.workout_version,
        totalDays: updatedPlan.plan_data?.days?.length,
        hasWeeksView: !!updatedPlan.plan_data?.plan,
        weeksCount: updatedPlan.plan_data?.plan?.length || 0
      });

      // CRITICAL FIX: Rebuild weeks view from updated days[] array
      // The backend edge function updates days[] but doesn't rebuild the weeks view
      // We must normalize to ensure the UI reflects the committed changes
      const normalizationResult = normalizeDateBasedPlan(
        updatedPlan.plan_data,
        updatedPlan.start_date || planStartDate || null,
        planId,
        user?.id
      );

      console.log('[ChatInterface] After commit - Plan data sample (AFTER normalization):', {
        firstDay: normalizationResult.planData?.days?.[0],
        totalDays: (normalizationResult.planData as any).days?.length || 0,
        weeksCount: normalizationResult.planData?.plan?.length || 0,
        wasNormalized: normalizationResult.wasNormalized
      });

      // DIAGNOSTIC: Verify that committed changes actually persisted
      if (previewSet.modifications && previewSet.modifications.length > 0) {
        const daysMap = new Map(updatedPlan.plan_data.days?.map((d: any) => [d.date, d]) || []);
        const verificationResults: any[] = [];

        for (const mod of previewSet.modifications) {
          const persistedDay = daysMap.get(mod.target_date);
          const verification: any = {
            date: mod.target_date,
            operation: mod.operation,
            expectedWorkout: mod.after?.workout || 'Rest',
            actualWorkout: persistedDay?.workout || 'NOT_FOUND',
            persisted: false
          };

          if (mod.operation === 'cancel') {
            verification.persisted = persistedDay?.workout === 'Rest';
          } else if (mod.operation === 'replace' || mod.operation === 'reschedule') {
            verification.persisted = persistedDay?.workout === mod.after?.workout;
          }

          verificationResults.push(verification);

          if (!verification.persisted) {
            logger.error('[ChatInterface] COMMIT VERIFICATION FAILED - Change did not persist', verification);
          }
        }

        console.log('[ChatInterface] Commit verification results:', {
          modificationsCount: previewSet.modifications.length,
          verifiedCount: verificationResults.filter(v => v.persisted).length,
          failedCount: verificationResults.filter(v => !v.persisted).length,
          details: verificationResults
        });

        // ADDITIONAL DIAGNOSTIC: Re-fetch from DB after a delay to check if normalization overwrites
        setTimeout(async () => {
          const { data: refetchedPlan, error: refetchError } = await supabase
            .from('training_plans')
            .select('plan_data')
            .eq('id', planId)
            .single();

          if (!refetchError && refetchedPlan) {
            const refetchedDaysMap = new Map(refetchedPlan.plan_data.days?.map((d: any) => [d.date, d]) || []);
            const reVerificationResults: any[] = [];

            for (const mod of previewSet.modifications) {
              const refetchedDay = refetchedDaysMap.get(mod.target_date);
              const reVerification: any = {
                date: mod.target_date,
                operation: mod.operation,
                expectedWorkout: mod.after?.workout || 'Rest',
                actualWorkout: refetchedDay?.workout || 'NOT_FOUND',
                stillPersisted: false
              };

              if (mod.operation === 'cancel') {
                reVerification.stillPersisted = refetchedDay?.workout === 'Rest';
              } else if (mod.operation === 'replace' || mod.operation === 'reschedule') {
                reVerification.stillPersisted = refetchedDay?.workout === mod.after?.workout;
              }

              reVerificationResults.push(reVerification);

              if (!reVerification.stillPersisted) {
                logger.error('[ChatInterface] REVERT DETECTED - Change was overwritten after commit!', {
                  ...reVerification,
                  suspectedCause: 'Normalization may have run and overwritten the days[] array'
                });
              }
            }

            console.log('[ChatInterface] Re-verification after 2s delay:', {
              modificationsCount: previewSet.modifications.length,
              stillPersistedCount: reVerificationResults.filter(v => v.stillPersisted).length,
              revertedCount: reVerificationResults.filter(v => !v.stillPersisted).length,
              details: reVerificationResults
            });
          }
        }, 2000);
      }

      const successMessage: ChatMessage = {
        role: 'assistant',
        content: `Done! Your plan has been updated.`
      };
      const updatedChatHistory = [...chatHistory, successMessage];

      // CRITICAL FIX: Use normalized plan data with rebuilt weeks view
      // This ensures the UI displays the committed changes immediately
      onUpdatePlan(normalizationResult.planData, false, updatedChatHistory);
      onChatUpdate(updatedChatHistory);

      logger.info('[ChatInterface] Updated React state with normalized plan after commit', {
        planId,
        daysCount: (normalizationResult.planData as any).days?.length || 0,
        weeksCount: normalizationResult.planData?.plan?.length || 0
      });

      // Save the message to database
      await saveChatMessage('assistant', successMessage.content);

      // Close the modal smoothly after a brief delay to ensure state updates
      setTimeout(() => {
        setShowPreviewModal(false);
        setPreviewSet(null);
      }, 100);
    } catch (error) {
      logger.error('Error applying preview:', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: getUserFriendlyError(error, 'Failed to apply changes. Please try again.')
      };
      onChatUpdate([...chatHistory, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRejectPreview = () => {
    setShowPreviewModal(false);
    setPreviewSet(null);
  };

  const handleApplyProposal = async () => {
    if (!proposedPatches || !planId || !user) return;

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      alert('Your session has expired. Please refresh the page and sign in again.');
      return;
    }

    setIsLoading(true);
    try {
      const { data: planRecord, error: planError } = await supabase
        .from('training_plans')
        .select('workout_version, plan_data')
        .eq('id', planId)
        .eq('user_id', user.id)
        .single();

      if (planError) throw planError;

      const userTimezone = getUserTimezone();
      const todayISO = getTodayISO(userTimezone);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-training-plan`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            mode: 'confirm_structural',
            proposal_id: proposedPatches.advisoryId,
            planId,
            planVersion: planRecord.workout_version,
            userTimezone,
            todayISO,
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to confirm change');
      }

      const data = await response.json();

      if (data.mode === 'preview' && data.previewSet) {
        setProposedPatches(null);
        setPreviewSet(data.previewSet);
        setShowPreviewModal(true);
      }
    } catch (error) {
      logger.error('[ChatInterface] Apply proposal error:', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: getUserFriendlyError(error, 'Something went wrong. Please try again.')
      };
      onChatUpdate([...chatHistory, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDiscardProposal = () => {
    setProposedPatches(null);
    const dismissMessage: ChatMessage = {
      role: 'assistant',
      content: "No problem, I've cleared that proposal. Let me know if you'd like to try something different."
    };
    onChatUpdate([...chatHistory, dismissMessage]);
    saveChatMessage('assistant', dismissMessage.content);
  };

  const intentLabels: Record<ModificationIntent, string> = {
    none: 'No change',
    insert_recovery_week: 'Insert a recovery week',
    suggest_pause: 'Pause training',
    suggest_recalibration: 'Recalibrate training paces',
  };

  const handleConfirmIntent = async () => {
    if (!pendingIntent || !planId || !user) return;

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      alert('Your session has expired. Please refresh the page and sign in again.');
      return;
    }

    setIsLoading(true);
    try {
      const userTimezone = getUserTimezone();
      const todayISO = getTodayISO(userTimezone);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-training-plan`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            mode: 'confirm_structural',
            proposal_id: pendingIntent.proposal_id,
            userTimezone,
            todayISO,
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to confirm intent');
      }

      const data = await response.json();

      if (data.mode === 'intent_applied') {
        const { data: updatedPlan, error: fetchError } = await supabase
          .from('training_plans')
          .select('plan_data, workout_version, start_date')
          .eq('id', planId)
          .single();

        if (fetchError) throw fetchError;

        const normalizationResult = normalizeDateBasedPlan(
          updatedPlan.plan_data,
          updatedPlan.start_date || planStartDate || null,
          planId,
          user?.id
        );

        const confirmMessage: ChatMessage = {
          role: 'assistant',
          content: data.message || `Done. ${intentLabels[pendingIntent.intent]} has been applied. Your plan has been rebuilt by the training engine.`,
        };
        const updatedChatHistory = [...chatHistory, confirmMessage];
        onUpdatePlan(normalizationResult.planData, false, updatedChatHistory);
        onChatUpdate(updatedChatHistory);
        await saveChatMessage('assistant', confirmMessage.content);
      } else if (data.mode === 'intent_blocked') {
        const blockedMessage: ChatMessage = {
          role: 'assistant',
          content: data.message || 'This change cannot be applied right now.',
        };
        onChatUpdate([...chatHistory, blockedMessage]);
        await saveChatMessage('assistant', blockedMessage.content);
      } else {
        const fallbackMessage: ChatMessage = {
          role: 'assistant',
          content: data.message || 'Something went wrong. Please try again.',
        };
        onChatUpdate([...chatHistory, fallbackMessage]);
        await saveChatMessage('assistant', fallbackMessage.content);
      }
    } catch (error) {
      logger.error('[ChatInterface] handleConfirmIntent error:', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: getUserFriendlyError(error, 'Failed to apply the change. Please try again.'),
      };
      onChatUpdate([...chatHistory, errorMessage]);
    } finally {
      setPendingIntent(null);
      setIsLoading(false);
    }
  };

  const handleDismissIntent = () => {
    if (!pendingIntent) return;
    const dismissMessage: ChatMessage = {
      role: 'assistant',
      content: "Understood — no changes will be made. Let me know if you'd like to revisit this.",
    };
    onChatUpdate([...chatHistory, dismissMessage]);
    saveChatMessage('assistant', dismissMessage.content);
    setPendingIntent(null);
  };

  const handleSelectFatigueOption = async (level: InterventionLevel) => {
    if (!planId || !user) return;

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      alert('Your session has expired. Please refresh the page and sign in again.');
      return;
    }

    setFatigueOptions(null);
    setIsLoading(true);

    const userTimezone = getUserTimezone();
    const todayISO = getTodayISO(userTimezone);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-training-plan`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            mode: 'select_fatigue_option',
            selectedFatigueLevel: level,
            planId,
            userTimezone,
            todayISO,
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to apply fatigue option');
      }

      const data = await response.json();

      if (data.mode === 'intent_applied') {
        // L4 — full recovery week applied
        const { data: updatedPlan, error: fetchError } = await supabase
          .from('training_plans')
          .select('plan_data, workout_version, start_date')
          .eq('id', planId)
          .single();

        if (fetchError) throw fetchError;

        const normalizationResult = normalizeDateBasedPlan(
          updatedPlan.plan_data,
          updatedPlan.start_date || planStartDate || null,
          planId,
          user?.id
        );

        const confirmMessage: ChatMessage = {
          role: 'assistant',
          content: data.message || 'Your recovery week has been inserted. Plan rebuilt.',
        };
        const updatedChatHistory = [...chatHistory, confirmMessage];
        onUpdatePlan(normalizationResult.planData, false, updatedChatHistory);
        onChatUpdate(updatedChatHistory);
        await saveChatMessage('assistant', confirmMessage.content);
      } else if (data.mode === 'fatigue_plan_updated') {
        // L1–L3 — plan data was patched directly
        const { data: updatedPlan, error: fetchError } = await supabase
          .from('training_plans')
          .select('plan_data, workout_version, start_date')
          .eq('id', planId)
          .single();

        if (fetchError) throw fetchError;

        const normalizationResult = normalizeDateBasedPlan(
          updatedPlan.plan_data,
          updatedPlan.start_date || planStartDate || null,
          planId,
          user?.id
        );

        const confirmMessage: ChatMessage = {
          role: 'assistant',
          content: data.message || 'Your plan has been updated.',
        };
        const updatedChatHistory = [...chatHistory, confirmMessage];
        onUpdatePlan(normalizationResult.planData, false, updatedChatHistory);
        onChatUpdate(updatedChatHistory);
        await saveChatMessage('assistant', confirmMessage.content);
      } else if (data.mode === 'fatigue_option_acknowledged') {
        // Legacy fallback
        const confirmMessage: ChatMessage = {
          role: 'assistant',
          content: data.message,
        };
        const updatedChatHistory = [...chatHistory, confirmMessage];
        onChatUpdate(updatedChatHistory);
        await saveChatMessage('assistant', confirmMessage.content);
      } else if (data.mode === 'intent_blocked') {
        const blockedMessage: ChatMessage = {
          role: 'assistant',
          content: data.message || 'This change cannot be applied right now.',
        };
        onChatUpdate([...chatHistory, blockedMessage]);
        await saveChatMessage('assistant', blockedMessage.content);
      }
    } catch (error) {
      logger.error('[ChatInterface] handleSelectFatigueOption error:', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: getUserFriendlyError(error, 'Failed to apply the change. Please try again.'),
      };
      onChatUpdate([...chatHistory, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismissFatigueOptions = () => {
    setFatigueOptions(null);
    const dismissMessage: ChatMessage = {
      role: 'assistant',
      content: "No problem — let me know if you'd like to adjust anything else.",
    };
    onChatUpdate([...chatHistory, dismissMessage]);
    saveChatMessage('assistant', dismissMessage.content);
  };

  const handleConfirmRecurringWeekdayEdit = async () => {
    if (!recurringWeekdayEdit || !planId || !user) return;

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      alert('Your session has expired. Please refresh the page and sign in again.');
      return;
    }

    setRecurringWeekdayEdit(null);
    setIsLoading(true);

    try {
      const { data: planRecord, error: planError } = await supabase
        .from('training_plans')
        .select('plan_data, workout_version, start_date, training_paces, race_date, duration_weeks')
        .eq('id', planId)
        .eq('user_id', user.id)
        .single();

      if (planError) throw planError;

      const days = planRecord.plan_data?.days || [];
      const userTimezone = getUserTimezone();
      const todayISO = getTodayISO(userTimezone);

      const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const DOW_SHORT_MAP: Record<string, string> = {
        sunday: 'Sun', sun: 'Sun',
        monday: 'Mon', mon: 'Mon',
        tuesday: 'Tue', tue: 'Tue',
        wednesday: 'Wed', wed: 'Wed',
        thursday: 'Thu', thu: 'Thu',
        friday: 'Fri', fri: 'Fri',
        saturday: 'Sat', sat: 'Sat',
      };

      const normalizeWeekday = (w: string | undefined): string | null => {
        if (!w) return null;
        return DOW_SHORT_MAP[w.toLowerCase().trim()] ?? null;
      };

      const getDayOfWeekShort = (dateStr: string): string => {
        const dow = new Date(dateStr + 'T12:00:00Z').getUTCDay();
        return DOW_NAMES[dow];
      };

      const addDaysToDate = (isoDate: string, numDays: number): string => {
        const d = new Date(isoDate + 'T12:00:00Z');
        d.setUTCDate(d.getUTCDate() + numDays);
        return d.toISOString().split('T')[0];
      };

      let updatedDays = [...days];
      let changeCount = 0;
      let resultMessage = '';

      if (recurringWeekdayEdit.recurring_operation === 'recurring_move') {
        const fromWeekday = normalizeWeekday(recurringWeekdayEdit.from_weekday);
        const toWeekday = normalizeWeekday(recurringWeekdayEdit.to_weekday);

        if (!fromWeekday || !toWeekday) {
          throw new Error('Invalid weekday specified');
        }

        const fromIdx = DOW_NAMES.indexOf(fromWeekday);
        const toIdx = DOW_NAMES.indexOf(toWeekday);
        const dayDelta = toIdx - fromIdx;

        const existingDatesMap = new Map<string, number>();
        for (let i = 0; i < updatedDays.length; i++) {
          if (updatedDays[i].date) {
            existingDatesMap.set(updatedDays[i].date, i);
          }
        }

        const daysToMove: { originalIdx: number; originalDate: string; newDate: string; day: any }[] = [];

        for (let i = 0; i < updatedDays.length; i++) {
          const day = updatedDays[i];
          if (!day.date || day.date < todayISO) continue;

          const dayOfWeek = getDayOfWeekShort(day.date);
          if (dayOfWeek !== fromWeekday) continue;

          const workout = (day.workout || '').toLowerCase();
          if (day.workout_type === 'REST' || workout === 'rest' || workout === 'rest day') continue;

          const newDate = addDaysToDate(day.date, dayDelta);
          daysToMove.push({
            originalIdx: i,
            originalDate: day.date,
            newDate,
            day: { ...day },
          });
        }

        for (const moveItem of daysToMove) {
          const targetIdx = existingDatesMap.get(moveItem.newDate);

          if (targetIdx !== undefined) {
            const targetDay = updatedDays[targetIdx];
            const targetWorkout = (targetDay.workout || '').toLowerCase();
            const hasWorkout = targetDay.workout_type === 'TRAIN' && targetWorkout !== 'rest' && targetWorkout !== 'rest day';

            if (hasWorkout) {
              updatedDays[targetIdx] = {
                ...targetDay,
                workout_type: moveItem.day.workout_type,
                workout: moveItem.day.workout,
                tips: moveItem.day.tips ?? [],
              };
              updatedDays[moveItem.originalIdx] = {
                ...updatedDays[moveItem.originalIdx],
                workout_type: targetDay.workout_type,
                workout: targetDay.workout,
                tips: targetDay.tips ?? [],
              };
            } else {
              updatedDays[targetIdx] = {
                ...targetDay,
                workout_type: moveItem.day.workout_type,
                workout: moveItem.day.workout,
                tips: moveItem.day.tips ?? [],
              };
              updatedDays[moveItem.originalIdx] = {
                ...updatedDays[moveItem.originalIdx],
                workout_type: 'REST',
                workout: 'Rest day',
                tips: ['Rest and recovery is where adaptation happens'],
              };
            }
          } else {
            updatedDays[moveItem.originalIdx] = {
              ...updatedDays[moveItem.originalIdx],
              workout_type: 'REST',
              workout: 'Rest day',
              tips: ['Rest and recovery is where adaptation happens'],
            };
          }
          changeCount++;
        }

        resultMessage = `Done! I've moved all future ${recurringWeekdayEdit.from_weekday} workouts to ${recurringWeekdayEdit.to_weekday}. ${changeCount} workouts were rescheduled.`;
      } else if (recurringWeekdayEdit.recurring_operation === 'recurring_add') {
        const targetWeekday = normalizeWeekday(recurringWeekdayEdit.target_weekday);
        if (!targetWeekday) throw new Error('Invalid weekday specified');

        const trainingPaces = planRecord.training_paces ?? {};
        const raceDateISO = planRecord.race_date ?? null;
        const totalWeeks = planRecord.duration_weeks ?? 12;
        let skippedCount = 0;
        const workoutCategories: Record<string, number> = {};

        for (let i = 0; i < updatedDays.length; i++) {
          const day = updatedDays[i];
          if (!day.date || day.date < todayISO) continue;

          const dayOfWeek = getDayOfWeekShort(day.date);
          if (dayOfWeek !== targetWeekday) continue;

          const workout = (day.workout || '').toLowerCase();
          const isRest = day.workout_type === 'REST' || workout === 'rest' || workout === 'rest day' || workout === '';

          if (isRest) {
            const skipCheck = shouldSkipInsertion(day.date, updatedDays, raceDateISO, totalWeeks);
            if (skipCheck.skip) {
              skippedCount++;
              logger.info('[RecurringAdd] Skipping insertion', { date: day.date, reason: skipCheck.reason });
              continue;
            }

            const generatedWorkout = generateContextAwareWorkout(
              day.date,
              updatedDays,
              trainingPaces,
              raceDateISO,
              totalWeeks,
            );

            if (generatedWorkout) {
              updatedDays[i] = {
                ...day,
                workout_type: generatedWorkout.workout_type,
                workout: generatedWorkout.workout,
                tips: generatedWorkout.tips,
              };
              changeCount++;
              workoutCategories[generatedWorkout.workoutCategory] = (workoutCategories[generatedWorkout.workoutCategory] || 0) + 1;
            }
          }
        }

        logger.info('[RecurringAdd] Context-aware insertion summary', {
          changeCount,
          skippedCount,
          workoutCategories,
        });

        let resultDetail = '';
        if (Object.keys(workoutCategories).length > 0) {
          const categoryDescriptions: Record<string, string> = {
            recovery: 'recovery runs',
            easy: 'easy runs',
            easy_strides: 'easy runs with strides',
            short_steady: 'easy runs with steady finish',
          };
          const parts = Object.entries(workoutCategories)
            .map(([cat, count]) => `${count} ${categoryDescriptions[cat] || cat}`)
            .join(', ');
          resultDetail = ` (${parts})`;
        }
        const skippedNote = skippedCount > 0 ? ` ${skippedCount} weeks were skipped due to race week or high training load.` : '';
        resultMessage = `Done! I've added supporting runs to ${changeCount} future ${recurringWeekdayEdit.target_weekday}s${resultDetail}.${skippedNote} Each workout has been tailored to your training phase and weekly context.`;
      } else if (recurringWeekdayEdit.recurring_operation === 'recurring_remove') {
        const targetWeekday = normalizeWeekday(recurringWeekdayEdit.target_weekday);
        if (!targetWeekday) throw new Error('Invalid weekday specified');

        for (let i = 0; i < updatedDays.length; i++) {
          const day = updatedDays[i];
          if (!day.date || day.date < todayISO) continue;

          const dayOfWeek = getDayOfWeekShort(day.date);
          if (dayOfWeek !== targetWeekday) continue;

          const workout = (day.workout || '').toLowerCase();
          const isRest = day.workout_type === 'REST' || workout === 'rest' || workout === 'rest day' || workout === '';

          if (!isRest) {
            updatedDays[i] = {
              ...day,
              workout_type: 'REST',
              workout: 'Rest day',
              tips: ['Rest and recovery is where adaptation happens'],
            };
            changeCount++;
          }
        }

        resultMessage = `Done! I've removed all future ${recurringWeekdayEdit.target_weekday} workouts. ${changeCount} sessions are now rest days.`;
      }

      const { error: updateError } = await supabase
        .from('training_plans')
        .update({
          plan_data: { ...planRecord.plan_data, days: updatedDays },
          workout_version: (planRecord.workout_version || 1) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', planId)
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      const normalizationResult = normalizeDateBasedPlan(
        { ...planRecord.plan_data, days: updatedDays },
        planRecord.start_date || planStartDate || null,
        planId,
        user?.id
      );

      const confirmMessage: ChatMessage = {
        role: 'assistant',
        content: resultMessage,
      };
      const updatedChatHistory = [...chatHistory, confirmMessage];
      onUpdatePlan(normalizationResult.planData, false, updatedChatHistory);
      onChatUpdate(updatedChatHistory);
      await saveChatMessage('assistant', confirmMessage.content);
    } catch (error) {
      logger.error('[ChatInterface] handleConfirmRecurringWeekdayEdit error:', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: getUserFriendlyError(error, 'Failed to apply the recurring change. Please try again.'),
      };
      onChatUpdate([...chatHistory, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismissRecurringWeekdayEdit = () => {
    setRecurringWeekdayEdit(null);
    const dismissMessage: ChatMessage = {
      role: 'assistant',
      content: "No problem — I've cancelled that. Let me know if you'd like to make a different change.",
    };
    onChatUpdate([...chatHistory, dismissMessage]);
    saveChatMessage('assistant', dismissMessage.content);
  };

  const handleConfirmTierChange = async () => {
    if (!tierChangeProposal || !planId || !user) return;

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      alert('Your session has expired. Please refresh the page and sign in again.');
      return;
    }

    setTierChangeProposal(null);
    setIsLoading(true);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-training-plan`;
      const headers = {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode: 'confirm_tier_change',
          proposal_id: tierChangeProposal.proposal_id,
          planId,
          userTimezone: getUserTimezone(),
          todayISO: getTodayISO(getUserTimezone()),
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const confirmMessage: ChatMessage = {
        role: 'assistant',
        content: data.message || 'Your plan tier has been updated.',
      };
      const updatedChatHistory = [...chatHistory, confirmMessage];
      onChatUpdate(updatedChatHistory);
      await saveChatMessage('assistant', confirmMessage.content);

      if (data.newTier && onAnswersUpdate) {
        onAnswersUpdate({ ...answers, ambitionTier: data.newTier });
      }

      const { data: fetchedPlan, error: fetchError } = await supabase
        .from('training_plans')
        .select('plan_data, answers, start_date')
        .eq('id', planId)
        .single();

      if (!fetchError && fetchedPlan) {
        const normalizationResult = normalizeDateBasedPlan(
          fetchedPlan.plan_data,
          fetchedPlan.start_date || planStartDate || null,
          planId,
          user?.id
        );
        onUpdatePlan(normalizationResult.planData, false, updatedChatHistory);
      }
    } catch (error) {
      logger.error('[ChatInterface] handleConfirmTierChange error:', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: getUserFriendlyError(error, 'Failed to update the plan tier. Please try again.'),
      };
      onChatUpdate([...chatHistory, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismissTierChange = () => {
    setTierChangeProposal(null);
    const dismissMessage: ChatMessage = {
      role: 'assistant',
      content: "No problem — I'll keep your current plan tier. Let me know if you'd like to make other changes.",
    };
    onChatUpdate([...chatHistory, dismissMessage]);
    saveChatMessage('assistant', dismissMessage.content);
  };

  const handleSelectTier = async (selectedTier: PlanTier) => {
    if (!planId || !user) return;

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      alert('Your session has expired. Please refresh the page and sign in again.');
      return;
    }

    setTierChangeProposal(null);
    setIsLoading(true);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-training-plan`;
      const headers = {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode: 'select_tier',
          selectedTier,
          planId,
          userTimezone: getUserTimezone(),
          todayISO: getTodayISO(getUserTimezone()),
        }),
      });

      const data = await response.json();

      if (data.mode === 'tier_change_proposal') {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.message ?? '',
        };
        onChatUpdate([...chatHistory, assistantMessage]);
        await saveChatMessage('assistant', assistantMessage.content);
        setTierChangeProposal({
          proposal_id: data.proposal_id ?? null,
          currentTier: data.currentTier,
          targetTier: data.targetTier,
          isUpgrade: data.isUpgrade ?? false,
          message: data.message ?? '',
        });
      } else if (data.error) {
        throw new Error(data.error);
      }
    } catch (error) {
      logger.error('[ChatInterface] handleSelectTier error:', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: getUserFriendlyError(error, 'Failed to process tier selection. Please try again.'),
      };
      onChatUpdate([...chatHistory, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClarificationSelection = async (option: ClarificationOption) => {
    if (!clarificationRequest || !planId || !user) return;

    setShowClarificationModal(false);

    // Add user's selection to the chat
    const selectionMessage: ChatMessage = {
      role: 'user',
      content: option.label
    };
    const updatedHistory = [...chatHistory, selectionMessage];
    onChatUpdate(updatedHistory);

    setIsLoading(true);

    try {
      try {
        await saveChatMessage('user', option.label);
      } catch (saveError) {
        logger.error('[ChatInterface] Failed to save selection message, continuing anyway:', saveError);
      }

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        logger.error('[ChatInterface] No valid session', { error: sessionError });
        alert('Your session has expired. Please refresh the page and sign in again.');
        return;
      }

      const { data: planRecord, error: planError } = await supabase
        .from('training_plans')
        .select('plan_data, workout_version')
        .eq('id', planId)
        .eq('user_id', user.id)
        .single();

      if (planError) throw planError;

      const workoutNotes = await fetchWorkoutNotes();
      const workoutCompletions = await fetchWorkoutCompletions();
      const userTimezone = getUserTimezone();
      const todayISO = getTodayISO(userTimezone);

      const requestBody = {
        mode: 'clarification_response',
        clarificationId: clarificationRequest.clarificationId,
        selectedDate: option.isoDate,
        detectedPhrase: clarificationRequest.context.detectedPhrase,
        originalMessage: clarificationRequest.context.originalMessage,
        chatHistory: updatedHistory.slice(-5),
        planId: planId,
        planData: planRecord.plan_data,
        planVersion: planRecord.workout_version,
        userProfile: {
          workoutNotes,
          workoutCompletions,
          answers
        },
        userTimezone,
        todayISO
      };

      logger.info('[ChatInterface] Sending clarification response:', {
        selectedDate: option.isoDate,
        originalMessage: clarificationRequest.context.originalMessage
      });

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-training-plan`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('[ChatInterface] Clarification response error:', { error: errorText });
        throw new Error('Failed to process your selection');
      }

      const data = await response.json();

      logger.info('[ChatInterface] Clarification response data:', {
        mode: data.mode,
        hasPreviewSet: !!data.previewSet,
        hasCoachMessage: !!data.coachMessage
      });

      if (data.mode === 'clarification_required') {
        // Another clarification needed - replace the current one
        logger.info('[ChatInterface] Another clarification required');
        setClarificationRequest(data);
        setShowClarificationModal(true);
        setIsLoading(false);
      } else if (data.mode === 'preview' && data.previewSet) {
        logger.info('[ChatInterface] Showing preview modal after clarification');
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.coachMessage ?? '',
        };
        const finalChatHistory = [...updatedHistory, assistantMessage];
        onChatUpdate(finalChatHistory);

        try {
          await saveChatMessage('assistant', assistantMessage.content);
        } catch (saveError) {
          logger.error('[ChatInterface] Failed to save message, continuing anyway:', saveError);
        }

        setPreviewSet(data.previewSet);
        setShowPreviewModal(true);
        setClarificationRequest(null);
        setIsLoading(false);
      } else if (data.mode === 'advisory' && data.advisoryId) {
        proposalVersionRef.current += 1;
        setProposedPatches({
          advisoryId: data.advisoryId,
          explanation: data.coachMessage,
          modifications: (data.previewModifications || []) as PreviewChange[],
          rawModifications: (data.rawModifications || []) as Array<{ operation: string; target_date: string; new_date?: string }>,
          version: proposalVersionRef.current,
        });
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.coachMessage ?? '',
        };
        onChatUpdate([...updatedHistory, assistantMessage]);
        try {
          await saveChatMessage('assistant', assistantMessage.content);
        } catch (saveError) {
          logger.error('[ChatInterface] Failed to save message, continuing anyway:', saveError);
        }
        setClarificationRequest(null);
        setIsLoading(false);
      } else if (data.mode === 'intervention' || data.mode === 'info') {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.coachMessage ?? data.message ?? '',
        };
        const finalChatHistory = [...updatedHistory, assistantMessage];
        onChatUpdate(finalChatHistory);

        try {
          await saveChatMessage('assistant', assistantMessage.content);
        } catch (saveError) {
          logger.error('[ChatInterface] Failed to save message, continuing anyway:', saveError);
        }

        setClarificationRequest(null);
        setIsLoading(false);
      } else {
        logger.warn('[ChatInterface] Unexpected response mode:', data.mode);
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.coachMessage ?? data.message ?? '',
        };
        if (assistantMessage.content) {
          onChatUpdate([...updatedHistory, assistantMessage]);
          try {
            await saveChatMessage('assistant', assistantMessage.content);
          } catch (saveError) {
            logger.error('[ChatInterface] Failed to save message, continuing anyway:', saveError);
          }
        }
        setClarificationRequest(null);
        setIsLoading(false);
      }
    } catch (error) {
      logger.error('[ChatInterface] Clarification error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to process your selection';
      alert(errorMsg);
      setIsLoading(false);
      setClarificationRequest(null);
    }
  };

  const handleSend = async (messageOverride?: string) => {
    const messageToSend = messageOverride || message;
    if (!messageToSend.trim() || isLoading) return;

    if (isPreviewMode) {
      const userMessage: ChatMessage = { role: 'user', content: messageToSend };

      const lowerMessage = messageToSend.toLowerCase();
      let responseContent = "";

      const isAggressiveRequest =
        lowerMessage.includes('increase ramp') ||
        lowerMessage.includes('faster ramp') ||
        lowerMessage.includes('higher ramp') ||
        lowerMessage.includes('more aggressive') ||
        lowerMessage.includes('get to peak quicker') ||
        lowerMessage.includes('peak faster') ||
        lowerMessage.includes('build faster') ||
        lowerMessage.includes('increase intensity') ||
        lowerMessage.includes('higher intensity') ||
        lowerMessage.includes('more volume') ||
        lowerMessage.includes('increase volume') ||
        lowerMessage.includes('push harder') ||
        lowerMessage.includes('ramp up faster') ||
        lowerMessage.includes('steeper progression') ||
        lowerMessage.includes('quicker progression') ||
        lowerMessage.includes('faster progression') ||
        (lowerMessage.includes('ramp') && (lowerMessage.includes('more') || lowerMessage.includes('increase') || lowerMessage.includes('higher'))) ||
        (lowerMessage.includes('ambitious') && (lowerMessage.includes('more') || lowerMessage.includes('plan'))) ||
        (lowerMessage.includes('aggressive') && !lowerMessage.includes('less'));

      if (isAggressiveRequest) {
        responseContent = "I can't increase the ramp for this preview. It uses our standard 6% progression approach so the build stays aligned with our coaching philosophy.\n\nThis approach is designed to help you build fitness sustainably while reducing injury risk. The 6% weekly increase is the sweet spot backed by sports science for safe, effective progression.\n\nOnce you sign up and start training, I'll be monitoring your progress and can make adjustments based on how you're responding to the training. The plan will adapt to you.";
      } else if (lowerMessage.includes('move') || lowerMessage.includes('reschedule') || lowerMessage.includes('swap')) {
        responseContent = "I can definitely help you move workouts around! Once you sign up, I'll be able to adjust your schedule based on your life - move runs to different days, swap workouts, and keep everything balanced.\n\nTo unlock this feature:\n1. Click 'Accept Preview & Generate Full Plan' above\n2. Create your free account\n3. I'll generate your complete plan\n4. Then just ask me to move things around!\n\nWant to get started?";
      } else if (lowerMessage.includes('distance') || lowerMessage.includes('km') || lowerMessage.includes('mile')) {
        responseContent = "I can adjust distances to match your current fitness level! The preview shows a sample, but once you're signed up, I can tailor distances to your specific needs and goals.\n\nTo get your personalized plan:\n1. Accept the preview and sign up (it's free!)\n2. I'll create your full training plan\n3. Then I can adjust any workout distance\n\nReady to create your plan?";
      } else if (lowerMessage.includes('pace') || lowerMessage.includes('speed') || lowerMessage.includes('fast') || lowerMessage.includes('slow')) {
        responseContent = "Great question about pacing! Your training plan will include specific pace guidance for each workout type. Once you sign up, I can help you adjust paces based on your recent workouts and how you're feeling.\n\nGet your personalized pacing:\n1. Accept the preview above\n2. Sign up for free\n3. Get your full plan with pace guidance\n4. Ask me to adjust as you progress!\n\nShall we get started?";
      } else if (lowerMessage.includes('why') || lowerMessage.includes('what') || lowerMessage.includes('explain') || lowerMessage.includes('understand')) {
        responseContent = "I'd love to explain the reasoning behind your training! Each workout has a specific purpose - building endurance, improving speed, or aiding recovery.\n\nOnce you sign up, I can:\n- Explain why each workout matters\n- Answer questions about your training\n- Adjust based on your feedback\n- Guide you through race day\n\nTo unlock full coaching:\n1. Accept the preview above\n2. Create your free account\n3. Get instant access to your AI coach\n\nReady to start?";
      } else if (lowerMessage.includes('injury') || lowerMessage.includes('hurt') || lowerMessage.includes('pain') || lowerMessage.includes('rest')) {
        responseContent = "Your health and safety come first! Once you're signed up, I can help you adjust your plan if you're dealing with any issues - reducing volume, adding rest days, or modifying workouts to support recovery.\n\nGet adaptive coaching:\n1. Accept preview and sign up (free)\n2. Get your full training plan\n3. I'll help you train smart and stay healthy\n\nLet's get you started!";
      } else {
        responseContent = "Great question! I'd love to help with that.\n\nThis is just a preview of what I can do. Once you sign up (it's free!), I become your full-time running coach who can:\n- Answer all your training questions\n- Modify your plan on the fly\n- Adjust to your schedule and life\n- Guide you all the way to race day\n\nTo unlock your AI coach:\n1. Click 'Accept Preview & Generate Full Plan' above\n2. Create your free account\n3. Get instant access to personalized coaching\n\nReady to get started?";
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: responseContent
      };
      const newHistory = [...chatHistory, userMessage, assistantMessage];
      onChatUpdate(newHistory);
      setMessage('');
      return;
    }

    if (!planId || !user) return;

    if (isAwaitingName() && looksLikeAName(messageToSend)) {
      const extracted = extractNameFromMessage(messageToSend) || messageToSend.trim();
      const firstName = extracted.split(' ')[0];
      const capitalized = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();

      const userMessage: ChatMessage = { role: 'user', content: messageToSend };
      const replyMessage: ChatMessage = {
        role: 'assistant',
        content: `Great to meet you, ${capitalized}! Your plan is above - check it out and let me know if you have any questions or need to tweak anything.`
      };
      const newHistory = [...chatHistory, userMessage, replyMessage];
      onChatUpdate(newHistory);
      setMessage('');
      await saveUserName(capitalized);
      await saveChatMessage('user', messageToSend);
      await saveChatMessage('assistant', replyMessage.content);
      return;
    }

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      logger.error('[ChatInterface] No valid session', { error: sessionError });
      alert('Your session has expired. Please refresh the page and sign in again.');
      return;
    }

    const { resolvedMessage, resolvedDates } = resolveDatesInMessage(messageToSend);

    const userMessage: ChatMessage = { role: 'user', content: messageToSend };
    const newHistory = [...chatHistory, userMessage];
    onChatUpdate(newHistory);
    setMessage('');
    setIsLoading(true);

    await saveChatMessage('user', messageToSend);

    try {
      const { data: planRecord, error: planError } = await supabase
        .from('training_plans')
        .select('plan_data, workout_version')
        .eq('id', planId)
        .eq('user_id', user.id)
        .single();

      if (planError) throw planError;

      const workoutNotes = await fetchWorkoutNotes();
      const workoutCompletions = await fetchWorkoutCompletions();
      const healthData = await fetchHealthData();

      const userTimezone = getUserTimezone();
      const todayISO = getTodayISO(userTimezone);

      const requestBody: Record<string, unknown> = {
        mode: 'draft',
        message: messageToSend,
        resolvedDates,
        chatHistory: newHistory.slice(-5),
        planId: planId,
        planData: planRecord.plan_data,
        planVersion: planRecord.workout_version,
        userProfile: {
          workoutNotes,
          workoutCompletions,
          answers,
          healthData
        },
        userTimezone,
        todayISO
      };

      // Pass the active proposal so the AI can refine it if needed
      if (proposedPatches) {
        requestBody.previousProposal = {
          advisoryId: proposedPatches.advisoryId,
          explanation: proposedPatches.explanation,
          modifications: proposedPatches.rawModifications,
        };
      }

      logger.info('[ChatInterface] Sending draft request:', {
        message: messageToSend,
        resolvedDates,
        planVersion: planRecord.workout_version,
        hasSession: !!session
      });

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-training-plan`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('[ChatInterface] Chat API error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });

        let errorMessage = ErrorMessages.CHAT_ERROR;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          errorMessage = `Chat request failed (${response.status}): ${errorText.substring(0, 100)}`;
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();

      logger.info('[ChatInterface] Response received:', { mode: data.mode });

      if (data.mode === 'clarification_required') {
        setClarificationRequest(data);
        setShowClarificationModal(true);
        setIsLoading(false);
        return;
      }

      if (data.mode === 'recurring_weekday_edit') {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.coachMessage ?? '',
        };
        onChatUpdate([...newHistory, assistantMessage]);
        await saveChatMessage('assistant', assistantMessage.content);

        setRecurringWeekdayEdit({
          recurring_operation: data.recurring_operation,
          from_weekday: data.from_weekday,
          to_weekday: data.to_weekday,
          target_weekday: data.target_weekday,
          coachMessage: data.coachMessage,
        });
        setIsLoading(false);
        return;
      }

      if (data.mode === 'fatigue_options') {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.message ?? '',
        };
        onChatUpdate([...newHistory, assistantMessage]);
        await saveChatMessage('assistant', assistantMessage.content);
        setFatigueOptions({
          message: data.message ?? '',
          options: data.options ?? [],
          isInTaper: data.isInTaper ?? false,
        });
        setIsLoading(false);
        return;
      }

      if (data.mode === 'tier_change_proposal' || data.mode === 'tier_change_clarification') {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.message ?? '',
        };
        onChatUpdate([...newHistory, assistantMessage]);
        await saveChatMessage('assistant', assistantMessage.content);
        setTierChangeProposal({
          proposal_id: data.proposal_id ?? null,
          currentTier: data.currentTier,
          targetTier: data.targetTier,
          isUpgrade: data.isUpgrade ?? false,
          message: data.message ?? '',
          availableTiers: data.availableTiers,
        });
        setIsLoading(false);
        return;
      }

      if (data.mode === 'tier_change_applied') {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.message ?? '',
        };
        const updatedChatHistory = [...newHistory, assistantMessage];
        onChatUpdate(updatedChatHistory);
        await saveChatMessage('assistant', assistantMessage.content);

        if (data.newTier && onAnswersUpdate) {
          onAnswersUpdate({ ...answers, ambitionTier: data.newTier });
        }

        if (planId) {
          const { data: fetchedPlan, error: fetchError } = await supabase
            .from('training_plans')
            .select('plan_data, answers, start_date')
            .eq('id', planId)
            .single();

          if (!fetchError && fetchedPlan) {
            const normalizationResult = normalizeDateBasedPlan(
              fetchedPlan.plan_data,
              fetchedPlan.start_date || planStartDate || null,
              planId,
              user?.id
            );
            onUpdatePlan(normalizationResult.planData, false, updatedChatHistory);
          }
        }

        setIsLoading(false);
        return;
      }

      if (
        (data.mode === 'proposal' || data.mode === 'modification_intent') &&
        (data.intent !== 'none' || (data.modificationIntents?.length ?? 0) > 0)
      ) {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.message ?? '',
        };
        onChatUpdate([...newHistory, assistantMessage]);
        await saveChatMessage('assistant', assistantMessage.content);
        setPendingIntent({
          intent: data.intent ?? 'none',
          modificationIntents: data.modificationIntents ?? [],
          message: data.message,
          reasoning: data.reasoning || '',
          proposal_id: data.proposal_id ?? null,
        });
        setIsLoading(false);
        return;
      }

      if (data.mode === 'plan_updated' && data.planUpdated) {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.message ?? '',
        };
        const updatedChatHistory = [...newHistory, assistantMessage];

        let planDataForNormalization: any = null;
        let startDateForNormalization: string | null = planStartDate || null;

        if (data.updatedPlanData) {
          planDataForNormalization = data.updatedPlanData;
        } else {
          const { data: fetchedPlan, error: fetchError } = await supabase
            .from('training_plans')
            .select('plan_data, workout_version, start_date')
            .eq('id', planId)
            .single();

          if (!fetchError && fetchedPlan) {
            planDataForNormalization = fetchedPlan.plan_data;
            startDateForNormalization = fetchedPlan.start_date || planStartDate || null;
          }
        }

        if (planDataForNormalization) {
          const normalizationResult = normalizeDateBasedPlan(
            planDataForNormalization,
            startDateForNormalization,
            planId,
            user?.id
          );
          // ISSUE C FIX: Create fully immutable copy with new references at all levels
          // to ensure React detects the change and re-renders the UI
          const freshPlanData = {
            ...normalizationResult.planData,
            plan: normalizationResult.planData.plan
              ? normalizationResult.planData.plan.map(week => ({
                  ...week,
                  days: week.days ? { ...week.days } : {}
                }))
              : [],
            days: normalizationResult.planData.days
              ? normalizationResult.planData.days.map(day => ({ ...day }))
              : undefined
          };
          onUpdatePlan(freshPlanData, false, updatedChatHistory);
        }

        onChatUpdate(updatedChatHistory);
        await saveChatMessage('assistant', assistantMessage.content);
        setIsLoading(false);
        return;
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.coachMessage ?? data.message ?? data.response ?? '',
      };
      onChatUpdate([...newHistory, assistantMessage]);
      await saveChatMessage('assistant', assistantMessage.content);
    } catch (error) {
      logger.error('Chat error', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: getUserFriendlyError(error)
      };
      onChatUpdate([...newHistory, errorMessage]);
      await saveChatMessage('assistant', getUserFriendlyError(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const placeholderText = planType === 'static'
    ? 'Ask to swap days, adjust distances, or modify workouts...'
    : 'Ask to move runs, adjust your schedule, or adapt to life changes...';

  return (
    <>
      {showPreviewModal && previewSet && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">Review Changes</h3>
              <p className="text-sm text-gray-600 mt-1">Please review the proposed changes before applying</p>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-4">
                {previewSet.modifications.map((change, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-gray-900">{formatUKDate(change.date)}</p>
                        <p className="text-sm text-gray-600 capitalize">{change.operation}</p>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      <div>
                        <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Before</p>
                        <p className="text-sm text-gray-900">{stripMarkdown(change.before.title)}</p>
                        {change.before.description && (
                          <p className="text-xs text-gray-600 mt-1">{stripMarkdown(change.before.description)}</p>
                        )}
                      </div>

                      {change.operation !== 'cancel' && change.after && (
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">After</p>
                          <p className="text-sm text-gray-900">{stripMarkdown(change.after.title)}</p>
                          {change.after.description && (
                            <p className="text-xs text-gray-600 mt-1">{stripMarkdown(change.after.description)}</p>
                          )}
                          {change.after.scheduled_for && change.after.scheduled_for !== change.date && (
                            <p className="text-xs text-brand-blue mt-1">
                              Moving to {formatUKDate(change.after.scheduled_for)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3">
              <button
                onClick={handleRejectPreview}
                disabled={isLoading}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleApprovePreview}
                disabled={isLoading}
                className="flex-1 px-4 py-2 bg-brand-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {isLoading ? 'Applying...' : 'Apply Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col h-full max-h-[85vh] sm:max-h-[600px] bg-gradient-to-br from-gray-900 to-gray-800 border-2 border-gray-700 rounded-t-lg sm:rounded-lg" role="region" aria-label="Training coach chat">
        <div className="p-4 border-b-2 border-gray-700 bg-gradient-to-r from-gray-900 to-gray-800 rounded-t-lg">
          <h3 className="font-bold text-white text-lg">
            {planType === 'static' ? 'Quick Adjustments Chat' : 'Adaptive Training Coach'}
          </h3>
          <p className="text-sm text-gray-300 mt-1">
            {planType === 'static'
              ? 'Make simple tweaks to your training plan'
              : 'Continuously adapt your plan as you train'
            }
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-br from-gray-900 to-gray-800" role="log" aria-live="polite" aria-label="Chat messages">
          {chatHistory.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <p className="text-sm">
                {planType === 'static'
                  ? 'Ask me to adjust your training plan!'
                  : 'Let\'s work together to adapt your plan as you train!'
                }
              </p>
            </div>
          )}

          {chatHistory.map((msg, idx) => (
            <div key={idx}>
              <div
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-2 ${
                    msg.role === 'user'
                      ? 'bg-brand-pink text-white'
                      : 'bg-gray-800 border-2 border-gray-700 text-gray-300'
                  }`}
                  role={msg.role === 'assistant' ? 'article' : undefined}
                  aria-label={msg.role === 'user' ? 'Your message' : 'Coach response'}
                >
                  <p className="text-sm whitespace-pre-wrap" dangerouslySetInnerHTML={{
                    __html: msg.content
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\*(.*?)\*/g, '<em>$1</em>')
                      .replace(/__(.*?)__/g, '<strong>$1</strong>')
                      .replace(/_(.*?)_/g, '<em>$1</em>')
                      .replace(/\n/g, '<br />')
                  }} />
                </div>
              </div>
            </div>
          ))}

          {proposedPatches && !isLoading && (
            <div className="mx-1 rounded-lg border border-gray-600 bg-gray-850 overflow-hidden" style={{ backgroundColor: 'rgb(20,27,37)' }}>
              <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Proposed Changes</span>
                <span className="text-xs text-gray-500">Refine by typing below</span>
              </div>
              <div className="px-4 py-3 space-y-2">
                {proposedPatches.modifications.length > 0 ? (
                  proposedPatches.modifications.map((mod, idx) => (
                    <div key={idx} className="flex items-start gap-3 text-sm">
                      <span className={`mt-0.5 shrink-0 w-2 h-2 rounded-full ${mod.operation === 'cancel' ? 'bg-red-400' : 'bg-brand-blue'}`} />
                      <div className="min-w-0">
                        <p className="text-gray-300 truncate">{stripMarkdown(mod.before?.title || '')}</p>
                        {mod.operation === 'cancel' && (
                          <p className="text-red-400 text-xs mt-0.5">Will be cancelled → Rest</p>
                        )}
                        {mod.operation !== 'cancel' && mod.after && (
                          <p className="text-brand-blue text-xs mt-0.5">
                            {mod.after.scheduled_for && mod.after.scheduled_for !== (mod as any).date
                              ? `Moving to ${formatUKDate(mod.after.scheduled_for)}`
                              : `Updated`}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-400 italic">Changes prepared — click Apply to confirm.</p>
                )}
              </div>
              <div className="px-4 py-3 border-t border-gray-700 flex gap-2">
                <button
                  onClick={handleApplyProposal}
                  disabled={isLoading}
                  className="flex-1 px-3 py-2 bg-brand-pink text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  Apply Changes
                </button>
                <button
                  onClick={handleDiscardProposal}
                  disabled={isLoading}
                  className="px-3 py-2 bg-gray-700 text-gray-300 text-sm rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-all"
                >
                  Discard
                </button>
              </div>
            </div>
          )}

          {pendingIntent && !isLoading && (
            <div className="mx-1 rounded-lg border border-amber-600/40 overflow-hidden" style={{ backgroundColor: 'rgb(28,22,10)' }}>
              <div className="px-4 py-3 border-b border-amber-700/30 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                  Coaching Suggestion
                  {(pendingIntent.modificationIntents.length > 1) && (
                    <span className="ml-2 px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded text-xs">
                      {pendingIntent.modificationIntents.length} changes
                    </span>
                  )}
                </span>
              </div>
              <div className="px-4 py-3 space-y-2">
                {pendingIntent.intent !== 'none' && (
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                    <p className="text-sm text-amber-200 font-medium">{intentLabels[pendingIntent.intent]}</p>
                  </div>
                )}
                {pendingIntent.modificationIntents.map((wi, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-1.5" />
                    <div className="min-w-0">
                      <p className="text-sm text-amber-200 font-medium capitalize">
                        {wi.type.replace(/_/g, ' ')}
                      </p>
                      {Object.entries(wi.details).length > 0 && (
                        <p className="text-xs text-amber-300/70 mt-0.5">
                          {Object.entries(wi.details).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {pendingIntent.reasoning && (
                  <p className="text-xs text-amber-300/50 pt-1 border-t border-amber-700/20">{pendingIntent.reasoning}</p>
                )}
              </div>
              <div className="px-4 py-3 border-t border-amber-700/30 flex gap-2">
                <button
                  onClick={handleConfirmIntent}
                  className="flex-1 px-3 py-2 bg-amber-500 text-gray-900 text-sm font-semibold rounded-lg hover:bg-amber-400 transition-all"
                >
                  Yes, apply this
                </button>
                <button
                  onClick={handleDismissIntent}
                  className="px-3 py-2 bg-gray-700 text-gray-300 text-sm rounded-lg hover:bg-gray-600 transition-all"
                >
                  No thanks
                </button>
              </div>
            </div>
          )}

          {fatigueOptions && !isLoading && (
            <div className="mx-1 rounded-lg border border-teal-600/40 overflow-hidden" style={{ backgroundColor: 'rgb(10,24,22)' }}>
              <div className="px-4 py-3 border-b border-teal-700/30 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-teal-400 shrink-0" />
                <span className="text-xs font-semibold text-teal-400 uppercase tracking-wider">Recovery Options</span>
              </div>
              <div className="px-4 py-3 space-y-3">
                {fatigueOptions.options.map((opt) => (
                  <div key={opt.level} className="rounded-lg border border-teal-800/40 bg-teal-950/30 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-teal-300 bg-teal-900/50 px-1.5 py-0.5 rounded">{opt.level}</span>
                          <span className="text-sm font-semibold text-teal-100">{opt.label}</span>
                        </div>
                        <p className="text-xs text-teal-200/80 mb-1">{opt.description}</p>
                        <p className="text-xs text-teal-400/60 italic">{opt.consequence}</p>
                      </div>
                      <button
                        onClick={() => handleSelectFatigueOption(opt.level as InterventionLevel)}
                        disabled={isLoading}
                        className="shrink-0 px-3 py-1.5 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-500 disabled:opacity-50 transition-all"
                      >
                        Choose
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 border-t border-teal-700/30">
                <button
                  onClick={handleDismissFatigueOptions}
                  disabled={isLoading}
                  className="w-full px-3 py-2 bg-gray-700 text-gray-300 text-sm rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-all"
                >
                  No thanks, keep as planned
                </button>
              </div>
            </div>
          )}

          {recurringWeekdayEdit && !isLoading && (
            <div className="mx-1 rounded-lg border border-blue-600/40 overflow-hidden" style={{ backgroundColor: 'rgb(10,18,28)' }}>
              <div className="px-4 py-3 border-b border-blue-700/30 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Recurring Schedule Change</span>
              </div>
              <div className="px-4 py-3">
                <p className="text-sm text-blue-200 mb-2">
                  {recurringWeekdayEdit.recurring_operation === 'recurring_move' && (
                    <>Move all future <span className="font-semibold text-blue-100">{recurringWeekdayEdit.from_weekday}</span> workouts to <span className="font-semibold text-blue-100">{recurringWeekdayEdit.to_weekday}</span></>
                  )}
                  {recurringWeekdayEdit.recurring_operation === 'recurring_add' && (
                    <>Add easy runs to all future <span className="font-semibold text-blue-100">{recurringWeekdayEdit.target_weekday}</span>s</>
                  )}
                  {recurringWeekdayEdit.recurring_operation === 'recurring_remove' && (
                    <>Remove all future <span className="font-semibold text-blue-100">{recurringWeekdayEdit.target_weekday}</span> workouts</>
                  )}
                </p>
                <p className="text-xs text-blue-300/60">This will apply to all future occurrences from today onwards.</p>
              </div>
              <div className="px-4 py-3 border-t border-blue-700/30 flex gap-2">
                <button
                  onClick={handleConfirmRecurringWeekdayEdit}
                  disabled={isLoading}
                  className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-all"
                >
                  Yes, apply to all
                </button>
                <button
                  onClick={handleDismissRecurringWeekdayEdit}
                  disabled={isLoading}
                  className="px-3 py-2 bg-gray-700 text-gray-300 text-sm rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {tierChangeProposal && !isLoading && (
            <div className="mx-1 rounded-lg border border-emerald-600/40 overflow-hidden" style={{ backgroundColor: 'rgb(10,18,28)' }}>
              <div className="px-4 py-3 border-b border-emerald-700/30 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                  {tierChangeProposal.availableTiers ? 'Select Plan Tier' : 'Plan Tier Change'}
                </span>
              </div>
              <div className="px-4 py-3">
                {tierChangeProposal.availableTiers ? (
                  <>
                    <p className="text-sm text-emerald-200 mb-3">
                      You're currently on the <span className="font-semibold text-emerald-100 capitalize">{tierChangeProposal.currentTier}</span> tier.
                      Which tier would you like to switch to?
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {tierChangeProposal.availableTiers.map((tier) => (
                        <button
                          key={tier}
                          onClick={() => handleSelectTier(tier)}
                          className="w-full px-4 py-3 bg-emerald-900/30 hover:bg-emerald-800/40 border border-emerald-600/30 rounded-lg text-left transition-all"
                        >
                          <span className="font-semibold text-emerald-100 capitalize">{tier}</span>
                          <p className="text-xs text-emerald-300/70 mt-1">
                            {tier === 'base' && 'Build aerobic foundation with manageable volume'}
                            {tier === 'performance' && 'More quality sessions and higher mileage'}
                            {tier === 'competitive' && 'Maximum training stimulus for PRs'}
                          </p>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-emerald-200 mb-2">
                      Change from <span className="font-semibold text-emerald-100 capitalize">{tierChangeProposal.currentTier}</span> to{' '}
                      <span className="font-semibold text-emerald-100 capitalize">{tierChangeProposal.targetTier}</span> tier
                    </p>
                    <p className="text-xs text-emerald-300/60">
                      {tierChangeProposal.isUpgrade
                        ? 'This will increase your training load with more volume and intensity.'
                        : 'This will reduce your training load for a more manageable schedule.'}
                    </p>
                  </>
                )}
              </div>
              {!tierChangeProposal.availableTiers && (
                <div className="px-4 py-3 border-t border-emerald-700/30 flex gap-2">
                  <button
                    onClick={handleConfirmTierChange}
                    disabled={isLoading}
                    className="flex-1 px-3 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-500 disabled:opacity-50 transition-all"
                  >
                    Yes, update my plan
                  </button>
                  <button
                    onClick={handleDismissTierChange}
                    disabled={isLoading}
                    className="px-3 py-2 bg-gray-700 text-gray-300 text-sm rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              )}
              {tierChangeProposal.availableTiers && (
                <div className="px-4 py-3 border-t border-emerald-700/30">
                  <button
                    onClick={handleDismissTierChange}
                    disabled={isLoading}
                    className="w-full px-3 py-2 bg-gray-700 text-gray-300 text-sm rounded-lg hover:bg-gray-600 disabled:opacity-50 transition-all"
                  >
                    Never mind
                  </button>
                </div>
              )}
            </div>
          )}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="bg-gray-800 border-2 border-gray-700 rounded-lg px-4 py-2">
                <Loader2 className="w-4 h-4 text-brand-blue animate-spin" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t-2 border-gray-700 bg-gradient-to-r from-gray-900 to-gray-800 space-y-3 sm:rounded-b-lg">
          {planId && planType === 'responsive' && (
            <button
              onClick={handleAnalyzeProgress}
              disabled={isLoading}
              className="w-full px-4 py-2 bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-lg hover:from-primary-600 hover:to-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 font-medium"
              aria-label="Analyze my progress and suggest adjustments"
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              {isLoading ? 'Analyzing...' : 'Analyze my progress and suggest adjustments'}
            </button>
          )}
          <div className="text-xs text-gray-400 px-1">
            <span className="font-medium">Tip:</span> Be specific with your requests for better results (e.g., "move my long run from last Sunday to next Saturday")
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={placeholderText}
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-gray-800 text-white border-2 border-gray-700 rounded-lg focus:ring-0 focus:border-brand-blue focus:outline-none disabled:opacity-50 transition-all"
              aria-label="Chat message"
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!message.trim() || isLoading}
              className="px-4 py-2 bg-brand-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              aria-label={isLoading ? 'Sending message' : 'Send message'}
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="w-5 h-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {showClarificationModal && clarificationRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">Which date did you mean?</h3>
              <p className="text-sm text-gray-600 mt-1">{clarificationRequest.question}</p>
              <p className="text-xs text-gray-500 mt-2">You said: "{clarificationRequest.context.detectedPhrase}"</p>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-3">
                {clarificationRequest.options.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleClarificationSelection(option)}
                    disabled={isLoading}
                    className="w-full p-4 text-left border-2 border-gray-200 rounded-lg hover:border-brand-blue hover:bg-blue-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <p className="font-medium text-gray-900">{option.label}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowClarificationModal(false);
                  setClarificationRequest(null);
                  setIsLoading(false);
                }}
                disabled={isLoading}
                className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
