import { Calendar, Save, List, Download, Undo, CalendarDays } from 'lucide-react';
import { logger } from '../utils/logger';
import { PlanData } from '../lib/supabase';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { CalendarView } from './CalendarView';
import { BadgeCelebration } from './BadgeCelebration';
import { generateICalFile, downloadICalFile } from '../utils/calendarExport';
import { getTodayInfo, getTimeProgress, dayOrder } from '../utils/trainingPlanUtils';
import { getDateStringFromDate, findWeekIndexForDate, addDays, getWeekDateRange, formatDateRange } from '../utils/dateUtils';
import { PlanHeader } from './PlanHeader';
import { WeekView } from './WeekView';
import { DayView } from './DayView';
import { WorkoutCompletionModal } from './WorkoutCompletionModal';
import { CalibrationCompletionModal } from './CalibrationCompletionModal';
import { WorkoutModificationModal } from './WorkoutModificationModal';
import { WorkoutCelebrationModal } from './WorkoutCelebrationModal';
import { ProgressPanel } from './ProgressPanel';
import { useWorkoutOperations } from '../hooks/useWorkoutOperations';
import { usePlanModifications } from '../hooks/usePlanModifications';
import { isDebugModeEnabled } from '../utils/debugMode';
import type { ProgressPanel as ProgressPanelType } from '../types';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface TrainingPaces {
  easyPace: string;
  longRunPace: string;
  tempoPace: string;
  intervalPace: string;
  racePace: string;
}

interface TrainingPlanDisplayProps {
  planData: PlanData;
  onNewPlan: () => void;
  planType: 'static' | 'responsive' | 'date_based_preview' | 'date_based_full';
  chatHistory: ChatMessage[];
  onChatUpdate: (history: ChatMessage[]) => void;
  onUpdatePlan: (updatedPlan: any) => void;
  answers: any;
  fullPlanData?: PlanData | null;
  onSaveFullPlan?: () => void;
  savedPlanId?: string | null;
  planStartDate?: string;
  initialTrainingPaces?: TrainingPaces | null;
  onWeekChange?: (weekNumber: number) => void;
  onCompletedWorkoutsChange?: (completedWorkouts: Set<string>) => void;
  onUndo?: () => void;
  onCoachInterventionSent?: (params: { source: string; workoutKey: string; completionId?: string }) => void;
  progressPanel?: ProgressPanelType;
  onRefreshPlan?: () => Promise<void>;
  debugInfo?: {
    normalizationRan: boolean;
    dbWriteOccurred: boolean;
    isDateBased: boolean;
    normalizedWeeksCount: number;
    firstWeekHasAllDays: boolean;
    missingWeek1Days: string[];
    invariantFailCount: number;
  };
}

