import { addDays, addMonths, deviceTimeZone, monthStart, ordinal, todayInTimeZone } from './time';

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
