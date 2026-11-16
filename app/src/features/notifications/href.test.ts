import { notificationHref } from './href';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

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
