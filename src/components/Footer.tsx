declare global {
  interface Window {
    _iub?: {
      cs?: {
        api?: {
          openPreferences: () => void;
        };
      };
    };
  }
}

export function Footer() {
  const handlePrivacyChoices = () => {
    if (typeof window !== 'undefined' && window._iub?.cs?.api) {
      window._iub.cs.api.openPreferences();
    }
  };

  return (
    <footer className="mt-16 pt-8 pb-8 border-t border-neutral-200 dark:border-neutral-800">
      <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-neutral-600 dark:text-neutral-400">
          <a
            href="https://www.iubenda.com/privacy-policy/14222196"
            className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors underline-offset-4 hover:underline"
            title="Privacy Policy"
          >
            Privacy Policy
          </a>
          <span className="hidden sm:inline text-neutral-400 dark:text-neutral-600">|</span>
          <a
            href="https://www.iubenda.com/privacy-policy/71218950/cookie-policy"
            className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors underline-offset-4 hover:underline"
            title="Cookie Policy"
          >
            Cookie Policy
          </a>
          <span className="hidden sm:inline text-neutral-400 dark:text-neutral-600">|</span>
          <button
            onClick={handlePrivacyChoices}
            className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors underline-offset-4 hover:underline"
            title="Privacy Choices"
          >
            Privacy Choices
          </button>
        </div>
      </div>
    </footer>
  );
}
