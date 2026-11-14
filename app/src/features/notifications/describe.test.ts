import { describeNotification, notificationHref } from './describe';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

// The types the database creates (private.notification_recipients).
const SERVER_TYPES = [
  'expense.created',
  'expense.edited',
  'expense.voided',
  'expense.bill_paid',
  'expense.dispute_raised',
  'expense.dispute_accepted',
  'expense.dispute_rejected',
  'expense.dispute_decided',
  'expense.dispute_withdrawn',
  'payment.recorded',
  'payment.proof_added',
  'payment.declined',
  'payment.decline_withdrawn',
  'payment.confirmed_by_app_policy',
  'payment.voided',
  'offset.netted_off',
  'adjustment.recorded',
  'member.joined',
  'member.left',
  'member.removed',
  'member.you_were_removed',
  'member.role_changed',
  'member.expense_permission_changed',
  'settlement_period.closed',
];

describe('describeNotification', () => {
  it('has its own sentence for every type the server sends', () => {
    const fallback = describeNotification({ type: 'unknown.type', actorName: 'Zubair' });
    for (const type of SERVER_TYPES) {
      expect(describeNotification({ type, actorName: 'Zubair' })).not.toBe(fallback);
    }
  });

  it('names who acted, or says someone when they cannot be seen', () => {
    expect(describeNotification({ type: 'payment.recorded', actorName: 'Zubair' })).toBe(
      'Zubair recorded a payment to you. Check that it arrived.',
    );
    expect(describeNotification({ type: 'expense.created', actorName: null })).toBe(
      'Someone added an expense that includes you.',
    );
  });

  it('never presents a policy confirmation as a bank confirmation', () => {
    expect(
      describeNotification({ type: 'payment.confirmed_by_app_policy', actorName: null }),
    ).toMatch(/final in FlatMate/);
  });
});

describe('notificationHref', () => {
  const apartmentId = 'apt';

  it('opens the record each notification is about', () => {
    expect(notificationHref({ apartmentId, recordType: 'expense', recordId: 'e' })).toEqual({
      pathname: '/apartments/[apartmentId]/expenses/[expenseId]',
      params: { apartmentId, expenseId: 'e' },
    });
    expect(notificationHref({ apartmentId, recordType: 'dispute', recordId: 'd' })).toEqual({
      pathname: '/apartments/[apartmentId]/disputes/[disputeId]',
      params: { apartmentId, disputeId: 'd' },
    });
    expect(notificationHref({ apartmentId, recordType: 'payment', recordId: 'p' })).toEqual({
      pathname: '/apartments/[apartmentId]/payments/[paymentId]',
      params: { apartmentId, paymentId: 'p' },
    });
    expect(notificationHref({ apartmentId, recordType: 'ledger', recordId: 'm' })).toEqual({
      pathname: '/apartments/[apartmentId]/ledger/[memberId]',
      params: { apartmentId, memberId: 'm' },
    });
    expect(notificationHref({ apartmentId, recordType: 'settlement', recordId: null })).toEqual({
      pathname: '/apartments/[apartmentId]/settlement',
      params: { apartmentId },
    });
  });

  it('falls back to the apartment when the record is missing', () => {
    expect(notificationHref({ apartmentId, recordType: 'expense', recordId: null })).toEqual({
      pathname: '/apartments/[apartmentId]',
      params: { apartmentId },
    });
  });
});
