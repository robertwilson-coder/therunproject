import { useState, useEffect } from 'react';
import { X, Lightbulb, BookOpen, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  selectWeeklyInsight,
  InsightSelectionContext,
  SelectedInsight,
  getWeekMondayISO,
  daysBetween,
  estimateLongRunMinutes,
  detectQualityWorkouts,
  extractLongRunKm,
  calculateRecentMissRate,
  detectRPETrend,
} from '../utils/weeklyCoachInsights';
import { logger } from '../utils/logger';
import { getTodayISO, getUserTimezone } from '../utils/timezoneUtils';

interface WeeklyCoachInsightProps {
  planId: string;
  planData: {
    days?: { date: string; workout?: string; workout_type?: string }[];
  };
  raceDate: string | null;
  totalWeeks: number;
  trainingPaces?: { easyPace?: string } | null;
  triggerType: 'weekly_open' | 'workout_completion';
  onClose: () => void;
}

interface InsightRecord {
  id: string;
  insight_key: string;
  week_start_date: string;
  shown_at: string;
}

export function WeeklyCoachInsight({
  planId,
  planData,
  raceDate,
  totalWeeks,
  trainingPaces,
  triggerType,
  onClose,
}: WeeklyCoachInsightProps) {
  const { user } = useAuth();
  const [selectedInsight, setSelectedInsight] = useState<SelectedInsight | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [hasCheckedDB, setHasCheckedDB] = useState(false);

  useEffect(() => {
    if (!user || !planId || hasCheckedDB) return;

    async function checkAndSelectInsight() {
      try {
        const timezone = getUserTimezone();
        const todayISO = getTodayISO(timezone);
        const weekMonday = getWeekMondayISO(todayISO);

        const { data: existingInsight } = await supabase
          .from('coach_weekly_insights')
          .select('id, insight_key, week_start_date, shown_at')
          .eq('user_id', user.id)
          .eq('plan_id', planId)
          .eq('week_start_date', weekMonday)
          .maybeSingle();

        if (existingInsight) {
          logger.info('[WeeklyCoachInsight] Already shown this week', {
            insightKey: existingInsight.insight_key,
            weekMonday,
          });
          setHasCheckedDB(true);
          return;
        }

        const context = await buildSelectionContext(
          planData,
          raceDate,
          totalWeeks,
          trainingPaces,
          todayISO,
          user.id,
          planId
        );

        const insight = selectWeeklyInsight(context);

        if (insight) {
          await supabase.from('coach_weekly_insights').insert({
            user_id: user.id,
            plan_id: planId,
            week_start_date: weekMonday,
            insight_key: insight.insight.key,
            trigger_type: triggerType,
            shown_at: new Date().toISOString(),
          });

          logger.info('[WeeklyCoachInsight] Selected and recorded insight', {
            insightKey: insight.insight.key,
            reason: insight.reason,
            triggerType,
          });

          setSelectedInsight(insight);
          setIsVisible(true);
        }

        setHasCheckedDB(true);
      } catch (error) {
        logger.error('[WeeklyCoachInsight] Error checking/selecting insight', { error });
        setHasCheckedDB(true);
      }
    }

    checkAndSelectInsight();
  }, [user, planId, planData, raceDate, totalWeeks, trainingPaces, triggerType, hasCheckedDB]);

  async function handleDismiss() {
    if (!user || !selectedInsight) return;

    try {
      const timezone = getUserTimezone();
      const todayISO = getTodayISO(timezone);
      const weekMonday = getWeekMondayISO(todayISO);

      await supabase
        .from('coach_weekly_insights')
        .update({ dismissed_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('plan_id', planId)
        .eq('week_start_date', weekMonday);
    } catch (error) {
      logger.error('[WeeklyCoachInsight] Error recording dismissal', { error });
    }

    setIsVisible(false);
    setTimeout(onClose, 300);
  }

  async function handleCTAClick(cta: string) {
    if (!user || !selectedInsight) return;

    try {
      const timezone = getUserTimezone();
      const todayISO = getTodayISO(timezone);
      const weekMonday = getWeekMondayISO(todayISO);

      await supabase
        .from('coach_weekly_insights')
        .update({
          cta_clicked: cta,
          dismissed_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('plan_id', planId)
        .eq('week_start_date', weekMonday);

      logger.info('[WeeklyCoachInsight] CTA clicked', { cta, insightKey: selectedInsight.insight.key });
    } catch (error) {
      logger.error('[WeeklyCoachInsight] Error recording CTA click', { error });
    }

    setIsVisible(false);
    setTimeout(onClose, 300);
  }

  if (!selectedInsight || !isVisible) return null;

  const { insight } = selectedInsight;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className={`bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full transform transition-all duration-300 ${
          isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Lightbulb className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                  This week's focus
                </p>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {insight.title}
                </h3>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          <div className="space-y-4">
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              {insight.body}
            </p>

            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 border-l-4 border-amber-500">
              <p className="text-sm font-medium text-slate-900 dark:text-white mb-1">
                Action for this week
              </p>
              <p className="text-slate-600 dark:text-slate-300 text-sm">
                {insight.action}
              </p>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={() => handleCTAClick('got_it')}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-medium hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
            >
              <Check className="w-4 h-4" />
              Got it
            </button>
            <button
              onClick={() => handleCTAClick('more_like_this')}
              className="flex items-center justify-center gap-2 px-4 py-3 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              More like this
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

async function buildSelectionContext(
  planData: { days?: { date: string; workout?: string; workout_type?: string }[] },
  raceDate: string | null,
  totalWeeks: number,
  trainingPaces: { easyPace?: string } | null | undefined,
  todayISO: string,
  userId: string,
  planId: string
): Promise<InsightSelectionContext> {
  const weekMonday = getWeekMondayISO(todayISO);
  const weekSundayMs = new Date(weekMonday + 'T00:00:00Z').getTime() + 7 * 24 * 60 * 60 * 1000;
  const weekSundayISO = new Date(weekSundayMs).toISOString().split('T')[0];

  const days = planData.days || [];
  const weekDays = days.filter(d => d.date >= weekMonday && d.date < weekSundayISO);
  const weekWorkouts = weekDays
    .filter(d => d.workout && d.workout_type !== 'REST')
    .map(d => d.workout || '');

  let daysToRace: number | null = null;
  if (raceDate) {
    daysToRace = daysBetween(todayISO, raceDate);
    if (daysToRace < 0) daysToRace = null;
  }

  const longRunKm = extractLongRunKm(weekWorkouts);
  const easyPaceMinPerKm = trainingPaces?.easyPace
    ? parsePaceToMinutes(trainingPaces.easyPace)
    : 6.0;
  const longRunMinutes = longRunKm > 0 ? estimateLongRunMinutes(longRunKm, easyPaceMinPerKm) : null;

  const hasQualityWorkout = detectQualityWorkouts(weekWorkouts);

  let recentMissRate = 0;
  let recentRPETrend: 'normal' | 'elevated' | 'low' = 'normal';

  try {
    const twoWeeksAgo = new Date(new Date(todayISO).getTime() - 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const { data: completions } = await supabase
      .from('workout_completions')
      .select('completed_at, rating')
      .eq('user_id', userId)
      .eq('training_plan_id', planId)
      .gte('completed_at', twoWeeksAgo);

    if (completions && completions.length > 0) {
      const scheduledDays = days.filter(d => {
        if (!d.date || d.workout_type === 'REST') return false;
        return d.date >= twoWeeksAgo && d.date <= todayISO;
      });

      const completedDates = new Set(
        completions.map(c => c.completed_at?.split('T')[0])
      );

      const completionRecords = scheduledDays.map(d => ({
        completed: completedDates.has(d.date),
        date: d.date,
      }));

      recentMissRate = calculateRecentMissRate(completionRecords, 14);

      const rpeRecords = completions
        .filter(c => c.rating != null)
        .map(c => ({ rpe: c.rating!, expectedRPE: 5 }));

      recentRPETrend = detectRPETrend(rpeRecords);
    }
  } catch (error) {
    logger.error('[WeeklyCoachInsight] Error fetching completion data', { error });
  }

  const planStartDay = days.length > 0 ? days[0].date : todayISO;
  const weeksSinceStart = Math.floor(daysBetween(planStartDay, todayISO) / 7) + 1;
  const weekNumber = Math.max(1, Math.min(weeksSinceStart, totalWeeks));

  let phase: InsightSelectionContext['phase'] = 'base';
  if (daysToRace !== null && daysToRace <= 7) {
    phase = 'race';
  } else if (daysToRace !== null && daysToRace <= 21) {
    phase = 'taper';
  } else {
    const progress = weekNumber / totalWeeks;
    if (progress < 0.3) phase = 'base';
    else if (progress < 0.7) phase = 'build';
    else phase = 'peak';
  }

  return {
    daysToRace,
    longRunMinutes,
    hasQualityWorkout,
    recentMissRate,
    recentRPETrend,
    weekNumber,
    totalWeeks,
    phase,
  };
}

function parsePaceToMinutes(pace: string): number {
  const parts = pace.split(':');
  if (parts.length === 2) {
    const minutes = parseInt(parts[0], 10);
    const seconds = parseInt(parts[1], 10);
    return minutes + seconds / 60;
  }
  return 6.0;
}

export function useWeeklyInsightCheck(
  planId: string | null,
  planData: { days?: { date: string; workout?: string; workout_type?: string }[] } | null,
  raceDate: string | null,
  totalWeeks: number,
  trainingPaces?: { easyPace?: string } | null
) {
  const { user } = useAuth();
  const [shouldShowInsight, setShouldShowInsight] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    if (!user || !planId || !planData || hasChecked) return;

    async function checkForInsight() {
      try {
        const timezone = getUserTimezone();
        const todayISO = getTodayISO(timezone);
        const weekMonday = getWeekMondayISO(todayISO);

        const { data: existingInsight } = await supabase
          .from('coach_weekly_insights')
          .select('id')
          .eq('user_id', user.id)
          .eq('plan_id', planId)
          .eq('week_start_date', weekMonday)
          .maybeSingle();

        if (!existingInsight) {
          setShouldShowInsight(true);
        }

        setHasChecked(true);
      } catch (error) {
        logger.error('[useWeeklyInsightCheck] Error checking for insight', { error });
        setHasChecked(true);
      }
    }

    checkForInsight();
  }, [user, planId, planData, hasChecked]);

  return { shouldShowInsight, setShouldShowInsight };
}
