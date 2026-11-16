/** The signed-in user's rows from one expense's splits or payers, across revisions. */
type RevisionAmount = { revision: number; amount_minor: number };

/**
 * What one expense means for the signed-in user, from the current revision:
 * what they paid minus their share. Positive, others owe them that much for
 * it; negative, they owe it. A void expense, or a bill nobody has paid yet,
 * creates no debts, so it has no position (decision 0003). Gross: payments
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
