import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Check, X, Clock, Zap, Activity, BookOpen, CheckCircle2, LayoutGrid, Columns } from 'lucide-react';
import { useState } from 'react';
import { PlanData } from '../lib/supabase';
import { parseWorkoutDescription, parseWorkoutSections } from '../utils/workoutParser';
import { useSwipeGesture } from '../hooks/useSwipeGesture';
import { parseLocalDate, getDateStringFromDate } from '../utils/dateUtils';

interface CalendarViewProps {
  planData: PlanData;
  completedWorkouts: Set<string>;
  onWorkoutClick: (weekNumber: number, dayName: string) => void;
  planStartDate: string;
  selectedDate?: string;
  onDateSelect?: (date: string) => void;
  onToggleCompletion?: (weekNumber: number, dayName: string, activity: string) => void;
}

interface WorkoutDetails {
  weekNumber: number;
  dayName: string;
  activity: string;
  tips: string[];
  isCompleted: boolean;
  date: Date;
}

const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const removeMarkdownFormatting = (text: string): string => {
  return text.replace(/\*\*/g, '');
};

const renderMarkdownText = (text: string): JSX.Element => {
  const parts = text.split(/(\*\*.*?\*\*)/g);

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
};

const getCoachingNotes = (activity: string): string[] => {
  const activityLower = activity.toLowerCase();

  if (activityLower.includes('rest')) {
    return [
      'Complete rest is essential for adaptation - this is when your body actually gets stronger. Training breaks down muscle fibers; rest rebuilds them stronger.',
      'Light stretching, foam rolling, or walking (under 20 minutes) is fine if you feel restless, but avoid any cardiovascular stress.',
      'Prioritize 8+ hours of quality sleep. Consider going to bed 30-60 minutes earlier than usual. Sleep is when growth hormone peaks and muscle repair happens.',
      'Focus on anti-inflammatory nutrition: lean proteins for muscle repair, colorful vegetables for antioxidants, and omega-3 rich foods like salmon or walnuts.',
      'Mental recovery is just as important as physical. Use this day to visualize your goals, review your progress, and reconnect with why you\'re training.',
      'If you feel overly fatigued or notice persistent soreness, this may indicate you need additional rest. Don\'t hesitate to convert an easy run day to rest.'
    ];
  }

  if (activityLower.includes('easy')) {
    return [
      'You should be able to hold a full conversation during this entire run. If you can\'t speak in complete sentences, you\'re going too fast.',
      'Your heart rate should stay in Zone 2 (60-70% of max HR). A simple rule: if you\'re breathing through your mouth, slow down - you should be able to nose-breathe.',
      'Easy runs build your aerobic base by increasing mitochondrial density and capillary development. These adaptations happen at easy paces, not hard ones.',
      'Don\'t let ego dictate pace. Many runners sabotage their training by running easy days too hard, which compromises recovery and makes hard days less effective.',
      'Focus on good running form: upright posture, relaxed shoulders, arms at 90 degrees, landing with feet under your hips, and maintaining a cadence around 170-180 steps per minute.',
      'The benefits of easy runs accumulate over time. Consistency at the right effort matters more than pace. Embrace the "slow" - it\'s where aerobic magic happens.'
    ];
  }

  if (activityLower.includes('long')) {
    return [
      'Start slower than you think you should. The first 10-15 minutes should feel almost uncomfortably easy. Your body needs time to warm up for the long effort ahead.',
      'Fuel properly before (2-3 hours before: complex carbs + protein) and during (30-60g carbs per hour after the first hour). Practice race-day nutrition here.',
      'Hydration strategy: Don\'t wait until you\'re thirsty. Drink 4-8 oz every 15-20 minutes. In hot weather, include electrolytes to prevent hyponatremia.',
      'Break the run into mental chunks. Focus on completing one section at a time rather than fixating on the total distance. This makes the run feel manageable.',
      'Long runs build mental toughness as much as physical endurance. When it gets hard, remember: this is where race-day confidence is forged.',
      'Recovery starts immediately after. Within 30 minutes, consume 3:1 or 4:1 carbs-to-protein ratio. Take a 10-minute ice bath if available, then prioritize sleep.'
    ];
  }

  if (activityLower.includes('tempo') || activityLower.includes('threshold')) {
    return [
      'Tempo pace should feel "comfortably hard" - you could speak in short phrases but wouldn\'t want to. This is typically your 10K race pace or slightly slower.',
      'Warm up thoroughly: 10-15 minutes easy running, then dynamic stretches and 4-6 x 100m strides building to tempo effort. Don\'t skip this.',
      'The goal is to run at or slightly below lactate threshold, teaching your body to clear lactate more efficiently and sustain faster paces longer.',
      'Maintain consistent effort rather than chasing a specific pace. Hills, wind, and fatigue affect pace but you can keep effort steady.',
      'Mental focus: These runs require concentration. Check in with your effort every 5 minutes. Don\'t start too fast - negative splitting is ideal.',
      'Cool down with 10-15 minutes easy running. This helps clear metabolic waste and begins recovery. Don\'t rush this part.'
    ];
  }

  if (activityLower.includes('interval') || activityLower.includes('repeat')) {
    return [
      'Warm up is critical: 15-20 minutes easy, dynamic stretches, then 4-6 x 100m strides building to workout pace. Your first interval should not be your fastest.',
      'Intervals should feel hard but controlled. If you\'re gasping for air and form is breaking down, you\'re going too fast. Back off 5-10 seconds per interval.',
      'Recovery intervals matter as much as work intervals. Jog easy - don\'t stand still. Active recovery clears lactate faster and prepares you for the next rep.',
      'These workouts improve VO2max and running economy. They\'re neurologically taxing, so mental focus is crucial. Count steps or focus on form during hard efforts.',
      'Form checklist during intervals: Quick turnover (180+ cadence), upright posture, driving knees forward, powerful arm swing, landing midfoot under your body.',
      'Don\'t skip the cool-down. Jog 10-15 minutes easy to gradually lower heart rate and initiate recovery. Include light stretching after you\'ve cooled down.'
    ];
  }

  return [
    'Focus on good running form: upright posture, relaxed shoulders, arms at 90 degrees, landing with feet under your hips.',
    'Listen to your body. If something hurts (not just uncomfortable, but actual pain), back off or stop. It\'s better to miss one run than be injured for weeks.',
    'Warm up before running with dynamic stretches and a few minutes of easy jogging. Save static stretching for after your run.',
    'Stay hydrated throughout the day, not just during your run. Your hydration status is cumulative.',
    'Consistency beats intensity. It\'s better to complete 80% of your training at the right effort than to crush every workout and burn out.',
    'Recovery runs count as training. Don\'t skip rest days or easy runs thinking you\'re being tough. Smart training includes strategic rest.'
  ];
};

