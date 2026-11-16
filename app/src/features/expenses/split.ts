/**
 * Split arithmetic for previews. The database computes the real shares with
 * the same rules (decision record 0003); keep the two in step.
 *
 * All amounts are integer minor units. Intermediate products use BigInt, so
 * nothing is ever rounded by floating point.
 */

/** The largest amount one expense may have: 10 billion in a 2-decimal currency. */
export const MAX_AMOUNT_MINOR = 1_000_000_000_000;
/** Percentages are entered as basis points: 100% is 10,000. */
export const FULL_PERCENTAGE_BASIS_POINTS = 10_000;

export type SplitMethod = 'equal' | 'percentage' | 'fixed';

export type SplitParticipant = {
  userId: string;
  /** Percentage splits: the share in basis points. Ignored otherwise. */
  basisPoints?: number;
  /** Fixed splits: the share in minor units. Ignored otherwise. */
  amountMinor?: number;
};

export type Share = { userId: string; amountMinor: number };
export type Contribution = { userId: string; amountMinor: number };
export type Debt = { debtorId: string; creditorId: string; amountMinor: number };

export type SplitErrorReason =
  | 'invalid_total'
  | 'no_participants'
  | 'duplicate_participant'
  | 'invalid_share'
  | 'percentages_must_total_100'
  | 'fixed_amounts_must_match_total'
  | 'contributions_must_match_total';

export class SplitError extends Error {
  constructor(readonly reason: SplitErrorReason) {
    super(reason);
    this.name = 'SplitError';
  }
}

function isWholeAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function byUserId<T extends { userId: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
}

function assertTotal(totalMinor: number): void {
  if (!isWholeAmount(totalMinor) || totalMinor === 0 || totalMinor > MAX_AMOUNT_MINOR) {
    throw new SplitError('invalid_total');
  }
}

function assertUnique(participants: readonly { userId: string }[]): void {
  const ids = new Set(participants.map((participant) => participant.userId));
  if (ids.size !== participants.length) {
    throw new SplitError('duplicate_participant');
  }
}

/**
 * Largest-remainder apportionment: each participant gets the floor of their
 * weighted part, and leftover units go one each to the largest remainders,
 * ties broken by user id.
 */
function apportion(totalMinor: number, weighted: { userId: string; weight: number }[]): Share[] {
  const total = BigInt(totalMinor);
  const weightSum = weighted.reduce((sum, item) => sum + BigInt(item.weight), 0n);
  const parts = weighted.map((item, index) => {
    const product = total * BigInt(item.weight);
    return {
      userId: item.userId,
      index,
      base: product / weightSum,
      remainder: product % weightSum,
    };
  });

  let leftover = total - parts.reduce((sum, part) => sum + part.base, 0n);
  const byRemainder = [...parts].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  const bonus = new Set<number>();
  for (const part of byRemainder) {
    if (leftover === 0n) break;
    bonus.add(part.index);
    leftover -= 1n;
  }

  return parts.map((part) => ({
    userId: part.userId,
    amountMinor: Number(part.base + (bonus.has(part.index) ? 1n : 0n)),
  }));
}

/** Each participant's share of the total, ordered by user id. Shares always sum to the total. */
export function computeShares(
  totalMinor: number,
  method: SplitMethod,
  participants: readonly SplitParticipant[],
): Share[] {
  assertTotal(totalMinor);
  if (participants.length === 0) {
    throw new SplitError('no_participants');
  }
  assertUnique(participants);
  const sorted = byUserId(participants);

  if (method === 'equal') {
    return apportion(
      totalMinor,
      sorted.map((participant) => ({ userId: participant.userId, weight: 1 })),
    );
  }

  if (method === 'percentage') {
    if (!sorted.every((participant) => isWholeAmount(participant.basisPoints))) {
      throw new SplitError('invalid_share');
    }
    const sum = sorted.reduce((total, participant) => total + (participant.basisPoints ?? 0), 0);
    if (sum !== FULL_PERCENTAGE_BASIS_POINTS) {
      throw new SplitError('percentages_must_total_100');
    }
    return apportion(
      totalMinor,
      sorted.map((participant) => ({
        userId: participant.userId,
        weight: participant.basisPoints ?? 0,
      })),
    );
  }

  if (!sorted.every((participant) => isWholeAmount(participant.amountMinor))) {
    throw new SplitError('invalid_share');
  }
  const sum = sorted.reduce((total, participant) => total + (participant.amountMinor ?? 0), 0);
  if (sum !== totalMinor) {
    throw new SplitError('fixed_amounts_must_match_total');
  }
  return sorted.map((participant) => ({
    userId: participant.userId,
    amountMinor: participant.amountMinor ?? 0,
  }));
}