export function TrainingPlanDisplay({
  planData,
  onNewPlan,
  planType,
  chatHistory,
  onChatUpdate,
  onUpdatePlan,
  answers,
  fullPlanData,
  onSaveFullPlan,
  savedPlanId: initialSavedPlanId,
  planStartDate: initialPlanStartDate,
  initialTrainingPaces,
  onWeekChange,
  onCompletedWorkoutsChange,
  onUndo,
  onCoachInterventionSent,
  progressPanel,
  onRefreshPlan,
  debugInfo
}: TrainingPlanDisplayProps) {
  const { user } = useAuth();
  const isBeginnerPlan = answers?.experience?.toLowerCase() === 'beginner';
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [planStartDate] = useState<string>(initialPlanStartDate || tomorrow.toISOString().split('T')[0]);
  const today = getTodayInfo(planStartDate);

  // Use selectedDate as the single source of truth for both views
  const initialTodayDate = today.weekNumber >= 0 && today.weekNumber < planData.plan.length
    ? getDateStringFromDate(new Date())
    : planStartDate;
  const [selectedDate, setSelectedDate] = useState<string>(initialTodayDate);
  const [planDataVersion, setPlanDataVersion] = useState(0);

  // Wrapped setSelectedDate to track calls
  const setSelectedDateWithLog = (newDate: string) => {
    // Validate that newDate is a string
    if (!newDate || typeof newDate !== 'string') {
      console.error('[TrainingPlanDisplay] Attempted to set invalid date:', newDate);
      return;
    }

    console.log('[TrainingPlanDisplay] setSelectedDate called:', {
      from: selectedDate,
      to: newDate,
      stack: new Error().stack?.split('\n').slice(2, 5).join('\n')
    });
    setSelectedDate(newDate);
  };

  // When planData changes (from chat updates), increment version to force re-render but KEEP the current selectedDate
  useEffect(() => {
    setPlanDataVersion(prev => prev + 1);
    console.log('[TrainingPlanDisplay] Plan data updated, preserving selectedDate:', selectedDate);
  }, [planData]);

  // Derive currentWeekIndex from selectedDate
  const currentWeekIndex = findWeekIndexForDate(selectedDate, planData);

  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [completedWorkouts, setCompletedWorkouts] = useState<Set<string>>(new Set());
  const [savedPlanId, setSavedPlanId] = useState<string | null>(initialSavedPlanId || null);

  // Detect mobile and default to day view on mobile
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const getInitialViewMode = (): 'day' | 'week' | 'calendar' => {
    if (typeof window === 'undefined') return 'week';

    // For preview plans, always default to week view to show the full preview
    if (planType === 'date_based_preview') return 'week';

    // Check saved preference
    const saved = localStorage.getItem('preferredViewMode') as 'day' | 'week' | 'calendar' | null;
    if (saved) return saved;

    // Default to day view on mobile, week view on desktop
    return isMobile ? 'day' : 'week';
  };

  const [viewMode, setViewMode] = useState<'day' | 'week' | 'calendar'>(getInitialViewMode());

  // Save view preference when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('preferredViewMode', viewMode);
    }
  }, [viewMode]);
  const [trainingPaces, setTrainingPaces] = useState<TrainingPaces | null>(initialTrainingPaces || null);
  const [userHRZones, setUserHRZones] = useState<any>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [newBadges, setNewBadges] = useState<any[]>([]);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationMessage, setCelebrationMessage] = useState({ title: '', message: '' });

  const {
    workoutToRate,
    rating,
    workoutDistance,
    workoutDuration,
    workoutEnjoyment,
    workoutNotes,
    setRating,
    setWorkoutDistance,
    setWorkoutDuration,
    setWorkoutEnjoyment,
    setWorkoutNotes,
    toggleWorkoutCompletion,
    submitWorkoutCompletion,
    resetWorkoutForm,
    calibrationWorkout,
    calibrationWorkDuration,
    calibrationWorkDistance,
    calibrationAveragePace,
    calibrationPaceSplit,
    calibrationElevationGain,
    calibrationStartingHeartRate,
    calibrationEndingHeartRate,
    calibrationStoppedOrWalked,
    calibrationEffortConsistency,
    calibrationLapSplits,
    calibrationNotes,
    setCalibrationWorkDuration,
    setCalibrationWorkDistance,
    setCalibrationAveragePace,
    setCalibrationPaceSplit,
    setCalibrationElevationGain,
    setCalibrationStartingHeartRate,
    setCalibrationEndingHeartRate,
    setCalibrationStoppedOrWalked,
    setCalibrationEffortConsistency,
    setCalibrationLapSplits,
    setCalibrationNotes,
    submitCalibrationCompletion,
    resetCalibrationForm
  } = useWorkoutOperations({
    user,
    savedPlanId,
    completedWorkouts,
    setCompletedWorkouts,
    onCompletedWorkoutsChange,
    planType,
    onChatUpdate,
    currentChatHistory: chatHistory,
    setNewBadges,
    setCelebrationMessage,
    setShowCelebration,
    onCoachInterventionSent,
    planStartDate
  });

  const {
    pendingAction,
    setPendingAction,
    handleMoveWorkout,
    handleMakeEasier
  } = usePlanModifications({ planData, onUpdatePlan, savedPlanId, userId: user?.id });

  const isPreviewMode = fullPlanData && fullPlanData.plan.length > planData.plan.length;

  useEffect(() => {
    if (initialSavedPlanId !== savedPlanId) {
      setSavedPlanId(initialSavedPlanId || null);
    }
  }, [initialSavedPlanId]);

  useEffect(() => {
    if (user && savedPlanId) {
      loadWorkoutCompletions();
    }
  }, [user, savedPlanId, planDataVersion]); // Reload completions when plan data changes

  useEffect(() => {
    if (user) {
      loadHRZones();
      if (!trainingPaces) {
        loadUserTrainingPaces();
      }
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadHRZones();
    }
  }, [savedPlanId]);

  useEffect(() => {
    if (savedPlanId && (chatHistory.length > 0 || trainingPaces)) {
      setHasUnsavedChanges(true);
    }
  }, [planData, chatHistory, trainingPaces]);

  const loadWorkoutCompletions = async () => {
    if (!user || !savedPlanId) return;

    try {
      const [workoutsResult, calibrationResult] = await Promise.all([
        supabase
          .from('workout_completions')
          .select('week_number, day_name')
          .eq('training_plan_id', savedPlanId),
        supabase
          .from('calibration_completions')
          .select('week_number, day_name')
          .eq('training_plan_id', savedPlanId)
      ]);

      if (workoutsResult.error) throw workoutsResult.error;
      if (calibrationResult.error) throw calibrationResult.error;

      const completed = new Set([
        ...workoutsResult.data.map(w => `${w.week_number}-${w.day_name}`),
        ...calibrationResult.data.map(w => `${w.week_number}-${w.day_name}`)
      ]);

      setCompletedWorkouts(completed);
      if (onCompletedWorkoutsChange) {
        onCompletedWorkoutsChange(completed);
      }
    } catch (error) {
      logger.error('Error loading completions:', error);
    }
  };

  const loadHRZones = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('heart_rate_zones')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      setUserHRZones(data);
    } catch (error) {
      logger.error('Error loading HR zones:', error);
    }
  };

  const loadUserTrainingPaces = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_training_paces')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        const paces: TrainingPaces = {
          easyPace: data.easy_pace,
          longRunPace: data.long_run_pace,
          tempoPace: data.tempo_pace,
          intervalPace: data.interval_pace,
          racePace: data.race_pace,
        };
        setTrainingPaces(paces);
      }
    } catch (error) {
      logger.error('Error loading training paces:', error);
    }
  };

  const handleSaveChanges = async () => {
    if (!user || !savedPlanId) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const { error } = await supabase
        .from('training_plans')
        .update({
          plan_data: planData,
          chat_history: chatHistory,
          training_paces: trainingPaces,
        })
        .eq('id', savedPlanId);

      if (error) throw error;

      setHasUnsavedChanges(false);
      setSaveMessage('Changes saved successfully!');

      setTimeout(() => setSaveMessage(null), 3000);
    } catch (error) {
      setSaveMessage('Failed to save changes');
      logger.error('Error saving changes:', error);
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportToCalendar = () => {
    const planName = `${answers?.raceDistance || 'Training'} Plan`;
    const icalContent = generateICalFile(
      {
        plan_content: { weeks: planData.plan.map((week, index) => ({
          weekNumber: week.week || (index + 1),
          workouts: dayOrder.map(day => {
            const dayData = week.days[day];
            const workout = typeof dayData === 'string' ? dayData : dayData?.workout || 'Rest';
            return {
              week: week.week || (index + 1),
              day: dayOrder.indexOf(day) + 1,
              type: workout.split('-')[0].trim() || workout,
              description: workout,
            };
          })
        })) },
        start_date: planStartDate
      },
      planName
    );

    downloadICalFile(icalContent, `${planName.replace(/\s+/g, '-')}.ics`);
    setSaveMessage('Calendar exported successfully!');
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const currentWeek = planData?.plan?.[currentWeekIndex];
  const timeProgress = getTimeProgress(planStartDate, answers?.raceDate);

  // Guard: If plan data is missing or invalid, show loading
  if (!planData || !planData.plan || planData.plan.length === 0) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 px-2 md:px-0">
        <div className="card-premium p-8 text-center">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-neutral-200 dark:bg-neutral-800 rounded w-3/4 mx-auto"></div>
            <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded w-1/2 mx-auto"></div>
          </div>
          <p className="text-neutral-600 dark:text-neutral-400 mt-4">Loading training plan...</p>
        </div>
      </div>
    );
  }

  // Guard: If current week is out of bounds or missing
  if (!currentWeek) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 px-2 md:px-0">
        <div className="card-premium p-8 text-center">
          <p className="text-neutral-600 dark:text-neutral-400">Week data not available. Please refresh or select a different week.</p>
        </div>
      </div>
    );
  }

  // Track week number to only notify parent when it actually changes (not just re-renders)
  const previousWeekNumber = useRef<number | null>(null);

  useEffect(() => {
    if (onWeekChange && currentWeek && previousWeekNumber.current !== currentWeek.week) {
      console.log('[TrainingPlanDisplay] Week actually changed:', previousWeekNumber.current, '→', currentWeek.week);
      previousWeekNumber.current = currentWeek.week;
      onWeekChange(currentWeek.week);
    } else if (currentWeek) {
      previousWeekNumber.current = currentWeek.week;
    }
  }, [currentWeek, onWeekChange]);

  useEffect(() => {
    const handlePacesUpdated = () => {
      if (user) {
        loadUserTrainingPaces();
      }
    };

    const handleZonesUpdated = () => {
      if (user) {
        loadHRZones();
      }
    };

    window.addEventListener('trainingPacesUpdated', handlePacesUpdated);
    window.addEventListener('hrZonesUpdated', handleZonesUpdated);

    return () => {
      window.removeEventListener('trainingPacesUpdated', handlePacesUpdated);
      window.removeEventListener('hrZonesUpdated', handleZonesUpdated);
    };
  }, [user]);

  useEffect(() => {
    const weekRange = getWeekDateRange(currentWeekIndex, planData);
    console.log('[TrainingPlanDisplay] selectedDate changed:', selectedDate, '→ weekIndex:', currentWeekIndex, 'weekRange:', weekRange ? formatDateRange(weekRange.start, weekRange.end) : 'N/A');
  }, [selectedDate, currentWeekIndex, planData]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 px-2 md:px-0">
      <div>
        <PlanHeader
          raceDistance={answers?.raceDistance}
          isPreviewMode={isPreviewMode}
          timeProgress={timeProgress}
          raceDate={answers?.raceDate}
          planLength={planData.plan.length}
        />

        {!isPreviewMode && (
          <>
            {saveMessage && (
              <div className={`px-4 py-3 rounded-xl text-sm font-medium mb-4 border animate-slide-down ${
                saveMessage.includes('success')
                  ? 'bg-green-500/10 border-green-500/30 text-green-400'
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}>
                {saveMessage}
              </div>
            )}
            <ProgressPanel
              progressPanel={progressPanel ?? {
                current_focus_name: 'Building Fitness',
                why_it_matters: 'Each workout builds your foundation and prepares you for race day.',
                steps_enabled: false,
                show_progress_bar: false,
                this_week_strategy: 'Focus on completing workouts consistently and listening to your body.'
              }}
              className="mb-6"
              savedPlanId={savedPlanId}
              onMetadataAdded={onRefreshPlan}
              stepsMeta={planData.steps_meta}
            />
          </>
        )}

        {!isPreviewMode && (
          <div className="flex items-center gap-2 mb-6 bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-800 rounded-lg p-1 shadow-sm overflow-x-auto">
            <button
              onClick={() => setViewMode('day')}
              className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-md font-medium transition-all whitespace-nowrap text-sm md:text-base ${
                viewMode === 'day'
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800'
              }`}
            >
              <CalendarDays className="w-4 h-4" />
              <span className="hidden sm:inline">Day View</span>
              <span className="sm:hidden">Day</span>
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-md font-medium transition-all whitespace-nowrap text-sm md:text-base ${
                viewMode === 'week'
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800'
              }`}
            >
              <List className="w-4 h-4" />
              <span className="hidden sm:inline">Week View</span>
              <span className="sm:hidden">Week</span>
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-md font-medium transition-all whitespace-nowrap text-sm md:text-base ${
                viewMode === 'calendar'
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Calendar View</span>
              <span className="sm:hidden">Calendar</span>
            </button>
          </div>
        )}

        {viewMode === 'calendar' && !isPreviewMode && (
          <CalendarView
            key={`calendar-${planDataVersion}`}
            planData={planData}
            completedWorkouts={completedWorkouts}
            planStartDate={planStartDate}
            selectedDate={selectedDate}
            onDateSelect={(date: string) => {
              console.log('[TrainingPlanDisplay] Calendar date selected:', date);
              const newWeekIndex = findWeekIndexForDate(date, planData);
              const weekRange = getWeekDateRange(newWeekIndex, planData);
              console.log('[TrainingPlanDisplay] New weekIndex:', newWeekIndex, 'weekRange:', weekRange ? formatDateRange(weekRange.start, weekRange.end) : 'N/A');
              setSelectedDateWithLog(date);
            }}
            onWorkoutClick={(weekNumber, dayName) => {}}
            onToggleCompletion={(weekNumber, dayName, activity) =>
              toggleWorkoutCompletion(weekNumber, dayName, activity, { preventDefault: () => {}, stopPropagation: () => {} } as React.MouseEvent)
            }
          />
        )}

        {viewMode === 'day' && !isPreviewMode && (
          <DayView
            key={`day-${planDataVersion}`}
            currentWeek={currentWeek}
            currentWeekIndex={currentWeekIndex}
            today={today}
            planLength={planData.plan.length}
            isBeginnerPlan={isBeginnerPlan}
            completedWorkouts={completedWorkouts}
            expandedDay={expandedDay}
            isPreviewMode={isPreviewMode}
            savedPlanId={savedPlanId}
            planType={planType}
            trainingPaces={trainingPaces}
            userHRZones={userHRZones}
            user={user}
            planStartDate={planStartDate}
            selectedDate={selectedDate}
            allWeeksData={planData.plan}
            timeProgress={timeProgress}
            onDateNavigate={(days: number) => {
              // Navigate by changing selectedDate
              setSelectedDateWithLog(addDays(selectedDate, days));
            }}
            onDayExpand={setExpandedDay}
            onWorkoutComplete={toggleWorkoutCompletion}
            onSetPendingAction={setPendingAction}
            onJumpToToday={() => {
              const todayDate = getTodayInTimezone(planTimezone);
              setSelectedDateWithLog(todayDate);
            }}
          />
        )}

        {(viewMode === 'week' || isPreviewMode) && (
          <WeekView
            key={`week-${planDataVersion}`}
            currentWeek={currentWeek}
            currentWeekIndex={currentWeekIndex}
            today={today}
            planLength={planData.plan.length}
            isBeginnerPlan={isBeginnerPlan}
            completedWorkouts={completedWorkouts}
            expandedDay={expandedDay}
            isPreviewMode={isPreviewMode}
            savedPlanId={savedPlanId}
            planType={planType}
            trainingPaces={trainingPaces}
            userHRZones={userHRZones}
            user={user}
            planStartDate={planStartDate}
            selectedDate={selectedDate}
            onWeekChange={(weekIndex: number) => {
              // When week changes, update selectedDate to the Monday of that week
              const weekRange = getWeekDateRange(weekIndex, planData);
              if (weekRange) {
                setSelectedDateWithLog(weekRange.start);
              }
            }}
            onDateNavigate={(days: number) => {
              // Navigate by changing selectedDate
              setSelectedDateWithLog(addDays(selectedDate, days));
            }}
            onDayExpand={setExpandedDay}
            onWorkoutComplete={toggleWorkoutCompletion}
            onSetPendingAction={setPendingAction}
          />
        )}

        {!isPreviewMode && user && (
          <div className="mt-8 border-t border-neutral-300 dark:border-neutral-800 pt-6">
            <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-500 uppercase tracking-wide mb-4">Plan Actions</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              <button
                onClick={handleExportToCalendar}
                className="btn-primary flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export to Calendar
              </button>
              {onUndo && (
                <button
                  onClick={onUndo}
                  className="btn-primary flex items-center justify-center gap-2"
                >
                  <Undo className="w-4 h-4" />
                  Undo Last Change
                </button>
              )}
              {hasUnsavedChanges && savedPlanId && (
                <button
                  onClick={handleSaveChanges}
                  disabled={isSaving}
                  className="btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {pendingAction && (
        <WorkoutModificationModal
          pendingAction={pendingAction}
          onClose={() => setPendingAction(null)}
          onMoveWorkout={(toDay) => {
            handleMoveWorkout(
              pendingAction.data.weekNumber,
              pendingAction.data.dayName,
              toDay,
              pendingAction.data.activity
            );
          }}
          onMakeEasier={(easeType) => {
            handleMakeEasier(
              pendingAction.data.weekNumber,
              pendingAction.data.dayName,
              pendingAction.data.activity,
              easeType
            );
          }}
        />
      )}

      {workoutToRate && (
        <WorkoutCompletionModal
          workoutToRate={workoutToRate}
          rating={rating}
          workoutDistance={workoutDistance}
          workoutDuration={workoutDuration}
          workoutEnjoyment={workoutEnjoyment}
          workoutNotes={workoutNotes}
          isBeginnerPlan={isBeginnerPlan}
          onClose={resetWorkoutForm}
          onRatingChange={setRating}
          onDistanceChange={setWorkoutDistance}
          onDurationChange={setWorkoutDuration}
          onEnjoymentChange={setWorkoutEnjoyment}
          onNotesChange={setWorkoutNotes}
          onSubmit={() => submitWorkoutCompletion(rating)}
        />
      )}

      {calibrationWorkout && (
        <CalibrationCompletionModal
          workoutToRate={calibrationWorkout}
          workDuration={calibrationWorkDuration}
          workDistance={calibrationWorkDistance}
          averagePaceSeconds={calibrationAveragePace}
          paceSplitDifference={calibrationPaceSplit}
          elevationGain={calibrationElevationGain}
          startingHeartRate={calibrationStartingHeartRate}
          endingHeartRate={calibrationEndingHeartRate}
          stoppedOrWalked={calibrationStoppedOrWalked}
          effortConsistency={calibrationEffortConsistency}
          lapSplits={calibrationLapSplits}
          notes={calibrationNotes}
          onClose={resetCalibrationForm}
          onWorkDurationChange={setCalibrationWorkDuration}
          onWorkDistanceChange={setCalibrationWorkDistance}
          onAveragePaceChange={setCalibrationAveragePace}
          onPaceSplitChange={setCalibrationPaceSplit}
          onElevationGainChange={setCalibrationElevationGain}
          onStartingHeartRateChange={setCalibrationStartingHeartRate}
          onEndingHeartRateChange={setCalibrationEndingHeartRate}
          onStoppedOrWalkedChange={setCalibrationStoppedOrWalked}
          onEffortConsistencyChange={setCalibrationEffortConsistency}
          onLapSplitsChange={setCalibrationLapSplits}
          onNotesChange={setCalibrationNotes}
          onSubmit={submitCalibrationCompletion}
        />
      )}

      {newBadges.length > 0 && (
        <BadgeCelebration
          badges={newBadges}
          onClose={() => setNewBadges([])}
        />
      )}

      {showCelebration && (
        <WorkoutCelebrationModal
          celebrationMessage={celebrationMessage}
          onClose={() => {
            setShowCelebration(false);
            resetWorkoutForm();
            resetCalibrationForm();
          }}
        />
      )}

      {/* Debug Panel - Only visible in development when explicitly enabled */}
      {isDebugModeEnabled() && (
        <div className="fixed bottom-4 right-4 bg-red-600 text-white p-3 rounded-lg shadow-2xl border-2 border-white text-xs font-mono z-[10000] max-w-sm overflow-y-auto max-h-[90vh]">
          <div className="font-bold mb-2 text-sm">DEBUG PANEL</div>
          <div className="space-y-1">
            <div><span className="font-semibold">plan_type:</span> {planType}</div>
            <div><span className="font-semibold">days.length:</span> {(planData as any).days?.length || 'N/A'}</div>
            <div><span className="font-semibold">plan.length:</span> {planData.plan?.length || 0}</div>
            <div><span className="font-semibold">start_date:</span> {planStartDate || 'N/A'}</div>

            <div className="pt-2 border-t border-white/30 mt-2">
              <div><span className="font-semibold">selectedDate:</span> {selectedDate}</div>
              <div><span className="font-semibold">currentWeekIdx:</span> {currentWeekIndex}</div>
              <div><span className="font-semibold">weekRange:</span> {(() => {
                const range = getWeekDateRange(currentWeekIndex, planData);
                return range ? formatDateRange(range.start, range.end) : 'N/A';
              })()}</div>
              <div><span className="font-semibold">viewMode:</span> {viewMode}</div>
            </div>

            <div className="pt-2 border-t border-white/30 mt-2">
              <div><span className="font-semibold">isDateBased:</span> <span className={debugInfo?.isDateBased ? 'text-green-300' : 'text-red-300'}>{String(debugInfo?.isDateBased || false)}</span></div>
              <div><span className="font-semibold">wasNormalized:</span> <span className={debugInfo?.normalizationRan ? 'text-green-300' : 'text-red-300'}>{String(debugInfo?.normalizationRan || false)}</span></div>
              <div><span className="font-semibold">db_write:</span> <span className={debugInfo?.dbWriteOccurred ? 'text-green-300' : 'text-red-300'}>{String(debugInfo?.dbWriteOccurred || false)}</span></div>
            </div>

            <div className="pt-2 border-t border-white/30 mt-2">
              <div><span className="font-semibold">normalizedWeeks:</span> {debugInfo?.normalizedWeeksCount || 0}</div>
              <div><span className="font-semibold">week1HasAllDays:</span> <span className={debugInfo?.firstWeekHasAllDays ? 'text-green-300' : 'text-red-300'}>{String(debugInfo?.firstWeekHasAllDays || false)}</span></div>
              {debugInfo && debugInfo.missingWeek1Days.length > 0 && (
                <div><span className="font-semibold text-red-300">missing:</span> {debugInfo.missingWeek1Days.join(', ')}</div>
              )}
              <div><span className="font-semibold">invariantFails:</span> <span className={debugInfo?.invariantFailCount === 0 ? 'text-green-300' : 'text-red-300'}>{debugInfo?.invariantFailCount || 0}</span></div>
            </div>

            <div className="pt-2 border-t border-white/30 mt-2 text-yellow-300 text-xs opacity-80">
              Check console for [Normalization] logs
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
