import { useState, useEffect } from 'react';
import { logger } from '../utils/logger';
import { TrendingUp, Activity, Calendar, Award, Target, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getCurrentCalendarWeek } from '../utils/dateUtils';

interface PerformanceAnalyticsProps {
  planId: string;
  onClose: () => void;
}

interface WorkoutCompletion {
  week_number: number;
  day_name: string;
  completed_at: string;
  scheduled_date?: string | null;
  rating: number | null;
  distance_km: number | null;
  duration_minutes: number | null;
}

export function PerformanceAnalytics({ planId, onClose }: PerformanceAnalyticsProps) {
  const { user } = useAuth();
  const [completions, setCompletions] = useState<WorkoutCompletion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCompletions();
  }, [planId]);

  const loadCompletions = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('workout_completions')
        .select('*')
        .eq('training_plan_id', planId)
        .order('completed_at', { ascending: true });

      if (error) throw error;
      setCompletions(data || []);
    } catch (error) {
      logger.error('Error loading completions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getWeeklyCompletionRate = () => {
    const weeklyData: { [key: number]: { completed: number; total: number } } = {};

    completions.forEach((completion) => {
      if (!weeklyData[completion.week_number]) {
        weeklyData[completion.week_number] = { completed: 0, total: 7 };
      }
      weeklyData[completion.week_number].completed++;
    });

    return weeklyData;
  };

  const getTotalStats = () => {
    const total = completions.length;
    const calendarWeek = getCurrentCalendarWeek();

    const thisWeekCompletions = completions.filter(c => {
      // Use scheduled_date if available, otherwise fall back to completed_at
      if (c.scheduled_date) {
        const scheduledDate = new Date(c.scheduled_date + 'T00:00:00');
        return scheduledDate >= calendarWeek.start && scheduledDate <= calendarWeek.end;
      }
      const completedAt = new Date(c.completed_at);
      return completedAt >= calendarWeek.start && completedAt <= calendarWeek.end;
    });
    const thisWeekCount = thisWeekCompletions.length;

    const avgRating = completions
      .filter(c => c.rating)
      .reduce((sum, c) => sum + (c.rating || 0), 0) / completions.filter(c => c.rating).length || 0;

    const totalDistance = completions
      .filter(c => c.distance_km)
      .reduce((sum, c) => sum + (c.distance_km || 0), 0);

    const totalDuration = completions
      .filter(c => c.duration_minutes)
      .reduce((sum, c) => sum + (c.duration_minutes || 0), 0);

    const thisWeekDistance = thisWeekCompletions
      .filter(c => c.distance_km)
      .reduce((sum, c) => sum + (c.distance_km || 0), 0);

    const thisWeekDuration = thisWeekCompletions
      .filter(c => c.duration_minutes)
      .reduce((sum, c) => sum + (c.duration_minutes || 0), 0);

    return {
      total,
      thisWeekCount,
      avgRating,
      totalDistance,
      totalDuration,
      thisWeekDistance,
      thisWeekDuration
    };
  };

  const getWeeklyStats = () => {
    const weeklyStats: { [key: number]: { distance: number; duration: number } } = {};

    completions.forEach((completion) => {
      if (!weeklyStats[completion.week_number]) {
        weeklyStats[completion.week_number] = { distance: 0, duration: 0 };
      }
      if (completion.distance_km) {
        weeklyStats[completion.week_number].distance += completion.distance_km;
      }
      if (completion.duration_minutes) {
        weeklyStats[completion.week_number].duration += completion.duration_minutes;
      }
    });

    return weeklyStats;
  };

  const weeklyData = getWeeklyCompletionRate();
  const stats = getTotalStats();
  const weeklyStats = getWeeklyStats();
  const weeks = Object.keys(weeklyData).map(Number).sort((a, b) => a - b);

  return (
    <div className="fixed inset-0 bg-black/70 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-neutral-800 sticky top-0 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-6 h-6" />
              Performance Analytics
            </h2>
            <button
              onClick={onClose}
              className="text-gray-600 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
              <p className="mt-4 text-gray-600 dark:text-neutral-400">Loading analytics...</p>
            </div>
          ) : completions.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="w-16 h-16 text-gray-400 dark:text-neutral-600 mx-auto mb-4 opacity-50" />
              <p className="text-gray-900 dark:text-white text-lg">No workouts completed yet</p>
              <p className="text-gray-600 dark:text-neutral-400 text-sm mt-2">
                Start completing workouts to see your performance analytics
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-500/10 dark:to-green-600/10 rounded-lg p-4 border border-green-200 dark:border-green-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Award className="w-5 h-5 text-green-700 dark:text-green-400" />
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Completed</h3>
                  </div>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-400">{stats.total}</p>
                  <p className="text-xs text-gray-600 dark:text-neutral-400 mt-1">workouts</p>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-500/10 dark:to-blue-600/10 rounded-lg p-4 border border-blue-200 dark:border-blue-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-5 h-5 text-blue-700 dark:text-blue-400" />
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm">This Week</h3>
                  </div>
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{stats.thisWeekCount}</p>
                  <p className="text-xs text-gray-600 dark:text-neutral-400 mt-1">workouts</p>
                </div>

                <div className="bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-500/10 dark:to-teal-600/10 rounded-lg p-4 border border-teal-200 dark:border-teal-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-5 h-5 text-teal-700 dark:text-teal-400" />
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Total Distance</h3>
                  </div>
                  <p className="text-2xl font-bold text-teal-700 dark:text-teal-400">
                    {stats.totalDistance > 0 ? stats.totalDistance.toFixed(1) : '0'}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-neutral-400 mt-1">km</p>
                </div>

                <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-500/10 dark:to-orange-600/10 rounded-lg p-4 border border-orange-200 dark:border-orange-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-5 h-5 text-orange-700 dark:text-orange-400" />
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Avg RPE</h3>
                  </div>
                  <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">
                    {stats.avgRating > 0 ? stats.avgRating.toFixed(1) : 'N/A'}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-neutral-400 mt-1">out of 10</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-500/10 dark:to-cyan-600/10 rounded-lg p-6 border border-cyan-200 dark:border-cyan-500/30">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    This Week's Progress
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-neutral-400">Distance</p>
                      <p className="text-2xl font-bold text-cyan-700 dark:text-cyan-400">
                        {stats.thisWeekDistance.toFixed(1)} km
                      </p>
                    </div>
                    {stats.thisWeekDuration > 0 && (
                      <div>
                        <p className="text-sm text-gray-600 dark:text-neutral-400">Time</p>
                        <p className="text-2xl font-bold text-cyan-700 dark:text-cyan-400">
                          {Math.floor(stats.thisWeekDuration / 60)}h {Math.round(stats.thisWeekDuration % 60)}m
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-500/10 dark:to-pink-600/10 rounded-lg p-6 border border-pink-200 dark:border-pink-500/30">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Award className="w-5 h-5" />
                    Total Progress
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-neutral-400">Distance</p>
                      <p className="text-2xl font-bold text-pink-700 dark:text-pink-400">
                        {stats.totalDistance.toFixed(1)} km
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 dark:text-neutral-400">Time</p>
                      <p className="text-2xl font-bold text-pink-700 dark:text-pink-400">
                        {Math.floor(stats.totalDuration / 60)}h {Math.round(stats.totalDuration % 60)}m
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-neutral-800 border-2 border-gray-200 dark:border-neutral-700 rounded-lg p-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5" />
                  Weekly Stats
                </h3>
                <div className="space-y-4">
                  {weeks.map((weekNum) => {
                    const data = weeklyData[weekNum];
                    const weekStats = weeklyStats[weekNum] || { distance: 0, duration: 0 };
                    const percentage = (data.completed / data.total) * 100;
                    return (
                      <div key={weekNum} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-semibold text-gray-900 dark:text-white">Week {weekNum}</span>
                          <div className="flex gap-4 text-xs text-gray-600 dark:text-neutral-400">
                            {weekStats.distance > 0 && (
                              <span>{weekStats.distance.toFixed(1)} km</span>
                            )}
                            {weekStats.duration > 0 && (
                              <span>{Math.floor(weekStats.duration / 60)}h {Math.round(weekStats.duration % 60)}m</span>
                            )}
                            <span>{data.completed}/{data.total} ({percentage.toFixed(0)}%)</span>
                          </div>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-neutral-700 rounded-full h-3 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              percentage >= 80
                                ? 'bg-green-600 dark:bg-green-500'
                                : percentage >= 50
                                ? 'bg-yellow-600 dark:bg-yellow-500'
                                : 'bg-red-600 dark:bg-red-500'
                            }`}
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-gradient-to-br from-primary-50 to-accent-50 dark:from-primary-500/10 dark:to-accent-500/10 border-2 border-primary-200 dark:border-primary-500/30 rounded-lg p-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Recent Activity</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {completions.slice(-10).reverse().map((completion, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2 px-3 bg-white dark:bg-neutral-800 rounded-lg border border-gray-200 dark:border-neutral-700"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-green-600 dark:bg-green-500 rounded-full"></div>
                        <span className="font-medium text-gray-900 dark:text-white">
                          Week {completion.week_number} - {completion.day_name}
                        </span>
                      </div>
                      <span className="text-sm text-gray-600 dark:text-neutral-400">
                        {new Date(completion.completed_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg p-4">
                <p className="text-sm text-gray-900 dark:text-white">
                  <span className="font-semibold">Pro Tip:</span> Consistency is key to improving your running performance.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
