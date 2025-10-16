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
  });

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
              {['5K', '10K', 'Half Marathon', 'Marathon', 'Just for Fun'].map((distance) => {
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
            <label className="block text-sm font-medium text-brand-blue mb-2">
              Training Plan Length: {answers.planWeeks} weeks
            </label>
            <input
              type="range"
              value={answers.planWeeks || 12}
              onChange={(e) => setAnswers({ ...answers, planWeeks: Number(e.target.value) })}
              className="w-full h-2 bg-border-gray rounded-lg appearance-none cursor-pointer accent-brand-blue"
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
