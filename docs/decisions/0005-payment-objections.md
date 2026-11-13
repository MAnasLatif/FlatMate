# 0005. Payment objections

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

A recorded payment is a claim, not proof of a transfer. It counts as paid at once, provisionally, and the recipient can decline it within 7 days of recording (SRS FR-07.4, FR-07.5, section 12 item 3). Without an objection it becomes final as confirmed by app policy, never bank-verified, and no admin action can certify a transfer (FR-07.6, FR-07.8). Late objections are adjustment cases that never change closed history (FR-07.6, item 4). The SRS does not say how a declined payment is settled.

## Decision

- **Who declines.** Only the recipient, with a reason.
  - *Inside the window:* the payment becomes `disputed` and stops counting as paid, so the payer owes the full amount again. The window pauses.
  - *After the window:* the objection is a late case. The payment stays final and counted.
- **How it ends.** Either party can end it.
  - The recipient can withdraw the objection, for example when the money turns up. The payment counts again and its window resumes.
  - The payer can void a payment that is not final, for example one recorded by mistake or one that never arrived. It stops counting, stays in the history and closes the open case.
  - A final payment cannot be voided, so closed figures never move.
- **No admin verdict.** An admin can see the case but has no action on it. Deciding whether money arrived would amount to certifying a transfer. An unresolved case stays open and is carried forward at settlement.
- **Confirmation.** A scheduled job makes provisional payments past their window `final`. The app labels them as confirmed by app policy.
- **Storage.** Objections live in `payment_disputes` and `payment_dispute_events`, not in the expense dispute tables. An expense dispute's answers adjust a split and its creator is the counterpart; none of that applies to a payment. Keeping the two apart keeps each set of functions simple.

## Alternatives considered

- **One disputes table for expenses and payments** (as decision 0004 expected). Every expense dispute function would need guards for a subject it does not handle. Rejected.
- **Letting an admin rule on a declined payment.** Conflicts with FR-07.8. Rejected.
- **Voiding a final payment after a late objection.** Would change what a closed period counted. Rejected; a late case is resolved by an adjustment.

## Consequences

- Correcting a final payment through an adjustment entry is still to be built. It belongs with settlement and adjustments (tasks 1.31 and 1.32). Until then a late case can only be withdrawn.
- The pay flow screens (task 1.30) show recorded, provisional, disputed and final payments distinctly, and say that a final payment was confirmed by app policy, not by a bank.
