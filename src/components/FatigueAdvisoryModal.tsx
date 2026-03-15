import { TrendingUp, X, ChevronRight, RotateCcw, MinusCircle } from 'lucide-react';
import type { FatigueLevel } from '../utils/fatigueEngine';
import type { AdvisoryDecision } from '../utils/fatigueAdvisoryEngine';

interface FatigueAdvisoryModalProps {
  isOpen: boolean;
  fatigueLevel: FatigueLevel;
  onDecision: (decision: AdvisoryDecision) => void;
}

export function FatigueAdvisoryModal({
  isOpen,
  fatigueLevel,
  onDecision,
}: FatigueAdvisoryModalProps) {
  if (!isOpen || fatigueLevel === 'low') return null;

  const isElevated = fatigueLevel === 'elevated';

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fatigue-advisory-title"
    >
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl max-w-md w-full shadow-2xl animate-scale-in">
        <div className="p-6">
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${isElevated ? 'bg-red-500/10' : 'bg-amber-500/10'}`}>
                <TrendingUp className={`w-5 h-5 ${isElevated ? 'text-red-500' : 'text-amber-500'}`} />
              </div>
              <div>
                <div className={`text-xs font-semibold uppercase tracking-wide mb-0.5 ${isElevated ? 'text-red-500' : 'text-amber-500'}`}>
                  {isElevated ? 'Elevated fatigue detected' : 'Moderate fatigue detected'}
                </div>
                <h3 id="fatigue-advisory-title" className="text-lg font-bold text-neutral-900 dark:text-white leading-tight">
                  {isElevated
                    ? "We're seeing signs of accumulated fatigue."
                    : 'Your recent sessions have been trending slightly harder than planned.'}
                </h3>
              </div>
            </div>
            <button
              onClick={() => onDecision('dismissed')}
              className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md flex-shrink-0 ml-2"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {isElevated ? (
            <ElevatedOptions onDecision={onDecision} />
          ) : (
            <ModerateOptions onDecision={onDecision} />
          )}

          <p className="text-xs text-neutral-400 dark:text-neutral-600 text-center mt-4">
            Structural guidance, colour tiers, and long run targets are unaffected.
          </p>
        </div>
      </div>
    </div>
  );
}

function ModerateOptions({ onDecision }: { onDecision: (d: AdvisoryDecision) => void }) {
  return (
    <div className="flex flex-col gap-2 mt-2">
      <button
        onClick={() => onDecision('reduce_intensity')}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/20 transition-colors text-left group"
      >
        <div className="flex items-center gap-3">
          <MinusCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <div>
            <div className="font-semibold text-sm text-neutral-900 dark:text-white">Reduce intensity this week</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Pace zones soften by 3% for 7 days</div>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 flex-shrink-0" />
      </button>

      <button
        onClick={() => onDecision('continue')}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors text-left group"
      >
        <div className="flex items-center gap-3">
          <ChevronRight className="w-4 h-4 text-neutral-400 flex-shrink-0" />
          <div className="font-semibold text-sm text-neutral-700 dark:text-neutral-300">Continue as planned</div>
        </div>
        <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 flex-shrink-0" />
      </button>
    </div>
  );
}

function ElevatedOptions({ onDecision }: { onDecision: (d: AdvisoryDecision) => void }) {
  return (
    <div className="flex flex-col gap-2 mt-2">
      <button
        onClick={() => onDecision('bring_deload_forward')}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors text-left group"
      >
        <div className="flex items-center gap-3">
          <RotateCcw className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
          <div>
            <div className="font-semibold text-sm text-neutral-900 dark:text-white">Bring deload week forward</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Move next recovery week to now, shift subsequent weeks</div>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 flex-shrink-0" />
      </button>

      <button
        onClick={() => onDecision('reduce_intensity')}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-amber-200 dark:border-amber-800/50 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors text-left group"
      >
        <div className="flex items-center gap-3">
          <MinusCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <div>
            <div className="font-semibold text-sm text-neutral-900 dark:text-white">Reduce intensity for 7 days</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">Pace zones soften by 3% temporarily</div>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 flex-shrink-0" />
      </button>

      <button
        onClick={() => onDecision('continue')}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors text-left group"
      >
        <div className="flex items-center gap-3">
          <ChevronRight className="w-4 h-4 text-neutral-400 flex-shrink-0" />
          <div className="font-semibold text-sm text-neutral-700 dark:text-neutral-300">Continue as planned</div>
        </div>
        <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 flex-shrink-0" />
      </button>
    </div>
  );
}
