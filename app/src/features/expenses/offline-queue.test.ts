import type { Member } from '@/features/apartments/api';

import { newDraft } from './draft';
import {
  draftForMembers,
  markFailed,
  MAX_QUEUED_PER_APARTMENT,
  type QueuedExpense,
  QueueLimitError,
  sendQueuedExpense,
  toQueuedEntry,
  toQueuedExpense,
  upsertQueued,
} from './offline-queue';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-secure-store', () => ({}));
jest.mock('expo-sqlite/kv-store', () => ({}));

const ANAS = '11111111-1111-1111-1111-111111111111';
const ZUBAIR = '22222222-2222-2222-2222-222222222222';
const WALI = '44444444-4444-4444-4444-444444444444';

function queued(id: string, patch: Partial<QueuedExpense> = {}): QueuedExpense {
  return {
    id,
    apartmentId: 'flat',
    savedAt: '2026-11-24T12:00:00.000Z',
    draft: { ...newDraft(ANAS, '2026-11-24'), title: 'Groceries', amount: '1200' },
    memberIds: [ANAS, ZUBAIR],
    failure: null,
    ...patch,
  };
}

function member(userId: string, leftAt: string | null = null): Member {
  return {
    membershipId: `m-${userId}`,
    userId,
    role: 'member',
    canAddExpense: true,
    joinedAt: '2026-11-01T00:00:00Z',
    leftAt,
    leftReason: null,
    hiddenAt: null,
    displayName: userId,
    avatarPath: null,
  };
}

describe('queued expenses', () => {
  it('round-trip through storage and refuse anything else', () => {
    const saved = queued('q1', { failure: 'Turned down' });
    expect(toQueuedExpense(toQueuedEntry(saved))).toEqual(saved);
    expect(
      toQueuedExpense({ ...toQueuedEntry(saved), value: { draft: { title: 1 }, memberIds: [] } }),
    ).toBeNull();
    expect(toQueuedExpense({ ...toQueuedEntry(saved), value: null })).toBeNull();
  });

  it('replace one saved again, and hold at most 20 per apartment', () => {
    let entries = upsertQueued([], queued('q1'));
    entries = upsertQueued(
      entries,
      queued('q1', { failure: null, savedAt: '2026-11-25T00:00:00Z' }),
    );
    expect(entries).toHaveLength(1);

    let full = [] as ReturnType<typeof upsertQueued>;
    for (let index = 0; index < MAX_QUEUED_PER_APARTMENT; index += 1) {
      full = upsertQueued(full, queued(`q${index}`));
    }
    expect(() => upsertQueued(full, queued('one-more'))).toThrow(QueueLimitError);
    expect(upsertQueued(full, queued('q3'))).toHaveLength(MAX_QUEUED_PER_APARTMENT);
    expect(upsertQueued(full, queued('other', { apartmentId: 'flat-2' }))).toHaveLength(
      MAX_QUEUED_PER_APARTMENT + 1,
    );
  });

  it('keep the reason a send was turned down', () => {
    const entries = markFailed([toQueuedEntry(queued('q1'))], 'q1', 'Not allowed');
    expect(toQueuedExpense(entries[0])?.failure).toBe('Not allowed');
  });

  it('leave someone who joined since out of the split', () => {
    expect(draftForMembers(queued('q1'), [ANAS, ZUBAIR, WALI]).excluded).toEqual([WALI]);
  });
});

describe('sendQueuedExpense', () => {
  const members = jest.fn(async () => [member(ANAS), member(ZUBAIR)]);

  it('sends it with its own id as the request id', async () => {
    const postExpense = jest.fn(async () => 'expense-1');
    expect(await sendQueuedExpense(queued('q1'), { fetchMembers: members, postExpense })).toEqual({
      kind: 'sent',
      expenseId: 'expense-1',
    });
    expect(postExpense).toHaveBeenCalledWith(
      'flat',
      expect.objectContaining({ title: 'Groceries', amountMinor: 120_000 }),
      'q1',
    );
  });

  it('keeps it waiting when the server cannot be reached', async () => {
    const postExpense = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    expect(await sendQueuedExpense(queued('q1'), { fetchMembers: members, postExpense })).toEqual({
      kind: 'waiting',
    });
  });

  it('turns it back to the user when the server says no, or it no longer fits', async () => {
    const refused = jest.fn(async () => {
      throw { code: '42501', message: 'not_allowed_to_add_expense' };
    });
    const outcome = await sendQueuedExpense(queued('q1'), {
      fetchMembers: members,
      postExpense: refused,
    });
    expect(outcome.kind).toBe('failed');

    const postExpense = jest.fn(async () => 'never');
    const zubairLeft = jest.fn(async () => [member(ANAS), member(ZUBAIR, '2026-11-20')]);
    const draft = { ...queued('q1').draft, payerId: ZUBAIR };
    expect(
      await sendQueuedExpense(queued('q1', { draft }), { fetchMembers: zubairLeft, postExpense }),
    ).toEqual({ kind: 'failed', reason: expect.stringMatching(/no longer fit/) });
    expect(postExpense).not.toHaveBeenCalled();
  });
});
