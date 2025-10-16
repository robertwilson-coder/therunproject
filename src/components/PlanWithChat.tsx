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
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [currentWeekNumber, setCurrentWeekNumber] = useState(1);
  const [completedWorkouts, setCompletedWorkouts] = useState<Set<string>>(new Set());

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <TrainingPlanDisplay
          planData={planData}
          onNewPlan={onNewPlan}
          planType={planType}
          chatHistory={chatHistory}
          onChatUpdate={onChatUpdate}
          onUpdatePlan={onUpdatePlan}
          answers={answers}
          fullPlanData={fullPlanData}
          onSaveFullPlan={onSaveFullPlan}
          savedPlanId={savedPlanId}
          planStartDate={planStartDate}
          initialTrainingPaces={initialTrainingPaces}
          onWeekChange={setCurrentWeekNumber}
          onCompletedWorkoutsChange={setCompletedWorkouts}
        />
      </div>

      {isChatOpen && (
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
              onUpdatePlan={onUpdatePlan}
              chatHistory={chatHistory}
              onChatUpdate={onChatUpdate}
              planData={planData}
              answers={answers}
              currentWeekNumber={currentWeekNumber}
              planStartDate={planStartDate}
              completedWorkouts={completedWorkouts}
            />
          </div>
        </div>
      )}

      {!isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-brand-pink text-white rounded-full flex items-center justify-center hover:opacity-90 hover:scale-110 transition-all shadow-2xl z-50"
        >
          <MessageCircle className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
