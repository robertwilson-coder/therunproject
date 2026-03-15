import { ShieldCheck, X, TrendingDown, Info } from 'lucide-react';
import type { RecoveryInsertionResult } from '../utils/recoveryWeekInsertion';

interface RecoveryInsertionConfirmModalProps {
  isOpen: boolean;
  result: RecoveryInsertionResult;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function RecoveryInsertionConfirmModal({
  isOpen,
  result,
  onConfirm,
  onDismiss,
}: RecoveryInsertionConfirmModalProps) {
  if (!isOpen) return null;

  const { recoveryWeekSpec, newProjectedPeakVolume, newProjectedPeakLongRun, taperWeeks } = result;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-confirm-title"
    >
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl max-w-md w-full shadow-2xl animate-scale-in">
        <div className="p-6">
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-500/10">
                <ShieldCheck className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide mb-0.5 text-blue-500">
                  Confirm recovery week
                </div>
                <h3 id="recovery-confirm-title" className="text-lg font-bold text-neutral-900 dark:text-white leading-tight">
                  Insert a recovery week now?
                </h3>
              </div>
            </div>
            <button
              onClick={onDismiss}
              className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md flex-shrink-0 ml-2"
              aria-label="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-4 mb-4 space-y-2.5">
            <Row icon={<TrendingDown className="w-4 h-4 text-blue-500" />} label="This week's volume" value={`${recoveryWeekSpec.actualVolume} km`} />
            <Row icon={<TrendingDown className="w-4 h-4 text-blue-500" />} label="Long run this week" value={`${recoveryWeekSpec.longRun} km (flat)`} />
            <Row icon={<TrendingDown className="w-4 h-4 text-blue-500" />} label="New projected peak volume" value={`${newProjectedPeakVolume} km/week`} />
            <Row icon={<TrendingDown className="w-4 h-4 text-blue-500" />} label="New projected peak long run" value={`${newProjectedPeakLongRun} km`} />
            <Row icon={<TrendingDown className="w-4 h-4 text-blue-500" />} label="Taper weeks" value={`${taperWeeks} (unchanged)`} />
          </div>

          <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-lg p-3 mb-5">
            <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
              Race date stays fixed. Colour tier, ramp rate, and taper are preserved.
              If the remaining weeks allow it, your peak volume will still be achieved — it may be slightly lower if time is constrained.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onDismiss}
              className="flex-1 px-4 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
            >
              Insert recovery week
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <span className="text-sm font-semibold text-neutral-900 dark:text-white">{value}</span>
    </div>
  );
}
