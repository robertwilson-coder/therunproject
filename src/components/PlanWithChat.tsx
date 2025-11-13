import { useEffect, useState } from 'react';
import { TrainingPlanDisplay } from './TrainingPlanDisplay';
import { ChatInterface } from './ChatInterface';
import { PlanData, TrainingPaces } from '../lib/supabase';
import { MessageCircle, X } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface PlanWithChatProps {
  planData: PlanData;
  planType: 'static' | 'responsive';
  answers: any;
  onNewPlan: () => void;
  chatHistory: ChatMessage[];
  onChatUpdate: (history: ChatMessage[]) => void;
  onUpdatePlan: (updatedPlan: any) => void;
  fullPlanData?: PlanData | null;
  onSaveFullPlan?: () => void;
  savedPlanId?: string | null;
  planStartDate?: string;
  initialTrainingPaces?: TrainingPaces | null;
}

export function PlanWithChat({
  planData,
  planType,
  answers,
  onNewPlan,
  chatHistory,
  onChatUpdate,
  onUpdatePlan,
  fullPlanData,
  onSaveFullPlan,
  savedPlanId,
  planStartDate,
  initialTrainingPaces
}: PlanWithChatProps) {
  const isPreviewMode = fullPlanData && fullPlanData.plan.length > planData.plan.length;
  const [isChatOpen, setIsChatOpen] = useState(isPreviewMode ? true : false);
  const [currentWeekNumber, setCurrentWeekNumber] = useState(1);
  const [completedWorkouts, setCompletedWorkouts] = useState<Set<string>>(new Set());
  const [previousPlanState, setPreviousPlanState] = useState<PlanData | null>(null);
  const [pendingChatMessage, setPendingChatMessage] = useState<string | null>(null);

  const handleUpdatePlan = (updatedPlan: any) => {
    setPreviousPlanState(planData);
    onUpdatePlan(updatedPlan);
  };

  const handleUndo = () => {
    if (previousPlanState) {
      onUpdatePlan(previousPlanState);
      setPreviousPlanState(null);
    }
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  return (
    <div className="space-y-6">
      {isPreviewMode && (
        <div className="sticky top-0 z-40 bg-gradient-to-r from-brand-pink to-pink-500 text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1 text-center sm:text-left">
                <p className="text-base sm:text-lg font-medium leading-relaxed">
                  You are viewing a 2-week preview of your plan. Try out the coach chat, make any adjustments you feel and press here to unlock the full plan
                </p>
              </div>
              {onSaveFullPlan && (
                <button
                  onClick={onSaveFullPlan}
                  className="px-6 py-3 bg-white text-brand-pink font-bold rounded-lg hover:bg-opacity-90 transition-all text-sm sm:text-base shadow-md hover:scale-105 whitespace-nowrap"
                >
                  Unlock Full Plan
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <div>
        <TrainingPlanDisplay
          planData={planData}
          onNewPlan={onNewPlan}
          planType={planType}
          chatHistory={chatHistory}
          onChatUpdate={onChatUpdate}
          onUpdatePlan={handleUpdatePlan}
          answers={answers}
          fullPlanData={fullPlanData}
          onSaveFullPlan={onSaveFullPlan}
          savedPlanId={savedPlanId}
          planStartDate={planStartDate}
          initialTrainingPaces={initialTrainingPaces}
          onWeekChange={setCurrentWeekNumber}
          onCompletedWorkoutsChange={setCompletedWorkouts}
          onUndo={previousPlanState ? handleUndo : undefined}
          onTriggerChat={(message) => {
            setPendingChatMessage(message);
            setIsChatOpen(true);
          }}
        />
      </div>

      {isChatOpen && (planType === 'responsive' || (planType === 'static' && isPreviewMode)) && (
        <div className="fixed bottom-6 right-6 w-[90vw] sm:w-96 h-[600px] z-50 shadow-2xl">
          <div className="relative h-full">
            <button
              onClick={() => setIsChatOpen(false)}
              className="absolute -top-3 -right-3 w-8 h-8 bg-brand-pink text-white rounded-full flex items-center justify-center hover:opacity-90 transition-all shadow-lg z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <ChatInterface
              planType={planType}
              onUpdatePlan={handleUpdatePlan}
              chatHistory={chatHistory}
              onChatUpdate={onChatUpdate}
              planData={planData}
              answers={answers}
              currentWeekNumber={currentWeekNumber}
              planStartDate={planStartDate}
              completedWorkouts={completedWorkouts}
              pendingMessage={pendingChatMessage}
              onMessageSent={() => setPendingChatMessage(null)}
            />
          </div>
        </div>
      )}

      {isChatOpen && planType === 'static' && savedPlanId && (
        <div className="fixed bottom-6 right-6 w-[90vw] sm:w-96 z-50 shadow-2xl">
          <div className="bg-white border-2 border-brand-blue rounded-lg p-6 relative">
            <button
              onClick={() => setIsChatOpen(false)}
              className="absolute -top-3 -right-3 w-8 h-8 bg-brand-pink text-white rounded-full flex items-center justify-center hover:opacity-90 transition-all shadow-lg z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-brand-pink bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-8 h-8 text-brand-pink" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">Upgrade to Responsive Plan</h3>
              <p className="text-gray-600 mb-6 text-sm leading-relaxed">
                Want to modify your plan with coach chat? Upgrade to a Responsive Plan to unlock adaptive training that evolves with you.
              </p>
              <button
                onClick={() => {
                  setIsChatOpen(false);
                }}
                className="w-full px-6 py-3 bg-brand-pink text-white font-bold rounded-lg hover:opacity-90 transition-all"
              >
                Learn More
              </button>
            </div>
          </div>
        </div>
      )}

      {!isChatOpen && (planType === 'responsive' || (planType === 'static' && isPreviewMode)) && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-brand-pink text-white rounded-full flex items-center justify-center hover:opacity-90 hover:scale-110 transition-all shadow-2xl z-50"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}

      {!isChatOpen && planType === 'static' && savedPlanId && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-gray-400 text-white rounded-full flex items-center justify-center hover:opacity-90 hover:scale-110 transition-all shadow-2xl z-50"
          title="Upgrade to Responsive Plan for chat access"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
