import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Users, MapPin, Calendar, TrendingUp, Target, Settings, X } from 'lucide-react';

interface RacePartner {
  race_name: string;
  race_location: string;
  race_date: string;
  plan_type: string;
  user_id: string;
  display_name: string;
  avatar_url: string;
  bio: string;
  user_location: string;
  plan_created_at: string;
  start_date: string;
  training_progress_pct: number;
  workouts_completed: number;
  current_week: number;
}

interface RaceBuddiesProps {
  planId?: string | null;
  onClose: () => void;
}

export function RaceBuddies({ planId, onClose }: RaceBuddiesProps) {
  const [partners, setPartners] = useState<RacePartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDiscoverable, setIsDiscoverable] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<{ race_name?: string; race_location?: string; race_date?: string } | null>(null);

  useEffect(() => {
    loadDiscoverableStatus();
    loadCurrentPlan();
  }, [planId]);

  useEffect(() => {
    if (currentPlan?.race_name) {
      loadRacePartners();
    }
  }, [currentPlan?.race_name]);

  const loadCurrentPlan = async () => {
    if (!planId) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('training_plans')
        .select('race_name, race_location, race_date')
        .eq('id', planId)
        .maybeSingle();

      if (error) throw error;
      setCurrentPlan(data);
    } catch (error) {
      console.error('Error loading plan:', error);
    }
  };

  const loadDiscoverableStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
      const { data } = await supabase
        .from('user_profiles')
        .select('discoverable')
        .eq('id', user.id)
        .maybeSingle();

      if (data) {
        setIsDiscoverable(data.discoverable ?? true);
      }
    }
  };

  const loadRacePartners = async () => {
    if (!currentPlan?.race_name) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('race_training_partners')
        .select('*')
        .eq('race_name', currentPlan.race_name)
        .order('training_progress_pct', { ascending: false });

      if (error) throw error;

      const filtered = (data || []).filter((p: RacePartner) => p.user_id !== currentUserId);
      setPartners(filtered);
    } catch (error) {
      console.error('Error loading race partners:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleDiscoverable = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const newValue = !isDiscoverable;
    const { error } = await supabase
      .from('user_profiles')
      .update({ discoverable: newValue })
      .eq('id', user.id);

    if (!error) {
      setIsDiscoverable(newValue);
      if (newValue) {
        loadRacePartners();
      }
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (!currentPlan?.race_name) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
        <div className="bg-white dark:bg-neutral-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="w-6 h-6 text-primary-500" />
              <h2 className="text-xl font-bold text-neutral-900 dark:text-white">Race Training Partners</h2>
            </div>
            <button
              onClick={onClose}
              className="text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors p-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6">
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
              <p className="text-neutral-500 dark:text-neutral-400">
                No race information available for this plan
              </p>
              <p className="text-sm text-neutral-400 dark:text-neutral-500 mt-2">
                Add race details when creating a new training plan to connect with other runners
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
        <div className="bg-white dark:bg-neutral-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="w-6 h-6 text-primary-500" />
              <h2 className="text-xl font-bold text-neutral-900 dark:text-white">Race Training Partners</h2>
            </div>
            <button
              onClick={onClose}
              className="text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors p-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6">
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white dark:bg-neutral-900 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="p-6 border-b border-neutral-200 dark:border-neutral-700 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-primary-500" />
            <div>
              <h2 className="text-xl font-bold text-neutral-900 dark:text-white">Race Training Partners</h2>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {currentPlan.race_name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              aria-label="Privacy settings"
            >
              <Settings className="w-5 h-5 text-neutral-500 dark:text-neutral-400" />
            </button>
            <button
              onClick={onClose}
              className="text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors p-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          {showSettings && (
            <div className="mb-4 p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDiscoverable}
                  onChange={toggleDiscoverable}
                  className="w-5 h-5 rounded border-2 border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 checked:bg-primary-500 checked:border-primary-500 focus:ring-0 focus:ring-offset-0 cursor-pointer transition-all"
                />
                <div>
                  <span className="text-sm font-medium text-neutral-900 dark:text-white">
                    Make my training visible to others
                  </span>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    Let other runners see you're training for this race
                  </p>
                </div>
              </label>
            </div>
          )}

          {!isDiscoverable && (
            <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Your profile is private. Enable discoverability above to see and connect with other runners.
              </p>
            </div>
          )}

          {partners.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" />
              <p className="text-neutral-500 dark:text-neutral-400 mb-2">
                No other runners found for this race yet
              </p>
              <p className="text-sm text-neutral-400 dark:text-neutral-500">
                Be the first! Invite friends training for {currentPlan.race_name}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {partners.map((partner) => (
                <div
                  key={partner.user_id}
                  className="p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-primary-300 dark:hover:border-primary-700 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                      {partner.display_name?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-neutral-900 dark:text-white truncate">
                          {partner.display_name || 'Anonymous Runner'}
                        </h3>
                      </div>

                      {partner.bio && (
                        <p className="text-sm text-neutral-600 dark:text-neutral-300 mb-2 line-clamp-2">
                          {partner.bio}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-3 text-xs text-neutral-500 dark:text-neutral-400">
                        {partner.user_location && (
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            <span>{partner.user_location}</span>
                          </div>
                        )}
                        {partner.race_date && (
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>Race: {formatDate(partner.race_date)}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Target className="w-3.5 h-3.5" />
                          <span>Week {partner.current_week}</span>
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-neutral-600 dark:text-neutral-400">Training Progress</span>
                          <span className="font-semibold text-primary-600 dark:text-primary-400">
                            {partner.workouts_completed} workouts • {Math.min(100, Math.max(0, partner.training_progress_pct))}%
                          </span>
                        </div>
                        <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(0, partner.training_progress_pct))}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {partners.length > 0 && (
            <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
              <p className="text-xs text-neutral-500 dark:text-neutral-400 text-center">
                Connect with {partners.length} {partners.length === 1 ? 'runner' : 'runners'} training for {currentPlan.race_name}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
