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

interface ChatInterfaceProps {
  planType: 'static' | 'responsive' | 'date_based_preview' | 'date_based_full';
  onUpdatePlan: (updatedPlan: any, isPreviewMode?: boolean, updatedChatHistory?: ChatMessage[]) => void;
  chatHistory: ChatMessage[];
  onChatUpdate: (history: ChatMessage[]) => void;
  planData: any;
  answers: any;
  currentWeekNumber?: number;
  planStartDate?: string;
  completedWorkouts?: Set<string>;
  planId?: string;
  isPreviewMode?: boolean;
}

export function ChatInterface({
  planType,
  onUpdatePlan,
  chatHistory,
  onChatUpdate,
  planData,
  answers,
  currentWeekNumber,
  planStartDate,
  completedWorkouts,
  planId,
  isPreviewMode = false
}: ChatInterfaceProps) {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [previewSet, setPreviewSet] = useState<PreviewSet | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [clarificationRequest, setClarificationRequest] = useState<ClarificationRequest | null>(null);
  const [showClarificationModal, setShowClarificationModal] = useState(false);

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

  useEffect(() => {
    if ((planType === 'responsive' || planType === 'date_based_preview') && chatHistory.length === 0) {
      const welcomeMessage: ChatMessage = {
        role: 'assistant',
        content: isPreviewMode
          ? "Hi, I'm your AI running coach! I'm here to make your training fit your life.\n\nI can help you:\n• Move workouts around your schedule (e.g., 'move my long run to Saturday')\n• Adjust distances or intensity (e.g., 'reduce this week's mileage by 20%')\n• Handle life changes (e.g., 'I'm traveling next week, can we adjust?')\n• Swap workout types (e.g., 'replace tomorrow's tempo with an easy run')\n\nThis is a preview of the chat feature. Once you sign up, I'll be able to actually modify your full training plan and help you all the way to race day.\n\nGo ahead and try asking me something - see how it works!"
          : "Hi, I'm your coach and I'm here to help you find your flow.\n\nYour plan is dynamic and adjusts to your life, so if you ever need to tweak workouts, add or adjust pacing, just let me know and we'll make it work.\n\nYour plan is above, check it out and let me know if you have any questions!"
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
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-training-plan-v2`,
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

      const changeLines = previewSet.modifications.map(mod => {
        const dateStr = formatUKDate(mod.date);
        if (mod.operation === 'cancel') {
          return `- ${dateStr}: cancelled (${stripMarkdown(mod.before.title)})`;
        }
        if (mod.after) {
          return `- ${dateStr}: changed from "${stripMarkdown(mod.before.title)}" to "${stripMarkdown(mod.after.title)}"`;
        }
        return `- ${dateStr}: updated`;
      }).join('\n');

      const successMessage: ChatMessage = {
        role: 'assistant',
        content: `Done! Here's what I changed:\n${changeLines}`
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
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-training-plan-v2`,
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
          content: data.coachMessage
        };
        const finalChatHistory = [...updatedHistory, assistantMessage];
        onChatUpdate(finalChatHistory);

        try {
          await saveChatMessage('assistant', data.coachMessage);
        } catch (saveError) {
          logger.error('[ChatInterface] Failed to save message, continuing anyway:', saveError);
        }

        setPreviewSet(data.previewSet);
        setShowPreviewModal(true);
        setClarificationRequest(null);
        setIsLoading(false);
      } else if (data.mode === 'intervention' || data.mode === 'info') {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.coachMessage || data.message
        };
        const finalChatHistory = [...updatedHistory, assistantMessage];
        onChatUpdate(finalChatHistory);

        try {
          await saveChatMessage('assistant', data.coachMessage || data.message);
        } catch (saveError) {
          logger.error('[ChatInterface] Failed to save message, continuing anyway:', saveError);
        }

        setClarificationRequest(null);
        setIsLoading(false);
      } else {
        logger.warn('[ChatInterface] Unexpected response mode:', data.mode);
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

      if (lowerMessage.includes('move') || lowerMessage.includes('reschedule') || lowerMessage.includes('swap')) {
        responseContent = "I can definitely help you move workouts around! Once you sign up, I'll be able to adjust your schedule based on your life - move runs to different days, swap workouts, and keep everything balanced.\n\nTo unlock this feature:\n1. Click 'Accept Preview & Generate Full Plan' above\n2. Create your free account\n3. I'll generate your complete plan\n4. Then just ask me to move things around!\n\nWant to get started?";
      } else if (lowerMessage.includes('distance') || lowerMessage.includes('km') || lowerMessage.includes('mile')) {
        responseContent = "I can adjust distances to match your current fitness level! The preview shows a sample, but once you're signed up, I can tailor distances to your specific needs and goals.\n\nTo get your personalized plan:\n1. Accept the preview and sign up (it's free!)\n2. I'll create your full training plan\n3. Then I can adjust any workout distance\n\nReady to create your plan?";
      } else if (lowerMessage.includes('pace') || lowerMessage.includes('speed') || lowerMessage.includes('fast') || lowerMessage.includes('slow')) {
        responseContent = "Great question about pacing! Your training plan will include specific pace guidance for each workout type. Once you sign up, I can help you adjust paces based on your recent workouts and how you're feeling.\n\nGet your personalized pacing:\n1. Accept the preview above\n2. Sign up for free\n3. Get your full plan with pace guidance\n4. Ask me to adjust as you progress!\n\nShall we get started?";
      } else if (lowerMessage.includes('why') || lowerMessage.includes('what') || lowerMessage.includes('explain') || lowerMessage.includes('understand')) {
        responseContent = "I'd love to explain the reasoning behind your training! Each workout has a specific purpose - building endurance, improving speed, or aiding recovery.\n\nOnce you sign up, I can:\n• Explain why each workout matters\n• Answer questions about your training\n• Adjust based on your feedback\n• Guide you through race day\n\nTo unlock full coaching:\n1. Accept the preview above\n2. Create your free account\n3. Get instant access to your AI coach\n\nReady to start?";
      } else if (lowerMessage.includes('injury') || lowerMessage.includes('hurt') || lowerMessage.includes('pain') || lowerMessage.includes('rest')) {
        responseContent = "Your health and safety come first! Once you're signed up, I can help you adjust your plan if you're dealing with any issues - reducing volume, adding rest days, or modifying workouts to support recovery.\n\nGet adaptive coaching:\n1. Accept preview and sign up (free)\n2. Get your full training plan\n3. I'll help you train smart and stay healthy\n\nLet's get you started!";
      } else {
        responseContent = "Great question! I'd love to help with that.\n\nThis is just a preview of what I can do. Once you sign up (it's free!), I become your full-time running coach who can:\n• Answer all your training questions\n• Modify your plan on the fly\n• Adjust to your schedule and life\n• Guide you all the way to race day\n\nTo unlock your AI coach:\n1. Click 'Accept Preview & Generate Full Plan' above\n2. Create your free account\n3. Get instant access to personalized coaching\n\nReady to get started?";
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

      const userTimezone = getUserTimezone();
      const todayISO = getTodayISO(userTimezone);

      const requestBody = {
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
          answers
        },
        userTimezone,
        todayISO
      };

      logger.info('[ChatInterface] Sending draft request:', {
        message: messageToSend,
        resolvedDates,
        planVersion: planRecord.workout_version,
        hasSession: !!session
      });

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-training-plan-v2`,
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

      if (data.mode === 'preview' && data.previewSet) {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.coachMessage
        };
        const updatedChatHistory = [...newHistory, assistantMessage];
        onChatUpdate(updatedChatHistory);
        await saveChatMessage('assistant', data.coachMessage);

        setPreviewSet(data.previewSet);
        setShowPreviewModal(true);
      } else if (data.mode === 'intervention') {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.coachMessage
        };
        const updatedChatHistory = [...newHistory, assistantMessage];
        onChatUpdate(updatedChatHistory);
        await saveChatMessage('assistant', data.coachMessage);
      } else {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: data.coachMessage || data.response
        };
        const updatedChatHistory = [...newHistory, assistantMessage];
        onChatUpdate(updatedChatHistory);
        await saveChatMessage('assistant', assistantMessage.content);
      }
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
