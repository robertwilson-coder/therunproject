import { useState } from 'react';
import { RunnerAnswers } from '../lib/supabase';

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
  });
  const [hasRaceDate, setHasRaceDate] = useState(false);

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
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">
      <div className="bg-dark-gray border-2 border-border-gray rounded-xl p-6">

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-brand-blue mb-2">
              Experience Level
            </label>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {['Beginner', 'Intermediate', 'Advanced'].map((level) => {
                const isSelected = answers.experience === level.toLowerCase();
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setAnswers({ ...answers, experience: level.toLowerCase() })}
                    className={`px-1 sm:px-2 py-3 rounded-lg border-2 font-medium transition-all text-xs sm:text-sm hover:scale-105 ${
                      isSelected
                        ? 'bg-brand-blue border-brand-blue text-white'
                        : 'bg-mid-gray border-border-gray text-gray-300 hover:border-brand-blue'
                    }`}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-blue mb-2">
              Race Distance
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {['Couch to 5K', '5K', '10K', 'Half Marathon', 'Marathon', 'Just for Fun'].map((distance) => {
                const isSelected = answers.raceDistance === distance;
                return (
                  <button
                    key={distance}
                    type="button"
                    onClick={() => setAnswers({ ...answers, raceDistance: distance })}
                    className={`px-4 py-3 rounded-lg border-2 font-medium transition-all hover:scale-105 ${
                      isSelected
                        ? 'bg-brand-blue border-brand-blue text-white'
                        : 'bg-mid-gray border-border-gray text-gray-300 hover:border-brand-blue'
                    }`}
                  >
                    {distance}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-3 mb-4 cursor-pointer group">
              <input
                type="checkbox"
                checked={hasRaceDate}
                onChange={(e) => {
                  setHasRaceDate(e.target.checked);
                  if (!e.target.checked) {
                    setAnswers({ ...answers, raceDate: undefined });
                  }
                }}
                className="w-5 h-5 rounded border-2 border-border-gray bg-mid-gray checked:bg-brand-blue checked:border-brand-blue focus:ring-0 focus:ring-offset-0 cursor-pointer transition-all"
              />
              <span className="text-sm font-medium text-brand-blue group-hover:text-blue-400 transition-colors">
                I have a specific race date
              </span>
            </label>

            {hasRaceDate && (
              <div className="ml-8 mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Race Date
                </label>
                <input
                  type="date"
                  value={answers.raceDate || ''}
                  min={new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                  onChange={(e) => setAnswers({ ...answers, raceDate: e.target.value })}
                  className="w-full px-4 py-2 bg-mid-gray text-white border-2 border-border-gray rounded-lg focus:ring-0 focus:border-brand-blue focus:outline-none transition-all"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Plan will automatically calculate weeks needed with a 2-week taper
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-blue mb-2">
              Training Plan Length: {answers.planWeeks} weeks
              {hasRaceDate && <span className="text-gray-400 text-xs ml-2">(calculated from race date)</span>}
            </label>
            <input
              type="range"
              value={answers.planWeeks || 12}
              onChange={(e) => setAnswers({ ...answers, planWeeks: Number(e.target.value) })}
              disabled={hasRaceDate}
              className={`w-full h-2 bg-border-gray rounded-lg appearance-none cursor-pointer accent-brand-blue ${hasRaceDate ? 'opacity-50 cursor-not-allowed' : ''}`}
              min="4"
              max="20"
              step="1"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>4 weeks</span>
              <span>20 weeks</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-blue mb-2">
              Longest Run in Last Month: {answers.longestRun === 0 ? '0 km' : answers.longestRun >= 35 ? 'More than 35 km' : `${answers.longestRun} km`}
            </label>
            <input
              type="range"
              value={answers.longestRun || 0}
              onChange={(e) => setAnswers({ ...answers, longestRun: Number(e.target.value) })}
              className="w-full h-2 bg-border-gray rounded-lg appearance-none cursor-pointer accent-brand-blue"
              min="0"
              max="35"
              step="1"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0 km</span>
              <span>More than 35 km</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-blue mb-2">
              Current Weekly Distance: {answers.currentWeeklyKm === 0 ? '0 km' : answers.currentWeeklyKm >= 100 ? 'More than 100 km' : `${answers.currentWeeklyKm} km`}
            </label>
            <input
              type="range"
              value={answers.currentWeeklyKm || 0}
              onChange={(e) => setAnswers({ ...answers, currentWeeklyKm: Number(e.target.value) })}
              className="w-full h-2 bg-border-gray rounded-lg appearance-none cursor-pointer accent-brand-blue"
              min="0"
              max="100"
              step="5"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0 km</span>
              <span>More than 100 km</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-blue mb-2">
              Recent Race Performance (Optional)
            </label>
            <p className="text-sm text-gray-400 mb-3">
              Enter a recent race time to get personalized training paces for your workouts.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Race Distance</label>
                <select
                  value={answers.recentRaceDistance || ''}
                  onChange={(e) => setAnswers({ ...answers, recentRaceDistance: e.target.value })}
                  className="w-full px-4 py-2 bg-mid-gray text-white border-2 border-border-gray rounded-lg focus:ring-0 focus:border-brand-blue focus:outline-none transition-all"
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
                <label className="text-xs text-gray-400 block mb-1">Race Time</label>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Hours</label>
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={answers.recentRaceHours || 0}
                      onChange={(e) => setAnswers({ ...answers, recentRaceHours: Number(e.target.value) })}
                      className="w-full px-4 py-2 bg-mid-gray text-white border-2 border-border-gray rounded-lg focus:ring-0 focus:border-brand-blue focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Minutes</label>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={answers.recentRaceMinutes || 0}
                      onChange={(e) => setAnswers({ ...answers, recentRaceMinutes: Number(e.target.value) })}
                      className="w-full px-4 py-2 bg-mid-gray text-white border-2 border-border-gray rounded-lg focus:ring-0 focus:border-brand-blue focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Seconds</label>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={answers.recentRaceSeconds || 0}
                      onChange={(e) => setAnswers({ ...answers, recentRaceSeconds: Number(e.target.value) })}
                      className="w-full px-4 py-2 bg-mid-gray text-white border-2 border-border-gray rounded-lg focus:ring-0 focus:border-brand-blue focus:outline-none transition-all"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-blue mb-2">
              Days Available for Training
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {daysOfWeek.map((day) => {
                const isSelected = answers.availableDays?.includes(day) || false;
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`px-4 py-3 rounded-lg border-2 font-medium transition-all hover:scale-105 ${
                      isSelected
                        ? 'bg-brand-blue border-brand-blue text-white'
                        : 'bg-mid-gray border-border-gray text-gray-300 hover:border-brand-blue'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            {answers.availableDays && answers.availableDays.length > 0 && (
              <p className="text-sm text-gray-400 mt-2">
                {answers.availableDays.length} day{answers.availableDays.length !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-blue mb-2">
              Current Injuries or Concerns (optional)
            </label>
            <textarea
              value={answers.injuries}
              onChange={(e) => setAnswers({ ...answers, injuries: e.target.value })}
              className="w-full px-4 py-2 bg-mid-gray text-white border-2 border-border-gray rounded-lg focus:ring-0 focus:border-brand-blue focus:outline-none transition-all"
              rows={3}
              placeholder="Any injuries or physical concerns we should know about?"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full mt-6 px-6 py-3 border-2 border-brand-pink text-brand-pink font-bold rounded-lg hover:bg-brand-pink hover:text-white hover:scale-105 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isLoading ? 'Generating Your Plan...' : 'Generate Training Plan'}
        </button>
      </div>
    </form>
  );
}
