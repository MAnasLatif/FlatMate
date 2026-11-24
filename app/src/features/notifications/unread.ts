import type { NotificationTarget } from './api';

/**
 * Members notifications an admin acts on in the apartment's settings rather
 * than on the members screen: someone asking to join, and a declined
 * invitation back.
 */
export const MEMBER_ADMIN_TYPES: readonly string[] = [
  'join_request.requested',
  'rejoin_invite.declined',
];

function isMemberAdmin(item: Pick<NotificationTarget, 'recordType' | 'type'>): boolean {
  return item.recordType === 'members' && MEMBER_ADMIN_TYPES.includes(item.type);
}

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

  /** Joins, exits and role changes, behind the members icon. */
  members:
    (apartmentId: string): UnreadMatch =>
    (item) =>
      item.apartmentId === apartmentId && item.recordType === 'members' && !isMemberAdmin(item),

  /** Requests to join and declined invitations back, cleared on the settings' members tab. */
  memberAdmin:
    (apartmentId: string): UnreadMatch =>
    (item) =>
      item.apartmentId === apartmentId && isMemberAdmin(item),

  /** About the apartment as a whole, such as being let in: cleared on its dashboard. */
  apartment:
    (apartmentId: string): UnreadMatch =>
    (item) =>
      item.apartmentId === apartmentId && item.recordType === 'apartment',

  /** Changes to the user's deposit shares, behind the members icon and its Deposit entry. */
  deposits:
    (apartmentId: string): UnreadMatch =>
    (item) =>
      item.apartmentId === apartmentId && item.recordType === 'deposit',

  /** Debt simplifications the user is part of, cleared on the Simplify debts screen. */
  debtTransfers:
    (apartmentId: string): UnreadMatch =>
    (item) =>
      item.apartmentId === apartmentId && item.recordType === 'debt_transfer',

  /** One deposit, cleared on its screen. */
  deposit:
    (apartmentId: string, depositId: string): UnreadMatch =>
    (item) =>
      item.apartmentId === apartmentId &&
      item.recordType === 'deposit' &&
      item.recordId === depositId,

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
