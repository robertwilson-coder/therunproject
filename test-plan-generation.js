#!/usr/bin/env node

/**
 * Automated demo plan generation and testing script
 *
 * Tests that:
 * 1. Preview plans generate successfully
 * 2. Full plans preserve preview workouts exactly
 * 3. Plans have appropriate difficulty/intensity
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

let supabase = createClient(supabaseUrl, supabaseAnonKey);
let authToken = supabaseAnonKey;

// Test configurations
const TEST_PLANS = [
  {
    name: 'Intermediate 10K Runner',
    answers: {
      raceDistance: '10K',
      raceDate: '2026-03-15',
      experience: 'intermediate',
      longestRun: 12,
      currentWeeklyKm: '30-40',
      availableDays: ['Mon', 'Wed', 'Fri', 'Sat'],
      goals: 'Improve speed and endurance'
    },
    startDate: '2026-01-26',
    trainingPaces: {
      easyPace: '6:00/km',
      longRunPace: '6:15/km',
      tempoPace: '5:15/km',
      intervalPace: '4:45/km',
      racePace: '5:00/km'
    }
  },
  {
    name: 'Advanced Half Marathon Runner',
    answers: {
      raceDistance: 'Half Marathon',
      raceDate: '2026-04-05',
      experience: 'advanced',
      longestRun: 18,
      currentWeeklyKm: '50-60',
      availableDays: ['Mon', 'Tue', 'Thu', 'Sat', 'Sun'],
      goals: 'Sub 1:45:00 finish'
    },
    startDate: '2026-01-26',
    trainingPaces: {
      easyPace: '5:30/km',
      longRunPace: '5:45/km',
      tempoPace: '4:45/km',
      intervalPace: '4:15/km',
      racePace: '4:30/km'
    }
  },
  {
    name: 'Beginner 5K Runner',
    answers: {
      raceDistance: '5K',
      raceDate: '2026-03-01',
      experience: 'beginner',
      longestRun: 4,
      currentWeeklyKm: '10-15',
      availableDays: ['Tue', 'Thu', 'Sat'],
      goals: 'Complete first 5K'
    },
    startDate: '2026-01-26',
    trainingPaces: null
  }
];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function setupTestUser() {
  console.log('🔐 Setting up test user...');

  const testEmail = 'plantest@therunproject.com';
  const testPassword = 'TestPlanPassword123!';

  try {
    // Try to sign in with existing test user
    let { data, error } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });

    if (error && error.message.includes('Invalid login')) {
      // User doesn't exist, try to create it
      console.log('   Creating new test user...');
      const signUpResult = await supabase.auth.signUp({
        email: testEmail,
        password: testPassword
      });

      if (signUpResult.error) {
        throw signUpResult.error;
      }

      data = signUpResult.data;
    } else if (error) {
      throw error;
    }

    if (data.session) {
      authToken = data.session.access_token;
      console.log('✅ Test user authenticated');
      return data.user;
    }

    throw new Error('No session returned from authentication');

  } catch (error) {
    console.error('❌ Failed to setup test user:', error.message);
    console.error('   You may need to manually create the test user in Supabase dashboard:');
    console.error(`   Email: ${testEmail}`);
    console.error(`   Password: ${testPassword}`);
    throw error;
  }
}

async function generatePreview(config) {
  console.log(`\n📝 Generating preview for: ${config.name}`);

  const response = await fetch(`${supabaseUrl}/functions/v1/generate-preview-plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      answers: config.answers,
      startDate: config.startDate,
      trainingPaces: config.trainingPaces
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Preview generation failed: ${error}`);
  }

  const data = await response.json();
  console.log(`✅ Preview generated (Plan ID: ${data.plan_id})`);
  return data;
}

async function acceptPreview(planId) {
  console.log(`\n🚀 Accepting preview and generating full plan...`);

  const response = await fetch(`${supabaseUrl}/functions/v1/accept-preview-plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({ planId })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Accept preview failed: ${error}`);
  }

  const data = await response.json();
  console.log(`✅ Full plan generation started (Job ID: ${data.job_id})`);
  return data.job_id;
}

async function pollJobStatus(jobId) {
  console.log(`\n⏳ Waiting for full plan generation...`);

  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max

  while (attempts < maxAttempts) {
    const { data: job, error } = await supabase
      .from('plan_generation_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error) {
      throw new Error(`Failed to fetch job status: ${error.message}`);
    }

    if (job.status === 'completed') {
      console.log(`✅ Full plan generation completed!`);
      return job;
    }

    if (job.status === 'failed') {
      throw new Error(`Job failed: ${job.error_message}`);
    }

    process.stdout.write(`\r⏳ Progress: ${job.progress || 0}%`);
    await sleep(5000); // Poll every 5 seconds
    attempts++;
  }

  throw new Error('Job timeout - took longer than 5 minutes');
}

async function getFullPlan(planId) {
  const { data: plan, error } = await supabase
    .from('training_plans')
    .select('*')
    .eq('id', planId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch plan: ${error.message}`);
  }

  return plan;
}

function analyzePreviewConsistency(previewPlan, fullPlan) {
  console.log(`\n🔍 Analyzing preview consistency...`);

  const previewDays = previewPlan.days || [];
  const fullDays = fullPlan.plan_data?.days || [];

  const trainingDays = previewDays.filter(d => d.workout_type === 'TRAIN');

  let matches = 0;
  let differences = [];

  trainingDays.forEach(previewDay => {
    const fullDay = fullDays.find(d => d.date === previewDay.date);

    if (!fullDay) {
      differences.push(`Missing day: ${previewDay.date}`);
      return;
    }

    if (previewDay.workout === fullDay.workout) {
      matches++;
    } else {
      differences.push({
        date: previewDay.date,
        preview: previewDay.workout.substring(0, 100),
        full: fullDay.workout.substring(0, 100)
      });
    }
  });

  const matchRate = (matches / trainingDays.length) * 100;

  console.log(`\n📊 Results:`);
  console.log(`   Training days in preview: ${trainingDays.length}`);
  console.log(`   Exact matches: ${matches}/${trainingDays.length} (${matchRate.toFixed(1)}%)`);

  if (differences.length > 0 && matchRate < 100) {
    console.log(`\n⚠️  Found ${differences.length} differences:`);
    differences.slice(0, 3).forEach(diff => {
      if (typeof diff === 'string') {
        console.log(`   - ${diff}`);
      } else {
        console.log(`\n   📅 ${diff.date}:`);
        console.log(`      Preview: ${diff.preview}...`);
        console.log(`      Full:    ${diff.full}...`);
      }
    });
  }

  return matchRate === 100;
}

function analyzeIntensity(plan) {
  console.log(`\n💪 Analyzing workout intensity...`);

  const days = plan.plan_data?.days || [];
  const trainingDays = days.filter(d => d.workout_type === 'TRAIN');

  // Count different workout types
  let easyRuns = 0;
  let longRuns = 0;
  let qualityWorkouts = 0;

  trainingDays.forEach(day => {
    const workout = day.workout.toLowerCase();

    if (workout.includes('easy') && !workout.includes('tempo') && !workout.includes('interval')) {
      easyRuns++;
    } else if (workout.includes('long run')) {
      longRuns++;
    } else if (workout.includes('tempo') || workout.includes('interval') || workout.includes('hill') || workout.includes('fartlek')) {
      qualityWorkouts++;
    }
  });

  console.log(`\n📊 Workout Distribution:`);
  console.log(`   Easy runs: ${easyRuns}`);
  console.log(`   Long runs: ${longRuns}`);
  console.log(`   Quality workouts: ${qualityWorkouts}`);

  const hasQuality = qualityWorkouts > 0;
  const hasVariety = easyRuns > 0 && longRuns > 0;

  if (!hasQuality) {
    console.log(`   ⚠️  No quality workouts detected - plan may be too easy`);
  }

  if (!hasVariety) {
    console.log(`   ⚠️  Lacking workout variety`);
  }

  if (hasQuality && hasVariety) {
    console.log(`   ✅ Good workout variety and intensity`);
  }

  return hasQuality && hasVariety;
}

async function testCalibrationCompletion(userId, planId, plan) {
  console.log(`\n🎯 Testing calibration workout completion...`);

  const days = plan.plan_data?.days || [];

  // Find a calibration workout in week 1
  const calibrationDay = days.find(d => {
    const workout = d.workout.toLowerCase();
    return d.week_number === 1 &&
           d.workout_type === 'TRAIN' &&
           (workout.includes('calibration') ||
            (workout.includes('warm up:') &&
             workout.includes('work:') &&
             workout.includes('cool down:')));
  });

  if (!calibrationDay) {
    console.log(`   ℹ️  No calibration workout found in week 1 - skipping test`);
    return 'skipped';
  }

  console.log(`   Found calibration workout: ${calibrationDay.day_name} - ${calibrationDay.workout.substring(0, 60)}...`);

  try {
    // Complete the calibration workout with all custom fields
    const { data, error } = await supabase
      .from('calibration_completions')
      .insert({
        user_id: userId,
        training_plan_id: planId,
        week_number: calibrationDay.week_number,
        day_name: calibrationDay.day_name,
        test_type: calibrationDay.workout,
        work_duration_minutes: 15,
        work_distance_km: 3.5,
        average_pace_seconds: 270,
        pace_split_difference_seconds: -5,
        elevation_gain_meters: 25,
        average_heart_rate: 165,
        heart_rate_drift: 8,
        notes: 'Test calibration completion - felt strong and controlled'
      })
      .select()
      .single();

    if (error) {
      console.log(`   ❌ Failed to save calibration completion: ${error.message}`);
      return false;
    }

    console.log(`   ✅ Calibration completion saved successfully`);
    console.log(`   📊 Recorded data:`);
    console.log(`      Work duration: ${data.work_duration_minutes} minutes`);
    console.log(`      Work distance: ${data.work_distance_km} km`);
    console.log(`      Average pace: ${Math.floor(data.average_pace_seconds / 60)}:${(data.average_pace_seconds % 60).toString().padStart(2, '0')}/km`);
    console.log(`      Pace split: ${data.pace_split_difference_seconds}s/km`);
    console.log(`      Elevation: ${data.elevation_gain_meters}m`);
    console.log(`      Avg HR: ${data.average_heart_rate} bpm`);
    console.log(`      HR drift: ${data.heart_rate_drift} bpm`);

    // Verify we can retrieve it
    const { data: retrieved, error: retrieveError } = await supabase
      .from('calibration_completions')
      .select('*')
      .eq('id', data.id)
      .single();

    if (retrieveError || !retrieved) {
      console.log(`   ❌ Failed to retrieve calibration completion`);
      return false;
    }

    console.log(`   ✅ Calibration completion retrieved successfully`);
    return true;

  } catch (error) {
    console.error(`   ❌ Error testing calibration: ${error.message}`);
    return false;
  }
}

async function testPlan(config, userId) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${config.name}`);
  console.log(`${'='.repeat(60)}`);

  try {
    // Step 1: Generate preview
    const previewData = await generatePreview(config);

    // Step 2: Accept preview and start full generation
    const jobId = await acceptPreview(previewData.plan_id);

    // Step 3: Wait for completion
    await pollJobStatus(jobId);

    // Step 4: Get full plan
    const fullPlan = await getFullPlan(previewData.plan_id);

    // Step 5: Analyze results
    const isConsistent = analyzePreviewConsistency(previewData, fullPlan);
    const hasGoodIntensity = analyzeIntensity(fullPlan);

    // Step 6: Test calibration completion (if applicable)
    let calibrationWorked = null;
    if (config.experience !== 'beginner') {
      calibrationWorked = await testCalibrationCompletion(userId, previewData.plan_id, fullPlan);
    }

    return {
      name: config.name,
      success: true,
      consistent: isConsistent,
      goodIntensity: hasGoodIntensity,
      calibrationWorked,
      planId: previewData.plan_id
    };

  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    return {
      name: config.name,
      success: false,
      error: error.message
    };
  }
}

async function main() {
  console.log('🏃 Starting automated plan generation tests\n');

  // Setup test user first
  const user = await setupTestUser();

  console.log(`\nTesting ${TEST_PLANS.length} different configurations...\n`);

  const results = [];

  for (const config of TEST_PLANS) {
    const result = await testPlan(config, user.id);
    results.push(result);
    await sleep(2000); // Brief pause between tests
  }

  // Summary
  console.log(`\n\n${'='.repeat(60)}`);
  console.log('📊 FINAL SUMMARY');
  console.log(`${'='.repeat(60)}\n`);

  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    console.log(`${status} ${result.name}`);

    if (result.success) {
      console.log(`   Consistency: ${result.consistent ? '✅ Perfect' : '⚠️  Has differences'}`);
      console.log(`   Intensity: ${result.goodIntensity ? '✅ Good' : '⚠️  Too easy'}`);
      if (result.calibrationWorked !== null) {
        if (result.calibrationWorked === 'skipped') {
          console.log(`   Calibration: ℹ️  Not applicable`);
        } else {
          console.log(`   Calibration: ${result.calibrationWorked ? '✅ Works' : '❌ Failed'}`);
        }
      }
      console.log(`   Plan ID: ${result.planId}`);
    } else {
      console.log(`   Error: ${result.error}`);
    }
    console.log('');
  });

  const allPassed = results.every(r => {
    if (!r.success || !r.consistent) return false;
    if (r.calibrationWorked !== null && r.calibrationWorked !== 'skipped' && !r.calibrationWorked) return false;
    return true;
  });

  const allOptimal = results.every(r => {
    if (!r.success || !r.consistent || !r.goodIntensity) return false;
    if (r.calibrationWorked !== null && r.calibrationWorked !== 'skipped' && !r.calibrationWorked) return false;
    return true;
  });

  if (allPassed) {
    if (allOptimal) {
      console.log('🎉 All tests passed with optimal results!\n');
    } else {
      console.log('✅ All critical tests passed (some warnings on intensity/variety)\n');
    }
    process.exit(0);
  } else {
    console.log('❌ Some critical tests failed\n');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
