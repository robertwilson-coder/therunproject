import { useState, useEffect } from 'react';
import { supabase, RunnerAnswers, PlanData, ChatMessage, TrainingPlan, TrainingPaces } from './lib/supabase';
import { QuestionnaireForm } from './components/QuestionnaireForm';
import { PlanTypeSelector } from './components/PlanTypeSelector';
import { PlanWithChat } from './components/PlanWithChat';
import { AuthForm } from './components/AuthForm';
import { SavedPlans } from './components/SavedPlans';
import { PaceCalculator } from './components/PaceCalculator';
import { UpdatePassword } from './components/UpdatePassword';
import { useAuth } from './contexts/AuthContext';

type AppState = 'landing' | 'questionnaire' | 'selectType' | 'viewPlan' | 'savedPlans';

function App() {
  const { user, loading: authLoading, signOut, isPasswordRecovery } = useAuth();
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

  const handleQuestionnaireSubmit = (runnerAnswers: RunnerAnswers) => {
    setAnswers(runnerAnswers);
    const paces = calculateTrainingPaces(runnerAnswers);
    setTrainingPaces(paces);
    setAppState('selectType');
  };

  const handleSelectType = async (type: 'static' | 'responsive') => {
    if (!answers) return;

    setPlanType(type);
    setIsLoading(true);
    setError(null);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-training-plan`;

      const { data: { session } } = await supabase.auth.getSession();

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      };

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const startDate = tomorrow.toISOString().split('T')[0];
      const startDayOfWeek = tomorrow.toLocaleDateString('en-US', { weekday: 'long' });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          answers,
          startDate,
          startDayOfWeek,
          trainingPaces
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

      // Show first 2 weeks for preview
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

  const handleUpdatePlan = (updatedPlan: PlanData) => {
    setPlanData(updatedPlan);
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
    setFullPlanData(plan.plan_data);
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
          const { error: updateError } = await supabase
            .from('training_plans')
            .update({
              plan_data: planData,
              chat_history: chatHistory,
              training_paces: trainingPaces,
            })
            .eq('id', savedPlanId);

          if (updateError) {
            console.error('Error updating plan:', updateError);
          } else {
            console.log('Plan updated successfully');
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
      <div className="min-h-screen bg-neon-black flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-neon-cyan mx-auto" style={{ boxShadow: '0 0 20px rgba(0, 240, 255, 0.5)' }}></div>
          <p className="mt-4 text-neon-cyan" style={{ textShadow: '0 0 10px rgba(0, 240, 255, 0.6)' }}>Loading...</p>
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
    <div className={`min-h-screen py-12 px-4 sm:px-6 lg:px-8 ${
      appState === 'viewPlan' || appState === 'savedPlans' ? 'bg-gray-50' : 'bg-gradient-to-br from-gray-900 to-gray-800'
    }`}>
      <div className="container mx-auto max-w-7xl">
        {(appState === 'landing' || appState === 'questionnaire' || appState === 'selectType') && (
          <div className="absolute top-6 left-6 z-20">
            <img src="/TheRunProject copy copy.svg" alt="The Run Project" className="h-12 sm:h-16 md:h-20 w-auto" />
          </div>
        )}
        {(appState === 'viewPlan' || appState === 'savedPlans') && (
          <div className="mb-8 flex items-center justify-between">
            <button onClick={() => setAppState('landing')} className="transition-transform hover:scale-105">
              <img src="/TheRunProjectdblue.svg" alt="The Run Project" className="h-12 sm:h-16 w-auto" />
            </button>
            {user && (
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setAppState('savedPlans')}
                  className={`text-sm font-medium transition-colors ${
                    appState === 'viewPlan' ? 'text-gray-600 hover:text-gray-900' : 'text-gray-300 hover:text-white'
                  }`}
                >
                  My Plans
                </button>
                <button
                  onClick={() => setAppState('landing')}
                  className={`text-sm font-medium transition-colors ${
                    appState === 'viewPlan' ? 'text-gray-600 hover:text-gray-900' : 'text-gray-300 hover:text-white'
                  }`}
                >
                  New Plan
                </button>
                <button
                  onClick={handleSignOut}
                  className={`text-sm font-medium transition-colors ${
                    appState === 'viewPlan' ? 'text-gray-600 hover:text-gray-900' : 'text-gray-300 hover:text-white'
                  }`}
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="max-w-2xl mx-auto mb-6 bg-dark-gray border-2 border-neon-pink text-neon-pink px-4 py-3 rounded-lg" style={{ boxShadow: '0 0 20px rgba(255, 0, 110, 0.3)' }}>
            <p className="font-medium">Error: {error}</p>
          </div>
        )}

        {appState === 'landing' && (
          <div className="relative max-w-7xl mx-auto py-12 min-h-[600px] flex items-center">
            <div className="relative z-10 w-full text-center px-4 py-20">
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-7 leading-tight tracking-tight text-white">
                Welcome to<br />
                The Run Project!
              </h1>
              <p className="text-2xl sm:text-3xl md:text-4xl text-white mb-6 leading-relaxed max-w-6xl mx-auto font-normal">
                Custom running plans. Flexible, personal, and made for real life.
              </p>
              <p className="text-xl sm:text-2xl md:text-3xl text-brand-pink font-bold mb-16 leading-relaxed max-w-6xl mx-auto">
                Smart training. Great results. No monthly subscriptions.
              </p>
              <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-10">
                <button
                  onClick={() => setAppState('questionnaire')}
                  className="w-64 px-10 py-5 bg-brand-blue text-white text-xl font-bold rounded-lg hover:bg-blue-600 transition-all"
                >
                  Create New Plan
                </button>
                {user ? (
                  <button
                    onClick={() => setAppState('savedPlans')}
                    className="w-64 px-10 py-5 bg-transparent border-2 border-brand-pink text-brand-pink text-xl font-bold rounded-lg hover:bg-brand-pink hover:text-white transition-all"
                  >
                    View My Plans
                  </button>
                ) : (
                  <button
                    onClick={() => setAppState('savedPlans')}
                    className="w-64 px-10 py-5 bg-transparent border-2 border-brand-pink text-brand-pink text-xl font-bold rounded-lg hover:bg-brand-pink hover:text-white transition-all"
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
            <QuestionnaireForm onSubmit={handleQuestionnaireSubmit} isLoading={false} />
          </div>
        )}

        {appState === 'selectType' && (
          <div className="pt-24">
            <PlanTypeSelector
              onSelectType={handleSelectType}
              isLoading={isLoading}
              answers={answers}
            />
          </div>
        )}

        {appState === 'viewPlan' && planData && planType && answers && (
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
        )}

        {appState === 'savedPlans' && (
          <SavedPlans
            onLoadPlan={handleLoadPlan}
            onClose={() => setAppState('landing')}
          />
        )}

        {showPaceCalculator && (
          <PaceCalculator onClose={() => setShowPaceCalculator(false)} />
        )}
      </div>
    </div>
  );
}

export default App;
