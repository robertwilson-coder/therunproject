import { Award, Trophy, Flame, Target, Calendar, Zap, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: string;
}

interface BadgeCelebrationProps {
  badges: Badge[];
  onClose: () => void;
}

export function BadgeCelebration({ badges, onClose }: BadgeCelebrationProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setIsVisible(true), 100);
  }, []);

  const getIconComponent = (iconName: string) => {
    const icons: { [key: string]: any } = {
      target: Target,
      calendar: Calendar,
      flame: Flame,
      trophy: Trophy,
      zap: Zap,
      award: Award,
    };
    return icons[iconName] || Trophy;
  };

  const getIconForBadge = (badge: Badge) => {
    if (badge.id.includes('streak')) return 'flame';
    if (badge.id === 'first_workout') return 'target';
    if (badge.id === 'week_warrior') return 'calendar';
    if (badge.id === 'streak_master') return 'zap';
    return 'trophy';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
      <div
        className={`bg-gradient-to-br from-yellow-50 via-white to-orange-50 dark:from-gray-800 dark:via-gray-900 dark:to-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border-4 border-yellow-400 dark:border-yellow-600 transform transition-all duration-500 ${
          isVisible ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
        }`}
      >
        <div className="relative p-8">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            aria-label="Close badge celebration"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="flex justify-center mb-6">
            <div className="relative">
              <Sparkles className="w-16 h-16 text-yellow-500" />
            </div>
          </div>

          <h2 className="text-3xl font-bold text-center mb-2 text-gray-900 dark:text-white">
            {badges.length === 1 ? 'Achievement Unlocked!' : 'Achievements Unlocked!'}
          </h2>
          <p className="text-center text-gray-600 dark:text-gray-300 mb-6">
            Congratulations on your progress!
          </p>

          <div className="space-y-4">
            {badges.map((badge, index) => {
              const Icon = getIconComponent(getIconForBadge(badge));
              return (
                <div
                  key={badge.id}
                  className="bg-gradient-to-br from-yellow-100 to-orange-100 dark:from-gray-700 dark:to-gray-600 rounded-xl p-4 border-2 border-yellow-300 dark:border-yellow-600 transform transition-all duration-300 hover:scale-105"
                  style={{
                    animation: `slideIn 0.5s ease-out ${index * 0.2}s both`,
                  }}
                >
                  <div className="flex items-center gap-4">
                    <div className="bg-gradient-to-br from-yellow-400 to-orange-500 p-4 rounded-xl shadow-lg">
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-gray-900 dark:text-white">{badge.name}</h3>
                      <p className="text-sm text-gray-700 dark:text-gray-300">{badge.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex justify-center">
            <button
              onClick={onClose}
              className="px-6 py-3 bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all"
              aria-label="Close badge celebration"
            >
              Awesome!
            </button>
          </div>
        </div>

        <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 bg-yellow-400 rounded-full animate-float"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${2 + Math.random() * 3}s`,
              }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(-100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          50% {
            transform: translateY(-100px) rotate(180deg);
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translateY(-200px) rotate(360deg);
            opacity: 0;
          }
        }

        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
