import { Target, TrendingUp, Info } from 'lucide-react';
import type { ProgressPanel as ProgressPanelType } from '../types';

interface ProgressPanelProps {
  progressPanel: ProgressPanelType;
  className?: string;
}

export function ProgressPanel({ progressPanel, className = '' }: ProgressPanelProps) {
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
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
            {progressPanel.why_it_matters}
          </p>
        </div>
      </div>

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

      {progressPanel.accuracy_hint && (
        <div className="mt-4 flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <Info className="w-4 h-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-800 dark:text-yellow-200">
            {progressPanel.accuracy_hint}
          </p>
        </div>
      )}
    </div>
  );
}
