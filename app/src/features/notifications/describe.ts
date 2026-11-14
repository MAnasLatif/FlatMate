import type { Href } from 'expo-router';

import type { NotificationItem } from './api';

/**
 * What a notification says in the inbox. Unlike the lock-screen text, which
 * the server keeps generic, the inbox is behind sign-in and names who acted.
 */
export function describeNotification(item: Pick<NotificationItem, 'type' | 'actorName'>): string {
  const who = item.actorName ?? 'Someone';
  switch (item.type) {
    case 'expense.created':
      return `${who} added an expense that includes you.`;
    case 'expense.edited':
      return `${who} changed an expense that includes you.`;
    case 'expense.voided':
      return `${who} cancelled an expense that included you.`;
    case 'expense.bill_paid':
      return `${who} paid a bill that includes you.`;
    case 'expense.dispute_raised':
      return `${who} disputed an expense that includes you.`;
    case 'expense.dispute_accepted':
      return `${who} accepted a dispute on an expense that includes you.`;
    case 'expense.dispute_rejected':
      return `${who} rejected a dispute on an expense that includes you.`;
    case 'expense.dispute_decided':
      return `${who} decided a dispute on an expense that includes you.`;
    case 'expense.dispute_withdrawn':
      return `${who} withdrew a dispute on an expense that includes you.`;
    case 'payment.recorded':
      return `${who} recorded a payment to you. Check that it arrived.`;
    case 'payment.proof_added':
      return `${who} added proof to a payment to you.`;
    case 'payment.declined':
      return `${who} declined a payment you recorded.`;
    case 'payment.decline_withdrawn':
      return `${who} withdrew their objection to your payment.`;
    case 'payment.confirmed_by_app_policy':
      // Not a bank confirmation: nobody objected within the window.
      return 'Your payment is now final in FlatMate. Nobody objected in time.';
    case 'payment.voided':
      return `${who} voided a payment you are part of.`;
    case 'offset.netted_off':
      return `${who} netted off debts between you.`;
    case 'adjustment.recorded':
      return `${who} recorded an adjustment between you.`;
    case 'member.joined':
      return `${who} joined the apartment.`;
    case 'member.left':
      return `${who} left the apartment.`;
    case 'member.removed':
      return `${who} removed a member from the apartment.`;
    case 'member.you_were_removed':
      return `${who} removed you from the apartment. Your records stay visible to you.`;
    case 'member.role_changed':
      return `${who} changed your role in the apartment.`;
    case 'member.expense_permission_changed':
      return `${who} changed whether you can add expenses.`;
    case 'settlement_period.closed':
      return 'A settlement period closed. See the summary.';
    case 'join_request.requested':
      return `${who} asked to join the apartment.`;
    case 'join_request.approved':
      return `${who} let you into the apartment.`;
    case 'join_request.declined':
      // The apartment is not theirs to see, so its name is not shown either.
      return 'Your request to join an apartment was declined.';
    default:
      return 'Something changed in the apartment.';
  }
}

/**
 * The screen a notification opens. That screen loads its record through the
 * usual access checks, so a record the user may no longer see shows as not
 * available there (FR-09.3).
 */
export function notificationHref(
  item: Pick<NotificationItem, 'recordType' | 'recordId' | 'apartmentId'>,
): Href {
  const apartmentId = item.apartmentId;
  const id = item.recordId;
  switch (item.recordType) {
    case 'expense':
      if (id)
        return {
          pathname: '/apartments/[apartmentId]/expenses/[expenseId]',
          params: { apartmentId, expenseId: id },
        };
      break;
    case 'dispute':
      if (id)
        return {
          pathname: '/apartments/[apartmentId]/disputes/[disputeId]',
          params: { apartmentId, disputeId: id },
        };
      break;
    case 'payment':
      if (id)
        return {
          pathname: '/apartments/[apartmentId]/payments/[paymentId]',
          params: { apartmentId, paymentId: id },
        };
      break;
    case 'ledger':
      if (id)
        return {
          pathname: '/apartments/[apartmentId]/ledger/[memberId]',
          params: { apartmentId, memberId: id },
        };
      break;
    case 'members':
      return { pathname: '/apartments/[apartmentId]/members', params: { apartmentId } };
    case 'settlement':
      return { pathname: '/apartments/[apartmentId]/settlement', params: { apartmentId } };
    case 'apartment':
      break;
    // A declined request: the apartment is not open to them, so go home.
    case 'join_request':
      return '/';
  }
  return { pathname: '/apartments/[apartmentId]', params: { apartmentId } };
}
