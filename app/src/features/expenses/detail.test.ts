import { formatDate } from '@/lib/time';

import type { HistoryEvent } from './api';
import { describeHistoryEvent, describeStatus } from './detail';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const base = {
  paidStatus: 'paid' as const,
  finalizeAfter: '2026-11-20T10:00:00Z',
  finalizedAt: null,
};

describe('describeStatus', () => {
  it('says until when a provisional expense can be objected to', () => {
    expect(describeStatus({ ...base, status: 'provisional' })).toContain(
      `can object until ${formatDate('2026-11-20T10:00:00Z')};`,
    );
  });

  it('says an unpaid bill creates no debts yet', () => {
    expect(describeStatus({ ...base, status: 'provisional', paidStatus: 'unpaid' })).toMatch(
      /Nobody owes anything/,
    );
  });

  it('keeps disputed, final and void distinct', () => {
    expect(describeStatus({ ...base, status: 'disputed' })).toMatch(/^Held by an open dispute/);
    expect(describeStatus({ ...base, status: 'final', finalizedAt: '2026-11-21T10:00:00Z' })).toBe(
      `Final since ${formatDate('2026-11-21T10:00:00Z')}.`,
    );
    expect(describeStatus({ ...base, status: 'void' })).toMatch(/^Void/);
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
  ])('describes %j', (input, expected) => {
    expect(describeHistoryEvent(input, 'Anas')).toBe(expected);
  });
});
