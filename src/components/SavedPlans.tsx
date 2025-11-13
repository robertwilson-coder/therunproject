import { useEffect, useState } from 'react';
import { supabase, TrainingPlan } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Calendar, Zap, Trash2, Eye } from 'lucide-react';

interface SavedPlansProps {
  onLoadPlan: (plan: TrainingPlan) => void;
  onClose: () => void;
}

export function SavedPlans({ onLoadPlan, onClose }: SavedPlansProps) {
  const { user } = useAuth();
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPlans();
  }, [user]);

  const loadPlans = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('training_plans')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPlans(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plans');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (planId: string) => {
    if (!confirm('Are you sure you want to delete this plan?')) return;

    try {
      const { error } = await supabase
        .from('training_plans')
        .delete()
        .eq('id', planId);

      if (error) throw error;
      setPlans(plans.filter(p => p.id !== planId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete plan');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white border-2 border-gray-200 rounded-xl max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="p-6 border-b-2 border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Your Saved Training Plans</h2>
            <button
              onClick={onClose}
              className="text-gray-600 hover:text-brand-pink text-2xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-blue mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading your plans...</p>
            </div>
          )}

          {error && (
            <div className="bg-brand-pink bg-opacity-20 border-2 border-brand-pink text-brand-pink px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {!loading && !error && plans.length === 0 && (
            <div className="text-center py-12">
              <Calendar className="w-16 h-16 text-brand-blue mx-auto mb-4" />
              <p className="text-gray-900 text-lg">No saved plans yet</p>
              <p className="text-gray-600 text-sm mt-2">Create a training plan and click "Save Plan" to save it here</p>
            </div>
          )}

          {!loading && !error && plans.length > 0 && (
            <div className="space-y-4">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className="bg-gray-50 border-2 border-gray-200 rounded-lg p-5 hover:border-brand-blue transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {plan.plan_type === 'static' && (
                          <Calendar className="w-5 h-5 text-brand-blue flex-shrink-0" />
                        )}
                        <h3 className="text-lg font-bold text-gray-900">
                          {plan.plan_type === 'static' ? 'Static' : 'Responsive'} Training Plan
                        </h3>
                      </div>
                      <div className="space-y-1 text-sm text-gray-700">
                        <p>
                          <span className="font-medium">Distance:</span> {plan.answers.raceDistance || 'N/A'}
                        </p>
                        <p>
                          <span className="font-medium">Experience:</span> {plan.answers.experience || 'N/A'}
                        </p>
                        <p>
                          <span className="font-medium">Weeks:</span> {plan.plan_data.plan.length}
                        </p>
                        <p className="text-gray-500 text-xs mt-2">
                          Created: {formatDate(plan.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => onLoadPlan(plan)}
                        className="flex items-center gap-2 px-4 py-2 bg-brand-blue text-white font-medium rounded-lg hover:bg-blue-600 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        View
                      </button>
                      <button
                        onClick={() => handleDelete(plan.id)}
                        className="flex items-center gap-2 px-3 py-2 bg-brand-pink bg-opacity-20 text-brand-pink font-medium rounded-lg hover:bg-opacity-30 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
