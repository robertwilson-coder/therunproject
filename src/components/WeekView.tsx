import { Calendar, ChevronLeft, ChevronRight, Target } from 'lucide-react';
import { WorkoutDayCard } from './WorkoutDayCard';
import { dayOrder, convertRPEtoEffort, isDayBeforeStart } from '../utils/trainingPlanUtils';
import { getWeekDateRange, formatDateRange } from '../utils/dateUtils';

interface TrainingPaces {
  easyPace: string;
  longRunPace: string;
  tempoPace: string;
  intervalPace: string;
  racePace: string;
}

interface WeekViewProps {
  currentWeek: any;
  currentWeekIndex: number;
  today: { dayName: string; weekNumber: number };
  planLength: number;
  isBeginnerPlan: boolean;
  completedWorkouts: Set<string>;
  expandedDay: string | null;
  isPreviewMode: boolean;
  savedPlanId: string | null;
  planType: 'static' | 'responsive' | 'date_based_preview' | 'date_based_full';
  trainingPaces: TrainingPaces | null;
  userHRZones: any;
  user: any;
  planStartDate: string;
  selectedDate?: string;
  onWeekChange: (index: number) => void;
  onDateNavigate?: (days: number) => void;
  onDayExpand: (dayKey: string | null) => void;
  onWorkoutComplete: (weekNumber: number, dayName: string, activity: string, e: React.MouseEvent) => void;
  onSetPendingAction: (action: { type: string; data: any }) => void;
}

