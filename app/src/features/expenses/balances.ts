import type { Balance, PairBalance } from './api';

/** The signed-in user's position in an apartment, as the dashboard shows it. */
export type BalanceSummary = {
  /** What the user owes, summed over the people they owe after netting each pair. */
  oweMinor: number;
  /** What others owe the user, summed the same way. */
  receiveMinor: number;
  /** receive minus owe. Positive: the user is owed overall. */
  netMinor: number;
  /** Amounts still within an objection window are part of the figure, so it can change. */
  oweIsProvisional: boolean;
  receiveIsProvisional: boolean;
  /** Amounts held by open disputes, kept out of every figure above. */
  heldOweMinor: number;
  heldReceiveMinor: number;
};

/**
 * Turns per-person balances into the dashboard summary.
 *
 * For each person, final and provisional amounts are added together: expenses
 * are accepted by default, so a provisional amount is payable, but the figure
 * it lands in is flagged as provisional. A positive result is owed by the user
 * and a negative one is owed to them. Disputed amounts are held: they are
 * netted per person on their own and reported separately, never mixed into
 * what is payable (decision record 0003).
 */
export function summarizeBalances(balances: readonly Balance[]): BalanceSummary {
  const summary: BalanceSummary = {
    oweMinor: 0,
    receiveMinor: 0,
    netMinor: 0,
    oweIsProvisional: false,
    receiveIsProvisional: false,
    heldOweMinor: 0,
    heldReceiveMinor: 0,
  };

  for (const balance of balances) {
    const payable = balance.finalMinor + balance.provisionalMinor;
    if (payable > 0) {
      summary.oweMinor += payable;
      if (balance.provisionalMinor !== 0) summary.oweIsProvisional = true;
    } else if (payable < 0) {
      summary.receiveMinor -= payable;
      if (balance.provisionalMinor !== 0) summary.receiveIsProvisional = true;
    }

    if (balance.disputedMinor > 0) summary.heldOweMinor += balance.disputedMinor;
    else summary.heldReceiveMinor -= balance.disputedMinor;
  }

  summary.netMinor = summary.receiveMinor - summary.oweMinor;
  return summary;
}

/** Where the signed-in user stands with one person. */
export type PairPosition = {
  /** What the user owes them: final and provisional amounts. */
  oweMinor: number;
  /** What they owe the user: final and provisional amounts. */
  owedMinor: number;
  /** owed minus owe. Positive: they owe the user overall. */
  netMinor: number;
  /** Provisional amounts are part of the figures, so they can still change. */
  isProvisional: boolean;
  /** Amounts held by open disputes, kept out of every figure above. */
  heldOweMinor: number;
  heldOwedMinor: number;
};

const NO_AMOUNTS = { finalMinor: 0, provisionalMinor: 0, disputedMinor: 0 };

/**
 * The user's position with one person, by the same rule as the dashboard:
 * final and provisional amounts are payable, disputed amounts are held. No
 * balance means nothing between them.
 */
export function pairPosition(balance: PairBalance | undefined): PairPosition {
  const owe = balance?.owe ?? NO_AMOUNTS;
  const owed = balance?.owed ?? NO_AMOUNTS;
  const oweMinor = owe.finalMinor + owe.provisionalMinor;
  const owedMinor = owed.finalMinor + owed.provisionalMinor;
  return {
    oweMinor,
    owedMinor,
    netMinor: owedMinor - oweMinor,
    isProvisional: owe.provisionalMinor !== 0 || owed.provisionalMinor !== 0,
    heldOweMinor: owe.disputedMinor,
    heldOwedMinor: owed.disputedMinor,
  };
}

/** "Zubair owes you 66.67 PKR", "You owe Zubair 150.00 PKR" or "You and Zubair are square". */
export function describePairNet(
  position: Pick<PairPosition, 'netMinor'>,
  name: string,
  money: (amountMinor: number) => string,
): string {
  if (position.netMinor > 0) return `${name} owes you ${money(position.netMinor)}`;
  if (position.netMinor < 0) return `You owe ${name} ${money(-position.netMinor)}`;
  return `You and ${name} are square`;
}
