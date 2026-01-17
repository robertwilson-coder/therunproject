import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, Activity, Clock, Zap } from 'lucide-react';
import { AnalyticsSkeleton } from './LoadingSkeletons';
import { NoAnalyticsEmptyState } from './EmptyStates';

interface WorkoutData {
  completed_at: string;
  distance_miles: number | null;
  duration_minutes: number | null;
  week_number: number;
  day_name: string;
}

interface ProgressChartsProps {
  planId: string;
}

export function ProgressCharts({ planId }: ProgressChartsProps) {
  const [workouts, setWorkouts] = useState<WorkoutData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWorkoutData();
  }, [planId]);

  async function fetchWorkoutData() {
    setLoading(true);
    const { data, error } = await supabase
      .from('workout_completions')
      .select('completed_at, distance_miles, duration_minutes, week_number, day_name')
      .eq('plan_id', planId)
      .order('completed_at', { ascending: true });

    if (!error && data) {
      setWorkouts(data);
    }
    setLoading(false);
  }

  if (loading) return <AnalyticsSkeleton />;
  if (workouts.length === 0) return <NoAnalyticsEmptyState />;

  const totalDistance = workouts.reduce((sum, w) => sum + (w.distance_miles || 0), 0);
  const totalDuration = workouts.reduce((sum, w) => sum + (w.duration_minutes || 0), 0);
  const avgPace = totalDistance > 0 && totalDuration > 0
    ? totalDuration / totalDistance
    : 0;

  const weeklyData = workouts.reduce((acc, workout) => {
    const week = workout.week_number;
    if (!acc[week]) {
      acc[week] = { distance: 0, duration: 0, count: 0 };
    }
    acc[week].distance += workout.distance_miles || 0;
    acc[week].duration += workout.duration_minutes || 0;
    acc[week].count += 1;
    return acc;
  }, {} as Record<number, { distance: number; duration: number; count: number }>);

  const weeks = Object.keys(weeklyData).map(Number).sort((a, b) => a - b);
  const maxDistance = Math.max(...weeks.map(w => weeklyData[w].distance));
  const maxDuration = Math.max(...weeks.map(w => weeklyData[w].duration));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-md">
              <Activity className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Total Distance</span>
          </div>
          <p className="text-3xl font-bold text-neutral-900 dark:text-white">{totalDistance.toFixed(1)} mi</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">{workouts.length} workouts</p>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-md">
              <Clock className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Total Time</span>
          </div>
          <p className="text-3xl font-bold text-neutral-900 dark:text-white">{Math.floor(totalDuration / 60)}h {(totalDuration % 60).toFixed(0)}m</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">{totalDuration.toFixed(0)} minutes</p>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-md">
              <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Avg Pace</span>
          </div>
          <p className="text-3xl font-bold text-neutral-900 dark:text-white">
            {avgPace > 0 ? `${Math.floor(avgPace)}:${((avgPace % 1) * 60).toFixed(0).padStart(2, '0')}/mi` : 'N/A'}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">Average pace</p>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary-500" />
          Weekly Distance Progress
        </h3>
        <div className="space-y-3">
          {weeks.map(week => {
            const data = weeklyData[week];
            const barWidth = (data.distance / maxDistance) * 100;
            return (
              <div key={week} className="flex items-center gap-4">
                <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400 w-16">Week {week}</span>
                <div className="flex-1 bg-neutral-100 dark:bg-neutral-800 rounded-full h-8 overflow-hidden relative">
                  <div
                    className="bg-gradient-to-r from-primary-500 to-primary-600 h-full flex items-center justify-end pr-3 rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(barWidth, 5)}%` }}
                  >
                    <span className="text-xs font-bold text-white">{data.distance.toFixed(1)} mi</span>
                  </div>
                </div>
                <span className="text-xs text-neutral-500 dark:text-neutral-500 w-20">{data.count} workouts</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-green-500" />
          Weekly Duration Progress
        </h3>
        <div className="space-y-3">
          {weeks.map(week => {
            const data = weeklyData[week];
            const barWidth = (data.duration / maxDuration) * 100;
            const hours = Math.floor(data.duration / 60);
            const minutes = Math.round(data.duration % 60);
            return (
              <div key={week} className="flex items-center gap-4">
                <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400 w-16">Week {week}</span>
                <div className="flex-1 bg-neutral-100 dark:bg-neutral-800 rounded-full h-8 overflow-hidden relative">
                  <div
                    className="bg-gradient-to-r from-green-500 to-green-600 h-full flex items-center justify-end pr-3 rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(barWidth, 5)}%` }}
                  >
                    <span className="text-xs font-bold text-white">
                      {hours}h {minutes}m
                    </span>
                  </div>
                </div>
                <span className="text-xs text-neutral-500 dark:text-neutral-500 w-20">{data.count} workouts</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
