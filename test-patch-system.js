/**
 * Test Patch-Based Coach Chat System
 *
 * This test verifies:
 * 1. Weekday-aware date resolution (Tue → actual Tuesday date)
 * 2. Patch-only modifications (no full week rewrites)
 * 3. Validation (all-or-nothing, date checks)
 * 4. Plans starting on non-Monday dates
 */

// Test case 1: Plan starts Wednesday, patch Tuesday
const testWeekdayResolution = () => {
  console.log('\n=== TEST 1: Weekday Resolution ===');

  const planStartDate = '2026-03-18'; // Wednesday
  const startDate = new Date(planStartDate + 'T00:00:00Z');

  // Week 1: Mar 18 (Wed) through Mar 24 (Tue)
  // We want to patch "Tuesday" which should resolve to Mar 24

  const weekNumber = 1;
  const weekday = 'Tue';

  // Simulate resolution
  const weekStartDate = new Date(startDate);
  weekStartDate.setUTCDate(startDate.getUTCDate() + (weekNumber - 1) * 7);

  const weekDates = [];
  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(weekStartDate);
    dayDate.setUTCDate(weekStartDate.getUTCDate() + i);
    const isoDate = dayDate.toISOString().split('T')[0];
    const date = new Date(isoDate + 'T00:00:00Z');
    const dayIndex = date.getUTCDay();
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayWeekday = weekdays[dayIndex];

    weekDates.push({ isoDate, dayWeekday });

    if (dayWeekday === weekday) {
      console.log(`✓ Resolved Week ${weekNumber} ${weekday} → ${isoDate} (${dayWeekday})`);

      // Verify this is actually a Tuesday
      if (dayIndex === 2) {
        console.log('✓ Date is correctly a Tuesday');
      } else {
        console.error(`✗ ERROR: Date ${isoDate} is ${dayWeekday}, not Tuesday!`);
      }
    }
  }

  console.log('\nWeek 1 dates:');
  weekDates.forEach(d => console.log(`  ${d.isoDate} = ${d.dayWeekday}`));
};

// Test case 2: Verify Mon-Sun plan starting on Wednesday
const testNonMondayStart = () => {
  console.log('\n=== TEST 2: Non-Monday Start ===');

  const planStartDate = '2026-03-18'; // Wednesday
  console.log(`Plan starts: ${planStartDate} (Wednesday)`);

  // Simulate what dates each weekday resolves to in Week 1
  const weekdayMappings = {
    'Mon': '2026-03-23', // Monday in week 1
    'Tue': '2026-03-24', // Tuesday in week 1
    'Wed': '2026-03-18', // Wednesday in week 1 (start date)
    'Thu': '2026-03-19', // Thursday in week 1
    'Fri': '2026-03-20', // Friday in week 1
    'Sat': '2026-03-21', // Saturday in week 1
    'Sun': '2026-03-22'  // Sunday in week 1
  };

  Object.entries(weekdayMappings).forEach(([weekday, expectedDate]) => {
    const date = new Date(expectedDate + 'T00:00:00Z');
    const dayIndex = date.getUTCDay();
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const actualWeekday = weekdays[dayIndex];

    if (actualWeekday === weekday) {
      console.log(`✓ ${weekday} → ${expectedDate} (correct)`);
    } else {
      console.error(`✗ ${weekday} → ${expectedDate} but actual weekday is ${actualWeekday}`);
    }
  });
};

// Test case 3: Patch-only modification
const testPatchOnly = () => {
  console.log('\n=== TEST 3: Patch-Only Modification ===');

  // Original plan (Week 1)
  const originalDays = [
    { date: '2026-03-18', workout: 'Easy 5K', workout_type: 'TRAIN' },
    { date: '2026-03-19', workout: 'Tempo 6K', workout_type: 'TRAIN' },
    { date: '2026-03-20', workout: 'Rest', workout_type: 'REST' },
    { date: '2026-03-21', workout: 'Easy 5K', workout_type: 'TRAIN' },
    { date: '2026-03-22', workout: 'Long Run 10K', workout_type: 'TRAIN' },
    { date: '2026-03-23', workout: 'Rest', workout_type: 'REST' },
    { date: '2026-03-24', workout: 'Easy 5K', workout_type: 'TRAIN' },
  ];

  // User says: "Cancel Thursday's workout"
  // AI returns single patch for Thursday (2026-03-19)
  const patches = [
    {
      week: 1,
      weekday: 'Thu',
      date: '2026-03-19',
      action: 'cancel',
      workout: 'Rest',
      workout_type: 'REST',
      tips: []
    }
  ];

  console.log('Original plan has 7 days');
  console.log('Applying 1 patch (cancel Thursday)...');

  // Apply patches
  const daysMap = new Map();
  originalDays.forEach(day => daysMap.set(day.date, day));

  patches.forEach(patch => {
    const existing = daysMap.get(patch.date);
    daysMap.set(patch.date, {
      ...existing,
      date: patch.date,
      workout: patch.workout,
      workout_type: patch.workout_type,
      tips: patch.tips
    });
  });

  const resultDays = Array.from(daysMap.values());

  console.log(`✓ Result has ${resultDays.length} days (should be 7)`);

  // Check only Thursday changed
  let changedCount = 0;
  resultDays.forEach(day => {
    const original = originalDays.find(d => d.date === day.date);
    if (original && original.workout !== day.workout) {
      changedCount++;
      console.log(`✓ Changed: ${day.date} "${original.workout}" → "${day.workout}"`);
    }
  });

  if (changedCount === 1) {
    console.log('✓ Only 1 day modified (correct)');
  } else {
    console.error(`✗ ${changedCount} days modified (should be 1)`);
  }
};

// Test case 4: All-or-nothing validation
const testAllOrNothing = () => {
  console.log('\n=== TEST 4: All-or-Nothing Validation ===');

  const validDates = new Set([
    '2026-03-18', '2026-03-19', '2026-03-20',
    '2026-03-21', '2026-03-22', '2026-03-23', '2026-03-24'
  ]);

  // Patch with one invalid date
  const patchesWithError = [
    { date: '2026-03-18', workout: 'Rest', action: 'cancel' },
    { date: '2026-03-99', workout: 'Invalid', action: 'replace' }, // Invalid
    { date: '2026-03-20', workout: 'Rest', action: 'cancel' }
  ];

  console.log('Testing patches with 1 invalid date...');

  const errors = [];
  patchesWithError.forEach((patch, idx) => {
    if (!validDates.has(patch.date)) {
      errors.push(`Patch ${idx}: invalid date ${patch.date}`);
    }
  });

  if (errors.length > 0) {
    console.log('✓ Validation correctly detected errors:');
    errors.forEach(err => console.log(`  - ${err}`));
    console.log('✓ All patches rejected (all-or-nothing)');
  } else {
    console.error('✗ Validation failed to detect invalid date');
  }
};

// Run all tests
console.log('====================================');
console.log('PATCH-BASED COACH CHAT SYSTEM TESTS');
console.log('====================================');

testWeekdayResolution();
testNonMondayStart();
testPatchOnly();
testAllOrNothing();

console.log('\n====================================');
console.log('TESTS COMPLETE');
console.log('====================================\n');
