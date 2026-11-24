# 0019. Debt simplification, one agreed step at a time

- **Status:** Accepted
- **Date:** 2026-11-24

## Context

FR-06.5 asks for suggestions that reduce the number of transfers across the group, with explicit settlement allocation, the ledger and audit history preserved, and no creditor reassigned silently. Netting between two people (FR-06.4) already exists as offsets. Simplifying across three people changes who someone owes or is owed by, so it needs their consent, and payments between two people are private to them and admins (decision 8). The owner decided the rest on 2026-11-24.

## Decision

**One step among three people.** When Zubair owes Anas and Anas owes Yasir, a step moves an amount so that Zubair pays Yasir directly. Nobody's net with the group changes. Suggestions are offered only when a step cuts the number of transfers: both debts are equal (two become one), or Zubair already owes Yasir (the amount joins that transfer). Each person sees only the steps they are part of.

**Everyone in it accepts.** Any of the three proposes a step, which is their own yes. It applies only once all three have accepted, within 7 days. One no closes it. It lapses if the time runs out, if someone leaves, or if the debts no longer cover it when the last yes arrives. One open proposal per chain at a time.

**Only what is payable now.** Amounts are those a payment could cover today, so disputed amounts are never moved to someone else.

**Only the amount moved is shown.** A suggestion reads "Zubair pays Yasir Rs 1,000 directly, instead of Zubair paying Anas and Anas paying Yasir", never anyone's whole balance with someone else. A step is readable by its three people and admins, as are its activity entries.

**Written as new entries.** Applying a step writes, in one transaction under the pairs' locks: two `transfer` ledger entries (the debtor owes the middle person less, and the middle person owes the creditor less) and an adjustment linked to the step (the debtor owes the creditor more). No expense, payment or earlier entry changes. A transfer covers obligations oldest first, like an offset.

## Consequences

- New tables `debt_transfers` and `debt_transfer_answers`, a `transfer` ledger kind with `debt_transfer_id`, and `adjustments.debt_transfer_id`. Balance, payable, settlement and statement calculations already treat any entry other than a charge or adjustment as lowering a debt, so they include transfers without other changes.
- The three people are notified when a step is proposed, declined, applied or lapses, under the Payments push group.
- A whole-group plan of the fewest transfers was not chosen: it would need everyone with a balance to agree at once.
