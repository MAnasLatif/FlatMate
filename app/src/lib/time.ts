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
