# 0016. Shared inventory

- **Status:** Accepted
- **Date:** 2026-11-24

## Context

FR-10.5 asks for an optional shared inventory with ownership and maintenance costs. Flatmates buy things together, use each other's things, and pay to keep them working. The money rules still apply: balances come only from ledger records, and a new money path needs the same care as expenses and deposits. The owner decided the rest on 2026-11-24.

## Decision

**The flat's or one member's.** An item belongs to the flat (bought together) or to one current member, who lets everyone use it. Ownership is a record only and moves no money. An item stays its owner's after they leave.

**Costs are linked expenses.** What an item cost to buy and to keep working are ordinary expenses, each counted towards at most one item as its purchase or as maintenance. They are split, objected to, disputed and settled like any other expense; the item only adds them up, leaving out cancelled ones and saying when a total includes provisional or disputed amounts. A cost is added from the item's page (the new expense is linked once saved, with a retry if that fails) or by choosing the item on an existing expense's page.

**Managed by those who may add expenses.** Every current member sees the inventory. Anyone who may add expenses adds and edits items and links expenses; admins remove items added by mistake, which leaves their expenses as they are.

**Status, not buyouts.** Items carry a condition (new, good, fair, poor) and a status (in use, needs repair, gone). Selling or throwing something away, or an owner taking it with them, is a change of status; any money involved is recorded as an expense or a payment.

## Consequences

- `inventory_items` and `inventory_costs` hold no amounts. Totals come from the linked expenses' current revisions in `get_inventory`, so editing or cancelling an expense updates its item with no extra work.
- A link is a label, not a financial record, so it can be changed or removed; every change is an `inventory_item` audit event and appears in the activity timeline under Expenses.
- Inventory changes notify nobody. Former members do not see the inventory.
