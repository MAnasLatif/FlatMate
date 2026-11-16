/** How often a repeatable expense comes back. Kept apart from the API so plain logic can use it. */

export type RepeatUnit = 'day' | 'week' | 'month';

/** How often a repeatable expense comes back: the choices the database accepts. */
export const REPEATS = {
  daily: { unit: 'day', every: 1 },
  weekly: { unit: 'week', every: 1 },
  fortnightly: { unit: 'week', every: 2 },
  monthly: { unit: 'month', every: 1 },
  quarterly: { unit: 'month', every: 3 },
  yearly: { unit: 'month', every: 12 },
} as const satisfies Record<string, { unit: RepeatUnit; every: number }>;
export type Repeat = keyof typeof REPEATS;

export function isMonthly(repeat: Repeat): boolean {
  return REPEATS[repeat].unit === 'month';
}

export function repeatOf(unit: string, every: number): Repeat {
  const found = (Object.keys(REPEATS) as Repeat[]).find(
    (key) => REPEATS[key].unit === unit && REPEATS[key].every === every,
  );
  return found ?? 'monthly';
}
