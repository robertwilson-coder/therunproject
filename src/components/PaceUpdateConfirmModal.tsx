import { Activity, X } from 'lucide-react';
import type { TrainingPaces } from '../types';

interface PaceUpdateConfirmModalProps {
  isOpen: boolean;
  changePct: number;
  newPaces: TrainingPaces;
  currentPaces: TrainingPaces;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function PaceUpdateConfirmModal({
  isOpen,
  changePct,
  newPaces,
  currentPaces,
  onConfirm,
  onDismiss,
}: PaceUpdateConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={onDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pace-update-title"
    >
      <div
        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl max-w-md w-full shadow-2xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary-500/10 rounded-lg">
                <Activity className="w-5 h-5 text-primary-500" />
              </div>
              <h3 id="pace-update-title" className="text-lg font-bold text-neutral-900 dark:text-white">
                Meaningful change in your pace profile
              </h3>
            </div>
            <button
              onClick={onDismiss}
              className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-neutral-600 dark:text-neutral-400 text-sm mb-5">
            Your recent performance suggests a threshold pace that differs by{' '}
            <span className="font-semibold text-neutral-900 dark:text-white">{changePct}%</span>{' '}
            from your current training zones.
          </p>

          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden mb-5">
            <div className="grid grid-cols-3 bg-neutral-50 dark:bg-neutral-800/50 px-4 py-2 text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
              <span>Zone</span>
              <span className="text-center">Current</span>
              <span className="text-center">New</span>
            </div>
            {[
              { label: 'Easy', current: currentPaces.easyPace, next: newPaces.easyPace },
              { label: 'Long run', current: currentPaces.longRunPace, next: newPaces.longRunPace },
              { label: 'Tempo', current: currentPaces.tempoPace, next: newPaces.tempoPace },
              { label: 'Interval', current: currentPaces.intervalPace, next: newPaces.intervalPace },
              { label: 'Race', current: currentPaces.racePace, next: newPaces.racePace },
            ].map(({ label, current, next }) => (
              <div key={label} className="grid grid-cols-3 px-4 py-2.5 border-t border-neutral-100 dark:border-neutral-800 text-sm">
                <span className="text-neutral-600 dark:text-neutral-400">{label}</span>
                <span className="text-center text-neutral-500 dark:text-neutral-500 line-through">{current || '—'}</span>
                <span className="text-center font-medium text-neutral-900 dark:text-white">{next || '—'}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={onConfirm}
              className="w-full btn-primary py-2.5"
            >
              Update my training zones
            </button>
            <button
              onClick={onDismiss}
              className="w-full btn-ghost py-2.5"
            >
              Keep current zones
            </button>
          </div>

          <p className="text-xs text-neutral-400 dark:text-neutral-600 text-center mt-3">
            You can retest or adjust this later in Settings.
          </p>
        </div>
      </div>
    </div>
  );
}
