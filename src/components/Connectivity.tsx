import { X } from 'lucide-react';

interface ConnectivityProps {
  onClose: () => void;
}

export function Connectivity({ onClose }: ConnectivityProps) {
  const connectivityOptions = [
    {
      name: 'Garmin Connect',
      description: 'Sync workouts to your Garmin watch and import activities',
      logo: (
        <div className="w-12 h-12 bg-sky-500 rounded-lg flex items-center justify-center text-white font-bold text-xl">
          G
        </div>
      ),
      onClick: () => {},
      inDevelopment: true,
    },
    {
      name: 'TrainingPeaks',
      description: 'Export your training plan to TrainingPeaks',
      logo: (
        <div className="w-12 h-12 bg-orange-500 rounded-lg flex items-center justify-center text-white font-bold text-xl">
          TP
        </div>
      ),
      onClick: () => {},
      inDevelopment: true,
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="connectivity-title">
      <div className="bg-white dark:bg-neutral-900 border-2 border-neutral-200 dark:border-neutral-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden animate-scale-in">
        <div className="p-6 border-b-2 border-neutral-200 dark:border-neutral-800 sticky top-0 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 id="connectivity-title" className="text-2xl font-bold text-gray-800 dark:text-white">Connectivity</h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                Connect your training plan to external platforms
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md"
              aria-label="Close connectivity dialog"
            >
              <X className="w-6 h-6" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-120px)]">
          {connectivityOptions.map((option, index) => (
            <button
              key={index}
              onClick={option.onClick}
              className="w-full flex items-center gap-4 p-5 card text-left group hover:border-primary-500 active:scale-[0.98] transition-all"
              aria-label={`${option.name}: ${option.description}${option.inDevelopment ? ' (In Development)' : ''}`}
            >
              <div aria-hidden="true">{option.logo}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-lg text-neutral-900 dark:text-white">
                    {option.name}
                  </h3>
                  {option.inDevelopment && (
                    <span className="text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full font-medium" aria-label="In development">
                      In Development
                    </span>
                  )}
                </div>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  {option.description}
                </p>
              </div>
              <div className="text-neutral-400 dark:text-neutral-600 group-hover:text-primary-500 transition-colors" aria-hidden="true">
                →
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
