import { formatMoney } from '@/features/apartments/currencies';

import type { Deposit, DepositAction } from './api';

/**
 * One line of a deposit's history, such as "Wali took over Rs 300.00 of
 * Yasir's share". `nameOf` returns "You" for the reader.
 */
export function describeDepositAction(
  action: DepositAction,
  deposit: Pick<Deposit, 'actions' | 'entries' | 'amountMinor'>,
  nameOf: (userId: string) => string,
  currency: string,
): string {
  const money = (amountMinor: number) => formatMoney(amountMinor, currency);
  const entries = deposit.entries.filter((entry) => entry.actionId === action.id);
  const sum = (kind: string) =>
    -entries
      .filter((entry) => entry.kind === kind)
      .reduce((total, entry) => total + entry.amountMinor, 0);
  const possessive = (name: string) => (name === 'You' ? 'your' : `${name}'s`);
  // "You" starts a sentence; elsewhere it is "you".
  const object = (name: string) => (name === 'You' ? 'you' : name);

  switch (action.kind) {
    case 'recorded':
      return `${nameOf(action.createdBy)} recorded the deposit of ${money(deposit.amountMinor)}`;
    case 'taken_over': {
      const taken = entries.find((entry) => entry.kind === 'transfer_in');
      if (!taken || !taken.counterpartyId) return 'A share was taken over';
      return `${nameOf(taken.userId)} took over ${money(taken.amountMinor)} of ${possessive(nameOf(taken.counterpartyId))} share`;
    }
    case 'refunded': {
      const holder = entries[0]?.userId;
      const who = holder ? `${possessive(nameOf(holder))} share` : 'A share';
      const kept = sum('deduction');
      const back = `${who.charAt(0).toUpperCase()}${who.slice(1)} was refunded: ${money(sum('refund'))} back`;
      return kept > 0 ? `${back}, ${money(kept)} kept` : back;
    }
    case 'returned': {
      const to = action.receivedBy ? ` to ${object(nameOf(action.receivedBy))}` : '';
      const kept = sum('deduction');
      const back = `The deposit was returned${to}: ${money(sum('refund'))} back`;
      return kept > 0 ? `${back}, ${money(kept)} kept` : back;
    }
    case 'undone': {
      const target = deposit.actions.find((item) => item.id === action.reversesActionId);
      return target
        ? `${nameOf(action.createdBy)} undid a change: ${describeDepositAction(target, deposit, nameOf, currency)}`
        : `${nameOf(action.createdBy)} undid a change`;
    }
  }
}
