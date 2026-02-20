// Simple test for RPE deviation logic
// Run with: node test-rpe-deviation.js

const testCases = [
  {
    name: "Easy run felt too hard",
    activity: "Easy 5km (RPE 2-3)",
    completedRPE: 5,
    expectedDeviation: 2,
    expectedTrigger: true,
    expectedType: "much-harder"
  },
  {
    name: "Tempo run felt easy",
    activity: "Tempo 6km (RPE 6-7)",
    completedRPE: 4,
    expectedDeviation: -2,
    expectedTrigger: true,
    expectedType: "much-easier"
  },
  {
    name: "Intervals within range",
    activity: "8 x 400m intervals (RPE 7-9)",
    completedRPE: 8,
    expectedDeviation: 0,
    expectedTrigger: false,
    expectedType: "none"
  },
  {
    name: "Long run slightly harder (within tolerance)",
    activity: "Long run 15km (RPE 4-5)",
    completedRPE: 6,
    expectedDeviation: 1,
    expectedTrigger: false,
    expectedType: "none"
  },
  {
    name: "Recovery run much too hard",
    activity: "Recovery 3km easy",
    completedRPE: 7,
    expectedDeviation: 4,
    expectedTrigger: true,
    expectedType: "much-harder"
  },
  {
    name: "Non-race workout at max effort",
    activity: "Hill repeats",
    completedRPE: 9,
    expectedDeviation: 0, // within range 7-9
    expectedTrigger: true, // but triggers due to 9/10 on non-race
    expectedType: "much-harder"
  },
  {
    name: "Race day at max effort (should not trigger)",
    activity: "Race Day - Marathon",
    completedRPE: 10,
    expectedDeviation: 0, // 10 is within 9-10 range
    expectedTrigger: false, // race day exception (10 is expected)
    expectedType: "none"
  }
];

// Mock implementation of key functions
function extractPrescribedRPE(activityDescription) {
  const rpeMatch = activityDescription.match(/(?:RPE|Effort)[:\s]+(\d+)(?:-(\d+))?/i);

  if (rpeMatch) {
    const min = parseInt(rpeMatch[1]);
    const max = rpeMatch[2] ? parseInt(rpeMatch[2]) : min;
    return { min, max, midpoint: (min + max) / 2 };
  }

  const activityLower = activityDescription.toLowerCase();

  if (activityLower.includes('race day')) return { min: 9, max: 10, midpoint: 9.5 };
  if (activityLower.includes('interval') || activityLower.includes('hill')) return { min: 7, max: 9, midpoint: 8 };
  if (activityLower.includes('tempo')) return { min: 6, max: 7, midpoint: 6.5 };
  if (activityLower.includes('long')) return { min: 4, max: 5, midpoint: 4.5 };
  if (activityLower.includes('recovery') || activityLower.includes('easy')) return { min: 2, max: 3, midpoint: 2.5 };

  return null;
}

function calculateDeviation(prescribedRange, completedRPE) {
  if (!prescribedRange) return 0;

  if (completedRPE >= prescribedRange.min && completedRPE <= prescribedRange.max) {
    return 0;
  }

  if (completedRPE > prescribedRange.max) {
    return completedRPE - prescribedRange.max;
  }

  return -(prescribedRange.min - completedRPE);
}

function evaluateWorkoutEffortDeviation(activityDescription, completedRPE) {
  const DEVIATION_THRESHOLD = 2;
  const prescribedRange = extractPrescribedRPE(activityDescription);
  const deviation = calculateDeviation(prescribedRange, completedRPE);
  const absDeviation = Math.abs(deviation);

  if (absDeviation >= DEVIATION_THRESHOLD) {
    if (deviation > 0) {
      return { shouldTrigger: true, deviationType: 'much-harder', deviation };
    } else {
      return { shouldTrigger: true, deviationType: 'much-easier', deviation };
    }
  }

  if (completedRPE >= 9 && !activityDescription.toLowerCase().includes('race')) {
    return { shouldTrigger: true, deviationType: 'much-harder', deviation };
  }

  return { shouldTrigger: false, deviationType: 'none', deviation };
}

// Run tests
console.log('🧪 RPE Deviation Logic Tests\n');
console.log('═'.repeat(80));

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
  console.log(`\nTest ${index + 1}: ${testCase.name}`);
  console.log(`Activity: "${testCase.activity}"`);
  console.log(`Completed RPE: ${testCase.completedRPE}`);

  const result = evaluateWorkoutEffortDeviation(testCase.activity, testCase.completedRPE);

  const deviationMatch = result.deviation === testCase.expectedDeviation;
  const triggerMatch = result.shouldTrigger === testCase.expectedTrigger;
  const typeMatch = result.deviationType === testCase.expectedType;

  console.log(`Expected: deviation=${testCase.expectedDeviation}, trigger=${testCase.expectedTrigger}, type=${testCase.expectedType}`);
  console.log(`Got:      deviation=${result.deviation}, trigger=${result.shouldTrigger}, type=${result.deviationType}`);

  if (deviationMatch && triggerMatch && typeMatch) {
    console.log('✅ PASS');
    passed++;
  } else {
    console.log('❌ FAIL');
    if (!deviationMatch) console.log(`  - Deviation mismatch`);
    if (!triggerMatch) console.log(`  - Trigger mismatch`);
    if (!typeMatch) console.log(`  - Type mismatch`);
    failed++;
  }
});

console.log('\n' + '═'.repeat(80));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);

if (failed === 0) {
  console.log('🎉 All tests passed!');
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed');
  process.exit(1);
}
