# 0015. Security deposits

- **Status:** Accepted
- **Date:** 2026-11-24

## Context

FR-10.4 asks to track security deposits and refund or exit adjustments. A deposit is paid to the landlord, who is not a member and so can never be a creditor (decision 5). The money rules still apply: amounts are integers, balances are derived, posted records never change, and financial writes are atomic and retry-safe. The owner decided the rest on 2026-11-24.

## Decision

**Shares, linked to balances.** An admin records a deposit: its total, the day it was paid, who it was paid to, which members paid the landlord (as for an expense's payers) and each member's share (as for an expense's split, by the same rounding rule). A member who paid more than their share is owed the difference by those who paid less, posted as adjustments linked to the deposit.

**Moving out: refund or takeover.** When a member moves out, an admin records either that the landlord refunded their share to them, less deductions with reasons (balances between members do not change), or that another current member took the share over, who then owes them that amount.

**The end: returned to one member.** When the landlord returns what is left to one member, each deduction is shared in proportion to the shares still held, with the same rounding rule; each holder's refund is their share less their deductions, and the member who received the money owes each other holder their refund. A share still held by someone who has left must be refunded or taken over first.

**Admins only.** Admins record and correct; every current member sees each deposit, every share and its history, and people who hold a share are notified when it changes. A former member still sees the deposits they held a share of.

**Corrections are new entries.** The latest action still in effect can be undone: its share entries are repeated with the opposite sign and its adjustments posted the other way round. Undoing the recording cancels the deposit.

## Consequences

- A share is never stored as a number; it is the sum of the holder's `deposit_entries`. Deposits, actions and entries cannot be updated or deleted.
- Each action is one transaction, locks its deposit so actions happen one at a time, and carries a client request id, so a retry returns the first result.
- Deposit debts are ordinary adjustments, so balances, settlement and statements include them without special cases. Their audit event is the deposit's own, so the two people are told once.
- Deposit notifications fall in the Payments push group.
