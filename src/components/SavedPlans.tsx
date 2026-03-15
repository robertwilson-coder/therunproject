import { useEffect, useRef, useState } from 'react';
import { logger } from '../utils/logger';
import { supabase, TrainingPlan } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Archive, ArchiveRestore, Eye, LogOut } from 'lucide-react';
import { SavedPlansSkeleton } from './LoadingSkeletons';
import { NoPlansEmptyState } from './EmptyStates';
import { ConfirmDialog } from './ConfirmDialog';
import { Logo } from './Logo';
import { getTimeProgress, DEFAULT_TIMEZONE } from '../utils/trainingPlanUtils';

interface SavedPlansProps {
  onLoadPlan: (plan: TrainingPlan) => void;
  onClose: () => void;
}

export function SavedPlans({ onLoadPlan, onClose }: SavedPlansProps) {
  const { user, signOut } = useAuth();
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completionsMap, setCompletionsMap] = useState<Record<string, number>>({});
  const [archiveConfirm, setArchiveConfirm] = useState<{ planId: string; currentlyArchived: boolean } | null>(null);
  const [generatingPlans, setGeneratingPlans] = useState<Record<string, { status: string; progress: number }>>({});
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastProgressRef = useRef<Record<string, { progress: number; seenAt: number }>>({});

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  useEffect(() => {
    loadPlans();
    return () => stopPolling();
  }, [user]);

  const loadPlans = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('training_plans_with_stats')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPlans(data || []);

      if (data && data.length > 0) {
        const counts: Record<string, number> = {};
        data.forEach(plan => {
          counts[plan.id] = plan.completion_count || 0;
        });
        setCompletionsMap(counts);

        const planIds = data.map(p => p.id);
        const { data: jobs } = await supabase
          .from('plan_generation_jobs')
          .select('plan_id, status, progress')
          .in('plan_id', planIds)
          .in('status', ['pending', 'processing']);

        if (jobs && jobs.length > 0) {
          const generatingMap: Record<string, { status: string; progress: number }> = {};
          jobs.forEach(job => {
            if (job.plan_id) {
              generatingMap[job.plan_id] = { status: job.status, progress: job.progress || 0 };
            }
          });
          setGeneratingPlans(generatingMap);
          startPolling(planIds);
        } else {
          setGeneratingPlans({});
          stopPolling();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  };

  const kickJob = async (jobId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-plan-job`;
    fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jobId }),
    }).catch(() => {});
  };

  const startPolling = (planIds: string[]) => {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      const { data: jobs } = await supabase
        .from('plan_generation_jobs')
        .select('id, plan_id, status, progress')
        .in('plan_id', planIds)
        .in('status', ['pending', 'processing']);

      if (!jobs || jobs.length === 0) {
        stopPolling();
        lastProgressRef.current = {};
        setGeneratingPlans({});
        const { data } = await supabase
          .from('training_plans_with_stats')
          .select('*')
          .eq('user_id', user!.id)
          .order('created_at', { ascending: false });
        if (data) setPlans(data);
      } else {
        const generatingMap: Record<string, { status: string; progress: number }> = {};
        const now = Date.now();
        jobs.forEach(job => {
          if (job.plan_id) {
            generatingMap[job.plan_id] = { status: job.status, progress: job.progress || 0 };
          }
          if (job.id && job.status === 'processing') {
            const last = lastProgressRef.current[job.id];
            if (!last) {
              lastProgressRef.current[job.id] = { progress: job.progress || 0, seenAt: now };
            } else if (last.progress === (job.progress || 0) && now - last.seenAt > 30000) {
              lastProgressRef.current[job.id] = { progress: job.progress || 0, seenAt: now };
              kickJob(job.id);
            } else if (last.progress !== (job.progress || 0)) {
              lastProgressRef.current[job.id] = { progress: job.progress || 0, seenAt: now };
            }
          }
        });
        setGeneratingPlans(generatingMap);
      }
    }, 3000);
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

  const getDistanceColors = (raceDistance: string) => {
    const distance = raceDistance?.toLowerCase() || '';
    if (distance.includes('marathon') && !distance.includes('half')) {
      return {
        iconBg: 'bg-gradient-to-br from-rose-500/20 to-rose-600/20 dark:from-rose-500/30 dark:to-rose-600/30',
        iconBorder: 'border-rose-500/30',
        iconText: 'text-rose-600 dark:text-rose-400',
        badgeBg: 'bg-rose-500/10 dark:bg-rose-500/20',
        badgeBorder: 'border-rose-500/20 dark:border-rose-500/30',
        badgeText: 'text-rose-600 dark:text-rose-400',
        progressBar: 'from-rose-500 to-rose-400',
        progressText: 'text-rose-600 dark:text-rose-400',
      };
    }
    if (distance.includes('half')) {
      return {
        iconBg: 'bg-gradient-to-br from-orange-500/20 to-orange-600/20 dark:from-orange-500/30 dark:to-orange-600/30',
        iconBorder: 'border-orange-500/30',
        iconText: 'text-orange-600 dark:text-orange-400',
        badgeBg: 'bg-orange-500/10 dark:bg-orange-500/20',
        badgeBorder: 'border-orange-500/20 dark:border-orange-500/30',
        badgeText: 'text-orange-600 dark:text-orange-400',
        progressBar: 'from-orange-500 to-orange-400',
        progressText: 'text-orange-600 dark:text-orange-400',
      };
    }
    if (distance.includes('10 mile') || distance.includes('10mile')) {
      return {
        iconBg: 'bg-gradient-to-br from-teal-500/20 to-teal-600/20 dark:from-teal-500/30 dark:to-teal-600/30',
        iconBorder: 'border-teal-500/30',
        iconText: 'text-teal-600 dark:text-teal-400',
        badgeBg: 'bg-teal-500/10 dark:bg-teal-500/20',
        badgeBorder: 'border-teal-500/20 dark:border-teal-500/30',
        badgeText: 'text-teal-600 dark:text-teal-400',
        progressBar: 'from-teal-500 to-teal-400',
        progressText: 'text-teal-600 dark:text-teal-400',
      };
    }
    if (distance.includes('10k')) {
      return {
        iconBg: 'bg-gradient-to-br from-blue-500/20 to-blue-600/20 dark:from-blue-500/30 dark:to-blue-600/30',
        iconBorder: 'border-blue-500/30',
        iconText: 'text-blue-600 dark:text-blue-400',
        badgeBg: 'bg-blue-500/10 dark:bg-blue-500/20',
        badgeBorder: 'border-blue-500/20 dark:border-blue-500/30',
        badgeText: 'text-blue-600 dark:text-blue-400',
        progressBar: 'from-blue-500 to-blue-400',
        progressText: 'text-blue-600 dark:text-blue-400',
      };
    }
    if (distance.includes('5k')) {
      return {
        iconBg: 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 dark:from-emerald-500/30 dark:to-emerald-600/30',
        iconBorder: 'border-emerald-500/30',
        iconText: 'text-emerald-600 dark:text-emerald-400',
        badgeBg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
        badgeBorder: 'border-emerald-500/20 dark:border-emerald-500/30',
        badgeText: 'text-emerald-600 dark:text-emerald-400',
        progressBar: 'from-emerald-500 to-emerald-400',
        progressText: 'text-emerald-600 dark:text-emerald-400',
      };
    }
    return {
      iconBg: 'bg-gradient-to-br from-blue-500/20 to-blue-600/20 dark:from-blue-500/30 dark:to-blue-600/30',
      iconBorder: 'border-blue-500/30',
      iconText: 'text-blue-600 dark:text-blue-400',
      badgeBg: 'bg-blue-500/10 dark:bg-blue-500/20',
      badgeBorder: 'border-blue-500/20 dark:border-blue-500/30',
      badgeText: 'text-blue-600 dark:text-blue-400',
      progressBar: 'from-blue-500 to-blue-400',
      progressText: 'text-blue-600 dark:text-blue-400',
    };
  };

  const calculateProgress = (plan: TrainingPlan): { completed: number; total: number; percentage: number } => {
    // Use time-based progress if start_date and race_date are available
    if (plan.start_date && plan.race_date) {
      const timezone = plan.plan_data?.timezone || DEFAULT_TIMEZONE;
      const timeProgress = getTimeProgress(plan.start_date, plan.race_date, timezone);

      if (timeProgress) {
        return {
          completed: timeProgress.elapsedDays,
          total: timeProgress.totalDays,
          percentage: timeProgress.progressPercent
        };
      }
    }

    // Fallback to workout completion count if dates are not available
    let totalWorkouts = 0;
    (plan.plan_data?.plan || []).forEach(week => {
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



  return (
    <>
      <div className="max-w-6xl mx-auto px-2 md:px-6 py-6 animate-fade-in">
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={onClose}
            className="transition-all hover:scale-105 active:scale-95 hover:drop-shadow-lg"
            aria-label="Go back to home"
          >
            <Logo size="lg" />
          </button>
          <button
            onClick={signOut}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-neutral-700 dark:text-neutral-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all duration-300 border-2 border-neutral-300 dark:border-neutral-700 hover:border-red-500 dark:hover:border-red-500"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
        <div className="mb-8">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-neutral-900 dark:text-white">Your Saved Training Plans</h2>
          <p className="text-neutral-600 dark:text-neutral-400 mt-2">Manage and track your training plans</p>
        </div>
        <div>
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
            <div className="space-y-6">
              {plans.filter(p => !p.archived).length > 0 && (
                <div className="space-y-5">
                  {plans.filter(p => !p.archived).map((plan) => {
                    const progress = calculateProgress(plan);
                    const colors = getDistanceColors(plan.answers.raceDistance || '');
                    return (
                      <div key={plan.id}>
                      <div
                        className="bg-white/50 dark:bg-neutral-900/30 backdrop-blur-sm border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 md:p-6 hover:border-neutral-300 dark:hover:border-neutral-700 transition-all hover:shadow-lg"
                      >
                        <div className="flex flex-col sm:flex-row items-start gap-5 mb-5">
                          <div className="flex items-start gap-4 flex-1 w-full">
                            <div className="flex-shrink-0">
                              <div className={`w-16 h-16 md:w-20 md:h-20 rounded-xl ${colors.iconBg} flex items-center justify-center border ${colors.iconBorder}`}>
                                <span className={`text-xl md:text-2xl font-bold ${colors.iconText}`}>
                                  {getDistanceInKm(plan.answers.raceDistance || '')}
                                </span>
                              </div>
                            </div>

                            <div className="flex-1 min-w-0">
                              <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">
                                {plan.answers.raceDistance || 'Training'} Training Plan
                              </h3>
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                                <p className="text-neutral-700 dark:text-neutral-300">
                                  <span className="font-semibold">Weeks:</span> {plan.plan_data?.plan?.length ?? '—'}
                                </p>
                                <p className="text-neutral-600 dark:text-neutral-400">
                                  Created: {formatDate(plan.created_at)}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-2 w-full sm:w-auto sm:flex-shrink-0">
                            {generatingPlans[plan.id] ? (
                              <div className={`flex-1 sm:flex-initial flex items-center gap-3 px-5 py-2.5 ${colors.badgeBg} border ${colors.iconBorder} rounded-lg`}>
                                <div className="flex items-center gap-2">
                                  <div className={`w-4 h-4 border-2 ${colors.iconText} border-t-transparent rounded-full animate-spin`}></div>
                                  <span className={`text-sm font-medium ${colors.iconText}`}>
                                    Generating... {generatingPlans[plan.id].progress}%
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => onLoadPlan(plan)}
                                className="btn-primary flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5"
                                aria-label={`View ${plan.answers.raceDistance || 'Training'} training plan`}
                              >
                                <Eye className="w-4 h-4" aria-hidden="true" />
                                View
                              </button>
                            )}
                            <button
                              onClick={() => handleArchiveClick(plan.id, false)}
                              className="flex items-center justify-center w-12 h-12 sm:w-10 sm:h-10 bg-neutral-100 dark:bg-neutral-800/50 text-neutral-600 dark:text-neutral-400 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors border border-neutral-300 dark:border-neutral-700/50 hover:border-neutral-400 dark:hover:border-neutral-600 focus:outline-none"
                              aria-label="Archive plan"
                            >
                              <Archive className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </div>
                        </div>

                        <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800/50">
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                            <div className={`inline-flex items-center justify-center sm:justify-start px-3 py-1.5 rounded-lg ${colors.badgeBg} border ${colors.badgeBorder} sm:flex-shrink-0`}>
                              <span className={`text-xs font-bold ${colors.badgeText} uppercase tracking-wider`}>
                                Progress
                              </span>
                            </div>
                            <div className="flex-1 flex items-center gap-4">
                              <div
                                className="flex-1 h-3 bg-neutral-200 dark:bg-neutral-800/80 rounded-full overflow-hidden border border-neutral-300 dark:border-neutral-700/50"
                                role="progressbar"
                                aria-valuenow={progress.percentage}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label={`Training plan progress: ${progress.completed} of ${progress.total} workouts completed`}
                              >
                                <div
                                  className={`h-full bg-gradient-to-r ${colors.progressBar} rounded-full transition-all duration-500`}
                                  style={{ width: `${progress.percentage}%` }}
                                />
                              </div>
                              <span className={`text-xl font-bold ${colors.progressText} min-w-[3.5rem] text-right tabular-nums`} aria-hidden="true">
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
                <div className="space-y-4 mt-8">
                  <div className="flex items-center gap-3 pt-6 border-t border-neutral-200 dark:border-neutral-800">
                    <Archive className="w-5 h-5 text-neutral-500 dark:text-neutral-600" />
                    <h3 className="text-lg font-bold text-neutral-600 dark:text-neutral-400">Archived Plans</h3>
                  </div>
                  <div className="space-y-3">
                    {plans.filter(p => p.archived).map((plan) => {
                      const progress = calculateProgress(plan);
                      const colors = getDistanceColors(plan.answers.raceDistance || '');
                      return (
                        <div
                          key={plan.id}
                          className="bg-neutral-100/50 dark:bg-neutral-900/20 border border-neutral-200 dark:border-neutral-800/50 rounded-xl p-4 opacity-60 hover:opacity-100 transition-all"
                        >
                          <div className="flex flex-col sm:flex-row items-start gap-4">
                            <div className="flex items-start gap-3 flex-1 w-full">
                              <div className="flex-shrink-0">
                                <div className={`w-14 h-14 rounded-lg ${colors.iconBg} flex items-center justify-center border ${colors.iconBorder}`}>
                                  <span className={`text-lg font-bold ${colors.iconText}`}>
                                    {getDistanceInKm(plan.answers.raceDistance || '')}
                                  </span>
                                </div>
                              </div>

                              <div className="flex-1 min-w-0">
                                <h3 className="text-base font-bold text-neutral-600 dark:text-neutral-400 mb-1">
                                  {plan.answers.raceDistance || 'Training'} Training Plan
                                </h3>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 dark:text-neutral-600">
                                  <p>
                                    <span className="font-semibold">Weeks:</span> {plan.plan_data?.plan?.length ?? '—'}
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
                                aria-label={`View ${plan.answers.raceDistance || 'Training'} training plan`}
                              >
                                <Eye className="w-4 h-4" aria-hidden="true" />
                                View
                              </button>
                              <button
                                onClick={() => handleArchiveClick(plan.id, true)}
                                className="flex items-center justify-center w-10 h-10 bg-neutral-200 dark:bg-neutral-800/50 text-neutral-600 dark:text-neutral-500 rounded-lg hover:bg-neutral-300 dark:hover:bg-neutral-700 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors border border-neutral-300 dark:border-neutral-700/50 hover:border-neutral-400 dark:hover:border-neutral-600 focus:outline-none"
                                aria-label="Restore plan"
                              >
                                <ArchiveRestore className="w-4 h-4" aria-hidden="true" />
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
    </>
  );
}
