interface CalibrationData {
  workDuration: number;
  workDistance: number;
  averagePaceSeconds: number;
  paceSplitDifference: number;
  elevationGain: number;
  averageHeartRate: number;
  heartRateDrift: number;
  stoppedOrWalked: boolean;
  effortConsistency: number;
  lapSplits?: number[];
  notes: string;
}

interface CalibrationAssessment {
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  pacingQuality: 'EXCELLENT' | 'GOOD' | 'POOR';
  feedbackText: string;
}

function assessPacingQuality(data: CalibrationData): 'EXCELLENT' | 'GOOD' | 'POOR' {
  const splitDiff = data.paceSplitDifference;
  const effortConsistency = data.effortConsistency;
  const stoppedOrWalked = data.stoppedOrWalked;

  if (stoppedOrWalked) {
    return 'POOR';
  }

  if (data.lapSplits && data.lapSplits.length >= 3) {
    const paceVariability = calculatePaceVariability(data.lapSplits);

    if (paceVariability < 10 && Math.abs(splitDiff) < 15) {
      return 'EXCELLENT';
    } else if (paceVariability < 20 || Math.abs(splitDiff) < 30) {
      return 'GOOD';
    } else {
      return 'POOR';
    }
  }

  if (Math.abs(splitDiff) < 10 && effortConsistency >= 7) {
    return 'EXCELLENT';
  } else if (Math.abs(splitDiff) < 30 && effortConsistency >= 5) {
    return 'GOOD';
  } else {
    return 'POOR';
  }
}

function calculatePaceVariability(lapSplits: number[]): number {
  if (lapSplits.length < 2) return 0;

  const avgPace = lapSplits.reduce((sum, pace) => sum + pace, 0) / lapSplits.length;
  const variance = lapSplits.reduce((sum, pace) => sum + Math.pow(pace - avgPace, 2), 0) / lapSplits.length;
  return Math.sqrt(variance);
}

function assessConfidenceLevel(
  pacingQuality: 'EXCELLENT' | 'GOOD' | 'POOR',
  data: CalibrationData
): 'HIGH' | 'MEDIUM' | 'LOW' {
  const hasHeartRateData = data.averageHeartRate > 0;
  const effortConsistency = data.effortConsistency;

  if (pacingQuality === 'EXCELLENT' && effortConsistency >= 7) {
    return 'HIGH';
  }

  if (pacingQuality === 'POOR' || data.stoppedOrWalked) {
    return 'LOW';
  }

  if (data.paceSplitDifference > 45 || effortConsistency <= 3) {
    return 'LOW';
  }

  if (hasHeartRateData && Math.abs(data.heartRateDrift) > 20) {
    return 'LOW';
  }

  if (pacingQuality === 'GOOD' && effortConsistency >= 5) {
    return 'MEDIUM';
  }

  return 'MEDIUM';
}

function generateFeedback(
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW',
  pacingQuality: 'EXCELLENT' | 'GOOD' | 'POOR',
  data: CalibrationData
): string {
  const sections: string[] = [];

  sections.push(generateHeadline(confidenceLevel));
  sections.push(generateObservations(pacingQuality, data));
  sections.push(generateTrainingMeaning(confidenceLevel, pacingQuality));
  sections.push(generateWhatWillChange(confidenceLevel));
  sections.push(generateWhatWillNotChange());
  sections.push(generateCoachingFocus(confidenceLevel, pacingQuality, data));

  return sections.join('\n\n');
}

function generateHeadline(confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW'): string {
  const headlines = {
    HIGH: [
      "Thanks — this gave us a clear reference to guide your training.",
      "Excellent information here — we have what we need to build your plan with confidence.",
      "This provides a solid foundation for your training progression."
    ],
    MEDIUM: [
      "Thanks — this gave us useful information to guide your training.",
      "Good information here — we'll use this to keep training controlled and progressive.",
      "This gives us a helpful starting point for your plan."
    ],
    LOW: [
      "Thanks — this gave us a useful reference to guide your training.",
      "We have what we need to start your training safely and effectively.",
      "This tells us exactly where to begin your training journey."
    ]
  };

  const options = headlines[confidenceLevel];
  return options[Math.floor(Math.random() * options.length)];
}

