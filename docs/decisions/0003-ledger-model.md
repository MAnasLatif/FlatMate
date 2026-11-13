# 0003. Ledger model

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

FlatMate records who paid for what, who owes whom, payments between flatmates, disputes and monthly settlement (SRS sections 4 and 5). Every balance shown must be explainable from the records behind it, financial history is never rewritten, amounts must add up exactly, and a dispute holds only the amounts it affects. The product decisions this depends on are in SRS section 12, especially items 2 (a dispute holds every share of the disputed expense) and 5 (only members can be owed).

## Decision

### Money

Amounts are `bigint` minor units (paisa for PKR), at most 10¹² per expense, in the apartment's single currency. No floating point is used for money anywhere: in the database, in TypeScript (which uses `BigInt` inside the split arithmetic), or in tests.

### Records

| Record | What it holds | Changes after creation |
|---|---|---|
| `expenses` | Title, category, date, due date, total, status, the current revision number | Descriptive fields and status, through functions only, logged |
| `expense_revisions` | One row per version of the money: total and split method | Never |
| `expense_payers` | Who paid how much, per revision | Never |
| `expense_splits` | Each participant's share, per revision | Never |
| `ledger_entries` | Debts between two members, and what reduces them | Never |

A trigger rejects any update or delete on the immutable tables, whatever the role.

### Ledger entries

Every entry is between a debtor and a creditor, both members, with a positive amount. Its kind says how it moves what the debtor owes the creditor:

| Kind | Created by | Effect on what the debtor owes the creditor |
|---|---|---|
| `charge` | Posting an expense revision | increases |
| `charge_reversal` | Replacing or voiding a revision | decreases, cancelling one earlier charge (it references it) |
| `payment` | Recording a payment from debtor to creditor | decreases |
| `offset` | Netting two members' debts against each other (a pair of entries) | decreases |

So for two members A and B, what A owes B is the sum of A→B charges, minus A→B reversals, payments and offsets, minus the same for B→A. Totals for a member are sums over their pairs. No balance is stored.

### States

An entry has no state of its own. It takes the state of its source:

- Expense entries: `provisional` until the objection window closes, `disputed` while a dispute is open (which holds all of that expense's entries), `final` afterwards. A `void` expense is cancelled by reversal entries, not by its state.
- Payment entries: `provisional` when recorded, `disputed` if the recipient objects, `final` when confirmed by app policy, `void` if a dispute concludes it was not made. Void payments are left out of every sum; disputed ones are shown separately and not counted as paid.
- Offsets are `final` when made.

Balances are reported per state, so the app can show what is final, what is still provisional and what is held by a dispute.

### Splitting an expense

The server computes every share; the app only previews with the same rules.

- **Equal** and **percentage** splits use the largest-remainder method. Each participant gets `floor(total × weight / total weight)`; the minor units left over go one each to the participants with the largest remainders. Ties go to the participant whose user id sorts first. Equal splits use weight 1; percentage splits use basis points that must sum to 10,000.
- **Fixed** splits take the amounts given, which must sum to the total.
- A participant can be given zero, which excludes them.

For Rs 200.00 split equally between three people, the shares are 66.67, 66.67 and 66.66 (SRS 5.1). Which two get the extra paisa follows the user id order, so it is the same every time.

### Who owes whom for one expense

Payers' contributions must sum to the total. Debts are matched without rounding:

1. Each person's contribution first covers their own share.
2. People who paid more than their share are creditors, and people who paid less are debtors.
3. Both lists are sorted by user id, and debtors are matched to creditors in order, each time for the smaller of what the debtor still owes and what the creditor is still owed.

With one payer, everyone else simply owes the payer their share. Matching is exact in integers, so the charges always add up to the shares and the contributions.

### Unpaid bills

An expense can be recorded as unpaid, with no payers, such as an electricity bill not yet paid to the utility. It creates no debts (SRS 5.2, section 12 item 5). When a member pays it, a new revision records them as payer and the charges appear.

### Corrections

Editing the money of an expense creates a new revision: reversal entries cancel every charge of the previous revision, and new charges are posted for the new one, in one transaction. Descriptive edits (title, category, notes) change the expense row and are logged in `audit_events` with before and after values.

### Per-expense payment status

Payments reduce what one member owes another as a whole. Whether a particular expense share is paid is worked out for display by applying the pair's payments to its charges, oldest first. It is not stored, so nothing can be counted twice.

### Idempotency

Posting an expense accepts a client-generated request id, unique per apartment. Repeating a request returns the expense it already created.

## Alternatives considered

- **A stored balance per pair, updated on every event.** Simple to read, but it can drift from its sources and cannot explain itself. Rejected (AGENTS.md money rules).
- **Editing expense rows in place.** Loses history and makes closed periods change. Rejected.
- **Storing payment allocations per expense.** Allows a payment to be tied to a specific expense, but every later change (an edit, a dispute) would need to rewrite allocations. The derived oldest-first view gives the same answer for display without stored state.
- **Splitting each share proportionally across several payers.** Fairer in appearance, but needs rounding in two dimensions at once, which cannot always match both the shares and the contributions exactly. The ordered matching above is exact and easy to explain.

## Consequences

- Every financial operation is a database function that writes entries and logs an event in one transaction.
- Balances are sums over entries; indexes on `(apartment_id, debtor_id, creditor_id)` keep them fast. If an apartment's history grows large, settlement snapshots can bound the sums later.
- The app and the database implement the split arithmetic twice. Both are tested against the same cases, starting with SRS 5.1.
- Partly paid vendor bills (some of the bill paid, the rest still owed to the utility) are not modelled. An expense is either fully paid by members or unpaid.
