export interface DateResolutionContext {
  todayISO: string;
  planStartDateISO: string;
  planData: any;
  completedWorkouts: Set<string>;
}

export interface ResolvedTarget {
  isoDate: string;
  weekday: string;
  relative: 'PAST' | 'TODAY' | 'FUTURE';
  humanLabel: string;
  daysFromToday: number;
  weekNumber?: number;
  isCompleted?: boolean;
}

export interface ResolutionResult {
  resolved: ResolvedTarget[];
  ambiguity: {
    question: string;
    options: ResolvedTarget[];
  } | null;
}

export class DateResolver {
  private todayDate: Date;
  private planStartDate: Date;
  private planData: any;
  private completedWorkouts: Set<string>;
  private weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  private weekdayNamesShort = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  constructor(context: DateResolutionContext) {
    this.todayDate = new Date(context.todayISO + 'T00:00:00Z');
    this.planStartDate = new Date(context.planStartDateISO + 'T00:00:00Z');
    this.planData = context.planData;
    this.completedWorkouts = context.completedWorkouts;
  }

  resolve(referencePhrase: string): ResolutionResult {
    const phrase = referencePhrase.toLowerCase().trim();

    if (phrase === 'today') {
      return this.resolveToday();
    }

    if (phrase === 'yesterday') {
      return this.resolveYesterday();
    }

    if (phrase === 'tomorrow') {
      return this.resolveTomorrow();
    }

    if (phrase.match(/^next (monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i)) {
      const weekday = this.capitalizeFirstLetter(phrase.split(' ')[1]);
      return this.resolveNextWeekday(weekday);
    }

    if (phrase.match(/^last (monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i)) {
      const weekday = this.capitalizeFirstLetter(phrase.split(' ')[1]);
      return this.resolveLastWeekday(weekday);
    }

    if (phrase.match(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i)) {
      const weekday = this.capitalizeFirstLetter(phrase);
      return this.resolveWeekdayAmbiguous(weekday);
    }

    if (phrase === 'this weekend') {
      return this.resolveThisWeekend();
    }

    if (phrase === 'next weekend') {
      return this.resolveNextWeekend();
    }

    if (phrase.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return this.resolveExplicitDate(phrase);
    }

    throw new Error(`Unable to resolve reference phrase: "${referencePhrase}"`);
  }

  private resolveToday(): ResolutionResult {
    const isoDate = this.todayDate.toISOString().split('T')[0];
    const target = this.buildTarget(isoDate);
    return { resolved: [target], ambiguity: null };
  }

  private resolveYesterday(): ResolutionResult {
    const yesterday = new Date(this.todayDate);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const isoDate = yesterday.toISOString().split('T')[0];
    const target = this.buildTarget(isoDate);
    return { resolved: [target], ambiguity: null };
  }

  private resolveTomorrow(): ResolutionResult {
    const tomorrow = new Date(this.todayDate);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const isoDate = tomorrow.toISOString().split('T')[0];
    const target = this.buildTarget(isoDate);
    return { resolved: [target], ambiguity: null };
  }

  private resolveNextWeekday(weekday: string): ResolutionResult {
    const targetDayIndex = this.weekdayNames.indexOf(weekday);
    const todayDayIndex = this.todayDate.getUTCDay();

    let daysAhead = targetDayIndex - todayDayIndex;
    if (daysAhead <= 0) {
      daysAhead += 7;
    }

    const targetDate = new Date(this.todayDate);
    targetDate.setUTCDate(targetDate.getUTCDate() + daysAhead);
    const isoDate = targetDate.toISOString().split('T')[0];
    const target = this.buildTarget(isoDate);

    return { resolved: [target], ambiguity: null };
  }

  private resolveLastWeekday(weekday: string): ResolutionResult {
    const targetDayIndex = this.weekdayNames.indexOf(weekday);
    const todayDayIndex = this.todayDate.getUTCDay();

    let daysBack = todayDayIndex - targetDayIndex;
    if (daysBack <= 0) {
      daysBack += 7;
    }

    const targetDate = new Date(this.todayDate);
    targetDate.setUTCDate(targetDate.getUTCDate() - daysBack);
    const isoDate = targetDate.toISOString().split('T')[0];
    const target = this.buildTarget(isoDate);

    return { resolved: [target], ambiguity: null };
  }

  private resolveWeekdayAmbiguous(weekday: string): ResolutionResult {
    const lastWeekdayResult = this.resolveLastWeekday(weekday);
    const nextWeekdayResult = this.resolveNextWeekday(weekday);

    const lastTarget = lastWeekdayResult.resolved[0];
    const nextTarget = nextWeekdayResult.resolved[0];

    const todayWeekday = this.weekdayNames[this.todayDate.getUTCDay()];
    if (weekday === todayWeekday) {
      return {
        resolved: [],
        ambiguity: {
          question: `Which ${weekday} did you mean?`,
          options: [lastTarget, nextTarget]
        }
      };
    }

    if (Math.abs(lastTarget.daysFromToday) <= 3 && Math.abs(nextTarget.daysFromToday) <= 7) {
      return {
        resolved: [],
        ambiguity: {
          question: `Which ${weekday} did you mean?`,
          options: [lastTarget, nextTarget]
        }
      };
    }

    if (Math.abs(lastTarget.daysFromToday) < Math.abs(nextTarget.daysFromToday)) {
      return { resolved: [lastTarget], ambiguity: null };
    } else {
      return { resolved: [nextTarget], ambiguity: null };
    }
  }

  private resolveThisWeekend(): ResolutionResult {
    const todayDayIndex = this.todayDate.getUTCDay();
    const saturdayResult = todayDayIndex <= 6 ? this.resolveNextWeekday('Sat') : this.resolveLastWeekday('Sat');
    const sundayResult = todayDayIndex === 0 ? this.resolveToday() : this.resolveNextWeekday('Sun');

    return {
      resolved: [saturdayResult.resolved[0], sundayResult.resolved[0]],
      ambiguity: null
    };
  }

  private resolveNextWeekend(): ResolutionResult {
    const nextSaturday = new Date(this.todayDate);
    const todayDayIndex = this.todayDate.getUTCDay();
    const daysUntilSaturday = (6 - todayDayIndex + 7) % 7 || 7;
    nextSaturday.setUTCDate(nextSaturday.getUTCDate() + daysUntilSaturday);

    const nextSunday = new Date(nextSaturday);
    nextSunday.setUTCDate(nextSunday.getUTCDate() + 1);

    return {
      resolved: [
        this.buildTarget(nextSaturday.toISOString().split('T')[0]),
        this.buildTarget(nextSunday.toISOString().split('T')[0])
      ],
      ambiguity: null
    };
  }

  private resolveExplicitDate(isoDate: string): ResolutionResult {
    const target = this.buildTarget(isoDate);
    return { resolved: [target], ambiguity: null };
  }

  private buildTarget(isoDate: string): ResolvedTarget {
    const targetDate = new Date(isoDate + 'T00:00:00Z');
    const daysDiff = Math.floor((targetDate.getTime() - this.todayDate.getTime()) / (1000 * 60 * 60 * 24));

    let relative: 'PAST' | 'TODAY' | 'FUTURE';
    if (daysDiff < 0) {
      relative = 'PAST';
    } else if (daysDiff === 0) {
      relative = 'TODAY';
    } else {
      relative = 'FUTURE';
    }

    const weekdayIndex = targetDate.getUTCDay();
    const weekday = this.weekdayNamesShort[weekdayIndex];

    const weekNumber = this.calculateWeekNumber(isoDate);
    const isCompleted = this.isWorkoutCompleted(weekNumber, weekday);

    const humanLabel = this.buildHumanLabel(isoDate, weekday, relative, daysDiff);

    return {
      isoDate,
      weekday,
      relative,
      humanLabel,
      daysFromToday: daysDiff,
      weekNumber,
      isCompleted
    };
  }

  private calculateWeekNumber(isoDate: string): number | undefined {
    const targetDate = new Date(isoDate + 'T00:00:00Z');
    const daysSinceStart = Math.floor((targetDate.getTime() - this.planStartDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceStart < 0) return undefined;

    return Math.floor(daysSinceStart / 7) + 1;
  }

  private isWorkoutCompleted(weekNumber: number | undefined, weekday: string): boolean {
    if (!weekNumber) return false;
    const key = `${weekNumber}-${weekday}`;
    return this.completedWorkouts.has(key);
  }

  private buildHumanLabel(isoDate: string, weekday: string, relative: string, daysDiff: number): string {
    const formattedDate = this.formatDate(isoDate);

    if (relative === 'TODAY') {
      return `Today, ${formattedDate}`;
    }

    if (relative === 'PAST') {
      if (daysDiff === -1) {
        return `Yesterday, ${formattedDate}`;
      }
      return `${weekday}, ${formattedDate} (${Math.abs(daysDiff)} days ago)`;
    }

    if (daysDiff === 1) {
      return `Tomorrow, ${formattedDate}`;
    }

    return `${weekday}, ${formattedDate} (in ${daysDiff} days)`;
  }

  private formatDate(isoDate: string): string {
    const date = new Date(isoDate + 'T00:00:00Z');
    const month = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    const day = date.getUTCDate();
    return `${month} ${day}`;
  }

  private capitalizeFirstLetter(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
