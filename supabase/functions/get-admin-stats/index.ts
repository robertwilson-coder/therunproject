import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify the requesting user is an admin
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ADMIN_EMAILS = ['rob1wilson@hotmail.com'];
    if (!ADMIN_EMAILS.includes(user.email || '')) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all users from auth
    const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();

    if (usersError) {
      throw usersError;
    }

    // Get user profiles
    const { data: profiles } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id, display_name');

    const profileMap = new Map(profiles?.map(p => [p.user_id, p.display_name]) || []);

    // Get training plans
    const { data: plans } = await supabaseAdmin
      .from('training_plans')
      .select('user_id, id');

    // Get workout completions
    const { data: completions } = await supabaseAdmin
      .from('workout_completions')
      .select('user_id, completed_at, rating, training_plan_id');

    // Calculate stats per user
    const userStatsMap = new Map<string, UserStats>();
    const now = new Date();

    // Initialize all users
    users.forEach(u => {
      userStatsMap.set(u.id, {
        user_id: u.id,
        email: u.email || 'Unknown',
        display_name: profileMap.get(u.id) || u.email?.split('@')[0] || 'Unknown',
        created_at: u.created_at,
        total_plans_created: 0,
        workouts_completed: 0,
        last_workout_completion: null,
        workouts_last_7_days: 0,
        workouts_last_30_days: 0,
      });
    });

    // Count plans per user
    plans?.forEach(plan => {
      const stats = userStatsMap.get(plan.user_id);
      if (stats) {
        stats.total_plans_created++;
      }
    });

    // Process completions
    completions?.forEach(completion => {
      const stats = userStatsMap.get(completion.user_id);
      if (!stats) return;

      stats.workouts_completed++;

      const completedDate = new Date(completion.completed_at);
      const daysDiff = (now.getTime() - completedDate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysDiff <= 7) stats.workouts_last_7_days++;
      if (daysDiff <= 30) stats.workouts_last_30_days++;

      if (!stats.last_workout_completion || completedDate > new Date(stats.last_workout_completion)) {
        stats.last_workout_completion = completion.completed_at;
      }
    });

    const userStats = Array.from(userStatsMap.values()).sort((a, b) => b.workouts_completed - a.workouts_completed);

    // Calculate overall stats
    const usersWithPlans = new Set(plans?.map(p => p.user_id) || []);
    const usersWithCompletions = new Set(completions?.map(c => c.user_id) || []);
    const avgRating = completions && completions.length > 0
      ? completions.reduce((sum, c) => sum + (c.rating || 0), 0) / completions.length
      : 0;

    const overallStats = {
      total_users: users.length,
      users_with_plans: usersWithPlans.size,
      users_with_completions: usersWithCompletions.size,
      total_workouts_completed: completions?.length || 0,
      total_plans_created: plans?.length || 0,
      avg_workout_rating: avgRating.toFixed(1),
    };

    // Calculate daily activity for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const activityMap = new Map<string, { date: string; workouts: number; new_users: number }>();

    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      activityMap.set(dateStr, { date: dateStr, workouts: 0, new_users: 0 });
    }

    completions?.forEach(workout => {
      const dateStr = workout.completed_at.split('T')[0];
      const activity = activityMap.get(dateStr);
      if (activity) {
        activity.workouts++;
      }
    });

    users.forEach(user => {
      const dateStr = user.created_at.split('T')[0];
      const activity = activityMap.get(dateStr);
      if (activity) {
        activity.new_users++;
      }
    });

    const dailyActivity = Array.from(activityMap.values());

    return new Response(
      JSON.stringify({
        userStats,
        overallStats,
        dailyActivity,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
