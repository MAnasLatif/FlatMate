# 0012. Reminders and push preferences

- **Status:** Accepted
- **Date:** 2026-11-24

## Context

FR-09.2 asks for a configurable reminder schedule, user notification preferences, and no excessive duplicate reminders. FR-09.1 names due dates and settlement among the things to notify, and FR-09.4 requires scheduled jobs to be timezone-aware and retry-safe. The SRS did not say who is reminded, who sets the schedule, or what a preference turns off. The owner decided these on 2026-11-24.

Notifications already exist as rows created from `audit_events`, with push as a queue and red dots in the app instead of an inbox ([decision 0008](0008-unread-dots-instead-of-an-inbox.md)).

## Decision

**Bill due dates.** While a bill is unpaid and has a due date, its collector is reminded a set number of days before and again on the day. A bill with no collector, or whose collector has left, reminds the apartment's admins, since one of them decides who pays.

**Settlement day.** A set number of days before the settlement day, each current member who still owes someone in the apartment is reminded. "Owes" is pairwise and counts final and provisional amounts; disputed amounts are on hold and do not count. Members who are only owed are not reminded.

**Schedule.** Admins set both lead times per apartment in General settings: 0 to 14 days for bills (0 meaning only on the day) and 1 to 14 days for settlement, or off. New and existing apartments start at 1 and 2 days. Reminders go out from 09:00 in the apartment's timezone.

**Preferences.** Each person can turn push off by group (expenses, payments, disputes, members, reminders, settlement) in their profile. It applies to every apartment. Only the push is held back: the notification is still created, so the red dot still shows.

**Duplicates.** A reminder is a notification with a `reminder_key` (type, record and date), unique per person, so a job that runs twice, late or concurrently never sends one twice. A "due soon" reminder is never sent on or after the due date, where "due today" takes over.

## Alternatives considered

- **Reminding everyone in a bill's split.** Noisy for people who are not paying it; the collector is the one who can act.
- **Each user setting their own lead times.** More flexible, but a second schedule to explain and to run, and the apartment's timezone already drives the job.
- **Preferences per apartment.** More switches for a small gain; someone in two flats rarely wants different settings in each.
- **Muting the notification itself, not only the push.** It would hide the red dot too, so a muted change could be missed entirely.
- **Reminders as audit events.** A reminder records no change to any record, so it does not belong in the history; it is written straight to `notifications`.

## Consequences

- The `send-reminders` cron job runs every 15 minutes. Changing a due date, paying the bill or settling up stops later reminders without extra work, because the job reads the current state each time.
- A reminder created before the bill was paid can still push shortly after payment. This is acceptable for a reminder and avoids a second cleanup path.
- `claim_pushes` checks preferences when it sends, so turning a group off also holds back pushes still waiting. Such pushes are recorded as skipped with `muted`.
- A new notification type must fall in a group in `private.notification_category`, or it cannot be muted. The database test checks every stored type has one.
