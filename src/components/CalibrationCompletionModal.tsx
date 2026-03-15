import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface CalibrationCompletionModalProps {
  workoutToRate: {
    week: number;
    day: string;
    activity: string;
  };
  workDuration: number;
  workDistance: number;
  averagePaceSeconds: number;
  paceSplitDifference: number;
  elevationGain: number;
  startingHeartRate: number;
  endingHeartRate: number;
  stoppedOrWalked: boolean;
  effortConsistency: number;
  lapSplits: string[];
  notes: string;
  onClose: () => void;
  onWorkDurationChange: (value: number) => void;
  onWorkDistanceChange: (value: number) => void;
  onAveragePaceChange: (seconds: number) => void;
  onPaceSplitChange: (seconds: number) => void;
  onElevationGainChange: (value: number) => void;
  onStartingHeartRateChange: (value: number) => void;
  onEndingHeartRateChange: (value: number) => void;
  onStoppedOrWalkedChange: (value: boolean) => void;
  onEffortConsistencyChange: (value: number) => void;
  onLapSplitsChange: (splits: string[]) => void;
  onNotesChange: (notes: string) => void;
  onSubmit: () => void;
}

const formatPaceFromSeconds = (seconds: number): { minutes: number; seconds: number } => {
  if (seconds === 0) return { minutes: 0, seconds: 0 };
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return { minutes: mins, seconds: secs };
};

