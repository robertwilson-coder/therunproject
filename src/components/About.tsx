import { ArrowLeft, Target, Brain, Calendar, MessageSquare, Trophy, Zap } from 'lucide-react';

interface AboutProps {
  onClose: () => void;
}

export function About({ onClose }: AboutProps) {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="fixed inset-0 -z-10 bg-white dark:bg-neutral-950"></div>

      <div className="container mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-12">
        <button
          onClick={onClose}
          className="mb-8 inline-flex items-center gap-2 text-neutral-600 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors group"
        >
          <ArrowLeft className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
          <span className="font-medium">Back</span>
        </button>

        <div className="space-y-12">
          <header className="text-center space-y-4">
            <h1 className="text-5xl md:text-6xl font-bold text-neutral-900 dark:text-white tracking-tight">
              About The Run Project
            </h1>
            <p className="text-xl md:text-2xl text-blue-700 dark:text-blue-300 font-semibold max-w-2xl mx-auto">
              Intelligent training for runners who already know what they're doing
            </p>
          </header>

          <section className="bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-neutral-900 rounded-2xl p-8 md:p-10 shadow-soft border border-blue-100 dark:border-blue-900/30">
            <p className="text-lg text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
              The Run Project is built for intermediate to advanced runners who understand training principles and want structure that adapts to real life.
            </p>
            <p className="text-lg text-neutral-700 dark:text-neutral-300 leading-relaxed mb-4">
              If you already speak the language of tempo runs, intervals, progressive overload, recovery weeks, and race cycles—this is for you.
            </p>
            <p className="text-lg font-semibold text-neutral-900 dark:text-white leading-relaxed mb-2">
              This isn't a beginner program.
            </p>
            <p className="text-lg font-semibold text-neutral-900 dark:text-white leading-relaxed">
              It's a serious training tool for serious runners.
            </p>
          </section>

          <section className="space-y-6">
            <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 dark:text-white">
              Built for Runners Who Mean Business
            </h2>
            <p className="text-lg text-neutral-700 dark:text-neutral-300 leading-relaxed">
              You don't need motivational quotes.<br />
              You need intelligent programming.
            </p>
            <p className="text-lg text-neutral-700 dark:text-neutral-300 leading-relaxed">
              The Run Project respects your experience. It gives you structure, progression, and flexibility — without dumbing anything down.
            </p>
            <p className="text-lg text-neutral-700 dark:text-neutral-300 leading-relaxed">
              You stay in control. The system works with you.
            </p>
          </section>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 shadow-soft border border-neutral-200 dark:border-neutral-800">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-4">
                <Brain className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-3">
                AI-Powered Coaching
              </h3>
              <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-3">
                Your training plan isn't static. You can talk to it.
              </p>
              <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                Move workouts. Adjust intensity. Navigate injury niggles. Handle travel, work stress, missed sessions.
              </p>
              <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mt-3">
                The plan adapts intelligently while preserving training integrity — so small life changes don't derail long-term progression.
              </p>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 shadow-soft border border-neutral-200 dark:border-neutral-800">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-4">
                <Calendar className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-3">
                Real Flexibility (Without Breaking the Plan)
              </h3>
              <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-2">
                Life happens. Training should respond — not collapse.
              </p>
              <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                A busy week doesn't mean throwing away structure.<br />
                A missed workout doesn't mean guesswork.<br />
                An injury doesn't mean starting from scratch.
              </p>
              <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mt-3">
                The Run Project recalibrates intelligently, keeping your overall progression intact.
              </p>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 shadow-soft border border-neutral-200 dark:border-neutral-800">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-4">
                <Target className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-3">
                Personalized Structure
              </h3>
              <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-2">
                Your training history, goals, and constraints shape the plan.
              </p>
              <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                No generic templates.<br />
                No mass-produced schedules.<br />
                No "one size fits all" PDFs.
              </p>
              <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mt-3">
                Every plan is built with purpose — and built to evolve.
              </p>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 shadow-soft border border-neutral-200 dark:border-neutral-800">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-4">
                <MessageSquare className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-3">
                Smart Conversations
              </h3>
              <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-3">
                Ask why a workout exists.<br />
                Discuss pacing strategy.<br />
                Adjust your plan intelligently.<br />
                Refine race goals.
              </p>
              <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-2">
                This isn't a chatbot.<br />
                It's structured coaching logic built on real training principles.
              </p>
              <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                It responds with context — not canned replies.
              </p>
            </div>
          </div>

          <section className="bg-neutral-50 dark:bg-neutral-900/50 rounded-xl p-8 border border-neutral-200 dark:border-neutral-800">
            <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 dark:text-white mb-6 flex items-center gap-3">
              <Trophy className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              What Makes This Different
            </h2>
            <div className="space-y-6">
              <div className="flex gap-4">
                <Zap className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-lg text-neutral-900 dark:text-white mb-2">
                    No Subscriptions. No Upsells.
                  </h3>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-2">
                    Create your plan. Own it. Modify it.
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    There are no premium tiers or locked features. The goal isn't to extract monthly fees — it's to build a tool that runners actually trust.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <Zap className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-lg text-neutral-900 dark:text-white mb-2">
                    Built by a Runner, for Runners
                  </h3>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-2">
                    This wasn't built by a startup chasing growth metrics.
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-2">
                    It was built by someone who has:
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed pl-4">
                    • come back from injury<br />
                    • balanced training with life chaos<br />
                    • stood on start lines uncertain<br />
                    • crossed finish lines proud
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mt-2">
                    It solves the problems real runners actually face.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <Zap className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-lg text-neutral-900 dark:text-white mb-2">
                    Respects Your Intelligence
                  </h3>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-2">
                    You already understand training.
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-2">
                    You don't need:
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed pl-4 mb-2">
                    • daily streak badges<br />
                    • motivational clichés<br />
                    • gamified distractions
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mb-2">
                    You need:
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed pl-4">
                    • clarity<br />
                    • structure<br />
                    • intelligent adaptation
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300 leading-relaxed mt-2">
                    That's what this is.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="text-center bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 rounded-2xl p-8 md:p-10 text-white shadow-lg">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to Train Smarter?
            </h2>
            <p className="text-lg md:text-xl mb-6 text-blue-50 max-w-2xl mx-auto">
              Create your first plan in minutes and experience adaptive training built for experienced runners.
            </p>
            <button
              onClick={onClose}
              className="inline-flex items-center gap-2 bg-white text-blue-700 px-8 py-4 rounded-xl font-semibold text-lg hover:bg-blue-50 transition-all duration-300 hover:scale-105 active:scale-95 shadow-xl"
            >
              Get Started
            </button>
          </section>

          <footer className="text-center text-sm text-neutral-600 dark:text-neutral-400 pt-8 border-t border-neutral-200 dark:border-neutral-800">
            <p className="mb-1">
              Currently in private development.
            </p>
            <p>
              Built carefully and deliberately.
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
}
