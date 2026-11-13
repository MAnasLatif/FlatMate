# 0004. Expense disputes

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

Expenses are accepted by default, and an affected member can object (SRS FR-05). The SRS decides what a dispute holds (section 12, item 2: every share of the disputed expense) and what happens after the deadline (item 4: an adjustment case that never changes closed history, agreed by the two members or decided by an admin). It leaves open how a proposal is turned into a new split, who decides when the two disagree, and how disputes interact with editing and the objection window.

## Decision

**Who and what.** Anyone in the expense's current split, except the person who added it, can raise a dispute: a *decline* (their share should be zero) or an *adjustment* (their share should be a stated amount). A reason is always required. Only one dispute per expense is open at a time, so each answer starts from the split everyone saw. Other expenses can be disputed at the same time.

**Inside the window.** A dispute raised before the objection window closes holds the whole expense: its status becomes `disputed`, every entry it created is reported as disputed and none of it is payable. The window is paused, and the time left is stored on the dispute.

**After the deadline.** An objection to a final expense, or one raised after its window closed, is a late adjustment case. It holds nothing: the expense stays final and its figures do not move. Edits, voiding and recording a bill payment are refused while any dispute on the expense is open, late or not.

**Applying a proposal.** The raiser gets the share they proposed. The difference is spread over the other participants in proportion to their current shares, by the largest-remainder rule used for splits (ties to the lowest user id); participants with a zero share keep it. This is written as a new revision with a fixed split, using the same reversal-and-repost mechanism as an edit (decision 0003), and the expense becomes provisional with a fresh objection window, because the other participants' shares changed. A proposal that nobody else could absorb is refused when it is raised.

**Answers.**

- The person who added the expense accepts, which applies the proposal, or rejects with a message, which escalates the dispute.
- An escalated dispute is decided by an admin who is neither the raiser nor the creator. They apply the proposal or uphold the expense, with a message.
- If the creator has left the apartment, such an admin may decide an open dispute directly.
- The raiser can withdraw at any time before it is resolved.
- Upholding or withdrawing leaves the expense unchanged and resumes its paused window with the time that was left.

**Record.** Disputes keep their state, and every step (raised, accepted, rejected, withdrawn, upheld, adjusted) is a row in `dispute_events` that can never change, with the actor, message and details. The expense's audit trail notes each step too. Every function can be retried safely.

## Alternatives considered

- **Several open disputes per expense.** Each answer would rewrite shares the other proposals were based on. Rejected for the MVP; the next person can object once the first dispute ends.
- **Spreading the difference equally.** Ignores a percentage or fixed split the payer chose on purpose. Rejected in favour of proportional.
- **Holding a final expense when a late case opens.** Would change figures that may already be settled. Rejected, as section 12 item 4 requires.
- **Letting the creator decide as admin.** They already rejected the proposal, so this would make the rejection final. Rejected; a third person decides.

## Consequences

- An apartment where the creator is the only admin cannot decide an escalated dispute until another admin is appointed or the raiser withdraws. Settlement carries such disputes forward (task 1.32).
- The finalisation job (task 1.24) only finalises `provisional` expenses, so held expenses wait automatically.
- Payment disputes (task 1.28) are expected to extend the same tables with a payment subject.
- Evidence files for disputes are added with the dispute screens (task 1.25).
