export interface ParsedWorkout {
  distanceMiles: number;
  durationMinutes: number;
}

export function parseWorkoutDescription(description: string): ParsedWorkout {
  const result: ParsedWorkout = {
    distanceMiles: 0,
    durationMinutes: 0,
  };

  const milesMatch = description.match(/(\d+(?:\.\d+)?)\s*(?:miles?|mi)/i);
  if (milesMatch) {
    result.distanceMiles = parseFloat(milesMatch[1]);
  }

  const kmMatch = description.match(/(\d+(?:\.\d+)?)\s*(?:kilometers?|km)/i);
  if (kmMatch) {
    result.distanceMiles = parseFloat(kmMatch[1]) * 0.621371;
  }

  const hoursMatch = description.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i);
  if (hoursMatch) {
    result.durationMinutes += parseFloat(hoursMatch[1]) * 60;
  }

  const minutesMatch = description.match(/(\d+)\s*(?:minutes?|mins?)/i);
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

  return result;
}
