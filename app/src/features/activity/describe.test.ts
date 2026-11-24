import type { ActivityEntry } from './api';
import { activityHref, describeActivity } from './describe';

const names: Record<string, string> = { me: 'You', anas: 'Anas', zubair: 'Zubair' };
const context = { currency: 'PKR', nameOf: (id: string) => names[id] ?? 'Someone' };
const APT = 'apt';

function entry(patch: Partial<ActivityEntry>): ActivityEntry {
  return {
    id: 1,
    createdAt: '2026-11-24T10:00:00Z',
    actorId: 'anas',
    entityType: 'expense',
    entityId: 'e1',
    action: 'created',
    details: {},
    subject: 'Groceries',
    amountMinor: 30_000,
    personId: null,
    counterpartyId: null,
    ...patch,
  };
}

describe('describeActivity', () => {
  it('says who did what to which record', () => {
    expect(describeActivity(entry({}), context)).toBe('Anas added Groceries');
    expect(describeActivity(entry({ details: { paid: false } }), context)).toBe(
      'Anas added Groceries as an unpaid bill',
    );
    expect(describeActivity(entry({ actorId: 'me', action: 'dispute_raised' }), context)).toBe(
      'You disputed Groceries',
    );
  });

  it('names FlatMate, or nobody, for what happened on schedule', () => {
    expect(describeActivity(entry({ actorId: null, action: 'finalized' }), context)).toBe(
      'Groceries became final. Nobody objected in time',
    );
    expect(
      describeActivity(
        entry({
          actorId: null,
          entityType: 'payment',
          action: 'confirmed_by_app_policy',
          personId: 'zubair',
          counterpartyId: 'me',
          amountMinor: 5_000,
        }),
        context,
      ),
    ).toBe('A payment of Rs 50.00 from Zubair to You became final. Nobody objected in time');
  });

  it('gives a payment its amount and the person paid', () => {
    expect(
      describeActivity(
        entry({
          actorId: 'zubair',
          entityType: 'payment',
          action: 'recorded',
          personId: 'zubair',
          counterpartyId: 'anas',
          amountMinor: 10_000,
        }),
        context,
      ),
    ).toBe('Zubair recorded a payment of Rs 100.00 to Anas');
  });

  it('words member changes and settings', () => {
    expect(
      describeActivity(
        entry({
          entityType: 'member',
          action: 'role_changed',
          personId: 'zubair',
          details: { to: 'admin' },
        }),
        context,
      ),
    ).toBe('Anas made Zubair an admin');
    expect(
      describeActivity(
        entry({
          entityType: 'budget',
          action: 'set',
          subject: null,
          details: { category_id: null, after: 100_000 },
        }),
        context,
      ),
    ).toBe('Anas set the budget for all spending to Rs 1,000.00 a month');
    expect(
      describeActivity(
        entry({
          entityType: 'settlement_period',
          action: 'closed',
          actorId: null,
          details: { starts_on: '2026-10-01', ends_on: '2026-10-31' },
        }),
        context,
      ),
    ).toMatch(/^The settlement period .+ closed$/);
  });

  it('words deposit changes', () => {
    expect(
      describeActivity(
        entry({
          entityType: 'deposit',
          action: 'recorded',
          subject: 'Flat deposit',
          amountMinor: 90_000,
        }),
        context,
      ),
    ).toBe('Anas recorded the deposit Flat deposit of Rs 900.00');
    expect(
      describeActivity(
        entry({
          entityType: 'deposit',
          action: 'share_taken_over',
          personId: 'zubair',
          counterpartyId: 'me',
          amountMinor: 30_000,
        }),
        context,
      ),
    ).toBe("You took over Rs 300.00 of Zubair's deposit share");
  });

  it('starts every sentence with a capital, and copes with what it does not know', () => {
    expect(
      describeActivity(entry({ subject: null, action: 'finalized', actorId: null }), context),
    ).toBe('An expense became final. Nobody objected in time');
    expect(
      describeActivity(entry({ entityType: 'thing', action: 'happened', subject: null }), context),
    ).toBe('Anas made a change');
  });
});

describe('activityHref', () => {
  const member = { userId: 'me', isAdmin: false };

  it('opens the expense, or the dispute for a dispute entry', () => {
    expect(activityHref(entry({}), APT, member)).toEqual({
      pathname: '/apartments/[apartmentId]/expenses/[expenseId]',
      params: { apartmentId: APT, expenseId: 'e1' },
    });
    expect(
      activityHref(entry({ action: 'dispute_raised', details: { dispute_id: 'd1' } }), APT, member),
    ).toEqual({
      pathname: '/apartments/[apartmentId]/disputes/[disputeId]',
      params: { apartmentId: APT, disputeId: 'd1' },
    });
  });

  it('opens netting with the other person only for one of the two', () => {
    const offset = entry({
      entityType: 'offset',
      action: 'netted_off',
      personId: 'me',
      counterpartyId: 'anas',
    });
    expect(activityHref(offset, APT, member)).toEqual({
      pathname: '/apartments/[apartmentId]/ledger/[memberId]',
      params: { apartmentId: APT, memberId: 'anas' },
    });
    expect(activityHref(offset, APT, { userId: 'zubair', isAdmin: true })).toBeNull();
  });

  it('opens settings entries only for admins', () => {
    const category = entry({ entityType: 'category', action: 'created' });
    expect(activityHref(category, APT, member)).toBeNull();
    expect(activityHref(category, APT, { userId: 'me', isAdmin: true })).toEqual({
      pathname: '/apartments/[apartmentId]/settings',
      params: { apartmentId: APT, tab: 'expenses' },
    });
  });
});
