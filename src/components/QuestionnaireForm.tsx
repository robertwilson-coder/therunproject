import { useState } from 'react';
import { RunnerAnswers } from '../lib/supabase';
import { X, Clock, Zap, Trophy, Calendar, MapPin, Heart, Target, TrendingUp } from 'lucide-react';

interface QuestionnaireFormProps {
  onSubmit: (answers: RunnerAnswers) => void;
  isLoading: boolean;
}

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function QuestionnaireForm({ onSubmit, isLoading }: QuestionnaireFormProps) {
  const [answers, setAnswers] = useState<RunnerAnswers>({
    experience: '',
    raceDistance: '',
    planWeeks: 12,
    longestRun: 0,
    currentWeeklyKm: 0,
    availableDays: [],
    injuries: '',
    recentRaceDistance: '',
    recentRaceHours: 0,
    recentRaceMinutes: 0,
    recentRaceSeconds: 0,
    includeCalibrationRun: false,
  });
  const [hasRaceDate, setHasRaceDate] = useState(false);
  const [hasCustomStartDate, setHasCustomStartDate] = useState(false);
  const [showUltraDistanceModal, setShowUltraDistanceModal] = useState(false);
  const [tempUltraDistance, setTempUltraDistance] = useState<number>(50);

  const toggleDay = (day: string) => {
    const currentDays = answers.availableDays || [];
    if (currentDays.includes(day)) {
      setAnswers({ ...answers, availableDays: currentDays.filter(d => d !== day) });
    } else {
      setAnswers({ ...answers, availableDays: [...currentDays, day] });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(answers);
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
      <div className="bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl p-6 md:p-8 text-white shadow-xl">
        <div className="flex items-center gap-4 mb-2">
          <div className="p-3 bg-white/20 rounded-lg backdrop-blur-sm">
            <Trophy className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-bold">Build Your Training Plan</h2>
            <p className="text-primary-100 mt-1">Let's create a personalized plan to reach your goals</p>
          </div>
        </div>
      </div>

      <div className="card-premium p-6 md:p-8">
        <div className="space-y-8">
          <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl p-5 border border-neutral-200 dark:border-neutral-700">
            <div className="flex items-center gap-2 mb-4">
              <Target className="w-5 h-5 text-primary-500" />
              <label className="text-base font-semibold text-neutral-900 dark:text-white">
                Race Distance
              </label>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {['5K', '10K', 'Half Marathon', 'Marathon', 'Ultra'].map((distance) => {
                const isSelected = answers.raceDistance === distance;
                return (
                  <button
                    key={distance}
                    type="button"
                    onClick={() => {
                      if (distance === 'Ultra') {
                        setTempUltraDistance(answers.ultraDistanceKm || 50);
                        setShowUltraDistanceModal(true);
                      } else {
                        setAnswers({ ...answers, raceDistance: distance, ultraDistanceKm: undefined });
                      }
                    }}
                    className={`px-4 py-3 rounded-lg border-2 font-semibold transition-all hover:scale-105 hover:shadow-lg ${
                      isSelected
                        ? 'bg-primary-500 border-primary-500 text-white shadow-lg shadow-primary-500/30'
                        : 'bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 hover:border-primary-500'
                    }`}
                  >
                    {distance}
                    {distance === 'Ultra' && answers.ultraDistanceKm && (
                      <span className="block text-xs mt-1 opacity-80">
                        {answers.ultraDistanceKm} km
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl p-5 border border-neutral-200 dark:border-neutral-700">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-primary-500" />
              <label className="text-base font-semibold text-neutral-900 dark:text-white">
                Training Schedule
              </label>
            </div>
            <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer group py-2">
              <input
                type="checkbox"
                checked={hasCustomStartDate}
                onChange={(e) => {
                  setHasCustomStartDate(e.target.checked);
                  if (!e.target.checked) {
                    setAnswers({ ...answers, customStartDate: undefined });
                  }
                }}
                className="w-5 h-5 rounded border-2 border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 checked:bg-primary-500 checked:border-primary-500 focus:ring-0 focus:ring-offset-0 cursor-pointer transition-all"
              />
              <span className="text-sm font-medium text-neutral-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                I want to start on a specific date
              </span>
            </label>

            {hasCustomStartDate && (
              <div className="ml-8">
                <label className="block text-sm font-medium text-neutral-900 dark:text-white mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={answers.customStartDate || ''}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setAnswers({ ...answers, customStartDate: e.target.value })}
                  className="w-full px-4 py-2 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white border-2 border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-0 focus:border-primary-500 focus:outline-none transition-all"
                />
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  Your plan will start on this date (defaults to tomorrow if not set)
                </p>
              </div>
            )}

            <label className="flex items-center gap-3 cursor-pointer group py-2">
              <input
                type="checkbox"
                checked={hasRaceDate}
                onChange={(e) => {
                  setHasRaceDate(e.target.checked);
                  if (!e.target.checked) {
                    setAnswers({ ...answers, raceDate: undefined });
                  }
                }}
                className="w-5 h-5 rounded border-2 border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 checked:bg-primary-500 checked:border-primary-500 focus:ring-0 focus:ring-offset-0 cursor-pointer transition-all"
              />
              <span className="text-sm font-medium text-neutral-900 dark:text-white group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">
                I have a specific race date
              </span>
            </label>

            {hasRaceDate && (
              <div className="ml-8 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-900 dark:text-white mb-2">
                    Race Date
                  </label>
                  <input
                    type="date"
                    value={answers.raceDate || ''}
                    min={new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                    onChange={(e) => setAnswers({ ...answers, raceDate: e.target.value })}
                    className="w-full px-4 py-2 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white border-2 border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-0 focus:border-primary-500 focus:outline-none transition-all"
                  />
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                    Plan will automatically calculate weeks needed with a 2-week taper
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-900 dark:text-white mb-2">
                    Race Name
                  </label>
                  <input
                    type="text"
                    value={answers.raceName || ''}
                    onChange={(e) => setAnswers({ ...answers, raceName: e.target.value })}
                    placeholder="e.g., London Marathon 2026, Boston Marathon"
                    className="w-full px-4 py-2 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white border-2 border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-0 focus:border-primary-500 focus:outline-none transition-all placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
                  />
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                    Connect with others training for the same race
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-900 dark:text-white mb-2">
                    Race Location
                  </label>
                  <input
                    type="text"
                    value={answers.raceLocation || ''}
                    onChange={(e) => setAnswers({ ...answers, raceLocation: e.target.value })}
                    placeholder="e.g., London, UK or Boston, MA"
                    className="w-full px-4 py-2 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white border-2 border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-0 focus:border-primary-500 focus:outline-none transition-all placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
                  />
                </div>
              </div>
            )}
            </div>
          </div>

          <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl p-5 border border-neutral-200 dark:border-neutral-700">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-primary-500" />
              <div className="flex-1">
                <span className="text-base font-semibold text-neutral-900 dark:text-white">
                  Training Plan Length: {answers.planWeeks} weeks
                </span>
                {hasRaceDate && <span className="text-neutral-500 dark:text-neutral-400 text-xs ml-2">(calculated from race date)</span>}
              </div>
            </div>
            <input
              type="range"
              value={answers.planWeeks || 12}
              onChange={(e) => setAnswers({ ...answers, planWeeks: Number(e.target.value) })}
              disabled={hasRaceDate}
              className={`w-full h-2 bg-neutral-300 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-primary-500 ${hasRaceDate ? 'opacity-20 cursor-not-allowed grayscale' : ''}`}
              min="4"
              max="20"
              step="1"
            />
            <div className={`flex justify-between text-xs mt-2 ${hasRaceDate ? 'text-neutral-400 dark:text-neutral-600' : 'text-neutral-400'}`}>
              <span>4 weeks</span>
              <span>20 weeks</span>
            </div>
          </div>

          <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl p-5 border border-neutral-200 dark:border-neutral-700">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-primary-500" />
              <span className="text-base font-semibold text-neutral-900 dark:text-white">
                Longest Run in Last Month: {answers.longestRun === 0 ? '0 km' : (answers.longestRun || 0) >= 35 ? 'More than 35 km' : `${answers.longestRun || 0} km`}
              </span>
            </div>
            <input
              type="range"
              value={answers.longestRun || 0}
              onChange={(e) => setAnswers({ ...answers, longestRun: Number(e.target.value) })}
              className="w-full h-2 bg-neutral-300 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
              min="0"
              max="35"
              step="1"
            />
            <div className="flex justify-between text-xs text-neutral-400 mt-2">
              <span>0 km</span>
              <span>More than 35 km</span>
            </div>
          </div>

          <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl p-5 border border-neutral-200 dark:border-neutral-700">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-5 h-5 text-primary-500" />
              <span className="text-base font-semibold text-neutral-900 dark:text-white">
                Current Weekly Distance: {answers.currentWeeklyKm === 0 ? '0 km' : (answers.currentWeeklyKm || 0) >= 100 ? 'More than 100 km' : `${answers.currentWeeklyKm || 0} km`}
              </span>
            </div>
            <input
              type="range"
              value={answers.currentWeeklyKm || 0}
              onChange={(e) => setAnswers({ ...answers, currentWeeklyKm: Number(e.target.value) })}
              className="w-full h-2 bg-neutral-300 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
              min="0"
              max="100"
              step="5"
            />
            <div className="flex justify-between text-xs text-neutral-400 mt-2">
              <span>0 km</span>
              <span>More than 100 km</span>
            </div>
          </div>

          <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl p-5 border border-neutral-200 dark:border-neutral-700">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-5 h-5 text-primary-500" />
              <span className="text-base font-semibold text-neutral-900 dark:text-white">
                Recent Race Performance
              </span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">(Optional)</span>
            </div>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              Enter a recent race time to get personalized training paces for your workouts.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-neutral-400 block mb-1">Race Distance</label>
                <select
                  value={answers.recentRaceDistance || ''}
                  onChange={(e) => setAnswers({ ...answers, recentRaceDistance: e.target.value })}
                  className="w-full px-4 py-2 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white border-2 border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-0 focus:border-primary-500 focus:outline-none transition-all"
                >
                  <option value="">Skip this</option>
                  <option value="5K">5K</option>
                  <option value="10K">10K</option>
                  <option value="Half Marathon">Half Marathon</option>
                  <option value="Marathon">Marathon</option>
                </select>
              </div>
            </div>
            {answers.recentRaceDistance && (
              <div>
                <label className="text-xs text-neutral-400 block mb-1">Race Time</label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-neutral-400 block mb-1">Hours</label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={answers.recentRaceHours || 0}
                      onChange={(e) => setAnswers({ ...answers, recentRaceHours: Number(e.target.value) })}
                      className="w-full px-4 py-2 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white border-2 border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-0 focus:border-primary-500 focus:outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 block mb-1">Minutes</label>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={answers.recentRaceMinutes || 0}
                      onChange={(e) => setAnswers({ ...answers, recentRaceMinutes: Number(e.target.value) })}
                      className="w-full px-4 py-2 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white border-2 border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-0 focus:border-primary-500 focus:outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 block mb-1">Seconds</label>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={answers.recentRaceSeconds || 0}
                      onChange={(e) => setAnswers({ ...answers, recentRaceSeconds: Number(e.target.value) })}
                      className="w-full px-4 py-2 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white border-2 border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-0 focus:border-primary-500 focus:outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-gradient-to-br from-primary-50 to-accent-50 dark:from-primary-900/20 dark:to-accent-900/20 rounded-xl p-5 border-2 border-primary-200 dark:border-primary-700">
            <div className="flex items-start gap-4">
              <input
                type="checkbox"
                id="includeCalibration"
                checked={answers.includeCalibrationRun || false}
                onChange={(e) => setAnswers({ ...answers, includeCalibrationRun: e.target.checked })}
                className="mt-1 w-5 h-5 rounded border-2 border-primary-400 text-primary-600 focus:ring-2 focus:ring-primary-500 focus:ring-offset-0 cursor-pointer"
              />
              <div className="flex-1">
                <label htmlFor="includeCalibration" className="text-base font-semibold text-neutral-900 dark:text-white cursor-pointer flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary-500" />
                  Include Calibration Test (Recommended)
                </label>
                <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-2">
                  Add a calibration workout in Week 1 to assess your current fitness level. This helps us fine-tune your training paces and provide more personalized recommendations throughout your plan.
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
                  The calibration test will replace your Week 1 quality session with a structured effort test.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl p-5 border border-neutral-200 dark:border-neutral-700">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-primary-500" />
              <span className="text-base font-semibold text-neutral-900 dark:text-white">
                Days Available for Training
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {daysOfWeek.map((day) => {
                const isSelected = answers.availableDays?.includes(day) || false;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`px-4 py-3 rounded-lg border-2 font-semibold transition-all hover:scale-105 hover:shadow-lg ${
                      isSelected
                        ? 'bg-primary-500 border-primary-500 text-white shadow-lg shadow-primary-500/30'
                        : 'bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 hover:border-primary-500'
                    }`}
                  >
                    {day.slice(0, 3)}
                  </button>
                );
              })}
            </div>
            {answers.availableDays && answers.availableDays.length > 0 && (
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">
                {answers.availableDays.length} day{answers.availableDays.length !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>

          <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl p-5 border border-neutral-200 dark:border-neutral-700">
            <div className="flex items-center gap-2 mb-2">
              <Heart className="w-5 h-5 text-primary-500" />
              <span className="text-base font-semibold text-neutral-900 dark:text-white">
                Current Injuries or Concerns
              </span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">(Optional)</span>
            </div>
            <textarea
              value={answers.injuries}
              onChange={(e) => setAnswers({ ...answers, injuries: e.target.value })}
              className="w-full px-4 py-3 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white border-2 border-neutral-300 dark:border-neutral-700 rounded-lg focus:ring-0 focus:border-primary-500 focus:outline-none transition-all placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
              rows={3}
              placeholder="Any injuries or physical concerns we should know about?"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full mt-6 px-8 py-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white text-lg font-bold rounded-xl hover:scale-105 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shadow-xl shadow-primary-500/30 hover:shadow-2xl hover:shadow-primary-500/40"
        >
          <span className="flex items-center justify-center gap-2">
            <Zap className="w-5 h-5" />
            {isLoading ? 'Generating Your Plan...' : 'Generate Training Plan'}
          </span>
        </button>
      </div>

      {showUltraDistanceModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 border-2 border-primary-500/30 rounded-xl max-w-md w-full p-6 animate-scale-in shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white">Ultra Distance</h3>
              <button
                onClick={() => setShowUltraDistanceModal(false)}
                className="text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Close ultra distance selector"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-neutral-300 text-sm">
                Specify the distance of your ultra race in kilometers. Common distances include 50K, 80K, 100K, 161K, or any custom distance.
              </p>

              <div>
                <label className="block text-sm font-medium text-neutral-900 dark:text-white mb-2">
                  Distance: {tempUltraDistance} km
                </label>
                <input
                  type="range"
                  value={tempUltraDistance}
                  onChange={(e) => setTempUltraDistance(Number(e.target.value))}
                  className="w-full h-2 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-primary-500"
                  min="50"
                  max="200"
                  step="5"
                />
                <div className="flex justify-between text-xs text-neutral-400 mt-1">
                  <span>50 km</span>
                  <span>100 km</span>
                  <span>150 km</span>
                  <span>200 km</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTempUltraDistance(50)}
                  className={`px-3 py-2 text-sm rounded-lg border-2 transition-all ${
                    tempUltraDistance === 50
                      ? 'bg-primary-500 border-primary-500 text-white'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-primary-500'
                  }`}
                >
                  50K
                </button>
                <button
                  type="button"
                  onClick={() => setTempUltraDistance(80)}
                  className={`px-3 py-2 text-sm rounded-lg border-2 transition-all ${
                    tempUltraDistance === 80
                      ? 'bg-primary-500 border-primary-500 text-white'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-primary-500'
                  }`}
                >
                  80K
                </button>
                <button
                  type="button"
                  onClick={() => setTempUltraDistance(100)}
                  className={`px-3 py-2 text-sm rounded-lg border-2 transition-all ${
                    tempUltraDistance === 100
                      ? 'bg-primary-500 border-primary-500 text-white'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-primary-500'
                  }`}
                >
                  100K
                </button>
                <button
                  type="button"
                  onClick={() => setTempUltraDistance(161)}
                  className={`px-3 py-2 text-sm rounded-lg border-2 transition-all ${
                    tempUltraDistance === 161
                      ? 'bg-primary-500 border-primary-500 text-white'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-primary-500'
                  }`}
                >
                  161K
                </button>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowUltraDistanceModal(false)}
                  className="flex-1 px-4 py-2 border-2 border-neutral-700 text-neutral-300 rounded-lg hover:border-neutral-600 hover:bg-neutral-800 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAnswers({ ...answers, raceDistance: 'Ultra', ultraDistanceKm: tempUltraDistance });
                    setShowUltraDistanceModal(false);
                  }}
                  className="flex-1 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-all font-semibold"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white dark:bg-neutral-900 border-2 border-primary-500/30 rounded-xl max-w-md w-full p-8 animate-scale-in shadow-2xl">
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div className="relative w-20 h-20">
                  <Zap className="w-16 h-16 text-primary-500 animate-pulse absolute inset-0 m-auto" />
                  <div className="absolute inset-0">
                    <div className="w-20 h-20 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin aspect-square"></div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
                  Creating Your Training Plan
                </h3>
                <p className="text-neutral-600 dark:text-neutral-300 text-base mb-4">
                  Please do not leave this page or close your browser
                </p>
              </div>

              <div className="bg-neutral-200 dark:bg-neutral-800/50 border border-neutral-300 dark:border-neutral-700 rounded-lg p-4">
                <div className="flex items-center justify-center gap-2 text-neutral-700 dark:text-neutral-400 text-sm">
                  <Clock className="w-4 h-4" />
                  <span>This may take up to 2 minutes</span>
                </div>
              </div>

              <div className="space-y-2 text-left">
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Our AI is analyzing your fitness level and creating a personalized training plan tailored to your goals...
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
