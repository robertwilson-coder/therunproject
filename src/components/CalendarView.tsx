import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Check, X, Clock, Zap, Activity, BookOpen } from 'lucide-react';
import { useState } from 'react';
import { PlanData } from '../lib/supabase';
import { parseWorkoutDescription } from '../utils/workoutParser';

interface CalendarViewProps {
  planData: PlanData;
  completedWorkouts: Set<string>;
  onWorkoutClick: (weekNumber: number, dayName: string) => void;
  planStartDate: string;
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

export function CalendarView({ planData, completedWorkouts, planStartDate }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutDetails | null>(null);
  const startDate = new Date(planStartDate);

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
    const diffTime = date.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0 || diffDays >= planData.plan.length * 7) {
      return null;
    }

    const weekNumber = Math.floor(diffDays / 7);
    const dayIndex = diffDays % 7;
    const dayName = dayOrder[dayIndex];
    const week = planData.plan[weekNumber];

    if (!week) return null;

    const dayData = week.days[dayName];
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
    if (activity.toLowerCase().includes('rest')) {
      return 'bg-gray-700 border-gray-600 text-gray-300';
    }
    if (activity.toLowerCase().includes('long')) {
      return 'bg-orange-900 bg-opacity-30 border-orange-600 text-orange-300';
    }
    if (activity.toLowerCase().includes('interval') || activity.toLowerCase().includes('tempo')) {
      return 'bg-red-900 bg-opacity-30 border-red-600 text-red-300';
    }
    return 'bg-blue-900 bg-opacity-30 border-blue-600 text-blue-300';
  };

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentMonth);
  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));

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
    blanks.push(<div key={`blank-${i}`} className="h-20 md:h-24 bg-dark-gray border border-border-gray"></div>);
  }

  const days = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    const workout = getWorkoutForDate(date);
    const today = isToday(day);

    days.push(
      <div
        key={day}
        className={`h-20 md:h-24 border border-border-gray p-1 md:p-2 overflow-hidden transition-all bg-dark-gray ${
          today ? 'ring-2 ring-brand-pink' : ''
        } ${workout ? 'cursor-pointer hover:shadow-md hover:scale-105 hover:border-brand-blue' : ''}`}
        onClick={() => workout && setSelectedWorkout(workout)}
      >
        <div className="flex items-start justify-between mb-1">
          <span className={`text-xs md:text-sm font-semibold ${today ? 'text-brand-pink' : 'text-white'}`}>
            {day}
          </span>
          {workout?.isCompleted && (
            <Check className="w-3 h-3 md:w-4 md:h-4 text-brand-pink" />
          )}
        </div>
        {workout && (
          <div className={`text-[10px] md:text-xs p-0.5 md:p-1 rounded border leading-tight ${getDayColor(workout.activity)} ${workout.isCompleted ? 'opacity-60 line-through' : ''}`}>
            {workout.activity.length > 30 ? workout.activity.substring(0, 30) + '...' : workout.activity}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="bg-neon-black border-2 border-border-gray rounded-lg shadow-md p-4 md:p-6">
        <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 md:w-6 md:h-6 text-brand-pink" />
            Calendar View
          </h2>
          <div className="flex items-center justify-between sm:justify-start gap-3">
            <button
              onClick={prevMonth}
              className="p-2 hover:bg-mid-gray rounded-full transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
            <span className="text-base md:text-lg font-semibold text-white min-w-[140px] md:min-w-[180px] text-center">
              {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </span>
            <button
              onClick={nextMonth}
              className="p-2 hover:bg-mid-gray rounded-full transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-0 border border-border-gray rounded-lg overflow-hidden">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => (
            <div key={idx} className="bg-mid-gray text-white text-center py-2 md:py-3 font-bold text-xs md:text-sm border-r border-border-gray last:border-r-0">
              {day}
            </div>
          ))}
          {blanks}
          {days}
        </div>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-700 border-2 border-gray-600 rounded"></div>
            <span className="text-gray-300">Rest Day</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-900 bg-opacity-30 border-2 border-blue-600 rounded"></div>
            <span className="text-gray-300">Easy Run</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-900 bg-opacity-30 border-2 border-red-600 rounded"></div>
            <span className="text-gray-300">Intervals/Tempo</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-orange-900 bg-opacity-30 border-2 border-orange-600 rounded"></div>
            <span className="text-gray-300">Long Run</span>
          </div>
        </div>
      </div>

      {selectedWorkout && (
        <div className="fixed inset-0 bg-gradient-to-br from-gray-900 to-gray-800 bg-opacity-95 flex items-center justify-center z-50 p-4" onClick={() => setSelectedWorkout(null)}>
          <div className="bg-dark-gray border-2 border-brand-pink rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-gradient-to-r from-brand-blue to-brand-pink text-white p-6 rounded-t-xl">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <CalendarIcon className="w-5 h-5" />
                    <span className="text-sm font-medium opacity-90">
                      {selectedWorkout.dayName}, {selectedWorkout.date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold">{selectedWorkout.activity}</h3>
                  {selectedWorkout.isCompleted && (
                    <div className="mt-2 inline-flex items-center gap-1 bg-brand-pink bg-opacity-20 text-white px-3 py-1 rounded-full text-sm">
                      <Check className="w-4 h-4" />
                      Completed
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSelectedWorkout(null)}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6">
              {(() => {
                const parsed = parseWorkoutDescription(selectedWorkout.activity);
                return parsed.distance || parsed.duration || parsed.pace ? (
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    {parsed.distance && (
                      <div className="bg-brand-blue bg-opacity-20 border-2 border-brand-blue rounded-lg p-4 text-center">
                        <Activity className="w-5 h-5 text-brand-blue mx-auto mb-2" />
                        <div className="text-2xl font-bold text-brand-blue">{parsed.distance}</div>
                        <div className="text-xs text-gray-400 mt-1">Distance</div>
                      </div>
                    )}
                    {parsed.duration && (
                      <div className="bg-brand-pink bg-opacity-20 border-2 border-brand-pink rounded-lg p-4 text-center">
                        <Clock className="w-5 h-5 text-brand-pink mx-auto mb-2" />
                        <div className="text-2xl font-bold text-brand-pink">{parsed.duration}</div>
                        <div className="text-xs text-gray-400 mt-1">Duration</div>
                      </div>
                    )}
                    {parsed.pace && (
                      <div className="bg-brand-blue bg-opacity-20 border-2 border-brand-blue rounded-lg p-4 text-center">
                        <Zap className="w-5 h-5 text-brand-blue mx-auto mb-2" />
                        <div className="text-2xl font-bold text-brand-blue">{parsed.pace}</div>
                        <div className="text-xs text-gray-400 mt-1">Pace</div>
                      </div>
                    )}
                  </div>
                ) : null;
              })()}

              <div className="space-y-4">
                <h4 className="text-lg font-bold text-white flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-brand-pink" />
                  Coaching Notes
                </h4>
                <div className="space-y-3">
                  {selectedWorkout.tips.map((tip, index) => (
                    <div key={index} className="flex gap-3 bg-neon-black border-2 border-border-gray rounded-lg p-4">
                      <div className="flex-shrink-0 w-6 h-6 bg-brand-blue text-white rounded-full flex items-center justify-center text-sm font-bold">
                        {index + 1}
                      </div>
                      <p className="text-sm text-gray-300 leading-relaxed">{tip}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
