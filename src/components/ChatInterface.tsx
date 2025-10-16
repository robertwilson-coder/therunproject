import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, User } from 'lucide-react';

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
  completedWorkouts
}: ChatInterfaceProps) {
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
    if (planType === 'responsive' && chatHistory.length === 0) {
      const welcomeMessage: ChatMessage = {
        role: 'assistant',
        content: "Hi, I'm your coach and I'm here to help you find your flow.\n\nYour plan is dynamic and adjusts to your life, so if you ever need to tweak workouts, add or adjust pacing, just let me know and we'll make it work.\n\nYour plan is above, check it out and let me know if you have any questions!"
      };
      onChatUpdate([welcomeMessage]);
    }
  }, []);

  const handleSend = async () => {
    if (!message.trim() || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: message };
    const newHistory = [...chatHistory, userMessage];
    onChatUpdate(newHistory);
    setMessage('');
    setIsLoading(true);

    try {
      const apiUrl = `${import.meta.env.VITE_BoltDatabase_URL}/functions/v1/chat-training-plan`;

      const completedWorkoutsArray = completedWorkouts ? Array.from(completedWorkouts) : [];

      console.log('Sending chat request to:', apiUrl);
      console.log('Request payload:', {
        message,
        chatHistoryLength: chatHistory.length,
        planType,
        hasPlanData: !!planData,
        hasAnswers: !!answers,
        planStartDate,
        completedCount: completedWorkoutsArray.length
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_BoltDatabase_ANON_KEY}`,
          'apikey': import.meta.env.VITE_BoltDatabase_ANON_KEY,
        },
        body: JSON.stringify({
          message: message,
          chatHistory: chatHistory,
          planData: planData,
          planType: planType,
          answers: answers,
          currentWeekNumber: currentWeekNumber,
          planStartDate: planStartDate,
          todaysDate: new Date().toISOString().split('T')[0],
          completedWorkouts: completedWorkoutsArray,
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

      if (data.updatedPlan) {
        onUpdatePlan(data.updatedPlan);
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
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

      <div className="p-4 border-t-2 border-gray-700 bg-gradient-to-r from-gray-900 to-gray-800">
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
            onClick={handleSend}
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
