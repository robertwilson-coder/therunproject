interface HeartRateLog {
  log_date: string;
  heart_rate: number;
}

interface SleepLog {
  log_date: string;
  hours: number;
  quality: number;
  wake_feeling: 'well-rested' | 'normal' | 'fatigued';
}

export interface HRDeviationResult {
  shouldTrigger: boolean;
  deviationType: 'elevated_single' | 'sustained_elevation' | 'none';
  currentHR: number;
  averageHR: number;
  deviation: number;
  message: string;
}

export interface SleepDeviationResult {
  shouldTrigger: boolean;
  deviationType: 'insufficient_hours' | 'poor_quality' | 'consecutive_poor' | 'none';
  currentHours: number;
  currentQuality: number;
  averageHours: number;
  message: string;
}

const HR_SINGLE_ELEVATION_THRESHOLD = 7;
const HR_SUSTAINED_ELEVATION_THRESHOLD = 5;
const HR_SUSTAINED_DAYS_MIN = 3;
const SLEEP_MIN_HOURS = 6.5;
const SLEEP_POOR_QUALITY = 2;
const SLEEP_CONSECUTIVE_DAYS = 2;

export function evaluateHeartRateDeviation(
  recentHRLogs: HeartRateLog[]
): HRDeviationResult {
  const noTrigger: HRDeviationResult = {
    shouldTrigger: false,
    deviationType: 'none',
    currentHR: 0,
    averageHR: 0,
    deviation: 0,
    message: ''
  };

  if (recentHRLogs.length < 2) return noTrigger;

  const sorted = [...recentHRLogs].sort(
    (a, b) => new Date(b.log_date).getTime() - new Date(a.log_date).getTime()
  );

  const currentHR = sorted[0].heart_rate;

  // Baseline: all readings except today
  const baseline = sorted.slice(1);
  const averageHR = Math.round(
    baseline.reduce((sum, l) => sum + l.heart_rate, 0) / baseline.length
  );
  const deviation = currentHR - averageHR;

  // Single-day spike: today is notably above baseline
  if (deviation >= HR_SINGLE_ELEVATION_THRESHOLD) {
    return {
      shouldTrigger: true,
      deviationType: 'elevated_single',
      currentHR,
      averageHR,
      deviation,
      message: `I noticed your resting heart rate today is ${currentHR} bpm - that's ${deviation} bpm above your recent average of ${averageHR} bpm. This can be a sign of stress, fatigue, or early illness.\n\nA temporarily elevated RHR often means your body hasn't fully recovered and may need lighter training. Would you like me to ease off your next few workouts to let your body catch up?`
    };
  }

  // Sustained elevation: the most recent N readings are all above the older baseline
  if (sorted.length > HR_SUSTAINED_DAYS_MIN) {
    const recentDays = sorted.slice(0, HR_SUSTAINED_DAYS_MIN);
    const olderBaseline = sorted.slice(HR_SUSTAINED_DAYS_MIN);
    const olderAvg = Math.round(
      olderBaseline.reduce((sum, l) => sum + l.heart_rate, 0) / olderBaseline.length
    );
    const allElevated = recentDays.every(
      l => l.heart_rate > olderAvg + HR_SUSTAINED_ELEVATION_THRESHOLD
    );

    if (allElevated) {
      const sustainedAvg = Math.round(
        recentDays.reduce((sum, l) => sum + l.heart_rate, 0) / recentDays.length
      );
      return {
        shouldTrigger: true,
        deviationType: 'sustained_elevation',
        currentHR,
        averageHR: olderAvg,
        deviation: sustainedAvg - olderAvg,
        message: `Your resting heart rate has been elevated for the past ${HR_SUSTAINED_DAYS_MIN} days (averaging ${sustainedAvg} bpm vs your baseline of ${olderAvg} bpm). This sustained pattern often indicates accumulated fatigue or overtraining.\n\nI'd recommend building in a recovery day or two. Want me to adjust your training this week to reduce the load and help your body recover?`
      };
    }
  }

  return noTrigger;
}

export function evaluateSleepDeviation(
  recentSleepLogs: SleepLog[]
): SleepDeviationResult {
  const noTrigger: SleepDeviationResult = {
    shouldTrigger: false,
    deviationType: 'none',
    currentHours: 0,
    currentQuality: 0,
    averageHours: 0,
    message: ''
  };

  if (recentSleepLogs.length === 0) return noTrigger;

  const sorted = [...recentSleepLogs].sort(
    (a, b) => new Date(b.log_date).getTime() - new Date(a.log_date).getTime()
  );

  const latest = sorted[0];
  const currentHours = latest.hours;
  const currentQuality = latest.quality;

  const averageHours = parseFloat(
    (sorted.reduce((sum, l) => sum + l.hours, 0) / sorted.length).toFixed(1)
  );

  // Check consecutive poor nights first - most serious
  if (sorted.length >= SLEEP_CONSECUTIVE_DAYS) {
    const recentDays = sorted.slice(0, SLEEP_CONSECUTIVE_DAYS);
    const allPoor = recentDays.every(
      l => l.hours < SLEEP_MIN_HOURS || l.quality <= SLEEP_POOR_QUALITY || l.wake_feeling === 'fatigued'
    );

    if (allPoor) {
      return {
        shouldTrigger: true,
        deviationType: 'consecutive_poor',
        currentHours,
        currentQuality,
        averageHours,
        message: `I've noticed you've had ${SLEEP_CONSECUTIVE_DAYS} nights of poor or insufficient sleep in a row. Accumulated sleep debt seriously impacts recovery, performance, and injury risk for runners.\n\nI'd strongly suggest pulling back training intensity until your sleep improves. Want me to dial down the next few sessions to give your body a chance to recover properly?`
      };
    }
  }

  // Single night: not enough hours
  if (currentHours < SLEEP_MIN_HOURS) {
    return {
      shouldTrigger: true,
      deviationType: 'insufficient_hours',
      currentHours,
      currentQuality,
      averageHours,
      message: `I can see you only got ${currentHours} hours of sleep last night. That's below the 7-9 hours runners need to recover and adapt from training.\n\nSleep is when your muscles repair and your fitness gains are consolidated - poor sleep can actually increase injury risk and make training feel much harder. Would you like me to reduce the intensity of today's or tomorrow's workout to compensate?`
    };
  }

  // Single night: poor quality despite enough hours
  if (currentQuality <= SLEEP_POOR_QUALITY) {
    return {
      shouldTrigger: true,
      deviationType: 'poor_quality',
      currentHours,
      currentQuality,
      averageHours,
      message: `You logged ${currentHours} hours of sleep but rated the quality as ${currentQuality}/5. Poor sleep quality - even with enough hours - can leave you under-recovered, especially with training stress.\n\nWould you like me to adjust your training load for today or the next couple of days to account for this?`
    };
  }

  return noTrigger;
}
