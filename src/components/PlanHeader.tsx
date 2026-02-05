import { formatDateForDisplay } from '../utils/dateUtils';

interface TimeProgress {
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
  progressPercent: number;
}

interface PlanHeaderProps {
  raceDistance?: string;
  isPreviewMode: boolean;
  timeProgress: TimeProgress | null;
  raceDate?: string;
  planLength: number;
}

export function PlanHeader({ raceDistance, isPreviewMode, timeProgress, raceDate, planLength }: PlanHeaderProps) {
  return (
    <div className="mb-6 p-4 md:p-6 card-premium">
      <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 dark:text-white">
        Your {raceDistance || 'Training'} Training Plan
      </h2>
      {!isPreviewMode && timeProgress ? (
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
        <p className="text-neutral-700 dark:text-neutral-300 mt-2">
          {isPreviewMode ? 'Plan preview' : `${planLength} weeks of training`}
        </p>
      )}
    </div>
  );
}
