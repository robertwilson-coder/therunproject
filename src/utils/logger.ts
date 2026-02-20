/**
 * Development-only logger utility
 * In production, errors are silently handled or sent to error tracking service
 */

const isDevelopment = import.meta.env.DEV;

export const logger = {
  error: (message: string, error?: unknown) => {
    if (isDevelopment) {
      console.error(message, error);
    }
    // In production, this could send to an error tracking service like Sentry
  },

  warn: (message: string, data?: unknown) => {
    if (isDevelopment) {
      console.warn(message, data);
    }
  },

  info: (message: string, data?: unknown) => {
    if (isDevelopment) {
      console.log(message, data);
    }
  }
};
