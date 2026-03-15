/**
 * Input validation utilities for edge functions
 */

/**
 * Interval safety guard.
 * Rejects interval prescriptions with impossible rep distances or counts.
 *
 * Rules:
 *   rep distance ≤ 5 km
 *   rep count    ≤ 12
 *
 * Any workout violating these rules throws invalid_interval_prescription.
 * Workouts that pass validation are returned unchanged.
 */
const _INTERVAL_REP_RE = /(\d+)\s*[×x]\s*(\d+(?:\.\d+)?)\s*km/gi;

export function validateIntervalPrescription(workout: string): void {
  if (!workout || workout.toLowerCase().trim() === 'rest') return;
  _INTERVAL_REP_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = _INTERVAL_REP_RE.exec(workout)) !== null) {
    const repCount = parseInt(match[1], 10);
    const repDistanceKm = parseFloat(match[2]);
    if (repDistanceKm > 5 || repCount > 12) {
      throw new Error(
        `invalid_interval_prescription: "${match[0]}" — rep distance ${repDistanceKm} km (max 5 km) or rep count ${repCount} (max 12)`
      );
    }
  }
}

export function sanitizeIntervalWorkout(workout: string): string {
  if (!workout || workout.toLowerCase().trim() === 'rest') return workout;
  _INTERVAL_REP_RE.lastIndex = 0;
  return workout.replace(_INTERVAL_REP_RE, (match, repCountStr: string, repKmStr: string) => {
    const repCount = parseInt(repCountStr, 10);
    const repDistanceKm = parseFloat(repKmStr);
    if (repDistanceKm > 5 || repCount > 12) {
      const totalKm = Math.round(repCount * repDistanceKm);
      console.error(`[IntervalGuard] Rejected "${match}" — rep distance ${repDistanceKm} km > 5 km cap or rep count ${repCount} > 12. Converting to ${totalKm} km tempo run.`);
      return `${totalKm} km tempo run`;
    }
    return match;
  });
}

/**
 * Apply sanitizeIntervalWorkout to every workout string in a day-based plan array.
 */
export function sanitizePlanWorkouts(days: Array<{ workout?: string; [key: string]: unknown }>): void {
  for (const day of days) {
    if (day.workout) {
      day.workout = sanitizeIntervalWorkout(day.workout);
    }
  }
}

/**
 * Sanitizes text input by removing potentially dangerous content
 */
export function sanitizeText(input: string): string {
  if (!input) return '';

  // Remove HTML tags
  let sanitized = input.replace(/<[^>]*>/g, '');

  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, '');

  // Remove data: protocol
  sanitized = sanitized.replace(/data:/gi, '');

  // Remove event handlers
  sanitized = sanitized.replace(/on\w+\s*=/gi, '');

  return sanitized.trim();
}

/**
 * Validates email format
 */
export function validateEmail(email: string): boolean {
  if (!email) return false;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email);
}

/**
 * Validates number is within range
 */
export function validateNumber(value: number, min: number, max: number): boolean {
  const num = Number(value);
  return !isNaN(num) && num >= min && num <= max;
}

/**
 * Validates required fields are present
 */
export function validateRequired(data: Record<string, any>, fields: string[]): { valid: boolean; missing: string[] } {
  const missing = fields.filter(field => !data[field]);
  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * Validates string length
 */
export function validateLength(str: string, min: number, max: number): boolean {
  if (!str) return false;
  const length = str.length;
  return length >= min && length <= max;
}

/**
 * Creates validation error response
 */
export function validationErrorResponse(message: string, details?: any): Response {
  return new Response(
    JSON.stringify({
      error: 'Validation error',
      message,
      details
    }),
    {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}
