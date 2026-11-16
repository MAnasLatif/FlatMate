# 0010. Invites sent by email

- **Status:** Accepted
- **Date:** 2026-11-16

## Context

Admins invite people with join codes (FR-02.2). Until now the app only made a code and opened the phone's share sheet, so the admin had to pick an app and a contact themselves. Admins asked to type an email address in the app and send the invite from there.

FlatMate had no way to send its own email. Supabase Auth sends sign-up and password codes, but only for Auth's own flows, and the hosted free plan limits it further. Sending mail on behalf of users can be abused for spam, and email addresses are personal data.

## Decision

- **FlatMate sends the email, through an Edge Function.** The app calls `send-invite-email` with the apartment and the address. The function calls `private.prepare_invite_email` as the signed-in admin, then sends the email through [Resend](https://resend.com) over HTTP. In local development it sends to the stack's Mailpit instead, so the whole flow can be tested without an account.
- **The database decides.** `prepare_invite_email` checks that the caller is an admin, checks the address's shape, applies the limits and creates an ordinary join code with `create_invite`. The email carries that code; joining with it still sends a request that an admin approves.
- **Limits:** 20 invite emails a day from one admin, and 3 a day to the same address from one apartment.
- **No stored address.** The database keeps only a SHA-256 hash of the trimmed, lower-case address, for the per-address limit, in `private.invite_emails`, which clients cannot read. Logs record events and status codes, never addresses, names or codes.
- **A failed email leaves no code.** If the provider refuses or cannot be reached, the function revokes the code it just created. The attempt still counts toward the limits.
- **Copy and Share stay.** The same sheet still copies or shares a code for admins who prefer their own apps.

## Alternatives considered

- **Open the phone's mail app** with the address and code filled in. No backend or cost, and the mail comes from the admin's own address, but it takes the admin out of the app and depends on a mail app being set up. Not chosen, at the admin's request.
- **Supabase Auth's invite email** (`inviteUserByEmail`). It creates an Auth user for the address and only fits inviting people to the project, not into one apartment, and it needs the service key in a flow started by a client.
- **Store the address** to show "invited" in the members list. Not needed yet, and a hash is enough for the limit.

## Consequences

- Each environment needs a Resend account with a verified sending domain, and the secrets `RESEND_API_KEY` and `INVITE_EMAIL_FROM` set for the function (`supabase/README.md`). Without them the function answers `not_configured` and the app suggests sharing a code instead.
- Sending depends on Resend being up; the function gives it 10 seconds.
- A SHA-256 hash of an email address can be matched against guessed addresses. It is only in the `private` schema, and the limit is its only use.
- The `invite_emails` rows are never deleted. If the table grows large, delete rows older than a day: only the last 24 hours count.
