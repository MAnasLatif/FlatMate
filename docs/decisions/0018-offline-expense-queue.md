# 0018. Expenses added offline are queued and sent on reconnect

- **Status:** Accepted
- **Date:** 2026-11-24
- **Amends:** [0007](0007-offline-reading-and-live-sync.md), part 1: "Mutations do not queue while offline", for adding expenses only.

## Context

FR-10.7 asks for offline expense drafts that are submitted without duplicates on reconnect. Decision 0007 kept every write online so nothing is sent later without the user seeing it. A first version of task 3.4 saved drafts that the user reviewed and saved one by one from a Drafts screen. On 2026-11-24 the owner chose instead to keep the app event-driven: actions taken offline wait in a queue and are sent by themselves when the connection returns, with no drafts screen, and only for adding expenses.

## Decision

**What can wait.** Only adding a new expense. Edits, payments, disputes, settlement and settings still need a connection: sending those late against balances that changed meanwhile is riskier, and a payment must never look final while offline.

**Saving offline.** Offline, Add expense checks the form as usual and its button reads "Save offline". The form, the members at that moment and a fresh id go into an encrypted queue on the phone: one entry per user in `expo-sqlite/kv-store`, encrypted like the session, apart from the saved query cache and never part of it. At most 20 wait per apartment. Receipts and saving as a quick-add wait until it is sent, since the queue keeps no photos.

**Sending.** A sender mounted once while signed in runs when the app starts online and on every reconnect event from React Query's `onlineManager`. It sends the queue oldest first: it fetches the apartment's members, leaves anyone who joined since out of the split, checks the form again, and calls `post_expense` with the entry's id as the request id. The server is still the authority, and the request id makes any repeat return the same expense, so an expense is added once whether it is sent by the sender, retried, or saved from the form. Runs never overlap.

- **Sent:** it leaves the queue and the apartment's money refreshes; other members get the usual change event.
- **Unreachable:** it stays queued for the next reconnect, and the run stops.
- **Turned down** (for example, the user may no longer add expenses, or someone in it has left): it stays with the reason, and the rest still go.

**Visibility.** The dashboard lists expenses not sent yet, marked "Waiting to send" or "Not sent" with the reason; none counts in any total or is seen by anyone else until the server accepts it. Each opens in Add expense to change, fix, send at once, or delete. Entries older than 30 days are dropped, and sign-out deletes the queue.

## Consequences

- No database change: posting reuses `post_expense` and its `client_request_id`.
- An expense may be added hours after it was written, with the date the user gave it. Its objection window starts when the server receives it.
- Opening a queued expense while the sender is posting it is safe: both use the same request id.
- Extending the queue to other writes needs a new decision, with its own conflict rules.
