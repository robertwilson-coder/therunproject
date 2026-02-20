import { Suspense, lazy, useState } from 'react';
import { supabase } from './lib/supabase';
import type { RunnerAnswers } from './types';
import { QuestionnaireForm } from './components/QuestionnaireForm';
import { AuthForm } from './components/AuthForm';
import { AuthModal } from './components/AuthModal';
import { UpdatePassword } from './components/UpdatePassword';
import { FeedbackModal } from './components/FeedbackModal';
import { Logo } from './components/Logo';
import { Footer } from './components/Footer';
import { useAuth } from './contexts/AuthContext';
import { usePlanManagement } from './hooks/usePlanManagement';
import { useNavigationState } from './hooks/useNavigationState';
import { useToast } from './contexts/ToastContext';
import { useUnreadNotifications } from './hooks/useUnreadNotifications';
import { Menu, X, MessageSquare } from 'lucide-react';
import { TrainingPlanSkeleton, SavedPlansSkeleton, DashboardSkeleton } from './components/LoadingSkeletons';

const PlanWithChat = lazy(() => import('./components/PlanWithChat').then(module => ({ default: module.PlanWithChat })));
const SavedPlans = lazy(() => import('./components/SavedPlans').then(module => ({ default: module.SavedPlans })));
const PaceCalculator = lazy(() => import('./components/PaceCalculator').then(module => ({ default: module.PaceCalculator })));
const Dashboard = lazy(() => import('./components/Dashboard').then(module => ({ default: module.Dashboard })));
const RecoveryTools = lazy(() => import('./components/RecoveryTools').then(module => ({ default: module.RecoveryTools })));
const NutritionHydration = lazy(() => import('./components/NutritionHydration').then(module => ({ default: module.NutritionHydration })));
const RaceDayPlanning = lazy(() => import('./components/RaceDayPlanning').then(module => ({ default: module.RaceDayPlanning })));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const About = lazy(() => import('./components/About').then(module => ({ default: module.About })));

