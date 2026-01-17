import { useEffect, useState } from 'react';
import { supabase, TrainingPlan } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Archive, ArchiveRestore, Eye, Calendar } from 'lucide-react';
import { SavedPlansSkeleton } from './LoadingSkeletons';
import { NoPlansEmptyState } from './EmptyStates';
import { ConfirmDialog } from './ConfirmDialog';

interface SavedPlansProps {
  onLoadPlan: (plan: TrainingPlan) => void;
  onClose: () => void;
}

export function SavedPlans({ onLoadPlan, onClose }: SavedPlansProps) {
  const { user } = useAuth();
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completionsMap, setCompletionsMap] = useState<Record<string, number>>({});
  const [archiveConfirm, setArchiveConfirm] = useState<{ planId: string; currentlyArchived: boolean } | null>(null);

  useEffect(() => {
    loadPlans();
  }, [user]);

  const loadPlans = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('training_plans')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPlans(data || []);

      if (data && data.length > 0) {
        await loadCompletions(data.map(p => p.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  };

  const handleArchiveClick = (planId: string, currentlyArchived: boolean) => {
    setArchiveConfirm({ planId, currentlyArchived });
  };

  const handleArchive = async () => {
    if (!archiveConfirm) return;
    const { planId, currentlyArchived } = archiveConfirm;

    try {
      const { error } = await supabase
        .from('training_plans')
        .update({ archived: !currentlyArchived })
        .eq('id', planId);

      if (error) throw error;
      setPlans(plans.map(p => p.id === planId ? { ...p, archived: !currentlyArchived } : p));
      setArchiveConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update plan');
      setArchiveConfirm(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getDistanceInKm = (raceDistance: string): string => {
    const distanceMap: { [key: string]: string } = {
      'Marathon': '42k',
      'Half Marathon': '21k',
      '10k': '10k',
      '5k': '5k',
      '10 Mile': '16k',
      '10 mile': '16k'
    };
    return distanceMap[raceDistance] || raceDistance;
  };

  const calculateProgress = (plan: TrainingPlan): { completed: number; total: number; percentage: number } => {
    let totalWorkouts = 0;

    plan.plan_data.plan.forEach(week => {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      days.forEach(day => {
        const activity = week.days[day as keyof typeof week.days];
        const activityText = typeof activity === 'string' ? activity : activity?.workout || '';
        if (!activityText.toLowerCase().includes('rest')) {
          totalWorkouts++;
        }
      });
    });

    const completedWorkouts = completionsMap[plan.id] || 0;
    const percentage = totalWorkouts > 0 ? Math.round((completedWorkouts / totalWorkouts) * 100) : 0;
    return { completed: completedWorkouts, total: totalWorkouts, percentage };
  };

  const loadCompletions = async (planIds: string[]) => {
    if (!user || planIds.length === 0) return;

    try {
      const { data, error } = await supabase
        .from('workout_completions')
        .select('training_plan_id')
        .in('training_plan_id', planIds)
        .eq('user_id', user.id);

      if (error) throw error;

      const counts: Record<string, number> = {};
      planIds.forEach(id => counts[id] = 0);

      data?.forEach(completion => {
        counts[completion.training_plan_id] = (counts[completion.training_plan_id] || 0) + 1;
      });

      setCompletionsMap(counts);
    } catch (err) {
      console.error('Error loading completions:', err);
    }
  };


  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col shadow-hard animate-scale-in">
        <div className="p-6 border-b border-neutral-800 bg-neutral-900/95 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-display font-bold text-white">Your Saved Training Plans</h2>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-white transition-colors p-2 hover:bg-neutral-800 rounded-lg"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading && <SavedPlansSkeleton />}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-5 py-4 rounded-xl animate-slide-down">
              <p className="font-semibold">Error: {error}</p>
              <p className="text-sm mt-2">Please try refreshing the page or contact support if the problem persists.</p>
            </div>
          )}

          {!loading && !error && plans.length === 0 && (
            <NoPlansEmptyState onCreatePlan={onClose} />
          )}

          {!loading && !error && plans.length > 0 && (
            <div className="space-y-8">
              {plans.filter(p => !p.archived).length > 0 && (
                <div className="space-y-5">
                  {plans.filter(p => !p.archived).map((plan) => {
                    const progress = calculateProgress(plan);
                    return (
                      <div key={plan.id}>
                      <div
                        className="bg-neutral-900/50 border-2 border-neutral-800 rounded-xl p-6 hover:border-neutral-700 transition-all"
                      >
                        <div className="flex flex-col sm:flex-row items-start gap-5 mb-5">
                          <div className="flex items-start gap-4 flex-1 w-full">
                            <div className="flex-shrink-0">
                              <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-primary-500/20 to-primary-600/20 flex items-center justify-center border-2 border-primary-500/30">
                                <span className="text-2xl font-bold text-primary-400">
                                  {getDistanceInKm(plan.answers.raceDistance || '')}
                                </span>
                              </div>
                            </div>

                            <div className="flex-1 min-w-0">
                              <h3 className="text-xl font-bold text-white mb-2">
                                {plan.answers.raceDistance || 'Training'} Training Plan
                              </h3>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                                <p className="text-neutral-300">
                                  <span className="font-semibold text-neutral-400">Weeks:</span> {plan.plan_data.plan.length}
                                </p>
                                <p className="text-neutral-400">
                                  Created: {formatDate(plan.created_at)}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-2 w-full sm:w-auto sm:flex-shrink-0">
                            <button
                              onClick={() => onLoadPlan(plan)}
                              className="btn-primary flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5"
                            >
                              <Eye className="w-4 h-4" />
                              View
                            </button>
                            <button
                              onClick={() => handleArchiveClick(plan.id, false)}
                              className="flex items-center justify-center w-12 h-12 sm:w-10 sm:h-10 bg-neutral-800/50 text-neutral-400 rounded-lg hover:bg-neutral-700 hover:text-neutral-300 transition-colors border-2 border-neutral-700/50 hover:border-neutral-600 focus:outline-none focus:ring-4 focus:ring-neutral-500/50"
                              title="Archive plan"
                              aria-label="Archive plan"
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="pt-4 border-t-2 border-neutral-800/50">
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                            <div className="inline-flex items-center justify-center sm:justify-start px-3 py-1.5 rounded-lg bg-primary-500/20 border border-primary-500/30 sm:flex-shrink-0">
                              <span className="text-xs font-bold text-primary-300 uppercase tracking-wider">
                                Progress
                              </span>
                            </div>
                            <div className="flex-1 flex items-center gap-4">
                              <div className="flex-1 h-3 bg-neutral-800/80 rounded-full overflow-hidden border border-neutral-700/50">
                                <div
                                  className="h-full bg-gradient-to-r from-primary-500 to-primary-400 rounded-full transition-all duration-500"
                                  style={{ width: `${progress.percentage}%` }}
                                />
                              </div>
                              <span className="text-xl font-bold text-primary-400 min-w-[3.5rem] text-right tabular-nums">
                                {progress.percentage}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {plans.filter(p => p.archived).length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 pt-4 border-t-2 border-neutral-800">
                    <Archive className="w-5 h-5 text-neutral-500" />
                    <h3 className="text-lg font-bold text-neutral-400">Archived Plans</h3>
                  </div>
                  <div className="space-y-3">
                    {plans.filter(p => p.archived).map((plan) => {
                      const progress = calculateProgress(plan);
                      return (
                        <div
                          key={plan.id}
                          className="bg-neutral-900/30 border border-neutral-800/50 rounded-xl p-4 opacity-70 hover:opacity-100 transition-all"
                        >
                          <div className="flex flex-col sm:flex-row items-start gap-4">
                            <div className="flex items-start gap-3 flex-1 w-full">
                              <div className="flex-shrink-0">
                                <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-neutral-700/20 to-neutral-800/20 flex items-center justify-center border border-neutral-700/30">
                                  <span className="text-lg font-bold text-neutral-500">
                                    {getDistanceInKm(plan.answers.raceDistance || '')}
                                  </span>
                                </div>
                              </div>

                              <div className="flex-1 min-w-0">
                                <h3 className="text-base font-bold text-neutral-400 mb-1">
                                  {plan.answers.raceDistance || 'Training'} Training Plan
                                </h3>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                                  <p>
                                    <span className="font-semibold">Weeks:</span> {plan.plan_data.plan.length}
                                  </p>
                                  <p>
                                    Progress: {progress.percentage}%
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="flex gap-2 w-full sm:w-auto sm:flex-shrink-0">
                              <button
                                onClick={() => onLoadPlan(plan)}
                                className="btn-secondary flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 text-sm"
                              >
                                <Eye className="w-4 h-4" />
                                View
                              </button>
                              <button
                                onClick={() => handleArchiveClick(plan.id, true)}
                                className="flex items-center justify-center w-10 h-10 bg-neutral-800/50 text-neutral-500 rounded-lg hover:bg-neutral-700 hover:text-neutral-300 transition-colors border border-neutral-700/50 hover:border-neutral-600 focus:outline-none focus:ring-4 focus:ring-neutral-500/50"
                                title="Restore plan"
                                aria-label="Restore plan"
                              >
                                <ArchiveRestore className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={archiveConfirm !== null}
        onClose={() => setArchiveConfirm(null)}
        onConfirm={handleArchive}
        title={archiveConfirm?.currentlyArchived ? 'Restore Plan?' : 'Archive Plan?'}
        message={
          archiveConfirm?.currentlyArchived
            ? 'This will restore the plan to your active plans list.'
            : 'This will archive the plan. You can restore it later from the archived section.'
        }
        confirmText={archiveConfirm?.currentlyArchived ? 'Restore' : 'Archive'}
        variant="info"
      />
    </div>
  );
}
