/**
 * Gold Standard Date Resolver Tests
 *
 * Verifies Europe/Paris timezone handling and date resolution logic
 */

import { DateResolver } from './src/utils/dateResolver.ts';

function assert(condition, message) {
  if (!condition) {
    throw new Error(`❌ Assertion failed: ${message}`);
  }
  console.log(`✅ ${message}`);
}

function runTests() {
  console.log('\n🧪 Starting Date Resolver Tests\n');

  const wednesday = '2026-02-11';
  const resolver = new DateResolver(wednesday);

  console.log('📅 Reference date: Wednesday, 11 Feb 2026\n');

  console.log('--- Absolute Date Tests ---');
  assert(
    resolver.formatUKDisplay('2026-02-11') === '11 Feb 26',
    'UK date format for 11 Feb 2026'
  );
  assert(
    resolver.formatUKDisplayLong('2026-02-11') === '11 February 2026',
    'UK long date format for 11 Feb 2026'
  );
  assert(
    resolver.getDayName('2026-02-11') === 'Wednesday',
    'Day name for 11 Feb 2026'
  );

  console.log('\n--- Relative Day Resolution Tests ---');

  const todayResult = resolver.resolveRelativeDay('today');
  assert(
    todayResult.isoDate === '2026-02-11' && !todayResult.isAmbiguous,
    '"today" resolves to 11 Feb 2026'
  );

  const tomorrowResult = resolver.resolveRelativeDay('tomorrow');
  assert(
    tomorrowResult.isoDate === '2026-02-12' && !tomorrowResult.isAmbiguous,
    '"tomorrow" resolves to 12 Feb 2026 (Thursday)'
  );

  const yesterdayResult = resolver.resolveRelativeDay('yesterday');
  assert(
    yesterdayResult.isoDate === '2026-02-10' && !yesterdayResult.isAmbiguous,
    '"yesterday" resolves to 10 Feb 2026 (Tuesday)'
  );

  const nextThursdayResult = resolver.resolveRelativeDay('next Thursday');
  assert(
    nextThursdayResult.isoDate === '2026-02-12' && !nextThursdayResult.isAmbiguous,
    '"next Thursday" from Wednesday resolves to 12 Feb 2026'
  );

  const nextMondayResult = resolver.resolveRelativeDay('next Monday');
  assert(
    nextMondayResult.isoDate === '2026-02-16' && !nextMondayResult.isAmbiguous,
    '"next Monday" from Wednesday resolves to 16 Feb 2026'
  );

  const lastTuesdayResult = resolver.resolveRelativeDay('last Tuesday');
  assert(
    lastTuesdayResult.isoDate === '2026-02-10' && !lastTuesdayResult.isAmbiguous,
    '"last Tuesday" from Wednesday resolves to 10 Feb 2026'
  );

  const lastSundayResult = resolver.resolveRelativeDay('last Sunday');
  assert(
    lastSundayResult.isoDate === '2026-02-08' && !lastSundayResult.isAmbiguous,
    '"last Sunday" from Wednesday resolves to 8 Feb 2026'
  );

  const bareTuesdayResult = resolver.resolveRelativeDay('Tuesday');
  assert(
    bareTuesdayResult.isAmbiguous,
    '"Tuesday" alone is ambiguous and requires clarification'
  );

  console.log('\n--- Relative Range Resolution Tests ---');

  const nextWeekResult = resolver.resolveRelativeRange('next week');
  assert(
    nextWeekResult !== null &&
    nextWeekResult.startDate === '2026-02-16' &&
    nextWeekResult.endDate === '2026-02-22',
    '"next week" resolves to 16-22 Feb 2026'
  );

  const next2WeeksResult = resolver.resolveRelativeRange('next 2 weeks');
  assert(
    next2WeeksResult !== null &&
    next2WeeksResult.dayCount === 14,
    '"next 2 weeks" spans 14 days'
  );

  const thisWeekResult = resolver.resolveRelativeRange('this week');
  assert(
    thisWeekResult !== null &&
    thisWeekResult.dayCount === 7,
    '"this week" spans 7 days'
  );

  console.log('\n--- Date Utility Tests ---');

  const nextDay = resolver.addDays('2026-02-11', 1);
  assert(
    nextDay === '2026-02-12',
    'Adding 1 day to 11 Feb gives 12 Feb'
  );

  const prevDay = resolver.addDays('2026-02-11', -1);
  assert(
    prevDay === '2026-02-10',
    'Subtracting 1 day from 11 Feb gives 10 Feb'
  );

  const datesBetween = resolver.getDatesBetween('2026-02-11', '2026-02-13');
  assert(
    datesBetween.length === 3 &&
    datesBetween[0] === '2026-02-11' &&
    datesBetween[2] === '2026-02-13',
    'getDatesBetween returns 3 dates from 11-13 Feb'
  );

  const isPast = resolver.isInPast('2026-02-10');
  assert(isPast, '10 Feb is in the past relative to 11 Feb');

  const isFuture = resolver.isFuture('2026-02-12');
  assert(isFuture, '12 Feb is in the future relative to 11 Feb');

  const isToday = resolver.isToday('2026-02-11');
  assert(isToday, '11 Feb is today');

  console.log('\n--- Timezone Consistency Tests ---');

  const resolver2 = new DateResolver('2026-02-11');
  assert(
    resolver.toISODate(resolver.nowUK()) === resolver2.toISODate(resolver2.nowUK()),
    'Multiple instances produce consistent results'
  );

  console.log('\n✅ All Date Resolver tests passed!\n');
}

try {
  runTests();
} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