export function WeekView({
  currentWeek,
  currentWeekIndex,
  today,
  planLength,
  isBeginnerPlan,
  completedWorkouts,
  expandedDay,
  isPreviewMode,
  savedPlanId,
  planType,
  trainingPaces,
  userHRZones,
  user,
  planStartDate,
  selectedDate,
  onWeekChange,
  onDateNavigate,
  onDayExpand,
  onWorkoutComplete,
  onSetPendingAction
}: WeekViewProps) {
  // Guard: Check if currentWeek exists and has days
  if (!currentWeek || !currentWeek.days) {
    return (
      <div className="card-premium p-8 text-center">
        <p className="text-neutral-600 dark:text-neutral-400">
          Week data not available. Please select a different week.
        </p>
      </div>
    );
  }

  const canGoBack = currentWeekIndex > 0;
  const canGoForward = currentWeekIndex < planLength - 1;

  // Get week date range for display
  const weekRange = getWeekDateRange(currentWeekIndex, { plan: Array(planLength).fill(null).map((_, i) => i === currentWeekIndex ? currentWeek : null) });
  const weekDateRangeText = weekRange ? formatDateRange(weekRange.start, weekRange.end) : '';

  // Navigation handlers that use onDateNavigate if available, otherwise fall back to onWeekChange
  const handlePreviousWeek = () => {
    if (onDateNavigate) {
      onDateNavigate(-7);
    } else {
      onWeekChange(currentWeekIndex - 1);
    }
  };

  const handleNextWeek = () => {
    if (onDateNavigate) {
      onDateNavigate(7);
    } else {
      onWeekChange(currentWeekIndex + 1);
    }
  };

  return (
    <div className="card-premium p-3 md:p-5">
      <div className="flex flex-col md:flex-row items-center md:justify-between gap-4 mb-6">
        <div className="text-center w-full md:w-auto order-1 md:order-2">
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2 justify-center">
              <Calendar className="w-5 h-5 md:w-6 md:h-6 text-primary-500" />
              <h3 className="text-xl md:text-2xl font-bold text-neutral-900 dark:text-white">Week {currentWeek.week}</h3>
            </div>
            {weekDateRangeText && (
              <p className="text-sm md:text-base text-neutral-600 dark:text-neutral-400">{weekDateRangeText}</p>
            )}
          </div>
          {currentWeekIndex !== today.weekNumber && today.weekNumber < planLength && today.weekNumber >= 0 && (
            <button
              onClick={() => onWeekChange(today.weekNumber)}
              className="mt-2 flex items-center gap-1 text-xs font-medium text-white mx-auto bg-primary-500 px-3 py-1.5 rounded-full hover:bg-primary-600 transition-all"
            >
              <Target className="w-3 h-3" />
              Jump to Today
            </button>
          )}
        </div>

        <div className="flex items-center justify-between w-full md:w-auto gap-2 order-2 md:order-1">
          <button
            onClick={handlePreviousWeek}
            disabled={!canGoBack}
            className={`flex items-center gap-1 md:gap-2 px-3 md:px-4 py-2 rounded-lg font-medium transition-all text-sm md:text-base ${
              canGoBack
                ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-white hover:bg-neutral-300 dark:hover:bg-neutral-700'
                : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-400 dark:text-neutral-600 cursor-not-allowed border border-neutral-300 dark:border-neutral-800'
            }`}
          >
            <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
            <span className="hidden sm:inline">Previous Week</span>
            <span className="sm:hidden">Prev</span>
          </button>

          <button
            onClick={handleNextWeek}
            disabled={!canGoForward}
            className={`flex items-center gap-1 md:gap-2 px-3 md:px-4 py-2 rounded-lg font-medium transition-all text-sm md:text-base ${
              canGoForward
                ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-white hover:bg-neutral-300 dark:hover:bg-neutral-700'
                : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-400 dark:text-neutral-600 cursor-not-allowed border border-neutral-300 dark:border-neutral-800'
            }`}
          >
            <span className="hidden sm:inline">Next Week</span>
            <span className="sm:hidden">Next</span>
            <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {dayOrder.map((day) => {
          const isBeforeStart = isDayBeforeStart(currentWeekIndex, day, planStartDate);
          const dayData = currentWeek.days[day];
          const originalActivity = typeof dayData === 'string' ? dayData : dayData.workout;
          const weekNum = currentWeek.week || (currentWeekIndex + 1);
          const activityWithEffort = convertRPEtoEffort(originalActivity, isBeginnerPlan, weekNum);
          const activity = isBeforeStart ? 'Rest' : (activityWithEffort || 'Rest');
          const aiTips = typeof dayData === 'object' ? dayData.tips : null;
          const workoutType = typeof dayData === 'object' ? dayData.workoutType : undefined;
          const calibrationTag = typeof dayData === 'object' ? dayData.calibrationTag : undefined;
          const isCurrentDay = day === today.dayName && currentWeekIndex === today.weekNumber;
          const dayKey = `${currentWeekIndex}-${day}`;
          const completionKey = `${weekNum}-${day}`;
          const isExpanded = expandedDay === dayKey;
          const isCompleted = completedWorkouts.has(completionKey);
          const isRestDay = activity.toLowerCase().includes('rest');

          return (
            <WorkoutDayCard
              key={day}
              day={day}
              activity={activity}
              aiTips={aiTips}
              isBeginnerPlan={isBeginnerPlan}
              weekNumber={weekNum}
              isCurrentDay={isCurrentDay}
              isCompleted={isCompleted}
              isExpanded={isExpanded}
              isBeforeStart={isBeforeStart}
              isRestDay={isRestDay}
              isPreviewMode={isPreviewMode}
              savedPlanId={savedPlanId}
              planType={planType}
              trainingPaces={trainingPaces}
              userHRZones={userHRZones}
              user={user}
              workoutType={workoutType}
              calibrationTag={calibrationTag}
              onToggleExpanded={() => {
                if (!isBeforeStart) {
                  onDayExpand(isExpanded ? null : dayKey);
                }
              }}
              onToggleCompletion={(e) => {
                e.stopPropagation();
                onWorkoutComplete(weekNum, day, activity, e);
              }}
              onMove={() => {
                onSetPendingAction({
                  type: 'move',
                  data: { weekNumber: weekNum, dayName: day, activity }
                });
              }}
              onMakeEasier={() => {
                onSetPendingAction({
                  type: 'easier',
                  data: { weekNumber: weekNum, dayName: day, activity }
                });
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
