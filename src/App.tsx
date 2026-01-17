import { useState, useEffect, Suspense, lazy } from 'react';
import { supabase, RunnerAnswers, PlanData, ChatMessage, TrainingPlan, TrainingPaces } from './lib/supabase';
import { QuestionnaireForm } from './components/QuestionnaireForm';
import { AuthForm } from './components/AuthForm';
import { UpdatePassword } from './components/UpdatePassword';
import { FeedbackModal } from './components/FeedbackModal';
import { useAuth } from './contexts/AuthContext';
import { useTheme } from './contexts/ThemeContext';
import { Moon, Sun, Menu, X, MessageSquare } from 'lucide-react';
import { TrainingPlanSkeleton, SavedPlansSkeleton, DashboardSkeleton } from './components/LoadingSkeletons';

const PlanWithChat = lazy(() => import('./components/PlanWithChat').then(module => ({ default: module.PlanWithChat })));
const SavedPlans = lazy(() => import('./components/SavedPlans').then(module => ({ default: module.SavedPlans })));
const PaceCalculator = lazy(() => import('./components/PaceCalculator').then(module => ({ default: module.PaceCalculator })));
const Dashboard = lazy(() => import('./components/Dashboard').then(module => ({ default: module.Dashboard })));
const RecoveryTools = lazy(() => import('./components/RecoveryTools').then(module => ({ default: module.RecoveryTools })));
const NutritionHydration = lazy(() => import('./components/NutritionHydration').then(module => ({ default: module.NutritionHydration })));
const RaceDayPlanning = lazy(() => import('./components/RaceDayPlanning').then(module => ({ default: module.RaceDayPlanning })));

type AppState = 'landing' | 'questionnaire' | 'viewPlan' | 'savedPlans';

