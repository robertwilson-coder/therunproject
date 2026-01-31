import { Calendar, Save, List, Download, Undo } from 'lucide-react';
import { logger } from '../utils/logger';
import { PlanData } from '../lib/supabase';
import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { CalendarView } from './CalendarView';
import { BadgeCelebration } from './BadgeCelebration';
import { generateICalFile, downloadICalFile } from '../utils/calendarExport';
import { getTodayInfo, getTimeProgress, dayOrder } from '../utils/trainingPlanUtils';
import { PlanHeader } from './PlanHeader';
import { WeekView } from './WeekView';
import { WorkoutCompletionModal } from './WorkoutCompletionModal';
import { CalibrationCompletionModal } from './CalibrationCompletionModal';
import { WorkoutModificationModal } from './WorkoutModificationModal';
import { WorkoutCelebrationModal } from './WorkoutCelebrationModal';
import { useWorkoutOperations } from '../hooks/useWorkoutOperations';
import { usePlanModifications } from '../hooks/usePlanModifications';

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
  onTriggerChat?: (message: string) => void;
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
  onTriggerChat
}: TrainingPlanDisplayProps) {
  const { user } = useAuth();
  const isBeginnerPlan = answers?.experience?.toLowerCase() === 'beginner';
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [planStartDate] = useState<string>(initialPlanStartDate || tomorrow.toISOString().split('T')[0]);
  const today = getTodayInfo(planStartDate);
  const initialWeekIndex = today.weekNumber >= 0 && today.weekNumber < planData.plan.length ? today.weekNumber : 0;
  const [currentWeekIndex, setCurrentWeekIndex] = useState(initialWeekIndex);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [completedWorkouts, setCompletedWorkouts] = useState<Set<string>>(new Set());
  const [savedPlanId, setSavedPlanId] = useState<string | null>(initialSavedPlanId || null);
  const [viewMode, setViewMode] = useState<'week' | 'calendar'>('week');
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
    onTriggerChat,
    setNewBadges,
    setCelebrationMessage,
    setShowCelebration
  });

  const {
    pendingAction,
    setPendingAction,
    handleMoveWorkout,
    handleMakeEasier
  } = usePlanModifications({ planData, onUpdatePlan });

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
  }, [user, savedPlanId]);

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

  useEffect(() => {
    if (onWeekChange && currentWeek) {
      onWeekChange(currentWeek.week);
    }
  }, [currentWeekIndex, currentWeek, onWeekChange]);

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
          </>
        )}

        {!isPreviewMode && (
          <div className="flex items-center gap-2 mb-6 bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-800 rounded-lg p-1 shadow-sm">
            <button
              onClick={() => setViewMode('week')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
                viewMode === 'week'
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800'
              }`}
            >
              <List className="w-4 h-4" />
              Week View
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all ${
                viewMode === 'calendar'
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-neutral-800'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Calendar View
            </button>
          </div>
        )}

        {viewMode === 'calendar' && !isPreviewMode && (
          <CalendarView
            planData={planData}
            completedWorkouts={completedWorkouts}
            planStartDate={planStartDate}
            onWorkoutClick={(weekNumber, dayName) => {}}
            onToggleCompletion={(weekNumber, dayName, activity) =>
              toggleWorkoutCompletion(weekNumber, dayName, activity, { preventDefault: () => {}, stopPropagation: () => {} } as React.MouseEvent)
            }
          />
        )}

        {(viewMode === 'week' || isPreviewMode) && (
          <WeekView
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
            onWeekChange={setCurrentWeekIndex}
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
    </div>
  );
}
