import { useRef, useEffect } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Target, Eye } from 'lucide-react';
import { WorkoutDayCard } from './WorkoutDayCard';
import { dayOrder, convertRPEtoEffort, isDayBeforeStart } from '../utils/trainingPlanUtils';
import { getWeekDateRange, formatDateRange, addDays, getDateStringFromDate, parseLocalDate } from '../utils/dateUtils';
import { useSwipeGesture } from '../hooks/useSwipeGesture';

const removeMarkdownFormatting = (text: string): string => {
  return text.replace(/\*\*/g, '');
};

interface TrainingPaces {
  easyPace: string;
  longRunPace: string;
  tempoPace: string;
  intervalPace: string;
  racePace: string;
}

interface TimeProgress {
  totalDays: number;
  elapsedDays: number;
  remainingDays: number;
  progressPercent: number;
}

interface DayViewProps {
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
  selectedDate: string;
  allWeeksData: any[];
  timeProgress: TimeProgress | null;
  onDateNavigate: (days: number) => void;
  onDayExpand: (dayKey: string | null) => void;
  onWorkoutComplete: (weekNumber: number, dayName: string, activity: string, e: React.MouseEvent) => void;
  onSetPendingAction: (action: { type: string; data: any }) => void;
  onJumpToToday: () => void;
}