function App() {
  const { user, loading: authLoading, signOut, isPasswordRecovery } = useAuth();
  const { showToast } = useToast();
  const unreadNotifications = useUnreadNotifications();

  const planManager = usePlanManagement();
  const navigation = useNavigationState();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showLandingMenu, setShowLandingMenu] = useState(false);

  const ADMIN_EMAILS = ['rob1wilson@hotmail.com'];
  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email);

  const handleSignOut = async () => {
    await signOut();
    navigation.setAppState('landing');
    planManager.resetPlan();
  };

  const handleQuestionnaireSubmit = async (runnerAnswers: RunnerAnswers) => {
    try {
      await planManager.generatePreviewPlan(runnerAnswers);

      navigation.setAppState('viewPlan');
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
      }, 0);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate preview plan';
      showToast('error', `Error: ${errorMessage}`);
      console.error('Preview plan generation error:', err);
    }
  };

  const handleNewPlan = () => {
    planManager.resetPlan();
    navigation.setAppState('landing');
  };

  const handleAcceptPreview = async () => {
    try {
      if (!user) {
        setShowAuthModal(true);
        return;
      }

      const jobId = await planManager.acceptPreviewPlan();

      showToast('success', 'Your full training plan is being generated! Check My Plans to track progress.');

      navigation.setAppState('savedPlans');

      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
      }, 0);
    } catch (err) {
      console.error('Error accepting preview:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to start plan generation';
      showToast('error', `Error: ${errorMessage}`);
    }
  };

  const handleLoadPlan = async (plan: any) => {
    await planManager.loadPlan(plan);
    navigation.setAppState('viewPlan');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRefreshPlan = async () => {
    if (!planManager.savedPlanId) return;
    const { data } = await supabase
      .from('training_plans')
      .select('*')
      .eq('id', planManager.savedPlanId)
      .maybeSingle();
    if (data) {
      await planManager.loadPlan(data);
    }
  };

  const handleSaveFullPlan = async () => {
    if (user) {
      await planManager.saveFullPlan(user.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      navigation.setAppState('savedPlans');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-dvh bg-gray-900 flex items-center justify-center">
        <div className="text-center flex flex-col items-center">
          <img src="/TheRunProject copy copy.svg" alt="The Run Project" className="w-64 mb-8 opacity-95" />
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-600 border-t-white"></div>
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

  if (navigation.appState === 'login') {
    return <AuthForm loginOnly={true} onSuccess={() => {
      navigation.setAppState('savedPlans');
    }} />;
  }

  if (navigation.appState === 'savedPlans' && !user) {
    return <AuthForm onSuccess={async () => {
      if (planManager.fullPlanData && planManager.answers && planManager.planType && planManager.planStartDate) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: savedData, error: saveError } = await supabase.from('training_plans').insert({
            user_id: session.user.id,
            answers: planManager.answers,
            plan_data: planManager.fullPlanData,
            plan_type: planManager.planType,
            chat_history: planManager.chatHistory,
            start_date: planManager.planStartDate,
            training_paces: planManager.trainingPaces,
          }).select();

          if (!saveError && savedData && savedData[0]?.id) {
            planManager.setSavedPlanId(savedData[0].id);
            planManager.setPlanData(planManager.fullPlanData);
            planManager.setFullPlanData(null);
            navigation.setAppState('viewPlan');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }
      } else {
        navigation.setAppState('savedPlans');
      }
    }} />;
  }

  return (
    <div className="min-h-dvh relative overflow-hidden">
      <div className="fixed top-0 left-0 right-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2.5 text-center text-sm font-semibold z-50 flex items-center justify-center gap-3 shadow-lg backdrop-blur-sm">
        <span className="drop-shadow-sm">Private, non-commercial development version</span>
        <button
          onClick={() => navigation.setShowFeedback(true)}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-all duration-300 hover:scale-105 active:scale-95 backdrop-blur-sm shadow-soft"
        >
          <MessageSquare className="w-4 h-4" />
          Give Feedback
        </button>
      </div>

      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/2 w-[200%] h-[200%] bg-gradient-radial from-blue-300/3 via-transparent to-transparent dark:from-blue-700/4"></div>
        <div className="absolute -bottom-1/2 -left-1/2 w-[200%] h-[200%] bg-gradient-radial from-blue-400/3 via-transparent to-transparent dark:from-blue-800/4"></div>
      </div>
      <div className="pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-7xl">
          {navigation.appState === 'landing' && (
            <div className="absolute top-28 left-6 right-6 z-30 animate-fade-in flex items-center justify-between">
              <Logo size="xl" className="sm:h-16 md:h-20" />
              <div className="relative">
                <button
                  onClick={() => setShowLandingMenu(!showLandingMenu)}
                  className="p-1 text-neutral-700 dark:text-neutral-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200"
                  aria-label={showLandingMenu ? 'Close menu' : 'Open menu'}
                >
                  {showLandingMenu ? <X className="w-7 h-7" /> : <Menu className="w-7 h-7" />}
                </button>
                {showLandingMenu && (
                  <div className="absolute top-12 right-0 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-2xl shadow-2xl overflow-hidden animate-scale-in min-w-[180px]">
                    <button
                      onClick={() => {
                        setShowLandingMenu(false);
                        navigation.setAppState('about');
                        setTimeout(() => window.scrollTo({ top: 0, behavior: 'instant' }), 0);
                      }}
                      className="w-full px-5 py-3.5 text-left text-sm font-semibold text-neutral-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-200 border-b border-neutral-100 dark:border-neutral-800"
                    >
                      How it Works
                    </button>
                    {user && (
                      <button
                        onClick={() => {
                          setShowLandingMenu(false);
                          handleSignOut();
                        }}
                        className="w-full px-5 py-3.5 text-left text-sm font-semibold text-neutral-900 dark:text-white hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200"
                      >
                        Sign Out
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        {(navigation.appState === 'viewPlan' || navigation.appState === 'questionnaire') && (
          <div className="mt-4 mb-8 flex items-center justify-between animate-slide-down bg-white/90 dark:bg-neutral-900/90 p-4 rounded-2xl shadow-soft border border-neutral-200 dark:border-neutral-800 relative z-50">
            <button onClick={() => navigation.setAppState('landing')} className="transition-all hover:scale-105 active:scale-95 hover:drop-shadow-lg">
              <Logo size="lg" />
            </button>
            {user && (
              <>
                <div className="hidden md:flex items-center gap-2">
                  <button
                    onClick={() => navigation.setAppState('savedPlans')}
                    className="px-5 py-2.5 text-sm font-semibold transition-all duration-300 text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-white/80 dark:hover:bg-neutral-800 rounded-xl hover:shadow-soft"
                  >
                    My Plans
                  </button>
                  <button
                    onClick={() => navigation.openDashboard()}
                    className="relative px-5 py-2.5 text-sm font-semibold transition-all duration-300 text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-white/80 dark:hover:bg-neutral-800 rounded-xl hover:shadow-soft"
                  >
                    Dashboard
                    {unreadNotifications > 0 && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-neutral-900"></span>
                    )}
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => navigation.openAdminDashboard()}
                      className="px-5 py-2.5 text-sm font-semibold transition-all duration-300 text-neutral-700 dark:text-neutral-300 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-xl hover:shadow-soft"
                    >
                      Admin
                    </button>
                  )}
                  <button
                    onClick={handleSignOut}
                    className="px-5 py-2.5 text-sm font-semibold transition-all duration-300 text-neutral-700 dark:text-neutral-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl hover:shadow-soft"
                  >
                    Sign Out
                  </button>
                </div>

                <button
                  onClick={() => navigation.setIsMobileMenuOpen(!navigation.isMobileMenuOpen)}
                  className="md:hidden p-3 text-neutral-700 dark:text-neutral-300 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-white/80 dark:hover:bg-neutral-800 rounded-xl transition-all duration-300 hover:shadow-soft min-w-[44px] min-h-[44px]"
                  aria-label={navigation.isMobileMenuOpen ? "Close menu" : "Open menu"}
                >
                  {navigation.isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>

                {navigation.isMobileMenuOpen && (
                  <div className="md:hidden fixed top-24 right-4 bg-white dark:bg-neutral-900 border-2 border-neutral-300 dark:border-neutral-700 rounded-2xl shadow-2xl z-[60] overflow-hidden animate-scale-in min-w-[200px]">
                    <button
                      onClick={() => {
                        navigation.setAppState('savedPlans');
                        navigation.setIsMobileMenuOpen(false);
                      }}
                      className="w-full px-6 py-4 text-left text-base font-bold text-neutral-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-all duration-300 border-b-2 border-neutral-200 dark:border-neutral-700 active:scale-95"
                    >
                      My Plans
                    </button>
                    <button
                      onClick={() => {
                        navigation.openDashboard();
                        navigation.setIsMobileMenuOpen(false);
                      }}
                      className="relative w-full px-6 py-4 text-left text-base font-bold text-neutral-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-all duration-300 border-b-2 border-neutral-200 dark:border-neutral-700 active:scale-95"
                    >
                      Dashboard
                      {unreadNotifications > 0 && (
                        <span className="absolute top-4 right-4 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-neutral-900 animate-pulse"></span>
                      )}
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => {
                          navigation.openAdminDashboard();
                          navigation.setIsMobileMenuOpen(false);
                        }}
                        className="w-full px-6 py-4 text-left text-base font-bold text-neutral-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-all duration-300 border-b-2 border-neutral-200 dark:border-neutral-700 active:scale-95"
                      >
                        Admin
                      </button>
                    )}
                    <button
                      onClick={() => {
                        handleSignOut();
                        navigation.setIsMobileMenuOpen(false);
                      }}
                      className="w-full px-6 py-4 text-left text-base font-bold text-neutral-900 dark:text-white hover:text-red-600 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-all duration-300 active:scale-95"
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {planManager.error && (
          <div className="max-w-2xl mx-auto mb-6 bg-red-50/90 dark:bg-red-900/20 border border-red-500/30 dark:border-red-500/20 text-red-600 dark:text-red-400 px-6 py-5 rounded-2xl animate-slide-down shadow-soft">
            <p className="font-semibold text-base">Error: {planManager.error}</p>
          </div>
        )}

        {navigation.appState === 'landing' && (
          <div className="relative max-w-7xl mx-auto py-6 min-h-[700px] flex items-center overflow-hidden">
            {/* Static decorative elements */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-15">
              <div className="absolute top-[15%] left-[5%] w-72 h-72 bg-gradient-radial from-blue-400/8 to-transparent rounded-full blur-3xl" />
              <div className="absolute top-[60%] right-[8%] w-96 h-96 bg-gradient-radial from-blue-500/6 to-transparent rounded-full blur-3xl" />
              <div className="absolute bottom-[20%] left-[15%] w-64 h-64 bg-gradient-radial from-blue-600/4 to-transparent rounded-full blur-2xl" />
            </div>


            <div className="relative z-10 w-full text-center px-4 pt-32 pb-16">
              <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-display font-bold mb-8 leading-[0.95] tracking-tighter animate-fade-in">
                <span className="text-neutral-900 dark:text-white drop-shadow-sm">
                  Welcome to
                </span>
                <br />
                <span className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 bg-clip-text text-transparent dark:from-blue-300 dark:via-blue-200 dark:to-blue-100">
                  The Run Project
                </span>
              </h1>

              <p className="text-xl sm:text-2xl md:text-3xl lg:text-4xl text-neutral-600 dark:text-neutral-300 mb-4 leading-relaxed max-w-5xl mx-auto font-medium">
                Custom running plans. Flexible, personal,<br className="hidden md:block" /> and made for real life.
              </p>

              <p className="text-lg sm:text-xl md:text-2xl text-blue-700 dark:text-blue-300 mb-10 leading-relaxed max-w-4xl mx-auto font-bold">
                Smart training. Great results. No monthly subscriptions.
              </p>

              <div className="flex flex-row gap-4 sm:gap-5 justify-center items-stretch px-4">
                <button
                  onClick={() => {
                    planManager.setSavedPlanId(null);
                    navigation.setAppState('questionnaire');
                  }}
                  className="group relative flex-1 max-w-xs btn-primary text-base sm:text-lg py-3 sm:py-4 overflow-hidden transform hover:scale-105 transition-transform duration-300 whitespace-nowrap flex items-center justify-center"
                >
                  <span className="relative z-10">
                    <span className="sm:hidden">New Plan</span>
                    <span className="hidden sm:inline">Create New Plan</span>
                  </span>
                </button>
                {user ? (
                  <button
                    onClick={() => navigation.setAppState('savedPlans')}
                    className="flex-1 max-w-xs btn-ghost text-base sm:text-lg py-3 sm:py-4 transform hover:scale-105 transition-transform duration-300 whitespace-nowrap flex items-center justify-center"
                  >
                    <span className="sm:hidden">My Plans</span>
                    <span className="hidden sm:inline">View My Plans</span>
                  </button>
                ) : (
                  <button
                    onClick={() => navigation.setAppState('login')}
                    className="flex-1 max-w-xs btn-ghost text-base sm:text-lg py-3 sm:py-4 transform hover:scale-105 transition-transform duration-300 whitespace-nowrap flex items-center justify-center"
                  >
                    Login
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {navigation.appState === 'questionnaire' && (
          <div className="pt-8">
            <QuestionnaireForm onSubmit={handleQuestionnaireSubmit} isLoading={planManager.isLoading} />
          </div>
        )}

        {navigation.appState === 'viewPlan' && planManager.planData && planManager.planType && planManager.answers && (
          <Suspense fallback={<TrainingPlanSkeleton />}>
            <PlanWithChat
              planData={planManager.planData}
              planType={planManager.planType}
              answers={planManager.answers}
              onNewPlan={handleNewPlan}
              chatHistory={planManager.chatHistory}
              onChatUpdate={(history) => {
                console.log('[DEBUG-APP] onChatUpdate CALLED', {
                  oldLength: planManager.chatHistory.length,
                  newLength: history.length,
                  newMessages: history.slice(planManager.chatHistory.length).map(msg => ({
                    role: msg.role,
                    contentPreview: msg.content.substring(0, 50)
                  }))
                });
                planManager.setChatHistory(history);
              }}
              onUpdatePlan={planManager.updatePlan}
              fullPlanData={planManager.fullPlanData}
              onSaveFullPlan={handleSaveFullPlan}
              onAcceptPreview={handleAcceptPreview}
              savedPlanId={planManager.savedPlanId}
              planStartDate={planManager.planStartDate || undefined}
              initialTrainingPaces={planManager.trainingPaces}
              isLoading={planManager.isLoading}
              progressPanel={planManager.progressPanel}
              onRefreshPlan={handleRefreshPlan}
              debugInfo={planManager.debugInfo}
            />
          </Suspense>
        )}

        {navigation.appState === 'savedPlans' && (
          <Suspense fallback={<SavedPlansSkeleton />}>
            <SavedPlans
              onLoadPlan={handleLoadPlan}
              onClose={() => navigation.setAppState('landing')}
            />
          </Suspense>
        )}

        {navigation.appState === 'about' && (
          <Suspense fallback={<div className="min-h-dvh bg-white dark:bg-neutral-950 flex items-center justify-center"><div className="animate-spin rounded-full h-14 w-14 border-4 border-neutral-300 dark:border-neutral-800 border-t-primary-500"></div></div>}>
            <About onClose={() => navigation.setAppState('landing')} />
          </Suspense>
        )}

        {navigation.showPaceCalculator && (
          <Suspense fallback={<div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"><div className="animate-spin rounded-full h-14 w-14 border-4 border-neutral-300 dark:border-neutral-800 border-t-primary-500"></div></div>}>
            <PaceCalculator onClose={() => navigation.setShowPaceCalculator(false)} />
          </Suspense>
        )}

        {navigation.showDashboard && (
          <Suspense fallback={<div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"><DashboardSkeleton /></div>}>
            <Dashboard
              onClose={() => navigation.setShowDashboard(false)}
              onNavigateToRecovery={() => navigation.openRecoveryTools()}
              onNavigateToNutrition={() => navigation.openNutrition()}
              onNavigateToRace={() => navigation.openRacePlanning()}
              planId={planManager.savedPlanId}
              planData={planManager.planData}
              fullPlanData={planManager.fullPlanData}
              planStartDate={planManager.planStartDate}
              trainingPaces={planManager.trainingPaces}
              raceDate={planManager.answers?.raceDate}
            />
          </Suspense>
        )}

        {navigation.showRecoveryTools && (
          <Suspense fallback={<div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"><div className="animate-spin rounded-full h-14 w-14 border-4 border-neutral-300 dark:border-neutral-800 border-t-primary-500"></div></div>}>
            <RecoveryTools onClose={() => {
              navigation.setShowRecoveryTools(false);
              navigation.setShowDashboard(true);
            }} />
          </Suspense>
        )}

        {navigation.showNutrition && (
          <Suspense fallback={<div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"><div className="animate-spin rounded-full h-14 w-14 border-4 border-neutral-300 dark:border-neutral-800 border-t-primary-500"></div></div>}>
            <NutritionHydration onClose={() => {
              navigation.setShowNutrition(false);
              navigation.setShowDashboard(true);
            }} />
          </Suspense>
        )}

        {navigation.showRacePlanning && (
          <Suspense fallback={<div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"><div className="animate-spin rounded-full h-14 w-14 border-4 border-neutral-300 dark:border-neutral-800 border-t-primary-500"></div></div>}>
            <RaceDayPlanning onClose={() => {
              navigation.setShowRacePlanning(false);
              navigation.setShowDashboard(true);
            }} planId={planManager.savedPlanId} />
          </Suspense>
        )}

        {navigation.showFeedback && (
          <FeedbackModal onClose={() => navigation.setShowFeedback(false)} />
        )}

        {navigation.showAdminDashboard && (
          <Suspense fallback={<div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"><div className="animate-spin rounded-full h-14 w-14 border-4 border-neutral-300 dark:border-neutral-800 border-t-primary-500"></div></div>}>
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50">
              <div className="relative h-full">
                <button
                  onClick={() => navigation.setShowAdminDashboard(false)}
                  className="absolute top-4 right-4 z-[60] p-2 bg-white dark:bg-slate-800 rounded-lg shadow-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <X className="w-6 h-6 text-slate-900 dark:text-white" />
                </button>
                <div className="h-full overflow-y-auto">
                  <AdminDashboard />
                </div>
              </div>
            </div>
          </Suspense>
        )}

        {showAuthModal && (
          <AuthModal
            defaultToSignup={true}
            onSuccess={async () => {
              setShowAuthModal(false);
              const { data: { session } } = await supabase.auth.getSession();
              if (session?.user) {
                try {
                  const jobId = await planManager.acceptPreviewPlan();
                  showToast('success', 'Your full training plan is being generated! Check My Plans to track progress.');
                  navigation.setAppState('savedPlans');
                  setTimeout(() => {
                    window.scrollTo({ top: 0, behavior: 'instant' });
                  }, 0);
                } catch (err) {
                  console.error('Error accepting preview:', err);
                  const errorMessage = err instanceof Error ? err.message : 'Failed to start plan generation';
                  showToast('error', `Error: ${errorMessage}`);
                }
              }
            }}
            onClose={() => setShowAuthModal(false)}
          />
        )}

        <Footer />
        </div>
      </div>
    </div>
  );
}

export default App;
