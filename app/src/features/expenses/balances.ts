import type { Balance } from './api';

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
