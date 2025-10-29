import { useState, useEffect } from 'react';
import { TrendingUp, Activity, Calendar, Award, Target, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface PerformanceAnalyticsProps {
  planId: string;
  onClose: () => void;
}

interface WorkoutCompletion {
  week_number: number;
  day_name: string;
  completed_at: string;
  rating: number | null;
  distance_miles: number | null;
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
      console.error('Error loading completions:', error);
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
    const thisWeek = new Date();
    const weekAgo = new Date(thisWeek.getTime() - 7 * 24 * 60 * 60 * 1000);

    const thisWeekCompletions = completions.filter(
      c => new Date(c.completed_at) >= weekAgo
    );
    const thisWeekCount = thisWeekCompletions.length;

    const avgRating = completions
      .filter(c => c.rating)
      .reduce((sum, c) => sum + (c.rating || 0), 0) / completions.filter(c => c.rating).length || 0;

    const totalDistance = completions
      .filter(c => c.distance_miles)
      .reduce((sum, c) => sum + (c.distance_miles || 0) * 1.60934, 0);

    const totalDuration = completions
      .filter(c => c.duration_minutes)
      .reduce((sum, c) => sum + (c.duration_minutes || 0), 0);

    const thisWeekDistance = thisWeekCompletions
      .filter(c => c.distance_miles)
      .reduce((sum, c) => sum + (c.distance_miles || 0) * 1.60934, 0);

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
      if (completion.distance_miles) {
        weeklyStats[completion.week_number].distance += completion.distance_miles * 1.60934;
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
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 to-gray-800 bg-opacity-95 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 sticky top-0 bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-russian-violet flex items-center gap-2">
              <TrendingUp className="w-6 h-6" />
              Performance Analytics
            </h2>
            <button
              onClick={onClose}
              className="text-russian-violet hover:text-raspberry transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-bittersweet mx-auto"></div>
              <p className="mt-4 text-russian-violet text-opacity-70">Loading analytics...</p>
            </div>
          ) : completions.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="w-16 h-16 text-raspberry mx-auto mb-4 opacity-50" />
              <p className="text-russian-violet text-lg">No workouts completed yet</p>
              <p className="text-russian-violet text-opacity-60 text-sm mt-2">
                Start completing workouts to see your performance analytics
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Award className="w-5 h-5 text-green-700" />
                    <h3 className="font-semibold text-russian-violet text-sm">Completed</h3>
                  </div>
                  <p className="text-2xl font-bold text-green-700">{stats.total}</p>
                  <p className="text-xs text-russian-violet text-opacity-60 mt-1">workouts</p>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-5 h-5 text-blue-700" />
                    <h3 className="font-semibold text-russian-violet text-sm">This Week</h3>
                  </div>
                  <p className="text-2xl font-bold text-blue-700">{stats.thisWeekCount}</p>
                  <p className="text-xs text-russian-violet text-opacity-60 mt-1">workouts</p>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-5 h-5 text-purple-700" />
                    <h3 className="font-semibold text-russian-violet text-sm">Total Distance</h3>
                  </div>
                  <p className="text-2xl font-bold text-purple-700">
                    {stats.totalDistance > 0 ? stats.totalDistance.toFixed(1) : '0'}
                  </p>
                  <p className="text-xs text-russian-violet text-opacity-60 mt-1">km</p>
                </div>

                <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="w-5 h-5 text-orange-700" />
                    <h3 className="font-semibold text-russian-violet text-sm">Avg RPE</h3>
                  </div>
                  <p className="text-2xl font-bold text-orange-700">
                    {stats.avgRating > 0 ? stats.avgRating.toFixed(1) : 'N/A'}
                  </p>
                  <p className="text-xs text-russian-violet text-opacity-60 mt-1">out of 10</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-lg p-6 border border-cyan-200">
                  <h3 className="font-semibold text-russian-violet mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    This Week's Progress
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-white text-opacity-70">Distance</p>
                      <p className="text-2xl font-bold text-brand-blue">
                        {stats.thisWeekDistance.toFixed(1)} km
                      </p>
                    </div>
                    {stats.thisWeekDuration > 0 && (
                      <div>
                        <p className="text-sm text-white text-opacity-70">Time</p>
                        <p className="text-2xl font-bold text-brand-blue">
                          {Math.floor(stats.thisWeekDuration / 60)}h {Math.round(stats.thisWeekDuration % 60)}m
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-pink-50 to-pink-100 rounded-lg p-6 border border-pink-200">
                  <h3 className="font-semibold text-russian-violet mb-4 flex items-center gap-2">
                    <Award className="w-5 h-5" />
                    Total Progress
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm text-russian-violet text-opacity-70">Distance</p>
                      <p className="text-2xl font-bold text-pink-700">
                        {stats.totalDistance.toFixed(1)} km
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-russian-violet text-opacity-70">Time</p>
                      <p className="text-2xl font-bold text-pink-700">
                        {Math.floor(stats.totalDuration / 60)}h {Math.round(stats.totalDuration % 60)}m
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border-2 border-sunset rounded-lg p-6">
                <h3 className="text-xl font-bold text-russian-violet mb-4 flex items-center gap-2">
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
                          <span className="font-semibold text-russian-violet">Week {weekNum}</span>
                          <div className="flex gap-4 text-xs text-russian-violet text-opacity-70">
                            {weekStats.distance > 0 && (
                              <span>{weekStats.distance.toFixed(1)} km</span>
                            )}
                            {weekStats.duration > 0 && (
                              <span>{Math.floor(weekStats.duration / 60)}h {Math.round(weekStats.duration % 60)}m</span>
                            )}
                            <span>{data.completed}/{data.total} ({percentage.toFixed(0)}%)</span>
                          </div>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              percentage >= 80
                                ? 'bg-green-600'
                                : percentage >= 50
                                ? 'bg-yellow-600'
                                : 'bg-red-600'
                            }`}
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-lg p-6">
                <h3 className="text-xl font-bold text-russian-violet mb-4">Recent Activity</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {completions.slice(-10).reverse().map((completion, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2 px-3 bg-white rounded-lg border border-gray-200"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                        <span className="font-medium text-russian-violet">
                          Week {completion.week_number} - {completion.day_name}
                        </span>
                      </div>
                      <span className="text-sm text-russian-violet text-opacity-60">
                        {new Date(completion.completed_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-russian-violet">
                  <span className="font-semibold">Pro Tip:</span> Consistency is key to improving your running performance.
                  Aim to complete at least 80% of your scheduled workouts each week for optimal results.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
