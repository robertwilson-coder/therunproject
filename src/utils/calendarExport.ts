import { parseLocalDate } from './dateUtils';

interface Workout {
  week: number;
  day: number;
  type: string;
  description: string;
  duration?: string;
  distance?: string;
  pace?: string;
}

interface TrainingPlan {
  plan_content: {
    weeks: Array<{
      weekNumber: number;
      workouts: Workout[];
    }>;
  };
  start_date?: string;
}

export function generateICalFile(plan: TrainingPlan, planName: string): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const startDate = plan.start_date ? parseLocalDate(plan.start_date) : new Date();

  let icalContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The Run Project//Training Plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + planName,
    'X-WR-TIMEZONE:UTC',
  ].join('\r\n');

  plan.plan_content.weeks.forEach(week => {
    week.workouts.forEach(workout => {
      const workoutDate = new Date(startDate);
      const daysOffset = (week.weekNumber - 1) * 7 + (workout.day - 1);
      workoutDate.setDate(startDate.getDate() + daysOffset);

      const eventStart = formatICalDate(workoutDate);
      const eventEnd = formatICalDate(new Date(workoutDate.getTime() + 60 * 60 * 1000));

      let description = workout.description;
      if (workout.duration) description += `\\nDuration: ${workout.duration}`;
      if (workout.distance) description += `\\nDistance: ${workout.distance}`;
      if (workout.pace) description += `\\nPace: ${workout.pace}`;

      description = description.replace(/\n/g, '\\n');

      const uid = `workout-w${week.weekNumber}-d${workout.day}-${timestamp}@therunproject.com`;

      icalContent += '\r\n' + [
        'BEGIN:VEVENT',
        'UID:' + uid,
        'DTSTAMP:' + timestamp,
        'DTSTART:' + eventStart,
        'DTEND:' + eventEnd,
        'SUMMARY:' + workout.type,
        'DESCRIPTION:' + description,
        'STATUS:CONFIRMED',
        'SEQUENCE:0',
        'END:VEVENT',
      ].join('\r\n');
    });
  });

  icalContent += '\r\nEND:VCALENDAR';

  return icalContent;
}

function formatICalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

export function downloadICalFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
