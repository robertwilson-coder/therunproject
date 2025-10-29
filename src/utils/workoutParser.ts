export interface ParsedWorkout {
  distanceMiles: number;
  durationMinutes: number;
}

export function parseWorkoutDescription(description: string): ParsedWorkout {
  const result: ParsedWorkout = {
    distanceMiles: 0,
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
      result.distanceMiles = parseFloat(milesMatch[1]);
    }

    const kmMatch = description.match(/(\d+(?:\.\d+)?)\s*(?:kilometers?|km)\b/i);
    if (kmMatch) {
      result.distanceMiles = parseFloat(kmMatch[1]) * 0.621371;
    }

    // Also check for "mi" but be more careful
    const miMatch = description.match(/(\d+(?:\.\d+)?)\s*mi\b/i);
    if (miMatch && !description.match(/\bmin\b/i)) { // Only if "min" is not present
      result.distanceMiles = parseFloat(miMatch[1]);
    }
  }

  return result;
}
