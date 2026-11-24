import { formatMoney } from '@/features/apartments/currencies';
import { formatMonth } from '@/lib/time';

import type { MonthSpending } from './api';

/** How many months the comparison shows, the current one included. */
export const COMPARISON_MONTHS = 6;

/**
 * How a month's total differs from the month before, in money rather than a
 * percentage so nothing is rounded: "Rs 1,200.00 more than October".
 */
export function describeChange(
  current: MonthSpending,
  previous: MonthSpending | undefined,
  currency: string,
): string | null {
  if (!previous) return null;
  const difference = current.totalMinor - previous.totalMinor;
  const month = formatMonth(previous.month);
  if (difference === 0) return `Same as ${month}`;
  const amount = formatMoney(Math.abs(difference), currency);
  return difference > 0 ? `${amount} more than ${month}` : `${amount} less than ${month}`;
}

/**
 * A bar's length as a whole percentage of the longest, for drawing only.
 * Anything above zero shows at least a sliver.
 */
export function barPercent(amountMinor: number, largestMinor: number): number {
  if (amountMinor <= 0 || largestMinor <= 0) return 0;
  return Math.max(2, Math.round((amountMinor * 100) / largestMinor));
}
