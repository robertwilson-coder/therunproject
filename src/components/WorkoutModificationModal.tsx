import { useState } from 'react';
import { X, ArrowRight, Calendar } from 'lucide-react';
import { dayOrder } from '../utils/trainingPlanUtils';

interface WorkoutModificationModalProps {
  pendingAction: {
    type: 'move' | 'easier';
    data: {
      weekNumber: number;
      dayName: string;
      activity: string;
    };
  };
  onClose: () => void;
  onMoveWorkout: (toDay: string) => void;
  onBulkMoveWeekday: (fromWeekday: string, toWeekday: string) => void;
  onMakeEasier: (easeType: 'distance' | 'intensity' | 'rest') => void;
  availableTrainingDays?: string[];
  futureWorkoutsOnDay?: number;
}

type MoveScope = 'single' | 'recurring' | null;

const SHORT_TO_FULL_DAY: Record<string, string> = {
  'Mon': 'Monday',
  'Tue': 'Tuesday',
  'Wed': 'Wednesday',
  'Thu': 'Thursday',
  'Fri': 'Friday',
  'Sat': 'Saturday',
  'Sun': 'Sunday'
};

export function WorkoutModificationModal({
  pendingAction,
  onClose,
  onMoveWorkout,
  onBulkMoveWeekday,
  onMakeEasier,
  availableTrainingDays,
  futureWorkoutsOnDay = 0
}: WorkoutModificationModalProps) {
  const [moveScope, setMoveScope] = useState<MoveScope>(null);

  const sourceDayShort = pendingAction.data.dayName;
  const sourceDayFull = SHORT_TO_FULL_DAY[sourceDayShort] || sourceDayShort;

  const handleSelectDestination = (targetDay: string) => {
    if (moveScope === 'single') {
      onMoveWorkout(targetDay);
    } else if (moveScope === 'recurring') {
      onBulkMoveWeekday(sourceDayShort, targetDay);
    }
  };

  const handleBack = () => {
    setMoveScope(null);
  };

  const showRecurringOption = futureWorkoutsOnDay > 1;

  return (
    <div className="fixed inset-0 bg-black/70 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="card-premium max-w-md w-full p-6 animate-scale-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
            {pendingAction.type === 'move' ? 'Move Workout' : 'Make Workout Easier'}
          </h3>
          <button
            onClick={onClose}
            className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="mb-6">
          <p className="text-neutral-900 dark:text-white mb-2 font-medium">
            Week {pendingAction.data.weekNumber} - {sourceDayFull}
          </p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
            {pendingAction.data.activity}
          </p>

          {pendingAction.type === 'move' && moveScope === null && (
            <div>
              <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-3">What would you like to move?</p>
              <div className="space-y-2">
                <button
                  onClick={() => setMoveScope('single')}
                  className="w-full p-4 text-left bg-primary-500/10 hover:bg-primary-500/20 border-2 border-primary-500/30 hover:border-primary-500/50 rounded-xl transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary-500/20 rounded-lg group-hover:bg-primary-500/30 transition-colors">
                      <ArrowRight className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-neutral-900 dark:text-white">This workout only</p>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">Move just this one workout to another day</p>
                    </div>
                  </div>
                </button>

                {showRecurringOption && (
                  <button
                    onClick={() => setMoveScope('recurring')}
                    className="w-full p-4 text-left bg-amber-500/10 hover:bg-amber-500/20 border-2 border-amber-500/30 hover:border-amber-500/50 rounded-xl transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-500/20 rounded-lg group-hover:bg-amber-500/30 transition-colors">
                        <Calendar className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="font-semibold text-neutral-900 dark:text-white">All future {sourceDayFull} workouts</p>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                          {futureWorkoutsOnDay} workouts will be moved to your chosen day
                        </p>
                      </div>
                    </div>
                  </button>
                )}
              </div>
            </div>
          )}

          {pendingAction.type === 'move' && moveScope !== null && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={handleBack}
                  className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                >
                  Back
                </button>
                <span className="text-neutral-400">|</span>
                <span className="text-xs text-neutral-600 dark:text-neutral-400">
                  {moveScope === 'single' ? 'Moving this workout' : `Moving all future ${sourceDayFull} workouts`}
                </span>
              </div>

              <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-3">
                {moveScope === 'single'
                  ? 'Move this workout to which day?'
                  : `Move all future ${sourceDayFull} workouts to which day?`}
              </p>

              {moveScope === 'recurring' && (
                <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    This will reschedule {futureWorkoutsOnDay} future workouts. Your plan may be rebalanced to maintain training quality.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-7 gap-1">
                {dayOrder.map(targetDay => {
                  const isSourceDay = targetDay === sourceDayShort;
                  const isAvailable = !availableTrainingDays || availableTrainingDays.includes(targetDay);
                  const isDisabled = isSourceDay || (moveScope === 'recurring' && !isAvailable);

                  return (
                    <button
                      key={targetDay}
                      onClick={() => !isDisabled && handleSelectDestination(targetDay)}
                      disabled={isDisabled}
                      className={`p-2 text-xs font-medium rounded transition-all ${
                        isSourceDay
                          ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                          : isDisabled
                          ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600 cursor-not-allowed opacity-50'
                          : 'bg-primary-500/20 hover:bg-primary-500/30 text-primary-600 dark:text-primary-400 border border-primary-500/30 hover:border-primary-500/50'
                      }`}
                      title={isDisabled && !isSourceDay ? 'Not a training day' : undefined}
                    >
                      {targetDay}
                    </button>
                  );
                })}
              </div>

              {moveScope === 'recurring' && availableTrainingDays && (
                <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-2">
                  Only your training days are available for recurring moves
                </p>
              )}
            </div>
          )}

          {pendingAction.type === 'easier' && (
            <div>
              <p className="text-sm text-neutral-300 mb-3">How would you like to adjust this workout?</p>
              <div className="space-y-2">
                <button
                  onClick={() => onMakeEasier('distance')}
                  className="w-full p-3 text-left bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 rounded-lg transition-all"
                >
                  <p className="font-medium text-orange-600 dark:text-orange-400">Reduce Distance</p>
                  <p className="text-xs text-orange-600/70 dark:text-orange-400/70">Shorten run by 20%</p>
                </button>
                <button
                  onClick={() => onMakeEasier('intensity')}
                  className="w-full p-3 text-left bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 rounded-lg transition-all"
                >
                  <p className="font-medium text-orange-600 dark:text-orange-400">Lower Intensity</p>
                  <p className="text-xs text-orange-600/70 dark:text-orange-400/70">Convert to easy/recovery pace</p>
                </button>
                <button
                  onClick={() => onMakeEasier('rest')}
                  className="w-full p-3 text-left bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 rounded-lg transition-all"
                >
                  <p className="font-medium text-orange-600 dark:text-orange-400">Make Rest Day</p>
                  <p className="text-xs text-orange-600/70 dark:text-orange-400/70">Convert to full rest</p>
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full px-4 py-2 border-2 border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
