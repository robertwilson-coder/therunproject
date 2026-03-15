import { ArrowLeft, ChevronRight, Calendar, Clock } from 'lucide-react';
import type { ReadinessTier, FeasibilityParams } from '../utils/distanceFeasibilityEngine';
import { calculateRaceFeasibility } from '../utils/distanceFeasibilityEngine';
import type { RunnerAnswers } from '../types';

interface ColourRevealScreenProps {
  tier: ReadinessTier;
  answers: Partial<RunnerAnswers>;
  weeksAvailable: number;
  onContinue: () => void;
  onChangeTimeline: () => void;
  onExtendTimeline: (answers: RunnerAnswers) => void;
  onSwitchDistance: (answers: RunnerAnswers) => void;
  onStartBaseBuild: (answers: RunnerAnswers) => void;
}

interface TierConfig {
  label: string;
  bg: string;
  border: string;
  indicator: string;
  badgeBg: string;
  badgeText: string;
  headline: string;
  subtext: string;
}

const TIER_CONFIG: Record<ReadinessTier, TierConfig> = {
  green: {
    label: 'Green',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    border: 'border-emerald-300 dark:border-emerald-700',
    indicator: 'bg-emerald-500',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-800/40',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    headline: 'Strong timeline. This is very achievable.',
    subtext: 'Your current training base and available time put you in a strong position to prepare safely and effectively.',
  },
  orange: {
    label: 'Orange',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    border: 'border-amber-300 dark:border-amber-700',
    indicator: 'bg-amber-500',
    badgeBg: 'bg-amber-100 dark:bg-amber-800/40',
    badgeText: 'text-amber-700 dark:text-amber-300',
    headline: 'Achievable with focused, consistent training.',
    subtext: 'Your timeline is workable for this distance. Staying consistent will be important to make the most of your build.',
  },
  dark_orange: {
    label: 'Tight Timeline',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    border: 'border-orange-400 dark:border-orange-600',
    indicator: 'bg-orange-600',
    badgeBg: 'bg-orange-100 dark:bg-orange-800/40',
    badgeText: 'text-orange-700 dark:text-orange-300',
    headline: 'Possible, but this is an ambitious build.',
    subtext: 'Your current base and timeline leave limited room for progression. The plan will prioritise durability, and consistent execution will be essential.',
  },
  red: {
    label: 'Not Enough Time',
    bg: 'bg-red-50 dark:bg-red-900/20',
    border: 'border-red-300 dark:border-red-700',
    indicator: 'bg-red-500',
    badgeBg: 'bg-red-100 dark:bg-red-800/40',
    badgeText: 'text-red-700 dark:text-red-300',
    headline: 'This timeline does not allow for a safe build.',
    subtext: 'With your current training base and available time, we cannot build the durability required safely for this distance.',
  },
};

const DISTANCE_ORDER = ['5K', '10K', 'Half Marathon', 'Marathon'];

