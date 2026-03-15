import { Target, TrendingUp, Info, Sparkles, RefreshCw, ChevronDown, ChevronUp, CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import type { ProgressPanel as ProgressPanelType, StepsMeta } from '../types';

interface ProgressPanelProps {
  progressPanel: ProgressPanelType;
  className?: string;
  savedPlanId?: string | null;
  onMetadataAdded?: () => void;
  stepsMeta?: StepsMeta;
}

export function ProgressPanel({ progressPanel, className = '', savedPlanId, onMetadataAdded, stepsMeta }: ProgressPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isEnabling, setIsEnabling] = useState(false);
  const [enableError, setEnableError] = useState<string | null>(null);
  const stepsEnabled = progressPanel.steps_enabled === true;
  const showProgressBar = progressPanel.show_progress_bar ?? (progressPanel.progress_percent != null);
  const hasProgressBar = stepsEnabled && showProgressBar;
  const hasTimeBoxEscape = progressPanel.reason_codes?.includes('TIME_BOX_ESCAPE');

  const pct = progressPanel.progress_percent ?? 0;
  const barPct = hasTimeBoxEscape ? 95 : pct;

  const confidenceColor = {
    low: 'text-yellow-600 dark:text-yellow-400',
    med: 'text-blue-600 dark:text-blue-400',
    high: 'text-green-600 dark:text-green-400'
  };

  const confidenceLabel = {
    low: 'Building Data',
    med: 'On Track',
    high: 'Strong Progress'
  };

  const planSteps = stepsMeta?.plan_steps ?? [];
  const currentStepIndex = planSteps.findIndex(
    s => s.name === progressPanel.current_focus_name
  );
  const showJourney = stepsEnabled && planSteps.length > 1;

  const handleEnableSteps = async () => {
    if (!savedPlanId) return;

    setIsEnabling(true);
    setEnableError(null);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/add-steps-metadata`;
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ planId: savedPlanId, force: true })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to enable Steps Progress System');
      }

      if (onMetadataAdded) {
        onMetadataAdded();
      }
    } catch (err) {
      setEnableError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsEnabling(false);
    }
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 ${className}`}>
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
          <Target className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Current Focus: {progressPanel.current_focus_name}
          </h3>
          {!isCollapsed && (
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              {progressPanel.why_it_matters}
            </p>
          )}
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
          aria-label={isCollapsed ? 'Expand current focus' : 'Collapse current focus'}
        >
          {isCollapsed ? (
            <ChevronDown className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          ) : (
            <ChevronUp className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          )}
        </button>
      </div>

      {!isCollapsed && (
        <>
          {hasProgressBar && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Progress
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {hasTimeBoxEscape ? 'Moving On' : `${pct}%`}
                  </span>
                  {progressPanel.confidence && (
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-full bg-opacity-10 ${
                        confidenceColor[progressPanel.confidence]
                      }`}
                    >
                      {confidenceLabel[progressPanel.confidence]}
                    </span>
                  )}
                  {pct === 0 && savedPlanId && (
                    <button
                      onClick={handleEnableSteps}
                      disabled={isEnabling}
                      className="ml-2 p-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50 transition-colors"
                      title="Recalculate progress based on completed workouts"
                    >
                      <RefreshCw className={`w-4 h-4 ${isEnabling ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                </div>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                <div
                  className="bg-gradient-to-r from-blue-500 to-blue-600 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${barPct}%` }}
                />
              </div>
            </div>
          )}

          {showJourney && (
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Training Journey
              </p>
              <div className="flex items-center gap-0">
                {planSteps.map((step, index) => {
                  const isDone = index < currentStepIndex;
                  const isCurrent = index === currentStepIndex;
                  const isLast = index === planSteps.length - 1;

                  return (
                    <div key={step.step_id} className="flex items-center flex-1 min-w-0">
                      <div className="flex flex-col items-center flex-1 min-w-0">
                        <div
                          className={`flex items-center justify-center w-7 h-7 rounded-full mb-1.5 flex-shrink-0 transition-all duration-200 ${
                            isDone
                              ? 'bg-green-500 text-white'
                              : isCurrent
                              ? 'bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-900/50'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                          }`}
                        >
                          {isDone ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : isCurrent ? (
                            <Target className="w-3.5 h-3.5" />
                          ) : (
                            <Circle className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <span
                          className={`text-xs text-center leading-tight px-0.5 truncate w-full ${
                            isDone
                              ? 'text-green-600 dark:text-green-400 font-medium'
                              : isCurrent
                              ? 'text-blue-600 dark:text-blue-400 font-semibold'
                              : 'text-gray-400 dark:text-gray-500'
                          }`}
                          title={step.name}
                        >
                          {step.name}
                        </span>
                      </div>
                      {!isLast && (
                        <ArrowRight
                          className={`w-4 h-4 flex-shrink-0 mx-0.5 mb-5 ${
                            isDone
                              ? 'text-green-400 dark:text-green-500'
                              : 'text-gray-300 dark:text-gray-600'
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                This Week's Strategy
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {progressPanel.this_week_strategy}
              </p>
            </div>
          </div>

          {!stepsEnabled && savedPlanId && (
            <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-3 mb-3">
                <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                    Unlock Enhanced Progress Tracking
                  </h4>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">
                    Get detailed insights into your training phases with progress bars, phase transitions, and confidence tracking. Track your journey through Aerobic Base, Threshold Development, and Race-Specific phases.
                  </p>
                  <button
                    onClick={handleEnableSteps}
                    disabled={isEnabling}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors duration-200 flex items-center gap-2"
                  >
                    {isEnabling ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Enabling...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Enable Progress Tracking
                      </>
                    )}
                  </button>
                  {enableError && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                      {enableError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {progressPanel.accuracy_hint && (
            <div className="mt-4 flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <Info className="w-4 h-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-800 dark:text-yellow-200">
                {progressPanel.accuracy_hint}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
