import type { NotificationTarget } from './api';

/**
 * An unread notification, placed so the app can mark it with a red dot where
 * its record shows and clear it when that record is opened. There is no inbox:
 * the dots lead to the place a notification is about.
 */
export type UnreadNotification = NotificationTarget & {
  /** For a dispute, the expense it is about. */
  expenseId: string | null;
  /** For a payment or a ledger entry, the other person in it. */
  counterpartyId: string | null;
};

export type UnreadMatch = (item: UnreadNotification) => boolean;

type DisputeContext = { id: string; expenseId: string | null };
type PaymentContext = { id: string; payerId: string; recipientId: string };

/** Adds the expense of each dispute and the other person of each payment and ledger entry. */
export function placeUnread(
  targets: NotificationTarget[],
  context: { userId: string; disputes: DisputeContext[]; payments: PaymentContext[] },
): UnreadNotification[] {
  const disputes = new Map(context.disputes.map((row) => [row.id, row]));
  const payments = new Map(context.payments.map((row) => [row.id, row]));
  return targets.map((target) => {
    const id = target.recordId;
    let expenseId: string | null = null;
    let counterpartyId: string | null = null;
    if (target.recordType === 'dispute' && id) {
      expenseId = disputes.get(id)?.expenseId ?? null;
    } else if (target.recordType === 'payment' && id) {
      const payment = payments.get(id);
      if (payment) {
        counterpartyId = payment.payerId === context.userId ? payment.recipientId : payment.payerId;
      }
    } else if (target.recordType === 'ledger') {
      // A ledger notification already points at the other person.
      counterpartyId = id;
    }
    return { ...target, expenseId, counterpartyId };
  });
}

/**
 * Which unread notifications belong to a place in the app. Each place that
 * shows a dot, and each screen that clears one, picks its match from here, so
 * a dot always leads somewhere that clears it.
 */
export const unreadMatches = {
  /**
   * Anything in one of the given apartments: for the apartment list and
   * switcher. An invitation back is about an apartment the user is not in, so
   * it never counts here.
   */
  inApartments:
    (apartmentIds: readonly string[]): UnreadMatch =>
    (item) =>
      item.recordType !== 'rejoin_invite' && apartmentIds.includes(item.apartmentId),

  /** An expense row: the expense itself, or a dispute about it. */
  expenseRow:
    (apartmentId: string, expenseId: string): UnreadMatch =>
    (item) =>
      item.apartmentId === apartmentId &&
      ((item.recordType === 'expense' && item.recordId === expenseId) ||
        (item.recordType === 'dispute' && item.expenseId === expenseId)),

  /** Cleared on the expense screen. Its disputes stay marked until each is opened. */
  expense:
    (apartmentId: string, expenseId: string): UnreadMatch =>
    (item) =>
      item.apartmentId === apartmentId &&
      item.recordType === 'expense' &&
      item.recordId === expenseId,

  dispute:
    (apartmentId: string, disputeId: string): UnreadMatch =>
    (item) =>
      item.apartmentId === apartmentId &&
      item.recordType === 'dispute' &&
      item.recordId === disputeId,

  payment:
    (apartmentId: string, paymentId: string): UnreadMatch =>
    (item) =>
      item.apartmentId === apartmentId &&
      item.recordType === 'payment' &&
      item.recordId === paymentId,

  /** Offsets and adjustments with one person, cleared on the ledger with them. */
  ledgerWith:
    (apartmentId: string, memberId: string): UnreadMatch =>
    (item) =>
      item.apartmentId === apartmentId &&
      item.recordType === 'ledger' &&
      item.recordId === memberId,

  /** Payments, offsets and adjustments with one person. */
  withMember:
    (apartmentId: string, memberId: string): UnreadMatch =>
    (item) =>
      item.apartmentId === apartmentId &&
      (item.recordType === 'payment' || item.recordType === 'ledger') &&
      item.counterpartyId === memberId,

  /** Everything the settlement screen covers: payments, ledger entries and periods. */
  settlement:
    (apartmentId: string): UnreadMatch =>
    (item) =>
      item.apartmentId === apartmentId &&
      (item.recordType === 'payment' ||
        item.recordType === 'ledger' ||
        item.recordType === 'settlement'),

  /** A closed period, cleared on the settlement screen. */
  settlementPeriod:
    (apartmentId: string): UnreadMatch =>
    (item) =>
      item.apartmentId === apartmentId && item.recordType === 'settlement',

  /** Joins, exits, role changes and requests to join, behind the members icon. */
  members:
    (apartmentId: string): UnreadMatch =>
    (item) =>
      item.apartmentId === apartmentId && item.recordType === 'members',

  /** About the apartment as a whole, such as being let in: cleared on its dashboard. */
  apartment:
    (apartmentId: string): UnreadMatch =>
    (item) =>
      item.apartmentId === apartmentId && item.recordType === 'apartment',

  /** Repeatable bills waiting for an admin, cleared on the repeatable expenses tab. */
  recurring:
    (apartmentId: string): UnreadMatch =>
    (item) =>
      item.apartmentId === apartmentId && item.recordType === 'recurring',

  /**
   * A declined request to join, or an invitation back to an apartment, cleared
   * where the user's requests and invitations are listed.
   */
  requestsAndInvites: (): UnreadMatch => (item) =>
    item.recordType === 'join_request' || item.recordType === 'rejoin_invite',

  /** An invitation back, which the apartment switcher counts with other apartments. */
  rejoinInvites: (): UnreadMatch => (item) => item.recordType === 'rejoin_invite',
};
