# 0013. Quick-adds and budgets

- **Status:** Accepted
- **Date:** 2026-11-24

## Context

FR-10.3 asks for quick-add templates for common expenses, and budget caps with alerts. The SRS did not say who owns a template, what period a budget covers, who sets budgets, or who is alerted and when. The owner decided these on 2026-11-24.

## Decision

**Quick-adds belong to the apartment.** Every current member sees them. Anyone who may add expenses saves one, by turning on "Save as a quick-add" when adding an expense, and deletes one from the Quick-adds screen. A quick-add keeps the name, amount, category and split; the date, who paid and the notes change every time and are left out. An equal split among every current member is saved without names, so people who join later are included. Saving under a name already used replaces that quick-add. An apartment keeps at most 30.

**Using one only fills in the Add expense form.** The user checks it and saves as usual, so the expense goes through `post_expense` like any other. A quick-add is not a financial record, so it can be replaced or deleted freely.

**Budgets are monthly and set by admins.** One for all of the apartment's spending and one for any category, per calendar month in the apartment's timezone, the month the dashboard shows. Spending counts as in the month comparison (decision 21): expenses dated in the month, unpaid bills included, cancelled ones left out. Budgets on archived categories stop counting.

**Alerts at 80% and 100%, to every current member.** A job checks every 5 minutes and tells everyone the first time a month reaches each level. A month that jumps straight past 100% sends only that alert. Changing a budget's amount starts its alerts afresh. Alerts open the dashboard, where the budgets show as bars, and form their own push group, Budgets.

## Alternatives considered

- **Personal quick-adds.** Each flatmate would rebuild the same few, and the split is the apartment's anyway.
- **Only admins manage quick-adds.** They only fill in a form; whoever may add expenses can make them.
- **Budgets per settlement period.** Settlement periods do not line up with the months the dashboard and comparison show.
- **Alerting from inside each posting function.** Immediate, but every path that changes spending (posting, editing, cancelling, repeatable charges, paying a bill) would need it. The job reads the current totals and is retry-safe; a few minutes' delay is fine for a budget.

## Consequences

- `budget_alerts` keeps the highest level sent per budget and month, and only ever raises it, so the job can run twice or concurrently without sending anything twice. A month that drops below 80% after an alert does not alert again.
- Budget figures sit under the apartment's money cache key, so every expense change refreshes them. A changed budget sends a `budget` change event, and a changed quick-add an `expense_template` one.
- Push text stays generic ("Your apartment has reached a monthly budget.") with no amounts.
