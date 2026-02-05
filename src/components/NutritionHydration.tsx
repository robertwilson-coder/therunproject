import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Beaker, ClipboardList, TrendingUp, Edit2, CheckCircle, AlertCircle, Smile, Frown, Meh, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface NutritionHydrationProps {
  onClose: () => void;
}

interface FuelingStrategy {
  id: string;
  name: string;
  description: string;
  pre_run_items: FuelingItem[];
  during_run_items: DuringRunItem[];
  post_run_items: FuelingItem[];
  hydration_plan: HydrationPlan;
  created_at: string;
}

interface FuelingItem {
  item: string;
  timing: string;
  notes?: string;
}

interface DuringRunItem extends FuelingItem {
  km_marker?: number;
  time_marker?: string;
}

interface HydrationPlan {
  goal_ml?: number;
  frequency?: string;
  notes?: string;
}

interface FuelingLog {
  id: string;
  workout_completion_id: string;
  strategy_id?: string;
  strategy_name?: string;
  pre_run_items: FuelingItem[];
  during_run_items: DuringRunItem[];
  post_run_items: FuelingItem[];
  hydration_actual: { amount_ml?: number; notes?: string };
  stomach_comfort_rating: number | null;
  energy_rating: number | null;
  notes: string;
  created_at: string;
  workout_date?: string;
  workout_type?: string;
  rpe?: number;
}

interface WorkoutCompletion {
  id: string;
  completed_at: string;
  day_name: string;
  distance_miles?: number;
  duration_minutes?: number;
  rating?: number;
}

