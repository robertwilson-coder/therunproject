import { useState } from 'react';
import type { RunnerAnswers, AmbitionTier } from '../types';
import { Zap, Calendar, Heart, TrendingUp, ArrowLeft, Activity, Check } from 'lucide-react';
import type { ReadinessTier } from '../utils/distanceFeasibilityEngine';

interface QuestionnairePartBProps {
  partAAnswers: Partial<RunnerAnswers>;
  onSubmit: (answers: RunnerAnswers) => void;
  onBack: () => void;
  isLoading: boolean;
  tier: ReadinessTier;
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface AmbitionOption {
  value: AmbitionTier;
  label: string;
  description: string;
  bg: string;
  selectedBg: string;
  border: string;
  selectedBorder: string;
  checkColor: string;
  dot: string;
}

const AMBITION_OPTIONS: AmbitionOption[] = [
  {
    value: 'base',
    label: 'Base',
    description: 'Build aerobic durability at a sustainable pace. Ideal for first-timers or those prioritising consistency.',
    bg: 'bg-emerald-50/60 dark:bg-emerald-900/10',
    selectedBg: 'bg-emerald-50 dark:bg-emerald-900/30',
    border: 'border-emerald-200 dark:border-emerald-800',
    selectedBorder: 'border-emerald-400 dark:border-emerald-500',
    checkColor: 'text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  {
    value: 'performance',
    label: 'Performance',
    description: 'Higher weekly volume and a more challenging long run build. For runners who want to race well.',
    bg: 'bg-emerald-50/40 dark:bg-amber-900/10',
    selectedBg: 'bg-amber-50/60 dark:bg-amber-900/20',
    border: 'border-amber-200 dark:border-amber-800',
    selectedBorder: 'border-amber-400 dark:border-amber-500',
    checkColor: 'text-amber-600 dark:text-amber-400',
    dot: 'bg-gradient-to-r from-emerald-500 to-amber-500',
  },
  {
    value: 'competitive',
    label: 'Competitive',
    description: 'Maximum progressive overload within safe limits. For experienced runners targeting a personal best.',
    bg: 'bg-amber-50/40 dark:bg-amber-900/10',
    selectedBg: 'bg-amber-50 dark:bg-amber-900/25',
    border: 'border-amber-300 dark:border-amber-700',
    selectedBorder: 'border-amber-500 dark:border-amber-400',
    checkColor: 'text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
];

export function QuestionnairePartB({ partAAnswers, onSubmit, onBack, isLoading, tier }: QuestionnairePartBProps) {
  const isGreen = tier === 'green';
  const [selectedAmbition, setSelectedAmbition] = useState<AmbitionTier>('base');
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [longRunDay, setLongRunDay] = useState<string>('');
  const [recentRaceDistance, setRecentRaceDistance] = useState<string>('');
  const [recentRaceHours, setRecentRaceHours] = useState<number>(0);
  const [recentRaceMinutes, setRecentRaceMinutes] = useState<number>(0);
  const [recentRaceSeconds, setRecentRaceSeconds] = useState<number>(0);
  const [calibrationChoice, setCalibrationChoice] = useState<'race_result' | 'calibration_test' | 'skip'>('skip');
  const [injuries, setInjuries] = useState<string>('');
  const [raceName, setRaceName] = useState<string>(partAAnswers.raceName || '');
  const [raceLocation, setRaceLocation] = useState<string>(partAAnswers.raceLocation || '');

  const toggleDay = (day: string) => {
    setAvailableDays(prev => {
      const newDays = prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day];
      if (longRunDay && !newDays.includes(longRunDay)) {
        setLongRunDay('');
      }
      return newDays;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const combined: RunnerAnswers = {
      ...(partAAnswers as RunnerAnswers),
      ...(isGreen ? { ambitionTier: selectedAmbition } : {}),
      availableDays,
      daysPerWeek: availableDays.length,
      longRunDay,
      injuries,
      recentRaceDistance: recentRaceDistance || undefined,
      recentRaceHours,
      recentRaceMinutes,
      recentRaceSeconds,
      calibrationChoice,
      includeCalibrationRun: calibrationChoice === 'calibration_test',
      raceName: raceName || undefined,
      raceLocation: raceLocation || undefined,
    };
    onSubmit(combined);
  };

  const MIN_TRAINING_DAYS = 2;
  const isValid = availableDays.length >= MIN_TRAINING_DAYS && longRunDay !== '';

  const getCalibrationProtocol = (): string => {
    const dist = partAAnswers.raceDistance || '';
    if (dist === 'Marathon') {
      return '10–15 min easy warm up · 20 min controlled hard effort (RPE 7.5–8) · 10 min cool down';
    }
    if (dist === 'Half Marathon') {
      return '10–15 min easy warm up · 30 min progressive run (RPE 5 rising to 7) · 10 min cool down';
    }
    return '10–15 min easy warm up · 15 min steady hard effort (RPE 8) · 10 min cool down';
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-5">
      <div className="text-center mb-6">
        <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 dark:text-white mb-2">
          Refine your plan
        </h2>
        <p className="text-neutral-500 dark:text-neutral-400">
          A few more details to personalise your training.
        </p>
      </div>

      {isGreen && (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-soft">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-5 h-5 text-primary-500" />
            <span className="font-semibold text-neutral-900 dark:text-white">How hard do you want to train?</span>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
            Your timeline gives you room to choose your approach.
          </p>
          <div className="space-y-2">
            {AMBITION_OPTIONS.map((option) => {
              const isSelected = selectedAmbition === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedAmbition(option.value)}
                  className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                    isSelected
                      ? `${option.selectedBg} ${option.selectedBorder}`
                      : `${option.bg} ${option.border} hover:border-opacity-70`
                  }`}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                      isSelected
                        ? `${option.selectedBorder} bg-white dark:bg-neutral-900`
                        : 'border-neutral-300 dark:border-neutral-600'
                    }`}>
                      {isSelected && (
                        <Check className={`w-3 h-3 ${option.checkColor}`} strokeWidth={3} />
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${option.dot} flex-shrink-0`} />
                      <span className="font-semibold text-neutral-900 dark:text-white text-sm">
                        {option.label}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
                      {option.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-neutral-900 rounded-2xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-soft">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-primary-500" />
          <span className="font-semibold text-neutral-900 dark:text-white">Days Available for Training</span>
        </div>
        <div className="grid grid-cols-4 gap-2 mb-2">
          {DAYS_OF_WEEK.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              className={`py-2.5 px-1 rounded-xl border-2 text-sm font-semibold transition-all ${
                availableDays.includes(day)
                  ? 'bg-primary-500 border-primary-500 text-white shadow-md'
                  : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:border-primary-400'
              }`}
            >
              {day.slice(0, 3)}
            </button>
          ))}
        </div>
        <div className="mt-2">
          {availableDays.length < MIN_TRAINING_DAYS ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Please select at least {MIN_TRAINING_DAYS} running days per week to generate a plan.
            </p>
          ) : (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {availableDays.length} day{availableDays.length !== 1 ? 's' : ''} selected
            </p>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-2xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-soft">
        <div className="flex items-center gap-2 mb-1">
          <Calendar className="w-5 h-5 text-primary-500" />
          <span className="font-semibold text-neutral-900 dark:text-white">Preferred Long Run Day</span>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
          Which day do you prefer for your longest run of the week?
        </p>
        {availableDays.length === 0 ? (
          <p className="text-sm text-amber-600 dark:text-amber-400 py-2">
            Select your training days above first
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {availableDays
              .sort((a, b) => DAYS_OF_WEEK.indexOf(a) - DAYS_OF_WEEK.indexOf(b))
              .map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setLongRunDay(day)}
                  className={`py-2.5 px-1 rounded-xl border-2 text-sm font-semibold transition-all ${
                    longRunDay === day
                      ? 'bg-primary-500 border-primary-500 text-white shadow-md'
                      : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:border-primary-400'
                  }`}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
          </div>
        )}
        {availableDays.length > 0 && !longRunDay && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
            Please select a day for your long run
          </p>
        )}
      </div>

      {partAAnswers.raceDate && (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-soft">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-5 h-5 text-primary-500" />
            <span className="font-semibold text-neutral-900 dark:text-white">Race Details</span>
            <span className="text-xs text-neutral-400">(Optional)</span>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Race Name</label>
              <input
                type="text"
                value={raceName}
                onChange={(e) => setRaceName(e.target.value)}
                placeholder="e.g., London Marathon 2026"
                className="w-full px-4 py-2.5 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white border-2 border-neutral-200 dark:border-neutral-700 rounded-xl focus:ring-0 focus:border-primary-500 focus:outline-none transition-all placeholder:text-neutral-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">Race Location</label>
              <input
                type="text"
                value={raceLocation}
                onChange={(e) => setRaceLocation(e.target.value)}
                placeholder="e.g., London, UK"
                className="w-full px-4 py-2.5 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white border-2 border-neutral-200 dark:border-neutral-700 rounded-xl focus:ring-0 focus:border-primary-500 focus:outline-none transition-all placeholder:text-neutral-400"
              />
            </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-neutral-900 rounded-2xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-soft">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="w-5 h-5 text-primary-500" />
          <span className="font-semibold text-neutral-900 dark:text-white">Recent Race Performance</span>
          <span className="text-xs text-neutral-400">(Optional)</span>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
          Enter a recent race time to get personalised training paces.
        </p>
        <select
          value={recentRaceDistance}
          onChange={(e) => setRecentRaceDistance(e.target.value)}
          className="w-full px-4 py-2.5 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white border-2 border-neutral-200 dark:border-neutral-700 rounded-xl focus:ring-0 focus:border-primary-500 focus:outline-none transition-all mb-3"
        >
          <option value="">Skip this</option>
          <option value="5K">5K</option>
          <option value="10K">10K</option>
          <option value="Half Marathon">Half Marathon</option>
          <option value="Marathon">Marathon</option>
        </select>
        {recentRaceDistance && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Hours', value: recentRaceHours, setter: setRecentRaceHours, max: 10 },
              { label: 'Minutes', value: recentRaceMinutes, setter: setRecentRaceMinutes, max: 59 },
              { label: 'Seconds', value: recentRaceSeconds, setter: setRecentRaceSeconds, max: 59 },
            ].map(({ label, value, setter, max }) => (
              <div key={label}>
                <label className="text-xs text-neutral-400 block mb-1">{label}</label>
                <input
                  type="number"
                  min="0"
                  max={max}
                  value={value}
                  onChange={(e) => setter(Number(e.target.value))}
                  className="w-full px-4 py-2 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white border-2 border-neutral-200 dark:border-neutral-700 rounded-xl focus:ring-0 focus:border-primary-500 focus:outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-2xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-soft">
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-5 h-5 text-primary-500" />
          <span className="font-semibold text-neutral-900 dark:text-white">Calibration test (optional)</span>
        </div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
          This optional step helps refine your training paces. If included, the test will be placed in a logical position within your schedule to fit around your regular training.
        </p>
        <div className="space-y-2">
          {(
            [
              {
                value: 'race_result',
                label: 'Use recent race result instead',
                description: 'We\'ll use the race time you entered above to set your paces.',
              },
              {
                value: 'calibration_test',
                label: 'Perform calibration test',
                description: getCalibrationProtocol(),
              },
              {
                value: 'skip',
                label: 'Skip for now',
                description: 'We\'ll estimate paces from your weekly volume.',
              },
            ] as { value: 'race_result' | 'calibration_test' | 'skip'; label: string; description: string }[]
          ).map(({ value, label, description }) => (
            <button
              key={value}
              type="button"
              onClick={() => setCalibrationChoice(value)}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                calibrationChoice === value
                  ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-400 dark:border-primary-600'
                  : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                  calibrationChoice === value
                    ? 'border-primary-500 bg-primary-500'
                    : 'border-neutral-300 dark:border-neutral-600'
                }`}>
                  {calibrationChoice === value && (
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-sm text-neutral-900 dark:text-white">{label}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-2xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-soft">
        <div className="flex items-center gap-2 mb-1">
          <Heart className="w-5 h-5 text-primary-500" />
          <span className="font-semibold text-neutral-900 dark:text-white">Injuries or Concerns</span>
          <span className="text-xs text-neutral-400">(Optional)</span>
        </div>
        <textarea
          value={injuries}
          onChange={(e) => setInjuries(e.target.value)}
          placeholder="Any injuries or physical concerns we should know about?"
          rows={3}
          className="w-full mt-2 px-4 py-3 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white border-2 border-neutral-200 dark:border-neutral-700 rounded-xl focus:ring-0 focus:border-primary-500 focus:outline-none transition-all placeholder:text-neutral-400 resize-none"
        />
      </div>

      <div className="space-y-3">
        <button
          type="submit"
          disabled={isLoading || !isValid}
          className="w-full py-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-bold text-lg rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg shadow-primary-500/25 flex items-center justify-center gap-2"
        >
          <Zap className="w-5 h-5" />
          {isLoading ? 'Generating Your Plan...' : 'Generate Training Plan'}
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className="w-full py-3 text-sm font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      </div>

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
              <div className="bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4">
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  This may take up to 2 minutes while our AI builds your personalised plan.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
