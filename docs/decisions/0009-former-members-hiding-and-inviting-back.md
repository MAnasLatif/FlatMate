# 0009. Former members: hiding and inviting back

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

The members screen lists everyone who left or was removed under Former members. On 2026-11-15 the owner asked for two admin actions on that list: permanently remove a former member, and ask a former member to rejoin. The owner also asked that admins manage people from each person's page instead of a menu on every row, and for a Send invite button on the members screen.

Financial history is never rewritten (decision 0003). A former member's expenses, payments and balances must stay, with their name, so the actions cannot delete them.

## Decision

**Remove from list hides, it does not delete.** `hide_former_member` sets `apartment_members.hidden_at` on the person's past memberships. The Former members list leaves them out. Nothing else changes: their records, balances and name on old records stay, and they can still ask to join again with a code. Hiding is recorded in `audit_events` (`member.hidden`, with who hid them) and tells nobody. There is no `hidden_by` column: a second reference from `apartment_members` to `profiles` would make the app's embedded profile lookup ambiguous, including in versions already installed.

**Invite back is an invitation the person answers.** `invite_back` creates a `rejoin_invites` row for someone who used to be a member, with one waiting invitation per person and apartment; inviting again returns the waiting one. The person is notified (`rejoin_invite.sent`), and accepts or declines from the home screen or My Apartments. Accepting makes them a member again in the same transaction, recorded as `member.joined`, so admins are told who joined. Declining tells the admin who invited. An admin can withdraw a waiting invitation. The table is reached only through these functions.

**Admins act from the person's page.** Tapping a member opens their page (the balance with them). For an admin, its top bar has the actions: role, expense permission and removal for a member; Invite back, Withdraw invitation and Remove from list for a former member. An admin's own row keeps its menu for stepping down and their own expense permission. The members screen's top bar has Send invite, which creates a join code and opens the share sheet.

## Alternatives considered

- **Delete a former member's membership.** Breaks the history every balance is explained by.
- **Block hidden members from rejoining.** Offered; the owner chose hiding only.
- **Invite back by sharing a code.** No new backend, but the person still goes through a request and approval, and the admin cannot see who was invited.

## Consequences

- A hidden former member cannot be invited back from the app, since they are no longer listed. They can still ask with a code.
- Someone who rejoins is listed once, as a member; their earlier memberships are not shown as former ones.
- `rejoin_invite` is a new notification record type, change-event kind and unread place (decision 0008).
