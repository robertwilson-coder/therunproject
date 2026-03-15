import { Pause, Play } from 'lucide-react';
import { formatDateForDisplay } from '../utils/dateUtils';
import type { AmbitionTier } from '../types';

interface TimeProgress {
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
  progressPercent: number;
}

export interface PlanPauseControl {
  isPaused: boolean;
  isProcessing: boolean;
  onPause: () => void;
  onResume: () => void;
}

interface PlanHeaderProps {
  raceDistance?: string;
  isPreviewMode: boolean;
  timeProgress: TimeProgress | null;
  raceDate?: string;
  planLength: number;
  pauseControl?: PlanPauseControl;
  ambitionTier?: AmbitionTier;
}

function AmbitionTierTag({ tier }: { tier?: AmbitionTier }) {
  if (!tier) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400">
        Mode: —
      </span>
    );
  }

  const tierConfig: Record<AmbitionTier, { label: string; className: string }> = {
    base: {
      label: 'Base',
      className: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    },
    performance: {
      label: 'Performance',
      className: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400',
    },
    competitive: {
      label: 'Competitive',
      className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    },
  };

  const config = tierConfig[tier];

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

export function PlanHeader({ raceDistance, isPreviewMode, timeProgress, raceDate, planLength, pauseControl, ambitionTier }: PlanHeaderProps) {
  return (
    <div className="mb-6 p-4 md:p-6 card-premium">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 dark:text-white">
              Your {raceDistance || 'Training'} Training Plan
            </h2>
            <AmbitionTierTag tier={ambitionTier} />
          </div>
        </div>

        {!isPreviewMode && pauseControl && (
          <div className="flex-shrink-0">
            {pauseControl.isPaused ? (
              <button
                onClick={pauseControl.onResume}
                disabled={pauseControl.isProcessing}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                aria-label="Resume plan"
              >
                <Play className="w-4 h-4" />
                <span>Resume</span>
              </button>
            ) : (
              <button
                onClick={pauseControl.onPause}
                disabled={pauseControl.isProcessing}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 text-neutral-700 dark:text-neutral-300 text-sm font-semibold transition-colors"
                aria-label="Pause plan"
              >
                <Pause className="w-4 h-4" />
                <span>Pause</span>
              </button>
            )}
          </div>
        )}
      </div>

      {pauseControl?.isPaused && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40">
          <Pause className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Plan paused — race date will extend when you resume</span>
        </div>
      )}

      {!isPreviewMode && timeProgress && !pauseControl?.isPaused ? (
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm text-neutral-700 dark:text-neutral-300 mb-2">
            <span>{timeProgress.elapsedDays} days completed</span>
            <span className="font-semibold">{timeProgress.progressPercent}%</span>
            <span>{timeProgress.remainingDays} days remaining</span>
          </div>
          <div className="w-full h-3 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary-500 to-primary-400 transition-all duration-500 rounded-full"
              style={{ width: `${timeProgress.progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-2 text-center">
            {timeProgress.totalDays} days total • Race day: {raceDate ? formatDateForDisplay(raceDate) : 'Not set'}
          </p>
        </div>
      ) : (
        !pauseControl?.isPaused && (
          <p className="text-neutral-700 dark:text-neutral-300 mt-2">
            {isPreviewMode ? 'Plan preview' : `${planLength} weeks of training`}
          </p>
        )
      )}
    </div>
  );
}
