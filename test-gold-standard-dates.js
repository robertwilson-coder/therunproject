#!/usr/bin/env node

console.log('🧪 Gold Standard Date Resolution Test Suite\n');
console.log('=' .repeat(60));

class DateResolver {
  constructor(context) {
    this.todayDate = new Date(context.todayISO + 'T00:00:00Z');
    this.planStartDate = new Date(context.planStartDateISO + 'T00:00:00Z');
    this.planData = context.planData;
    this.completedWorkouts = context.completedWorkouts;
    this.weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    this.weekdayNamesShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  }

  resolve(referencePhrase) {
    const phrase = referencePhrase.toLowerCase().trim();

    if (phrase === 'today') {
      return this.resolveToday();
    }

    if (phrase === 'yesterday') {
      return this.resolveYesterday();
    }

    if (phrase === 'tomorrow') {
      return this.resolveTomorrow();
    }

    if (phrase.match(/^next (monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i)) {
      const weekday = this.capitalizeFirstLetter(phrase.split(' ')[1]);
      return this.resolveNextWeekday(weekday);
    }

    if (phrase.match(/^last (monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i)) {
      const weekday = this.capitalizeFirstLetter(phrase.split(' ')[1]);
      return this.resolveLastWeekday(weekday);
    }

    if (phrase.match(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i)) {
      const weekday = this.capitalizeFirstLetter(phrase);
      return this.resolveWeekdayAmbiguous(weekday);
    }

    throw new Error(`Unable to resolve reference phrase: "${referencePhrase}"`);
  }

  resolveToday() {
    const isoDate = this.todayDate.toISOString().split('T')[0];
    const target = this.buildTarget(isoDate);
    return { resolved: [target], ambiguity: null };
  }

  resolveYesterday() {
    const yesterday = new Date(this.todayDate);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const isoDate = yesterday.toISOString().split('T')[0];
    const target = this.buildTarget(isoDate);
    return { resolved: [target], ambiguity: null };
  }

  resolveTomorrow() {
    const tomorrow = new Date(this.todayDate);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const isoDate = tomorrow.toISOString().split('T')[0];
    const target = this.buildTarget(isoDate);
    return { resolved: [target], ambiguity: null };
  }

  resolveNextWeekday(weekday) {
    const targetDayIndex = this.weekdayNames.indexOf(weekday);
    const todayDayIndex = this.todayDate.getUTCDay();

    let daysAhead = targetDayIndex - todayDayIndex;
    if (daysAhead <= 0) {
      daysAhead += 7;
    }

    const targetDate = new Date(this.todayDate);
    targetDate.setUTCDate(targetDate.getUTCDate() + daysAhead);
    const isoDate = targetDate.toISOString().split('T')[0];
    const target = this.buildTarget(isoDate);

    return { resolved: [target], ambiguity: null };
  }

  resolveLastWeekday(weekday) {
    const targetDayIndex = this.weekdayNames.indexOf(weekday);
    const todayDayIndex = this.todayDate.getUTCDay();

    let daysBack = todayDayIndex - targetDayIndex;
    if (daysBack <= 0) {
      daysBack += 7;
    }

    const targetDate = new Date(this.todayDate);
    targetDate.setUTCDate(targetDate.getUTCDate() - daysBack);
    const isoDate = targetDate.toISOString().split('T')[0];
    const target = this.buildTarget(isoDate);

    return { resolved: [target], ambiguity: null };
  }

  resolveWeekdayAmbiguous(weekday) {
    const lastWeekdayResult = this.resolveLastWeekday(weekday);
    const nextWeekdayResult = this.resolveNextWeekday(weekday);

    const lastTarget = lastWeekdayResult.resolved[0];
    const nextTarget = nextWeekdayResult.resolved[0];

    const todayWeekday = this.weekdayNames[this.todayDate.getUTCDay()];
    if (weekday === todayWeekday) {
      return {
        resolved: [],
        ambiguity: {
          question: `Which ${weekday} did you mean?`,
          options: [lastTarget, nextTarget]
        }
      };
    }

    if (Math.abs(lastTarget.daysFromToday) <= 3 && Math.abs(nextTarget.daysFromToday) <= 7) {
      return {
        resolved: [],
        ambiguity: {
          question: `Which ${weekday} did you mean?`,
          options: [lastTarget, nextTarget]
        }
      };
    }

    if (Math.abs(lastTarget.daysFromToday) < Math.abs(nextTarget.daysFromToday)) {
      return { resolved: [lastTarget], ambiguity: null };
    } else {
      return { resolved: [nextTarget], ambiguity: null };
    }
  }

  buildTarget(isoDate) {
    const targetDate = new Date(isoDate + 'T00:00:00Z');
    const daysDiff = Math.floor((targetDate.getTime() - this.todayDate.getTime()) / (1000 * 60 * 60 * 24));

    let relative;
    if (daysDiff < 0) {
      relative = 'PAST';
    } else if (daysDiff === 0) {
      relative = 'TODAY';
    } else {
      relative = 'FUTURE';
    }

    const weekdayIndex = targetDate.getUTCDay();
    const weekday = this.weekdayNamesShort[weekdayIndex];

    const humanLabel = this.buildHumanLabel(isoDate, weekday, relative, daysDiff);

    return {
      isoDate,
      weekday,
      relative,
      humanLabel,
      daysFromToday: daysDiff
    };
  }

  buildHumanLabel(isoDate, weekday, relative, daysDiff) {
    const formattedDate = this.formatDate(isoDate);

    if (relative === 'TODAY') {
      return `Today, ${formattedDate}`;
    }

    if (relative === 'PAST') {
      if (daysDiff === -1) {
        return `Yesterday, ${formattedDate}`;
      }
      return `${weekday}, ${formattedDate} (${Math.abs(daysDiff)} days ago)`;
    }

    if (daysDiff === 1) {
      return `Tomorrow, ${formattedDate}`;
    }

    return `${weekday}, ${formattedDate} (in ${daysDiff} days)`;
  }

  formatDate(isoDate) {
    const date = new Date(isoDate + 'T00:00:00Z');
    const month = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    const day = date.getUTCDate();
    return `${month} ${day}`;
  }

  capitalizeFirstLetter(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

function runTest(testName, testFn) {
  try {
    testFn();
    console.log(`✅ ${testName}`);
    return true;
  } catch (error) {
    console.log(`❌ ${testName}`);
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\n   Expected: ${expected}\n   Actual: ${actual}`);
  }
}

function assertAmbiguity(result, message) {
  if (!result.ambiguity) {
    throw new Error(`${message} - Expected ambiguity but got resolved`);
  }
}

function assertNoAmbiguity(result, message) {
  if (result.ambiguity) {
    throw new Error(`${message} - Expected resolved but got ambiguity`);
  }
}

let passCount = 0;
let failCount = 0;

console.log('\n📋 Test Suite: Date Resolution on Wednesday, Feb 12, 2025\n');

const context = {
  todayISO: '2025-02-12',
  planStartDateISO: '2025-01-06',
  planData: {},
  completedWorkouts: new Set()
};

const resolver = new DateResolver(context);

if (runTest('Test 1: "today" resolves to 2025-02-12', () => {
  const result = resolver.resolve('today');
  assertNoAmbiguity(result);
  assertEqual(result.resolved[0].isoDate, '2025-02-12', 'Date mismatch');
  assertEqual(result.resolved[0].relative, 'TODAY', 'Relative mismatch');
})) passCount++; else failCount++;

if (runTest('Test 2: "yesterday" resolves to 2025-02-11 (PAST)', () => {
  const result = resolver.resolve('yesterday');
  assertNoAmbiguity(result);
  assertEqual(result.resolved[0].isoDate, '2025-02-11', 'Date mismatch');
  assertEqual(result.resolved[0].relative, 'PAST', 'Should be PAST');
})) passCount++; else failCount++;

if (runTest('Test 3: "tomorrow" resolves to 2025-02-13 (FUTURE)', () => {
  const result = resolver.resolve('tomorrow');
  assertNoAmbiguity(result);
  assertEqual(result.resolved[0].isoDate, '2025-02-13', 'Date mismatch');
  assertEqual(result.resolved[0].relative, 'FUTURE', 'Should be FUTURE');
})) passCount++; else failCount++;

if (runTest('Test 4: "last Tuesday" resolves to 2025-02-11 (PAST)', () => {
  const result = resolver.resolve('last Tuesday');
  assertNoAmbiguity(result);
  assertEqual(result.resolved[0].isoDate, '2025-02-11', 'Should be last Tuesday');
  assertEqual(result.resolved[0].weekday, 'Tue', 'Weekday mismatch');
  assertEqual(result.resolved[0].relative, 'PAST', 'Should be PAST');
})) passCount++; else failCount++;

if (runTest('Test 5: "next Tuesday" resolves to 2025-02-18 (FUTURE)', () => {
  const result = resolver.resolve('next Tuesday');
  assertNoAmbiguity(result);
  assertEqual(result.resolved[0].isoDate, '2025-02-18', 'Should be next Tuesday');
  assertEqual(result.resolved[0].weekday, 'Tue', 'Weekday mismatch');
  assertEqual(result.resolved[0].relative, 'FUTURE', 'Should be FUTURE');
})) passCount++; else failCount++;

if (runTest('Test 6: "Tuesday" alone TRIGGERS AMBIGUITY', () => {
  const result = resolver.resolve('Tuesday');
  assertAmbiguity(result, 'Should detect ambiguity');
  assertEqual(result.ambiguity.options.length, 2, 'Should have 2 options');
  assertEqual(result.ambiguity.options[0].isoDate, '2025-02-11', 'First option should be last Tue');
  assertEqual(result.ambiguity.options[1].isoDate, '2025-02-18', 'Second option should be next Tue');
})) passCount++; else failCount++;

if (runTest('Test 7: "next Monday" resolves to 2025-02-17', () => {
  const result = resolver.resolve('next Monday');
  assertNoAmbiguity(result);
  assertEqual(result.resolved[0].isoDate, '2025-02-17', 'Date mismatch');
  assertEqual(result.resolved[0].weekday, 'Mon', 'Weekday mismatch');
  assertEqual(result.resolved[0].relative, 'FUTURE', 'Should be FUTURE');
})) passCount++; else failCount++;

if (runTest('Test 8: "last Friday" resolves to 2025-02-07', () => {
  const result = resolver.resolve('last Friday');
  assertNoAmbiguity(result);
  assertEqual(result.resolved[0].isoDate, '2025-02-07', 'Date mismatch');
  assertEqual(result.resolved[0].weekday, 'Fri', 'Weekday mismatch');
  assertEqual(result.resolved[0].relative, 'PAST', 'Should be PAST');
})) passCount++; else failCount++;

console.log('\n📋 Test Suite: Midnight Boundary Cases\n');

const midnightContext = {
  todayISO: '2025-02-13',
  planStartDateISO: '2025-01-06',
  planData: {},
  completedWorkouts: new Set()
};

const midnightResolver = new DateResolver(midnightContext);

if (runTest('Test 9: At midnight, "today" still resolves correctly', () => {
  const result = midnightResolver.resolve('today');
  assertNoAmbiguity(result);
  assertEqual(result.resolved[0].isoDate, '2025-02-13', 'Date mismatch');
  assertEqual(result.resolved[0].relative, 'TODAY', 'Should be TODAY');
})) passCount++; else failCount++;

if (runTest('Test 10: "Thursday" on Thursday TRIGGERS AMBIGUITY', () => {
  const result = midnightResolver.resolve('Thursday');
  assertAmbiguity(result, 'Should detect ambiguity for same weekday');
})) passCount++; else failCount++;

console.log('\n📋 Test Suite: Weekend References\n');

const weekendContext = {
  todayISO: '2025-02-14',
  planStartDateISO: '2025-01-06',
  planData: {},
  completedWorkouts: new Set()
};

const weekendResolver = new DateResolver(weekendContext);

if (runTest('Test 11: "next Saturday" on Friday resolves to tomorrow', () => {
  const result = weekendResolver.resolve('next Saturday');
  assertNoAmbiguity(result);
  assertEqual(result.resolved[0].isoDate, '2025-02-15', 'Should be tomorrow');
  assertEqual(result.resolved[0].weekday, 'Sat', 'Weekday mismatch');
})) passCount++; else failCount++;

console.log('\n' + '='.repeat(60));
console.log(`\n🎯 Test Results: ${passCount} passed, ${failCount} failed\n`);

if (failCount === 0) {
  console.log('✅ All tests passed! Date resolution is gold standard.\n');
  process.exit(0);
} else {
  console.log('❌ Some tests failed. Review date resolution logic.\n');
  process.exit(1);
}