export function CalendarView({ planData, completedWorkouts, planStartDate, selectedDate, onDateSelect, onToggleCompletion }: CalendarViewProps) {
  const startDate = parseLocalDate(planStartDate);

  const [currentMonth, setCurrentMonth] = useState(() => {
    // Initialize to the month containing selectedDate if provided, otherwise today
    if (selectedDate) {
      return parseLocalDate(selectedDate);
    }
    return new Date();
  });
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutDetails | null>(null);
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const referenceDate = (planData.days && planData.start_date) ? parseLocalDate(planData.start_date) : new Date();
    const dayOfWeek = referenceDate.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(referenceDate);
    monday.setDate(referenceDate.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1)),
    onSwipeRight: () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1)),
    threshold: 50
  });

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek, firstDay, lastDay };
  };

  const getWorkoutForDate = (date: Date) => {
    // Guard: Check if plan data exists
    if (!planData || !planData.plan || planData.plan.length === 0) {
      return null;
    }

    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);
    const dateStr = getDateStringFromDate(normalizedDate);

    // For date-based plans, use the days array directly
    if (planData.days && Array.isArray(planData.days)) {
      const dayData = planData.days.find((d) => d.date === dateStr);

      if (!dayData) {
        return null;
      }

      const dateDayOfWeek = normalizedDate.getDay();
      const dateDayIndex = dateDayOfWeek === 0 ? 6 : dateDayOfWeek - 1;
      const dayName = dayOrder[dateDayIndex];

      // Calculate week number for consistent completion key format
      const weekIndex = planData.plan.findIndex((week: any) => {
        if (!week || !week.days) return false;
        const weekDayData = week.days[dayName];
        return weekDayData && weekDayData.date === dateStr;
      });

      const weekNumber = weekIndex >= 0 && planData.plan[weekIndex]?.week
        ? planData.plan[weekIndex].week
        : weekIndex + 1;

      // Use consistent completion key format: week_number-day_name
      const completionKey = `${weekNumber}-${dayName}`;
      const isCompleted = completedWorkouts.has(completionKey);

      return {
        weekNumber,
        dayName,
        activity: dayData.workout || 'Rest',
        tips: dayData.tips || [],
        isCompleted,
        date: normalizedDate
      };
    }

    // Fallback to weekly-based logic for older plans
    const normalizedStartDate = new Date(startDate);
    normalizedStartDate.setHours(0, 0, 0, 0);

    // Calculate the actual day of the week for this date
    const dateDayOfWeek = normalizedDate.getDay();
    const dateDayIndex = dateDayOfWeek === 0 ? 6 : dateDayOfWeek - 1; // Convert to Mon=0, Sun=6
    const dayName = dayOrder[dateDayIndex];

    // Find which Monday the plan started on
    const startDayOfWeek = normalizedStartDate.getDay();
    const startDayIndex = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1; // Convert to Mon=0, Sun=6
    const daysToMonday = startDayIndex; // Days since the Monday of the first week
    const planWeekStart = new Date(normalizedStartDate);
    planWeekStart.setDate(normalizedStartDate.getDate() - daysToMonday);
    planWeekStart.setHours(0, 0, 0, 0);

    // Find which Monday the current date is in
    const currentDayIndex = dateDayIndex;
    const currentWeekStart = new Date(normalizedDate);
    currentWeekStart.setDate(normalizedDate.getDate() - currentDayIndex);
    currentWeekStart.setHours(0, 0, 0, 0);

    // Calculate week number based on Monday-to-Monday weeks
    const weeksDiff = Math.floor((currentWeekStart.getTime() - planWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));

    // Guard: Check bounds
    if (weeksDiff < 0 || weeksDiff >= planData.plan.length) {
      return null;
    }

    const week = planData.plan[weeksDiff];

    // Guard: Check if week exists and has days
    if (!week || !week.days) {
      return null;
    }

    const dayData = week.days[dayName];

    // Guard: Check if day data exists
    if (!dayData) {
      return null;
    }

    const activity = typeof dayData === 'string' ? dayData : dayData.workout;
    const tips = typeof dayData === 'object' ? dayData.tips : null;
    const completionKey = `${week.week}-${dayName}`;
    const isCompleted = completedWorkouts.has(completionKey);

    return {
      weekNumber: week.week,
      dayName,
      activity,
      tips: tips || getCoachingNotes(activity),
      isCompleted,
      date
    };
  };

  const getDayColor = (activity: string) => {
    const activityLower = activity.toLowerCase();
    if (activityLower.includes('rest')) {
      return 'bg-gray-200 border-gray-400 text-gray-800 dark:bg-gray-700 dark:border-gray-500 dark:text-gray-100';
    }
    if (activityLower.includes('long')) {
      return 'bg-orange-100 border-orange-400 text-orange-800 dark:bg-orange-900/40 dark:border-orange-500 dark:text-orange-200';
    }
    if (activityLower.includes('interval') ||
        activityLower.includes('tempo') ||
        activityLower.includes('hill') ||
        activityLower.includes('fartlek') ||
        /\d+\s*x\s*[(\d]/.test(activityLower)) {
      return 'bg-red-100 border-red-400 text-red-800 dark:bg-red-900/40 dark:border-red-500 dark:text-red-200';
    }
    return 'bg-blue-100 border-blue-400 text-blue-800 dark:bg-blue-900/40 dark:border-blue-500 dark:text-blue-200';
  };

  const getDayIndicatorColor = (activity: string) => {
    const activityLower = activity.toLowerCase();
    if (activityLower.includes('rest')) {
      return 'bg-gray-400';
    }
    if (activityLower.includes('long')) {
      return 'bg-orange-500';
    }
    if (activityLower.includes('interval') ||
        activityLower.includes('tempo') ||
        activityLower.includes('hill') ||
        activityLower.includes('fartlek') ||
        /\d+\s*x\s*[(\d]/.test(activityLower)) {
      return 'bg-red-500';
    }
    return 'bg-blue-500';
  };

  const { daysInMonth, startingDayOfWeek} = getDaysInMonth(currentMonth);
  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));

  const prevWeek = () => {
    const newWeekStart = new Date(currentWeekStart);
    newWeekStart.setDate(currentWeekStart.getDate() - 7);
    setCurrentWeekStart(newWeekStart);
  };

  const nextWeek = () => {
    const newWeekStart = new Date(currentWeekStart);
    newWeekStart.setDate(currentWeekStart.getDate() + 7);
    setCurrentWeekStart(newWeekStart);
  };

  const goToToday = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    setCurrentWeekStart(monday);
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const isToday = (day: number) => {
    const today = new Date();
    return (
      day === today.getDate() &&
      currentMonth.getMonth() === today.getMonth() &&
      currentMonth.getFullYear() === today.getFullYear()
    );
  };

  const blanks = [];
  const adjustedStartDay = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1;
  for (let i = 0; i < adjustedStartDay; i++) {
    blanks.push(<div key={`blank-${i}`} className="h-16 md:h-32 bg-gray-50 dark:bg-neutral-950 border border-gray-200 dark:border-neutral-800"></div>);
  }

  // Helper to safely extract date string from workout
  const getWorkoutDateString = (workout: WorkoutDetails): string => {
    if (!workout.date) return '';

    // If it's already a string, return it
    if (typeof workout.date === 'string') {
      return workout.date;
    }

    // If it's a Date object, convert it
    if (workout.date instanceof Date) {
      return getDateStringFromDate(workout.date);
    }

    // Fallback: try to extract from the date
    try {
      return getDateStringFromDate(workout.date as Date);
    } catch {
      return '';
    }
  };

  // Helper to check if a date is in the selected week
  const isInSelectedWeek = (date: Date) => {
    if (!selectedDate) return false;
    const selected = parseLocalDate(selectedDate);
    const selectedDayOfWeek = selected.getDay();
    const selectedDayIndex = selectedDayOfWeek === 0 ? 6 : selectedDayOfWeek - 1;
    const selectedMonday = new Date(selected);
    selectedMonday.setDate(selected.getDate() - selectedDayIndex);
    selectedMonday.setHours(0, 0, 0, 0);

    const dateDayOfWeek = date.getDay();
    const dateDayIndex = dateDayOfWeek === 0 ? 6 : dateDayOfWeek - 1;
    const dateMonday = new Date(date);
    dateMonday.setDate(date.getDate() - dateDayIndex);
    dateMonday.setHours(0, 0, 0, 0);

    return dateMonday.getTime() === selectedMonday.getTime();
  };

  const days = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const workout = getWorkoutForDate(date);
    const today = isToday(day);
    const inSelectedWeek = isInSelectedWeek(date);

    days.push(
      <div
        key={day}
        className={`h-16 md:h-32 border border-gray-200 dark:border-neutral-800 p-2 md:p-3 transition-all bg-white dark:bg-neutral-900 ${
          today ? 'ring-2 ring-blue-500 dark:ring-primary-500' : ''
        } ${inSelectedWeek ? 'bg-primary-50 dark:bg-primary-950/30' : ''} ${workout ? 'cursor-pointer hover:shadow-lg hover:scale-105 md:hover:scale-[1.02] active:scale-100 touch-manipulation' : ''}`}
        onClick={() => {
          if (workout) {
            setSelectedWorkout(workout);
            if (onDateSelect) {
              const dateStr = getWorkoutDateString(workout);
              if (dateStr) {
                console.log('[CalendarView] Date clicked:', dateStr, 'dayName:', workout.dayName);
                onDateSelect(dateStr);
              }
            }
          }
        }}
        role={workout ? 'button' : undefined}
        aria-label={workout ? `${workout.dayName}: ${removeMarkdownFormatting(workout.activity)}` : undefined}
        tabIndex={workout ? 0 : undefined}
        onKeyDown={(e) => {
          if (workout && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setSelectedWorkout(workout);
            if (onDateSelect) {
              const dateStr = getWorkoutDateString(workout);
              if (dateStr) {
                console.log('[CalendarView] Date clicked (keyboard):', dateStr, 'dayName:', workout.dayName);
                onDateSelect(dateStr);
              }
            }
          }
        }}
      >
        <div className="flex flex-col h-full overflow-hidden">
          <div className="flex items-start justify-between mb-1">
            <span className={`text-sm md:text-base font-semibold ${today ? 'text-blue-600 dark:text-primary-400' : 'text-gray-700 dark:text-neutral-300'}`}>
              {day}
            </span>
            {workout?.isCompleted && (
              <Check className="hidden md:block w-4 h-4 text-green-500 dark:text-green-400" aria-label="Completed" />
            )}
          </div>

          {workout && (
            <>
              <div className="flex md:hidden items-center justify-center flex-1 py-1">
                <div className={`w-4 h-4 rounded-full ${getDayIndicatorColor(workout.activity)} flex items-center justify-center ${workout.isCompleted ? 'ring-2 ring-green-500 dark:ring-green-400' : ''}`}>
                  {workout.isCompleted && (
                    <Check className="w-2.5 h-2.5 text-white" aria-label="Completed" />
                  )}
                </div>
              </div>

              <div className={`hidden md:block text-xs font-medium p-1.5 rounded border leading-tight flex-1 overflow-hidden ${getDayColor(workout.activity)} ${workout.isCompleted ? 'opacity-60 line-through' : ''}`}>
                {(() => {
                  const sections = parseWorkoutSections(workout.activity);
                  const rawText = sections.work || workout.activity;
                  const displayText = removeMarkdownFormatting(rawText);
                  return displayText.length > 45 ? displayText.substring(0, 45) + '...' : displayText;
                })()}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white dark:bg-neutral-900 border-2 border-gray-200 dark:border-neutral-800 rounded-lg shadow-md p-4 md:p-6">
        <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl md:text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 md:w-6 md:h-6 text-blue-600 dark:text-primary-500" />
            <span className="hidden sm:inline">Calendar View</span>
            <span className="sm:hidden">Calendar</span>
          </h2>
          <div className="flex items-center justify-between sm:justify-start gap-3">
            <button
              onClick={goToToday}
              className="px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-medium transition-colors text-sm"
              aria-label="Go to today"
            >
              Today
            </button>
            <button
              onClick={prevMonth}
              className="p-3 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-full transition-colors touch-manipulation active:scale-95"
              aria-label="Previous month"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              <ChevronLeft className="w-5 h-5 text-gray-700 dark:text-neutral-300" />
            </button>
            <span className="text-base md:text-lg font-semibold text-gray-800 dark:text-white min-w-[140px] md:min-w-[180px] text-center">
              {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </span>
            <button
              onClick={nextMonth}
              className="p-3 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-full transition-colors touch-manipulation active:scale-95"
              aria-label="Next month"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              <ChevronRight className="w-5 h-5 text-gray-700 dark:text-neutral-300" />
            </button>
          </div>
        </div>

        <div
          className="grid grid-cols-7 gap-0 border border-gray-200 dark:border-neutral-700 rounded-lg overflow-hidden touch-manipulation"
          style={{ touchAction: 'pan-y' }}
          {...swipeHandlers}
        >
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => (
            <div key={idx} className="bg-gray-100 dark:bg-neutral-800 text-gray-800 dark:text-neutral-200 text-center py-2 md:py-3 font-bold text-xs md:text-sm border-r border-gray-200 dark:border-neutral-700 last:border-r-0">
              <span className="hidden sm:inline">{day}</span>
              <span className="sm:hidden">{day.substring(0, 1)}</span>
            </div>
          ))}
          {blanks}
          {days}
        </div>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs md:text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-400 rounded-full flex-shrink-0"></div>
            <span className="text-gray-700 dark:text-neutral-300">Rest Day</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 rounded-full flex-shrink-0"></div>
            <span className="text-gray-700 dark:text-neutral-300">Easy Run</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded-full flex-shrink-0"></div>
            <span className="text-gray-700 dark:text-neutral-300">Intervals/Tempo</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-orange-500 rounded-full flex-shrink-0"></div>
            <span className="text-gray-700 dark:text-neutral-300">Long Run</span>
          </div>
        </div>
      </div>

      {selectedWorkout && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedWorkout(null)}>
          <div className="bg-white dark:bg-neutral-900 border-2 border-gray-200 dark:border-neutral-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 text-white p-6 rounded-t-xl backdrop-blur-sm z-10">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <CalendarIcon className="w-5 h-5" />
                    <span className="text-sm font-medium opacity-90">
                      {selectedWorkout.dayName}, {selectedWorkout.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  {(() => {
                    const sections = parseWorkoutSections(selectedWorkout.activity);
                    const hasSections = sections.warmUp || sections.work || sections.coolDown;

                    if (!hasSections) {
                      return <h3 className="text-2xl font-bold">{renderMarkdownText(selectedWorkout.activity)}</h3>;
                    }

                    return (
                      <div className="space-y-2">
                        {sections.warmUp && (
                          <div>
                            <span className="font-bold text-lg">Warm up:</span>
                            <span className="text-lg ml-2">{removeMarkdownFormatting(sections.warmUp)}</span>
                          </div>
                        )}
                        {sections.work && (
                          <div>
                            <span className="font-bold text-lg">Work:</span>
                            <span className="text-lg ml-2">{removeMarkdownFormatting(sections.work)}</span>
                          </div>
                        )}
                        {sections.coolDown && (
                          <div>
                            <span className="font-bold text-lg">Cool down:</span>
                            <span className="text-lg ml-2">{removeMarkdownFormatting(sections.coolDown)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {selectedWorkout.isCompleted && (
                    <div className="mt-3 inline-flex items-center gap-1 bg-green-500 bg-opacity-20 text-white px-3 py-1 rounded-full text-sm">
                      <Check className="w-4 h-4" />
                      Completed
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSelectedWorkout(null)}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-3 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
                  aria-label="Close workout details"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6">
              {(() => {
                const parsed = parseWorkoutDescription(selectedWorkout.activity);
                return parsed.distance || parsed.duration || parsed.pace ? (
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    {parsed.distance && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300 dark:border-blue-600 rounded-lg p-4 text-center">
                        <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
                        <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{parsed.distance}</div>
                        <div className="text-xs text-gray-600 dark:text-neutral-400 mt-1">Distance</div>
                      </div>
                    )}
                    {parsed.duration && (
                      <div className="bg-purple-50 dark:bg-purple-900/20 border-2 border-purple-300 dark:border-purple-600 rounded-lg p-4 text-center">
                        <Clock className="w-5 h-5 text-purple-600 dark:text-purple-400 mx-auto mb-2" />
                        <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">{parsed.duration}</div>
                        <div className="text-xs text-gray-600 dark:text-neutral-400 mt-1">Duration</div>
                      </div>
                    )}
                    {parsed.pace && (
                      <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-300 dark:border-green-600 rounded-lg p-4 text-center">
                        <Zap className="w-5 h-5 text-green-600 dark:text-green-400 mx-auto mb-2" />
                        <div className="text-2xl font-bold text-green-700 dark:text-green-300">{parsed.pace}</div>
                        <div className="text-xs text-gray-600 dark:text-neutral-400 mt-1">Pace</div>
                      </div>
                    )}
                  </div>
                ) : null;
              })()}

              <div className="space-y-4">
                <h4 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-blue-600 dark:text-primary-500" />
                  Coaching Notes
                </h4>
                <div className="space-y-3">
                  {selectedWorkout.tips.map((tip, index) => (
                    <div key={index} className="flex gap-3 bg-gray-50 dark:bg-neutral-800 border-2 border-gray-200 dark:border-neutral-700 rounded-lg p-4">
                      <div className="flex-shrink-0 w-6 h-6 bg-blue-500 dark:bg-primary-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                        {index + 1}
                      </div>
                      <p className="text-sm text-gray-700 dark:text-neutral-300 leading-relaxed">{tip}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Complete Workout Button */}
              {onToggleCompletion && !selectedWorkout.isCompleted && (
                <div className="mt-6 pt-6 border-t-2 border-gray-200 dark:border-neutral-700">
                  <button
                    onClick={() => {
                      onToggleCompletion(selectedWorkout.weekNumber, selectedWorkout.dayName, selectedWorkout.activity);
                      setSelectedWorkout(null);
                    }}
                    className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl active:scale-95"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Complete Workout
                  </button>
                </div>
              )}

              {selectedWorkout.isCompleted && (
                <div className="mt-6 pt-6 border-t-2 border-gray-200 dark:border-neutral-700">
                  <div className="bg-green-50 dark:bg-green-900/20 border-2 border-green-300 dark:border-green-600 rounded-lg p-4 text-center">
                    <div className="flex items-center justify-center gap-2 text-green-700 dark:text-green-400 font-semibold">
                      <Check className="w-5 h-5" />
                      Workout Completed
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
