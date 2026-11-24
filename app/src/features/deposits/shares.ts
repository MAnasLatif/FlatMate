import type { Deduction, Deposit, DepositAction } from './api';

/**
 * Deposit arithmetic, in integers. The database decides every figure; the
 * app uses these to show shares and to preview a return before it is sent.
 */

/** What each person holds now, for those who hold anything, in user id order. */
export function sharesNow(
  deposit: Pick<Deposit, 'entries'>,
): { userId: string; amountMinor: number }[] {
  const totals = new Map<string, number>();
  for (const entry of deposit.entries) {
    totals.set(entry.userId, (totals.get(entry.userId) ?? 0) + entry.amountMinor);
  }
  return [...totals.entries()]
    .filter(([, amountMinor]) => amountMinor !== 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([userId, amountMinor]) => ({ userId, amountMinor }));
}

export type DepositState = 'held' | 'settled' | 'cancelled';

/** Held while anyone has a share; cancelled when its recording was undone. */
export function depositState(deposit: Pick<Deposit, 'entries' | 'actions'>): DepositState {
  const recorded = deposit.actions.find((action) => action.kind === 'recorded');
  if (recorded && deposit.actions.some((action) => action.reversesActionId === recorded.id)) {
    return 'cancelled';
  }
  return sharesNow(deposit).length > 0 ? 'held' : 'settled';
}

/** The latest action still in effect, which is the only one that can be undone. */
export function undoableAction(deposit: Pick<Deposit, 'actions'>): DepositAction | null {
  const undone = new Set(deposit.actions.map((action) => action.reversesActionId));
  const inEffect = deposit.actions.filter(
    (action) => action.kind !== 'undone' && !undone.has(action.id),
  );
  return inEffect.reduce<DepositAction | null>(
    (latest, action) => (latest === null || action.position > latest.position ? action : latest),
    null,
  );
}

/**
 * Splits `total` in proportion to whole-number weights: each gets the floor
 * of their part, and the units left over go to the largest remainders, ties
 * in user id order. The same rule as private.split_by_weights.
 */
export function splitByWeights(
  total: number,
  weights: readonly { userId: string; weight: number }[],
): { userId: string; amountMinor: number }[] {
  const ordered = [...weights].sort((a, b) =>
    a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0,
  );
  const totalWeight = ordered.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight === 0) return ordered.map((item) => ({ userId: item.userId, amountMinor: 0 }));
  // BigInt keeps total * weight exact beyond 2^53.
  const parts = ordered.map((item, position) => {
    const product = BigInt(total) * BigInt(item.weight);
    return {
      userId: item.userId,
      position,
      base: Number(product / BigInt(totalWeight)),
      remainder: Number(product % BigInt(totalWeight)),
    };
  });
  let leftover = total - parts.reduce((sum, part) => sum + part.base, 0);
  const ranked = [...parts].sort((a, b) => b.remainder - a.remainder || a.position - b.position);
  const extra = new Set<string>();
  for (const part of ranked) {
    if (leftover <= 0) break;
    extra.add(part.userId);
    leftover -= 1;
  }
  return parts.map((part) => ({
    userId: part.userId,
    amountMinor: part.base + (extra.has(part.userId) ? 1 : 0),
  }));
}

/**
 * What each holder gets back when the landlord returns the deposit with
 * these deductions: each deduction is shared by share, and each refund is
 * what is left of the share. Null while the deductions exceed the shares.
 */
export function previewReturn(
  shares: readonly { userId: string; amountMinor: number }[],
  deductions: readonly Deduction[],
): { userId: string; deductedMinor: number; refundMinor: number }[] | null {
  const held = shares.reduce((sum, share) => sum + share.amountMinor, 0);
  const deducted = deductions.reduce((sum, item) => sum + item.amountMinor, 0);
  if (deducted > held) return null;
  const weights = shares.map((share) => ({ userId: share.userId, weight: share.amountMinor }));
  const perPerson = new Map<string, number>();
  for (const deduction of deductions) {
    for (const part of splitByWeights(deduction.amountMinor, weights)) {
      perPerson.set(part.userId, (perPerson.get(part.userId) ?? 0) + part.amountMinor);
    }
  }
  return shares.map((share) => {
    const deductedMinor = perPerson.get(share.userId) ?? 0;
    return { userId: share.userId, deductedMinor, refundMinor: share.amountMinor - deductedMinor };
  });
}
