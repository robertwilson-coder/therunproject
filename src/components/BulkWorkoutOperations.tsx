import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Check, Calendar, Trash2, X } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';

interface BulkWorkoutOperationsProps {
  planId: string;
  planData: any;
  onSuccess: () => void;
  onClose: () => void;
}

export function BulkWorkoutOperations({ planId, planData, onSuccess, onClose }: BulkWorkoutOperationsProps) {
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirmComplete, setShowConfirmComplete] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  const handleMarkWeekComplete = async () => {
    if (!selectedWeek) return;

    setIsProcessing(true);
    const week = planData.plan.find((w: any) => w.week === selectedWeek);
    if (!week) return;

    const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const insertions = [];

    for (const day of dayOrder) {
      const dayData = week.days[day];
      const workout = typeof dayData === 'string' ? dayData : dayData?.workout;

      if (workout && !workout.toLowerCase().includes('rest')) {
        insertions.push({
          plan_id: planId,
          week_number: selectedWeek,
          day_name: day,
          completed_at: new Date().toISOString(),
          rating: 5,
        });
      }
    }

    if (insertions.length > 0) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const insertionsWithUserId = insertions.map(item => ({
          ...item,
          user_id: user.id,
        }));

        await supabase.from('workout_completions').insert(insertionsWithUserId);
      }
    }

    setIsProcessing(false);
    setShowConfirmComplete(false);
    onSuccess();
  };

  const handleClearWeekCompletions = async () => {
    if (!selectedWeek) return;

    setIsProcessing(true);
    await supabase
      .from('workout_completions')
      .delete()
      .eq('training_plan_id', planId)
      .eq('week_number', selectedWeek);

    setIsProcessing(false);
    setShowConfirmClear(false);
    onSuccess();
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
        <div className="bg-white dark:bg-neutral-900 border-2 border-neutral-200 dark:border-neutral-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
          <div className="p-6 border-b-2 border-neutral-200 dark:border-neutral-800 sticky top-0 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm z-10">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-display font-bold text-neutral-900 dark:text-white flex items-center gap-3">
                <div className="p-2 bg-primary-500 rounded-md">
                  <Calendar className="w-5 h-5 text-white" />
                </div>
                Bulk Workout Operations
              </h2>
              <button
                onClick={onClose}
                className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md"
                aria-label="Close"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-88px)]">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
                Select Week
              </label>
              <select
                value={selectedWeek || ''}
                onChange={(e) => setSelectedWeek(Number(e.target.value))}
                className="input w-full"
                aria-label="Select week number"
              >
                <option value="">Choose a week...</option>
                {planData.plan.map((week: any) => (
                  <option key={week.week} value={week.week}>
                    Week {week.week}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => setShowConfirmComplete(true)}
                disabled={!selectedWeek || isProcessing}
                className="flex items-center justify-center gap-3 p-4 card hover:border-green-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                aria-label="Mark all workouts in selected week as complete"
              >
                <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-md group-hover:bg-green-500 transition-colors">
                  <Check className="w-5 h-5 text-green-600 dark:text-green-400 group-hover:text-white transition-colors" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-neutral-900 dark:text-white">Mark Week Complete</p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">Complete all workouts</p>
                </div>
              </button>

              <button
                onClick={() => setShowConfirmClear(true)}
                disabled={!selectedWeek || isProcessing}
                className="flex items-center justify-center gap-3 p-4 card hover:border-red-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                aria-label="Clear all completions for selected week"
              >
                <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-md group-hover:bg-red-500 transition-colors">
                  <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400 group-hover:text-white transition-colors" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-neutral-900 dark:text-white">Clear Week</p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">Remove all completions</p>
                </div>
              </button>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-300 dark:border-amber-800 rounded-lg p-4">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                <strong>Note:</strong> Bulk operations affect entire weeks. Use these features carefully as they cannot be easily undone.
              </p>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showConfirmComplete}
        onClose={() => setShowConfirmComplete(false)}
        onConfirm={handleMarkWeekComplete}
        title="Mark Week as Complete?"
        message={`This will mark all workouts in Week ${selectedWeek} as complete. Rest days will not be affected.`}
        confirmText="Complete Week"
        variant="info"
        isLoading={isProcessing}
      />

      <ConfirmDialog
        isOpen={showConfirmClear}
        onClose={() => setShowConfirmClear(false)}
        onConfirm={handleClearWeekCompletions}
        title="Clear Week Completions?"
        message={`This will remove all completion records for Week ${selectedWeek}. This action cannot be undone.`}
        confirmText="Clear Week"
        variant="danger"
        isLoading={isProcessing}
      />
    </>
  );
}
