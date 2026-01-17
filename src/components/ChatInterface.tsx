import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, User, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

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
  pendingMessage?: string | null;
  onMessageSent?: () => void;
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
  pendingMessage,
  onMessageSent,
  planId
}: ChatInterfaceProps) {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  useEffect(() => {
    if (pendingMessage && !isLoading) {
      setMessage(pendingMessage);
      if (onMessageSent) {
        onMessageSent();
      }
      setTimeout(() => {
        handleSend();
      }, 100);
    }
  }, [pendingMessage]);

  useEffect(() => {
    if (planType === 'responsive' && chatHistory.length === 0) {
      const welcomeMessage: ChatMessage = {
        role: 'assistant',
        content: "Hi, I'm your coach and I'm here to help you find your flow.\n\nYour plan is dynamic and adjusts to your life, so if you ever need to tweak workouts, add or adjust pacing, just let me know and we'll make it work.\n\nYour plan is above, check it out and let me know if you have any questions!"
      };
      onChatUpdate([welcomeMessage]);
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
      console.error('Error fetching workout notes:', error);
      return [];
    }
  };

  const fetchWorkoutCompletions = async () => {
    if (!user || !planId) return [];

    try {
      const { data, error } = await supabase
        .from('workout_completions')
        .select('week_number, day_name, rating, distance_miles, duration_minutes, completed_at')
        .eq('user_id', user.id)
        .eq('training_plan_id', planId)
        .order('completed_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching workout completions:', error);
      return [];
    }
  };

  const handleAnalyzeProgress = async () => {
    const analysisMessage = "Based on my recent workout completions, RPE ratings, and performance notes, can you analyze how I'm doing and suggest any adjustments to my upcoming training?";
    await handleSend(analysisMessage);
  };

  const handleSend = async (messageOverride?: string) => {
    const messageToSend = messageOverride || message;
    console.log('handleSend called with message:', messageToSend, 'isLoading:', isLoading);
    if (!messageToSend.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: messageToSend };
    const newHistory = [...chatHistory, userMessage];
    onChatUpdate(newHistory);
    setMessage('');
    setIsLoading(true);

    try {
      const apiUrl = `${import.meta.env.VITE_BoltDatabase_URL}/functions/v1/chat-training-plan`;

      const completedWorkoutsArray = completedWorkouts ? Array.from(completedWorkouts) : [];
      const workoutNotes = await fetchWorkoutNotes();
      const workoutCompletions = await fetchWorkoutCompletions();

      console.log('Sending chat request to:', apiUrl);
      console.log('Request payload:', {
        message: messageToSend,
        chatHistoryLength: chatHistory.length,
        planType,
        hasPlanData: !!planData,
        hasAnswers: !!answers,
        planStartDate,
        completedCount: completedWorkoutsArray.length,
        notesCount: workoutNotes.length,
        completionsCount: workoutCompletions.length
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_BoltDatabase_ANON_KEY}`,
          'apikey': import.meta.env.VITE_BoltDatabase_ANON_KEY,
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

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Chat API error response:', errorText);
        throw new Error(`Failed to get response: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('Chat response data:', data);

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.response
      };

      onChatUpdate([...newHistory, assistantMessage]);

      // Validate updatedPlan structure before updating
      if (data.updatedPlan && typeof data.updatedPlan === 'object') {
        console.log('Received updatedPlan:', JSON.stringify(data.updatedPlan).substring(0, 500));

        // Check if updatedPlan has the correct structure
        if (data.updatedPlan.plan && Array.isArray(data.updatedPlan.plan)) {
          // Validate that each week has the proper structure
          const isValid = data.updatedPlan.plan.every((week: any, idx: number) => {
            if (!week || typeof week !== 'object') {
              console.error(`Week ${idx} is not an object`);
              return false;
            }
            if (typeof week.week !== 'number') {
              console.error(`Week ${idx} is missing week number`);
              return false;
            }
            if (!week.days || typeof week.days !== 'object') {
              console.error(`Week ${idx} is missing days object`);
              return false;
            }
            // Check that all day properties exist and have workout property
            const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const allDaysValid = days.every(day => {
              const hasDay = week.days[day] && typeof week.days[day] === 'object' && 'workout' in week.days[day];
              if (!hasDay) {
                console.error(`Week ${week.week || idx}, ${day} is missing or invalid`);
              }
              return hasDay;
            });
            return allDaysValid;
          });

          if (isValid) {
            const originalWeekCount = planData?.plan?.length || 0;
            const updatedWeekCount = data.updatedPlan.plan.length;

            // Merge partial updates into the full plan
            if (updatedWeekCount < originalWeekCount) {
              console.log(`🔄 Merging partial update: ${updatedWeekCount} weeks into ${originalWeekCount} week plan`);

              // Create a copy of the original plan
              const mergedPlan = { ...planData, plan: [...planData.plan] };

              // Update only the weeks that were returned
              data.updatedPlan.plan.forEach((updatedWeek: any) => {
                const weekIndex = mergedPlan.plan.findIndex((w: any) => w.week === updatedWeek.week);
                if (weekIndex !== -1) {
                  mergedPlan.plan[weekIndex] = updatedWeek;
                  console.log(`✅ Merged Week ${updatedWeek.week}`);
                }
              });

              onUpdatePlan(mergedPlan);
            } else {
              console.log('✅ Valid plan structure, updating plan');
              onUpdatePlan(data.updatedPlan);
            }
          } else {
            console.error('❌ Invalid updatedPlan structure - missing workout properties');
            console.error('Full updatedPlan:', JSON.stringify(data.updatedPlan, null, 2));
            const errorMessage: ChatMessage = {
              role: 'assistant',
              content: `I had trouble processing your request properly. Could you try being more specific? For example: "Move my Thursday run to Friday" or "Reduce the distance on my long run this Sunday by 3km."`
            };
            onChatUpdate([...chatHistory, { role: 'user', content: messageToSend }, errorMessage]);
          }
        } else {
          console.error('❌ Invalid updatedPlan structure - missing or invalid plan array', {
            hasPlan: !!data.updatedPlan.plan,
            isArray: Array.isArray(data.updatedPlan.plan),
            planType: typeof data.updatedPlan.plan,
            planValue: data.updatedPlan.plan
          });
          console.error('Full data object:', JSON.stringify(data, null, 2));
        }
      } else {
        console.log('No updatedPlan in response or updatedPlan is null');
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'I had trouble connecting to the training assistant. Please check your connection and try again. If the issue persists, try refreshing the page.'
      };
      onChatUpdate([...newHistory, errorMessage]);
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
    <div className="flex flex-col h-[600px] bg-gradient-to-br from-gray-900 to-gray-800 border-2 border-gray-700 rounded-lg">
      <div className="p-4 border-b-2 border-gray-700 bg-gradient-to-r from-gray-900 to-gray-800">
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

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gradient-to-br from-gray-900 to-gray-800">
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

      <div className="p-4 border-t-2 border-gray-700 bg-gradient-to-r from-gray-900 to-gray-800 space-y-3">
        {planId && planType === 'responsive' && (
          <button
            onClick={handleAnalyzeProgress}
            disabled={isLoading}
            className="w-full px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 font-medium"
          >
            <Sparkles className="w-4 h-4" />
            {isLoading ? 'Analyzing...' : 'Analyze my progress and suggest adjustments'}
          </button>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={placeholderText}
            disabled={isLoading}
            className="flex-1 px-4 py-2 bg-gray-800 text-white border-2 border-gray-700 rounded-lg focus:ring-0 focus:border-brand-blue focus:outline-none disabled:opacity-50 transition-all"
          />
          <button
            type="button"
            onClick={() => {
              console.log('Send button clicked');
              handleSend();
            }}
            disabled={!message.trim() || isLoading}
            className="px-4 py-2 bg-brand-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
