import { formatDate } from '@/lib/time';

import type { ExpenseDetail, HistoryEvent } from './api';

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

/** One line of an expense's history, such as "Anas added this expense". */
export function describeHistoryEvent(event: HistoryEvent, actorName: string): string {
  switch (event.action) {
    case 'created':
      return isUnpaidCreation(event.details)
        ? `${actorName} added this as an unpaid bill`
        : `${actorName} added this expense`;
    case 'bill_paid':
      return `${actorName} recorded that the bill was paid`;
    case 'receipt_added':
      return `${actorName} attached a receipt`;
    default:
      return `${actorName} changed this expense`;
  }
}

function isUnpaidCreation(details: HistoryEvent['details']): boolean {
  return (
    typeof details === 'object' &&
    details !== null &&
    !Array.isArray(details) &&
    details.paid === false
  );
}
