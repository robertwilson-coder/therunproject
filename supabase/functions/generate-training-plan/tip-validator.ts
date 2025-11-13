export function extractRPE(workout: string): number | null {
  const rpeMatch = workout.match(/RPE[:\s]+(\d+)(?:-(\d+))?|Effort[:\s]+(\d+)(?:-(\d+))\/10/i);
  if (rpeMatch) {
    const min = rpeMatch[1] || rpeMatch[3];
    const max = rpeMatch[2] || rpeMatch[4] || min;
    return Math.round((parseInt(min) + parseInt(max)) / 2);
  }
  return null;
}

function inferRPEFromWorkout(workout: string): number | null {
  const workoutLower = workout.toLowerCase();

  if (workoutLower.includes('rest') || workoutLower.includes('active recovery')) {
    return null;
  }

  if (workoutLower.includes('interval') || workoutLower.includes('repeat') || /\d+\s*x\s*[(\d]/.test(workoutLower)) {
    return 8;
  }

  if (workoutLower.includes('tempo')) {
    return 7;
  }

  if (workoutLower.includes('hill')) {
    return 8;
  }

  if (workoutLower.includes('fartlek')) {
    return 7;
  }

  if (workoutLower.includes('long')) {
    return 5;
  }

  if (workoutLower.includes('progressive')) {
    return 7;
  }

  if (workoutLower.includes('easy') || workoutLower.includes('recovery')) {
    return 3;
  }

  return null;
}

function getRPEDescription(rpe: number | null, workout: string): string | null {
  if (!rpe) return null;

  const workoutLower = workout.toLowerCase();
  const isEffortFormat = /Effort[:\s]+\d+/.test(workout);
  const label = isEffortFormat ? "Effort" : "RPE";

  if (workoutLower.includes('rest') || workoutLower.includes('active recovery')) {
    return null;
  }

  if (rpe <= 3) {
    return `**${label} 2-3:** Easy, conversational pace - you should be able to chat comfortably.`;
  } else if (rpe >= 4 && rpe <= 5) {
    return `**${label} 4-5:** Moderate effort - steady and controlled, breathing is rhythmic.`;
  } else if (rpe >= 6 && rpe <= 7) {
    return `**${label} 6-7:** Comfortably hard - you can speak a few words but not hold a conversation.`;
  } else if (rpe >= 8) {
    return `**${label} 8-9:** Hard effort - breathing is labored, focus on quick turnover.`;
  }

  return null;
}

export function getCorrectTips(workout: string, rpe: number | null): string[] {
  const workoutLower = workout.toLowerCase();

  const effectiveRPE = rpe || inferRPEFromWorkout(workout);

  let goal = "**Goal:** Build aerobic endurance and support recovery from harder sessions.";
  let tips: string[] = [];

  if (workoutLower.includes('rest')) {
    goal = "**Goal:** Allow your body to recover and adapt to training stress.";
    tips = [
      "Complete rest helps your body rebuild stronger",
      "Stay hydrated and focus on good nutrition"
    ];
  } else if (workoutLower.includes('active recovery')) {
    goal = "**Goal:** Promote recovery through light movement without running impact.";
    tips = [
      "Keep activity gentle - walking, yoga, or light stretching",
      "This supports recovery without adding training stress"
    ];
  } else if (workoutLower.includes('interval') || workoutLower.includes('repeat') || /\d+\s*x\s*[(\d]/.test(workoutLower)) {
    goal = "**Goal:** Strengthen aerobic capacity and increase sustained speed.";
    if (effectiveRPE && effectiveRPE >= 7) {
      tips = [
        "Focus on quick turnover during the hard efforts",
        "Keep recovery jogs light but maintain movement",
        "Don't skip the warm-up - it's critical for hard sessions"
      ];
    } else {
      tips = [
        "Maintain good form during the work intervals",
        "Use recovery periods to prepare for the next effort"
      ];
    }
  } else if (workoutLower.includes('tempo')) {
    goal = "**Goal:** Improve lactate threshold and your ability to hold faster paces.";
    tips = [
      "Maintain steady breathing rhythm throughout",
      "Start controlled and settle into your tempo pace",
      "This effort should feel sustainably hard"
    ];
  } else if (workoutLower.includes('hill')) {
    goal = "**Goal:** Build leg strength, power and improve running economy uphill.";
    tips = [
      "Focus on driving your knees and maintaining form",
      "Use the downhill recovery to prepare for the next rep",
      "Keep your cadence quick on the uphill efforts"
    ];
  } else if (workoutLower.includes('fartlek')) {
    goal = "**Goal:** Add speed variation to build strength and break up steady running.";
    tips = [
      "Embrace the varied pace - it builds both speed and endurance",
      "Use the easy segments to recover fully",
      "Stay relaxed during the faster segments"
    ];
  } else if (workoutLower.includes('long')) {
    goal = "**Goal:** Increase overall endurance and strengthen fatigue resistance.";
    tips = [
      "Start conservatively and build into your rhythm",
      "Practice your race-day fueling strategy",
      "Focus on consistent effort rather than pace"
    ];
  } else if (workoutLower.includes('progressive')) {
    goal = "**Goal:** Build mental toughness and practice negative splitting.";
    tips = [
      "Start controlled and gradually increase effort",
      "The final third should feel comfortably hard",
      "This teaches you to finish strong when tired"
    ];
  } else if (effectiveRPE && effectiveRPE <= 3) {
    goal = "**Goal:** Build aerobic endurance and support recovery from harder sessions.";
    tips = [
      "Focus on relaxed form and easy breathing",
      "This should feel comfortable throughout",
      "Save energy for harder sessions later in the week"
    ];
  } else if (effectiveRPE && effectiveRPE >= 4 && effectiveRPE <= 5) {
    goal = "**Goal:** Build endurance at a sustainable pace.";
    tips = [
      "Maintain steady, controlled effort",
      "Focus on consistent breathing rhythm",
      "This should feel manageable throughout"
    ];
  } else {
    tips = [
      "Focus on comfortable, sustainable effort",
      "Maintain good running form",
      "Listen to your body"
    ];
  }

  const rpeDescription = getRPEDescription(effectiveRPE, workout);

  if (rpeDescription) {
    return [goal, rpeDescription, ...tips];
  }

  return [goal, ...tips];
}

export function validateTips(planData: any): void {
  if (planData.plan && Array.isArray(planData.plan)) {
    planData.plan.forEach((week: any) => {
      if (week.days) {
        Object.keys(week.days).forEach((day: string) => {
          const dayData = week.days[day];
          if (dayData && dayData.workout) {
            const rpe = extractRPE(dayData.workout);
            const correctTips = getCorrectTips(dayData.workout, rpe);
            dayData.tips = correctTips;
            console.log(`Week ${week.week} ${day}: RPE ${rpe} - ${dayData.workout.substring(0, 60)}...`);
          }
        });
      }
    });
  }
}