import type { Deposit, DepositAction, DepositEntry } from './api';
import { depositState, previewReturn, sharesNow, splitByWeights, undoableAction } from './shares';

const A = '11111111-1111-1111-1111-111111111111';
const W = '44444444-4444-4444-4444-444444444444';
const Z = '22222222-2222-2222-2222-222222222222';

function action(
  id: string,
  kind: DepositAction['kind'],
  position: number,
  reverses: string | null = null,
): DepositAction {
  return {
    id,
    kind,
    position,
    reversesActionId: reverses,
    deductions: [],
    receivedBy: null,
    createdBy: A,
    createdAt: '',
  };
}

function entry(
  actionId: string,
  userId: string,
  amountMinor: number,
  kind: DepositEntry['kind'] = 'share',
): DepositEntry {
  return { actionId, userId, kind, amountMinor, counterpartyId: null, reason: null };
}

describe('splitByWeights', () => {
  it('gives the odd unit to the largest remainder, then in user id order, as the database does', () => {
    expect(
      splitByWeights(10_001, [
        { userId: W, weight: 30_000 },
        { userId: A, weight: 30_000 },
      ]),
    ).toEqual([
      { userId: A, amountMinor: 5_001 },
      { userId: W, amountMinor: 5_000 },
    ]);
    expect(
      splitByWeights(100, [
        { userId: A, weight: 1 },
        { userId: Z, weight: 1 },
        { userId: W, weight: 1 },
      ]),
    ).toEqual([
      { userId: A, amountMinor: 34 },
      { userId: Z, amountMinor: 33 },
      { userId: W, amountMinor: 33 },
    ]);
  });

  it('always adds up to the total, and stays exact for large amounts', () => {
    const parts = splitByWeights(999_999_999_999, [
      { userId: A, weight: 333_333_333_333 },
      { userId: Z, weight: 2 },
      { userId: W, weight: 7 },
    ]);
    expect(parts.reduce((sum, part) => sum + part.amountMinor, 0)).toBe(999_999_999_999);
  });
});

describe('shares', () => {
  const recorded = action('r', 'recorded', 1);
  const deposit: Pick<Deposit, 'entries' | 'actions'> = {
    actions: [recorded, action('t', 'taken_over', 2)],
    entries: [
      entry('r', A, 30_000),
      entry('r', Z, 30_000),
      entry('t', Z, -30_000, 'transfer_out'),
      entry('t', W, 30_000, 'transfer_in'),
    ],
  };

  it("sums each holder's entries and leaves out who holds nothing", () => {
    expect(sharesNow(deposit)).toEqual([
      { userId: A, amountMinor: 30_000 },
      { userId: W, amountMinor: 30_000 },
    ]);
    expect(depositState(deposit)).toBe('held');
  });

  it('only the latest change in effect can be undone', () => {
    expect(undoableAction(deposit)?.id).toBe('t');
    const undone = { ...deposit, actions: [...deposit.actions, action('u', 'undone', 3, 't')] };
    expect(undoableAction(undone)?.id).toBe('r');
  });

  it('is cancelled once its recording is undone, and settled once nobody holds anything', () => {
    expect(
      depositState({
        actions: [recorded, action('u', 'undone', 2, 'r')],
        entries: [entry('r', A, 30_000), entry('u', A, -30_000)],
      }),
    ).toBe('cancelled');
    expect(
      depositState({
        actions: [recorded],
        entries: [entry('r', A, 30_000), entry('r', A, -30_000, 'refund')],
      }),
    ).toBe('settled');
  });
});

describe('previewReturn', () => {
  const shares = [
    { userId: A, amountMinor: 30_000 },
    { userId: W, amountMinor: 30_000 },
  ];

  it('shares each deduction by share, and refunds the rest', () => {
    expect(previewReturn(shares, [{ amountMinor: 10_001, reason: 'Cleaning' }])).toEqual([
      { userId: A, deductedMinor: 5_001, refundMinor: 24_999 },
      { userId: W, deductedMinor: 5_000, refundMinor: 25_000 },
    ]);
  });

  it('cannot deduct more than is held', () => {
    expect(previewReturn(shares, [{ amountMinor: 60_001, reason: 'Damage' }])).toBeNull();
  });
});
