/**
 * Input sanitization utilities to prevent XSS and injection attacks
 */

/**
 * Sanitizes user input by removing potentially dangerous HTML/script tags
 */
export function sanitizeText(input: string): string {
  if (!input) return '';

  // Remove HTML tags
  let sanitized = input.replace(/<[^>]*>/g, '');

  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, '');

  // Remove data: protocol (can be used for XSS)
  sanitized = sanitized.replace(/data:/gi, '');

  // Remove event handlers
  sanitized = sanitized.replace(/on\w+\s*=/gi, '');

  return sanitized.trim();
}

/**
 * Sanitizes workout notes and feedback text
 */
export function sanitizeWorkoutNote(note: string): string {
  if (!note) return '';

  // Allow basic formatting but remove dangerous content
  let sanitized = sanitizeText(note);

  // Limit length to prevent abuse
  const MAX_NOTE_LENGTH = 5000;
  if (sanitized.length > MAX_NOTE_LENGTH) {
    sanitized = sanitized.substring(0, MAX_NOTE_LENGTH);
  }

  return sanitized;
}

/**
 * Sanitizes email addresses
 */
export function sanitizeEmail(email: string): string {
  if (!email) return '';

  // Basic email validation and sanitization
  const sanitized = email.trim().toLowerCase();

  // Check if it matches basic email pattern
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(sanitized)) {
    throw new Error('Invalid email format');
  }

  return sanitized;
}

/**
 * Sanitizes numbers to ensure they're within valid ranges
 */
export function sanitizeNumber(value: number, min: number, max: number): number {
  const num = Number(value);

  if (isNaN(num)) {
    throw new Error('Invalid number');
  }

  if (num < min || num > max) {
    throw new Error(`Number must be between ${min} and ${max}`);
  }

  return num;
}

/**
 * Validates and sanitizes RPE (Rate of Perceived Exertion) values
 */
export function sanitizeRPE(rpe: number): number {
  return sanitizeNumber(rpe, 1, 10);
}

/**
 * Validates and sanitizes enjoyment rating values
 */
export function sanitizeEnjoyment(enjoyment: number): number {
  return sanitizeNumber(enjoyment, 1, 5);
}