const formatPaceDisplay = (seconds: number): string => {
  if (seconds === 0) return '--:--';
  const { minutes, seconds: secs } = formatPaceFromSeconds(seconds);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

export function CalibrationCompletionModal({
  workoutToRate,
  workDuration,
  workDistance,
  averagePaceSeconds,
  paceSplitDifference,
  elevationGain,
  startingHeartRate,
  endingHeartRate,
  stoppedOrWalked,
  effortConsistency,
  lapSplits,
  notes,
  onClose,
  onWorkDurationChange,
  onWorkDistanceChange,
  onAveragePaceChange,
  onPaceSplitChange,
  onElevationGainChange,
  onStartingHeartRateChange,
  onEndingHeartRateChange,
  onStoppedOrWalkedChange,
  onEffortConsistencyChange,
  onLapSplitsChange,
  onNotesChange,
  onSubmit
}: CalibrationCompletionModalProps) {
  const [localPaceMinutes, setLocalPaceMinutes] = useState('');
  const [localPaceSeconds, setLocalPaceSeconds] = useState('');

  useEffect(() => {
    const formatted = formatPaceFromSeconds(averagePaceSeconds);
    setLocalPaceMinutes(formatted.minutes > 0 ? formatted.minutes.toString() : '');
    setLocalPaceSeconds(formatted.seconds > 0 ? formatted.seconds.toString() : '');
  }, []);

  const calculatedDrift = startingHeartRate > 0 && endingHeartRate > 0
    ? endingHeartRate - startingHeartRate
    : 0;
  const isValid = workDuration > 0 && workDistance > 0 && averagePaceSeconds > 0 && effortConsistency > 0;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-start justify-center z-50 p-4 overflow-y-auto animate-fade-in">
      <div className="relative max-w-3xl w-full my-8 animate-scale-in">
        <div className="absolute inset-0 bg-gradient-to-br from-teal-500/20 via-cyan-500/20 to-blue-500/20 rounded-2xl blur-xl"></div>

        <div className="relative bg-gradient-to-br from-white via-teal-50 to-white dark:from-neutral-900 dark:via-teal-950 dark:to-neutral-900 rounded-2xl border-2 border-teal-400/50 shadow-2xl shadow-teal-500/50 overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-400 via-cyan-400 to-blue-400"></div>

          <div className="relative p-8">
            <button
              onClick={onClose}
              className="absolute top-6 right-6 text-neutral-600 hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-white transition-colors hover:scale-110 hover:rotate-90"
            >
              <X className="w-7 h-7" />
            </button>

            <div className="mb-8">
              <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 text-white font-black uppercase tracking-widest text-base shadow-2xl shadow-teal-500/60 border-2 border-white/30 mb-4">
                <span className="relative flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-white"></span>
                </span>
                Performance Calibration Test
              </div>

              <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-600 via-cyan-600 to-blue-600 dark:from-teal-300 dark:via-cyan-300 dark:to-blue-300 mb-3">
                Record Test Data
              </h2>

              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-gradient-to-r from-teal-500/50 to-transparent"></div>
                <p className="text-teal-600 dark:text-teal-600 dark:text-teal-300 font-semibold text-sm uppercase tracking-wide">
                  Week {workoutToRate.week} • {workoutToRate.day}
                </p>
                <div className="flex-1 h-px bg-gradient-to-l from-teal-500/50 to-transparent"></div>
              </div>

              <div className="text-neutral-700 dark:text-neutral-300 text-sm leading-relaxed mb-6">
                {workoutToRate.activity.split('**').map((part, index) => (
                  index % 2 === 0 ? <span key={index}>{part}</span> : <strong key={index}>{part}</strong>
                ))}
              </div>

              <div className="relative bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-2 border-amber-400/40 rounded-xl p-5 mb-8 shadow-lg shadow-amber-500/20">
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400 to-transparent"></div>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center text-amber-950 font-black text-lg mt-0.5">
                    !
                  </div>
                  <div>
                    <p className="text-amber-700 dark:text-amber-200 font-bold text-sm mb-2 uppercase tracking-wide">Critical Instructions</p>
                    <p className="text-amber-100/90 text-sm leading-relaxed">
                      Record data from the <strong className="text-amber-50">work segment only</strong>. Do not include warm-up or cool-down phases in any of your measurements below.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-teal-500/5 border-2 border-teal-400/30 rounded-xl p-5 shadow-lg">
                <h3 className="text-base font-black text-teal-600 dark:text-teal-300 mb-4 uppercase tracking-wide flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse"></span>
                  Primary Metrics
                  <span className="text-xs bg-teal-500 px-2 py-0.5 rounded text-white font-bold">REQUIRED</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="bg-neutral-100 dark:bg-neutral-900/50 rounded-lg p-3 border border-teal-500/20">
                    <label className="text-xs font-bold text-teal-600 dark:text-teal-400 mb-2 block uppercase tracking-wider">
                      Work Duration *
                    </label>
                    <div className="flex items-baseline gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={workDuration || ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.]/g, '');
                          const num = parseFloat(val);
                          if (!isNaN(num) && num >= 0 && num <= 120) {
                            onWorkDurationChange(num);
                          } else if (val === '') {
                            onWorkDurationChange(0);
                          }
                        }}
                        className="input-field flex-1 text-xl font-bold text-teal-600 dark:text-teal-300 bg-white dark:bg-neutral-950 border-teal-500/50 focus:border-teal-400"
                        placeholder="0.0"
                      />
                      <span className="text-sm font-semibold text-teal-600 dark:text-teal-400">minutes</span>
                    </div>
                  </div>

                  <div className="bg-neutral-100 dark:bg-neutral-900/50 rounded-lg p-3 border border-teal-500/20">
                    <label className="text-xs font-bold text-teal-600 dark:text-teal-400 mb-2 block uppercase tracking-wider">
                      Work Distance *
                    </label>
                    <div className="flex items-baseline gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={workDistance || ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.]/g, '');
                          const num = parseFloat(val);
                          if (!isNaN(num) && num >= 0 && num <= 50) {
                            onWorkDistanceChange(num);
                          } else if (val === '') {
                            onWorkDistanceChange(0);
                          }
                        }}
                        className="input-field flex-1 text-xl font-bold text-teal-600 dark:text-teal-300 bg-white dark:bg-neutral-950 border-teal-500/50 focus:border-teal-400"
                        placeholder="0.00"
                      />
                      <span className="text-sm font-semibold text-teal-600 dark:text-teal-400">km</span>
                    </div>
                  </div>
                </div>

                <div className="bg-neutral-100 dark:bg-neutral-900/50 rounded-lg p-3 border border-teal-500/20">
                  <label className="text-xs font-bold text-teal-600 dark:text-teal-400 mb-2 block uppercase tracking-wider">
                    Average Pace (Work Segment) *
                  </label>
                  <div className="flex gap-3 items-center">
                    <div className="flex-1">
                      <label className="text-xs text-teal-600 dark:text-teal-400/70 mb-1 block font-semibold uppercase">Minutes</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={localPaceMinutes}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          setLocalPaceMinutes(val);
                          const mins = val === '' ? 0 : parseInt(val);
                          const secs = localPaceSeconds === '' ? 0 : parseInt(localPaceSeconds);
                          if (mins <= 20) {
                            onAveragePaceChange(mins * 60 + secs);
                          }
                        }}
                        className="input-field w-full text-xl font-bold text-center bg-white dark:bg-neutral-950 border-teal-500/50 focus:border-teal-400 text-neutral-900 dark:text-white"
                        placeholder="4"
                      />
                    </div>
                    <div className="text-xl font-black text-teal-600 dark:text-teal-400 mt-5">:</div>
                    <div className="flex-1">
                      <label className="text-xs text-teal-600 dark:text-teal-400/70 mb-1 block font-semibold uppercase">Seconds</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={localPaceSeconds}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          setLocalPaceSeconds(val);
                          const mins = localPaceMinutes === '' ? 0 : parseInt(localPaceMinutes);
                          const secs = val === '' ? 0 : parseInt(val);
                          if (secs <= 59) {
                            onAveragePaceChange(mins * 60 + secs);
                          }
                        }}
                        className="input-field w-full text-xl font-bold text-center bg-white dark:bg-neutral-950 border-teal-500/50 focus:border-teal-400 text-neutral-900 dark:text-white"
                        placeholder="30"
                      />
                    </div>
                    <div className="text-sm text-teal-600 dark:text-teal-400 font-bold mt-5">min/km</div>
                  </div>
                </div>

                <div className="bg-neutral-100 dark:bg-neutral-900/50 rounded-lg p-4 border border-teal-500/20">
                  <label className="text-xs font-bold text-teal-600 dark:text-teal-400 mb-2 block uppercase tracking-wider">
                    Kilometer Splits (Optional)
                  </label>
                  <p className="text-xs text-neutral-400 mb-3">
                    Add your individual kilometer pace times (e.g., "5:30" or "530" for 5 minutes 30 seconds per km)
                  </p>
                  <div className="space-y-2">
                    {lapSplits.map((split, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <span className="text-xs text-teal-600 dark:text-teal-400 font-bold w-16">KM {index + 1}:</span>
                        <input
                          type="text"
                          value={split}
                          onChange={(e) => {
                            const newSplits = [...lapSplits];
                            newSplits[index] = e.target.value;
                            onLapSplitsChange(newSplits);
                          }}
                          placeholder="5:30"
                          className="input-field flex-1 text-base font-mono bg-white dark:bg-neutral-950 border-teal-500/50 focus:border-teal-400 text-white"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newSplits = lapSplits.filter((_, i) => i !== index);
                            onLapSplitsChange(newSplits);
                          }}
                          className="text-red-400 hover:text-red-300 font-bold text-xs px-3 py-2 bg-red-500/10 rounded hover:bg-red-500/20 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => onLapSplitsChange([...lapSplits, ''])}
                      className="text-sm text-teal-600 dark:text-teal-400 hover:text-teal-600 dark:text-teal-300 font-bold mt-2 flex items-center gap-2 px-3 py-2 bg-teal-500/10 rounded hover:bg-teal-500/20 transition-colors"
                    >
                      <span>+</span> Add Kilometer Split
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-cyan-500/5 border-2 border-cyan-400/30 rounded-xl p-5 shadow-lg">
                <h3 className="text-base font-black text-cyan-600 dark:text-cyan-300 mb-1 uppercase tracking-wide flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                  Performance Analysis
                </h3>
                <p className="text-xs text-cyan-600 dark:text-cyan-300/60 mb-4">How did your pace change during the effort?</p>

                <div className="space-y-4">
                  <div className="bg-neutral-100 dark:bg-neutral-900/50 rounded-lg p-4 border border-cyan-500/20">
                    <label className="text-xs font-bold text-cyan-600 dark:text-cyan-400 mb-2 block uppercase tracking-wider">
                      First Half vs Second Half Pacing
                    </label>
                    <p className="text-xs text-neutral-400 mb-2">
                      <strong>Example:</strong> If your first half averaged 5:00/km and second half averaged 5:30/km, that's +30 seconds slower.
                    </p>
                    <p className="text-xs text-neutral-400 mb-3 italic">
                      Negative number = Faster in 2nd half (speeding up)<br/>
                      Positive number = Slower in 2nd half (slowing down)<br/>
                      Zero = Even pacing throughout
                    </p>
                    <div className="text-center mb-3">
                      <div className="inline-block">
                        <div className={`text-3xl font-black ${paceSplitDifference < 0 ? 'text-green-400' : paceSplitDifference > 0 ? 'text-orange-400' : 'text-cyan-600 dark:text-cyan-400'}`}>
                          {paceSplitDifference > 0 ? '+' : ''}{paceSplitDifference}
                        </div>
                        <div className="text-xs text-cyan-600 dark:text-cyan-400 font-semibold mt-1">seconds per km difference</div>
                      </div>
                    </div>
                    <input
                      type="range"
                      min="-120"
                      max="120"
                      step="1"
                      value={paceSplitDifference}
                      onChange={(e) => onPaceSplitChange(parseInt(e.target.value))}
                      className="w-full h-3 rounded-lg appearance-none cursor-pointer"
                      style={{
                        background: `linear-gradient(to right, #22c55e 0%, #06b6d4 50%, #fb923c 100%)`
                      }}
                    />
                    <div className="flex justify-between text-xs text-neutral-400 mt-2 font-semibold">
                      <span className="text-green-400">Much Faster</span>
                      <span className="text-cyan-600 dark:text-cyan-400">Even</span>
                      <span className="text-orange-400">Much Slower</span>
                    </div>
                  </div>

                  <div className="bg-neutral-100 dark:bg-neutral-900/50 rounded-lg p-3 border border-cyan-500/20">
                    <label className="text-xs font-bold text-cyan-600 dark:text-cyan-400 mb-2 block uppercase tracking-wider">
                      Elevation Gain
                    </label>
                    <div className="flex items-baseline gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={elevationGain || ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          const num = parseInt(val) || 0;
                          if (num <= 2000) {
                            onElevationGainChange(num);
                          }
                        }}
                        className="input-field flex-1 text-xl font-bold text-cyan-600 dark:text-cyan-300 bg-white dark:bg-neutral-950 border-cyan-500/50 focus:border-cyan-400"
                        placeholder="0"
                      />
                      <span className="text-sm font-semibold text-cyan-600 dark:text-cyan-400">meters</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-rose-500/5 border-2 border-rose-400/30 rounded-xl p-5 shadow-lg">
                <h3 className="text-base font-black text-rose-600 dark:text-rose-300 mb-1 uppercase tracking-wide flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse"></span>
                  Heart Rate Data
                </h3>
                <p className="text-xs text-rose-600 dark:text-rose-300/60 mb-4">Optional but recommended for accurate zone calibration</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-neutral-100 dark:bg-neutral-900/50 rounded-lg p-3 border border-rose-500/20">
                    <label className="text-xs font-bold text-rose-600 dark:text-rose-400 mb-2 block uppercase tracking-wider">
                      Starting Heart Rate
                    </label>
                    <p className="text-xs text-neutral-400 mb-2 italic">First few minutes of work segment</p>
                    <div className="flex items-baseline gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={startingHeartRate || ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          const num = parseInt(val) || 0;
                          if (num <= 250) {
                            onStartingHeartRateChange(num);
                          }
                        }}
                        className="input-field flex-1 text-xl font-bold text-rose-600 dark:text-rose-300 bg-white dark:bg-neutral-950 border-rose-500/50 focus:border-rose-400"
                        placeholder="0"
                      />
                      <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">bpm</span>
                    </div>
                  </div>

                  <div className="bg-neutral-100 dark:bg-neutral-900/50 rounded-lg p-3 border border-rose-500/20">
                    <label className="text-xs font-bold text-rose-600 dark:text-rose-400 mb-2 block uppercase tracking-wider">
                      Ending Heart Rate
                    </label>
                    <p className="text-xs text-neutral-400 mb-2 italic">Last few minutes of work segment</p>
                    <div className="flex items-baseline gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={endingHeartRate || ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          const num = parseInt(val) || 0;
                          if (num <= 250) {
                            onEndingHeartRateChange(num);
                          }
                        }}
                        className="input-field flex-1 text-xl font-bold text-rose-600 dark:text-rose-300 bg-white dark:bg-neutral-950 border-rose-500/50 focus:border-rose-400"
                        placeholder="0"
                      />
                      <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">bpm</span>
                    </div>
                  </div>
                </div>

                {calculatedDrift !== 0 && (
                  <div className="mt-3 text-center">
                    <p className="text-xs text-rose-600 dark:text-rose-300/70 font-semibold">
                      Calculated Drift: <span className={`text-lg font-black ${calculatedDrift > 0 ? 'text-orange-400' : 'text-green-400'}`}>
                        {calculatedDrift > 0 ? '+' : ''}{calculatedDrift}
                      </span> bpm
                    </p>
                  </div>
                )}
              </div>

              <div className="bg-blue-500/5 border-2 border-blue-400/30 rounded-xl p-5 shadow-lg">
                <h3 className="text-base font-black text-blue-600 dark:text-blue-300 mb-4 uppercase tracking-wide flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                  Effort Assessment
                  <span className="text-xs bg-blue-500 px-2 py-0.5 rounded text-white font-bold">REQUIRED</span>
                </h3>

                <div className="space-y-4">
                  <div className="bg-neutral-100 dark:bg-neutral-900/50 rounded-lg p-4 border border-blue-500/20">
                    <label className="text-sm font-bold text-blue-600 dark:text-blue-300 mb-4 block">
                      Did you stop or walk at any point during the work segment?
                    </label>
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => onStoppedOrWalkedChange(false)}
                        className={`flex-1 px-6 py-4 rounded-xl font-bold transition-all ${
                          !stoppedOrWalked
                            ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white border-2 border-white/20 shadow-lg'
                            : 'bg-neutral-800 text-neutral-400 border-2 border-neutral-700 hover:border-neutral-600'
                        }`}
                      >
                        <span className="hidden sm:inline">No, Continuous</span>
                        <span className="sm:hidden">No</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onStoppedOrWalkedChange(true)}
                        className={`flex-1 px-6 py-4 rounded-xl font-bold transition-all ${
                          stoppedOrWalked
                            ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white border-2 border-white/20 shadow-lg'
                            : 'bg-neutral-800 text-neutral-400 border-2 border-neutral-700 hover:border-neutral-600'
                        }`}
                      >
                        <span className="hidden sm:inline">Yes, I Stopped/Walked</span>
                        <span className="sm:hidden">Yes</span>
                      </button>
                    </div>
                  </div>

                  <div className="bg-neutral-100 dark:bg-neutral-900/50 rounded-lg p-4 border border-blue-500/20">
                    <label className="text-sm font-bold text-blue-600 dark:text-blue-300 mb-3 block">
                      How even did the effort feel overall?
                    </label>
                    <div className="mb-4">
                      <div className="text-center mb-3">
                        <div className="inline-flex items-center gap-3 px-6 py-3 bg-white dark:bg-neutral-950 rounded-xl border-2 border-blue-400/50">
                          <span className={`text-4xl font-black ${
                            effortConsistency === 0 ? 'text-neutral-600' :
                            effortConsistency <= 3 ? 'text-orange-400' :
                            effortConsistency <= 6 ? 'text-amber-400' :
                            effortConsistency <= 8 ? 'text-cyan-600 dark:text-cyan-400' :
                            'text-green-400'
                          }`}>
                            {effortConsistency === 0 ? '--' : effortConsistency}
                          </span>
                          <span className="text-sm text-blue-600 dark:text-blue-400 font-bold">/ 10</span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        step="1"
                        value={effortConsistency || 5}
                        onChange={(e) => onEffortConsistencyChange(parseInt(e.target.value))}
                        className="w-full h-3 rounded-lg appearance-none cursor-pointer"
                        style={{
                          background: `linear-gradient(to right, #fb923c 0%, #fbbf24 33%, #06b6d4 66%, #22c55e 100%)`
                        }}
                      />
                      <div className="flex justify-between text-xs text-neutral-400 mt-3 font-semibold">
                        <span className="text-orange-400">Very Uneven</span>
                        <span className="text-amber-400">Somewhat Uneven</span>
                        <span className="text-cyan-600 dark:text-cyan-400">Pretty Steady</span>
                        <span className="text-green-400">Very Steady</span>
                      </div>
                    </div>
                    <p className="text-xs text-neutral-500 italic text-center">
                      {effortConsistency === 0 && 'Rate how consistent your effort felt (not pace, but how hard you were working)'}
                      {effortConsistency > 0 && effortConsistency <= 3 && 'Effort felt quite uneven — this tells us about your current fitness level'}
                      {effortConsistency > 3 && effortConsistency <= 6 && 'Some variation in effort — typical for sustained hard efforts'}
                      {effortConsistency > 6 && effortConsistency <= 8 && 'Fairly consistent effort — good aerobic control'}
                      {effortConsistency > 8 && 'Very steady effort — excellent pacing discipline'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-neutral-900/30 border border-neutral-700/50 rounded-xl p-5">
                <label className="text-xs font-bold text-neutral-400 mb-3 block uppercase tracking-wider">
                  Additional Notes (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => onNotesChange(e.target.value)}
                  placeholder="How did the test feel? Weather conditions? Course details? Any observations?"
                  rows={3}
                  className="input-field resize-none text-sm w-full bg-white dark:bg-neutral-950 border-neutral-700 focus:border-neutral-500"
                />
              </div>
            </div>

            {!isValid && (
              <div className="mt-6 p-4 bg-amber-500/10 border-2 border-amber-500/30 rounded-xl">
                <p className="text-sm font-bold text-amber-400 mb-2">Required fields missing:</p>
                <ul className="text-xs text-amber-300/80 space-y-1">
                  {workDuration === 0 && <li>• Work Duration</li>}
                  {workDistance === 0 && <li>• Work Distance</li>}
                  {averagePaceSeconds === 0 && <li>• Average Pace</li>}
                  {effortConsistency === 0 && <li>• Effort Consistency (scroll down to rate)</li>}
                </ul>
              </div>
            )}

            <div className="flex gap-4 mt-8 pt-6 border-t-2 border-teal-500/20">
              <button
                onClick={onClose}
                className="flex-1 px-6 py-4 border-2 border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 rounded-xl hover:border-neutral-400 dark:hover:border-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800/50 transition-all font-bold text-base uppercase tracking-wide"
              >
                Cancel
              </button>
              <button
                onClick={onSubmit}
                disabled={!isValid}
                className={`flex-1 px-6 py-4 rounded-xl font-black transition-all text-base uppercase tracking-wider relative overflow-hidden ${
                  isValid
                    ? 'bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 hover:from-teal-600 hover:via-cyan-600 hover:to-blue-600 text-white shadow-2xl shadow-teal-500/60 border-2 border-white/20'
                    : 'bg-neutral-800 text-neutral-600 cursor-not-allowed border-2 border-neutral-700'
                }`}
              >
                {isValid && (
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"></span>
                )}
                <span className="relative flex items-center justify-center gap-2">
                  <span className="text-2xl">🎯</span>
                  <span className="hidden sm:inline">Complete Calibration Test</span>
                  <span className="sm:hidden">Complete</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
