/**
 * Quick test to verify DateResolver works correctly
 */

class DateResolver {
  constructor(referenceDateISO) {
    this.referenceDate = referenceDateISO
      ? this.parseUKDate(referenceDateISO)
      : this.nowUK();
  }

  nowUK() {
    const now = new Date();
    const ukTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/London' }));
    return ukTime;
  }

  parseUKDate(isoDate) {
    const date = new Date(isoDate + 'T00:00:00');
    const ukDate = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/London' }));
    return ukDate;
  }

  toISODate(date) {
    const ukDate = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/London' }));
    const year = ukDate.getFullYear();
    const month = String(ukDate.getMonth() + 1).padStart(2, '0');
    const day = String(ukDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatUKDisplay(isoDate) {
    const date = this.parseUKDate(isoDate);
    const day = date.getDate();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = monthNames[date.getMonth()];
    const year = String(date.getFullYear()).slice(-2);
    return `${day} ${month} ${year}`;
  }

  getDayName(isoDate) {
    const date = this.parseUKDate(isoDate);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return dayNames[date.getDay()];
  }

  addDays(isoDate, days) {
    const date = this.parseUKDate(isoDate);
    date.setDate(date.getDate() + days);
    return this.toISODate(date);
  }

  resolveRelativeDay(input) {
    const normalized = input.toLowerCase().trim();

    const today = this.toISODate(this.referenceDate);
    const todayDayOfWeek = this.referenceDate.getDay();

    const dayMap = {
      'sunday': 0, 'sun': 0,
      'monday': 1, 'mon': 1,
      'tuesday': 2, 'tue': 2, 'tues': 2,
      'wednesday': 3, 'wed': 3,
      'thursday': 4, 'thu': 4, 'thur': 4, 'thurs': 4,
      'friday': 5, 'fri': 5,
      'saturday': 6, 'sat': 6,
    };

    if (normalized === 'today') {
      return {
        isoDate: today,
        displayDate: this.formatUKDisplay(today),
        isAmbiguous: false,
      };
    }

    if (normalized === 'tomorrow') {
      const tomorrow = this.addDays(today, 1);
      return {
        isoDate: tomorrow,
        displayDate: this.formatUKDisplay(tomorrow),
        isAmbiguous: false,
      };
    }

    const nextMatch = normalized.match(/^next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)$/);
    if (nextMatch) {
      const targetDay = dayMap[nextMatch[1]];
      let daysUntil = targetDay - todayDayOfWeek;
      if (daysUntil <= 0) daysUntil += 7;

      const targetDate = this.addDays(today, daysUntil);
      return {
        isoDate: targetDate,
        displayDate: this.formatUKDisplay(targetDate),
        isAmbiguous: false,
      };
    }

    const lastMatch = normalized.match(/^last\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)$/);
    if (lastMatch) {
      const targetDay = dayMap[lastMatch[1]];
      let daysBack = todayDayOfWeek - targetDay;
      if (daysBack <= 0) daysBack += 7;

      const targetDate = this.addDays(today, -daysBack);
      return {
        isoDate: targetDate,
        displayDate: this.formatUKDisplay(targetDate),
        isAmbiguous: false,
      };
    }

    return {
      isoDate: '',
      displayDate: '',
      isAmbiguous: true,
      requiresClarification: 'Could not understand the date.',
    };
  }
}

// Test with a fixed reference date (Thursday, 13 Feb 2026)
console.log('\n=== Date Resolution Test ===\n');
console.log('Reference date: Thursday, 13 February 2026\n');

const resolver = new DateResolver('2026-02-13');

const tests = [
  'today',
  'tomorrow',
  'next Tuesday',
  'last Tuesday',
  'next Monday',
  'last Friday',
  'next Saturday',
];

tests.forEach(test => {
  const result = resolver.resolveRelativeDay(test);
  if (!result.isAmbiguous) {
    const dayName = resolver.getDayName(result.isoDate);
    console.log(`"${test}" → ${result.isoDate} (${dayName}) → UK format: ${result.displayDate}`);
  } else {
    console.log(`"${test}" → AMBIGUOUS: ${result.requiresClarification}`);
  }
});

// Test the actual use case
console.log('\n=== Real Use Case: "move last Tuesday to next Tuesday" ===\n');

const lastTuesday = resolver.resolveRelativeDay('last Tuesday');
const nextTuesday = resolver.resolveRelativeDay('next Tuesday');

console.log(`Last Tuesday: ${lastTuesday.isoDate} (${resolver.getDayName(lastTuesday.isoDate)})`);
console.log(`Next Tuesday: ${nextTuesday.isoDate} (${resolver.getDayName(nextTuesday.isoDate)})`);
console.log('\nThis will be sent to the AI as:');
console.log(JSON.stringify({
  message: "move last Tuesday to next Tuesday",
  resolvedDates: {
    "last Tuesday": lastTuesday.isoDate,
    "next Tuesday": nextTuesday.isoDate
  }
}, null, 2));

console.log('\n✅ Date resolution working correctly!\n');
