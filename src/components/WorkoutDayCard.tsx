import { ChevronDown, Check, BookOpen, Heart, ArrowRight, TrendingDown } from 'lucide-react';
import { renderMarkdown, getDayColor, extractRPEFromActivity } from '../utils/trainingPlanUtils';
import { getRPEDescription } from '../utils/coachingNotes';

interface TrainingPaces {
  easyPace: string;
  longRunPace: string;
  tempoPace: string;
  intervalPace: string;
  racePace: string;
}

interface WorkoutDayCardProps {
  day: string;
  activity: string;
  aiTips: string[] | null;
  isBeginnerPlan: boolean;
  weekNumber: number;
  isCurrentDay: boolean;
  isCompleted: boolean;
  isExpanded: boolean;
  isBeforeStart: boolean;
  isRestDay: boolean;
  isPreviewMode: boolean;
  savedPlanId: string | null;
  planType: 'static' | 'responsive' | 'date_based_preview' | 'date_based_full';
  trainingPaces: TrainingPaces | null;
  userHRZones: any;
  user: any;
  workoutType?: 'normal' | 'calibration';
  calibrationTag?: {
    kind: 'calibration';
    testType: string;
  };
  onToggleExpanded: () => void;
  onToggleCompletion: (e: React.MouseEvent) => void;
  onMove: () => void;
  onMakeEasier: () => void;
}

const getWorkoutHRZone = (activity: string, userHRZones: any) => {
  if (!userHRZones) return null;

  const activityLower = activity.toLowerCase();

  if (activityLower.includes('interval') || activityLower.includes('repeat') ||
      activityLower.includes('x (') || activityLower.includes('x(') ||
      (activityLower.includes('x ') && (activityLower.includes('m ') || activityLower.includes('km ')))) {
    return { zone: 'Zone 5', range: `${userHRZones.zone5_min}-${userHRZones.zone5_max} bpm`, description: 'Hard effort' };
  } else if (activityLower.includes('tempo') || activityLower.includes('threshold') ||
             activityLower.includes('progressive')) {
    return { zone: 'Zone 4', range: `${userHRZones.zone4_min}-${userHRZones.zone4_max} bpm`, description: 'Comfortably hard' };
  } else if (activityLower.includes('hill') || activityLower.includes('fartlek')) {
    return { zone: 'Zone 4-5', range: `${userHRZones.zone4_min}-${userHRZones.zone5_max} bpm`, description: 'Hard varied effort' };
  } else if (activityLower.includes('long')) {
    return { zone: 'Zone 2-3', range: `${userHRZones.zone2_min}-${userHRZones.zone3_max} bpm`, description: 'Comfortable endurance' };
  } else if (activityLower.includes('easy') || activityLower.includes('recovery')) {
    return { zone: 'Zone 2', range: `${userHRZones.zone2_min}-${userHRZones.zone2_max} bpm`, description: 'Easy conversational pace' };
  }

  return null;
};

