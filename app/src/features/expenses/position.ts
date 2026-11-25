/** The signed-in user's rows from one expense's splits or payers, across revisions. */
type RevisionAmount = { revision: number; amount_minor: number };

/**
 * What one expense means for the signed-in user, from the current revision:
 * what they paid minus their share. Positive, others owe them that much for
 * it; negative, they owe it. A void expense, or a bill nobody has paid yet,
 * creates no debts, so it has no position (SRS section 5). Gross: payments
 * are not taken off, as in the ledger with each person.
 */
export function myExpensePosition({
  status,
  paidStatus,
  revision,
  splits,
  payers,
}: {
  status: string;
  paidStatus: string;
  revision: number;
  splits: readonly RevisionAmount[];
  payers: readonly RevisionAmount[];
}): number | null {
  if (status === 'void' || paidStatus === 'unpaid') return null;
  const current = (rows: readonly RevisionAmount[]) =>
    rows.filter((row) => row.revision === revision).reduce((sum, row) => sum + row.amount_minor, 0);
  return current(payers) - current(splits);
}

/** The line under an expense saying where the user stands on it now. */
export type PositionLine = { tone: 'receive' | 'send' | 'settled'; text: string };

/**
 * Describes the user's part of an expense from what is still open of it, so
 * a row stops asking for money once payments, offsets or a simplification
 * have covered it (SRS FR-06.1). `openMinor` has the same sign as the
 * position; null while it is unknown, when the gross position is shown.
 */
export function describeMyPosition(
  positionMinor: number | null,
  openMinor: number | null,
  money: (amountMinor: number) => string,
): PositionLine | null {
  if (!positionMinor) return null;
  const open = openMinor ?? positionMinor;
  const receives = positionMinor > 0;
  if (open === 0) {
    return {
      tone: 'settled',
      text: `Settled: ${receives ? 'you were owed' : 'you owed'} ${money(Math.abs(positionMinor))}`,
    };
  }
  const sameWay = open > 0 === receives;
  const partly = sameWay && Math.abs(open) < Math.abs(positionMinor);
  return {
    tone: open > 0 ? 'receive' : 'send',
    text:
      `${open > 0 ? "You'll receive" : "You'll send"} ${money(Math.abs(open))}` +
      (partly ? ` of ${money(Math.abs(positionMinor))}` : ''),
  };
}

/**
 * What an expense means between the user and one person, from what each owes
 * the other on it and what of that is still open.
 */
export function describePairExpense(
  amounts: { oweMinor: number; owedMinor: number; oweOpenMinor: number; owedOpenMinor: number },
  name: string,
  money: (amountMinor: number) => string,
): string {
  const { oweMinor, owedMinor, oweOpenMinor, owedOpenMinor } = amounts;
  if (oweMinor === 0 && owedMinor === 0) return 'Nothing between you now';
  if (oweMinor > 0 && owedMinor > 0) {
    return `You owe ${money(oweOpenMinor)}, ${name} owes you ${money(owedOpenMinor)}`;
  }
  const iOwe = oweMinor > 0;
  const gross = iOwe ? oweMinor : owedMinor;
  const open = iOwe ? oweOpenMinor : owedOpenMinor;
  if (open === 0) {
    return iOwe
      ? `You owed ${name} ${money(gross)}, settled`
      : `${name} owed you ${money(gross)}, settled`;
  }
  const amount = open < gross ? `${money(open)} of ${money(gross)}` : money(gross);
  return iOwe ? `You owe ${name} ${amount}` : `${name} owes you ${amount}`;
}