/**
 * Who owes whom for one expense. Each person's contribution first covers
 * their own share; those who paid more than their share are owed by those who
 * paid less, matched in user id order. Exact in integers.
 */
export function matchDebts(
  contributions: readonly Contribution[],
  shares: readonly Share[],
): Debt[] {
  const contributed = new Map(contributions.map((item) => [item.userId, item.amountMinor]));
  const owed = new Map(shares.map((item) => [item.userId, item.amountMinor]));
  const totalContributed = contributions.reduce((sum, item) => sum + item.amountMinor, 0);
  const totalShares = shares.reduce((sum, item) => sum + item.amountMinor, 0);
  if (totalContributed !== totalShares) {
    throw new SplitError('contributions_must_match_total');
  }

  const people = [...new Set([...contributed.keys(), ...owed.keys()])].sort();
  const creditors: { userId: string; remaining: number }[] = [];
  const debtors: { userId: string; remaining: number }[] = [];
  for (const userId of people) {
    const difference = (contributed.get(userId) ?? 0) - (owed.get(userId) ?? 0);
    if (difference > 0) creditors.push({ userId, remaining: difference });
    if (difference < 0) debtors.push({ userId, remaining: -difference });
  }

  const debts: Debt[] = [];
  let creditorIndex = 0;
  for (const debtor of debtors) {
    while (debtor.remaining > 0) {
      const creditor = creditors[creditorIndex];
      const amountMinor = Math.min(debtor.remaining, creditor.remaining);
      debts.push({ debtorId: debtor.userId, creditorId: creditor.userId, amountMinor });
      debtor.remaining -= amountMinor;
      creditor.remaining -= amountMinor;
      if (creditor.remaining === 0) creditorIndex += 1;
    }
  }
  return debts;
}

/**
 * The split after giving one participant a new share (a dispute's proposal):
 * the difference is spread over the other participants in proportion to their
 * current shares, by the largest-remainder rule with ties to the lowest user
 * id; participants with a zero share keep it. Mirrors private.adjusted_split.
 * Returns null when nobody else has a share that could take on the difference.
 */
export function adjustedSplit(
  shares: readonly Share[],
  userId: string,
  shareMinor: number,
): Share[] | null {
  const total = shares.reduce((sum, share) => sum + share.amountMinor, 0);
  if (!isWholeAmount(shareMinor) || shareMinor > total) return null;
  const others = byUserId(
    shares.filter((share) => share.userId !== userId && share.amountMinor > 0),
  );
  if (others.length === 0) return null;

  const spread = apportion(
    total - shareMinor,
    others.map((share) => ({ userId: share.userId, weight: share.amountMinor })),
  );
  const zeroShares = shares
    .filter((share) => share.userId !== userId && share.amountMinor === 0)
    .map((share) => ({ userId: share.userId, amountMinor: 0 }));
  return byUserId([{ userId, amountMinor: shareMinor }, ...spread, ...zeroShares]);
}

/**
 * A percentage typed by the user, such as "33.33" or "50", in basis points.
 * Returns null for anything that is not a number with at most two decimals
 * between 0 and 100.
 */
export function parsePercentageToBasisPoints(input: string): number | null {
  const match = /^\s*(\d{1,3})(?:[.,](\d{1,2}))?\s*$/.exec(input);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  const basisPoints = whole * 100 + fraction;
  return basisPoints <= FULL_PERCENTAGE_BASIS_POINTS ? basisPoints : null;
}