const getPaceForWorkout = (activity: string, trainingPaces: TrainingPaces | null): string | null => {
  if (!trainingPaces) return null;

  const activityLower = activity.toLowerCase();

  if (activityLower.includes('interval') || activityLower.includes('fartlek') || /\d+\s*x\s*[(\d]/.test(activityLower)) {
    return `${trainingPaces.intervalPace} (work) / ${trainingPaces.easyPace} (recovery)`;
  }
  if (activityLower.includes('hill')) {
    return `${trainingPaces.intervalPace} (uphill) / ${trainingPaces.easyPace} (recovery)`;
  }
  if (activityLower.includes('tempo')) {
    return trainingPaces.tempoPace;
  }
  if (activityLower.includes('race')) {
    return trainingPaces.racePace;
  }
  if (activityLower.includes('long')) {
    return trainingPaces.longRunPace;
  }
  if (activityLower.includes('easy') || activityLower.includes('recovery') || activityLower === 'rest') {
    return trainingPaces.easyPace;
  }
  return null;
};

export function WorkoutDayCard({
  day,
  activity,
  aiTips,
  isBeginnerPlan,
  weekNumber,
  isCurrentDay,
  isCompleted,
  isExpanded,
  isBeforeStart,
  isRestDay,
  isPreviewMode,
  savedPlanId,
  planType,
  trainingPaces,
  userHRZones,
  user,
  workoutType,
  calibrationTag,
  onToggleExpanded,
  onToggleCompletion,
  onMove,
  onMakeEasier
}: WorkoutDayCardProps) {
  // Convert short day names to full names
  const dayNameMap: Record<string, string> = {
    'Mon': 'Monday',
    'Tue': 'Tuesday',
    'Wed': 'Wednesday',
    'Thu': 'Thursday',
    'Fri': 'Friday',
    'Sat': 'Saturday',
    'Sun': 'Sunday'
  };
  const fullDayName = dayNameMap[day] || day;

  const activityLower = activity.toLowerCase();
  const isCalibrationRun = workoutType === 'calibration' || activityLower.includes('calibration') ||
    (weekNumber === 1 &&
     activityLower.includes('warm up:') &&
     activityLower.includes('work:') &&
     activityLower.includes('cool down:') &&
     (activityLower.includes('controlled') ||
      activityLower.includes('hard') ||
      activityLower.includes('rpe 7') ||
      activityLower.includes('rpe 8') ||
      activityLower.includes('continuous')) &&
     !activityLower.includes('easy') &&
     !activityLower.includes('x ') &&
     !activityLower.includes(' x') &&
     !activityLower.includes('reps') &&
     !activityLower.includes('recovery') &&
     !activityLower.includes('active recovery'));

  const extractedRPE = extractRPEFromActivity(activity);
  const rpeDescription = extractedRPE ? getRPEDescription(extractedRPE, isBeginnerPlan) : '';
  const coachingNotes = isBeforeStart || isCalibrationRun ? [] : (aiTips && aiTips.length > 0 ? aiTips : [rpeDescription]);
  const hrZone = isCalibrationRun ? null : getWorkoutHRZone(activity, userHRZones);

  return (
    <div className="flex-1 flex flex-col relative">
      {user && savedPlanId && !isPreviewMode && !isBeforeStart && !isRestDay && (
        <button
          onClick={onToggleCompletion}
          className={`absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center transition-all hover:scale-110 z-10 ${
            isCompleted
              ? 'bg-green-500 hover:bg-green-600'
              : 'bg-neutral-200 dark:bg-neutral-800 border border-neutral-400 dark:border-neutral-700 hover:border-neutral-500 dark:hover:border-neutral-600'
          }`}
        >
          {isCompleted && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
        </button>
      )}
      <div
        onClick={!isBeforeStart && !isCalibrationRun ? onToggleExpanded : undefined}
        className={`rounded-lg ${isRestDay ? 'p-3' : 'p-4 md:p-5'} transition-all text-left w-full relative overflow-hidden ${
          isCompleted
            ? 'bg-green-100 dark:bg-green-500/10 border-green-400 dark:border-green-500/30'
            : isCalibrationRun
            ? 'bg-gradient-to-br from-teal-500/20 via-cyan-500/20 to-blue-500/20 dark:from-teal-500/30 dark:via-cyan-500/30 dark:to-blue-500/30 border-teal-400 dark:border-teal-400'
            : getDayColor(activity, isCurrentDay)
        } ${
          isBeforeStart ? 'opacity-40' : ''
        } ${
          !isBeforeStart && !isCalibrationRun ? 'hover:shadow-xl hover:border-neutral-400 dark:hover:border-neutral-700 cursor-pointer active:scale-[0.99]' : 'cursor-default'
        } ${isCalibrationRun && !isCompleted ? 'border-[4px]' : 'border-2'}`}
      >
        {isRestDay ? (
          <div className="flex items-center gap-2">
            <div className="font-bold text-base md:text-lg text-neutral-900 dark:text-white">
              {fullDayName}
            </div>
            <div
              className={`text-sm md:text-base font-medium text-neutral-900 dark:text-neutral-100 ${
                isBeforeStart ? 'text-neutral-400 italic' : ''
              }`}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(activity) }}
            />
          </div>
        ) : (
          <>
            {isCalibrationRun && !isCompleted && (
              <div className="mb-4 relative z-10">
                <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 text-white font-black uppercase tracking-widest text-sm border-2 border-white/30">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                  </span>
                  <span className="text-lg">🎯</span>
                  Performance Calibration Test
                </div>
              </div>
            )}
            <div className="flex items-start justify-between gap-3 pr-6">
              <div className="flex-shrink-0">
                <div className="font-bold text-base md:text-lg mb-1 text-neutral-900 dark:text-white">
                  {fullDayName}
                </div>
              </div>
              <div className="flex-1">
                <div
                  className={`text-sm md:text-base leading-relaxed font-medium mb-2 text-neutral-900 dark:text-neutral-100 ${
                    isCompleted ? 'line-through opacity-60' : ''
                  } ${isBeforeStart ? 'text-neutral-400 italic' : ''}`}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(activity) }}
                />
                {trainingPaces && !activity.toLowerCase().includes('active recovery') && !activity.includes('/km') && !activity.includes('@ ') && (
                  <div className="text-xs text-primary-600 dark:text-primary-300 font-semibold mb-1">
                    Target Pace: {getPaceForWorkout(activity, trainingPaces)}
                  </div>
                )}
                {hrZone && (
                  <div className="text-xs text-red-600 dark:text-red-300 font-semibold flex items-center gap-1">
                    <Heart className="w-3 h-3" />
                    <span>{hrZone.zone}: {hrZone.range}</span>
                  </div>
                )}
              </div>
            </div>
            {!isCalibrationRun && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-neutral-300 dark:border-neutral-800">
                <div className="flex items-center gap-2">
                  {/* LEGACY: Move/modify buttons only for responsive/date_based plans */}
                  {/* Could be enabled for all saved plans since all new plans support modifications */}
                  {!isBeforeStart && !isCompleted && savedPlanId && (planType === 'responsive' || planType === 'date_based_preview' || planType === 'date_based_full') && (
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onMove();
                        }}
                        className="p-1.5 bg-primary-500 hover:bg-primary-600 text-white rounded transition-all"
                        title="Move this workout"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onMakeEasier();
                        }}
                        className="p-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded transition-all"
                        title="Make easier"
                      >
                        <TrendingDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 transition-transform duration-300 text-neutral-600 dark:text-neutral-400 ${isExpanded ? 'rotate-180' : ''}`} />
              </div>
            )}
          </>
        )}
      </div>

      {isExpanded && !isBeforeStart && (coachingNotes.length > 0 || (!isRestDay && hrZone)) && (
        <div className="mt-2 p-5 bg-neutral-100 dark:bg-neutral-800/90 border-2 border-primary-500/30 rounded-lg shadow-md">
          {coachingNotes.length > 0 && (
            <div className="mb-4">
              <h4 className="font-bold text-base flex items-center gap-2 text-primary-600 dark:text-primary-300">
                <BookOpen className="w-5 h-5" />
                Coaching Notes
              </h4>
            </div>
          )}
          {!isRestDay && hrZone && (
            <div className={`p-4 bg-red-500/15 border-2 border-red-500/40 rounded-lg ${coachingNotes.length > 0 ? 'mb-4' : ''}`}>
              <div className="flex items-center gap-2 mb-2">
                <Heart className="w-5 h-5 text-red-600 dark:text-red-300" />
                <h5 className="font-bold text-sm text-red-600 dark:text-red-300">Target Heart Rate</h5>
              </div>
              <div className="text-sm text-neutral-900 dark:text-neutral-100 mb-2">
                <span className="font-semibold">{hrZone.zone}:</span> {hrZone.range} <span className="text-neutral-700 dark:text-neutral-300">({hrZone.description})</span>
              </div>
              <div className="text-xs text-neutral-900 dark:text-neutral-200 italic bg-white/70 dark:bg-neutral-900/70 p-3 rounded border border-red-500/30">
                <p className="mb-1"><strong>Remember:</strong> HR naturally varies 5-10 bpm based on heat, fatigue, hydration, stress, and altitude.</p>
                <p>Use HR zones as a guide alongside perceived effort. If your HR seems high but you feel good, trust your body. Focus on effort level rather than hitting exact numbers.</p>
              </div>
            </div>
          )}
          {coachingNotes.length > 0 && (
            <ul className="space-y-0.5">
              {coachingNotes.map((note, index) => (
                <li key={index} className="text-sm text-neutral-900 dark:text-neutral-100 flex gap-3">
                  <span className="text-primary-600 dark:text-primary-300 font-bold text-lg leading-none">•</span>
                  <span className="leading-snug" dangerouslySetInnerHTML={{ __html: renderMarkdown(note) }} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
