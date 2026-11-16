import { formatDate } from '@/lib/time';

import type { ClosingBalance, Obligation, Period } from './api';

/** "1 Nov 2026 – 30 Nov 2026" for a period's dates. */
export function describePeriod(period: Pick<Period, 'startsOn' | 'endsOn'>): string {
  return `${formatDate(period.startsOn)} – ${formatDate(period.endsOn)}`;
}

/**
 * One line of a closed period's balance, from the viewer's side when they are
 * in the pair, such as "You owed Zubair 60.00 PKR". Payable and held amounts
 * are kept apart, as at close.
 */
export function describeClosingBalance(
  balance: ClosingBalance,
  viewerId: string,
  nameOf: (userId: string) => string,
  money: (amountMinor: number) => string,
): string {
  const payable = balance.finalMinor + balance.provisionalMinor;
  // Positive: memberA owed memberB.
  const [debtor, creditor] =
    payable >= 0 ? [balance.memberA, balance.memberB] : [balance.memberB, balance.memberA];
  const held =
    balance.disputedMinor !== 0
      ? `, ${money(Math.abs(balance.disputedMinor))} held by disputes`
      : '';
  if (payable === 0) {
    return `${pairName(balance, viewerId, nameOf)} were square${held}`;
  }
  const amount = money(Math.abs(payable));
  if (debtor === viewerId) return `You owed ${nameOf(creditor)} ${amount}${held}`;
  if (creditor === viewerId) return `${nameOf(debtor)} owed you ${amount}${held}`;
  return `${nameOf(debtor)} owed ${nameOf(creditor)} ${amount}${held}`;
}

function pairName(balance: ClosingBalance, viewerId: string, nameOf: (userId: string) => string) {
  if (balance.memberA === viewerId) return `You and ${nameOf(balance.memberB)}`;
  if (balance.memberB === viewerId) return `You and ${nameOf(balance.memberA)}`;
  return `${nameOf(balance.memberA)} and ${nameOf(balance.memberB)}`;
}

/** What is left to settle on an obligation, and whether it is settled, held or open. */
export function obligationState(obligation: Obligation): {
  remainingMinor: number;
  state: 'settled' | 'held' | 'partly settled' | 'open';
} {
  const remainingMinor = obligation.amountMinor - obligation.coveredMinor;
  if (obligation.isHeld) return { remainingMinor: obligation.amountMinor, state: 'held' };
  if (remainingMinor === 0) return { remainingMinor, state: 'settled' };
  return { remainingMinor, state: obligation.coveredMinor > 0 ? 'partly settled' : 'open' };
}
