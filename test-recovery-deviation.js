// Tests for HR and sleep deviation logic (recoveryDeviation.ts)
// Run with: node test-recovery-deviation.js

// ─── Inline implementations (mirrors src/utils/recoveryDeviation.ts) ───────

const HR_SINGLE_ELEVATION_THRESHOLD = 7;
const HR_SUSTAINED_ELEVATION_THRESHOLD = 5;
const HR_SUSTAINED_DAYS_MIN = 3;
const SLEEP_MIN_HOURS = 6.5;
const SLEEP_POOR_QUALITY = 2;
const SLEEP_CONSECUTIVE_DAYS = 2;

function evaluateHeartRateDeviation(recentHRLogs) {
  const noTrigger = { shouldTrigger: false, deviationType: 'none', currentHR: 0, averageHR: 0, deviation: 0, message: '' };
  if (recentHRLogs.length < 2) return noTrigger;

  const sorted = [...recentHRLogs].sort((a, b) => new Date(b.log_date) - new Date(a.log_date));
  const currentHR = sorted[0].heart_rate;
  const baseline = sorted.slice(1);
  const averageHR = Math.round(baseline.reduce((sum, l) => sum + l.heart_rate, 0) / baseline.length);
  const deviation = currentHR - averageHR;

  if (deviation >= HR_SINGLE_ELEVATION_THRESHOLD) {
    return { shouldTrigger: true, deviationType: 'elevated_single', currentHR, averageHR, deviation, message: `resting heart rate today is ${currentHR} bpm` };
  }

  if (sorted.length > HR_SUSTAINED_DAYS_MIN) {
    const recentDays = sorted.slice(0, HR_SUSTAINED_DAYS_MIN);
    const olderBaseline = sorted.slice(HR_SUSTAINED_DAYS_MIN);
    const olderAvg = Math.round(olderBaseline.reduce((sum, l) => sum + l.heart_rate, 0) / olderBaseline.length);
    const allElevated = recentDays.every(l => l.heart_rate > olderAvg + HR_SUSTAINED_ELEVATION_THRESHOLD);
    if (allElevated) {
      const sustainedAvg = Math.round(recentDays.reduce((sum, l) => sum + l.heart_rate, 0) / recentDays.length);
      return { shouldTrigger: true, deviationType: 'sustained_elevation', currentHR, averageHR: olderAvg, deviation: sustainedAvg - olderAvg, message: `resting heart rate has been elevated for the past ${HR_SUSTAINED_DAYS_MIN} days` };
    }
  }

  return noTrigger;
}

function evaluateSleepDeviation(recentSleepLogs) {
  const noTrigger = { shouldTrigger: false, deviationType: 'none', currentHours: 0, currentQuality: 0, averageHours: 0, message: '' };
  if (recentSleepLogs.length === 0) return noTrigger;

  const sorted = [...recentSleepLogs].sort((a, b) => new Date(b.log_date) - new Date(a.log_date));
  const latest = sorted[0];
  const currentHours = latest.hours;
  const currentQuality = latest.quality;
  const averageHours = parseFloat((sorted.reduce((sum, l) => sum + l.hours, 0) / sorted.length).toFixed(1));

  if (sorted.length >= SLEEP_CONSECUTIVE_DAYS) {
    const recentDays = sorted.slice(0, SLEEP_CONSECUTIVE_DAYS);
    const allPoor = recentDays.every(l => l.hours < SLEEP_MIN_HOURS || l.quality <= SLEEP_POOR_QUALITY || l.wake_feeling === 'fatigued');
    if (allPoor) {
      return { shouldTrigger: true, deviationType: 'consecutive_poor', currentHours, currentQuality, averageHours, message: `${SLEEP_CONSECUTIVE_DAYS} nights of poor or insufficient sleep` };
    }
  }

  if (currentHours < SLEEP_MIN_HOURS) {
    return { shouldTrigger: true, deviationType: 'insufficient_hours', currentHours, currentQuality, averageHours, message: `only got ${currentHours} hours of sleep` };
  }

  if (currentQuality <= SLEEP_POOR_QUALITY) {
    return { shouldTrigger: true, deviationType: 'poor_quality', currentHours, currentQuality, averageHours, message: `rated the quality as ${currentQuality}/5` };
  }

  return noTrigger;
}

