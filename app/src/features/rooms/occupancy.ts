import type { ExpenseDraft } from '@/features/expenses/draft';
import { minorUnitsToInput } from '@/lib/money';
import { addDays, addMonths, formatDate, monthStart } from '@/lib/time';

import type { Occupancy, RoomShare } from './api';

/** Whether someone lived in their room on a YYYY-MM-DD day. */
export function isLivingOn(stay: Occupancy, day: string): boolean {
  return stay.startsOn <= day && (stay.endsOn === null || day <= stay.endsOn);
}

/** "Since 1 Nov 2026", or "1 Nov 2026 – 15 Nov 2026". */
export function stayLabel(stay: Occupancy): string {
  return stay.endsOn === null
    ? `Since ${formatDate(stay.startsOn)}`
    : `${formatDate(stay.startsOn)} – ${formatDate(stay.endsOn)}`;
}

/** The first and last day of the month a YYYY-MM-DD date is in. */
export function monthPeriod(date: string): { from: string; to: string } {
  const from = monthStart(date);
  return { from, to: addDays(addMonths(from, 1), -1) };
}

export type RoomDraft = { name: string; weight: string };

export function validateRoomDraft(draft: RoomDraft): {
  value: { name: string; weight: number } | null;
  errors: { name?: string; weight?: string };
} {
  const name = draft.name.trim();
  const errors: { name?: string; weight?: string } = {};
  if (name.length === 0) errors.name = 'Give the room a name.';
  else if (name.length > 60) errors.name = 'Keep the name to 60 characters.';
  const weight = /^\d+$/.test(draft.weight.trim()) ? Number(draft.weight.trim()) : NaN;
  if (!(weight >= 1 && weight <= 100)) errors.weight = 'Enter a whole number from 1 to 100.';
  return errors.name || errors.weight
    ? { value: null, errors }
    : { value: { name, weight }, errors };
}

/**
 * Turns a split by room into the form's split by amount: each included
 * person's amount, everyone else left out, and a line in the notes saying
 * which period it covers, so the expense explains itself later.
 */
export function applyRoomSplit(
  draft: ExpenseDraft,
  shares: readonly RoomShare[],
  memberIds: readonly string[],
  period: { from: string; to: string },
): ExpenseDraft {
  const paying = shares.filter((share) => share.included && share.amountMinor > 0);
  const payingIds = new Set(paying.map((share) => share.userId));
  const note = `Split by room for ${formatDate(period.from)} – ${formatDate(period.to)}.`;
  const description = draft.description.trim();
  return {
    ...draft,
    splitMethod: 'fixed',
    excluded: memberIds.filter((id) => !payingIds.has(id)),
    fixedAmounts: Object.fromEntries(
      paying.map((share) => [share.userId, minorUnitsToInput(share.amountMinor)]),
    ),
    description: description.includes('Split by room for')
      ? description.replace(/Split by room for [^\n]*\./, note)
      : description.length > 0
        ? `${description}\n${note}`
        : note,
  };
}
