import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

function renderMarkdown(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

function formatDuration(totalMinutes: number): { hours: number; minutes: number } {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return { hours, minutes };
}

interface WorkoutCompletionModalProps {
  workoutToRate: {
    week: number;
    day: string;
    activity: string;
  };
  rating: number;
  workoutDistance: number;
  workoutDuration: number;
  workoutEnjoyment: string;
  workoutNotes: string;
  isBeginnerPlan: boolean;
  onClose: () => void;
  onRatingChange: (rating: number) => void;
  onDistanceChange: (distance: number) => void;
  onDurationChange: (duration: number) => void;
  onEnjoymentChange: (enjoyment: string) => void;
  onNotesChange: (notes: string) => void;
  onSubmit: () => void;
}

export function WorkoutCompletionModal({
  workoutToRate,
  rating,
  workoutDistance,
  workoutDuration,
  workoutEnjoyment,
  workoutNotes,
  isBeginnerPlan,
  onClose,
  onRatingChange,
  onDistanceChange,
  onDurationChange,
  onEnjoymentChange,
  onNotesChange,
  onSubmit
}: WorkoutCompletionModalProps) {
  const [distanceInput, setDistanceInput] = useState(workoutDistance > 0 ? workoutDistance.toString() : '');
  const [durationHours, setDurationHours] = useState(() => formatDuration(workoutDuration).hours);
  const [durationMinutes, setDurationMinutes] = useState(() => formatDuration(workoutDuration).minutes);

  useEffect(() => {
    const totalMinutes = (durationHours * 60) + durationMinutes;
    if (totalMinutes !== workoutDuration) {
      onDurationChange(totalMinutes);
    }
  }, [durationHours, durationMinutes, workoutDuration, onDurationChange]);

  const handleDistanceInputChange = (value: string) => {
    setDistanceInput(value);
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      onDistanceChange(parsed);
    } else if (value === '') {
      onDistanceChange(0);
    }
  };

  const handleDistanceSliderChange = (value: number) => {
    setDistanceInput(value.toFixed(1));
    onDistanceChange(value);
  };

  const handleHoursChange = (value: string) => {
    const parsed = parseInt(value) || 0;
    const clamped = Math.max(0, Math.min(10, parsed));
    setDurationHours(clamped);
  };

  const handleMinutesChange = (value: string) => {
    const parsed = parseInt(value) || 0;
    const clamped = Math.max(0, Math.min(59, parsed));
    setDurationMinutes(clamped);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto animate-fade-in">
      <div className="card-premium border-primary-500/30 max-w-md w-full p-6 relative z-50 my-8 animate-scale-in">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-neutral-900 dark:text-white">Rate Your Workout</h3>
          <button
            onClick={onClose}
            className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors hover:scale-110"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="mb-6">
          <p className="text-neutral-900 dark:text-white mb-2 font-medium">
            Week {workoutToRate.week} - {workoutToRate.day}
          </p>
          <p
            className="text-sm text-neutral-600 dark:text-neutral-400 mb-4"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(workoutToRate.activity) }}
          />

          <div className="space-y-6">
            <div>
              <p className="text-sm font-semibold text-primary-600 dark:text-primary-400 mb-3">
                Distance (km)
              </p>
              <div className="flex items-center justify-center gap-2 mb-3">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  max="100"
                  value={distanceInput}
                  onChange={(e) => handleDistanceInputChange(e.target.value)}
                  placeholder="0.0"
                  className="w-24 text-center text-2xl font-bold text-primary-600 dark:text-primary-400 bg-neutral-100 dark:bg-neutral-800 border-2 border-primary-300 dark:border-primary-600 rounded-lg py-2 px-3 focus:outline-none focus:border-primary-500 dark:focus:border-primary-400"
                />
                <span className="text-lg font-medium text-neutral-600 dark:text-neutral-400">km</span>
              </div>
              <div className="relative pt-2 pb-2">
                <input
                  type="range"
                  min="0"
                  max="42.2"
                  step="0.1"
                  value={workoutDistance}
                  onChange={(e) => handleDistanceSliderChange(parseFloat(e.target.value))}
                  className="w-full h-2 bg-neutral-300 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-neutral-500 dark:text-neutral-500 mt-2">
                  <span>0 km</span>
                  <span>21 km</span>
                  <span>42 km</span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-primary-600 dark:text-primary-400 mb-3">
                Duration
              </p>
              <div className="flex items-center justify-center gap-3 mb-3">
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="10"
                    value={durationHours}
                    onChange={(e) => handleHoursChange(e.target.value)}
                    className="w-16 text-center text-2xl font-bold text-primary-600 dark:text-primary-400 bg-neutral-100 dark:bg-neutral-800 border-2 border-primary-300 dark:border-primary-600 rounded-lg py-2 px-2 focus:outline-none focus:border-primary-500 dark:focus:border-primary-400"
                  />
                  <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">hr</span>
                </div>
                <span className="text-2xl font-bold text-neutral-400">:</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    max="59"
                    value={durationMinutes.toString().padStart(2, '0')}
                    onChange={(e) => handleMinutesChange(e.target.value)}
                    className="w-16 text-center text-2xl font-bold text-primary-600 dark:text-primary-400 bg-neutral-100 dark:bg-neutral-800 border-2 border-primary-300 dark:border-primary-600 rounded-lg py-2 px-2 focus:outline-none focus:border-primary-500 dark:focus:border-primary-400"
                  />
                  <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">min</span>
                </div>
              </div>
              <p className="text-center text-xs text-neutral-500 dark:text-neutral-500">
                Total: {workoutDuration} minutes
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-primary-600 dark:text-primary-400 mb-3">
                {isBeginnerPlan ? 'Rate Your Effort Level (1-10)' : 'Rate of Perceived Effort (RPE)'}
              </p>

              <div className="text-center mb-3">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-600">
                  <span className="text-3xl font-bold text-white">{rating || '-'}</span>
                </div>
                <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2">
                  {rating === 0 && (isBeginnerPlan ? 'Select your effort level' : 'Select your RPE')}
                  {rating >= 1 && rating <= 2 && 'Very Easy - Recovery'}
                  {rating >= 3 && rating <= 4 && 'Easy - Comfortable'}
                  {rating >= 5 && rating <= 6 && 'Moderate - Steady'}
                  {rating >= 7 && rating <= 8 && 'Hard - Challenging'}
                  {rating >= 9 && rating <= 10 && 'Maximum Effort'}
                </p>
              </div>

              <div className="relative pt-2 pb-2">
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={rating}
                  onChange={(e) => onRatingChange(parseInt(e.target.value))}
                  className="w-full h-2 bg-gradient-to-r from-green-400 via-yellow-400 to-red-500 rounded-lg appearance-none cursor-pointer slider"
                  style={{
                    background: `linear-gradient(to right, #4ade80 0%, #facc15 50%, #ef4444 100%)`
                  }}
                />
                <div className="flex justify-between text-xs text-neutral-500 dark:text-neutral-500 mt-2">
                  <span>1</span>
                  <span>2</span>
                  <span>3</span>
                  <span>4</span>
                  <span>5</span>
                  <span>6</span>
                  <span>7</span>
                  <span>8</span>
                  <span>9</span>
                  <span>10</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-800">
              <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-3">
                How did you feel about this workout?
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => onEnjoymentChange('terrible')}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    workoutEnjoyment === 'terrible'
                      ? 'border-primary-500 bg-primary-500/20'
                      : 'border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600'
                  }`}
                >
                  <div className="text-2xl mb-1">😫</div>
                  <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Terrible</div>
                </button>
                <button
                  type="button"
                  onClick={() => onEnjoymentChange('poor')}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    workoutEnjoyment === 'poor'
                      ? 'border-primary-500 bg-primary-500/20'
                      : 'border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600'
                  }`}
                >
                  <div className="text-2xl mb-1">😞</div>
                  <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Poor</div>
                </button>
                <button
                  type="button"
                  onClick={() => onEnjoymentChange('okay')}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    workoutEnjoyment === 'okay'
                      ? 'border-primary-500 bg-primary-500/20'
                      : 'border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600'
                  }`}
                >
                  <div className="text-2xl mb-1">😐</div>
                  <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Okay</div>
                </button>
                <button
                  type="button"
                  onClick={() => onEnjoymentChange('good')}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    workoutEnjoyment === 'good'
                      ? 'border-primary-500 bg-primary-500/20'
                      : 'border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600'
                  }`}
                >
                  <div className="text-2xl mb-1">🙂</div>
                  <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Good</div>
                </button>
                <button
                  type="button"
                  onClick={() => onEnjoymentChange('great')}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    workoutEnjoyment === 'great'
                      ? 'border-primary-500 bg-primary-500/20'
                      : 'border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600'
                  }`}
                >
                  <div className="text-2xl mb-1">😊</div>
                  <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Great</div>
                </button>
                <button
                  type="button"
                  onClick={() => onEnjoymentChange('amazing')}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    workoutEnjoyment === 'amazing'
                      ? 'border-primary-500 bg-primary-500/20'
                      : 'border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600'
                  }`}
                >
                  <div className="text-2xl mb-1">🤩</div>
                  <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Amazing</div>
                </button>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-neutral-200 dark:border-neutral-800">
              <p className="text-sm font-semibold text-primary-600 dark:text-primary-400 mb-3">
                Notes (Optional)
              </p>
              <textarea
                value={workoutNotes}
                onChange={(e) => onNotesChange(e.target.value)}
                placeholder="How was the workout? Any observations, challenges, or achievements?"
                rows={3}
                className="input-field resize-none text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border-2 border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg hover:border-neutral-400 dark:hover:border-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={rating === 0 || workoutDistance === 0 || workoutDuration === 0}
            className={`flex-1 px-4 py-2.5 rounded-lg font-semibold transition-all ${
              rating > 0 && workoutDistance > 0 && workoutDuration > 0
                ? 'btn-primary'
                : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
            }`}
          >
            Complete
          </button>
        </div>
        {(workoutDistance === 0 || workoutDuration === 0 || rating === 0) && (
          <p className="text-xs text-amber-600 dark:text-amber-400 text-center mt-2">
            Please enter distance, duration, and effort level to complete
          </p>
        )}
      </div>
    </div>
  );
}
