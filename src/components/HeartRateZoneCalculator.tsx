import { useState, useEffect } from 'react';
import { logger } from '../utils/logger';
import { X, Heart, Save, Activity } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface HeartRateZoneCalculatorProps {
  onClose: () => void;
}

interface HeartRateZones {
  max_hr: number;
  rest_hr: number;
  zone1_min: number;
  zone1_max: number;
  zone2_min: number;
  zone2_max: number;
  zone3_min: number;
  zone3_max: number;
  zone4_min: number;
  zone4_max: number;
  zone5_min: number;
  zone5_max: number;
}

export function HeartRateZoneCalculator({ onClose }: HeartRateZoneCalculatorProps) {
  const { user } = useAuth();
  const [age, setAge] = useState('');
  const [restingHR, setRestingHR] = useState('');
  const [maxHR, setMaxHR] = useState('');
  const [useCalculated, setUseCalculated] = useState(true);
  const [zones, setZones] = useState<HeartRateZones | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSavedZones();
  }, []);

  const loadSavedZones = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('heart_rate_zones')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setMaxHR(data.max_hr.toString());
        setRestingHR(data.rest_hr.toString());
        setZones(data);
      }
    } catch (error) {
      logger.error('Error loading zones:', error);
    }
  };

  const calculateZones = () => {
    const ageNum = parseInt(age);
    const restingNum = parseInt(restingHR);
    let maxNum = parseInt(maxHR);

    if (!maxNum && ageNum) {
      maxNum = 220 - ageNum;
      setMaxHR(maxNum.toString());
    }

    if (!maxNum || !restingNum) return;

    const hrReserve = maxNum - restingNum;

    const calculatedZones: HeartRateZones = {
      max_hr: maxNum,
      rest_hr: restingNum,
      zone1_min: Math.round(restingNum + hrReserve * 0.50),
      zone1_max: Math.round(restingNum + hrReserve * 0.60),
      zone2_min: Math.round(restingNum + hrReserve * 0.60),
      zone2_max: Math.round(restingNum + hrReserve * 0.70),
      zone3_min: Math.round(restingNum + hrReserve * 0.70),
      zone3_max: Math.round(restingNum + hrReserve * 0.80),
      zone4_min: Math.round(restingNum + hrReserve * 0.80),
      zone4_max: Math.round(restingNum + hrReserve * 0.90),
      zone5_min: Math.round(restingNum + hrReserve * 0.90),
      zone5_max: maxNum,
    };

    setZones(calculatedZones);
  };

  const handleSave = async () => {
    if (!user || !zones) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const { error } = await supabase
        .from('heart_rate_zones')
        .upsert({
          user_id: user.id,
          ...zones,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      window.dispatchEvent(new CustomEvent('hrZonesUpdated'));

      setSaveMessage('Zones saved successfully!');
      setTimeout(() => {
        setSaveMessage(null);
        onClose();
      }, 1500);
    } catch (error) {
      logger.error('Error saving zones:', error);
      setSaveMessage('Failed to save zones');
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const zoneInfo = [
    {
      name: 'Zone 1',
      description: 'Recovery',
      color: 'bg-neutral-700 border-gray-400 text-gray-300',
      detail: 'Very light activity, active recovery',
    },
    {
      name: 'Zone 2',
      description: 'Aerobic Base',
      color: 'bg-neutral-700 border-blue-400 text-blue-400',
      detail: 'Easy runs, builds endurance',
    },
    {
      name: 'Zone 3',
      description: 'Tempo',
      color: 'bg-neutral-700 border-green-400 text-green-400',
      detail: 'Comfortably hard, aerobic threshold',
    },
    {
      name: 'Zone 4',
      description: 'Lactate Threshold',
      color: 'bg-neutral-700 border-orange-400 text-orange-400',
      detail: 'Hard effort, improves speed endurance',
    },
    {
      name: 'Zone 5',
      description: 'VO2 Max',
      color: 'bg-neutral-700 border-red-400 text-red-400',
      detail: 'Maximum effort, intervals',
    },
  ];

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 to-gray-800 bg-opacity-95 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col border-2 border-neutral-700 shadow-2xl">
        <div className="p-6 border-b border-neutral-700 bg-neutral-900 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Heart className="w-6 h-6 text-red-500" />
              Heart Rate Zone Calculator
            </h2>
            <button
              onClick={onClose}
              className="text-white hover:text-red-400 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          <div className="bg-primary-500 bg-opacity-10 border border-primary-500 rounded-lg p-4">
            <p className="text-sm text-white">
              <span className="font-semibold">Training with heart rate zones</span> helps you optimize
              your workouts by ensuring you're training at the right intensity for your goals.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Age (years)
              </label>
              <input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="e.g., 30"
                className="w-full px-4 py-2 bg-neutral-800 text-white border-2 border-neutral-700 rounded-lg focus:ring-0 focus:border-primary-500 focus:outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Resting Heart Rate (bpm)
              </label>
              <input
                type="number"
                value={restingHR}
                onChange={(e) => setRestingHR(e.target.value)}
                placeholder="e.g., 60"
                className="w-full px-4 py-2 bg-neutral-800 text-white border-2 border-neutral-700 rounded-lg focus:ring-0 focus:border-primary-500 focus:outline-none transition-all"
              />
              <p className="text-xs text-gray-300 mt-1">Measure first thing in the morning</p>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-white mb-2">
                Maximum Heart Rate (bpm)
              </label>
              <input
                type="number"
                value={maxHR}
                onChange={(e) => {
                  setMaxHR(e.target.value);
                  setUseCalculated(false);
                }}
                placeholder="Leave empty to calculate (220 - age)"
                className="w-full px-4 py-2 bg-neutral-800 text-white border-2 border-neutral-700 rounded-lg focus:ring-0 focus:border-primary-500 focus:outline-none transition-all"
              />
              <p className="text-xs text-gray-300 mt-1">
                Enter your actual max HR if known, or leave empty to use formula (220 - age)
              </p>
            </div>
          </div>

          <button
            onClick={calculateZones}
            disabled={!restingHR || (!maxHR && !age)}
            className="w-full px-6 py-3 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Activity className="w-5 h-5" />
            Calculate Training Zones
          </button>

          {zones && (
            <div className="space-y-4">
              <div className="border-2 border-primary-500 rounded-lg p-6 bg-neutral-800">
                <h3 className="text-xl font-bold text-white mb-4">Your Heart Rate Zones</h3>
                <div className="space-y-3">
                  {zoneInfo.map((zone, index) => {
                    const zoneNum = (index + 1) as 1 | 2 | 3 | 4 | 5;
                    const minKey = `zone${zoneNum}_min` as keyof HeartRateZones;
                    const maxKey = `zone${zoneNum}_max` as keyof HeartRateZones;
                    const min = zones[minKey];
                    const max = zones[maxKey];

                    return (
                      <div
                        key={zone.name}
                        className={`rounded-lg p-4 border-2 ${zone.color}`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-bold">{zone.name}: {zone.description}</h4>
                            <p className="text-sm mt-1">{zone.detail}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">{min}-{max} <span className="text-xs font-normal">bpm</span></p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 pt-4 border-t border-neutral-700">
                  <p className="text-sm text-gray-300">
                    <span className="font-semibold text-white">Max HR:</span> {zones.max_hr} bpm &nbsp;|&nbsp;
                    <span className="font-semibold text-white">Resting HR:</span> {zones.rest_hr} bpm &nbsp;|&nbsp;
                    <span className="font-semibold text-white">HR Reserve:</span> {zones.max_hr - zones.rest_hr} bpm
                  </p>
                </div>
              </div>

              {saveMessage && (
                <div className={`px-4 py-2 rounded-lg text-center font-medium ${
                  saveMessage.includes('success')
                    ? 'bg-green-900 bg-opacity-20 text-green-400'
                    : 'bg-red-900 bg-opacity-20 text-red-400'
                }`}>
                  {saveMessage}
                </div>
              )}

              {user && (
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-5 h-5" />
                  {isSaving ? 'Saving...' : 'Save Zones'}
                </button>
              )}

              {!user && (
                <div className="bg-primary-500 bg-opacity-10 border border-primary-500 rounded-lg p-4 text-center">
                  <p className="text-sm text-white">
                    Create an account to save your heart rate zones and access them anytime.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
