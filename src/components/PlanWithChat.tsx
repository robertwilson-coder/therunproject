import { useEffect, useState, useMemo } from 'react';
import { TrainingPlanDisplay } from './TrainingPlanDisplay';
import { ChatInterface } from './ChatInterface';
import { PlanData, TrainingPaces } from '../lib/supabase';
import { MessageCircle, X, Download, Info, Check } from 'lucide-react';
import type { ProgressPanel } from '../types';
import { exportPlanToCSV } from '../utils/dataExport';
import { WeeklyCoachInsight, useWeeklyInsightCheck } from './WeeklyCoachInsight';

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
  onUpdatePlan: (updatedPlan: any, isPreviewMode?: boolean, updatedChatHistory?: ChatMessage[]) => void;
  fullPlanData?: PlanData | null;
  onSaveFullPlan?: () => void;
  onAcceptPreview?: () => void;
  savedPlanId?: string | null;
  planStartDate?: string;
  initialTrainingPaces?: TrainingPaces | null;
  isLoading?: boolean;
  progressPanel?: ProgressPanel;
  onRefreshPlan?: () => Promise<void>;
  onAnswersUpdate?: (updatedAnswers: any) => void;
  pendingInterventionSignal?: { source: string; workoutKey: string; completionId?: string; ts: number } | null;
  debugInfo?: {
    normalizationRan: boolean;
    dbWriteOccurred: boolean;
    isDateBased: boolean;
    normalizedWeeksCount: number;
    firstWeekHasAllDays: boolean;
    missingWeek1Days: string[];
    invariantFailCount: number;
  };
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
  isLoading,
  progressPanel,
  onRefreshPlan,
  onAnswersUpdate,
  pendingInterventionSignal,
  debugInfo
}: PlanWithChatProps) {
  const isPreviewMode = fullPlanData && fullPlanData.plan.length > planData.plan.length;
  const isDateBasedPreview = planType === 'date_based_preview';
  const [isChatOpen, setIsChatOpen] = useState(isPreviewMode || isDateBasedPreview ? true : false);
  const [currentWeekNumber, setCurrentWeekNumber] = useState(1);
  const [completedWorkouts, setCompletedWorkouts] = useState<Set<string>>(new Set());
  const [previousPlanState, setPreviousPlanState] = useState<PlanData | null>(null);
  const [originalPlanState, setOriginalPlanState] = useState<PlanData | null>(null);
  const [lastAutoOpenTime, setLastAutoOpenTime] = useState<number>(0);
  const [previewAcknowledged, setPreviewAcknowledged] = useState(false);
  const [showWeeklyInsight, setShowWeeklyInsight] = useState(false);
  const [insightTriggerType, setInsightTriggerType] = useState<'weekly_open' | 'workout_completion'>('weekly_open');

  const raceDate = answers?.raceDate || planData?.race_date || null;
  const totalWeeksFromAnswers = answers?.planWeeks || 12;

  const { shouldShowInsight, setShouldShowInsight } = useWeeklyInsightCheck(
    savedPlanId || null,
    planData,
    raceDate,
    totalWeeksFromAnswers,
    initialTrainingPaces
  );

  useEffect(() => {
    if (shouldShowInsight && savedPlanId && !isPreviewMode && !isDateBasedPreview) {
      setShowWeeklyInsight(true);
    }
  }, [shouldShowInsight, savedPlanId, isPreviewMode, isDateBasedPreview]);

  const previewBuildInfo = useMemo(() => {
    if (!isDateBasedPreview || !answers) return null;

    const startingWeeklyKm = parseFloat(answers.currentWeeklyKm || '0') || 0;
    const startingLongestRun = parseFloat(answers.longestRun || '0') || 0;
    const raceDate = answers.raceDate;
    const planDurationWeeks = answers.planWeeks || 12;

    if (startingWeeklyKm <= 0) return null;

    let totalWeeks = planDurationWeeks;
    if (raceDate && planStartDate) {
      const start = new Date(planStartDate);
      const race = new Date(raceDate);
      const days = Math.ceil((race.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      totalWeeks = Math.ceil(days / 7);
    }

    const RAMP_RATE = 0.06;
    const DELOAD_EVERY = 4;
    const MAX_LONG_RUN_KM = 32;
    const MAX_WEEKLY_VOLUME_KM = 80;

    const raceDistanceStr = (answers.raceDistance || '').toLowerCase();
    let raceDistanceKm = 0;
    if (raceDistanceStr.includes('half marathon') || raceDistanceStr.includes('half')) raceDistanceKm = 21.1;
    else if (raceDistanceStr.includes('marathon')) raceDistanceKm = 42.2;
    else {
      const match = raceDistanceStr.match(/(\d+(\.\d+)?)/);
      if (match) raceDistanceKm = parseFloat(match[1]);
    }

    const taperWeeks = raceDistanceKm > 0 ? Math.min(Math.max(1, Math.round(raceDistanceKm / 21)), 3) : 0;
    const buildWeeks = Math.max(1, totalWeeks - taperWeeks);

    let structuralVolume = startingWeeklyKm;
    const actualVolumes: number[] = [];

    for (let week = 0; week < buildWeeks; week++) {
      const isDeload = (week + 1) % DELOAD_EVERY === 0;

      if (week === 0) {
        actualVolumes.push(startingWeeklyKm);
      } else if (isDeload) {
        actualVolumes.push(Math.round(structuralVolume * 0.88 * 10) / 10);
      } else {
        const newVolume = Math.round(structuralVolume * (1 + RAMP_RATE) * 10) / 10;
        structuralVolume = Math.min(newVolume, MAX_WEEKLY_VOLUME_KM);
        actualVolumes.push(structuralVolume);
      }
    }

    const peakWeeklyKm = actualVolumes.length > 0 ? Math.max(...actualVolumes) : structuralVolume;
    let peakWeek = actualVolumes.indexOf(peakWeeklyKm) + 1;
    if (peakWeek <= 0) peakWeek = buildWeeks;

    const isMarathonLike = raceDistanceKm > 21;
    const specificityTarget = isMarathonLike
      ? Math.min(raceDistanceKm * 0.75, MAX_LONG_RUN_KM)
      : raceDistanceKm > 0
        ? Math.min(raceDistanceKm * 1.2, 21)
        : 0;

    const peakLongRunKm = specificityTarget > 0
      ? Math.min(specificityTarget, MAX_LONG_RUN_KM)
      : Math.min(peakWeeklyKm * 0.4, MAX_LONG_RUN_KM);

    return {
      peakWeeklyKm: Math.round(peakWeeklyKm),
      peakLongRunKm: Math.round(peakLongRunKm * 2) / 2,
      peakWeek,
    };
  }, [isDateBasedPreview, answers, planStartDate]);

  const handleUpdatePlan = (updatedPlan: any, updatedChatHistory?: ChatMessage[]) => {
    if (!originalPlanState) {
      setOriginalPlanState(planData);
    }
    setPreviousPlanState(planData);
    // Forward both updatedPlan and updatedChatHistory to parent
    onUpdatePlan(updatedPlan, false, updatedChatHistory);
  };

  const handleUndo = () => {
    if (originalPlanState) {
      onUpdatePlan(originalPlanState, false);
      setPreviousPlanState(null);
      setOriginalPlanState(null);
    }
  };

  const handleCoachInterventionSent = (params: { source: string; workoutKey: string; completionId?: string }) => {
    console.log('[DEBUG-CHAT-AUTO-OPEN] Coach intervention sent:', params);

    // Anti-spam: don't auto-open if we just auto-opened in the last 10 seconds
    const now = Date.now();
    const timeSinceLastOpen = now - lastAutoOpenTime;
    const ANTI_SPAM_WINDOW = 10000; // 10 seconds

    if (timeSinceLastOpen < ANTI_SPAM_WINDOW) {
      console.log('[DEBUG-CHAT-AUTO-OPEN] Skipping auto-open - too soon since last open', {
        timeSinceLastOpen,
        antiSpamWindow: ANTI_SPAM_WINDOW
      });
      return;
    }

    const RECOVERY_SOURCES = ['rpe_deviation', 'hr_elevated', 'hr_sustained', 'sleep_insufficient_hours', 'sleep_poor_quality', 'sleep_consecutive_poor'];
    if (!RECOVERY_SOURCES.includes(params.source)) {
      console.log('[DEBUG-CHAT-AUTO-OPEN] Skipping auto-open - not a recovery/deviation source');
      return;
    }

    // If chat is already open, do nothing (user can see the message)
    if (isChatOpen) {
      console.log('[DEBUG-CHAT-AUTO-OPEN] Chat already open, no action needed');
      return;
    }

    // Auto-open the chat
    console.log('[DEBUG-CHAT-AUTO-OPEN] Opening chat automatically');
    setIsChatOpen(true);
    setLastAutoOpenTime(now);
  };

  useEffect(() => {
    if (!pendingInterventionSignal) return;
    handleCoachInterventionSent(pendingInterventionSignal);
  }, [pendingInterventionSignal]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  useEffect(() => {
    if (isPreviewMode || isDateBasedPreview) {
      setIsChatOpen(true);
    }
  }, [isPreviewMode, isDateBasedPreview]);

  const showPreviewBanner = isPreviewMode && !isDateBasedPreview;
  const showDateBasedBanner = isDateBasedPreview;
  const hasBanner = showPreviewBanner || showDateBasedBanner;

  return (
    <>
      {showPreviewBanner && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-gradient-to-r from-brand-pink to-pink-500 text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1 text-center sm:text-left">
                <p className="text-base sm:text-lg font-medium leading-relaxed">
                  You are viewing a 2-week preview of your plan. Try out the coach chat, make any adjustments you feel and press here to unlock the full plan
                </p>
              </div>
              <button
                onClick={() => exportPlanToCSV(planData, answers, planStartDate)}
                className="px-4 py-3 bg-white/20 text-white font-medium rounded-lg hover:bg-white/30 transition-all text-sm shadow-md flex items-center gap-2 whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                CSV
              </button>
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
      {showDateBasedBanner && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-gradient-to-r from-brand-pink via-pink-500 to-rose-500 shadow-lg">
          <div className="w-full px-4 sm:px-6 py-4 sm:py-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-900 animate-pulse"></div>
                  <span className="text-base sm:text-lg font-bold text-slate-900">2-Week Preview</span>
                </div>
                <p className="text-sm sm:text-base text-slate-800 leading-relaxed">
                  Review your first 2 weeks, chat with your coach to fine-tune the plan, then generate the full schedule.
                </p>
              </div>
              {onAcceptPreview && (
                <button
                  onClick={onAcceptPreview}
                  disabled={isLoading || !previewAcknowledged}
                  className="px-6 py-3 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-all text-sm sm:text-base shadow-md hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2 whitespace-nowrap"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Generating...
                    </>
                  ) : 'Generate Full Plan'}
                </button>
              )}
            </div>

            <label className="flex items-center gap-3 mt-4 pt-3 border-t border-slate-900/20 cursor-pointer">
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                  previewAcknowledged
                    ? 'bg-slate-900 border-slate-900'
                    : 'border-slate-700 hover:border-slate-900 bg-transparent'
                }`}
                onClick={() => setPreviewAcknowledged(!previewAcknowledged)}
              >
                {previewAcknowledged && <Check className="w-3.5 h-3.5 text-white" />}
              </div>
              <span
                className="text-sm text-slate-800 select-none"
                onClick={() => setPreviewAcknowledged(!previewAcknowledged)}
              >
                I understand this plan uses approximately a 6% progression approach, and that this cannot be increased
              </span>
            </label>
          </div>
        </div>
      )}
      <div className={`space-y-6 ${hasBanner ? 'pt-36 sm:pt-32' : ''}`}>
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
          onUndo={originalPlanState ? handleUndo : undefined}
          onCoachInterventionSent={handleCoachInterventionSent}
          progressPanel={progressPanel}
          onRefreshPlan={onRefreshPlan}
          debugInfo={debugInfo}
          onWorkoutCompletionSuccess={() => {
            if (!showWeeklyInsight && savedPlanId && !isPreviewMode && !isDateBasedPreview) {
              setInsightTriggerType('workout_completion');
              setShowWeeklyInsight(true);
            }
          }}
        />
        </div>
      </div>

      {/* LEGACY: Chat availability gated by plan type - kept for backward compatibility with old 'static' plans */}
      {/* All new plans are 'responsive' or 'date_based_*' so this check mostly allows all plans */}
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
              onAnswersUpdate={onAnswersUpdate}
              currentWeekNumber={currentWeekNumber}
              planStartDate={planStartDate}
              completedWorkouts={completedWorkouts}
              planId={savedPlanId || undefined}
              isPreviewMode={isDateBasedPreview && !savedPlanId}
            />
          </div>
        </div>
      )}

      {/* LEGACY: "Upgrade to Responsive" prompt - only shown for old static plans */}
      {/* Users cannot create new static plans, so this is dead code for new users */}
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

      {/* LEGACY: Chat button gated by plan type - same logic as chat availability above */}
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

      {showWeeklyInsight && savedPlanId && (
        <WeeklyCoachInsight
          planId={savedPlanId}
          planData={planData}
          raceDate={raceDate}
          totalWeeks={totalWeeksFromAnswers}
          trainingPaces={initialTrainingPaces}
          triggerType={insightTriggerType}
          onClose={() => {
            setShowWeeklyInsight(false);
            setShouldShowInsight(false);
            setInsightTriggerType('weekly_open');
          }}
        />
      )}
    </>
  );
}
