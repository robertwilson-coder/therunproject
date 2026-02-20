/**
 * Phrase Analyzer - Extracts date-related phrases from user messages
 *
 * Used to detect ambiguous date references that require clarification.
 * Supports possessives (tuesday's), plurals (tuesdays), and abbreviations (tue, tues, thu, etc.)
 */

export interface DatePhrase {
  phrase: string;
  normalizedPhrase: string;
  startIndex: number;
  endIndex: number;
  isAmbiguous: boolean;
}

const WEEKDAY_FULL = '(monday|tuesday|wednesday|thursday|friday|saturday|sunday)';
const WEEKDAY_ABBREV = '(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)';
const POSSESSIVE_SUFFIX = "(s|'s|'s)?";

const QUALIFIED_PATTERNS = [
  new RegExp(`\\b(next|last|this)\\s+${WEEKDAY_FULL}${POSSESSIVE_SUFFIX}\\b`, 'gi'),
  new RegExp(`\\b(next|last|this)\\s+${WEEKDAY_ABBREV}${POSSESSIVE_SUFFIX}\\b`, 'gi'),
  /\b(today|tomorrow|yesterday)\b/gi,
  /\b(this|next)\s+(week|weekend)\b/gi,
];

const AMBIGUOUS_PATTERNS = [
  new RegExp(`\\b${WEEKDAY_FULL}${POSSESSIVE_SUFFIX}\\b`, 'gi'),
  new RegExp(`\\b${WEEKDAY_ABBREV}${POSSESSIVE_SUFFIX}\\b`, 'gi'),
];

function normalizePhrase(phrase: string): string {
  let normalized = phrase.toLowerCase().trim();

  normalized = normalized.replace(/[',]/g, '');

  const abbrevMap: Record<string, string> = {
    'mon': 'monday',
    'tue': 'tuesday',
    'tues': 'tuesday',
    'wed': 'wednesday',
    'thu': 'thursday',
    'thur': 'thursday',
    'thurs': 'thursday',
    'fri': 'friday',
    'sat': 'saturday',
    'sun': 'sunday',
  };

  Object.entries(abbrevMap).forEach(([abbrev, full]) => {
    normalized = normalized.replace(new RegExp(`\\b${abbrev}\\b`, 'g'), full);
  });

  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  weekdays.forEach(day => {
    normalized = normalized.replace(new RegExp(`\\b${day}s\\b`, 'g'), day);
  });

  return normalized;
}

export function extractDatePhrases(message: string): DatePhrase[] {
  const phrases: DatePhrase[] = [];

  for (const pattern of QUALIFIED_PATTERNS) {
    const matches = message.matchAll(pattern);
    for (const match of matches) {
      if (match.index !== undefined) {
        phrases.push({
          phrase: match[0],
          normalizedPhrase: normalizePhrase(match[0]),
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          isAmbiguous: false,
        });
      }
    }
  }

  for (const pattern of AMBIGUOUS_PATTERNS) {
    const matches = message.matchAll(pattern);
    for (const match of matches) {
      if (match.index !== undefined) {
        const isAlreadyCaptured = phrases.some(
          p => match.index! >= p.startIndex && match.index! < p.endIndex
        );

        if (!isAlreadyCaptured) {
          phrases.push({
            phrase: match[0],
            normalizedPhrase: normalizePhrase(match[0]),
            startIndex: match.index,
            endIndex: match.index + match[0].length,
            isAmbiguous: true,
          });
        }
      }
    }
  }

  phrases.sort((a, b) => a.startIndex - b.startIndex);
  return phrases;
}

export function hasAmbiguousDateReference(message: string): boolean {
  const phrases = extractDatePhrases(message);
  return phrases.some(p => p.isAmbiguous);
}

export function requiresDateResolution(message: string): boolean {
  const modificationKeywords = [
    'move', 'swap', 'change', 'switch', 'shift',
    'cancel', 'skip', 'delete', 'remove',
    'add', 'insert', 'reschedule',
  ];

  const lowerMessage = message.toLowerCase();
  const hasModificationIntent = modificationKeywords.some(kw => lowerMessage.includes(kw));

  return hasModificationIntent && extractDatePhrases(message).length > 0;
}
