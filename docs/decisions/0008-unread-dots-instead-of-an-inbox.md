# 0008. Unread dots instead of an inbox

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

Task 1.43 built a notification inbox: a bell in the top bar with an unread count, opening a list of notifications that each led to their record. SRS section 3.2 asked for a "notification entry" in the top bar.

On 2026-11-15 the owner asked to remove the inbox completely. Unread notifications should be shown as a red dot on the thing they are about, and following the dots should lead to the place the notification came from, as in messaging apps.

## Decision

**No inbox, no bell.** The `/notifications` screen and the bell are removed. The `notifications` table, push delivery and opening a tapped push are unchanged.

**A red dot marks each place with something unread.** On an icon it is a badge with the number unread, kept inside the icon's own padded box so it is never clipped. The app loads the user's unread notifications (at most 500, newest first) and places each one: the expense a dispute is about comes from `disputes`, and the other person in a payment from `payments`, both read under RLS. Each place picks its notifications with a matcher in `app/src/features/notifications/unread.ts`:

| Notification about | Dot on | Cleared when the user opens |
|---|---|---|
| An expense | Its row in the dashboard feed | The expense |
| A dispute | The expense's row, and the dispute's row on the expense | The dispute |
| A payment | Settle up, the person's line in the settlement, "Payments and everything else", the payment's row | The payment |
| An offset or adjustment | Settle up, the person's line, "Payments and everything else" | The ledger with that person |
| A closed period | Settle up | The settlement screen |
| Members and requests to join | The members icon, with a count | The members screen |
| The apartment, such as being let in | (opens there) | The dashboard |
| Anything in another apartment | The apartment switcher's logo, with a count, and the apartment in My Apartments | (cleared as above, inside it) |
| A declined request to join | (opens there) | The home screen or My Apartments |

The settlement screen also clears payments and ledger entries with anyone who has no line there, so no dot is left pointing nowhere.

**Opening a screen marks what it shows as read.** The dot goes at once, and the mark is sent with the existing `mark_notifications_read` RPC. If that fails, for example offline, the dot comes back and is cleared the next time.

## Alternatives considered

- **Keep the inbox and add dots.** Two ways to reach the same record, and the owner asked for the inbox to go.
- **Store a "place" on each notification on the server.** It would save the two lookups, but the places are a matter of the app's layout, which changes more often than the schema. They can move to the server if the lookups become slow.

## Consequences

- There is no list of past notifications. Once read, a notification is only in the record's own history.
- An unread expense in a month the dashboard is not showing has no visible dot until that month is opened. The push, if any, still opens it directly.
- A new notification type must get a place in the table above, a matcher, and a screen that clears it, or its dot leads nowhere.
- SRS section 3.2's "notification entry" is replaced by the dots.
