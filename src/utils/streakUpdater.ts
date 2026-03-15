import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';

export async function updateUserStreak(userId: string, planId: string) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: existingStreak, error: fetchError } = await supabase
      .from('user_streaks')
      .select('*')
      .eq('user_id', userId)
      .eq('training_plan_id', planId)
      .maybeSingle();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    const { data: completions, error: completionsError } = await supabase
      .from('workout_completions')
      .select('completed_at')
      .eq('user_id', userId)
      .eq('training_plan_id', planId)
      .order('completed_at', { ascending: false });

    if (completionsError) throw completionsError;

    const totalWorkouts = completions?.length || 0;

    const uniqueDates = new Set(
      completions?.map(c => new Date(c.completed_at).toISOString().split('T')[0]) || []
    );

    const sortedDates = Array.from(uniqueDates)
      .map(d => {
        const date = new Date(d + 'T12:00:00Z');
        return date;
      })
      .sort((a, b) => b.getTime() - a.getTime());

    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;
    let expectedDate = new Date(today);

    for (let i = 0; i < sortedDates.length; i++) {
      const workoutDate = new Date(sortedDates[i]);
      workoutDate.setHours(0, 0, 0, 0);
      expectedDate.setHours(0, 0, 0, 0);

      const daysDiff = Math.floor((expectedDate.getTime() - workoutDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysDiff === 0) {
        tempStreak++;
        if (i === 0) {
          currentStreak = tempStreak;
        }
        expectedDate.setDate(expectedDate.getDate() - 1);
      } else if (daysDiff === 1) {
        tempStreak++;
        if (i === 0) {
          currentStreak = tempStreak;
        }
        expectedDate = new Date(workoutDate);
        expectedDate.setDate(expectedDate.getDate() - 1);
      } else {
        if (i === 0 && daysDiff > 1) {
          currentStreak = 0;
        }
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
        expectedDate = new Date(workoutDate);
        expectedDate.setDate(expectedDate.getDate() - 1);
      }
    }

    longestStreak = Math.max(longestStreak, tempStreak, currentStreak);

    const badgeResult = calculateBadges(totalWorkouts, longestStreak, existingStreak?.badges || []);

    const streakData = {
      user_id: userId,
      training_plan_id: planId,
      current_streak: currentStreak,
      longest_streak: longestStreak,
      total_workouts: totalWorkouts,
      last_workout_date: sortedDates.length > 0 ? sortedDates[0].toISOString().split('T')[0] : null,
      badges: badgeResult.allBadges,
      updated_at: new Date().toISOString(),
    };

    if (existingStreak) {
      const { error: updateError } = await supabase
        .from('user_streaks')
        .update(streakData)
        .eq('user_id', userId)
        .eq('training_plan_id', planId);

      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from('user_streaks')
        .insert(streakData);

      if (insertError) throw insertError;
    }

    // Create notifications for new badges
    for (const badge of badgeResult.newBadges) {
      try {
        await supabase.from('notifications').insert({
          user_id: userId,
          title: `New Badge Earned: ${badge.name}`,
          message: badge.description,
          type: 'success',
        });
      } catch (notificationError) {
        logger.error('Error creating badge notification:', notificationError);
      }
    }

    // Create notifications for streak milestones
    const streakMilestones = [7, 14, 30, 50, 100];
    const previousStreak = existingStreak?.current_streak || 0;

    for (const milestone of streakMilestones) {
      if (currentStreak >= milestone && previousStreak < milestone) {
        try {
          await supabase.from('notifications').insert({
            user_id: userId,
            title: `${milestone} Day Streak!`,
            message: `Congratulations! You've maintained a ${milestone}-day training streak. Keep it up!`,
            type: 'success',
          });
        } catch (notificationError) {
          logger.error('Error creating streak milestone notification:', notificationError);
        }
      }
    }

    return { success: true, streakData, newBadges: badgeResult.newBadges };
  } catch (error) {
    logger.error('Error updating streak:', error);
    return { success: false, error };
  }
}

function calculateBadges(totalWorkouts: number, longestStreak: number, existingBadges: any[] = []) {
  const badgeDefinitions = [
    { id: 'first_workout', name: 'First Step', description: 'Complete your first workout', requirement: 1, type: 'workouts' },
    { id: 'week_warrior', name: 'Week Warrior', description: 'Complete 7 workouts', requirement: 7, type: 'workouts' },
    { id: 'consistency_king', name: 'Consistency King', description: 'Maintain a 7-day streak', requirement: 7, type: 'streak' },
    { id: 'dedicated_runner', name: 'Dedicated Runner', description: 'Complete 30 workouts', requirement: 30, type: 'workouts' },
    { id: 'streak_master', name: 'Streak Master', description: 'Maintain a 14-day streak', requirement: 14, type: 'streak' },
    { id: 'century_club', name: 'Century Club', description: 'Complete 100 workouts', requirement: 100, type: 'workouts' },
    { id: 'unstoppable', name: 'Unstoppable', description: 'Maintain a 30-day streak', requirement: 30, type: 'streak' },
  ];

  const newBadges = [];
  const existingBadgeIds = new Set(existingBadges.map((b: any) => b.id));

  for (const badge of badgeDefinitions) {
    const value = badge.type === 'workouts' ? totalWorkouts : longestStreak;
    if (value >= badge.requirement && !existingBadgeIds.has(badge.id)) {
      newBadges.push({
        id: badge.id,
        name: badge.name,
        description: badge.description,
        icon: badge.id.includes('streak') ? 'flame' : 'trophy',
        earnedAt: new Date().toISOString(),
      });
    }
  }

  return {
    allBadges: [...existingBadges, ...newBadges],
    newBadges: newBadges,
  };
}
