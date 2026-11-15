import type { NotificationTarget } from './api';
import { placeUnread, type UnreadNotification, unreadMatches } from './unread';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const ME = 'me';
const APT = 'apt';

function target(overrides: Partial<NotificationTarget>): NotificationTarget {
  return { id: 'n', apartmentId: APT, recordType: 'expense', recordId: 'e1', ...overrides };
}

function item(overrides: Partial<UnreadNotification>): UnreadNotification {
  return { ...target({}), expenseId: null, counterpartyId: null, ...overrides };
}

describe('placeUnread', () => {
  it('finds the expense of a dispute and the other person in a payment or ledger entry', () => {
    const placed = placeUnread(
      [
        target({ id: 'n1', recordType: 'dispute', recordId: 'd1' }),
        target({ id: 'n2', recordType: 'payment', recordId: 'p1' }),
        target({ id: 'n3', recordType: 'payment', recordId: 'p2' }),
        target({ id: 'n4', recordType: 'ledger', recordId: 'zubair' }),
        target({ id: 'n5', recordType: 'expense', recordId: 'e1' }),
      ],
      {
        userId: ME,
        disputes: [{ id: 'd1', expenseId: 'e9' }],
        payments: [
          { id: 'p1', payerId: ME, recipientId: 'zubair' },
          { id: 'p2', payerId: 'ali', recipientId: ME },
        ],
      },
    );
    expect(
      placed.map(({ id, expenseId, counterpartyId }) => [id, expenseId, counterpartyId]),
    ).toEqual([
      ['n1', 'e9', null],
      ['n2', null, 'zubair'],
      ['n3', null, 'ali'],
      ['n4', null, 'zubair'],
      ['n5', null, null],
    ]);
  });

  it('leaves the place empty for a record the user can no longer see', () => {
    const [placed] = placeUnread([target({ recordType: 'payment', recordId: 'gone' })], {
      userId: ME,
      disputes: [],
      payments: [],
    });
    expect(placed.counterpartyId).toBeNull();
  });
});

describe('unreadMatches', () => {
  it('marks an expense row for the expense and for disputes about it', () => {
    const row = unreadMatches.expenseRow(APT, 'e1');
    expect(row(item({ recordType: 'expense', recordId: 'e1' }))).toBe(true);
    expect(row(item({ recordType: 'dispute', recordId: 'd1', expenseId: 'e1' }))).toBe(true);
    expect(row(item({ recordType: 'expense', recordId: 'e2' }))).toBe(false);
    // The expense screen clears the expense only; each dispute is cleared when opened.
    expect(
      unreadMatches.expense(
        APT,
        'e1',
      )(item({ recordType: 'dispute', recordId: 'd1', expenseId: 'e1' })),
    ).toBe(false);
  });

  it('never mixes apartments', () => {
    const elsewhere = item({ apartmentId: 'other' });
    expect(unreadMatches.expenseRow(APT, 'e1')(elsewhere)).toBe(false);
    expect(
      unreadMatches.settlement(APT)(item({ apartmentId: 'other', recordType: 'payment' })),
    ).toBe(false);
    expect(unreadMatches.inApartments([APT])(elsewhere)).toBe(false);
    expect(unreadMatches.inApartments(['other'])(elsewhere)).toBe(true);
  });

  it('puts payments, offsets, adjustments and closed periods behind Settle up', () => {
    const settle = unreadMatches.settlement(APT);
    expect(settle(item({ recordType: 'payment' }))).toBe(true);
    expect(settle(item({ recordType: 'ledger' }))).toBe(true);
    expect(settle(item({ recordType: 'settlement' }))).toBe(true);
    expect(settle(item({ recordType: 'expense' }))).toBe(false);
    expect(settle(item({ recordType: 'members' }))).toBe(false);
  });

  it('marks a person for payments and ledger entries with them', () => {
    const withZubair = unreadMatches.withMember(APT, 'zubair');
    expect(withZubair(item({ recordType: 'payment', counterpartyId: 'zubair' }))).toBe(true);
    expect(
      withZubair(item({ recordType: 'ledger', recordId: 'zubair', counterpartyId: 'zubair' })),
    ).toBe(true);
    expect(withZubair(item({ recordType: 'payment', counterpartyId: 'ali' }))).toBe(false);
    expect(
      unreadMatches.ledgerWith(
        APT,
        'zubair',
      )(item({ recordType: 'payment', counterpartyId: 'zubair' })),
    ).toBe(false);
  });

  it('keeps members, the apartment and declined requests apart', () => {
    expect(unreadMatches.members(APT)(item({ recordType: 'members' }))).toBe(true);
    expect(unreadMatches.apartment(APT)(item({ recordType: 'apartment' }))).toBe(true);
    expect(unreadMatches.apartment(APT)(item({ recordType: 'members' }))).toBe(false);
    expect(
      unreadMatches.joinRequests()(item({ recordType: 'join_request', apartmentId: 'x' })),
    ).toBe(true);
  });
});
