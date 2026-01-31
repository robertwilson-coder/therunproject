export interface ParsedWorkout {
  distanceKm: number;
  durationMinutes: number;
  distance?: string;
  duration?: string;
  pace?: string;
}

export interface WorkoutSections {
  warmUp?: string;
  work?: string;
  coolDown?: string;
}

export function parseWorkoutDescription(description: string): ParsedWorkout {
  const result: ParsedWorkout = {
    distanceKm: 0,
    durationMinutes: 0,
  };

  // Parse time first - must have explicit unit (min, mins, minutes, hr, hrs, hours)
  const hoursMatch = description.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i);
  if (hoursMatch) {
    result.durationMinutes += parseFloat(hoursMatch[1]) * 60;
  }

  const minutesMatch = description.match(/(\d+)\s*(?:minutes?|mins?|min)\b/i);
  if (minutesMatch) {
    result.durationMinutes += parseFloat(minutesMatch[1]);
  }

  const timeMatch = description.match(/(\d+):(\d+)(?::(\d+))?/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
    result.durationMinutes = hours * 60 + minutes + seconds / 60;
  }

  // Only parse distance if no time was found (to avoid confusion between time-based and distance-based workouts)
  if (result.durationMinutes === 0) {
    const milesMatch = description.match(/(\d+(?:\.\d+)?)\s*(?:miles?)\b/i);
    if (milesMatch) {
      result.distanceKm = parseFloat(milesMatch[1]) * 1.609;
    }

    const kmMatch = description.match(/(\d+(?:\.\d+)?)\s*(?:kilometers?|km)\b/i);
    if (kmMatch) {
      result.distanceKm = parseFloat(kmMatch[1]);
    }

    // Also check for "mi" but be more careful
    const miMatch = description.match(/(\d+(?:\.\d+)?)\s*mi\b/i);
    if (miMatch && !description.match(/\bmin\b/i)) { // Only if "min" is not present
      result.distanceKm = parseFloat(miMatch[1]) * 1.609;
    }
  }

  return result;
}

export function parseWorkoutSections(description: string): WorkoutSections {
  const sections: WorkoutSections = {};

  const warmUpRegex = /(?:\*\*)?(?:warm[\s-]?up|warmup)(?:\*\*)?[:\s]+(.+?)(?=(?:\*\*)?(?:work|main set|intervals|tempo|cool[\s-]?down|cooldown)(?:\*\*)?[:\s]|$)/is;
  const workRegex = /(?:\*\*)?(?:work|main set|workout|intervals|tempo|repeats)(?:\*\*)?[:\s]+(.+?)(?=(?:\*\*)?(?:cool[\s-]?down|cooldown)(?:\*\*)?[:\s]|$)/is;
  const coolDownRegex = /(?:\*\*)?(?:cool[\s-]?down|cooldown)(?:\*\*)?[:\s]+(.+?)$/is;

  const warmUpMatch = description.match(warmUpRegex);
  if (warmUpMatch) {
    sections.warmUp = warmUpMatch[1].trim();
  }

  const workMatch = description.match(workRegex);
  if (workMatch) {
    sections.work = workMatch[1].trim();
  }

  const coolDownMatch = description.match(coolDownRegex);
  if (coolDownMatch) {
    sections.coolDown = coolDownMatch[1].trim();
  }

  return sections;
}
