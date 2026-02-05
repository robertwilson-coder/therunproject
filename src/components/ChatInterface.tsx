import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../utils/logger';
import { getUserFriendlyError, ErrorMessages } from '../utils/errorMessages';
import { ChangeConfirmationModal } from './ChangeConfirmationModal';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatInterfaceProps {
  planType: 'static' | 'responsive';
  onUpdatePlan: (updatedPlan: any) => void;
  chatHistory: ChatMessage[];
  onChatUpdate: (history: ChatMessage[]) => void;
  planData: any;
  answers: any;
  currentWeekNumber?: number;
  planStartDate?: string;
  completedWorkouts?: Set<string>;
  planId?: string;
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
  planId
}: ChatInterfaceProps) {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [pendingChanges, setPendingChanges] = useState<{
    updatedPlan: any;
    changes: Array<{ week: number; day: string; before: string; after: string }>;
    aiExplanation: string;
    chatHistory: any[];
  } | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    console.log('[DEBUG-CHAT] chatHistory changed', {
      length: chatHistory.length,
      messages: chatHistory.map((msg, idx) => ({
        idx,
        role: msg.role,
        contentPreview: msg.content.substring(0, 50)
      }))
    });
    scrollToBottom();
  }, [chatHistory]);

  useEffect(() => {
    // LEGACY: Welcome message only for 'responsive' plans
    // Could be shown for all plans with chat since all new plans are responsive
    if (planType === 'responsive' && chatHistory.length === 0 && planId) {
      const welcomeMessage: ChatMessage = {
        role: 'assistant',
        content: "Hi, I'm your coach and I'm here to help you find your flow.\n\nYour plan is dynamic and adjusts to your life, so if you ever need to tweak workouts, add or adjust pacing, just let me know and we'll make it work.\n\nYour plan is above, check it out and let me know if you have any questions!"
      };
      onChatUpdate([welcomeMessage]);

      // Save welcome message to database
      saveChatMessage('assistant', welcomeMessage.content);
    }
  }, []);

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
    if (!user || !planId) return;

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

  const detectChanges = (originalPlan: any, updatedPlan: any) => {
    const changes: Array<{ week: number; day: string; before: string; after: string }> = [];
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    updatedPlan.plan.forEach((updatedWeek: any) => {
      const originalWeek = originalPlan.plan.find((w: any) => w.week === updatedWeek.week);
      if (!originalWeek) return;

      days.forEach(day => {
        const originalWorkout = typeof originalWeek.days[day] === 'string'
          ? originalWeek.days[day]
          : originalWeek.days[day]?.workout || '';
        const updatedWorkout = typeof updatedWeek.days[day] === 'string'
          ? updatedWeek.days[day]
          : updatedWeek.days[day]?.workout || '';

        if (originalWorkout !== updatedWorkout) {
          changes.push({
            week: updatedWeek.week,
            day,
            before: originalWorkout,
            after: updatedWorkout
          });
        }
      });
    });

    return changes;
  };

  const handleApproveChanges = () => {
    if (!pendingChanges) return;

    const originalWeekCount = planData?.plan?.length || 0;
    const updatedWeekCount = pendingChanges.updatedPlan.plan.length;

    if (updatedWeekCount < originalWeekCount) {
      const mergedPlan = { ...planData, plan: [...planData.plan] };
      pendingChanges.updatedPlan.plan.forEach((updatedWeek: any) => {
        const weekIndex = mergedPlan.plan.findIndex((w: any) => w.week === updatedWeek.week);
        if (weekIndex !== -1) {
          mergedPlan.plan[weekIndex] = updatedWeek;
        }
      });
      onUpdatePlan(mergedPlan);
    } else {
      onUpdatePlan(pendingChanges.updatedPlan);
    }

    onChatUpdate(pendingChanges.chatHistory);
    setPendingChanges(null);
  };

  const handleRejectChanges = () => {
    setPendingChanges(null);
  };

  const handleRefineRequest = async (refinementMessage: string) => {
    if (!pendingChanges) return;

    const userMessage: ChatMessage = { role: 'user', content: refinementMessage };
    const newHistory = [...pendingChanges.chatHistory, userMessage];
    onChatUpdate(newHistory);
    setPendingChanges(null);
    setIsLoading(true);

    await saveChatMessage('user', refinementMessage);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-training-plan`;

      const completedWorkoutsArray = completedWorkouts ? Array.from(completedWorkouts) : [];
      const workoutNotes = await fetchWorkoutNotes();
      const workoutCompletions = await fetchWorkoutCompletions();

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          message: refinementMessage,
          chatHistory: pendingChanges.chatHistory,
          planData: planData,
          planType: planType,
          answers: answers,
          currentWeekNumber: currentWeekNumber,
          planStartDate: planStartDate,
          todaysDate: new Date().toISOString().split('T')[0],
          completedWorkouts: completedWorkoutsArray,
          workoutNotes: workoutNotes,
          workoutCompletions: workoutCompletions,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Chat API error response', errorText);
        throw new Error(ErrorMessages.CHAT_ERROR);
      }

      const data = await response.json();

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.response
      };

      const updatedChatHistory = [...newHistory, assistantMessage];
      onChatUpdate(updatedChatHistory);

      await saveChatMessage('assistant', data.response);

      if (data.updatedPlan && typeof data.updatedPlan === 'object') {
        if (data.updatedPlan.plan && Array.isArray(data.updatedPlan.plan)) {
          const isValid = data.updatedPlan.plan.every((week: any, idx: number) => {
            if (!week || typeof week !== 'object') {
              logger.error(`Week ${idx} is not an object`);
              return false;
            }
            if (typeof week.week !== 'number') {
              logger.error(`Week ${idx} is missing week number`);
              return false;
            }
            if (!week.days || typeof week.days !== 'object') {
              logger.error(`Week ${idx} is missing days object`);
              return false;
            }
            const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const allDaysValid = days.every(day => {
              const hasDay = week.days[day] && typeof week.days[day] === 'object' && 'workout' in week.days[day];
              if (!hasDay) {
                logger.error(`Week ${week.week || idx}, ${day} is missing or invalid`);
              }
              return hasDay;
            });
            return allDaysValid;
          });

          if (isValid) {
            const changes = detectChanges(planData, data.updatedPlan);

            if (changes.length > 0) {
              setPendingChanges({
                updatedPlan: data.updatedPlan,
                changes,
                aiExplanation: data.response,
                chatHistory: updatedChatHistory
              });
            }
          } else {
            logger.error('Updated plan structure is invalid');
          }
        }
      }
    } catch (error) {
      logger.error('Error refining request:', error);
      const errorMsg = getUserFriendlyError(error, ErrorMessages.CHAT_ERROR);
      const errorHistory = [
        ...newHistory,
        { role: 'assistant' as const, content: errorMsg }
      ];
      onChatUpdate(errorHistory);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async (messageOverride?: string) => {
    const messageToSend = messageOverride || message;
    if (!messageToSend.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: messageToSend };
    const newHistory = [...chatHistory, userMessage];
    onChatUpdate(newHistory);
    setMessage('');
    setIsLoading(true);

    // Save user message to database
    await saveChatMessage('user', messageToSend);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-training-plan`;

      const completedWorkoutsArray = completedWorkouts ? Array.from(completedWorkouts) : [];
      const workoutNotes = await fetchWorkoutNotes();
      const workoutCompletions = await fetchWorkoutCompletions();

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          message: messageToSend,
          chatHistory: chatHistory,
          planData: planData,
          planType: planType,
          answers: answers,
          currentWeekNumber: currentWeekNumber,
          planStartDate: planStartDate,
          todaysDate: new Date().toISOString().split('T')[0],
          completedWorkouts: completedWorkoutsArray,
          workoutNotes: workoutNotes,
          workoutCompletions: workoutCompletions,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Chat API error response', errorText);
        throw new Error(ErrorMessages.CHAT_ERROR);
      }

      const data = await response.json();

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.response
      };

      const updatedChatHistory = [...newHistory, assistantMessage];
      onChatUpdate(updatedChatHistory);

      // Save assistant message to database
      await saveChatMessage('assistant', data.response);

      // Validate updatedPlan structure before updating
      if (data.updatedPlan && typeof data.updatedPlan === 'object') {
        // Check if updatedPlan has the correct structure
        if (data.updatedPlan.plan && Array.isArray(data.updatedPlan.plan)) {
          // Validate that each week has the proper structure
          const isValid = data.updatedPlan.plan.every((week: any, idx: number) => {
            if (!week || typeof week !== 'object') {
              logger.error(`Week ${idx} is not an object`);
              return false;
            }
            if (typeof week.week !== 'number') {
              logger.error(`Week ${idx} is missing week number`);
              return false;
            }
            if (!week.days || typeof week.days !== 'object') {
              logger.error(`Week ${idx} is missing days object`);
              return false;
            }
            // Check that all day properties exist and have workout property
            const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const allDaysValid = days.every(day => {
              const hasDay = week.days[day] && typeof week.days[day] === 'object' && 'workout' in week.days[day];
              if (!hasDay) {
                logger.error(`Week ${week.week || idx}, ${day} is missing or invalid`);
              }
              return hasDay;
            });
            return allDaysValid;
          });

          if (isValid) {
            const changes = detectChanges(planData, data.updatedPlan);

            if (changes.length > 0) {
              setPendingChanges({
                updatedPlan: data.updatedPlan,
                changes,
                aiExplanation: data.response,
                chatHistory: updatedChatHistory
              });
            } else {
              onChatUpdate(updatedChatHistory);
            }
          } else {
            logger.error('Invalid updatedPlan structure');
            const errorMessage: ChatMessage = {
              role: 'assistant',
              content: ErrorMessages.CHAT_INVALID_REQUEST
            };
            onChatUpdate([...chatHistory, { role: 'user', content: messageToSend }, errorMessage]);

            // Save error message to database
            await saveChatMessage('assistant', ErrorMessages.CHAT_INVALID_REQUEST);
          }
        } else {
          logger.error('Invalid updatedPlan structure - missing or invalid plan array');
        }
      } else {
        onChatUpdate(updatedChatHistory);
      }
    } catch (error) {
      logger.error('Chat error', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: getUserFriendlyError(error)
      };
      onChatUpdate([...newHistory, errorMessage]);

      // Save error message to database
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

  // LEGACY: Different text for static vs responsive plans - purely cosmetic
  // Both plan types have identical functionality now
  const placeholderText = planType === 'static'
    ? 'Ask to swap days, adjust distances, or modify workouts...'
    : 'Ask to move runs, adjust your schedule, or adapt to life changes...';

  return (
    <>
      {pendingChanges && (
        <ChangeConfirmationModal
          changes={pendingChanges.changes}
          aiExplanation={pendingChanges.aiExplanation}
          onApprove={handleApproveChanges}
          onReject={handleRejectChanges}
          onRefine={handleRefineRequest}
        />
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
          <div
            key={idx}
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
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
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
        {/* LEGACY: Garmin export restricted to responsive plans - could be enabled for all plans */}
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
          <span className="font-medium">Tip:</span> Be specific with your requests for better results (e.g., "move my long run from Sunday to Saturday" or "I need to skip tomorrow's workout")
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
    </>
  );
}
