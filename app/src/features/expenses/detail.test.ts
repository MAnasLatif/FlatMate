import { formatMinorUnits } from '@/lib/money';
import { formatDate } from '@/lib/time';

import type { HistoryEvent } from './api';
import { canEditExpense, describeHistoryEvent, describeStatus, historyReason } from './detail';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const ZONE = 'Asia/Karachi';

const base = {
  paidStatus: 'paid' as const,
  // Midnight starting 21 Nov in Karachi.
  finalizeAfter: '2026-11-20T19:00:00Z',
  finalizedAt: null,
};

describe('describeStatus', () => {
  it('says until when a provisional expense can be objected to', () => {
    expect(describeStatus({ ...base, status: 'provisional' }, ZONE)).toContain(
      `can object until the end of ${formatDate('2026-11-20')};`,
    );
  });

  it('says an unpaid bill creates no debts yet', () => {
    expect(describeStatus({ ...base, status: 'provisional', paidStatus: 'unpaid' }, ZONE)).toMatch(
      /Nobody owes anything/,
    );
  });

  it('keeps disputed, final and void distinct', () => {
    expect(describeStatus({ ...base, status: 'disputed' }, ZONE)).toMatch(
      /^Held by an open dispute/,
    );
    expect(
      describeStatus({ ...base, status: 'final', finalizedAt: '2026-11-21T10:00:00Z' }, ZONE),
    ).toBe(`Final since ${formatDate('2026-11-21T10:00:00Z')}.`);
    expect(describeStatus({ ...base, status: 'void' }, ZONE)).toMatch(/^Void/);
  });
});

describe('describeHistoryEvent', () => {
  const event = (action: string, details: HistoryEvent['details'] = {}): HistoryEvent => ({
    id: 1,
    actorId: 'a',
    action,
    details,
    createdAt: '2026-11-13T10:00:00Z',
  });

  it.each([
    [event('created', { paid: true }), 'Anas added this expense'],
    [event('created', { paid: false }), 'Anas added this as an unpaid bill'],
    [event('bill_paid'), 'Anas recorded that the bill was paid'],
    [event('receipt_added'), 'Anas attached a receipt'],
    [event('something_new'), 'Anas changed this expense'],
    [
      event('edited', {
        changes: { amount_minor: { from: 20_000, to: 30_000 }, revision: { from: 1, to: 2 } },
      }),
      'Anas changed the amount from 200.00 PKR to 300.00 PKR',
    ],
    [
      event('edited', { changes: { revision: { from: 1, to: 2 } } }),
      'Anas changed the split or who paid',
    ],
    [event('edited', { changes: { title: { from: 'A', to: 'B' } } }), 'Anas edited the details'],
    [event('voided', { reason: null }), 'Anas voided this expense'],
  ])('describes %j', (input, expected) => {
    expect(describeHistoryEvent(input, 'Anas', (amount) => `${formatMinorUnits(amount)} PKR`)).toBe(
      expected,
    );
  });

  it('gives the reason for a change when there is one', () => {
    expect(historyReason(event('voided', { reason: 'Added twice' }))).toBe('Added twice');
    expect(historyReason(event('voided', { reason: null }))).toBeNull();
    expect(historyReason(event('created'))).toBeNull();
  });
});

describe('canEditExpense', () => {
  const expense = { status: 'provisional' as const, createdBy: 'anas' };
  const viewer = (
    userId: string,
    role: 'admin' | 'member' = 'member',
    leftAt: string | null = null,
  ) => ({
    userId,
    role,
    leftAt,
  });

  it('lets the person who added it or an admin edit', () => {
    expect(canEditExpense(expense, viewer('anas'))).toBe(true);
    expect(canEditExpense(expense, viewer('zubair', 'admin'))).toBe(true);
    expect(canEditExpense({ ...expense, status: 'final' }, viewer('anas'))).toBe(true);
  });

  it('does not let other members, former members or strangers edit', () => {
    expect(canEditExpense(expense, viewer('zubair'))).toBe(false);
    expect(canEditExpense(expense, viewer('anas', 'admin', '2026-11-10T00:00:00Z'))).toBe(false);
    expect(canEditExpense(expense, undefined)).toBe(false);
  });

  it('allows no edit while disputed or once void', () => {
    expect(canEditExpense({ ...expense, status: 'disputed' }, viewer('anas'))).toBe(false);
    expect(canEditExpense({ ...expense, status: 'void' }, viewer('anas', 'admin'))).toBe(false);
  });
});
