import { useState, useEffect } from 'react';
import { logger } from '../utils/logger';
import { Calculator, Save, X, Target, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface PaceCalculatorProps {
  onClose: () => void;
  onAddToPlan?: (paces: CalculatedPaces) => void;
}

interface CalculatedPaces {
  easyPace: string;
  longRunPace: string;
  tempoPace: string;
  intervalPace: string;
  racePace: string;
}

export function PaceCalculator({ onClose, onAddToPlan }: PaceCalculatorProps) {
  const { user } = useAuth();
  const [raceDistance, setRaceDistance] = useState<string>('5K');
  const [hours, setHours] = useState<string>('0');
  const [minutes, setMinutes] = useState<string>('25');
  const [seconds, setSeconds] = useState<string>('0');
  const [calculatedPaces, setCalculatedPaces] = useState<CalculatedPaces | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSavedPaces();
  }, []);

  const distances = {
    '5K': 5,
    '10K': 10,
    'Half Marathon': 21.0975,
    'Marathon': 42.195,
    '50K': 50,
    '100K': 100
  };

  const loadSavedPaces = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_training_paces')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setRaceDistance(data.race_distance);
        const totalSeconds = data.race_time_seconds;
        const hrs = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = totalSeconds % 60;
        setHours(hrs.toString());
        setMinutes(mins.toString());
        setSeconds(secs.toString());

        setCalculatedPaces({
          easyPace: data.easy_pace,
          longRunPace: data.long_run_pace,
          tempoPace: data.tempo_pace,
          intervalPace: data.interval_pace,
          racePace: data.race_pace,
        });
      }
    } catch (error) {
      logger.error('Error loading paces:', error);
    }
  };

  const formatPace = (secondsPerKm: number): string => {
    const mins = Math.floor(secondsPerKm / 60);
    const secs = Math.round(secondsPerKm % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}/km`;
  };

  const calculatePaces = () => {
    const totalSeconds = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
    const distanceKm = distances[raceDistance as keyof typeof distances];
    const raceSecondsPerKm = totalSeconds / distanceKm;

    // Jack Daniels VDOT-based pace calculations (simplified)
    const paces: CalculatedPaces = {
      racePace: formatPace(raceSecondsPerKm),
      easyPace: formatPace(raceSecondsPerKm * 1.25), // 20-25% slower than race pace
      longRunPace: formatPace(raceSecondsPerKm * 1.20), // 15-20% slower than race pace
      tempoPace: formatPace(raceSecondsPerKm * 1.08), // 8-12% slower than race pace
      intervalPace: formatPace(raceSecondsPerKm * 0.95), // 3-5% faster than race pace
    };

    setCalculatedPaces(paces);
  };

  const handleSave = async () => {
    if (!user || !calculatedPaces) return;

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const totalSeconds = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);

      const { error } = await supabase
        .from('user_training_paces')
        .upsert({
          user_id: user.id,
          race_distance: raceDistance,
          race_time_seconds: totalSeconds,
          easy_pace: calculatedPaces.easyPace,
          long_run_pace: calculatedPaces.longRunPace,
          tempo_pace: calculatedPaces.tempoPace,
          interval_pace: calculatedPaces.intervalPace,
          race_pace: calculatedPaces.racePace,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      window.dispatchEvent(new CustomEvent('trainingPacesUpdated'));

      setSaveMessage('Training paces saved successfully!');
      setTimeout(() => {
        setSaveMessage(null);
        onClose();
      }, 1500);
    } catch (error) {
      setSaveMessage('Failed to save training paces');
      logger.error('Error saving:', error);
      setTimeout(() => setSaveMessage(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 to-gray-800 bg-opacity-95 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col border-2 border-neutral-700">
        <div className="p-6 border-b border-neutral-700 bg-neutral-900 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Calculator className="w-6 h-6 text-primary-500" />
              Training Pace Calculator
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
          <div>
            <p className="text-gray-300 mb-4">
              Enter your recent race time to calculate your training paces. These paces are based on proven training principles and will help you train at the right intensity.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Race Distance
            </label>
            <div className="relative">
              <select
                value={raceDistance}
                onChange={(e) => setRaceDistance(e.target.value)}
                className="w-full px-4 py-2 bg-neutral-800 text-white border-2 border-neutral-700 rounded-lg focus:ring-0 focus:border-primary-500 focus:outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="5K">5K</option>
                <option value="10K">10K</option>
                <option value="Half Marathon">Half Marathon</option>
                <option value="Marathon">Marathon</option>
                <option value="50K">50K (Ultra)</option>
                <option value="100K">100K (Ultra)</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Your Race Time
            </label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-300 block mb-1">Hours</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  className="w-full px-4 py-2 bg-neutral-800 text-white border-2 border-neutral-700 rounded-lg focus:ring-0 focus:border-primary-500 focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-xs text-gray-300 block mb-1">Minutes</label>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  className="w-full px-4 py-2 bg-neutral-800 text-white border-2 border-neutral-700 rounded-lg focus:ring-0 focus:border-primary-500 focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-xs text-gray-300 block mb-1">Seconds</label>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={seconds}
                  onChange={(e) => setSeconds(e.target.value)}
                  className="w-full px-4 py-2 bg-neutral-800 text-white border-2 border-neutral-700 rounded-lg focus:ring-0 focus:border-primary-500 focus:outline-none transition-all"
                />
              </div>
            </div>
          </div>

          <button
            onClick={calculatePaces}
            className="w-full px-6 py-3 bg-primary-500 text-white font-bold rounded-lg hover:bg-primary-600 transition-all"
          >
            Calculate Training Paces
          </button>

          {calculatedPaces && (
            <div className="border-2 border-primary-500 rounded-lg p-6 bg-neutral-800">
              <h3 className="text-xl font-bold text-white mb-4">Your Training Paces</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-3 px-4 rounded-lg bg-neutral-700">
                  <div>
                    <span className="font-semibold text-white block">Easy Run Pace</span>
                    <p className="text-xs text-gray-300">Daily training runs, recovery</p>
                  </div>
                  <span className="font-bold text-white">{calculatedPaces.easyPace}</span>
                </div>
                <div className="flex justify-between items-center py-3 px-4 rounded-lg bg-neutral-700">
                  <div>
                    <span className="font-semibold text-white block">Long Run Pace</span>
                    <p className="text-xs text-gray-300">Weekly long runs</p>
                  </div>
                  <span className="font-bold text-white">{calculatedPaces.longRunPace}</span>
                </div>
                <div className="flex justify-between items-center py-3 px-4 rounded-lg bg-neutral-700">
                  <div>
                    <span className="font-semibold text-white block">Tempo Pace</span>
                    <p className="text-xs text-gray-300">Threshold/tempo runs</p>
                  </div>
                  <span className="font-bold text-white">{calculatedPaces.tempoPace}</span>
                </div>
                <div className="flex justify-between items-center py-3 px-4 rounded-lg bg-neutral-700">
                  <div>
                    <span className="font-semibold text-white block">Interval Pace</span>
                    <p className="text-xs text-gray-300">Speed work, intervals</p>
                  </div>
                  <span className="font-bold text-white">{calculatedPaces.intervalPace}</span>
                </div>
                <div className="flex justify-between items-center py-3 px-4 rounded-lg bg-neutral-700">
                  <div>
                    <span className="font-semibold text-white block">Race Pace</span>
                    <p className="text-xs text-gray-300">Target race pace</p>
                  </div>
                  <span className="font-bold text-white">{calculatedPaces.racePace}</span>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-neutral-700 space-y-3">
                {onAddToPlan && (
                  <button
                    onClick={() => {
                      onAddToPlan(calculatedPaces);
                      onClose();
                    }}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary-500 text-white font-bold rounded-lg hover:bg-primary-600 transition-all"
                  >
                    <Target className="w-5 h-5" />
                    Add Paces to Plan
                  </button>
                )}
                {user && (
                  <>
                    {saveMessage ? (
                      <div className={`px-4 py-2 rounded-lg text-center font-medium ${
                        saveMessage.includes('success')
                          ? 'bg-green-900 bg-opacity-20 text-green-400'
                          : 'bg-red-900 bg-opacity-20 text-red-400'
                      }`}>
                        {saveMessage}
                      </div>
                    ) : (
                      <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Save className="w-5 h-5" />
                        {isSaving ? 'Saving...' : 'Save Training Paces'}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {!user && calculatedPaces && (
            <div className="bg-primary-500 bg-opacity-10 border border-primary-500 rounded-lg p-4 text-center">
              <p className="text-sm text-white">
                Create an account to save your pace calculations and access them anytime.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
