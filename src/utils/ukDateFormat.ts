export function formatUKDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  const day = d.getDate();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear().toString().slice(-2);

  return `${day} ${month} ${year}`;
}

export function formatUKDateLong(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  const day = d.getDate();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const month = monthNames[d.getMonth()];
  const year = d.getFullYear();

  return `${day} ${month} ${year}`;
}

export function formatUKDateWithDay(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = dayNames[d.getDay()];
  const formatted = formatUKDate(d);

  return `${dayName}, ${formatted}`;
}

export function parseISODate(isoString: string): Date {
  return new Date(isoString);
}

export function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}
