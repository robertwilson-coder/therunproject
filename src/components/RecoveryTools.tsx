import { useState, useEffect } from 'react';
import { logger } from '../utils/logger';
import {
  X,
  Moon,
  Heart,
  AlertTriangle,
  Plus,
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus,
  Check,
  Edit2,
  Trash2
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface RecoveryToolsProps {
  onClose: () => void;
}

interface SleepLog {
  id: string;
  log_date: string;
  hours: number;
  quality: number;
  wake_feeling: 'well-rested' | 'normal' | 'fatigued';
  notes?: string;
}

interface HeartRateLog {
  id: string;
  log_date: string;
  heart_rate: number;
  time_measured?: string;
  notes?: string;
}

interface InjuryLog {
  id: string;
  log_date: string;
  body_area: string;
  severity_int: number;
  pain_type: string;
  status: 'active' | 'recovering' | 'resolved';
  notes?: string;
  resolved_date?: string;
}

export function RecoveryTools({ onClose }: RecoveryToolsProps) {
  const [activeTab, setActiveTab] = useState<'sleep' | 'hr' | 'injuries' | 'dashboard'>('dashboard');
  const [loading, setLoading] = useState(false);

  const [sleepLogs, setSleepLogs] = useState<SleepLog[]>([]);
  const [hrLogs, setHrLogs] = useState<HeartRateLog[]>([]);
  const [injuryLogs, setInjuryLogs] = useState<InjuryLog[]>([]);

  const [sleepForm, setSleepForm] = useState({
    date: new Date().toISOString().split('T')[0],
    hours: 8,
    quality: 3,
    wake_feeling: 'normal' as const,
    notes: ''
  });

  const [hrForm, setHrForm] = useState({
    date: new Date().toISOString().split('T')[0],
    heart_rate: 60,
    notes: ''
  });

  const [injuryForm, setInjuryForm] = useState<{
    date: string;
    body_area: string;
    severity: number;
    pain_type: string;
    status: 'active' | 'recovering' | 'resolved';
    notes: string;
  }>({
    date: new Date().toISOString().split('T')[0],
    body_area: '',
    severity: 5,
    pain_type: 'aching',
    status: 'active',
    notes: ''
  });

  const [editingInjuryId, setEditingInjuryId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [sleepData, hrData, injuryData] = await Promise.all([
        supabase
          .from('sleep_logs')
          .select('*')
          .eq('user_id', user.id)
          .order('log_date', { ascending: false })
          .limit(30),
        supabase
          .from('resting_heart_rate_logs')
          .select('*')
          .eq('user_id', user.id)
          .order('log_date', { ascending: false })
          .limit(30),
        supabase
          .from('injury_logs')
          .select('*')
          .eq('user_id', user.id)
          .order('log_date', { ascending: false })
      ]);

      if (sleepData.data) setSleepLogs(sleepData.data);
      if (hrData.data) setHrLogs(hrData.data);
      if (injuryData.data) setInjuryLogs(injuryData.data);
    } catch (error) {
      logger.error('Error loading recovery data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSleepSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('sleep_logs')
        .upsert({
          user_id: user.id,
          log_date: sleepForm.date,
          hours: sleepForm.hours,
          quality: sleepForm.quality,
          wake_feeling: sleepForm.wake_feeling,
          notes: sleepForm.notes
        }, {
          onConflict: 'user_id,log_date'
        });

      if (error) throw error;

      await loadData();
      setSleepForm({
        date: new Date().toISOString().split('T')[0],
        hours: 8,
        quality: 3,
        wake_feeling: 'normal',
        notes: ''
      });
      setActiveTab('dashboard');
    } catch (error) {
      logger.error('Error saving sleep log:', error);
      alert('Failed to save sleep log');
    } finally {
      setLoading(false);
    }
  };

  const handleHRSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('resting_heart_rate_logs')
        .upsert({
          user_id: user.id,
          log_date: hrForm.date,
          heart_rate: hrForm.heart_rate,
          notes: hrForm.notes
        }, {
          onConflict: 'user_id,log_date'
        });

      if (error) throw error;

      await loadData();
      setHrForm({
        date: new Date().toISOString().split('T')[0],
        heart_rate: 60,
        notes: ''
      });
      setActiveTab('dashboard');
    } catch (error) {
      logger.error('Error saving heart rate log:', error);
      alert('Failed to save heart rate log');
    } finally {
      setLoading(false);
    }
  };

  const handleInjurySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!injuryForm.body_area.trim()) {
      alert('Please specify the body area');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (editingInjuryId) {
        const { error } = await supabase
          .from('injury_logs')
          .update({
            log_date: injuryForm.date,
            body_area: injuryForm.body_area,
            severity_int: injuryForm.severity,
            pain_type: injuryForm.pain_type,
            status: injuryForm.status,
            notes: injuryForm.notes,
            resolved_date: injuryForm.status === 'resolved' ? new Date().toISOString().split('T')[0] : null
          })
          .eq('id', editingInjuryId);

        if (error) throw error;
        setEditingInjuryId(null);
      } else {
        const { error } = await supabase
          .from('injury_logs')
          .insert({
            user_id: user.id,
            log_date: injuryForm.date,
            body_area: injuryForm.body_area,
            severity_int: injuryForm.severity,
            pain_type: injuryForm.pain_type,
            status: injuryForm.status,
            notes: injuryForm.notes
          });

        if (error) throw error;
      }

      await loadData();
      setInjuryForm({
        date: new Date().toISOString().split('T')[0],
        body_area: '',
        severity: 5,
        pain_type: 'aching',
        status: 'active',
        notes: ''
      });
      setActiveTab('dashboard');
    } catch (error) {
      logger.error('Error saving injury log:', error);
      alert('Failed to save injury log');
    } finally {
      setLoading(false);
    }
  };

  const handleEditInjury = (injury: InjuryLog) => {
    setInjuryForm({
      date: injury.log_date,
      body_area: injury.body_area,
      severity: injury.severity_int,
      pain_type: injury.pain_type,
      status: injury.status,
      notes: injury.notes || ''
    });
    setEditingInjuryId(injury.id);
    setActiveTab('injuries');
  };

  const handleDeleteInjury = async (id: string) => {
    if (!confirm('Are you sure you want to delete this injury log?')) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('injury_logs')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadData();
    } catch (error) {
      logger.error('Error deleting injury log:', error);
      alert('Failed to delete injury log');
    } finally {
      setLoading(false);
    }
  };

  const calculateRecoveryScore = () => {
    const recentSleep = sleepLogs.slice(0, 7);
    const recentHR = hrLogs.slice(0, 7);
    const activeInjuries = injuryLogs.filter(i => i.status === 'active' || i.status === 'recovering');

    let score = 100;

    if (recentSleep.length > 0) {
      const avgSleepHours = recentSleep.reduce((sum, log) => sum + log.hours, 0) / recentSleep.length;
      const avgQuality = recentSleep.reduce((sum, log) => sum + log.quality, 0) / recentSleep.length;

      if (avgSleepHours < 7) score -= 15;
      if (avgQuality < 3) score -= 10;
    }

    if (recentHR.length > 1) {
      const avgHR = recentHR.reduce((sum, log) => sum + log.heart_rate, 0) / recentHR.length;
      const latestHR = recentHR[0].heart_rate;

      if (latestHR > avgHR + 5) score -= 15;
      if (latestHR > avgHR + 10) score -= 10;
    }

    activeInjuries.forEach(injury => {
      if (injury.severity_int >= 7) score -= 20;
      else if (injury.severity_int >= 4) score -= 10;
      else score -= 5;
    });

    return Math.max(0, Math.min(100, score));
  };

  const getRecoveryScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50 border-green-200';
    if (score >= 60) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getRecoveryScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Poor';
  };

  const renderDashboard = () => {
    const recoveryScore = calculateRecoveryScore();
    const recentSleep = sleepLogs.slice(0, 7);
    const recentHR = hrLogs.slice(0, 7);
    const activeInjuries = injuryLogs.filter(i => i.status === 'active' || i.status === 'recovering');

    const avgSleepHours = recentSleep.length > 0
      ? (recentSleep.reduce((sum, log) => sum + log.hours, 0) / recentSleep.length).toFixed(1)
      : 'N/A';

    const avgHR = recentHR.length > 0
      ? Math.round(recentHR.reduce((sum, log) => sum + log.heart_rate, 0) / recentHR.length)
      : 'N/A';

    const hrTrend = recentHR.length > 1
      ? recentHR[0].heart_rate - recentHR[recentHR.length - 1].heart_rate
      : 0;

    return (
      <div className="space-y-6">
        <div className={`p-6 rounded-xl border-2 ${getRecoveryScoreColor(recoveryScore)}`}>
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-wide mb-2">Recovery Score</p>
            <p className="text-5xl font-bold mb-2">{recoveryScore}</p>
            <p className="text-lg font-semibold">{getRecoveryScoreLabel(recoveryScore)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-blue-50 dark:bg-gray-700 border-2 border-blue-200 dark:border-gray-600 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Moon className="w-5 h-5 text-blue-600" />
                <p className="font-semibold text-gray-900 dark:text-white">Sleep (7-day avg)</p>
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{avgSleepHours}</p>
            <p className="text-sm text-gray-600 dark:text-gray-300">hours per night</p>
          </div>

          <div className="p-4 bg-red-50 dark:bg-gray-700 border-2 border-red-200 dark:border-gray-600 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-red-600" />
                <p className="font-semibold text-gray-900 dark:text-white">Resting HR (7-day avg)</p>
              </div>
              {hrTrend !== 0 && (
                <div className={`flex items-center gap-1 ${hrTrend > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {hrTrend > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  <span className="text-sm font-semibold">{Math.abs(hrTrend)}</span>
                </div>
              )}
            </div>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{avgHR}</p>
            <p className="text-sm text-gray-600 dark:text-gray-300">beats per minute</p>
          </div>
        </div>

        {activeInjuries.length > 0 && (
          <div className="p-4 bg-orange-50 dark:bg-gray-700 border-2 border-orange-200 dark:border-gray-600 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              <p className="font-semibold text-gray-900 dark:text-white">Active Injuries ({activeInjuries.length})</p>
            </div>
            <div className="space-y-2">
              {activeInjuries.map((injury) => (
                <div key={injury.id} className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{injury.body_area}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {injury.pain_type} • Severity: {injury.severity_int}/10
                    </p>
                  </div>
                  <button
                    onClick={() => handleEditInjury(injury)}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-blue-50 dark:bg-gray-700 border-2 border-blue-200 dark:border-gray-600 rounded-lg p-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            <strong>Recovery Tips:</strong> {recoveryScore >= 80
              ? 'Your recovery is excellent! Keep up the good work with consistent sleep and monitoring.'
              : recoveryScore >= 60
              ? 'Your recovery is good, but there\'s room for improvement. Focus on sleep quality and monitor heart rate trends.'
              : 'Your recovery needs attention. Prioritize rest, address any injuries, and ensure adequate sleep.'}
          </p>
        </div>
      </div>
    );
  };

  const renderSleepTab = () => (
    <div className="space-y-6">
      <form onSubmit={handleSleepSubmit} className="space-y-4 p-3 sm:p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <h3 className="font-semibold text-gray-900 dark:text-white">Log Sleep</h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
          <input
            type="date"
            value={sleepForm.date}
            onChange={(e) => setSleepForm({ ...sleepForm, date: e.target.value })}
            max={new Date().toISOString().split('T')[0]}
            className="w-full p-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Hours Slept: {sleepForm.hours}
          </label>
          <input
            type="range"
            min="0"
            max="12"
            step="0.5"
            value={sleepForm.hours}
            onChange={(e) => setSleepForm({ ...sleepForm, hours: parseFloat(e.target.value) })}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Sleep Quality: {sleepForm.quality}/5
          </label>
          <input
            type="range"
            min="1"
            max="5"
            value={sleepForm.quality}
            onChange={(e) => setSleepForm({ ...sleepForm, quality: parseInt(e.target.value) })}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Wake Feeling</label>
          <select
            value={sleepForm.wake_feeling}
            onChange={(e) => setSleepForm({ ...sleepForm, wake_feeling: e.target.value as any })}
            className="w-full p-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="well-rested">Well Rested</option>
            <option value="normal">Normal</option>
            <option value="fatigued">Fatigued</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (optional)</label>
          <textarea
            value={sleepForm.notes}
            onChange={(e) => setSleepForm({ ...sleepForm, notes: e.target.value })}
            className="w-full p-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            rows={2}
            placeholder="Any notes about your sleep..."
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary-500 text-white py-2 px-4 rounded-lg hover:bg-primary-600 disabled:opacity-50 font-semibold"
        >
          {loading ? 'Saving...' : 'Save Sleep Log'}
        </button>
      </form>

      <div className="space-y-3">
        <h3 className="font-semibold text-gray-900 dark:text-white">Recent Sleep Logs</h3>
        {sleepLogs.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400 text-sm">No sleep logs yet</p>
        ) : (
          sleepLogs.map((log) => (
            <div key={log.id} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <p className="font-medium text-gray-900 dark:text-white">
                  {new Date(log.log_date).toLocaleDateString()}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-300">{log.hours} hours</p>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-300">
                <span>Quality: {log.quality}/5</span>
                <span className="capitalize">{log.wake_feeling.replace('-', ' ')}</span>
              </div>
              {log.notes && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{log.notes}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderHRTab = () => (
    <div className="space-y-6">
      <form onSubmit={handleHRSubmit} className="space-y-4 p-3 sm:p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <h3 className="font-semibold text-gray-900 dark:text-white">Log Resting Heart Rate</h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
          <input
            type="date"
            value={hrForm.date}
            onChange={(e) => setHrForm({ ...hrForm, date: e.target.value })}
            max={new Date().toISOString().split('T')[0]}
            className="w-full p-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Heart Rate: {hrForm.heart_rate} bpm
          </label>
          <input
            type="number"
            min="30"
            max="250"
            value={hrForm.heart_rate}
            onChange={(e) => setHrForm({ ...hrForm, heart_rate: parseInt(e.target.value) })}
            className="w-full p-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (optional)</label>
          <textarea
            value={hrForm.notes}
            onChange={(e) => setHrForm({ ...hrForm, notes: e.target.value })}
            className="w-full p-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            rows={2}
            placeholder="Any notes about your measurement..."
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary-500 text-white py-2 px-4 rounded-lg hover:bg-primary-600 disabled:opacity-50 font-semibold"
        >
          {loading ? 'Saving...' : 'Save Heart Rate'}
        </button>
      </form>

      <div className="space-y-3">
        <h3 className="font-semibold text-gray-900 dark:text-white">Recent Heart Rate Logs</h3>
        {hrLogs.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400 text-sm">No heart rate logs yet</p>
        ) : (
          hrLogs.map((log) => (
            <div key={log.id} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <p className="font-medium text-gray-900 dark:text-white">
                  {new Date(log.log_date).toLocaleDateString()}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-300">{log.heart_rate} bpm</p>
              </div>
              {log.time_measured && (
                <p className="text-sm text-gray-600 dark:text-gray-300">Time: {log.time_measured}</p>
              )}
              {log.notes && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{log.notes}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderInjuriesTab = () => (
    <div className="space-y-6">
      <form onSubmit={handleInjurySubmit} className="space-y-4 p-3 sm:p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          {editingInjuryId ? 'Update Injury' : 'Log Injury'}
        </h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
          <input
            type="date"
            value={injuryForm.date}
            onChange={(e) => setInjuryForm({ ...injuryForm, date: e.target.value })}
            max={new Date().toISOString().split('T')[0]}
            className="w-full p-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Body Area</label>
          <input
            type="text"
            value={injuryForm.body_area}
            onChange={(e) => setInjuryForm({ ...injuryForm, body_area: e.target.value })}
            placeholder="e.g., Right knee, Left ankle, Lower back"
            className="w-full p-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Pain Severity: {injuryForm.severity}/10
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={injuryForm.severity}
            onChange={(e) => setInjuryForm({ ...injuryForm, severity: parseInt(e.target.value) })}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pain Type</label>
          <select
            value={injuryForm.pain_type}
            onChange={(e) => setInjuryForm({ ...injuryForm, pain_type: e.target.value })}
            className="w-full p-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="aching">Aching</option>
            <option value="sharp">Sharp</option>
            <option value="dull">Dull</option>
            <option value="burning">Burning</option>
            <option value="stabbing">Stabbing</option>
            <option value="throbbing">Throbbing</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
          <select
            value={injuryForm.status}
            onChange={(e) => setInjuryForm({ ...injuryForm, status: e.target.value as any })}
            className="w-full p-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="active">Active</option>
            <option value="recovering">Recovering</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes (optional)</label>
          <textarea
            value={injuryForm.notes}
            onChange={(e) => setInjuryForm({ ...injuryForm, notes: e.target.value })}
            className="w-full p-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            rows={2}
            placeholder="Any additional details..."
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-primary-500 text-white py-2 px-4 rounded-lg hover:bg-primary-600 disabled:opacity-50 font-semibold"
          >
            {loading ? 'Saving...' : editingInjuryId ? 'Update Injury' : 'Save Injury'}
          </button>
          {editingInjuryId && (
            <button
              type="button"
              onClick={() => {
                setEditingInjuryId(null);
                setInjuryForm({
                  date: new Date().toISOString().split('T')[0],
                  body_area: '',
                  severity: 5,
                  pain_type: 'aching',
                  status: 'active',
                  notes: ''
                });
              }}
              className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="space-y-3">
        <h3 className="font-semibold text-gray-900 dark:text-white">Injury History</h3>
        {injuryLogs.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400 text-sm">No injury logs yet</p>
        ) : (
          injuryLogs.map((log) => (
            <div key={log.id} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-gray-900 dark:text-white">{log.body_area}</p>
                    <span className={`text-xs px-2 py-1 rounded ${
                      log.status === 'resolved'
                        ? 'bg-green-100 text-green-700'
                        : log.status === 'recovering'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {log.status}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    <p>Date: {new Date(log.log_date).toLocaleDateString()}</p>
                    <p>Severity: {log.severity_int}/10 • {log.pain_type}</p>
                    {log.notes && <p className="mt-1">{log.notes}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEditInjury(log)}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteInjury(log.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-3xl w-full overflow-y-auto" style={{ maxHeight: '80dvh' }}>
        <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Recovery Tools</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
            Track your recovery metrics to optimize training. Monitor sleep quality, resting heart rate trends, and manage injuries to stay healthy and perform your best.
          </p>

          <div className="flex gap-2 mt-4 flex-wrap">
            {[
              { key: 'dashboard' as const, label: 'Dashboard', icon: TrendingUp },
              { key: 'sleep' as const, label: 'Sleep', icon: Moon },
              { key: 'hr' as const, label: 'Heart Rate', icon: Heart },
              { key: 'injuries' as const, label: 'Injuries', icon: AlertTriangle },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === key
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 sm:p-6 pb-24 sm:pb-32">
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'sleep' && renderSleepTab()}
          {activeTab === 'hr' && renderHRTab()}
          {activeTab === 'injuries' && renderInjuriesTab()}
        </div>
      </div>
    </div>
  );
}
