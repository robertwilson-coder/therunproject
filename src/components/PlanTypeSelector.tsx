import { Zap, Calendar, Loader2, CheckCircle, ChevronDown } from 'lucide-react';
import { useState } from 'react';

interface PlanTypeSelectorProps {
  onSelectType: (type: 'static' | 'responsive') => void;
  isLoading: boolean;
  answers: any;
}

export function PlanTypeSelector({ onSelectType, isLoading, answers }: PlanTypeSelectorProps) {
  const [expandedPlan, setExpandedPlan] = useState<'static' | 'responsive' | null>(null);

  const handleSelectType = (type: 'static' | 'responsive') => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    onSelectType(type);
  };

  return (
    <div className="max-w-5xl mx-auto">
      {isLoading ? (
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-8 mb-8">
            <Loader2 className="w-12 h-12 text-brand-blue animate-spin mx-auto mb-4" />
            <p className="text-brand-blue text-lg font-semibold mb-2">Creating your personalized training plan...</p>
            <p className="text-gray-400 text-sm">This may take up to 2 minutes. Please don't close this page.</p>
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-24 rounded-lg"></div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-blue bg-opacity-20 rounded-full mb-4">
              <CheckCircle className="w-10 h-10 text-brand-blue" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-3">Great! Now Choose Your Plan Style</h1>
            <p className="text-lg text-gray-300 max-w-2xl mx-auto">
              Based on your profile, we can create two different types of training plans. Pick the one that matches your training philosophy.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 mb-8">
            <div className="bg-dark-gray border-2 border-border-gray rounded-xl overflow-hidden hover:border-brand-blue transition-all duration-300">
              <button
                onClick={() => setExpandedPlan(expandedPlan === 'static' ? null : 'static')}
                className="w-full text-left p-8"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-brand-blue bg-opacity-10 rounded-lg transition-all">
                    <Calendar className="w-8 h-8 text-brand-blue" />
                  </div>
                  <h2 className="text-2xl font-bold text-white">Static Plan</h2>
                  <ChevronDown className={`w-6 h-6 text-gray-400 ml-auto transition-transform ${expandedPlan === 'static' ? 'rotate-180' : ''}`} />
                </div>

                <p className="text-gray-300 leading-relaxed text-base">
                  A structured training plan laid out week by week. Your complete roadmap is created upfront based on your goals and experience.
                </p>
              </button>

              {expandedPlan === 'static' && (
                <div className="px-8 pb-8">
                  <div className="space-y-4 mb-6">
                    <div>
                      <h3 className="font-bold text-white mb-2">For those looking for:</h3>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 bg-brand-blue rounded-full mt-2"></div>
                          <p className="text-sm text-gray-300">Progressive weekly structure</p>
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 bg-brand-blue rounded-full mt-2"></div>
                          <p className="text-sm text-gray-300">Fixed training days</p>
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 bg-brand-blue rounded-full mt-2"></div>
                          <p className="text-sm text-gray-300">Add paces before starting</p>
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 bg-brand-blue rounded-full mt-2"></div>
                          <p className="text-sm text-gray-300">Complete plan from day one</p>
                        </li>
                      </ul>
                    </div>
                  </div>

                  <button
                    onClick={() => handleSelectType('static')}
                    className="w-full px-4 py-3 bg-brand-blue text-white rounded-lg font-bold text-center hover:bg-blue-600 transition-all"
                  >
                    Generate Static Plan
                  </button>
                </div>
              )}
            </div>

            <div className="bg-dark-gray border-2 border-border-gray rounded-xl overflow-hidden hover:border-brand-pink transition-all duration-300">
              <button
                onClick={() => setExpandedPlan(expandedPlan === 'responsive' ? null : 'responsive')}
                className="w-full text-left p-8"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-brand-pink bg-opacity-10 rounded-lg transition-all">
                    <Zap className="w-8 h-8 text-brand-pink" />
                  </div>
                  <h2 className="text-2xl font-bold text-white">Responsive Plan</h2>
                  <ChevronDown className={`w-6 h-6 text-gray-400 ml-auto transition-transform ${expandedPlan === 'responsive' ? 'rotate-180' : ''}`} />
                </div>

                <p className="text-gray-300 leading-relaxed text-base">
                  A dynamic plan that evolves with you. Make significant changes throughout your training using our coach chat.
                </p>
              </button>

              {expandedPlan === 'responsive' && (
                <div className="px-8 pb-8">
                  <div className="space-y-4 mb-6">
                    <div>
                      <h3 className="font-bold text-white mb-2">For those looking for:</h3>
                      <ul className="space-y-2">
                        <li className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 bg-brand-pink rounded-full mt-2"></div>
                          <p className="text-sm text-gray-300">A plan that adjusts to your life</p>
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 bg-brand-pink rounded-full mt-2"></div>
                          <p className="text-sm text-gray-300">Add/adjust training paces</p>
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 bg-brand-pink rounded-full mt-2"></div>
                          <p className="text-sm text-gray-300">Move days, adapt for injury</p>
                        </li>
                        <li className="flex items-start gap-2">
                          <div className="w-1.5 h-1.5 bg-brand-pink rounded-full mt-2"></div>
                          <p className="text-sm text-gray-300">A plan that builds on your progress</p>
                        </li>
                      </ul>
                    </div>
                  </div>

                  <button
                    onClick={() => handleSelectType('responsive')}
                    className="w-full px-4 py-3 bg-brand-pink text-white rounded-lg font-bold text-center hover:bg-pink-600 transition-all"
                  >
                    Generate Responsive Plan
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="bg-dark-gray border-2 border-border-gray rounded-lg p-6">
            <h3 className="font-bold text-white mb-3 text-center">Both Plans Include:</h3>
            <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-300">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-brand-blue flex-shrink-0" />
                <span>Personalized weekly schedules</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-brand-blue flex-shrink-0" />
                <span>RPE guidance for every workout</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-brand-blue flex-shrink-0" />
                <span>Expert coaching notes</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-brand-blue flex-shrink-0" />
                <span>Race day preparation</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
