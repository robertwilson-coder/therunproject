import { useState, useEffect } from 'react';
import { X, Flag, Plus, Calendar, Clock, Target, CloudRain, Edit2, Trash2, Lightbulb } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { parseLocalDate } from '../utils/dateUtils';

interface RaceDayPlanningProps {
  onClose: () => void;
  planId?: string | null;
}

interface RacePlan {
  id: string;
  race_name: string;
  race_date: string;
  race_distance: string;
  target_time?: string;
  pacing_strategy?: {
    splits?: { distance: string; pace: string; notes?: string }[];
    strategy?: string;
  };
  weather_notes?: string;
  notes?: string;
}

export function RaceDayPlanning({ onClose, planId }: RaceDayPlanningProps) {
  const [racePlans, setRacePlans] = useState<RacePlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<RacePlan | null>(null);
  const [showAdvice, setShowAdvice] = useState(false);

  const [formData, setFormData] = useState({
    race_name: '',
    race_date: '',
    race_distance: '5K',
    target_time: '',
    strategy: '',
    weather_notes: '',
    notes: ''
  });

  useEffect(() => {
    loadRacePlans();
  }, []);

  const loadRacePlans = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let query = supabase
      .from('race_plans')
      .select('*')
      .eq('user_id', user.id)
      .order('race_date', { ascending: true });

    if (planId) {
      query = query.eq('training_plan_id', planId);
    }

    const { data } = await query;
    if (data) setRacePlans(data);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const racePlanData = {
      user_id: user.id,
      training_plan_id: planId || null,
      race_name: formData.race_name,
      race_date: formData.race_date,
      race_distance: formData.race_distance,
      target_time: formData.target_time || null,
      pacing_strategy: formData.strategy ? { strategy: formData.strategy } : null,
      weather_notes: formData.weather_notes || null,
      notes: formData.notes || null
    };

    if (editingPlan) {
      await supabase
        .from('race_plans')
        .update(racePlanData)
        .eq('id', editingPlan.id);
    } else {
      await supabase.from('race_plans').insert(racePlanData);
    }

    setFormData({
      race_name: '',
      race_date: '',
      race_distance: '5K',
      target_time: '',
      strategy: '',
      weather_notes: '',
      notes: ''
    });
    setShowAddForm(false);
    setEditingPlan(null);
    loadRacePlans();
  };

  const handleEdit = (plan: RacePlan) => {
    setEditingPlan(plan);
    setFormData({
      race_name: plan.race_name,
      race_date: plan.race_date,
      race_distance: plan.race_distance,
      target_time: plan.target_time || '',
      strategy: plan.pacing_strategy?.strategy || '',
      weather_notes: plan.weather_notes || '',
      notes: plan.notes || ''
    });
    setShowAddForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this race plan?')) return;
    await supabase.from('race_plans').delete().eq('id', id);
    loadRacePlans();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getDaysUntilRace = (raceDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const race = parseLocalDate(raceDate);
    const diffTime = race.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Flag className="w-6 h-6 text-orange-600" />
              Race Day Planning
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
            Prepare for race day success. Set goals, plan your pacing strategy, and organize all the details to ensure you're ready to perform at your best.
          </p>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <button
              onClick={() => setShowAdvice(!showAdvice)}
              className="w-full flex items-center justify-between text-left group"
            >
              <div className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Race Day Planning Guide
                </h3>
              </div>
              <span className="text-blue-600 dark:text-blue-400 text-sm font-semibold">
                {showAdvice ? 'Hide' : 'Show'}
              </span>
            </button>

            {showAdvice && (
              <div className="mt-4 space-y-4 text-sm text-gray-700 dark:text-gray-300">
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-white mb-2">Why Plan Your Race Day?</h4>
                  <p className="leading-relaxed">
                    Successful race day performance comes from careful preparation and testing during training.
                    Use this tool to document your race strategy, pacing plan, nutrition approach, and logistics
                    so nothing is left to chance on race day.
                  </p>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 space-y-3">
                  <h4 className="font-bold text-gray-900 dark:text-white">Your Race Day Checklist</h4>

                  <div>
                    <p className="font-semibold text-orange-600 dark:text-orange-400 mb-1">1. Pacing Strategy</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Plan even splits or negative splits based on course profile</li>
                      <li>Use your training paces to set realistic race pace targets</li>
                      <li>Test your race pace during tempo and threshold workouts</li>
                      <li>Have a plan B if you need to adjust during the race</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-orange-600 dark:text-orange-400 mb-1">2. Nutrition & Hydration</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Practice your race day breakfast during long runs</li>
                      <li>Test fuel timing and amounts using the Fueling Strategy Lab</li>
                      <li>Know aid station locations and what they offer</li>
                      <li>Plan to carry your own fuel if preferred brands unavailable</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-orange-600 dark:text-orange-400 mb-1">3. Course & Weather</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Study the course elevation profile and plan effort accordingly</li>
                      <li>Check weather forecast and adjust clothing, hydration plan</li>
                      <li>Practice running in similar conditions during training</li>
                      <li>Know where hills, turns, and aid stations are located</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-orange-600 dark:text-orange-400 mb-1">4. Gear & Logistics</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Test all race day clothing and shoes during training runs</li>
                      <li>Prepare gear bag night before with backup items</li>
                      <li>Plan arrival time allowing buffer for parking, bathrooms, warmup</li>
                      <li>Know where start corrals, bag check, and finish areas are</li>
                    </ul>
                  </div>

                  <div>
                    <p className="font-semibold text-orange-600 dark:text-orange-400 mb-1">5. Mental Strategy</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Break race into segments with goals for each section</li>
                      <li>Prepare mantras or cues for when things get tough</li>
                      <li>Visualize success and practice positive self-talk</li>
                      <li>Have a plan for managing pre-race nerves</li>
                    </ul>
                  </div>
                </div>

                <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
                  <p className="font-semibold text-orange-900 dark:text-orange-300 mb-2">Pro Tip:</p>
                  <p className="text-gray-700 dark:text-gray-300">
                    Create your race plan 2-3 weeks before the race, then refine it as you get closer.
                    Practice every element during your training runs so you can execute confidently on race day.
                    The best race day strategies are tested strategies.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between items-center">
            <p className="text-gray-600 dark:text-gray-400">
              Plan your races and set your goals
            </p>
            <button
              onClick={() => {
                setShowAddForm(true);
                setEditingPlan(null);
                setFormData({
                  race_name: '',
                  race_date: '',
                  race_distance: '5K',
                  target_time: '',
                  strategy: '',
                  weather_notes: '',
                  notes: ''
                });
              }}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Race Plan
            </button>
          </div>

          {showAddForm && (
            <form onSubmit={handleSubmit} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 space-y-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {editingPlan ? 'Edit Race Plan' : 'New Race Plan'}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Race Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.race_name}
                    onChange={(e) => setFormData({ ...formData, race_name: e.target.value })}
                    placeholder="e.g., City Marathon 2024"
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Race Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.race_date}
                    onChange={(e) => setFormData({ ...formData, race_date: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Distance *
                  </label>
                  <select
                    value={formData.race_distance}
                    onChange={(e) => setFormData({ ...formData, race_distance: e.target.value })}
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value="5K">5K</option>
                    <option value="10K">10K</option>
                    <option value="Half Marathon">Half Marathon</option>
                    <option value="Marathon">Marathon</option>
                    <option value="Ultra">Ultra</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Target Time
                  </label>
                  <input
                    type="text"
                    value={formData.target_time}
                    onChange={(e) => setFormData({ ...formData, target_time: e.target.value })}
                    placeholder="e.g., 1:45:00"
                    className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Pacing Strategy
                </label>
                <textarea
                  value={formData.strategy}
                  onChange={(e) => setFormData({ ...formData, strategy: e.target.value })}
                  rows={3}
                  placeholder="Describe your pacing plan, splits, or race strategy..."
                  className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Weather & Course Notes
                </label>
                <textarea
                  value={formData.weather_notes}
                  onChange={(e) => setFormData({ ...formData, weather_notes: e.target.value })}
                  rows={2}
                  placeholder="Weather forecast, course elevation, aid station locations..."
                  className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  Additional Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={2}
                  placeholder="Nutrition plan, gear checklist, mental strategies..."
                  className="w-full px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  {editingPlan ? 'Update Plan' : 'Save Plan'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingPlan(null);
                  }}
                  className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <p className="text-center text-gray-600 dark:text-gray-400">Loading...</p>
          ) : racePlans.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <Flag className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 dark:text-gray-400 text-lg">No race plans yet</p>
              <p className="text-gray-500 dark:text-gray-500 text-sm mt-2">
                Add your first race to start planning
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {racePlans.map((plan) => {
                const daysUntil = getDaysUntilRace(plan.race_date);
                const isPast = daysUntil < 0;
                const isUpcoming = daysUntil >= 0 && daysUntil <= 30;

                return (
                  <div
                    key={plan.id}
                    className={`bg-gradient-to-br rounded-lg p-6 border-2 ${
                      isPast
                        ? 'from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 border-gray-300 dark:border-gray-600'
                        : isUpcoming
                        ? 'from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border-orange-300 dark:border-orange-700'
                        : 'from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-300 dark:border-blue-700'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                          {plan.race_name}
                        </h3>
                        <div className="flex flex-wrap gap-2 mb-2">
                          <span className="px-2 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded">
                            {plan.race_distance}
                          </span>
                          {plan.target_time && (
                            <span className="px-2 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded">
                              Target: {plan.target_time}
                            </span>
                          )}
                          {isUpcoming && (
                            <span className="px-2 py-1 bg-orange-500 text-white text-xs font-semibold rounded">
                              {daysUntil} days away
                            </span>
                          )}
                          {isPast && (
                            <span className="px-2 py-1 bg-gray-500 text-white text-xs font-semibold rounded">
                              Completed
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(plan)}
                          className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(plan.id)}
                          className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                        <Calendar className="w-4 h-4" />
                        <span className="font-semibold">{formatDate(plan.race_date)}</span>
                      </div>

                      {plan.pacing_strategy?.strategy && (
                        <div className="bg-white dark:bg-gray-700 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Target className="w-4 h-4 text-orange-600" />
                            <span className="font-semibold text-gray-900 dark:text-white">Pacing Strategy</span>
                          </div>
                          <p className="text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap">
                            {plan.pacing_strategy.strategy}
                          </p>
                        </div>
                      )}

                      {plan.weather_notes && (
                        <div className="bg-white dark:bg-gray-700 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <CloudRain className="w-4 h-4 text-blue-600" />
                            <span className="font-semibold text-gray-900 dark:text-white">Weather & Course</span>
                          </div>
                          <p className="text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap">
                            {plan.weather_notes}
                          </p>
                        </div>
                      )}

                      {plan.notes && (
                        <div className="bg-white dark:bg-gray-700 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Clock className="w-4 h-4 text-gray-600" />
                            <span className="font-semibold text-gray-900 dark:text-white">Notes</span>
                          </div>
                          <p className="text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap">
                            {plan.notes}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