export function NutritionHydration({ onClose }: NutritionHydrationProps) {
  const [activeTab, setActiveTab] = useState<'strategies' | 'log' | 'analytics'>('strategies');
  const [strategies, setStrategies] = useState<FuelingStrategy[]>([]);
  const [fuelingLogs, setFuelingLogs] = useState<FuelingLog[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutCompletion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showStrategyForm, setShowStrategyForm] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<FuelingStrategy | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const [strategyForm, setStrategyForm] = useState({
    name: '',
    description: '',
    pre_run_items: [] as FuelingItem[],
    during_run_items: [] as DuringRunItem[],
    post_run_items: [] as FuelingItem[],
    hydration_goal_ml: '',
    hydration_frequency: '',
    hydration_notes: ''
  });

  const [logForm, setLogForm] = useState({
    workout_id: '',
    strategy_id: '',
    pre_run_items: [] as FuelingItem[],
    during_run_items: [] as DuringRunItem[],
    post_run_items: [] as FuelingItem[],
    hydration_ml: '',
    hydration_notes: '',
    stomach_comfort: 3,
    energy_rating: 3,
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [strategiesData, logsData, workoutsData] = await Promise.all([
      supabase
        .from('fueling_strategies')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('fueling_logs')
        .select(`
          *,
          workout_completions (
            workout_date,
            workout_type,
            rpe
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('workout_completions')
        .select('id, completed_at, day_name, distance_miles, duration_minutes, rating')
        .eq('user_id', user.id)
        .order('completed_at', { ascending: false })
        .limit(30)
    ]);

    if (strategiesData.data) setStrategies(strategiesData.data);
    if (logsData.data) {
      const formattedLogs = logsData.data.map(log => ({
        ...log,
        workout_date: log.workout_completions?.workout_date,
        workout_type: log.workout_completions?.workout_type,
        rpe: log.workout_completions?.rpe
      }));
      setFuelingLogs(formattedLogs);
    }
    if (workoutsData.data) setWorkouts(workoutsData.data);
    setLoading(false);
  };

  const handleSaveStrategy = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const strategyData = {
      user_id: user.id,
      name: strategyForm.name,
      description: strategyForm.description,
      pre_run_items: strategyForm.pre_run_items,
      during_run_items: strategyForm.during_run_items,
      post_run_items: strategyForm.post_run_items,
      hydration_plan: {
        goal_ml: strategyForm.hydration_goal_ml ? parseInt(strategyForm.hydration_goal_ml) : null,
        frequency: strategyForm.hydration_frequency,
        notes: strategyForm.hydration_notes
      }
    };

    if (editingStrategy) {
      await supabase
        .from('fueling_strategies')
        .update(strategyData)
        .eq('id', editingStrategy.id);
    } else {
      await supabase.from('fueling_strategies').insert(strategyData);
    }

    resetStrategyForm();
    loadData();
  };

  const handleSaveLog = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !logForm.workout_id) return;

    await supabase.from('fueling_logs').insert({
      user_id: user.id,
      workout_completion_id: logForm.workout_id,
      strategy_id: logForm.strategy_id || null,
      pre_run_items: logForm.pre_run_items,
      during_run_items: logForm.during_run_items,
      post_run_items: logForm.post_run_items,
      hydration_actual: {
        amount_ml: logForm.hydration_ml ? parseInt(logForm.hydration_ml) : null,
        notes: logForm.hydration_notes
      },
      stomach_comfort_rating: logForm.stomach_comfort,
      energy_rating: logForm.energy_rating,
      notes: logForm.notes
    });

    resetLogForm();
    loadData();
  };

  const handleDeleteStrategy = async (id: string) => {
    if (!confirm('Delete this fueling strategy?')) return;
    await supabase.from('fueling_strategies').delete().eq('id', id);
    loadData();
  };

  const loadStrategy = (strategy: FuelingStrategy) => {
    setLogForm({
      ...logForm,
      strategy_id: strategy.id,
      pre_run_items: [...strategy.pre_run_items],
      during_run_items: [...strategy.during_run_items],
      post_run_items: [...strategy.post_run_items],
      hydration_ml: strategy.hydration_plan.goal_ml?.toString() || '',
      hydration_notes: strategy.hydration_plan.notes || ''
    });
  };

  const resetStrategyForm = () => {
    setStrategyForm({
      name: '',
      description: '',
      pre_run_items: [],
      during_run_items: [],
      post_run_items: [],
      hydration_goal_ml: '',
      hydration_frequency: '',
      hydration_notes: ''
    });
    setEditingStrategy(null);
    setShowStrategyForm(false);
  };

  const resetLogForm = () => {
    setLogForm({
      workout_id: '',
      strategy_id: '',
      pre_run_items: [],
      during_run_items: [],
      post_run_items: [],
      hydration_ml: '',
      hydration_notes: '',
      stomach_comfort: 3,
      energy_rating: 3,
      notes: ''
    });
    setShowLogForm(false);
  };

  const addPreRunItem = () => {
    setStrategyForm({
      ...strategyForm,
      pre_run_items: [...strategyForm.pre_run_items, { item: '', timing: '', notes: '' }]
    });
  };

  const addDuringRunItem = () => {
    setStrategyForm({
      ...strategyForm,
      during_run_items: [...strategyForm.during_run_items, { item: '', timing: '', km_marker: undefined }]
    });
  };

  const addPostRunItem = () => {
    setStrategyForm({
      ...strategyForm,
      post_run_items: [...strategyForm.post_run_items, { item: '', timing: '', notes: '' }]
    });
  };

  const removeItem = (type: 'pre_run' | 'during_run' | 'post_run', index: number) => {
    if (type === 'pre_run') {
      setStrategyForm({
        ...strategyForm,
        pre_run_items: strategyForm.pre_run_items.filter((_, i) => i !== index)
      });
    } else if (type === 'during_run') {
      setStrategyForm({
        ...strategyForm,
        during_run_items: strategyForm.during_run_items.filter((_, i) => i !== index)
      });
    } else {
      setStrategyForm({
        ...strategyForm,
        post_run_items: strategyForm.post_run_items.filter((_, i) => i !== index)
      });
    }
  };

  const updatePreRunItem = (index: number, field: keyof FuelingItem, value: string) => {
    const items = [...strategyForm.pre_run_items];
    items[index] = { ...items[index], [field]: value };
    setStrategyForm({ ...strategyForm, pre_run_items: items });
  };

  const updateDuringRunItem = (index: number, field: keyof DuringRunItem, value: string | number | undefined) => {
    const items = [...strategyForm.during_run_items];
    items[index] = { ...items[index], [field]: value };
    setStrategyForm({ ...strategyForm, during_run_items: items });
  };

  const updatePostRunItem = (index: number, field: keyof FuelingItem, value: string) => {
    const items = [...strategyForm.post_run_items];
    items[index] = { ...items[index], [field]: value };
    setStrategyForm({ ...strategyForm, post_run_items: items });
  };

  const getRatingIcon = (rating: number) => {
    if (rating >= 4) return <Smile className="w-5 h-5 text-green-600" />;
    if (rating === 3) return <Meh className="w-5 h-5 text-yellow-600" />;
    return <Frown className="w-5 h-5 text-red-600" />;
  };

  const getStrategySuccessRate = (strategyId: string) => {
    const logs = fuelingLogs.filter(log => log.strategy_id === strategyId);
    if (logs.length === 0) return null;

    const goodOutcomes = logs.filter(log =>
      (log.stomach_comfort_rating || 0) >= 4 && (log.energy_rating || 0) >= 4
    ).length;

    return {
      rate: (goodOutcomes / logs.length) * 100,
      total: logs.length
    };
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Beaker className="w-6 h-6 text-orange-600" />
              Fueling Strategy Lab
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Experiment, track, and perfect your race-day fueling strategy
          </p>

          <div className="mt-4 flex gap-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab('strategies')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'strategies'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              My Strategies
            </button>
            <button
              onClick={() => setActiveTab('log')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'log'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <Edit2 className="w-4 h-4" />
              Log Fueling
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'analytics'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              Analytics
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'strategies' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Fueling Strategies</h3>
                <button
                  onClick={() => setShowStrategyForm(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Strategy
                </button>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg border-2 border-blue-200 dark:border-blue-700 overflow-hidden">
                <button
                  onClick={() => setShowGuide(!showGuide)}
                  className="w-full flex items-center justify-between p-4 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-gray-900 dark:text-white">How to Build & Test Your Strategy</span>
                  </div>
                  {showGuide ? <ChevronUp className="w-5 h-5 text-gray-600 dark:text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-600 dark:text-gray-400" />}
                </button>

                {showGuide && (
                  <div className="p-5 border-t border-blue-200 dark:border-blue-700 space-y-5 text-sm text-gray-700 dark:text-gray-300">
                    <div>
                      <h4 className="font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">1</span>
                        Start with Easy Runs
                      </h4>
                      <p className="ml-8 mb-2">Test new foods during your easy or recovery runs (typically the shorter runs in weeks 1-4 of your plan). These low-intensity workouts are perfect for experimenting without risking your key sessions.</p>
                      <p className="ml-8 text-gray-600 dark:text-gray-400 italic">Example: Try a banana 30min before your Tuesday easy run, or test a gel at 5km into your Thursday recovery run.</p>
                    </div>

                    <div>
                      <h4 className="font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">2</span>
                        Progress to Long Runs
                      </h4>
                      <p className="ml-8 mb-2">Once you've confirmed a food sits well, test it during your weekly long runs. These are your most important testing grounds since they mimic race-day duration and fuel demands.</p>
                      <p className="ml-8 text-gray-600 dark:text-gray-400 italic">Example: If oatmeal worked well before easy runs, try it before your Saturday long run. Test taking a gel every 45 minutes during your 16+ km runs.</p>
                    </div>

                    <div>
                      <h4 className="font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">3</span>
                        Test at Race Pace
                      </h4>
                      <p className="ml-8 mb-2">Use your tempo runs, goal pace runs, and race pace workouts (usually mid-week) to test your strategy at race intensity. Fueling needs change when running faster.</p>
                      <p className="ml-8 text-gray-600 dark:text-gray-400 italic">Example: During your Wednesday tempo run, practice taking a gel at the same effort level you'll race at. This helps your body adapt to processing fuel at higher intensities.</p>
                    </div>

                    <div>
                      <h4 className="font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">4</span>
                        Practice Your Full Race Plan
                      </h4>
                      <p className="ml-8 mb-2">During your final long runs (weeks 3-4 before race day), execute your complete race-day fueling strategy from start to finish. Use the exact products, timing, and amounts you plan to use on race day.</p>
                      <p className="ml-8 text-gray-600 dark:text-gray-400 italic">Example: For a half marathon, your 16-19km long runs are perfect dress rehearsals. Eat your planned breakfast at the same time, carry the same products, and practice your fueling schedule.</p>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border-2 border-blue-300 dark:border-blue-600">
                      <h4 className="font-bold text-gray-900 dark:text-white mb-3">Sample Strategies to Try</h4>
                      <div className="space-y-3">
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">5K/10K Strategy</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 ml-3">Pre: Light snack 2hrs before + water</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 ml-3">During: Usually not needed for &lt;60min races</p>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">Half Marathon Strategy</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 ml-3">Pre: Oatmeal + banana 2-3hrs before, water until 30min before</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 ml-3">During: First gel by 30min (no later), then at ~10-11km, water at every station</p>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">Marathon Strategy</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 ml-3">Pre: 300-400 cal meal 3hrs before, sip water until start</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 ml-3">During: First gel by 30min (no later), then 30-60g carbs/hr (gel every 45min or chews every 30min), water at every station</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4 border-2 border-yellow-300 dark:border-yellow-700">
                      <h4 className="font-bold text-gray-900 dark:text-white mb-2">Pro Tips</h4>
                      <ul className="space-y-2 text-xs">
                        <li className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <span>Never try anything new on race day. Test everything at least 2-3 times during training.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <span>Log how you felt after each test. Your stomach and energy ratings help identify what works.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <span>Start fueling before you're hungry. Once you're depleted, it's hard to recover.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <span>Pay attention to weather. You may need more hydration on hot days and more calories in cold weather.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <span>If something causes stomach issues, adjust timing or amounts before eliminating it completely.</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              {showStrategyForm && (
                <form onSubmit={handleSaveStrategy} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Strategy Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={strategyForm.name}
                        onChange={(e) => setStrategyForm({ ...strategyForm, name: e.target.value })}
                        placeholder="e.g., Half Marathon Race Plan"
                        className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Description
                      </label>
                      <input
                        type="text"
                        value={strategyForm.description}
                        onChange={(e) => setStrategyForm({ ...strategyForm, description: e.target.value })}
                        placeholder="e.g., Works well for morning races"
                        className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-900 dark:text-white">Pre-Run Fueling</h4>
                      <button
                        type="button"
                        onClick={addPreRunItem}
                        className="text-sm text-orange-600 hover:text-orange-700 dark:text-orange-400 font-semibold"
                      >
                        + Add Item
                      </button>
                    </div>
                    <div className="space-y-2">
                      {strategyForm.pre_run_items.map((item, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2">
                          <input
                            type="text"
                            placeholder="Item (e.g., Banana)"
                            value={item.item}
                            onChange={(e) => updatePreRunItem(idx, 'item', e.target.value)}
                            className="col-span-5 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          />
                          <input
                            type="text"
                            placeholder="Timing (e.g., 30min before)"
                            value={item.timing}
                            onChange={(e) => updatePreRunItem(idx, 'timing', e.target.value)}
                            className="col-span-6 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => removeItem('pre_run', idx)}
                            className="col-span-1 text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-900 dark:text-white">During-Run Fueling</h4>
                      <button
                        type="button"
                        onClick={addDuringRunItem}
                        className="text-sm text-orange-600 hover:text-orange-700 dark:text-orange-400 font-semibold"
                      >
                        + Add Item
                      </button>
                    </div>
                    <div className="space-y-2">
                      {strategyForm.during_run_items.map((item, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2">
                          <input
                            type="text"
                            placeholder="Item (e.g., Energy Gel)"
                            value={item.item}
                            onChange={(e) => updateDuringRunItem(idx, 'item', e.target.value)}
                            className="col-span-4 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          />
                          <input
                            type="number"
                            placeholder="Km"
                            value={item.km_marker || ''}
                            onChange={(e) => updateDuringRunItem(idx, 'km_marker', e.target.value ? parseFloat(e.target.value) : undefined)}
                            className="col-span-2 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          />
                          <input
                            type="text"
                            placeholder="Notes"
                            value={item.notes || ''}
                            onChange={(e) => updateDuringRunItem(idx, 'notes', e.target.value)}
                            className="col-span-5 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => removeItem('during_run', idx)}
                            className="col-span-1 text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-900 dark:text-white">Post-Run Recovery</h4>
                      <button
                        type="button"
                        onClick={addPostRunItem}
                        className="text-sm text-orange-600 hover:text-orange-700 dark:text-orange-400 font-semibold"
                      >
                        + Add Item
                      </button>
                    </div>
                    <div className="space-y-2">
                      {strategyForm.post_run_items.map((item, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2">
                          <input
                            type="text"
                            placeholder="Item (e.g., Protein Shake)"
                            value={item.item}
                            onChange={(e) => updatePostRunItem(idx, 'item', e.target.value)}
                            className="col-span-5 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          />
                          <input
                            type="text"
                            placeholder="Timing (e.g., Within 30min)"
                            value={item.timing}
                            onChange={(e) => updatePostRunItem(idx, 'timing', e.target.value)}
                            className="col-span-6 px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => removeItem('post_run', idx)}
                            className="col-span-1 text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Hydration Plan</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Goal (ml)
                        </label>
                        <input
                          type="number"
                          value={strategyForm.hydration_goal_ml}
                          onChange={(e) => setStrategyForm({ ...strategyForm, hydration_goal_ml: e.target.value })}
                          placeholder="e.g., 500"
                          className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Frequency
                        </label>
                        <input
                          type="text"
                          value={strategyForm.hydration_frequency}
                          onChange={(e) => setStrategyForm({ ...strategyForm, hydration_frequency: e.target.value })}
                          placeholder="e.g., Every 15 minutes"
                          className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                    >
                      {editingStrategy ? 'Update Strategy' : 'Save Strategy'}
                    </button>
                    <button
                      type="button"
                      onClick={resetStrategyForm}
                      className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {loading ? (
                <p className="text-center text-gray-600 dark:text-gray-400">Loading...</p>
              ) : strategies.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <Beaker className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400 text-lg">No strategies yet</p>
                  <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">Create your first fueling strategy to get started</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {strategies.map((strategy) => {
                    const successRate = getStrategySuccessRate(strategy.id);
                    return (
                      <div key={strategy.id} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-5 border-2 border-gray-200 dark:border-gray-600">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h4 className="font-bold text-lg text-gray-900 dark:text-white">{strategy.name}</h4>
                            {strategy.description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{strategy.description}</p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleDeleteStrategy(strategy.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>

                        {successRate && (
                          <div className="mb-3 p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-green-600" />
                              <span className="text-sm font-semibold text-green-800 dark:text-green-200">
                                {successRate.rate.toFixed(0)}% success rate ({successRate.total} uses)
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="space-y-2 text-sm">
                          {strategy.pre_run_items.length > 0 && (
                            <div>
                              <span className="font-semibold text-gray-700 dark:text-gray-300">Pre-Run:</span>
                              <ul className="ml-4 mt-1 space-y-1">
                                {strategy.pre_run_items.map((item, idx) => (
                                  <li key={idx} className="text-gray-600 dark:text-gray-400">
                                    {item.item} ({item.timing})
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {strategy.during_run_items.length > 0 && (
                            <div>
                              <span className="font-semibold text-gray-700 dark:text-gray-300">During Run:</span>
                              <ul className="ml-4 mt-1 space-y-1">
                                {strategy.during_run_items.map((item, idx) => (
                                  <li key={idx} className="text-gray-600 dark:text-gray-400">
                                    {item.item} {item.km_marker ? `at ${item.km_marker}km` : ''}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {strategy.post_run_items.length > 0 && (
                            <div>
                              <span className="font-semibold text-gray-700 dark:text-gray-300">Post-Run:</span>
                              <ul className="ml-4 mt-1 space-y-1">
                                {strategy.post_run_items.map((item, idx) => (
                                  <li key={idx} className="text-gray-600 dark:text-gray-400">
                                    {item.item} ({item.timing})
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => {
                            loadStrategy(strategy);
                            setActiveTab('log');
                          }}
                          className="mt-3 w-full px-3 py-2 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-lg hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors text-sm font-semibold"
                        >
                          Use This Strategy
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === 'log' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Log Fueling for Workout</h3>
                {!showLogForm && (
                  <button
                    onClick={() => setShowLogForm(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    New Log
                  </button>
                )}
              </div>

              {showLogForm && (
                <form onSubmit={handleSaveLog} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Workout *
                      </label>
                      <select
                        required
                        value={logForm.workout_id}
                        onChange={(e) => setLogForm({ ...logForm, workout_id: e.target.value })}
                        className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      >
                        <option value="">Select a workout</option>
                        {workouts.map((workout) => (
                          <option key={workout.id} value={workout.id}>
                            {new Date(workout.completed_at).toLocaleDateString()} - {workout.day_name} {workout.distance_miles ? `(${workout.distance_miles} mi)` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Based on Strategy (Optional)
                      </label>
                      <select
                        value={logForm.strategy_id}
                        onChange={(e) => {
                          const strategyId = e.target.value;
                          setLogForm({ ...logForm, strategy_id: strategyId });
                          if (strategyId) {
                            const strategy = strategies.find(s => s.id === strategyId);
                            if (strategy) loadStrategy(strategy);
                          }
                        }}
                        className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      >
                        <option value="">None (manual entry)</option>
                        {strategies.map((strategy) => (
                          <option key={strategy.id} value={strategy.id}>
                            {strategy.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      What did you consume? (Add items manually or select a strategy above)
                    </label>
                    <textarea
                      value={logForm.notes}
                      onChange={(e) => setLogForm({ ...logForm, notes: e.target.value })}
                      rows={3}
                      placeholder="e.g., Banana 30min before, Gel at 10km, Sports drink every 15min"
                      className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Hydration (ml)
                      </label>
                      <input
                        type="number"
                        value={logForm.hydration_ml}
                        onChange={(e) => setLogForm({ ...logForm, hydration_ml: e.target.value })}
                        placeholder="e.g., 500"
                        className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Stomach Comfort (1-5)
                      </label>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((rating) => (
                          <button
                            key={rating}
                            type="button"
                            onClick={() => setLogForm({ ...logForm, stomach_comfort: rating })}
                            className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
                              logForm.stomach_comfort === rating
                                ? 'bg-orange-600 text-white'
                                : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                            }`}
                          >
                            {rating}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        1 = Very uncomfortable, 5 = Perfect
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Energy Level (1-5)
                      </label>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((rating) => (
                          <button
                            key={rating}
                            type="button"
                            onClick={() => setLogForm({ ...logForm, energy_rating: rating })}
                            className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
                              logForm.energy_rating === rating
                                ? 'bg-orange-600 text-white'
                                : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                            }`}
                          >
                            {rating}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        1 = No energy, 5 = Felt great
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                    >
                      Save Log
                    </button>
                    <button
                      type="button"
                      onClick={resetLogForm}
                      className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {!showLogForm && (
                <>
                  {loading ? (
                    <p className="text-center text-gray-600 dark:text-gray-400">Loading...</p>
                  ) : fuelingLogs.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <ClipboardList className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600 dark:text-gray-400 text-lg">No fueling logs yet</p>
                      <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">Start logging your fueling experiments</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {fuelingLogs.map((log) => (
                        <div key={log.id} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-5 border-2 border-gray-200 dark:border-gray-600">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <p className="font-semibold text-gray-900 dark:text-white">
                                {log.workout_date} - {log.workout_type}
                              </p>
                              {log.strategy_id && (
                                <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-2 py-1 rounded mt-1 inline-block">
                                  Strategy: {strategies.find(s => s.id === log.strategy_id)?.name}
                                </span>
                              )}
                            </div>
                            <div className="flex gap-4">
                              <div className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {getRatingIcon(log.stomach_comfort_rating || 0)}
                                  <span className="font-bold text-gray-900 dark:text-white">{log.stomach_comfort_rating}</span>
                                </div>
                                <p className="text-xs text-gray-600 dark:text-gray-400">Stomach</p>
                              </div>
                              <div className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {getRatingIcon(log.energy_rating || 0)}
                                  <span className="font-bold text-gray-900 dark:text-white">{log.energy_rating}</span>
                                </div>
                                <p className="text-xs text-gray-600 dark:text-gray-400">Energy</p>
                              </div>
                            </div>
                          </div>

                          {log.notes && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{log.notes}</p>
                          )}

                          {log.hydration_actual?.amount_ml && (
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              Hydration: {log.hydration_actual.amount_ml}ml
                            </p>
                          )}

                          {log.rpe && (
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                              Workout RPE: {log.rpe}/10
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Fueling Insights</h3>

              {fuelingLogs.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <TrendingUp className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400 text-lg">Not enough data yet</p>
                  <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">Log more fueling experiments to see insights</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg p-5 border-2 border-green-200 dark:border-green-700">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Great Outcomes</span>
                      </div>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        {fuelingLogs.filter(log =>
                          (log.stomach_comfort_rating || 0) >= 4 && (log.energy_rating || 0) >= 4
                        ).length}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Both ratings 4+
                      </p>
                    </div>

                    <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 rounded-lg p-5 border-2 border-yellow-200 dark:border-yellow-700">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="w-5 h-5 text-yellow-600" />
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Avg Stomach</span>
                      </div>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        {(fuelingLogs.reduce((sum, log) => sum + (log.stomach_comfort_rating || 0), 0) / fuelingLogs.length).toFixed(1)}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Out of 5
                      </p>
                    </div>

                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 rounded-lg p-5 border-2 border-orange-200 dark:border-orange-700">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-5 h-5 text-orange-600" />
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Avg Energy</span>
                      </div>
                      <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        {(fuelingLogs.reduce((sum, log) => sum + (log.energy_rating || 0), 0) / fuelingLogs.length).toFixed(1)}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Out of 5
                      </p>
                    </div>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-5">
                    <h4 className="font-bold text-gray-900 dark:text-white mb-4">Top Performing Strategies</h4>
                    <div className="space-y-3">
                      {strategies
                        .map(strategy => ({
                          strategy,
                          successRate: getStrategySuccessRate(strategy.id)
                        }))
                        .filter(item => item.successRate !== null)
                        .sort((a, b) => (b.successRate?.rate || 0) - (a.successRate?.rate || 0))
                        .slice(0, 5)
                        .map(({ strategy, successRate }) => (
                          <div key={strategy.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg">
                            <div>
                              <p className="font-semibold text-gray-900 dark:text-white">{strategy.name}</p>
                              <p className="text-xs text-gray-600 dark:text-gray-400">
                                {successRate?.total} uses
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold text-green-600">
                                {successRate?.rate.toFixed(0)}%
                              </p>
                              <p className="text-xs text-gray-600 dark:text-gray-400">success</p>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-5 border-2 border-blue-200 dark:border-blue-700">
                    <h4 className="font-bold text-gray-900 dark:text-white mb-3">Key Takeaways</h4>
                    <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                      {(() => {
                        const avgStomach = fuelingLogs.reduce((sum, log) => sum + (log.stomach_comfort_rating || 0), 0) / fuelingLogs.length;
                        const avgEnergy = fuelingLogs.reduce((sum, log) => sum + (log.energy_rating || 0), 0) / fuelingLogs.length;

                        return (
                          <>
                            {avgStomach >= 4 && (
                              <li className="flex items-start gap-2">
                                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                                <span>Your fueling is working well for stomach comfort</span>
                              </li>
                            )}
                            {avgStomach < 3 && (
                              <li className="flex items-start gap-2">
                                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                                <span>Try reducing portion sizes or timing adjustments for better stomach comfort</span>
                              </li>
                            )}
                            {avgEnergy >= 4 && (
                              <li className="flex items-start gap-2">
                                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                                <span>Your energy levels are consistently good</span>
                              </li>
                            )}
                            {avgEnergy < 3 && (
                              <li className="flex items-start gap-2">
                                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                                <span>Consider increasing carb intake or frequency during runs</span>
                              </li>
                            )}
                            <li className="flex items-start gap-2">
                              <TrendingUp className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                              <span>You've logged {fuelingLogs.length} fueling experiments - keep testing to find what works best!</span>
                            </li>
                          </>
                        );
                      })()}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
