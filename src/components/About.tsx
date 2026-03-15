import { ArrowLeft, Shield, Users, Lock } from 'lucide-react';

interface AboutProps {
  onClose: () => void;
}

export function About({ onClose }: AboutProps) {
  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <div className="fixed inset-0 -z-10 bg-white dark:bg-neutral-950"></div>

      <div className="container mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
        <button
          onClick={onClose}
          className="mb-12 inline-flex items-center gap-2 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors group"
        >
          <ArrowLeft className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
          <span className="font-medium">Back</span>
        </button>

        <div className="space-y-16">

          {/* Hero */}
          <header className="space-y-4">
            <h1 className="text-4xl md:text-5xl font-bold text-neutral-900 dark:text-white tracking-tight leading-tight">
              Real life changes.
            </h1>
            <h2 className="text-4xl md:text-5xl font-bold text-neutral-900 dark:text-white tracking-tight leading-tight">
              Your progression continues.
            </h2>
            <p className="text-lg text-neutral-600 dark:text-neutral-400 pt-2">
              With TheRunProject, when your week shifts, your training adapts intelligently.
            </p>
          </header>

          {/* Divider */}
          <div className="h-px bg-neutral-200 dark:bg-neutral-800" />

          {/* How it Works */}
          <section className="space-y-8">
            <p className="text-neutral-600 dark:text-neutral-400">
              You open the coach chat.
            </p>

            <ul className="space-y-2 pl-1">
              {[
                'Move a session.',
                'Reduce load.',
                'Adjust intensity.',
                'Reschedule a long run.',
                'Rework a week around travel.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
                  <span className="text-neutral-700 dark:text-neutral-300">{item}</span>
                </li>
              ))}
            </ul>

            <p className="text-neutral-600 dark:text-neutral-400">
              The coach evaluates the impact on recovery, load spacing, and race alignment, and works with you to apply the smartest solution.
            </p>

            <div className="space-y-1 pt-2">
              <p className="font-semibold text-neutral-900 dark:text-white">No guessing.</p>
              <p className="font-semibold text-neutral-900 dark:text-white">No accidental overload.</p>
              <p className="font-semibold text-neutral-900 dark:text-white">No derailing your progress.</p>
            </div>
          </section>

          {/* Divider */}
          <div className="h-px bg-neutral-200 dark:bg-neutral-800" />

          {/* Why This Matters */}
          <section className="space-y-6">
            <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 dark:text-white">
              Why This Matters
            </h2>
            <p className="text-neutral-600 dark:text-neutral-400">
              Most plans are static.
            </p>
            <p className="text-neutral-600 dark:text-neutral-400">
              Miss a key session and structure unravels. Shift a week and progression loses shape. So you improvise — and improvisation quietly stalls performance.
            </p>
            <p className="text-neutral-600 dark:text-neutral-400">
              TheRunProject keeps your structure intact by protecting:
            </p>
            <ul className="space-y-3 pl-1">
              {['Load trajectory', 'Recovery spacing', 'Periodization flow', 'Race alignment'].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                  <span className="text-neutral-700 dark:text-neutral-300 font-medium">{item}</span>
                </li>
              ))}
            </ul>
            <div className="space-y-1 pt-2">
              <p className="text-neutral-600 dark:text-neutral-400">Life moves.</p>
              <p className="text-neutral-600 dark:text-neutral-400">Your progress continues.</p>
            </div>
          </section>

          {/* Divider */}
          <div className="h-px bg-neutral-200 dark:bg-neutral-800" />

          {/* Single Payment Solution */}
          <section className="space-y-6">
            <h2 className="text-2xl md:text-3xl font-bold text-neutral-900 dark:text-white">
              Single Payment Solution
            </h2>
            <div className="grid grid-cols-3 gap-4">
              {[
                { icon: Lock, label: 'No subscriptions.' },
                { icon: Shield, label: 'No locked features.' },
                { icon: Users, label: 'No tiers.' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 text-center space-y-3">
                  <div className="w-9 h-9 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mx-auto">
                    <Icon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</p>
                </div>
              ))}
            </div>
            <p className="text-neutral-600 dark:text-neutral-400">
              Create it. Modify it. Keep it.
            </p>
            <p className="text-neutral-600 dark:text-neutral-400">
              Built for runners who care about long-term progression — not app engagement metrics.
            </p>
          </section>

          {/* CTA */}
          <section className="bg-neutral-900 dark:bg-neutral-800 rounded-2xl p-8 md:p-10 text-center space-y-4">
            <p className="text-neutral-400 text-sm font-medium uppercase tracking-widest">
              The Run Project
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-white leading-snug">
              Life shifts.<br />Your trajectory holds.
            </h2>
            <p className="text-neutral-400">
              Build your plan. Protect your momentum.
            </p>
            <div className="pt-2">
              <button
                onClick={onClose}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-8 py-3.5 rounded-xl font-semibold text-base transition-all duration-200 hover:scale-105 active:scale-95"
              >
                Get Started
              </button>
            </div>
          </section>

          <footer className="text-center text-sm text-neutral-500 dark:text-neutral-500 pt-4 border-t border-neutral-200 dark:border-neutral-800">
            <p>Currently in private development.</p>
          </footer>

        </div>
      </div>
    </div>
  );
}