function generateObservations(
  pacingQuality: 'EXCELLENT' | 'GOOD' | 'POOR',
  data: CalibrationData
): string {
  const observations: string[] = [];

  observations.push("**What We Saw:**");

  if (data.stoppedOrWalked) {
    observations.push("• The effort required some walking or stopping, which is completely normal for a challenging test");
  } else if (pacingQuality === 'EXCELLENT') {
    observations.push("• Effort was well-controlled with consistent pacing throughout");
  } else if (pacingQuality === 'GOOD') {
    if (data.paceSplitDifference > 20) {
      observations.push("• Effort was controlled early, with some natural fatigue later on");
    } else if (data.paceSplitDifference < -20) {
      observations.push("• You started conservatively and finished stronger, showing good control");
    } else {
      observations.push("• Pacing varied slightly, which is very common in sustained efforts");
    }
  } else {
    if (data.paceSplitDifference > 45) {
      observations.push("• Pace varied significantly during the effort, which tells us about your current fitness level");
    } else {
      observations.push("• The effort challenged your current fitness, which gives us a clear starting point");
    }
  }

  if (data.effortConsistency <= 3) {
    observations.push("• Effort felt uneven, which is valuable feedback about how to structure early workouts");
  } else if (data.effortConsistency >= 7) {
    observations.push("• The effort felt relatively steady, which helps us gauge appropriate intensity levels");
  }

  if (data.averageHeartRate > 0) {
    if (Math.abs(data.heartRateDrift) < 10) {
      observations.push("• Heart rate stayed consistent, indicating good aerobic control");
    } else if (data.heartRateDrift > 15) {
      observations.push("• Heart rate rose during the effort, which is typical when pushing into harder zones");
    }
  }

  if (data.elevationGain > 100) {
    observations.push("• The route included notable elevation, which we'll factor into our assessment");
  }

  return observations.join('\n');
}

function generateTrainingMeaning(
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW',
  pacingQuality: 'EXCELLENT' | 'GOOD' | 'POOR'
): string {
  const meanings = {
    HIGH: "**What This Means for Your Training:**\nYour test showed strong pacing control and consistent effort, which means we can be more specific with pace guidance early on. Workouts will be calibrated to feel challenging but repeatable, with clear targets that match your current fitness. We'll progress intensity gradually as you adapt.",

    MEDIUM: "**What This Means for Your Training:**\nYour test gives us a good reference point, though we'll emphasize effort-based guidance early on to ensure workouts feel manageable. As you build fitness and control, we'll introduce more specific pace targets. The key is keeping quality sessions productive without overreaching.",

    LOW: "**What This Means for Your Training:**\nYour test tells us to start with broader effort-based guidance rather than strict pace targets. This isn't a limitation — it's the right approach to build fitness safely. Early workouts will focus on learning what controlled effort feels like, then we'll sharpen as your aerobic base develops."
  };

  return meanings[confidenceLevel];
}

function generateWhatWillChange(confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW'): string {
  const changes = {
    HIGH: [
      "• Quality workouts will include specific pace ranges from the start",
      "• Progression will be steady and performance-focused",
      "• You'll get clear targets based on your demonstrated control",
      "• Intensity will increase as fitness improves"
    ],
    MEDIUM: [
      "• Early quality workouts will emphasize effort over exact pace",
      "• Pace guidance will become more specific as you progress",
      "• We'll focus on building control and consistency first",
      "• Intensity will increase gradually based on how sessions feel"
    ],
    LOW: [
      "• Quality workouts will be effort-based rather than pace-based initially",
      "• Easy runs will be truly easy to build your aerobic foundation",
      "• We'll emphasize feeling and control over specific numbers",
      "• Progression will be conservative and sustainable"
    ]
  };

  const items = changes[confidenceLevel];
  return "**What Will Change:**\n" + items.join('\n');
}

function generateWhatWillNotChange(): string {
  return `**What Will Not Change:**
• Your training days and rest days
• The overall structure of your plan
• Your race goal and target
• Taper timing before your race
• Long run progression strategy`;
}

function generateCoachingFocus(
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW',
  pacingQuality: 'EXCELLENT' | 'GOOD' | 'POOR',
  data: CalibrationData
): string {
  let focus: string;

  if (confidenceLevel === 'HIGH') {
    focus = "Trust your pacing on quality days — you've shown you can hold controlled efforts.";
  } else if (data.stoppedOrWalked || data.paceSplitDifference > 45) {
    focus = "Start quality efforts slightly easier than you think — let the effort build naturally.";
  } else {
    focus = "Keep easy days truly easy — building your aerobic base is the foundation of everything.";
  }

  return `**Coaching Focus (Next 1-2 Weeks):**\n${focus}`;
}

export function assessCalibrationTest(data: CalibrationData): CalibrationAssessment {
  const pacingQuality = assessPacingQuality(data);
  const confidenceLevel = assessConfidenceLevel(pacingQuality, data);
  const feedbackText = generateFeedback(confidenceLevel, pacingQuality, data);

  return {
    confidenceLevel,
    pacingQuality,
    feedbackText
  };
}
