import { X } from 'lucide-react';
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
  onMakeEasier: (easeType: 'distance' | 'intensity' | 'rest') => void;
}

export function WorkoutModificationModal({
  pendingAction,
  onClose,
  onMoveWorkout,
  onMakeEasier
}: WorkoutModificationModalProps) {
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
            Week {pendingAction.data.weekNumber} - {pendingAction.data.dayName}
          </p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
            {pendingAction.data.activity}
          </p>

          {pendingAction.type === 'move' && (
            <div>
              <p className="text-sm text-neutral-700 dark:text-neutral-300 mb-3">Move this workout to which day?</p>
              <div className="grid grid-cols-7 gap-1">
                {dayOrder.map(targetDay => (
                  <button
                    key={targetDay}
                    onClick={() => onMoveWorkout(targetDay)}
                    className={`p-2 text-xs font-medium rounded ${
                      targetDay === pendingAction.data.dayName
                        ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
                        : 'bg-primary-500/20 hover:bg-primary-500/30 text-primary-400 border border-primary-500/30'
                    }`}
                    disabled={targetDay === pendingAction.data.dayName}
                  >
                    {targetDay}
                  </button>
                ))}
              </div>
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
                  <p className="font-medium text-orange-400">Reduce Distance</p>
                  <p className="text-xs text-orange-400/70">Shorten run by 20%</p>
                </button>
                <button
                  onClick={() => onMakeEasier('intensity')}
                  className="w-full p-3 text-left bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 rounded-lg transition-all"
                >
                  <p className="font-medium text-orange-400">Lower Intensity</p>
                  <p className="text-xs text-orange-400/70">Convert to easy/recovery pace</p>
                </button>
                <button
                  onClick={() => onMakeEasier('rest')}
                  className="w-full p-3 text-left bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 rounded-lg transition-all"
                >
                  <p className="font-medium text-orange-400">Make Rest Day</p>
                  <p className="text-xs text-orange-400/70">Convert to full rest</p>
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full px-4 py-2 border-2 border-neutral-700 text-neutral-300 rounded-lg hover:bg-neutral-800 transition-all font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
