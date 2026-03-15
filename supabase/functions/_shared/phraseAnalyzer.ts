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

const RECURRING_INDICATORS = [
  /\ball\s+(?:future\s+)?/i,
  /\bevery\s+/i,
  /\beach\s+/i,
  /\bfuture\s+/i,
  /\bgoing\s+forward\b/i,
  /\bfrom\s+now\s+on\b/i,
  /\bfor\s+the\s+rest\s+of\s+(?:the\s+)?plan\b/i,
  /\brecurring\b/i,
];

export function isRecurringWeekdayRequest(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  const hasRecurringIndicator = RECURRING_INDICATORS.some(pattern => pattern.test(lowerMessage));
  if (!hasRecurringIndicator) return false;

  const weekdayPattern = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)s?\b/i;
  return weekdayPattern.test(lowerMessage);
}

export function hasAmbiguousDateReference(message: string): boolean {
  if (isRecurringWeekdayRequest(message)) {
    return false;
  }

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

export type PlanTier = 'base' | 'performance' | 'competitive';

export interface TierChangeDetection {
  isTierChangeRequest: boolean;
  currentTier?: PlanTier;
  targetTier?: PlanTier;
  confidence: number;
}

const TIER_NAMES: PlanTier[] = ['base', 'performance', 'competitive'];

const TIER_UPGRADE_VERBS = [
  'upgrade', 'move up', 'switch to', 'change to', 'go to', 'bump up',
  'move to', 'change my tier', 'change tier', 'switch from', 'move from',
  'want competitive', 'want performance', 'chose base but want',
  'selected base but', 'picked base but', 'started with base',
];

const TIER_CONTEXT_PHRASES = [
  'tier', 'tiers', 'level', 'levels', 'ambition',
  'questionnaire', '3 tiers', 'three tiers', '3 plans', 'three plans',
  'base plan', 'performance plan', 'competitive plan',
];

export function detectTierChangeRequest(
  message: string,
  currentPlanTier?: string
): TierChangeDetection {
  const lower = message.toLowerCase();

  const hasTierVocabulary = TIER_NAMES.some(tier => lower.includes(tier));
  const hasUpgradeVerb = TIER_UPGRADE_VERBS.some(verb => lower.includes(verb));
  const hasTierContext = TIER_CONTEXT_PHRASES.some(phrase => lower.includes(phrase));

  if (!hasTierVocabulary && !hasTierContext) {
    return { isTierChangeRequest: false, confidence: 0 };
  }

  if (!hasUpgradeVerb && !hasTierContext) {
    return { isTierChangeRequest: false, confidence: 0 };
  }

  let targetTier: PlanTier | undefined;
  if (lower.includes('competitive')) {
    targetTier = 'competitive';
  } else if (lower.includes('performance')) {
    targetTier = 'performance';
  } else if (lower.includes('base') && (lower.includes('back to') || lower.includes('downgrade'))) {
    targetTier = 'base';
  }

  let sourceTier: PlanTier | undefined;
  const fromMatch = lower.match(/from\s+(base|performance|competitive)/);
  if (fromMatch) {
    sourceTier = fromMatch[1] as PlanTier;
  }

  const normalizedCurrentTier = currentPlanTier?.toLowerCase() as PlanTier | undefined;
  const resolvedCurrentTier = sourceTier || normalizedCurrentTier;

  let confidence = 0.5;
  if (hasTierVocabulary) confidence += 0.2;
  if (hasUpgradeVerb) confidence += 0.15;
  if (hasTierContext) confidence += 0.15;
  if (targetTier) confidence += 0.1;

  confidence = Math.min(confidence, 1.0);

  return {
    isTierChangeRequest: true,
    currentTier: resolvedCurrentTier,
    targetTier,
    confidence,
  };
}

export function extractTierFromPlanData(planData: any): PlanTier | undefined {
  const tier = planData?.meta?.ambitionTier
    || planData?.ambitionTier
    || planData?.answers?.ambitionTier;

  if (tier && TIER_NAMES.includes(tier.toLowerCase())) {
    return tier.toLowerCase() as PlanTier;
  }
  return undefined;
}
