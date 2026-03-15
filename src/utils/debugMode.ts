/**
 * Debug Mode Utility
 *
 * Controls whether debug panels and diagnostic tools are enabled.
 * Debug mode is ONLY available in development builds and can be toggled
 * via localStorage for convenience during development.
 *
 * Usage:
 *   - In dev: run `localStorage.setItem('enableDebugPanel', 'true')` in console
 *   - To disable: `localStorage.removeItem('enableDebugPanel')`
 *   - In production: always disabled, regardless of localStorage
 */

/**
 * Check if debug mode is enabled.
 *
 * Returns true ONLY if:
 * 1. Running in development environment (NODE_ENV !== 'production')
 * 2. AND localStorage flag is explicitly set
 *
 * This ensures debug panels never appear in production builds.
 */
export function isDebugModeEnabled(): boolean {
  // Always disabled in production
  if (import.meta.env.PROD) {
    return false;
  }

  // In development, check localStorage flag
  try {
    return localStorage.getItem('enableDebugPanel') === 'true';
  } catch {
    // If localStorage access fails, default to disabled
    return false;
  }
}

/**
 * Enable debug mode (development only).
 * Has no effect in production builds.
 */
export function enableDebugMode(): void {
  if (import.meta.env.DEV) {
    localStorage.setItem('enableDebugPanel', 'true');
    console.log('[Debug Mode] Enabled. Refresh the page to see debug panels.');
  }
}

/**
 * Disable debug mode.
 */
export function disableDebugMode(): void {
  localStorage.removeItem('enableDebugPanel');
  console.log('[Debug Mode] Disabled. Refresh the page to hide debug panels.');
}

// Expose utilities to window for easy console access (dev only)
if (import.meta.env.DEV) {
  (window as any).debugMode = {
    enable: enableDebugMode,
    disable: disableDebugMode,
    isEnabled: isDebugModeEnabled
  };
}