export function DayView({
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
  allWeeksData,
  timeProgress,
  onDateNavigate,
  onDayExpand,
  onWorkoutComplete,
  onSetPendingAction,
  onJumpToToday
}: DayViewProps) {
  // Guard: Ensure dates are valid strings FIRST
  if (!selectedDate || typeof selectedDate !== 'string' || !planStartDate || typeof planStartDate !== 'string') {
    console.error('[DayView] Invalid date format:', { selectedDate, planStartDate });
    return (
      <div className="card-premium p-8 text-center">
        <p className="text-neutral-600 dark:text-neutral-400">
          Invalid date format. Please refresh the page.
        </p>
      </div>
    );
  }

  // Guard: Check if currentWeek exists and has days
  if (!currentWeek || !currentWeek.days) {
    return (
      <div className="card-premium p-8 text-center">
        <p className="text-neutral-600 dark:text-neutral-400">
          Day data not available.
        </p>
      </div>
    );
  }

  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate current day from selectedDate
  const selectedDateObj = parseLocalDate(selectedDate);
  const planStartDateObj = parseLocalDate(planStartDate);

  // Calculate days since plan start (for navigation)
  const daysDiff = Math.floor((selectedDateObj.getTime() - planStartDateObj.getTime()) / (1000 * 60 * 60 * 24));

  // Get actual day of week from the selected date (0=Sunday, 1=Monday, etc.)
  const jsDay = selectedDateObj.getDay();
  // Convert to our dayOrder index (0=Monday, 6=Sunday)
  const currentDayOfWeek = jsDay === 0 ? 6 : jsDay - 1;
  const currentDayName = dayOrder[currentDayOfWeek];

  // Get full day name for display
  const fullDayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const currentFullDayName = fullDayNames[currentDayOfWeek];

  // Calculate total days in plan using timeProgress if available, otherwise fall back to plan length
  const totalDaysInPlan = timeProgress?.totalDays || (planLength * 7);
  const currentDayIndex = timeProgress?.elapsedDays || daysDiff;

  // Check navigation boundaries
  const canGoBack = currentDayIndex > 0;
  const canGoForward = currentDayIndex < totalDaysInPlan - 1;

  // Get current day data
  const dayData = currentWeek.days[currentDayName];
  const originalActivity = typeof dayData === 'string' ? dayData : dayData?.workout;
  const weekNum = currentWeek.week || (currentWeekIndex + 1);
  const activityWithEffort = convertRPEtoEffort(originalActivity, isBeginnerPlan, weekNum);
  const isBeforeStart = isDayBeforeStart(currentWeekIndex, currentDayName, planStartDate);
  const activity = isBeforeStart ? 'Rest' : (activityWithEffort || 'Rest');
  const aiTips = typeof dayData === 'object' ? dayData.tips : null;
  const workoutType = typeof dayData === 'object' ? dayData.workoutType : undefined;
  const calibrationTag = typeof dayData === 'object' ? dayData.calibrationTag : undefined;
  const isCurrentDay = currentDayName === today.dayName && currentWeekIndex === today.weekNumber;
  const dayKey = `${currentWeekIndex}-${currentDayName}`;
  const completionKey = `${weekNum}-${currentDayName}`;
  const isExpanded = expandedDay === dayKey;
  const isCompleted = completedWorkouts.has(completionKey);
  const isRestDay = activity.toLowerCase().includes('rest');

  // Get tomorrow's preview
  const tomorrowDate = addDays(selectedDate, 1);
  const tomorrowDateObj = parseLocalDate(tomorrowDate);
  const tomorrowDaysDiff = currentDayIndex + 1;
  const tomorrowWeekIndex = Math.floor(tomorrowDaysDiff / 7);
  // Get actual day of week for tomorrow
  const tomorrowJsDay = tomorrowDateObj.getDay();
  const tomorrowDayOfWeek = tomorrowJsDay === 0 ? 6 : tomorrowJsDay - 1;
  const tomorrowDayName = dayOrder[tomorrowDayOfWeek];
  const tomorrowWeek = allWeeksData[tomorrowWeekIndex];
  const tomorrowDayData = tomorrowWeek?.days[tomorrowDayName];
  const tomorrowOriginalActivity = typeof tomorrowDayData === 'string' ? tomorrowDayData : tomorrowDayData?.workout;
  const tomorrowWeekNum = tomorrowWeek?.week || (tomorrowWeekIndex + 1);
  const tomorrowActivity = tomorrowOriginalActivity
    ? convertRPEtoEffort(tomorrowOriginalActivity, isBeginnerPlan, tomorrowWeekNum)
    : null;

  // Calculate week progress (how many days completed this week)
  const weekCompletionCount = dayOrder.filter(day => {
    const key = `${weekNum}-${day}`;
    return completedWorkouts.has(key);
  }).length;

  // Set up swipe gesture
  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: () => {
      if (canGoForward) {
        onDateNavigate(1);
      }
    },
    onSwipeRight: () => {
      if (canGoBack) {
        onDateNavigate(-1);
      }
    },
    threshold: 75
  });

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if no input/textarea is focused
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      if (e.key === 'ArrowLeft' && canGoBack) {
        e.preventDefault();
        onDateNavigate(-1);
      } else if (e.key === 'ArrowRight' && canGoForward) {
        e.preventDefault();
        onDateNavigate(1);
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        onJumpToToday();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canGoBack, canGoForward, onDateNavigate, onJumpToToday]);

  // Format current date
  const dateStr = selectedDateObj.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div
      ref={containerRef}
      className="card-premium p-4 min-h-[70vh] flex flex-col"
      {...swipeHandlers}
    >
      {/* Header with date and navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => canGoBack && onDateNavigate(-1)}
          disabled={!canGoBack}
          className={`p-2 rounded-lg transition-all ${
            canGoBack
              ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-white hover:bg-neutral-300 dark:hover:bg-neutral-700'
              : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
          }`}
          aria-label="Previous day"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="text-center flex-1 px-4">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Calendar className="w-5 h-5 text-primary-500" />
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
              {currentFullDayName}
            </h3>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {selectedDateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
            Week {weekNum} • Day {currentDayIndex + 1} of {totalDaysInPlan}
          </p>
        </div>

        <button
          onClick={() => canGoForward && onDateNavigate(1)}
          disabled={!canGoForward}
          className={`p-2 rounded-lg transition-all ${
            canGoForward
              ? 'bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-white hover:bg-neutral-300 dark:hover:bg-neutral-700'
              : 'bg-neutral-100 dark:bg-neutral-900 text-neutral-400 dark:text-neutral-600 cursor-not-allowed'
          }`}
          aria-label="Next day"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Jump to Today button */}
      {!isCurrentDay && today.weekNumber < planLength && today.weekNumber >= 0 && (
        <button
          onClick={onJumpToToday}
          className="mb-4 flex items-center gap-2 text-sm font-medium text-white mx-auto bg-primary-500 px-4 py-2 rounded-full hover:bg-primary-600 transition-all"
        >
          <Target className="w-4 h-4" />
          Jump to Today
        </button>
      )}

      {/* Week progress dots */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {dayOrder.map((day, idx) => {
          const isThisDay = day === currentDayName;
          const dayCompletionKey = `${weekNum}-${day}`;
          const isDayCompleted = completedWorkouts.has(dayCompletionKey);

          return (
            <div
              key={day}
              className={`h-2 rounded-full transition-all ${
                isThisDay
                  ? 'w-8 bg-primary-500'
                  : isDayCompleted
                  ? 'w-2 bg-green-500'
                  : 'w-2 bg-neutral-300 dark:bg-neutral-700'
              }`}
              title={`${day}${isDayCompleted ? ' (completed)' : ''}`}
            />
          );
        })}
      </div>

      {/* Main workout card */}
      <div className="flex-1 flex flex-col">
        <WorkoutDayCard
          day={currentDayName}
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
            onWorkoutComplete(weekNum, currentDayName, activity, e);
          }}
          onMove={() => {
            onSetPendingAction({
              type: 'move',
              data: { weekNumber: weekNum, dayName: currentDayName, activity }
            });
          }}
          onMakeEasier={() => {
            onSetPendingAction({
              type: 'easier',
              data: { weekNumber: weekNum, dayName: currentDayName, activity }
            });
          }}
        />
      </div>

      {/* Tomorrow's preview */}
      {canGoForward && tomorrowActivity && (
        <div className="mt-6 pt-4 border-t border-neutral-300 dark:border-neutral-700">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 flex items-center gap-2">
              <Eye className="w-4 h-4" />
              Tomorrow
            </h4>
            <button
              onClick={() => onDateNavigate(1)}
              className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
            >
              View details
            </button>
          </div>
          <div className="bg-neutral-100 dark:bg-neutral-800/50 rounded-lg p-3">
            <p className="text-xs font-bold text-neutral-600 dark:text-neutral-400 mb-1">
              {fullDayNames[tomorrowDayOfWeek]}
            </p>
            <p className="text-sm text-neutral-900 dark:text-neutral-100">
              {removeMarkdownFormatting(tomorrowActivity)}
            </p>
          </div>
        </div>
      )}

      {/* Swipe hint (only show on first day) */}
      {currentDayIndex === 0 && (
        <div className="mt-4 text-center">
          <p className="text-xs text-neutral-500 dark:text-neutral-600 italic">
            Swipe left or right to navigate between days
          </p>
        </div>
      )}
    </div>
  );
}
