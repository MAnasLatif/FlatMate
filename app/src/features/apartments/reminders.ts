import type { Choice } from '@/components/choice-chips';

/**
 * How far ahead an apartment's reminders go out (FR-09.2). The database job
 * sends them from 09:00 in the apartment's timezone; null turns one off.
 */
export type ReminderSchedule = {
  /** Days before an unpaid bill's due date, as well as on the day. 0: only on the day. */
  dueReminderDays: number | null;
  /** Days before the settlement day, to members who owe. */
  settlementReminderDays: number | null;
};

/** What a reminder is set to when it is switched on. */
export const DEFAULT_DUE_REMINDER_DAYS = 1;
export const DEFAULT_SETTLEMENT_REMINDER_DAYS = 2;

const DUE_DAY_OPTIONS = [0, 1, 2, 3, 7] as const;
const SETTLEMENT_DAY_OPTIONS = [1, 2, 3, 7] as const;

function daysBeforeLabel(days: number): string {
  if (days === 0) return 'On the day only';
  return days === 1 ? '1 day before' : `${days} days before`;
}

/**
 * The choices offered, plus the current value when it is not one of them (set
 * from another version of the app, say), so the selection is always visible.
 */
function choicesWith(options: readonly number[], current: number | null): Choice<string>[] {
  const days =
    current !== null && !options.includes(current)
      ? [...options, current].sort((a, b) => a - b)
      : options;
  return days.map((value) => ({ value: String(value), label: daysBeforeLabel(value) }));
}

export function dueReminderChoices(current: number | null): Choice<string>[] {
  return choicesWith(DUE_DAY_OPTIONS, current);
}

export function settlementReminderChoices(current: number | null): Choice<string>[] {
  return choicesWith(SETTLEMENT_DAY_OPTIONS, current);
}
