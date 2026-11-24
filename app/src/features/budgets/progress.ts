import { formatMoney } from '@/features/apartments/currencies';

/**
 * Where a month's spending stands against a budget. The thresholds are the
 * ones the alerts use (private.send_budget_alerts): near from 80%, over from
 * 100%. Integer arithmetic only, as for all money.
 */
export type BudgetLevel = 'under' | 'near' | 'over';

export function budgetLevel(spentMinor: number, limitMinor: number): BudgetLevel {
  if (spentMinor >= limitMinor) return 'over';
  if (spentMinor * 5 >= limitMinor * 4) return 'near';
  return 'under';
}

/** How full the bar is drawn, 0 to 100. */
export function budgetPercent(spentMinor: number, limitMinor: number): number {
  if (limitMinor <= 0) return 0;
  return Math.min(100, Math.floor((spentMinor * 100) / limitMinor));
}

/** "Rs 400.00 of Rs 500.00", then what is left or how far over. */
export function describeBudget(
  spentMinor: number,
  limitMinor: number,
  currency: string,
): { spent: string; remaining: string } {
  const spent = `${formatMoney(spentMinor, currency)} of ${formatMoney(limitMinor, currency)}`;
  if (spentMinor > limitMinor) {
    return { spent, remaining: `${formatMoney(spentMinor - limitMinor, currency)} over` };
  }
  if (spentMinor === limitMinor) return { spent, remaining: 'Budget reached' };
  return { spent, remaining: `${formatMoney(limitMinor - spentMinor, currency)} left` };
}
