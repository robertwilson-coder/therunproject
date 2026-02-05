/**
 * User-friendly error messages
 * Maps technical errors to helpful messages users can understand and act on
 */

export const ErrorMessages = {
  // Network errors
  NETWORK_ERROR: 'Unable to connect. Please check your internet connection and try again.',
  TIMEOUT_ERROR: 'The request took too long. Please try again.',

  // Authentication errors
  AUTH_REQUIRED: 'Please sign in to continue.',
  AUTH_SESSION_EXPIRED: 'Your session has expired. Please sign in again.',
  AUTH_INVALID_CREDENTIALS: 'The email or password you entered is incorrect.',
  AUTH_EMAIL_EXISTS: 'An account with this email already exists.',
  AUTH_WEAK_PASSWORD: 'Please choose a stronger password (at least 6 characters).',

  // Training plan errors
  PLAN_LOAD_ERROR: 'Unable to load your training plan. Please try again.',
  PLAN_SAVE_ERROR: 'Unable to save your training plan. Your changes may not have been saved.',
  PLAN_GENERATE_ERROR: 'Unable to generate training plan. Please check your answers and try again.',
  PLAN_UPDATE_ERROR: 'Unable to update your plan. Please try again.',

  // Workout errors
  WORKOUT_COMPLETE_ERROR: 'Unable to mark workout as complete. Please try again.',
  WORKOUT_NOTE_SAVE_ERROR: 'Unable to save your workout notes. Please try again.',
  WORKOUT_LOAD_ERROR: 'Unable to load workout details. Please refresh the page.',

  // Chat errors
  CHAT_ERROR: 'Unable to process your message. Please try rephrasing or try again later.',
  CHAT_INVALID_REQUEST: 'Please be more specific with your request. For example: "Move my Thursday run to Friday"',

  // Garmin integration errors
  GARMIN_CONNECTION_ERROR: 'Unable to connect to Garmin. Please try again later.',
  GARMIN_SYNC_ERROR: 'Unable to sync with Garmin. Please check your connection and try again.',
  GARMIN_DISCONNECT_ERROR: 'Unable to disconnect from Garmin. Please try again.',

  // Reminder errors
  REMINDER_SAVE_ERROR: 'Unable to save reminder. Please try again.',
  REMINDER_DELETE_ERROR: 'Unable to delete reminder. Please try again.',

  // Data errors
  DATA_LOAD_ERROR: 'Unable to load data. Please refresh the page.',
  DATA_SAVE_ERROR: 'Unable to save changes. Please try again.',

  // Validation errors
  INVALID_INPUT: 'Please check your input and try again.',
  INVALID_DATE: 'Please enter a valid date.',
  INVALID_NUMBER: 'Please enter a valid number.',
  REQUIRED_FIELD: 'This field is required.',

  // Generic fallback
  UNKNOWN_ERROR: 'Something went wrong. Please try again later.',
} as const;

/**
 * Gets a user-friendly error message from an error object
 */
export function getUserFriendlyError(error: unknown): string {
  if (!error) return ErrorMessages.UNKNOWN_ERROR;

  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    // Check for specific error patterns
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('fetch')) {
      return ErrorMessages.NETWORK_ERROR;
    }

    if (message.includes('timeout')) {
      return ErrorMessages.TIMEOUT_ERROR;
    }

    if (message.includes('unauthorized') || message.includes('auth')) {
      return ErrorMessages.AUTH_REQUIRED;
    }

    if (message.includes('session')) {
      return ErrorMessages.AUTH_SESSION_EXPIRED;
    }

    // Return the original message if it's user-friendly (doesn't contain technical terms)
    if (!message.includes('null') &&
        !message.includes('undefined') &&
        !message.includes('object') &&
        message.length < 100) {
      return error.message;
    }
  }

  return ErrorMessages.UNKNOWN_ERROR;
}

/**
 * Checks if an error is a network/connectivity error
 */
export function isNetworkError(error: unknown): boolean {
  if (!error) return false;

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('network') ||
         message.includes('fetch') ||
         message.includes('connection') ||
         message.includes('timeout');
}
