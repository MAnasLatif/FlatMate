# 0017. Rooms and occupancy

- **Status:** Accepted
- **Date:** 2026-11-24

## Context

FR-10.6 asks for optional room-based allocations and occupancy-driven splits. In many flats a bigger room pays more of the rent, people share rooms, and people move in and out partway through a month. The money rules still apply: splits add up exactly with a deterministic rounding rule, the server is the authority, and posted records never change. The owner decided the rest on 2026-11-24.

## Decision

**Rooms with a weight, and stays with dates.** Admins describe each room with a name and a whole-number weight from 1 to 100, and record who lived in it from which day to which day (both included; an open end means they still live there). One person is in one room at a time. A room no longer used is archived; its past stays still count.

**Weight × days.** A bill covering a period is split day by day: every day is worth the same, a day's part is shared by the rooms someone lived in that day in proportion to their weights, and a room's part is shared equally by the people in it that day. An empty room takes no part, and a day nobody lived anywhere counts for nothing. Each person's exact share is floored to minor units and the leftover units go to the largest remainders, ties in user id order, as for `compute_shares`.

**Worked out by the server, saved as a split by amount.** `get_room_split` returns the amounts; the app fills them in as a split by amount and notes the period in the expense's notes. The expense is posted and validated like any other, so changing rooms, weights or dates later never changes a posted expense. Only current members can share a new expense, so a former member's days are listed as left out and their room counts as empty on those days.

**Admins.** Every current member sees the rooms and can work out a split; admins change them. The split is offered when adding or editing an expense.

**Repeatable expenses** (added with task 3.3.2, decided on 2026-11-24). A repeatable expense can split by room each time it is charged, either in advance (from its bill date to the day before the next, like rent) or in arrears (from the previous bill date to the day before this one, like electricity); a fixed amount defaults to advance and a variable one to arrears. On the bill day the job charges a fixed amount split by room at once, but waits for an admin when someone's days would be left out or nobody lived in a room. When an admin enters a bill, they can split it by room and the server works it out while posting. Each charge is saved as a split by amount with the period in its notes.

## Consequences

- Rooms and stays store no amounts and move no money. Changes are `room` audit events, under Settings in the activity timeline, and notify nobody.
- Room and stay changes in one apartment are serialized with an advisory lock, so two admins cannot put one person in two rooms on the same days.
- A period is at most 366 days.
- A template split by room stores `split_method = 'room'`, its `room_period` and no participants; its charges are ordinary expenses split by amount.