function App() {
  const { user, loading: authLoading, signOut, isPasswordRecovery } = useAuth();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const [appState, setAppState] = useState<AppState>('landing');
  const [planType, setPlanType] = useState<'static' | 'responsive' | null>(null);
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [fullPlanData, setFullPlanData] = useState<PlanData | null>(null);
  const [answers, setAnswers] = useState<RunnerAnswers | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPlanId, setSavedPlanId] = useState<string | null>(null);
  const [planStartDate, setPlanStartDate] = useState<string | null>(null);
  const [showPaceCalculator, setShowPaceCalculator] = useState(false);
  const [trainingPaces, setTrainingPaces] = useState<TrainingPaces | null>(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showRecoveryTools, setShowRecoveryTools] = useState(false);
  const [showNutrition, setShowNutrition] = useState(false);
  const [showRacePlanning, setShowRacePlanning] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    setAppState('landing');
    setPlanData(null);
    setFullPlanData(null);
    setAnswers(null);
    setChatHistory([]);
    setSavedPlanId(null);
  };

  const calculateTrainingPaces = (runnerAnswers: RunnerAnswers): TrainingPaces | null => {
    const { recentRaceDistance, recentRaceHours, recentRaceMinutes, recentRaceSeconds } = runnerAnswers;

    if (!recentRaceDistance || recentRaceDistance === '') return null;

    const distances: Record<string, number> = {
      '5K': 5,
      '10K': 10,
      'Half Marathon': 21.0975,
      'Marathon': 42.195
    };

    const totalSeconds = (recentRaceHours || 0) * 3600 + (recentRaceMinutes || 0) * 60 + (recentRaceSeconds || 0);
    if (totalSeconds === 0) return null;

    const distanceKm = distances[recentRaceDistance];
    const raceSecondsPerKm = totalSeconds / distanceKm;

    const formatPace = (secondsPerKm: number): string => {
      const mins = Math.floor(secondsPerKm / 60);
      const secs = Math.round(secondsPerKm % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}/km`;
    };

    return {
      racePace: formatPace(raceSecondsPerKm),
      easyPace: formatPace(raceSecondsPerKm * 1.25),
      longRunPace: formatPace(raceSecondsPerKm * 1.20),
      tempoPace: formatPace(raceSecondsPerKm * 1.08),
      intervalPace: formatPace(raceSecondsPerKm * 0.95),
    };
  };

  const handleQuestionnaireSubmit = async (runnerAnswers: RunnerAnswers) => {
    setAnswers(runnerAnswers);
    const paces = calculateTrainingPaces(runnerAnswers);
    setTrainingPaces(paces);

    setPlanType('responsive');
    setIsLoading(true);
    setError(null);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-training-plan`;

      const { data: { session } } = await supabase.auth.getSession();

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      };

      const startDateObj = runnerAnswers.customStartDate
        ? new Date(runnerAnswers.customStartDate)
        : (() => {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            return tomorrow;
          })();
      const startDate = startDateObj.toISOString().split('T')[0];
      const startDayOfWeek = startDateObj.toLocaleDateString('en-US', { weekday: 'long' });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          answers: runnerAnswers,
          startDate,
          startDayOfWeek,
          trainingPaces: paces
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to generate training plan');
        } else {
          const errorText = await response.text();
          console.error('API Error:', errorText);
          throw new Error(`API Error: ${response.status} - ${response.statusText}`);
        }
      }

      const data = await response.json();

      setPlanStartDate(startDate);

      setFullPlanData(data);

      const previewWeeks = data.plan.slice(0, 2);

      console.log('Full plan length:', data.plan.length);
      console.log('Preview weeks:', previewWeeks);

      const previewData = {
        plan: previewWeeks
      };
      setPlanData(previewData);

      setAppState('viewPlan');
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
      }, 0);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Request timed out. Please try again with a shorter plan duration.');
      } else {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
      console.error('Error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePlan = (updatedPlan: PlanData, isPreviewMode: boolean = false) => {
    if (isPreviewMode && fullPlanData) {
      setFullPlanData(updatedPlan);
      const previewWeeks = updatedPlan.plan.slice(0, 2);
      setPlanData({ plan: previewWeeks });
    } else {
      setPlanData(updatedPlan);
      if (savedPlanId) {
        const updatePlanInDb = async () => {
          const { error } = await supabase
            .from('training_plans')
            .update({
              plan_data: updatedPlan,
              chat_history: chatHistory,
            })
            .eq('id', savedPlanId);

          if (error) {
            console.error('Error updating plan in database:', error);
          }
        };
        updatePlanInDb();
      }
    }
  };

  const handleNewPlan = () => {
    setPlanData(null);
    setFullPlanData(null);
    setAnswers(null);
    setPlanType(null);
    setChatHistory([]);
    setError(null);
    setSavedPlanId(null);
    setPlanStartDate(null);
    setTrainingPaces(null);
    setAppState('landing');
  };

  const handleLoadPlan = (plan: TrainingPlan) => {
    setPlanData(plan.plan_data);
    setFullPlanData(null);
    setAnswers(plan.answers);
    setPlanType(plan.plan_type);
    setChatHistory(plan.chat_history || []);
    setSavedPlanId(plan.id);
    setPlanStartDate(plan.start_date);
    setTrainingPaces(plan.training_paces || null);
    setAppState('viewPlan');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveFullPlan = async () => {
    if (user && planData && answers && planType && planStartDate) {
      try {
        if (savedPlanId) {
          const planToSave = fullPlanData || planData;
          const { error: updateError } = await supabase
            .from('training_plans')
            .update({
              plan_data: planToSave,
              chat_history: chatHistory,
              training_paces: trainingPaces,
            })
            .eq('id', savedPlanId);

          if (updateError) {
            console.error('Error updating plan:', updateError);
          } else {
            console.log('Plan updated successfully');
            if (fullPlanData) {
              setPlanData(fullPlanData);
              setFullPlanData(null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }
        } else if (fullPlanData) {
          const { data: savedData, error: saveError } = await supabase
            .from('training_plans')
            .insert({
              user_id: user.id,
              answers,
              plan_data: fullPlanData,
              plan_type: planType,
              chat_history: chatHistory,
              start_date: planStartDate,
              training_paces: trainingPaces,
            })
            .select();

          if (!saveError && savedData && savedData[0]?.id) {
            setSavedPlanId(savedData[0].id);
            setPlanData(fullPlanData);
            setFullPlanData(null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }
      } catch (error) {
        console.error('Error saving plan:', error);
      }
    } else if (!user) {
      setAppState('savedPlans');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white dark:bg-neutral-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-14 w-14 border-4 border-neutral-300 dark:border-neutral-800 border-t-primary-500 mx-auto"></div>
          <p className="mt-6 text-primary-500 dark:text-primary-400 text-lg font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (isPasswordRecovery) {
    return <UpdatePassword onComplete={() => {
      window.history.replaceState(null, '', window.location.pathname);
      window.location.href = '/';
    }} />;
  }

  if (appState === 'savedPlans' && !user) {
    return <AuthForm onSuccess={async () => {
      if (fullPlanData && answers && planType && planStartDate) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: savedData, error: saveError } = await supabase.from('training_plans').insert({
            user_id: session.user.id,
            answers,
            plan_data: fullPlanData,
            plan_type: planType,
            chat_history: chatHistory,
            start_date: planStartDate,
            training_paces: trainingPaces,
          }).select();

          if (!saveError && savedData && savedData[0]?.id) {
            setSavedPlanId(savedData[0].id);
            setPlanData(fullPlanData);
            setFullPlanData(null);
            setAppState('viewPlan');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }
      } else {
        setAppState('savedPlans');
      }
    }} />;
  }

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="fixed top-0 left-0 right-0 bg-primary-500 text-white px-4 py-2.5 text-center text-sm font-semibold z-50 flex items-center justify-center gap-3">
        <span>Private, non-commercial development version</span>
        <button
          onClick={() => setShowFeedback(true)}
          className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
        >
          <MessageSquare className="w-4 h-4" />
          Give Feedback
        </button>
      </div>
      <div className="pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          {(appState === 'landing' || appState === 'questionnaire') && (
            <div className="absolute top-20 left-6 z-20 animate-fade-in">
            <img
              src={isDarkMode ? "/TheRunProject copy copy.svg" : "/TheRunProjectdblue.svg"}
              alt="The Run Project"
              className="h-12 sm:h-16 md:h-20 w-auto"
            />
          </div>
        )}
        {(appState === 'viewPlan' || appState === 'savedPlans') && (
          <div className="mt-4 mb-8 flex items-center justify-between animate-slide-down">
            <button onClick={() => setAppState('landing')} className="transition-all hover:scale-105 active:scale-95">
              <img
                src={isDarkMode ? "/TheRunProject copy copy.svg" : "/TheRunProjectdblue.svg"}
                alt="The Run Project"
                className="h-12 sm:h-16 w-auto"
              />
            </button>
            {user && (
              <>
                <div className="hidden md:flex items-center gap-3">
                  <button
                    onClick={() => setAppState('savedPlans')}
                    className="px-4 py-2 text-sm font-semibold transition-all text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg"
                  >
                    My Plans
                  </button>
                  <button
                    onClick={() => setShowDashboard(true)}
                    className="px-4 py-2 text-sm font-semibold transition-all text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg"
                  >
                    Dashboard
                  </button>
                  <button
                    onClick={handleSignOut}
                    className="px-4 py-2 text-sm font-semibold transition-all text-neutral-700 dark:text-neutral-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg"
                  >
                    Sign Out
                  </button>
                </div>

                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="md:hidden p-2 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-all"
                >
                  {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>

                {isMobileMenuOpen && (
                  <div className="md:hidden fixed top-20 right-4 bg-white dark:bg-neutral-900 border-2 border-neutral-200 dark:border-neutral-800 rounded-lg shadow-2xl z-50 overflow-hidden animate-scale-in">
                    <button
                      onClick={() => {
                        setAppState('savedPlans');
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full px-6 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all border-b border-neutral-200 dark:border-neutral-800"
                    >
                      My Plans
                    </button>
                    <button
                      onClick={() => {
                        setShowDashboard(true);
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full px-6 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all border-b border-neutral-200 dark:border-neutral-800"
                    >
                      Dashboard
                    </button>
                    <button
                      onClick={() => {
                        handleSignOut();
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full px-6 py-3 text-left text-sm font-semibold text-neutral-700 dark:text-neutral-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all"
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {error && (
          <div className="max-w-2xl mx-auto mb-6 bg-red-500/10 border border-red-500/30 text-red-400 px-5 py-4 rounded-xl animate-slide-down">
            <p className="font-semibold">Error: {error}</p>
          </div>
        )}

        {appState === 'landing' && (
          <div className="relative max-w-7xl mx-auto py-6 min-h-[600px] flex items-center">
            <div className="relative z-10 w-full text-center px-4 pt-24 pb-12 animate-fade-in">
              <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-display font-bold mb-8 leading-tight text-neutral-900 dark:text-white tracking-tight">
                Welcome to<br className="sm:hidden" /><span className="hidden sm:inline"> </span>The Run<span className="sm:hidden"><br /></span><span className="hidden sm:inline"> </span>Project!
              </h1>
              <p className="text-xl sm:text-2xl md:text-3xl text-neutral-700 dark:text-neutral-300 mb-6 leading-relaxed max-w-4xl mx-auto font-normal">
                Custom running plans. Flexible,<br className="sm:hidden" /><span className="hidden sm:inline"> </span>personal, and made for<span className="sm:hidden"><br /></span><span className="hidden sm:inline"> </span>real life.
              </p>
              <p className="text-lg sm:text-xl md:text-2xl text-primary-600 dark:text-primary-500 mb-12 leading-relaxed max-w-4xl mx-auto font-bold">
                Smart training. Great results.<br className="sm:hidden" /><span className="hidden sm:inline"> </span>No monthly subscriptions.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-10">
                <button
                  onClick={() => setAppState('questionnaire')}
                  className="w-64 btn-primary text-lg py-4"
                >
                  Create New Plan
                </button>
                {user ? (
                  <button
                    onClick={() => setAppState('savedPlans')}
                    className="w-64 btn-ghost text-lg py-4"
                  >
                    View My Plans
                  </button>
                ) : (
                  <button
                    onClick={() => setAppState('savedPlans')}
                    className="w-64 btn-ghost text-lg py-4"
                  >
                    Login
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {appState === 'questionnaire' && (
          <div className="pt-24">
            <QuestionnaireForm onSubmit={handleQuestionnaireSubmit} isLoading={isLoading} />
          </div>
        )}

        {appState === 'viewPlan' && planData && planType && answers && (
          <Suspense fallback={<TrainingPlanSkeleton />}>
            <PlanWithChat
              planData={planData}
              planType={planType}
              answers={answers}
              onNewPlan={handleNewPlan}
              chatHistory={chatHistory}
              onChatUpdate={setChatHistory}
              onUpdatePlan={handleUpdatePlan}
              fullPlanData={fullPlanData}
              onSaveFullPlan={handleSaveFullPlan}
              savedPlanId={savedPlanId}
              planStartDate={planStartDate || undefined}
              initialTrainingPaces={trainingPaces}
            />
          </Suspense>
        )}

        {appState === 'savedPlans' && (
          <Suspense fallback={<SavedPlansSkeleton />}>
            <SavedPlans
              onLoadPlan={handleLoadPlan}
              onClose={() => setAppState('landing')}
            />
          </Suspense>
        )}

        {showPaceCalculator && (
          <Suspense fallback={<div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"><div className="animate-spin rounded-full h-14 w-14 border-4 border-neutral-300 dark:border-neutral-800 border-t-primary-500"></div></div>}>
            <PaceCalculator onClose={() => setShowPaceCalculator(false)} />
          </Suspense>
        )}

        {showDashboard && (
          <Suspense fallback={<div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"><DashboardSkeleton /></div>}>
            <Dashboard
              onClose={() => setShowDashboard(false)}
              onNavigateToRecovery={() => {
                setShowDashboard(false);
                setShowRecoveryTools(true);
              }}
              onNavigateToNutrition={() => {
                setShowDashboard(false);
                setShowNutrition(true);
              }}
              onNavigateToRace={() => {
                setShowDashboard(false);
                setShowRacePlanning(true);
              }}
              planId={savedPlanId}
              planData={planData}
              fullPlanData={fullPlanData}
              planStartDate={planStartDate}
              trainingPaces={trainingPaces}
            />
          </Suspense>
        )}

        {showRecoveryTools && (
          <Suspense fallback={<div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"><div className="animate-spin rounded-full h-14 w-14 border-4 border-neutral-300 dark:border-neutral-800 border-t-primary-500"></div></div>}>
            <RecoveryTools onClose={() => {
              setShowRecoveryTools(false);
              setShowDashboard(true);
            }} />
          </Suspense>
        )}

        {showNutrition && (
          <Suspense fallback={<div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"><div className="animate-spin rounded-full h-14 w-14 border-4 border-neutral-300 dark:border-neutral-800 border-t-primary-500"></div></div>}>
            <NutritionHydration onClose={() => {
              setShowNutrition(false);
              setShowDashboard(true);
            }} />
          </Suspense>
        )}

        {showRacePlanning && (
          <Suspense fallback={<div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"><div className="animate-spin rounded-full h-14 w-14 border-4 border-neutral-300 dark:border-neutral-800 border-t-primary-500"></div></div>}>
            <RaceDayPlanning onClose={() => {
              setShowRacePlanning(false);
              setShowDashboard(true);
            }} planId={savedPlanId} />
          </Suspense>
        )}

        {showFeedback && (
          <FeedbackModal onClose={() => setShowFeedback(false)} />
        )}
        </div>
      </div>
    </div>
  );
}

export default App;
