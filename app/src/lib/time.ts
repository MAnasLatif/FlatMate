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

/** A date for display, such as "12 Nov 2026", in the device's locale. */
export function formatDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
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
