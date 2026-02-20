import { useState, useEffect } from 'react';
import { logger } from '../utils/logger';
import { Bell, X, Save } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface ReminderSettingsProps {
  planId: string;
  onClose: () => void;
}

interface Reminder {
  id: string;
  reminder_type: string;
  reminder_time: string;
  is_active: boolean;
}

export function ReminderSettings({ planId, onClose }: ReminderSettingsProps) {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newReminderType, setNewReminderType] = useState<'daily' | 'weekly' | 'key_workouts'>('daily');
  const [newReminderTime, setNewReminderTime] = useState('08:00');

  useEffect(() => {
    loadReminders();
  }, [planId]);

  const loadReminders = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('workout_reminders')
        .select('*')
        .eq('training_plan_id', planId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReminders(data || []);
    } catch (error) {
      logger.error('Error loading reminders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddReminder = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('workout_reminders').insert({
        user_id: user.id,
        training_plan_id: planId,
        reminder_type: newReminderType,
        reminder_time: newReminderTime,
        is_active: true,
      });

      if (error) throw error;
      await loadReminders();
    } catch (error) {
      logger.error('Error adding reminder:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleReminder = async (reminderId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('workout_reminders')
        .update({ is_active: !currentStatus })
        .eq('id', reminderId);

      if (error) throw error;
      await loadReminders();
    } catch (error) {
      logger.error('Error toggling reminder:', error);
    }
  };

  const handleDeleteReminder = async (reminderId: string) => {
    try {
      const { error } = await supabase
        .from('workout_reminders')
        .delete()
        .eq('id', reminderId);

      if (error) throw error;
      await loadReminders();
    } catch (error) {
      logger.error('Error deleting reminder:', error);
    }
  };

  const getReminderTypeLabel = (type: string) => {
    switch (type) {
      case 'daily': return 'Daily';
      case 'weekly': return 'Weekly';
      case 'key_workouts': return 'Key Workouts Only';
      default: return type;
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 to-gray-800 bg-opacity-95 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 sticky top-0 bg-white/95 backdrop-blur-sm z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-russian-violet flex items-center gap-2">
              <Bell className="w-6 h-6" />
              Workout Reminders
            </h2>
            <button
              onClick={onClose}
              className="text-russian-violet hover:text-raspberry transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-russian-violet">
              Set up reminders to help you stay on track with your training plan. Reminders will be processed by our system to keep you motivated.
            </p>
          </div>

          <div className="border-2 border-sunset rounded-lg p-6 bg-gradient-to-br from-white to-orange-50">
            <h3 className="text-lg font-bold text-russian-violet mb-4">Add New Reminder</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-russian-violet mb-2">
                  Reminder Type
                </label>
                <select
                  value={newReminderType}
                  onChange={(e) => setNewReminderType(e.target.value as any)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sunset focus:border-transparent"
                >
                  <option value="daily">Daily - Every training day</option>
                  <option value="weekly">Weekly - Monday mornings</option>
                  <option value="key_workouts">Key Workouts - Important sessions only</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-russian-violet mb-2">
                  Reminder Time
                </label>
                <input
                  type="time"
                  value={newReminderTime}
                  onChange={(e) => setNewReminderTime(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sunset focus:border-transparent"
                />
              </div>

              <button
                onClick={handleAddReminder}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-bittersweet text-white font-bold rounded-lg hover:bg-raspberry transition-colors disabled:opacity-50"
              >
                <Save className="w-5 h-5" />
                {saving ? 'Adding...' : 'Add Reminder'}
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-bold text-russian-violet mb-4">Your Reminders</h3>
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-bittersweet mx-auto"></div>
              </div>
            ) : reminders.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <Bell className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-russian-violet text-opacity-60">No reminders set up yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {reminders.map((reminder) => (
                  <div
                    key={reminder.id}
                    className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-3 h-3 rounded-full ${
                            reminder.is_active ? 'bg-green-600' : 'bg-gray-400'
                          }`}
                        ></div>
                        <div>
                          <p className="font-semibold text-russian-violet">
                            {getReminderTypeLabel(reminder.reminder_type)}
                          </p>
                          <p className="text-sm text-russian-violet text-opacity-60">
                            {reminder.reminder_time} • {reminder.is_active ? 'Active' : 'Inactive'}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleReminder(reminder.id, reminder.is_active)}
                        className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                          reminder.is_active
                            ? 'bg-gray-100 text-russian-violet hover:bg-gray-200'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }`}
                      >
                        {reminder.is_active ? 'Pause' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDeleteReminder(reminder.id)}
                        className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-russian-violet">
              <span className="font-semibold">Note:</span> Reminders are processed by our backend system. They help you stay accountable to your training schedule.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
