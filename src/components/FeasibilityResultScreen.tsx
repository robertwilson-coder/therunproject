import { AlertTriangle, TrendingUp, Calendar, ArrowRight, RefreshCw } from 'lucide-react';
import type { FeasibilityResult } from '../utils/distanceFeasibilityEngine';
import type { RunnerAnswers } from '../types';

interface FeasibilityResultScreenProps {
  result: FeasibilityResult;
  answers: RunnerAnswers;
  onExtendTimeline: (answers: RunnerAnswers) => void;
  onSwitchDistance: (answers: RunnerAnswers) => void;
  onStartBaseBuild: (answers: RunnerAnswers) => void;
  onBack: () => void;
}

function getRaceDistanceKm(raceDistance: string): number {
  const map: Record<string, number> = {
    '5K': 5,
    '10K': 10,
    'Half Marathon': 21.1,
    'Marathon': 42.2,
  };
  return map[raceDistance] || 42.2;
}

function getSwitchDistanceOptions(currentRaceDistance: string): string[] {
  const order = ['5K', '10K', 'Half Marathon', 'Marathon'];
  const idx = order.indexOf(currentRaceDistance);
  if (idx <= 0) return [];
  return order.slice(0, idx);
}

function getWeeksNeededEstimate(currentVolume: number, longestRun: number, raceDistance: string): number {
  const targetKm = getRaceDistanceKm(raceDistance);
  const targetVolume = targetKm * 1.2;
  const targetLongRun = targetKm * 0.7;

  const weeksForVolume = currentVolume > 0
    ? Math.ceil(Math.log(targetVolume / currentVolume) / Math.log(1.06))
    : 24;
  const weeksForLongRun = longestRun > 0
    ? Math.ceil(Math.log(targetLongRun / longestRun) / Math.log(1.06))
    : 24;

  return Math.max(weeksForVolume, weeksForLongRun, 12);
}

export function FeasibilityResultScreen({
  result,
  answers,
  onExtendTimeline,
  onSwitchDistance,
  onStartBaseBuild,
  onBack,
}: FeasibilityResultScreenProps) {
  const { projectedPeakVolume, projectedPeakLongestRun } = result;
  const raceDistance = answers.raceDistance || 'Marathon';
  const raceKm = getRaceDistanceKm(raceDistance);
  const weeksNeeded = getWeeksNeededEstimate(
    answers.currentWeeklyKm || 0,
    answers.longestRun || 0,
    raceDistance
  );

  const downgradedDistances = getSwitchDistanceOptions(raceDistance);
  const targetVolume = Math.round(raceKm * 1.2);
  const targetLongRun = Math.round(raceKm * 0.7 * 10) / 10;

  const handleExtendTimeline = () => {
    const extendedAnswers: RunnerAnswers = {
      ...answers,
      planWeeks: Math.min(weeksNeeded, 20),
      raceDate: undefined,
    };
    onExtendTimeline(extendedAnswers);
  };

  const handleSwitchDistance = (newDistance: string) => {
    const switchedAnswers: RunnerAnswers = {
      ...answers,
      raceDistance: newDistance,
    };
    onSwitchDistance(switchedAnswers);
  };

  const handleStartBaseBuild = () => {
    const baseBuildAnswers: RunnerAnswers = {
      ...answers,
      raceDistance: 'Half Marathon',
      raceDate: undefined,
      planWeeks: 12,
    };
    onStartBaseBuild(baseBuildAnswers);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div className="bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 rounded-xl p-6 md:p-8">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-red-100 dark:bg-red-800/40 rounded-lg flex-shrink-0">
            <AlertTriangle className="w-7 h-7 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-red-800 dark:text-red-200 mb-2">
              {raceDistance} Requires More Build Time
            </h2>
            <p className="text-red-700 dark:text-red-300 text-base leading-relaxed">
              Based on your current base and timeline, we would not be able to build the durability required to prepare safely for a {raceDistance.toLowerCase()}. Extending your build time or adjusting your goal will give you a stronger foundation.
            </p>
          </div>
        </div>
      </div>

      <div className="card-premium p-6">
        <h3 className="text-base font-semibold text-neutral-900 dark:text-white mb-4">
          Based on structured progression and recovery cycles, your training would likely reach:
        </h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-neutral-900 dark:text-white">{projectedPeakVolume} km</p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Projected peak weekly volume</p>
          </div>
          <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-neutral-900 dark:text-white">{projectedPeakLongestRun} km</p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">Projected peak long run</p>
          </div>
        </div>
        <div className="bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            A safe {raceDistance} plan requires a peak weekly volume around{' '}
            <strong className="text-neutral-900 dark:text-white">{targetVolume} km</strong> and a long run of at least{' '}
            <strong className="text-neutral-900 dark:text-white">{targetLongRun} km</strong>.
            You'd need roughly <strong className="text-neutral-900 dark:text-white">{weeksNeeded} weeks</strong> to build to that base.
          </p>
        </div>
      </div>

      <div className="card-premium p-6 space-y-4">
        <h3 className="text-base font-semibold text-neutral-900 dark:text-white mb-2">
          Choose an option to continue
        </h3>

        <button
          onClick={handleExtendTimeline}
          className="w-full flex items-center gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-700 hover:border-blue-400 dark:hover:border-blue-500 rounded-xl transition-all group text-left"
        >
          <div className="p-2.5 bg-blue-100 dark:bg-blue-800/40 rounded-lg group-hover:bg-blue-200 dark:group-hover:bg-blue-700/40 transition-colors flex-shrink-0">
            <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-neutral-900 dark:text-white">Extend the timeline</p>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-0.5">
              Extend your build to approximately {weeksNeeded} weeks to reach marathon readiness.
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-neutral-400 group-hover:text-blue-500 transition-colors flex-shrink-0" />
        </button>

        {downgradedDistances.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 bg-amber-100 dark:bg-amber-800/40 rounded-lg flex-shrink-0">
                <TrendingUp className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-neutral-900 dark:text-white">Switch to a shorter race distance</p>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Your current fitness is well-suited for one of these
                </p>
              </div>
            </div>
            <div className="ml-12 grid grid-cols-2 gap-2">
              {downgradedDistances.map((dist) => (
                <button
                  key={dist}
                  onClick={() => handleSwitchDistance(dist)}
                  className="px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-700 hover:border-amber-400 dark:hover:border-amber-500 rounded-lg text-sm font-semibold text-neutral-900 dark:text-white transition-all hover:shadow-md text-center"
                >
                  {dist}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleStartBaseBuild}
          className="w-full flex items-center gap-4 p-4 bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-700 hover:border-green-400 dark:hover:border-green-500 rounded-xl transition-all group text-left"
        >
          <div className="p-2.5 bg-green-100 dark:bg-green-800/40 rounded-lg group-hover:bg-green-200 dark:group-hover:bg-green-700/40 transition-colors flex-shrink-0">
            <RefreshCw className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-neutral-900 dark:text-white">Start a base build instead</p>
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-0.5">
              Begin a structured base phase to increase your weekly durability before progressing toward the {raceDistance}.
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-neutral-400 group-hover:text-green-500 transition-colors flex-shrink-0" />
        </button>

        <button
          onClick={onBack}
          className="w-full px-4 py-3 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
        >
          Back to questionnaire
        </button>
      </div>
    </div>
  );
}
