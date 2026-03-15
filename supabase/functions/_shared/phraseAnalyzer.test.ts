import { describe, it, expect } from 'vitest';
import {
  hasAmbiguousDateReference,
  isRecurringWeekdayRequest,
  extractDatePhrases
} from './phraseAnalyzer.ts';

describe('isRecurringWeekdayRequest', () => {
  it('detects "move all Fridays to Thursday"', () => {
    expect(isRecurringWeekdayRequest('move all Fridays to Thursday')).toBe(true);
  });

  it('detects "move every Friday to Thursday"', () => {
    expect(isRecurringWeekdayRequest('move every Friday to Thursday')).toBe(true);
  });

  it('detects "move all future Fridays to Thursday"', () => {
    expect(isRecurringWeekdayRequest('move all future Fridays to Thursday')).toBe(true);
  });

  it('detects "add a run to all Mondays"', () => {
    expect(isRecurringWeekdayRequest('add a run to all Mondays')).toBe(true);
  });

  it('detects "remove all Tuesday workouts"', () => {
    expect(isRecurringWeekdayRequest('remove all Tuesday workouts')).toBe(true);
  });

  it('detects "cancel all future Fridays"', () => {
    expect(isRecurringWeekdayRequest('cancel all future Fridays')).toBe(true);
  });

  it('detects "move Fridays to Thursday going forward"', () => {
    expect(isRecurringWeekdayRequest('move Fridays to Thursday going forward')).toBe(true);
  });

  it('detects "from now on, move Friday workouts to Thursday"', () => {
    expect(isRecurringWeekdayRequest('from now on, move Friday workouts to Thursday')).toBe(true);
  });

  it('detects "for the rest of the plan, make Mondays rest days"', () => {
    expect(isRecurringWeekdayRequest('for the rest of the plan, make Mondays rest days')).toBe(true);
  });

  it('detects "add workouts to each Monday"', () => {
    expect(isRecurringWeekdayRequest('add workouts to each Monday')).toBe(true);
  });

  it('does NOT detect "move Friday to Thursday" (singular)', () => {
    expect(isRecurringWeekdayRequest('move Friday to Thursday')).toBe(false);
  });

  it('does NOT detect "skip Friday" (singular)', () => {
    expect(isRecurringWeekdayRequest('skip Friday')).toBe(false);
  });

  it('does NOT detect "add a run on Monday" (singular)', () => {
    expect(isRecurringWeekdayRequest('add a run on Monday')).toBe(false);
  });

  it('does NOT detect "cancel Tuesday" (singular)', () => {
    expect(isRecurringWeekdayRequest('cancel Tuesday')).toBe(false);
  });

  it('does NOT detect messages without weekdays', () => {
    expect(isRecurringWeekdayRequest('move all workouts')).toBe(false);
  });
});

describe('hasAmbiguousDateReference', () => {
  it('returns false for recurring weekday requests', () => {
    expect(hasAmbiguousDateReference('move all Fridays to Thursday')).toBe(false);
  });

  it('returns false for "move every Friday to Thursday"', () => {
    expect(hasAmbiguousDateReference('move every Friday to Thursday')).toBe(false);
  });

  it('returns false for "add a run to all Mondays"', () => {
    expect(hasAmbiguousDateReference('add a run to all Mondays')).toBe(false);
  });

  it('returns false for "remove all Tuesday workouts"', () => {
    expect(hasAmbiguousDateReference('remove all Tuesday workouts')).toBe(false);
  });

  it('returns true for singular ambiguous "move Friday to Thursday"', () => {
    expect(hasAmbiguousDateReference('move Friday to Thursday')).toBe(true);
  });

  it('returns true for singular ambiguous "skip Friday"', () => {
    expect(hasAmbiguousDateReference('skip Friday')).toBe(true);
  });

  it('returns false for qualified "this Friday"', () => {
    expect(hasAmbiguousDateReference('move this Friday to Thursday')).toBe(false);
  });

  it('returns false for qualified "next Monday"', () => {
    expect(hasAmbiguousDateReference('skip next Monday')).toBe(false);
  });
});

describe('extractDatePhrases', () => {
  it('extracts qualified phrases as non-ambiguous', () => {
    const phrases = extractDatePhrases('move this Friday to next Monday');
    const friday = phrases.find(p => p.normalizedPhrase.includes('friday'));
    const monday = phrases.find(p => p.normalizedPhrase.includes('monday'));

    expect(friday?.isAmbiguous).toBe(false);
    expect(monday?.isAmbiguous).toBe(false);
  });

  it('extracts bare weekdays as ambiguous', () => {
    const phrases = extractDatePhrases('move Friday to Monday');
    const friday = phrases.find(p => p.normalizedPhrase === 'friday');
    const monday = phrases.find(p => p.normalizedPhrase === 'monday');

    expect(friday?.isAmbiguous).toBe(true);
    expect(monday?.isAmbiguous).toBe(true);
  });

  it('handles abbreviations', () => {
    const phrases = extractDatePhrases('skip tue');
    const tuesday = phrases.find(p => p.normalizedPhrase === 'tuesday');

    expect(tuesday).toBeDefined();
    expect(tuesday?.isAmbiguous).toBe(true);
  });

  it('handles possessives', () => {
    const phrases = extractDatePhrases("Friday's workout");
    const friday = phrases.find(p => p.normalizedPhrase === 'friday');

    expect(friday).toBeDefined();
  });
});
