import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Users, TrendingUp, Activity, Calendar, Award, RefreshCw } from 'lucide-react';

interface UserStats {
  user_id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  total_plans_created: number;
  workouts_completed: number;
  last_workout_completion: string | null;
  workouts_last_7_days: number;
  workouts_last_30_days: number;
}

interface OverallStats {
  total_users: number;
  users_with_plans: number;
  users_with_completions: number;
  total_workouts_completed: number;
  total_plans_created: number;
  avg_workout_rating: string;
}

interface DailyActivity {
  date: string;
  workouts: number;
  new_users: number;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function AdminDashboard() {
  const { user } = useAuth();
  const [userStats, setUserStats] = useState<UserStats[]>([]);
  const [overallStats, setOverallStats] = useState<OverallStats | null>(null);
  const [dailyActivity, setDailyActivity] = useState<DailyActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null);

  const ADMIN_EMAILS = ['rob1wilson@hotmail.com'];

  useEffect(() => {
    if (user?.email && ADMIN_EMAILS.includes(user.email)) {
      setIsAdmin(true);
      loadDashboardData();
    } else {
      setLoading(false);
    }
  }, [user]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No session found');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-admin-stats`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch admin stats: ${response.statusText}`);
      }

      const data = await response.json();
      setUserStats(data.userStats || []);
      setOverallStats(data.overallStats || null);
      setDailyActivity(data.dailyActivity || []);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const backfillWorkoutData = async () => {
    if (!confirm('This will backfill missing distance and duration data for all existing workout completions. Continue?')) {
      return;
    }

    setBackfilling(true);
    setBackfillMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No session found');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/backfill-workout-data`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Backfill failed: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success) {
        setBackfillMessage(
          `Backfill complete! Updated ${result.stats.updated} workouts, skipped ${result.stats.skipped}`
        );
      } else {
        setBackfillMessage(`Backfill failed: ${result.error}`);
      }

      // Refresh the dashboard data
      await loadDashboardData();
    } catch (error) {
      console.error('Backfill error:', error);
      setBackfillMessage(`Error: ${error.message}`);
    } finally {
      setBackfilling(false);
    }
  };


  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Access Denied</h1>
          <p className="text-slate-600 dark:text-slate-400">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const engagementData = [
    { name: 'Total Users', value: overallStats?.total_users || 0, color: COLORS[0] },
    { name: 'Created Plans', value: overallStats?.users_with_plans || 0, color: COLORS[1] },
    { name: 'Completed Workouts', value: overallStats?.users_with_completions || 0, color: COLORS[2] },
  ];

  const conversionRate = overallStats
    ? ((overallStats.users_with_completions / overallStats.total_users) * 100).toFixed(1)
    : '0';

  const activeUsers = userStats.filter(u => u.workouts_last_7_days > 0).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Admin Dashboard</h1>
            <p className="text-slate-600 dark:text-slate-400">User engagement and platform metrics</p>
            {backfillMessage && (
              <p className={`text-sm mt-2 ${backfillMessage.includes('Error') ? 'text-red-500' : 'text-green-500'}`}>
                {backfillMessage}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={backfillWorkoutData}
              disabled={backfilling}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Activity size={18} />
              {backfilling ? 'Backfilling...' : 'Backfill Data'}
            </button>
            <button
              onClick={loadDashboardData}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <RefreshCw size={18} />
              Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <Users className="text-blue-600" size={24} />
              <span className="text-2xl font-bold text-slate-900 dark:text-white">{overallStats?.total_users}</span>
            </div>
            <p className="text-slate-600 dark:text-slate-400 text-sm">Total Users</p>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">{activeUsers} active this week</p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <Calendar className="text-green-600" size={24} />
              <span className="text-2xl font-bold text-slate-900 dark:text-white">{overallStats?.total_plans_created}</span>
            </div>
            <p className="text-slate-600 dark:text-slate-400 text-sm">Plans Created</p>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">{overallStats?.users_with_plans} users</p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <Activity className="text-orange-600" size={24} />
              <span className="text-2xl font-bold text-slate-900 dark:text-white">{overallStats?.total_workouts_completed}</span>
            </div>
            <p className="text-slate-600 dark:text-slate-400 text-sm">Workouts Completed</p>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">{overallStats?.users_with_completions} users</p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="text-purple-600" size={24} />
              <span className="text-2xl font-bold text-slate-900 dark:text-white">{conversionRate}%</span>
            </div>
            <p className="text-slate-600 dark:text-slate-400 text-sm">Conversion Rate</p>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">RPE: {overallStats?.avg_workout_rating}/10</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-lg">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">User Engagement Funnel</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={engagementData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-lg">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">30-Day Activity</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyActivity}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={(date) => new Date(date).getDate().toString()} />
                <YAxis />
                <Tooltip labelFormatter={(date) => new Date(date).toLocaleDateString()} />
                <Legend />
                <Line type="monotone" dataKey="workouts" stroke="#3b82f6" name="Workouts" />
                <Line type="monotone" dataKey="new_users" stroke="#10b981" name="New Users" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg overflow-hidden">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">User Activity</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Plans</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Workouts</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">7 Days</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">30 Days</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Last Activity</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {userStats.map((user, index) => {
                  const lastActivity = user.last_workout_completion
                    ? new Date(user.last_workout_completion)
                    : null;
                  const daysSinceActivity = lastActivity
                    ? Math.floor((new Date().getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
                    : null;

                  let statusColor = 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
                  let statusText = 'Inactive';

                  if (user.workouts_last_7_days > 0) {
                    statusColor = 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
                    statusText = 'Active';
                  } else if (user.workouts_last_30_days > 0) {
                    statusColor = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
                    statusText = 'Recent';
                  } else if (user.workouts_completed === 0) {
                    statusColor = 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
                    statusText = 'No Activity';
                  }

                  return (
                    <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-700">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-slate-900 dark:text-white">{user.display_name || 'Unknown'}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{user.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-white">{user.total_plans_created}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-white">{user.workouts_completed}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-white">{user.workouts_last_7_days}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-white">{user.workouts_last_30_days}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                        {lastActivity ? (
                          <>
                            {lastActivity.toLocaleDateString()}
                            <span className="text-xs ml-1">({daysSinceActivity}d ago)</span>
                          </>
                        ) : (
                          'Never'
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColor}`}>
                          {statusText}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
