const FALLBACK_TIME_ZONE = 'Asia/Karachi';

/** The device's IANA time zone, such as "Asia/Karachi". */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIME_ZONE;
  } catch {
    // Intl can be missing on very old engines; the database validates the zone anyway.
    return FALLBACK_TIME_ZONE;
  }
}

/** "1st", "2nd", "23rd", "31st". */
export function ordinal(day: number): string {
  const lastTwo = day % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/**
 * A date for display, such as "12 Nov 2026", in the device's locale. A
 * timestamp shows the day it falls on where the device is. A calendar date
 * (YYYY-MM-DD) shows that day everywhere: JavaScript reads it as midnight UTC,
 * so it is formatted in UTC rather than shifted into the device's zone.
 */
export function formatDate(value: string | Date): string {
  const isCalendarDate = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(isCalendarDate ? { timeZone: 'UTC' } : {}),
  });
}

/** A moment for display, such as "14 Nov 2026, 2:14 PM", in the device's locale and zone. */
export function formatDateTime(value: number | Date): string {
  return new Date(value).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * How long is left until a moment, for a countdown: "6 days, 4 hours left",
 * "3 hours, 12 minutes left" or "12 minutes left". Under a minute counts as
 * one minute, and a moment already past as none.
 */
export function formatTimeLeft(until: number | Date, now: number | Date = Date.now()): string {
  const minutes = Math.ceil((new Date(until).getTime() - new Date(now).getTime()) / 60_000);
  if (minutes <= 0) return 'Expired';
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const mins = minutes % 60;
  const unit = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  if (days > 0) {
    return `${hours > 0 ? `${unit(days, 'day')}, ${unit(hours, 'hour')}` : unit(days, 'day')} left`;
  }
  if (hours > 0) {
    return `${mins > 0 ? `${unit(hours, 'hour')}, ${unit(mins, 'minute')}` : unit(hours, 'hour')} left`;
  }
  return `${unit(mins, 'minute')} left`;
}

/** Today's date in the given IANA time zone, as YYYY-MM-DD. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  try {
    // en-CA formats dates as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * The last whole day, as YYYY-MM-DD in the given time zone, before a deadline
 * that falls on a midnight there, such as the end of an objection window.
 */
export function lastDayBefore(deadline: string, timeZone: string): string {
  return todayInTimeZone(timeZone, new Date(Date.parse(deadline) - 1));
}

/** The YYYY-MM-DD date a number of days before or after another. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}

/** The first day of the month of a YYYY-MM-DD date, and moving between months. */
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function addMonths(monthStartDate: string, months: number): string {
  const [year, month] = monthStartDate.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1 + months, 1));
  return result.toISOString().slice(0, 10);
}

/** "November 2026" for a YYYY-MM-DD date, in the device's locale. */
export function formatMonth(date: string): string {
  const [year, month] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * The days of a month laid out in weeks starting on Monday, for a calendar:
 * YYYY-MM-DD dates, with null for the blanks before the 1st and after the
 * last day. Always whole weeks.
 */
export function monthGrid(monthStartDate: string): (string | null)[] {
  const [year, month] = monthStartDate.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  // getUTCDay counts from Sunday; shift so Monday is 0.
  const leading = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${monthStartDate.slice(0, 8)}${String(day).padStart(2, '0')}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