function getRaceDistanceKm(raceDistance: string): number {
  const map: Record<string, number> = { '5K': 5, '10K': 10, 'Half Marathon': 21, 'Marathon': 42 };
  if (map[raceDistance] !== undefined) return map[raceDistance];
  const parsed = parseInt(raceDistance, 10);
  return isNaN(parsed) ? 42 : parsed;
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

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function findGreenWeeks(answers: Partial<RunnerAnswers>, currentWeeks: number): number | null {
  const raceDistanceStr = answers.raceDistance || 'Marathon';
  const raceDistanceKm = getRaceDistanceKm(raceDistanceStr);
  const currentWeeklyVolume = answers.currentWeeklyKm || 0;
  const currentLongestRun = answers.longestRun || 0;

  for (let weeks = currentWeeks + 1; weeks <= 52; weeks++) {
    const params: FeasibilityParams = {
      currentWeeklyVolume,
      currentLongestRun,
      raceDistance: raceDistanceKm,
      weeksToRace: weeks,
    };
    const result = calculateRaceFeasibility(params);
    if (result.readinessTier === 'green') {
      return weeks;
    }
  }
  return null;
}

export function ColourRevealScreen({
  tier,
  answers,
  weeksAvailable,
  onContinue,
  onChangeTimeline,
  onExtendTimeline,
  onSwitchDistance,
  onStartBaseBuild,
}: ColourRevealScreenProps) {
  const config = TIER_CONFIG[tier];
  const raceDistance = answers.raceDistance || 'Marathon';
  const isRed = tier === 'red';
  const showGreenHint = tier === 'orange' || tier === 'dark_orange';

  const weeksNeeded = getWeeksNeededEstimate(
    answers.currentWeeklyKm || 0,
    answers.longestRun || 0,
    raceDistance
  );

  const greenWeeks = showGreenHint ? findGreenWeeks(answers, weeksAvailable) : null;

  const currentIdx = DISTANCE_ORDER.indexOf(raceDistance);
  const downgradedDistances = currentIdx > 0 ? DISTANCE_ORDER.slice(0, currentIdx) : [];

  const startDateDisplay = answers.customStartDate ? formatDate(answers.customStartDate) : 'Tomorrow';
  const raceDateDisplay = answers.raceDate ? formatDate(answers.raceDate) : null;

  const handleContinue = () => {
    onContinue();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 animate-fade-in">
      <div className={`rounded-2xl p-6 md:p-8 border-2 ${config.bg} ${config.border}`}>
        <div className="flex items-center gap-4 mb-4">
          <div className={`w-14 h-14 rounded-full ${config.indicator} shadow-lg flex-shrink-0`} />
          <div>
            <div className={`inline-block px-3 py-1 rounded-full text-sm font-bold mb-1 ${config.badgeBg} ${config.badgeText}`}>
              {config.label}
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-neutral-900 dark:text-white leading-snug">
              {config.headline}
            </h2>
          </div>
        </div>
        <p className="text-neutral-600 dark:text-neutral-300 text-base leading-relaxed">{config.subtext}</p>
        {showGreenHint && greenWeeks !== null && (
          <p className="text-sm text-neutral-400 dark:text-neutral-500 mt-3 leading-relaxed">
            Extending your timeline to approximately {greenWeeks} weeks would{' '}
            {tier === 'orange' ? 'place you in a stronger position' : 'allow for a more progressive build'}.
          </p>
        )}
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">
          Based on your current base and available time.
        </p>
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-2xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-soft">
        <h3 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-3">
          Your Plan Summary
        </h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-neutral-400 flex-shrink-0" />
            <div className="flex-1 flex justify-between items-baseline">
              <span className="text-sm text-neutral-600 dark:text-neutral-400">Start date</span>
              <span className="text-sm font-semibold text-neutral-900 dark:text-white">{startDateDisplay}</span>
            </div>
          </div>
          {raceDateDisplay && (
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-neutral-400 flex-shrink-0" />
              <div className="flex-1 flex justify-between items-baseline">
                <span className="text-sm text-neutral-600 dark:text-neutral-400">Race date</span>
                <span className="text-sm font-semibold text-neutral-900 dark:text-white">{raceDateDisplay}</span>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-neutral-400 flex-shrink-0" />
            <div className="flex-1 flex justify-between items-baseline">
              <span className="text-sm text-neutral-600 dark:text-neutral-400">Weeks available</span>
              <span className="text-sm font-semibold text-neutral-900 dark:text-white">{weeksAvailable} weeks</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
              <div className={`w-3 h-3 rounded-full ${config.indicator}`} />
            </div>
            <div className="flex-1 flex justify-between items-baseline">
              <span className="text-sm text-neutral-600 dark:text-neutral-400">Target race</span>
              <span className="text-sm font-semibold text-neutral-900 dark:text-white">{raceDistance}</span>
            </div>
          </div>
        </div>
      </div>

      {!isRed ? (
        <div className="space-y-3">
          <button
            onClick={handleContinue}
            className={`w-full py-4 font-bold text-lg rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg flex items-center justify-center gap-2 text-white ${config.indicator} hover:opacity-90`}
          >
            Continue to refine my plan
            <ChevronRight className="w-5 h-5" />
          </button>
          <button
            onClick={onChangeTimeline}
            className="w-full py-3 text-sm font-medium text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors flex items-center justify-center gap-2"
          >
            Adjust my timeline
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl p-5 border border-neutral-200 dark:border-neutral-800 shadow-soft space-y-3">
          <h3 className="text-base font-semibold text-neutral-900 dark:text-white mb-1">
            Choose an option to continue
          </h3>

          <button
            onClick={() => {
              const extended: RunnerAnswers = {
                ...(answers as RunnerAnswers),
                planWeeks: Math.min(weeksNeeded, 52),
                raceDate: undefined,
              };
              onExtendTimeline(extended);
            }}
            className="w-full flex items-start gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-800 hover:border-blue-400 dark:hover:border-blue-600 rounded-xl transition-all text-left group"
          >
            <div className="flex-1">
              <p className="font-semibold text-neutral-900 dark:text-white">Extend the timeline</p>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-0.5">
                Build over approximately {weeksNeeded} weeks to reach {raceDistance} readiness.
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-neutral-400 group-hover:text-blue-500 transition-colors mt-0.5 flex-shrink-0" />
          </button>

          {downgradedDistances.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2 mt-3">
                Or switch to a shorter race
              </p>
              <div className="grid grid-cols-2 gap-2">
                {downgradedDistances.map((dist) => (
                  <button
                    key={dist}
                    onClick={() => {
                      const switched: RunnerAnswers = { ...(answers as RunnerAnswers), raceDistance: dist };
                      onSwitchDistance(switched);
                    }}
                    className="py-3 px-4 bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800 hover:border-amber-400 dark:hover:border-amber-600 rounded-xl text-sm font-semibold text-neutral-900 dark:text-white transition-all"
                  >
                    {dist}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => {
              const baseBuild: RunnerAnswers = {
                ...(answers as RunnerAnswers),
                raceDistance: 'Half Marathon',
                raceDate: undefined,
                planWeeks: 12,
              };
              onStartBaseBuild(baseBuild);
            }}
            className="w-full flex items-start gap-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-200 dark:border-emerald-800 hover:border-emerald-400 dark:hover:border-emerald-600 rounded-xl transition-all text-left group"
          >
            <div className="flex-1">
              <p className="font-semibold text-neutral-900 dark:text-white">Start a base build</p>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-0.5">
                Begin a structured base phase to build durability before targeting your goal race.
              </p>
            </div>
            <ChevronRight className="w-5 h-5 text-neutral-400 group-hover:text-emerald-500 transition-colors mt-0.5 flex-shrink-0" />
          </button>

          <button
            onClick={onChangeTimeline}
            className="w-full pt-2 py-2 text-sm font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Change my inputs
          </button>
        </div>
      )}
    </div>
  );
}
