import { X, Check } from 'lucide-react';

interface WorkoutCelebrationModalProps {
  celebrationMessage: {
    title: string;
    message: string;
  };
  onClose: () => void;
}

function formatMessage(message: string) {
  const sections = message.split('\n\n');

  return sections.map((section, sectionIndex) => {
    const lines = section.split('\n');

    return (
      <div key={sectionIndex} className={sectionIndex > 0 ? 'mt-8' : ''}>
        {lines.map((line, lineIndex) => {
          if (line.startsWith('**') && line.endsWith(':**')) {
            return (
              <h3 key={lineIndex} className="text-xl font-black text-teal-600 dark:text-teal-300 mt-4 first:mt-0 uppercase tracking-wide">
                {line.replace(/\*\*/g, '').replace(':', '')}
              </h3>
            );
          }

          if (line.startsWith('• ')) {
            const content = line.substring(2);
            const formattedContent = content.replace(/\*\*(.*?)\*\*/g, '<strong class="text-neutral-900 dark:text-white font-extrabold">$1</strong>');

            return (
              <div key={lineIndex} className="flex items-start gap-3 mb-3">
                <span className="text-teal-600 dark:text-teal-400 mt-1 font-bold">•</span>
                <p className="text-neutral-700 dark:text-neutral-100 text-base leading-relaxed flex-1" dangerouslySetInnerHTML={{ __html: formattedContent }} />
              </div>
            );
          }

          if (line.trim() === '') return null;

          const formattedLine = line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-neutral-900 dark:text-white font-extrabold">$1</strong>');
          return (
            <p key={lineIndex} className="text-neutral-700 dark:text-neutral-100 text-base leading-relaxed mb-3" dangerouslySetInnerHTML={{ __html: formattedLine }} />
          );
        })}
      </div>
    );
  });
}

export function WorkoutCelebrationModal({ celebrationMessage, onClose }: WorkoutCelebrationModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in"
    >
      <div
        className="card-premium w-full max-w-2xl max-h-[90vh] rounded-xl p-6 relative overflow-hidden animate-scale-in border-2 border-teal-400/50 shadow-2xl shadow-teal-500/30 flex flex-col"
      >
        {/* Animated background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-teal-500/20 via-cyan-500/20 to-blue-500/20 animate-pulse" />

        {/* Confetti effect */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-teal-400 dark:bg-teal-400 rounded-full animate-confetti"
              style={{
                left: `${Math.random() * 100}%`,
                top: '-10px',
                animationDelay: `${Math.random() * 0.5}s`,
                animationDuration: `${2 + Math.random() * 2}s`,
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full">
          <button
            onClick={onClose}
            className="absolute top-0 right-0 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors z-20"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="text-center mb-6 pt-4">
            <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-teal-400 to-cyan-400 rounded-full flex items-center justify-center animate-bounce-slow shadow-lg shadow-teal-500/50">
              <Check className="w-10 h-10 text-white stroke-[3]" />
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-neutral-900 dark:text-white mb-2 drop-shadow-lg">
              {celebrationMessage.title}
            </h2>
          </div>

          <div className="bg-white/90 dark:bg-neutral-950/90 rounded-xl p-6 md:p-8 border-2 border-teal-500/50 flex-1 overflow-y-auto shadow-inner mb-6">
            <div className="text-left">
              {formatMessage(celebrationMessage.message)}
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white py-4 rounded-xl text-lg font-bold shadow-lg shadow-teal-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-teal-500/50 hover:scale-[1.02]"
          >
            Keep Going!
          </button>
        </div>
      </div>
    </div>
  );
}
