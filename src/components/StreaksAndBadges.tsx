import { useState, useEffect } from 'react';
import { logger } from '../utils/logger';
import { Flame, Trophy, Award, Calendar, Target, Zap, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface StreaksAndBadgesProps {
  onClose: () => void;
  planId?: string | null;
}

interface UserStreak {
  current_streak: number;
  longest_streak: number;
  total_workouts: number;
  badges: Badge[];
}

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: string;
}

const badgeDefinitions = [
  { id: 'first_workout', name: 'First Step', description: 'Complete your first workout', requirement: 1, icon: 'target' },
  { id: 'week_warrior', name: 'Week Warrior', description: 'Complete 7 workouts', requirement: 7, icon: 'calendar' },
  { id: 'consistency_king', name: 'Consistency King', description: 'Maintain a 7-day streak', requirement: 7, icon: 'flame' },
  { id: 'dedicated_runner', name: 'Dedicated Runner', description: 'Complete 30 workouts', requirement: 30, icon: 'trophy' },
  { id: 'streak_master', name: 'Streak Master', description: 'Maintain a 14-day streak', requirement: 14, icon: 'zap' },
  { id: 'century_club', name: 'Century Club', description: 'Complete 100 workouts', requirement: 100, icon: 'award' },
  { id: 'unstoppable', name: 'Unstoppable', description: 'Maintain a 30-day streak', requirement: 30, icon: 'flame' },
];

export function StreaksAndBadges({ onClose, planId }: StreaksAndBadgesProps) {
  const { user } = useAuth();
  const [streakData, setStreakData] = useState<UserStreak | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStreakData();
  }, [planId]);

  const loadStreakData = async () => {
    if (!user) return;

    try {
      let query = supabase
        .from('user_streaks')
        .select('*')
        .eq('user_id', user.id);

      if (planId) {
        query = query.eq('training_plan_id', planId);
      }

      const { data, error } = await query.maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setStreakData({
          current_streak: data.current_streak,
          longest_streak: data.longest_streak,
          total_workouts: data.total_workouts,
          badges: data.badges || [],
        });
      } else {
        setStreakData({
          current_streak: 0,
          longest_streak: 0,
          total_workouts: 0,
          badges: [],
        });
      }
    } catch (error) {
      logger.error('Error loading streak data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getIconComponent = (iconName: string) => {
    const icons: { [key: string]: any } = {
      target: Target,
      calendar: Calendar,
      flame: Flame,
      trophy: Trophy,
      zap: Zap,
      award: Award,
    };
    return icons[iconName] || Award;
  };

  const hasBadge = (badgeId: string) => {
    return streakData?.badges.some((b: any) => b.id === badgeId);
  };

  const isEligibleForBadge = (badge: any) => {
    if (!streakData) return false;

    if (badge.id.includes('streak')) {
      return streakData.longest_streak >= badge.requirement;
    }
    return streakData.total_workouts >= badge.requirement;
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 to-gray-800 bg-opacity-95 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 sticky top-0 bg-white/95 backdrop-blur-sm z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Trophy className="w-6 h-6 text-yellow-500" />
              Streaks & Achievements
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {!planId ? (
            <div className="text-center py-12">
              <Trophy className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Active Plan</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Create or select a training plan to track your streaks and achievements.
              </p>
            </div>
          ) : loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-300">Loading your achievements...</p>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-6 border-2 border-orange-200">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-3 bg-orange-500 rounded-lg">
                      <Flame className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-600">Current Streak</h3>
                      <p className="text-3xl font-bold text-orange-700">{streakData?.current_streak || 0}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">days in a row</p>
                </div>

                <div className="bg-gradient-to-br from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20 rounded-xl p-6 border-2 border-primary-200 dark:border-primary-700">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-3 bg-primary-500 rounded-lg">
                      <Zap className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Best Streak</h3>
                      <p className="text-3xl font-bold text-primary-700 dark:text-primary-300">{streakData?.longest_streak || 0}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">personal record</p>
                </div>

                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border-2 border-blue-200">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-3 bg-blue-500 rounded-lg">
                      <Trophy className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-600">Total Workouts</h3>
                      <p className="text-3xl font-bold text-blue-700">{streakData?.total_workouts || 0}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">completed</p>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Award className="w-5 h-5 text-blue-600" />
                  Achievements
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {badgeDefinitions.map((badge) => {
                    const earned = hasBadge(badge.id);
                    const eligible = isEligibleForBadge(badge);
                    const Icon = getIconComponent(badge.icon);

                    return (
                      <div
                        key={badge.id}
                        className={`rounded-xl p-4 border-2 transition-all ${
                          earned
                            ? 'bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-300'
                            : eligible
                            ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-300'
                            : 'bg-gray-50 border-gray-200 opacity-60'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-3 rounded-lg ${
                            earned ? 'bg-yellow-500' : eligible ? 'bg-green-500' : 'bg-gray-400'
                          }`}>
                            <Icon className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-start justify-between">
                              <h4 className="font-bold text-gray-900">{badge.name}</h4>
                              {earned && (
                                <span className="text-xs bg-yellow-500 text-white px-2 py-1 rounded-full font-semibold">
                                  Earned
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 mt-1">{badge.description}</p>
                            {!earned && (
                              <div className="mt-2">
                                <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                                  <span>Progress</span>
                                  <span>
                                    {badge.id.includes('streak')
                                      ? `${streakData?.longest_streak || 0}/${badge.requirement}`
                                      : `${streakData?.total_workouts || 0}/${badge.requirement}`
                                    }
                                  </span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                  <div
                                    className="h-full bg-blue-600 rounded-full transition-all"
                                    style={{
                                      width: `${Math.min(
                                        100,
                                        ((badge.id.includes('streak')
                                          ? streakData?.longest_streak || 0
                                          : streakData?.total_workouts || 0) /
                                          badge.requirement) *
                                          100
                                      )}%`,
                                    }}
                                  ></div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                <p className="text-sm text-gray-700">
                  <span className="font-semibold">Keep going!</span> Consistency is the key to success.
                  Complete workouts regularly to maintain your streak and unlock more achievements.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
