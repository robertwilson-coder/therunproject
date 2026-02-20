import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, Activity, Clock, Zap } from 'lucide-react';
import { AnalyticsSkeleton } from './LoadingSkeletons';
import { NoAnalyticsEmptyState } from './EmptyStates';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';

interface WorkoutData {
  completed_at: string;
  distance_km: number | null;
  duration_minutes: number | null;
  week_number: number;
  day_name: string;
}

interface ProgressChartsProps {
  planId: string;
}

export function ProgressCharts({ planId }: ProgressChartsProps) {
  const [planWorkouts, setPlanWorkouts] = useState<WorkoutData[]>([]);
  const [allTimeWorkouts, setAllTimeWorkouts] = useState<WorkoutData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllTime, setShowAllTime] = useState(false);

  useEffect(() => {
    fetchWorkoutData();
  }, [planId]);

  async function fetchWorkoutData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data: planData, error: planError } = await supabase
      .from('workout_completions')
      .select('completed_at, distance_km, duration_minutes, week_number, day_name')
      .eq('training_plan_id', planId)
      .order('completed_at', { ascending: true });

    const { data: allData, error: allError } = await supabase
      .from('workout_completions')
      .select('completed_at, distance_km, duration_minutes, week_number, day_name')
      .eq('user_id', user.id)
      .order('completed_at', { ascending: true });

    if (!planError && planData) {
      setPlanWorkouts(planData);
    }

    if (!allError && allData) {
      setAllTimeWorkouts(allData);
    }

    setLoading(false);
  }

  if (loading) return <AnalyticsSkeleton />;

  const workouts = showAllTime ? allTimeWorkouts : planWorkouts;
  const hasAllTimeData = allTimeWorkouts.length > 0;
  const hasPlanData = planWorkouts.length > 0;

  if (!hasAllTimeData) return <NoAnalyticsEmptyState />;

  if (!hasPlanData && !showAllTime) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <div className="p-4 bg-neutral-100 dark:bg-neutral-800 rounded-full mb-4">
          <TrendingUp className="w-12 h-12 text-neutral-400" />
        </div>
        <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">
          No Data for This Plan Yet
        </h3>
        <p className="text-neutral-600 dark:text-neutral-400 text-center mb-4 max-w-md">
          You haven't completed any workouts from this plan yet. Complete your first workout to see your progress here!
        </p>
        {hasAllTimeData && (
          <button
            onClick={() => setShowAllTime(true)}
            className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-medium transition-colors"
          >
            View All-Time Progress ({allTimeWorkouts.length} workouts)
          </button>
        )}
      </div>
    );
  }

  const totalDistance = workouts.reduce((sum, w) => sum + (w.distance_km || 0), 0);
  const totalDuration = workouts.reduce((sum, w) => sum + (w.duration_minutes || 0), 0);
  const avgPace = totalDistance > 0 && totalDuration > 0
    ? totalDuration / totalDistance
    : 0;

  const weeklyData = workouts.reduce((acc, workout) => {
    const week = workout.week_number;
    if (!acc[week]) {
      acc[week] = { distance: 0, duration: 0, count: 0 };
    }
    acc[week].distance += workout.distance_km || 0;
    acc[week].duration += workout.duration_minutes || 0;
    acc[week].count += 1;
    return acc;
  }, {} as Record<number, { distance: number; duration: number; count: number }>);

  const weeks = Object.keys(weeklyData).map(Number).sort((a, b) => a - b);
  const maxDistance = Math.max(...weeks.map(w => weeklyData[w].distance));
  const maxDuration = Math.max(...weeks.map(w => weeklyData[w].duration));

  return (
    <div className="space-y-6">
      {hasAllTimeData && hasPlanData && (
        <div className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <TrendingUp className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <p className="font-semibold text-neutral-900 dark:text-white">
                {showAllTime ? 'All-Time Progress' : 'Current Plan Progress'}
              </p>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {showAllTime
                  ? `Viewing ${allTimeWorkouts.length} workouts across all plans`
                  : `Viewing ${planWorkouts.length} workouts from this plan`
                }
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAllTime(!showAllTime)}
            className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-medium transition-colors"
          >
            {showAllTime ? 'Show Current Plan' : 'Show All-Time'}
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-md">
              <Activity className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Total Distance</span>
          </div>
          <p className="text-3xl font-bold text-neutral-900 dark:text-white">{totalDistance.toFixed(1)} km</p>
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
            {avgPace > 0 ? `${Math.floor(avgPace)}:${((avgPace % 1) * 60).toFixed(0).padStart(2, '0')}/km` : 'N/A'}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">Average pace</p>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-6 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary-500" />
          Weekly Training Volume
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={weeks.map(week => ({
            week: `W${week}`,
            distance: parseFloat(weeklyData[week].distance.toFixed(1)),
            workouts: weeklyData[week].count
          }))}>
            <defs>
              <linearGradient id="colorDistance" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="rgb(59, 130, 246)" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="rgb(59, 130, 246)" stopOpacity={0.1}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(156, 163, 175, 0.2)" />
            <XAxis
              dataKey="week"
              stroke="rgb(156, 163, 175)"
              style={{ fontSize: '12px' }}
            />
            <YAxis
              stroke="rgb(156, 163, 175)"
              style={{ fontSize: '12px' }}
              label={{ value: 'Kilometers', angle: -90, position: 'insideLeft', style: { fill: 'rgb(156, 163, 175)' } }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid rgb(229, 231, 235)',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
              labelStyle={{ color: 'rgb(17, 24, 39)', fontWeight: 'bold' }}
              formatter={(value: number, name: string) => {
                if (name === 'distance') return [`${value} km`, 'Distance'];
                if (name === 'workouts') return [value, 'Workouts'];
                return [value, name];
              }}
            />
            <Area
              type="monotone"
              dataKey="distance"
              stroke="rgb(59, 130, 246)"
              strokeWidth={2}
              fill="url(#colorDistance)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-6 flex items-center gap-2">
          <Clock className="w-5 h-5 text-green-500" />
          Weekly Training Duration
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={weeks.map(week => {
            const data = weeklyData[week];
            return {
              week: `W${week}`,
              duration: parseFloat((data.duration / 60).toFixed(1)),
              workouts: data.count
            };
          })}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(156, 163, 175, 0.2)" />
            <XAxis
              dataKey="week"
              stroke="rgb(156, 163, 175)"
              style={{ fontSize: '12px' }}
            />
            <YAxis
              stroke="rgb(156, 163, 175)"
              style={{ fontSize: '12px' }}
              label={{ value: 'Hours', angle: -90, position: 'insideLeft', style: { fill: 'rgb(156, 163, 175)' } }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                border: '1px solid rgb(229, 231, 235)',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}
              labelStyle={{ color: 'rgb(17, 24, 39)', fontWeight: 'bold' }}
              formatter={(value: number, name: string) => {
                if (name === 'duration') return [`${value}h`, 'Duration'];
                if (name === 'workouts') return [value, 'Workouts'];
                return [value, name];
              }}
            />
            <Bar dataKey="duration" fill="rgb(34, 197, 94)" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {workouts.length > 3 && (
        <div className="card p-6">
          <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-6 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            Pace Trend
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={workouts
              .filter(w => w.distance_km && w.distance_km > 0 && w.duration_minutes && w.duration_minutes > 0)
              .map((w, idx) => ({
                workout: idx + 1,
                pace: parseFloat((w.duration_minutes! / w.distance_km!).toFixed(2)),
                week: w.week_number
              }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(156, 163, 175, 0.2)" />
              <XAxis
                dataKey="workout"
                stroke="rgb(156, 163, 175)"
                style={{ fontSize: '12px' }}
                label={{ value: 'Workout #', position: 'insideBottom', offset: -5, style: { fill: 'rgb(156, 163, 175)' } }}
              />
              <YAxis
                stroke="rgb(156, 163, 175)"
                style={{ fontSize: '12px' }}
                label={{ value: 'Pace (min/km)', angle: -90, position: 'insideLeft', style: { fill: 'rgb(156, 163, 175)' } }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid rgb(229, 231, 235)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
                labelStyle={{ color: 'rgb(17, 24, 39)', fontWeight: 'bold' }}
                formatter={(value: number) => {
                  const minutes = Math.floor(value);
                  const seconds = Math.round((value - minutes) * 60);
                  return [`${minutes}:${seconds.toString().padStart(2, '0')}/km`, 'Pace'];
                }}
              />
              <Line
                type="monotone"
                dataKey="pace"
                stroke="rgb(245, 158, 11)"
                strokeWidth={2}
                dot={{ fill: 'rgb(245, 158, 11)', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
