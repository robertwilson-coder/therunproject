import { Pause, Play, X, Calendar, Info, AlertTriangle, TrendingUp } from 'lucide-react';
import type { ResumeResult } from '../utils/planPause';
import { formatPauseDuration } from '../utils/planPause';
import { formatDateForDisplay } from '../utils/dateUtils';

interface PausePlanModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function PausePlanModal({ isOpen, onConfirm, onDismiss }: PausePlanModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-plan-title"
    >
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl max-w-md w-full shadow-2xl">
        <div className="p-6">
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-amber-500/10">
                <Pause className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide mb-0.5 text-amber-500">
                  Pause training
                </div>
                <h3 id="pause-plan-title" className="text-lg font-bold text-neutral-900 dark:text-white leading-tight">
                  Pause your plan?
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

          <div className="space-y-3 mb-5">
            <InfoRow icon={<Pause className="w-4 h-4 text-amber-500" />} text="Workout scheduling is frozen while paused" />
            <InfoRow icon={<Calendar className="w-4 h-4 text-amber-500" />} text="Your race date will extend automatically when you resume" />
            <InfoRow icon={<TrendingUp className="w-4 h-4 text-amber-500" />} text="Structural volume and long run targets are saved" />
          </div>

          <div className="flex items-start gap-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 mb-5">
            <Info className="w-4 h-4 text-neutral-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              You can resume at any time. The plan resumes from where you left off — colour tier, ramp rate, and taper are all preserved.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onDismiss}
              className="flex-1 px-4 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              Keep training
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors"
            >
              Pause plan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ResumePlanModalProps {
  isOpen: boolean;
  result: ResumeResult;
  onConfirm: () => void;
  onDismiss: () => void;
}

export function ResumePlanModal({ isOpen, result, onConfirm, onDismiss }: ResumePlanModalProps) {
  if (!isOpen) return null;

  const {
    pauseDurationDays,
    newRaceDate,
    taperWeeks,
    weeklyVolumes,
    showRebuildAdvisory,
  } = result;

  const newPeakVolume = weeklyVolumes.length > 0 ? Math.max(...weeklyVolumes) : 0;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resume-plan-title"
    >
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl max-w-md w-full shadow-2xl">
        <div className="p-6">
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-green-500/10">
                <Play className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide mb-0.5 text-green-500">
                  Resume training
                </div>
                <h3 id="resume-plan-title" className="text-lg font-bold text-neutral-900 dark:text-white leading-tight">
                  Ready to resume?
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
            <DetailRow label="Pause duration" value={formatPauseDuration(pauseDurationDays)} />
            <DetailRow label="New race date" value={formatDateForDisplay(newRaceDate)} highlight />
            <DetailRow label="Projected peak volume" value={`${newPeakVolume} km/week`} />
            <DetailRow label="Taper weeks" value={`${taperWeeks} (unchanged)`} />
          </div>

          {showRebuildAdvisory && (
            <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/40 rounded-lg p-3 mb-4">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                You've been paused for more than 6 weeks. Consider starting with a short 1-2 week rebuild at reduced intensity before returning to full training load.
              </p>
            </div>
          )}

          <div className="flex items-start gap-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 mb-5">
            <Info className="w-4 h-4 text-neutral-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
              Race date extended by {formatPauseDuration(pauseDurationDays)}. Colour tier, ramp rate, and taper length are preserved. The plan resumes from week {(result as any).pauseWeekIndex !== undefined ? (result as any).pauseWeekIndex + 1 : 'where you left off'}.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onDismiss}
              className="flex-1 px-4 py-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              Stay paused
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors"
            >
              Resume plan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-shrink-0">{icon}</div>
      <span className="text-sm text-neutral-700 dark:text-neutral-300">{text}</span>
    </div>
  );
}

function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-neutral-600 dark:text-neutral-400">{label}</span>
      <span className={`text-sm font-semibold ${highlight ? 'text-green-600 dark:text-green-400' : 'text-neutral-900 dark:text-white'}`}>{value}</span>
    </div>
  );
}