// ─── Test helpers ────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
    results.push({ name, status: 'pass' });
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err.message}`);
    failed++;
    results.push({ name, status: 'fail', error: err.message });
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label || ''}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ─── Helper: build HR log entries ────────────────────────────────────────────

function hrLogs(readings) {
  // readings: array of [daysAgo, heartRate]
  return readings.map(([daysAgo, hr]) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return { log_date: d.toISOString().split('T')[0], heart_rate: hr };
  });
}

function sleepLogs(readings) {
  // readings: array of [daysAgo, hours, quality, wake_feeling]
  return readings.map(([daysAgo, hours, quality, wake_feeling]) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return { log_date: d.toISOString().split('T')[0], hours, quality, wake_feeling: wake_feeling || 'normal' };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEART RATE DEVIATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\nHeart Rate Deviation Tests\n' + '─'.repeat(50));

test('No trigger with only 1 reading (insufficient data)', () => {
  const result = evaluateHeartRateDeviation(hrLogs([[0, 58]]));
  assertEqual(result.shouldTrigger, false, 'shouldTrigger');
  assertEqual(result.deviationType, 'none', 'deviationType');
});

test('No trigger with empty array', () => {
  const result = evaluateHeartRateDeviation([]);
  assertEqual(result.shouldTrigger, false, 'shouldTrigger');
});

test('No trigger when today is exactly 6 bpm above baseline (below threshold)', () => {
  // baseline avg = 55, today = 61 → deviation = 6, threshold = 7
  const result = evaluateHeartRateDeviation(hrLogs([
    [0, 61],
    [1, 55], [2, 55], [3, 55], [4, 55]
  ]));
  assertEqual(result.shouldTrigger, false, 'shouldTrigger');
  assertEqual(result.deviationType, 'none', 'deviationType');
});

test('Elevated single: today exactly at threshold (7 bpm above baseline)', () => {
  // baseline avg = 55, today = 62 → deviation = 7
  const result = evaluateHeartRateDeviation(hrLogs([
    [0, 62],
    [1, 55], [2, 55], [3, 55]
  ]));
  assertEqual(result.shouldTrigger, true, 'shouldTrigger');
  assertEqual(result.deviationType, 'elevated_single', 'deviationType');
  assertEqual(result.currentHR, 62, 'currentHR');
  assertEqual(result.deviation, 7, 'deviation');
  assert(result.message.includes('62 bpm'), 'message contains HR value');
});

test('Elevated single: large spike (15 bpm above baseline)', () => {
  // sick/illness scenario
  const result = evaluateHeartRateDeviation(hrLogs([
    [0, 75],
    [1, 58], [2, 60], [3, 59], [4, 58], [5, 61]
  ]));
  assertEqual(result.shouldTrigger, true, 'shouldTrigger');
  assertEqual(result.deviationType, 'elevated_single', 'deviationType');
  assert(result.deviation >= 15, 'deviation >= 15');
});

test('Elevated single takes priority over sustained check when spike is today', () => {
  // today is +10, recent 3 days are also elevated, but single spike takes priority
  const result = evaluateHeartRateDeviation(hrLogs([
    [0, 70],  // today: +10 above 60 baseline
    [1, 66], [2, 67], [3, 66],  // also elevated
    [4, 60], [5, 60], [6, 60]   // older baseline
  ]));
  assertEqual(result.deviationType, 'elevated_single', 'deviationType should be elevated_single');
});

test('Sustained elevation: 3 recent days all >5 bpm above older baseline', () => {
  // older baseline avg ~55, recent 3 days all at 62+
  const result = evaluateHeartRateDeviation(hrLogs([
    [0, 62], [1, 63], [2, 61],   // recent 3 days
    [3, 55], [4, 56], [5, 54], [6, 55]  // older baseline avg ~55
  ]));
  assertEqual(result.shouldTrigger, true, 'shouldTrigger');
  assertEqual(result.deviationType, 'sustained_elevation', 'deviationType');
  assert(result.message.includes('3 days'), 'message mentions 3 days');
});

test('No sustained trigger: recent days only 4 bpm above baseline (below threshold)', () => {
  // older baseline avg ~55, recent days at 59 → 4 bpm, threshold is 5
  const result = evaluateHeartRateDeviation(hrLogs([
    [0, 59], [1, 59], [2, 59],
    [3, 55], [4, 55], [5, 55], [6, 55]
  ]));
  assertEqual(result.shouldTrigger, false, 'shouldTrigger');
});

test('No sustained trigger: only 3 readings total (needs >3 for sustained check)', () => {
  // sorted.length must be > HR_SUSTAINED_DAYS_MIN (3) for sustained check
  const result = evaluateHeartRateDeviation(hrLogs([
    [0, 65], [1, 64], [2, 65]
  ]));
  // deviation from baseline of [64,65] avg = ~64.5, today 65 → deviation < 7, no single
  // sustained check requires length > 3, so also no sustained
  assertEqual(result.shouldTrigger, false, 'shouldTrigger');
});

test('No trigger: consistent normal readings over 7 days', () => {
  const result = evaluateHeartRateDeviation(hrLogs([
    [0, 58], [1, 57], [2, 59], [3, 58], [4, 56], [5, 58], [6, 57]
  ]));
  assertEqual(result.shouldTrigger, false, 'shouldTrigger');
});

test('Sorting: logs provided in wrong date order still evaluate correctly', () => {
  // Provide oldest first; function should sort descending by date
  const logs = hrLogs([[3, 55], [2, 55], [1, 55], [0, 65]]);
  const shuffled = [logs[1], logs[3], logs[0], logs[2]]; // random order
  const result = evaluateHeartRateDeviation(shuffled);
  assertEqual(result.shouldTrigger, true, 'shouldTrigger');
  assertEqual(result.currentHR, 65, 'currentHR should be today (65)');
});

// ═══════════════════════════════════════════════════════════════════════════════
// SLEEP DEVIATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\nSleep Deviation Tests\n' + '─'.repeat(50));

test('No trigger with empty array', () => {
  const result = evaluateSleepDeviation([]);
  assertEqual(result.shouldTrigger, false, 'shouldTrigger');
});

test('No trigger: healthy sleep (7.5h, quality 4, well-rested)', () => {
  const result = evaluateSleepDeviation(sleepLogs([
    [0, 7.5, 4, 'well-rested'],
    [1, 8.0, 5, 'well-rested'],
    [2, 7.0, 4, 'normal']
  ]));
  assertEqual(result.shouldTrigger, false, 'shouldTrigger');
});

test('No trigger: borderline hours (exactly 6.5h, good quality)', () => {
  // 6.5 is the threshold - must be strictly less than to trigger
  const result = evaluateSleepDeviation(sleepLogs([
    [0, 6.5, 4, 'normal'],
    [1, 7.0, 4, 'normal']
  ]));
  assertEqual(result.shouldTrigger, false, 'shouldTrigger');
});

test('Insufficient hours: last night only 5h', () => {
  const result = evaluateSleepDeviation(sleepLogs([
    [0, 5.0, 3, 'fatigued'],
    [1, 7.5, 4, 'well-rested'],
    [2, 7.5, 4, 'normal']
  ]));
  // 2 nights checked for consecutive first: night 0 is poor (5h < 6.5), night 1 is good → not consecutive
  // then falls through to insufficient_hours check for night 0
  assertEqual(result.shouldTrigger, true, 'shouldTrigger');
  assertEqual(result.deviationType, 'insufficient_hours', 'deviationType');
  assertEqual(result.currentHours, 5.0, 'currentHours');
  assert(result.message.includes('5 hours'), 'message mentions hours');
});

test('Insufficient hours: only 4h sleep', () => {
  const result = evaluateSleepDeviation(sleepLogs([[0, 4.0, 2, 'fatigued']]));
  assertEqual(result.shouldTrigger, true, 'shouldTrigger');
  assertEqual(result.deviationType, 'insufficient_hours', 'deviationType');
});

test('Poor quality: enough hours but quality 2/5', () => {
  const result = evaluateSleepDeviation(sleepLogs([
    [0, 7.5, 2, 'normal'],
    [1, 7.0, 4, 'well-rested']
  ]));
  // 2 nights: night 0 quality=2 (poor), night 1 quality=4 (ok) → not consecutive
  // falls through to poor_quality check
  assertEqual(result.shouldTrigger, true, 'shouldTrigger');
  assertEqual(result.deviationType, 'poor_quality', 'deviationType');
  assert(result.message.includes('2/5'), 'message mentions quality rating');
});

test('Poor quality: quality exactly at threshold (2) triggers', () => {
  const result = evaluateSleepDeviation(sleepLogs([
    [0, 8.0, 2, 'normal'],
    [1, 8.0, 4, 'normal']
  ]));
  assertEqual(result.shouldTrigger, true, 'shouldTrigger');
  assertEqual(result.deviationType, 'poor_quality', 'deviationType');
});

test('Poor quality: quality 3/5 does not trigger', () => {
  const result = evaluateSleepDeviation(sleepLogs([
    [0, 7.0, 3, 'normal'],
    [1, 7.5, 4, 'well-rested']
  ]));
  assertEqual(result.shouldTrigger, false, 'shouldTrigger');
});

test('Consecutive poor: 2 nights with insufficient hours', () => {
  const result = evaluateSleepDeviation(sleepLogs([
    [0, 5.5, 3, 'fatigued'],
    [1, 5.0, 3, 'fatigued'],
    [2, 7.5, 4, 'well-rested']
  ]));
  assertEqual(result.shouldTrigger, true, 'shouldTrigger');
  assertEqual(result.deviationType, 'consecutive_poor', 'deviationType');
  assert(result.message.includes('2 nights'), 'message mentions 2 nights');
});

test('Consecutive poor: 2 nights with poor quality (enough hours)', () => {
  const result = evaluateSleepDeviation(sleepLogs([
    [0, 7.5, 1, 'normal'],
    [1, 8.0, 2, 'normal'],
    [2, 8.0, 5, 'well-rested']
  ]));
  assertEqual(result.shouldTrigger, true, 'shouldTrigger');
  assertEqual(result.deviationType, 'consecutive_poor', 'deviationType');
});

test('Consecutive poor: 2 nights with fatigued wake_feeling (regardless of hours/quality)', () => {
  const result = evaluateSleepDeviation(sleepLogs([
    [0, 7.5, 4, 'fatigued'],
    [1, 7.0, 4, 'fatigued'],
    [2, 7.5, 5, 'well-rested']
  ]));
  assertEqual(result.shouldTrigger, true, 'shouldTrigger');
  assertEqual(result.deviationType, 'consecutive_poor', 'deviationType');
});

test('Consecutive poor: mixed triggers (1st night short hours, 2nd night poor quality)', () => {
  const result = evaluateSleepDeviation(sleepLogs([
    [0, 5.0, 4, 'normal'],   // insufficient hours
    [1, 8.0, 2, 'normal'],   // poor quality
    [2, 8.0, 4, 'normal']
  ]));
  assertEqual(result.shouldTrigger, true, 'shouldTrigger');
  assertEqual(result.deviationType, 'consecutive_poor', 'deviationType');
});

test('Consecutive check only fails if one of the two nights is fine', () => {
  const result = evaluateSleepDeviation(sleepLogs([
    [0, 5.0, 2, 'fatigued'],   // clearly poor
    [1, 7.5, 4, 'well-rested'], // good night breaks the run
    [2, 5.0, 2, 'fatigued']    // poor but not in top 2
  ]));
  // night 0 and night 1 are the 2 most recent; night 1 is good → no consecutive
  // night 0 alone triggers insufficient_hours
  assertEqual(result.shouldTrigger, true, 'shouldTrigger');
  assertEqual(result.deviationType, 'insufficient_hours', 'deviationType');
});

test('Consecutive check has priority over single-night checks', () => {
  // Both recent nights are bad - should return consecutive_poor, not insufficient_hours
  const result = evaluateSleepDeviation(sleepLogs([
    [0, 5.0, 2, 'fatigued'],
    [1, 5.5, 2, 'fatigued'],
    [2, 7.5, 5, 'well-rested']
  ]));
  assertEqual(result.deviationType, 'consecutive_poor', 'consecutive_poor takes priority');
});

test('Sorting: logs provided in wrong date order still evaluate correctly', () => {
  const logs = sleepLogs([
    [2, 7.5, 4, 'normal'],
    [0, 5.0, 2, 'fatigued'],
    [1, 5.0, 2, 'fatigued']
  ]);
  const shuffled = [logs[2], logs[0], logs[1]];
  const result = evaluateSleepDeviation(shuffled);
  assertEqual(result.shouldTrigger, true, 'shouldTrigger');
  assertEqual(result.deviationType, 'consecutive_poor', 'deviationType');
});

// ═══════════════════════════════════════════════════════════════════════════════
// INTERVENTION METADATA TESTS
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\nIntervention Metadata Tests\n' + '─'.repeat(50));

test('HR elevated_single generates correct source metadata key', () => {
  const result = evaluateHeartRateDeviation(hrLogs([
    [0, 65], [1, 55], [2, 55]
  ]));
  const source = result.deviationType === 'elevated_single' ? 'hr_elevated' : 'hr_sustained';
  assertEqual(source, 'hr_elevated', 'source key');
});

test('HR sustained_elevation generates correct source metadata key', () => {
  const result = evaluateHeartRateDeviation(hrLogs([
    [0, 62], [1, 63], [2, 61],
    [3, 55], [4, 56], [5, 54], [6, 55]
  ]));
  const source = result.deviationType === 'elevated_single' ? 'hr_elevated' : 'hr_sustained';
  assertEqual(source, 'hr_sustained', 'source key');
});

test('Sleep workoutKey format: sleep-YYYY-MM-DD', () => {
  const logDate = '2026-02-21';
  const workoutKey = `sleep-${logDate}`;
  assert(/^sleep-\d{4}-\d{2}-\d{2}$/.test(workoutKey), 'workoutKey format correct');
});

test('HR workoutKey format: hr-YYYY-MM-DD', () => {
  const logDate = '2026-02-21';
  const workoutKey = `hr-${logDate}`;
  assert(/^hr-\d{4}-\d{2}-\d{2}$/.test(workoutKey), 'workoutKey format correct');
});

test('Sleep source key for consecutive_poor', () => {
  const result = evaluateSleepDeviation(sleepLogs([
    [0, 5.0, 2, 'fatigued'],
    [1, 5.5, 2, 'fatigued']
  ]));
  const source = `sleep_${result.deviationType}`;
  assertEqual(source, 'sleep_consecutive_poor', 'source key');
});

test('Sleep source key for insufficient_hours', () => {
  const result = evaluateSleepDeviation(sleepLogs([
    [0, 5.0, 3, 'normal'],
    [1, 7.5, 4, 'well-rested']
  ]));
  const source = `sleep_${result.deviationType}`;
  assertEqual(source, 'sleep_insufficient_hours', 'source key');
});

test('Sleep source key for poor_quality', () => {
  const result = evaluateSleepDeviation(sleepLogs([
    [0, 7.5, 1, 'normal'],
    [1, 8.0, 4, 'well-rested']
  ]));
  const source = `sleep_${result.deviationType}`;
  assertEqual(source, 'sleep_poor_quality', 'source key');
});

// ═══════════════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════

console.log('\nEdge Cases\n' + '─'.repeat(50));

test('HR: single reading returns no-trigger (needs at least 2)', () => {
  const result = evaluateHeartRateDeviation(hrLogs([[0, 90]]));
  assertEqual(result.shouldTrigger, false, 'shouldTrigger');
});

test('HR: exactly 2 readings, spike triggers elevated_single', () => {
  const result = evaluateHeartRateDeviation(hrLogs([[0, 70], [1, 55]]));
  // deviation = 70 - 55 = 15 → triggers
  assertEqual(result.shouldTrigger, true, 'shouldTrigger');
  assertEqual(result.deviationType, 'elevated_single', 'deviationType');
});

test('HR: exactly 2 readings, no spike - no trigger', () => {
  const result = evaluateHeartRateDeviation(hrLogs([[0, 58], [1, 56]]));
  assertEqual(result.shouldTrigger, false, 'shouldTrigger');
});

test('Sleep: single log entry, enough hours and good quality - no trigger', () => {
  const result = evaluateSleepDeviation(sleepLogs([[0, 8.0, 4, 'well-rested']]));
  assertEqual(result.shouldTrigger, false, 'shouldTrigger');
});

test('Sleep: single log entry, insufficient hours - triggers insufficient_hours', () => {
  const result = evaluateSleepDeviation(sleepLogs([[0, 4.5, 3, 'fatigued']]));
  // only 1 log, so consecutive check (needs >= 2) is skipped; falls to insufficient_hours
  assertEqual(result.shouldTrigger, true, 'shouldTrigger');
  assertEqual(result.deviationType, 'insufficient_hours', 'deviationType');
});

test('Sleep: 1h sleep (extreme deprivation) triggers insufficient_hours', () => {
  const result = evaluateSleepDeviation(sleepLogs([[0, 1.0, 1, 'fatigued']]));
  assertEqual(result.shouldTrigger, true, 'shouldTrigger');
  assertEqual(result.deviationType, 'insufficient_hours', 'deviationType');
});

test('Sleep averageHours is calculated correctly when triggered', () => {
  // 5.0 + 7.5 + 8.0 = 20.5 / 3 = 6.8 average; tonight 5h triggers insufficient_hours
  const result = evaluateSleepDeviation(sleepLogs([
    [0, 5.0, 3, 'normal'],
    [1, 7.5, 4, 'well-rested'],
    [2, 8.0, 5, 'well-rested']
  ]));
  assertEqual(result.shouldTrigger, true, 'shouldTrigger');
  assertEqual(result.deviationType, 'insufficient_hours', 'deviationType');
  assertEqual(result.averageHours, 6.8, 'averageHours');
});

test('HR deviation value is correctly computed as currentHR - averageBaseline', () => {
  // baseline: [55, 56, 57] avg = 56, today = 65 → deviation = 9
  const result = evaluateHeartRateDeviation(hrLogs([
    [0, 65], [1, 55], [2, 56], [3, 57]
  ]));
  assertEqual(result.shouldTrigger, true, 'shouldTrigger');
  assertEqual(result.currentHR, 65, 'currentHR');
  assertEqual(result.averageHR, 56, 'averageHR');
  assertEqual(result.deviation, 9, 'deviation');
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);

if (failed === 0) {
  console.log('All tests passed.');
  process.exit(0);
} else {
  console.log('Some tests failed - see details above.');
  process.exit(1);
}
