import { supabase } from '../lib/supabase';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

interface CreateNotificationParams {
  userId: string;
  title: string;
  message: string;
  type?: NotificationType;
  actionUrl?: string;
}

export async function createNotification({
  userId,
  title,
  message,
  type = 'info',
  actionUrl,
}: CreateNotificationParams): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: userId,
      title,
      message,
      type,
      action_url: actionUrl,
    });

    if (error) {
      console.error('Error creating notification:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error creating notification:', error);
    return { success: false, error: error?.message || 'Unknown error' };
  }
}

export async function createPlanCompletedNotification(userId: string, planId: string) {
  return createNotification({
    userId,
    title: 'Training Plan Ready!',
    message: 'Your personalized training plan has been generated and is ready to view.',
    type: 'success',
    actionUrl: `#plan-${planId}`,
  });
}

export async function createWorkoutReminderNotification(userId: string, workoutName: string) {
  return createNotification({
    userId,
    title: 'Workout Reminder',
    message: `Don't forget: ${workoutName} is scheduled for today!`,
    type: 'info',
  });
}

export async function createStreakMilestoneNotification(userId: string, streakCount: number) {
  return createNotification({
    userId,
    title: `${streakCount} Day Streak!`,
    message: `Congratulations! You've maintained a ${streakCount}-day training streak. Keep it up!`,
    type: 'success',
  });
}

export async function createBadgeEarnedNotification(
  userId: string,
  badgeName: string,
  badgeDescription: string
) {
  return createNotification({
    userId,
    title: `New Badge Earned: ${badgeName}`,
    message: badgeDescription,
    type: 'success',
  });
}

export async function createGarminSyncNotification(
  userId: string,
  success: boolean,
  workoutCount?: number
) {
  if (success) {
    return createNotification({
      userId,
      title: 'Garmin Sync Complete',
      message: `Successfully synced ${workoutCount || 0} workout${workoutCount !== 1 ? 's' : ''} from Garmin Connect.`,
      type: 'success',
    });
  } else {
    return createNotification({
      userId,
      title: 'Garmin Sync Failed',
      message: 'There was an issue syncing your workouts from Garmin Connect. Please try again later.',
      type: 'error',
    });
  }
}

export async function markAllNotificationsAsRead(userId: string): Promise<{ success: boolean }> {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      console.error('Error marking notifications as read:', error);
      return { success: false };
    }

    return { success: true };
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    return { success: false };
  }
}

export async function deleteNotification(notificationId: string): Promise<{ success: boolean }> {
  try {
    const { error } = await supabase.from('notifications').delete().eq('id', notificationId);

    if (error) {
      console.error('Error deleting notification:', error);
      return { success: false };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting notification:', error);
    return { success: false };
  }
}
