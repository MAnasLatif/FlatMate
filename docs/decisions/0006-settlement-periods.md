# 0006. Settlement periods and adjustments

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

Each apartment settles monthly on its settlement day (SRS FR-08, section 12 item 9). Balances must never be zeroed just because a date passed; only reconciled obligations are finalised, and the rest carries forward (FR-08.5). Closed periods stay auditable, and corrections use linked adjustment entries (FR-08.6). Late objections become adjustment cases that the two members agree on, or that an admin decides (item 4, decisions 0004 and 0005). The ledger (decision 0003) is continuous: a balance is the sum of every entry so far, so nothing needs to be moved to carry it forward.

## Decision

**Periods.**
- A period runs from the settlement day to the day before the next one. A settlement day of 29 to 31 falls on the last day of shorter months.
- Each period row stores its own start and end, so a new settlement day takes effect from the next period.
- A scheduled job, using the apartment's timezone, closes a period once its last day has passed. It then opens the next one and catches up any it missed.

**Closing.**
- Closing records an immutable snapshot of every pair's balance by state (final, provisional, disputed), together with the number of open disputes.
- Nothing is zeroed. Whatever is unpaid or unresolved stays in the ledger and is therefore carried forward.
- Reconciled obligations are those that payments and offsets cover, worked out oldest first as before.

**Locking.**
- A *final* expense dated in a closed period is locked: it cannot be edited or voided. Recording who paid an unpaid bill is still allowed, because the bill counted nothing when the period closed and the payment is a new event.
- No expense can be posted with, or moved by an edit to, a date in a closed period.
- Provisional and disputed expenses are not yet reconciled, so they stay open to change until they become final.

**Adjustments.**
- A new ledger entry kind, `adjustment`, means the debtor owes the creditor that much more. It is final when made and links to the expense, payment or dispute it corrects.
- It needs the consent of the person it costs: the debtor, for taking on more, or the creditor, for giving up an amount by recording the reverse. Otherwise an admin who is party to neither side decides.
- When a late expense dispute is accepted on a locked expense, the per-pair differences between the old and the adjusted debts are posted as adjustments. The closed revision is left as it was.
- A late objection to a final payment is resolved the same way, with the payer's or a neutral admin's adjustment.

**Preview.** The settlement preview shows each member what they owe and are owed by each person in the open period, what is held by disputes, and the net. It links to the existing source obligations, and to the pay flow for gross or net payment.

## Alternatives considered

- **Zeroing balances into a carried-forward entry at close.** Moves money around on paper and makes balances harder to explain. Rejected; the continuous ledger already carries balances.
- **Locking every expense dated in a closed period.** Would freeze obligations that were never reconciled, against FR-08.5. Rejected.
- **Rewriting the revision of a locked expense after a late dispute.** Would change what a closed period counted. Rejected in favour of adjustments.

## Consequences

- Every balance function treats `adjustment` like a charge. This had to be changed in each place that sums entries.
- A member who forgot an expense from a closed month adds it with today's date.
- Reports for a closed month (Phase 2) read the snapshot, not live sums.
