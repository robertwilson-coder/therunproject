/**
 * Input validation utilities for edge functions
 */

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
