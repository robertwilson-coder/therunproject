import { useState } from 'react';
import { Calculator, Save, X, Target } from 'lucide-react';
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

  const distances = {
    '5K': 5,
    '10K': 10,
    'Half Marathon': 21.0975,
    'Marathon': 42.195
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

    try {
      const totalSeconds = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);

      const { error } = await supabase.from('pace_calculations').insert({
        user_id: user.id,
        race_distance: raceDistance,
        race_time_seconds: totalSeconds,
        calculated_paces: calculatedPaces,
      });

      if (error) throw error;

      setSaveMessage('Pace calculation saved successfully!');
      setTimeout(() => {
        setSaveMessage(null);
        onClose();
      }, 2000);
    } catch (error) {
      setSaveMessage('Failed to save pace calculation');
      console.error('Error saving:', error);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 to-gray-800 bg-opacity-95 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-gray rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border-2 border-border-gray">
        <div className="p-6 border-b border-border-gray sticky top-0 bg-dark-gray">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <Calculator className="w-6 h-6 text-brand-blue" />
              Training Pace Calculator
            </h2>
            <button
              onClick={onClose}
              className="text-white hover:text-brand-pink transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <p className="text-gray-300 mb-4">
              Enter your recent race time to calculate your training paces. These paces are based on proven training principles and will help you train at the right intensity.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-blue mb-2">
              Race Distance
            </label>
            <select
              value={raceDistance}
              onChange={(e) => setRaceDistance(e.target.value)}
              className="w-full px-4 py-2 bg-mid-gray text-white border-2 border-border-gray rounded-lg focus:ring-0 focus:border-brand-blue focus:outline-none transition-all"
            >
              <option value="5K">5K</option>
              <option value="10K">10K</option>
              <option value="Half Marathon">Half Marathon</option>
              <option value="Marathon">Marathon</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-blue mb-2">
              Your Race Time
            </label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Hours</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  className="w-full px-4 py-2 bg-mid-gray text-white border-2 border-border-gray rounded-lg focus:ring-0 focus:border-brand-blue focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Minutes</label>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  className="w-full px-4 py-2 bg-mid-gray text-white border-2 border-border-gray rounded-lg focus:ring-0 focus:border-brand-blue focus:outline-none transition-all"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Seconds</label>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={seconds}
                  onChange={(e) => setSeconds(e.target.value)}
                  className="w-full px-4 py-2 bg-mid-gray text-white border-2 border-border-gray rounded-lg focus:ring-0 focus:border-brand-blue focus:outline-none transition-all"
                />
              </div>
            </div>
          </div>

          <button
            onClick={calculatePaces}
            className="w-full px-6 py-3 bg-brand-blue text-white font-bold rounded-lg hover:opacity-90 hover:scale-105 transition-all"
          >
            Calculate Training Paces
          </button>

          {calculatedPaces && (
            <div className="border-2 border-brand-blue rounded-lg p-6 bg-mid-gray">
              <h3 className="text-xl font-bold text-white mb-4">Your Training Paces</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-border-gray">
                  <div>
                    <span className="font-semibold text-white">Easy Run Pace</span>
                    <p className="text-xs text-gray-400">Daily training runs, recovery</p>
                  </div>
                  <span className="text-lg font-bold text-brand-blue">{calculatedPaces.easyPace}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border-gray">
                  <div>
                    <span className="font-semibold text-white">Long Run Pace</span>
                    <p className="text-xs text-gray-400">Weekly long runs</p>
                  </div>
                  <span className="text-lg font-bold text-brand-blue">{calculatedPaces.longRunPace}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border-gray">
                  <div>
                    <span className="font-semibold text-white">Tempo Pace</span>
                    <p className="text-xs text-gray-400">Threshold/tempo runs</p>
                  </div>
                  <span className="text-lg font-bold text-brand-blue">{calculatedPaces.tempoPace}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border-gray">
                  <div>
                    <span className="font-semibold text-white">Interval Pace</span>
                    <p className="text-xs text-gray-400">Speed work, intervals</p>
                  </div>
                  <span className="text-lg font-bold text-brand-blue">{calculatedPaces.intervalPace}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <div>
                    <span className="font-semibold text-white">Race Pace</span>
                    <p className="text-xs text-gray-400">Target race pace</p>
                  </div>
                  <span className="text-lg font-bold text-brand-blue">{calculatedPaces.racePace}</span>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-border-gray space-y-3">
                {onAddToPlan && (
                  <button
                    onClick={() => {
                      onAddToPlan(calculatedPaces);
                      onClose();
                    }}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-brand-blue text-white font-bold rounded-lg hover:opacity-90 hover:scale-105 transition-all"
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
                          : 'bg-red-900 bg-opacity-20 text-brand-pink'
                      }`}>
                        {saveMessage}
                      </div>
                    ) : (
                      <button
                        onClick={handleSave}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-brand-pink text-white font-bold rounded-lg hover:opacity-90 hover:scale-105 transition-all"
                      >
                        <Save className="w-5 h-5" />
                        Save Pace Calculation
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {!user && calculatedPaces && (
            <div className="bg-brand-blue bg-opacity-10 border border-brand-blue rounded-lg p-4 text-center">
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
