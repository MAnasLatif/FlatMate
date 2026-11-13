import { formatDate } from '@/lib/time';

import type { Member } from '@/features/apartments/api';
import type { Json } from '@/types/database';

import type { ExpenseDetail, HistoryEvent } from './api';

/**
 * Whether the viewer may edit or void the expense: the person who added it or
 * an admin, while a current member, and never while it is disputed or void.
 * The database enforces the same rule; this only decides what to offer.
 */
export function canEditExpense(
  expense: Pick<ExpenseDetail, 'status' | 'createdBy'>,
  viewer: Pick<Member, 'userId' | 'role' | 'leftAt'> | undefined,
): boolean {
  if (!viewer || viewer.leftAt !== null) return false;
  if (expense.status === 'disputed' || expense.status === 'void') return false;
  return viewer.role === 'admin' || viewer.userId === expense.createdBy;
}

/** What the expense's status means for the people in it, in one or two sentences. */
export function describeStatus(
  expense: Pick<ExpenseDetail, 'status' | 'paidStatus' | 'finalizeAfter' | 'finalizedAt'>,
): string {
  switch (expense.status) {
    case 'void':
      return 'Void. It no longer counts toward anyone’s balance.';
    case 'disputed':
      return 'Held by an open dispute. What it adds to balances is not payable until the dispute is resolved.';
    case 'final':
      return expense.finalizedAt ? `Final since ${formatDate(expense.finalizedAt)}.` : 'Final.';
    case 'provisional':
      if (expense.paidStatus === 'unpaid') {
        return 'Not paid yet. Nobody owes anything for it until someone records paying it.';
      }
      return `Provisional. Anyone in the split can object until ${formatDate(expense.finalizeAfter)}; after that it becomes final.`;
  }
}

/**
 * One line of an expense's history, such as "Anas added this expense".
 * `money` formats an amount in the expense's currency.
 */
export function describeHistoryEvent(
  event: HistoryEvent,
  actorName: string,
  money: (amountMinor: number) => string,
): string {
  switch (event.action) {
    case 'created':
      return isUnpaidCreation(event.details)
        ? `${actorName} added this as an unpaid bill`
        : `${actorName} added this expense`;
    case 'bill_paid':
      return `${actorName} recorded that the bill was paid`;
    case 'receipt_added':
      return `${actorName} attached a receipt`;
    case 'edited': {
      const changes = field(event.details, 'changes');
      const amount = field(changes, 'amount_minor');
      if (isObject(amount) && typeof amount.from === 'number' && typeof amount.to === 'number') {
        return `${actorName} changed the amount from ${money(amount.from)} to ${money(amount.to)}`;
      }
      if (field(changes, 'revision') !== undefined) {
        return `${actorName} changed the split or who paid`;
      }
      return `${actorName} edited the details`;
    }
    case 'voided':
      return `${actorName} voided this expense`;
    default:
      return `${actorName} changed this expense`;
  }
}

/** The reason given for a change, if any. */
export function historyReason(event: HistoryEvent): string | null {
  const reason = field(event.details, 'reason');
  return typeof reason === 'string' ? reason : null;
}

type JsonObject = { [key: string]: Json | undefined };

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A field of a JSON object, or undefined when the value is not an object or lacks it. */
function field(value: Json | undefined, key: string): Json | undefined {
  return isObject(value) ? value[key] : undefined;
}

function isUnpaidCreation(details: HistoryEvent['details']): boolean {
  return isObject(details) && details.paid === false;
}
