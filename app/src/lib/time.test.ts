import {
  formatTimeLeft,
  addDays,
  addMonths,
  deviceTimeZone,
  formatDate,
  formatDateTime,
  lastDayBefore,
  monthGrid,
  monthStart,
  ordinal,
  todayInTimeZone,
} from './time';

describe('ordinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [23, '23rd'],
    [31, '31st'],
  ])('formats %i as %s', (day, expected) => {
    expect(ordinal(day)).toBe(expected);
  });
});

describe('deviceTimeZone', () => {
  it('returns an IANA time zone name', () => {
    expect(deviceTimeZone()).toMatch(/^[A-Za-z_]+(\/[A-Za-z_+-]+)*$/);
  });
});

describe('todayInTimeZone', () => {
  it('uses the given time zone, not the device one', () => {
    // 21:30 UTC on 12 November is already 13 November in Karachi (UTC+5).
    const moment = new Date('2026-11-12T21:30:00Z');
    expect(todayInTimeZone('Asia/Karachi', moment)).toBe('2026-11-13');
    expect(todayInTimeZone('America/New_York', moment)).toBe('2026-11-12');
  });
});

describe('date arithmetic', () => {
  it('adds days across months and leap years', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('moves between months', () => {
    expect(monthStart('2026-11-13')).toBe('2026-11-01');
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01');
  });
});

describe('formatDate', () => {
  it('shows a calendar date as that day, even west of UTC', () => {
    // jest.global-setup.ts runs the suite west of UTC, where this goes wrong.
    expect(new Date(2026, 10, 13).getTimezoneOffset()).toBeGreaterThan(0);
    expect(formatDate('2026-11-13')).toMatch(/13/);
  });
});

describe('lastDayBefore', () => {
  it('names the day that ends at a midnight deadline, where the apartment is', () => {
    // Midnight on 21 Nov in Karachi (UTC+5) and in New York (UTC-5).
    expect(lastDayBefore('2026-11-20T19:00:00Z', 'Asia/Karachi')).toBe('2026-11-20');
    expect(lastDayBefore('2026-11-21T05:00:00+00:00', 'America/New_York')).toBe('2026-11-20');
  });
});

describe('formatDateTime', () => {
  it('shows the day, month, year and time', () => {
    const text = formatDateTime(new Date(2026, 10, 14, 14, 5));
    expect(text).toMatch(/14/);
    expect(text).toMatch(/Nov/);
    expect(text).toMatch(/2026/);
    expect(text).toMatch(/2:05|14:05/);
  });
});

describe('monthGrid', () => {
  it('lays out a month in Monday-first weeks, with blanks around it', () => {
    // November 2026 starts on a Sunday, so six blanks come first.
    const grid = monthGrid('2026-11-01');
    expect(grid.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(grid.filter(Boolean)).toHaveLength(30);
    expect(grid.length % 7).toBe(0);
    expect(grid.at(-1)).toBeNull();
  });

  it('handles February in a leap year', () => {
    expect(monthGrid('2028-02-01').filter(Boolean).at(-1)).toBe('2028-02-29');
  });
});

describe('formatTimeLeft', () => {
  const now = Date.UTC(2026, 10, 17, 10, 0);
  const later = (minutes: number) => now + minutes * 60_000;

  it('counts days and hours, then hours and minutes, then minutes', () => {
    expect(formatTimeLeft(later(7 * 24 * 60), now)).toBe('7 days left');
    expect(formatTimeLeft(later(6 * 24 * 60 + 4 * 60 + 30), now)).toBe('6 days, 4 hours left');
    expect(formatTimeLeft(later(24 * 60 + 60), now)).toBe('1 day, 1 hour left');
    expect(formatTimeLeft(later(3 * 60 + 12), now)).toBe('3 hours, 12 minutes left');
    expect(formatTimeLeft(later(60), now)).toBe('1 hour left');
    expect(formatTimeLeft(later(12), now)).toBe('12 minutes left');
  });

  it('rounds the last seconds up to a minute, and says when it has passed', () => {
    expect(formatTimeLeft(now + 5_000, now)).toBe('1 minute left');
    expect(formatTimeLeft(now, now)).toBe('Expired');
    expect(formatTimeLeft(now - 60_000, now)).toBe('Expired');
  });
});
