import { useState } from 'react';
import type { RunnerAnswers } from '../types';
import { Target, Calendar, TrendingUp, MapPin, ChevronRight } from 'lucide-react';

interface QuestionnairePartAProps {
  onSubmit: (answers: Partial<RunnerAnswers>) => void;
  initialAnswers?: Partial<RunnerAnswers>;
}

const RACE_DISTANCES: { label: string; km: number }[] = [
  { label: '5K', km: 5 },
  { label: '10K', km: 10 },
  { label: 'Half Marathon', km: 21 },
  { label: 'Marathon', km: 42 },
];

function getTomorrowDateStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

function getTodayDateStr(): string {
  return new Date().toISOString().split('T')[0];
}

function computeWeeksFromDates(startDate: string, raceDate: string): number {
  const start = new Date(startDate);
  const race = new Date(raceDate);
  if (isNaN(start.getTime()) || isNaN(race.getTime())) return 16;
  return Math.max(1, Math.floor((race.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 7)));
}

function getDistanceLabel(km: number): string {
  if (km === 5) return '5K';
  if (km === 10) return '10K';
  if (km === 21) return 'Half Marathon';
  if (km === 42) return 'Marathon';
  return `${km}km`;
}

export function QuestionnairePartA({ onSubmit, initialAnswers }: QuestionnairePartAProps) {
  const getInitialDistanceKm = (): number => {
    const d = initialAnswers?.raceDistance;
    if (d === '5K') return 5;
    if (d === '10K') return 10;
    if (d === 'Half Marathon') return 21;
    if (d === 'Marathon') return 42;
    const parsed = parseInt(d || '', 10);
    if (!isNaN(parsed)) return Math.min(42, Math.max(1, parsed));
    return 42;
  };

  const [raceDistanceKm, setRaceDistanceKm] = useState<number>(getInitialDistanceKm());
  const [hasSpecificRace, setHasSpecificRace] = useState<boolean>(!!initialAnswers?.raceDate);
  const [raceDate, setRaceDate] = useState<string>(initialAnswers?.raceDate || '');
  const [weeksToTrain, setWeeksToTrain] = useState<number>(Math.min(20, Math.max(4, initialAnswers?.planWeeks || 12)));
  const [startDate, setStartDate] = useState<string>(initialAnswers?.customStartDate || getTomorrowDateStr());
  const [currentWeeklyKm, setCurrentWeeklyKm] = useState<number>(initialAnswers?.currentWeeklyKm || 0);
  const [longestRun, setLongestRun] = useState<number>(initialAnswers?.longestRun || 0);

  const rawDerivedWeeks = hasSpecificRace && raceDate ? computeWeeksFromDates(startDate, raceDate) : weeksToTrain;
  const derivedWeeks = Math.min(20, Math.max(4, rawDerivedWeeks));
  const wasClampedToMax = rawDerivedWeeks > 20;
  const wasClampedToMin = rawDerivedWeeks < 4;

  const raceDistanceLabel = getDistanceLabel(raceDistanceKm);

  const startDateObj = startDate ? new Date(startDate) : new Date();
  const minRaceDate = new Date(startDateObj);
  minRaceDate.setDate(minRaceDate.getDate() + 7);
  const minRaceDateStr = minRaceDate.toISOString().split('T')[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const answers: Partial<RunnerAnswers> = {
      raceDistance: raceDistanceLabel,
      raceDate: hasSpecificRace && raceDate ? raceDate : undefined,
      planWeeks: hasSpecificRace && raceDate ? derivedWeeks : weeksToTrain,
      customStartDate: startDate,
      currentWeeklyKm,
      longestRun,
    };
    onSubmit(answers);
  };

  const isValid = (): boolean => {
    if (hasSpecificRace && !raceDate) return false;
    if (hasSpecificRace && raceDate && rawDerivedWeeks < 4) return false;
    return true;
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-5">
      <div className="text-center mb-6">
        <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 dark:text-white mb-2">
          Let&#39;s assess your readiness
        </h2>
        <p className="text-neutral-500 dark:text-neutral-400">
          A few quick inputs to check if your timeline is realistic.
        </p>
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-2xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-soft">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-5 h-5 text-primary-500" />
          <span className="font-semibold text-neutral-900 dark:text-white">Race Distance</span>
          <span className="ml-auto text-sm font-bold text-primary-600 dark:text-primary-400">{raceDistanceLabel}</span>
        </div>
        <input
          type="range"
          min="1"
          max="42"
          step="1"
          value={Math.min(raceDistanceKm, 42)}
          onChange={(e) => setRaceDistanceKm(Number(e.target.value))}
          className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-primary-500 mb-1"
        />
        <div className="flex justify-between text-xs text-neutral-400 mb-3">
          <span>1 km</span>
          <span>Marathon (42 km)</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {RACE_DISTANCES.map((d) => (
            <button
              key={d.label}
              type="button"
              onClick={() => setRaceDistanceKm(d.km)}
              className={`py-2 px-1 rounded-lg text-sm font-semibold border-2 transition-all ${
                raceDistanceKm === d.km
                  ? 'bg-primary-500 border-primary-500 text-white shadow-md'
                  : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:border-primary-400'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-2xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-soft">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-primary-500" />
          <span className="font-semibold text-neutral-900 dark:text-white">Training Timeline</span>
        </div>
        <div className="flex items-center gap-3 mb-4">
          <button
            type="button"
            onClick={() => setHasSpecificRace(false)}
            className={`flex-1 py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-all ${
              !hasSpecificRace
                ? 'bg-primary-500 border-primary-500 text-white shadow-md'
                : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:border-primary-400'
            }`}
          >
            Choose weeks
          </button>
          <button
            type="button"
            onClick={() => setHasSpecificRace(true)}
            className={`flex-1 py-3 px-4 rounded-xl border-2 text-sm font-semibold transition-all ${
              hasSpecificRace
                ? 'bg-primary-500 border-primary-500 text-white shadow-md'
                : 'bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:border-primary-400'
            }`}
          >
            I have a race date
          </button>
        </div>
        {hasSpecificRace ? (
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Race Date</label>
            <input
              type="date"
              value={raceDate}
              min={minRaceDateStr}
              onChange={(e) => setRaceDate(e.target.value)}
              className="w-full px-4 py-2.5 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white border-2 border-neutral-200 dark:border-neutral-700 rounded-xl focus:ring-0 focus:border-primary-500 focus:outline-none transition-all"
              required
            />
            {raceDate && (
              <div className="mt-2 space-y-1">
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {derivedWeeks} weeks of training from your start date
                </p>
                {wasClampedToMax && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Plans are available from 4 to 20 weeks. Your plan will cover the final 20 weeks before race day.
                  </p>
                )}
                {wasClampedToMin && (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    Plans require at least 4 weeks. Please adjust your start date or race date.
                  </p>
                )}
                {derivedWeeks >= 4 && derivedWeeks <= 6 && !wasClampedToMin && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Short plans (4-6 weeks) focus on consistency and race readiness rather than building new fitness.
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-neutral-500 dark:text-neutral-400">4 weeks</span>
              <span className="text-sm font-bold text-primary-600 dark:text-primary-400">{weeksToTrain} weeks</span>
              <span className="text-sm text-neutral-500 dark:text-neutral-400">20 weeks</span>
            </div>
            <input
              type="range"
              min="4"
              max="20"
              step="1"
              value={weeksToTrain}
              onChange={(e) => setWeeksToTrain(Number(e.target.value))}
              className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
            />
            {weeksToTrain <= 6 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                Short plans (4-6 weeks) focus on consistency and race readiness rather than building new fitness.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-2xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-soft">
        <div className="flex items-center gap-2 mb-1">
          <Calendar className="w-5 h-5 text-primary-500" />
          <span className="font-semibold text-neutral-900 dark:text-white">Training Start Date</span>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">
          When can you realistically start training?
        </p>
        <input
          type="date"
          value={startDate}
          onChange={(e) => {
            const newStart = e.target.value;
            setStartDate(newStart);
            if (raceDate && newStart >= raceDate) setRaceDate('');
          }}
          className="w-full px-4 py-2.5 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white border-2 border-neutral-200 dark:border-neutral-700 rounded-xl focus:ring-0 focus:border-primary-500 focus:outline-none transition-all"
        />
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-2xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-soft">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-primary-500" />
          <span className="font-semibold text-neutral-900 dark:text-white">Longest Run in Last Month</span>
          <span className="ml-auto text-sm font-bold text-primary-600 dark:text-primary-400">
            {longestRun === 0 ? '0 km' : longestRun >= 35 ? '35+ km' : `${longestRun} km`}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="35"
          step="1"
          value={longestRun}
          onChange={(e) => setLongestRun(Number(e.target.value))}
          className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
        />
        <div className="flex justify-between text-xs text-neutral-400 mt-1.5">
          <span>0 km</span>
          <span>35+ km</span>
        </div>
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-2xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-soft">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-5 h-5 text-primary-500" />
          <span className="font-semibold text-neutral-900 dark:text-white">Current Weekly Distance</span>
          <span className="ml-auto text-sm font-bold text-primary-600 dark:text-primary-400">
            {currentWeeklyKm === 0 ? '0 km' : currentWeeklyKm >= 100 ? '100+ km' : `${currentWeeklyKm} km`}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={currentWeeklyKm}
          onChange={(e) => setCurrentWeeklyKm(Number(e.target.value))}
          className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
        />
        <div className="flex justify-between text-xs text-neutral-400 mt-1.5">
          <span>0 km</span>
          <span>100+ km</span>
        </div>
      </div>

      <button
        type="submit"
        disabled={!isValid()}
        className="w-full py-4 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 text-white font-bold text-lg rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 shadow-lg shadow-primary-500/25 flex items-center justify-center gap-2"
      >
        Check My Readiness
        <ChevronRight className="w-5 h-5" />
      </button>
    </form>
  );
}
