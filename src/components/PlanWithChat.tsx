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
  planType: 'static' | 'responsive' | 'weeks_based' | 'date_based_preview' | 'date_based_full';
  answers: any;
  onNewPlan: () => void;
  chatHistory: ChatMessage[];
  onChatUpdate: (history: ChatMessage[]) => void;
  onUpdatePlan: (updatedPlan: any) => void;
  fullPlanData?: PlanData | null;
  onSaveFullPlan?: () => void;
  onAcceptPreview?: () => void;
  savedPlanId?: string | null;
  planStartDate?: string;
  initialTrainingPaces?: TrainingPaces | null;
  isLoading?: boolean;
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
  onAcceptPreview,
  savedPlanId,
  planStartDate,
  initialTrainingPaces,
  isLoading
}: PlanWithChatProps) {
  const isPreviewMode = fullPlanData && fullPlanData.plan.length > planData.plan.length;
  const isDateBasedPreview = planType === 'date_based_preview';
  const [isChatOpen, setIsChatOpen] = useState(isPreviewMode || isDateBasedPreview ? true : false);
  const [currentWeekNumber, setCurrentWeekNumber] = useState(1);
  const [completedWorkouts, setCompletedWorkouts] = useState<Set<string>>(new Set());
  const [previousPlanState, setPreviousPlanState] = useState<PlanData | null>(null);
  const [originalPlanState, setOriginalPlanState] = useState<PlanData | null>(null);
  const [pendingChatMessage, setPendingChatMessage] = useState<string | null>(null);

  const handleUpdatePlan = (updatedPlan: any, updatedChatHistory?: any[]) => {
    setPreviousPlanState(planData);
    onUpdatePlan(updatedPlan);
  };

  const handleUndo = () => {
    if (originalPlanState) {
      onUpdatePlan(originalPlanState);
      setPreviousPlanState(null);
    }
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    setOriginalPlanState(planData);
  }, []);

  useEffect(() => {
    if (isPreviewMode || isDateBasedPreview) {
      setIsChatOpen(true);
    }
  }, [isPreviewMode, isDateBasedPreview]);

  return (
    <div className="space-y-6">
      {isPreviewMode && !isDateBasedPreview && (
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
      {isDateBasedPreview && (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-gradient-to-r from-pink-500 to-pink-600 text-white shadow-2xl border-b-4 border-pink-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1 text-center sm:text-left">
                <h3 className="text-lg sm:text-xl font-bold mb-1">Preview Plan Generated</h3>
                <p className="text-sm sm:text-base opacity-90 leading-relaxed">
                  Review your 14-day preview below. Make any adjustments via chat, then accept to generate your complete plan through race day.
                </p>
              </div>
              {onAcceptPreview && (
                <button
                  onClick={onAcceptPreview}
                  disabled={isLoading}
                  className="px-8 py-4 bg-white text-pink-600 font-bold rounded-xl hover:bg-opacity-90 transition-all text-base sm:text-lg shadow-xl hover:scale-105 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ring-2 ring-white/20"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Generating...
                    </span>
                  ) : 'Accept & Generate Full Plan'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <div className={isDateBasedPreview ? 'pt-32 sm:pt-28' : ''}>
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
          onUndo={originalPlanState ? handleUndo : undefined}
          onTriggerChat={(message) => {
            setPendingChatMessage(message);
            setIsChatOpen(true);
          }}
        />
      </div>

      {isChatOpen && (planType === 'responsive' || planType === 'date_based_preview' || planType === 'date_based_full' || (planType === 'static' && isPreviewMode)) && (
        <div className="fixed bottom-0 right-0 sm:bottom-6 sm:right-6 w-full sm:w-96 max-h-[85vh] sm:max-h-[600px] z-50 shadow-2xl">
          <div className="relative h-full">
            <button
              onClick={() => setIsChatOpen(false)}
              className="absolute top-2 right-2 sm:-top-3 sm:-right-3 w-10 h-10 sm:w-8 sm:h-8 bg-brand-pink text-white rounded-full flex items-center justify-center hover:opacity-90 transition-all shadow-lg z-10"
              aria-label="Close chat"
            >
              <X className="w-6 h-6 sm:w-5 sm:h-5" aria-hidden="true" />
            </button>
            <ChatInterface
              planType={planType}
              onUpdatePlan={handleUpdatePlan}
              chatHistory={chatHistory}
              onChatUpdate={onChatUpdate}
              planData={isPreviewMode && fullPlanData ? fullPlanData : planData}
              answers={answers}
              currentWeekNumber={currentWeekNumber}
              planStartDate={planStartDate}
              completedWorkouts={completedWorkouts}
              pendingMessage={pendingChatMessage}
              onMessageSent={() => setPendingChatMessage(null)}
              planId={savedPlanId || undefined}
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
              aria-label="Close upgrade prompt"
            >
              <X className="w-5 h-5" aria-hidden="true" />
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

      {!isChatOpen && (planType === 'responsive' || planType === 'date_based_preview' || planType === 'date_based_full' || (planType === 'static' && isPreviewMode)) && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-brand-pink text-white rounded-full flex items-center justify-center hover:opacity-90 hover:scale-110 transition-all shadow-2xl z-50"
          aria-label="Open training coach chat"
        >
          <MessageCircle className="w-6 h-6" aria-hidden="true" />
        </button>
      )}

      {!isChatOpen && planType === 'static' && savedPlanId && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-gray-400 text-white rounded-full flex items-center justify-center hover:opacity-90 hover:scale-110 transition-all shadow-2xl z-50"
          aria-label="Upgrade to Responsive Plan for chat access"
        >
          <MessageCircle className="w-6 h-6" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
