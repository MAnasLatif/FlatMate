# 0011. One join code per apartment

- **Status:** Accepted
- **Date:** 2026-11-17

## Context

Admins invite people with join codes (FR-02.2). Each copy, share or email made a new code that worked for 7 days, and the settings listed every code that still worked with its expiry. Admins found several codes, each with its own deadline, hard to follow, and a code shared a week earlier stopped working without warning. Codes were also kept only as a hash, so a code could not be shown again after it was made.

## Decision

- **One code at a time.** An apartment has one join code. Copying, sharing and emailing all use it; the database makes it the first time an admin asks (`get_join_code`).
- **It lasts until changed.** The code does not expire (`expires_at` is `infinity`). An admin changes it with `change_join_code`, which stops every older code, for example after sharing it with the wrong person.
- **Admins can read it.** The code is kept readable next to its hash, and only the apartment's admins can read it. Joining still matches on the hash.
- **Emails carry the same code.** A failed email no longer revokes it, since admins share the same code elsewhere.
- **Older app versions keep working.** `create_invite` still makes 7-day codes for versions that call it; those work until they expire or the code is changed.

## Alternatives considered

- **Several codes, shown with their time left.** Built first; still too much to follow for a non-technical admin.
- **One code that renews every 7 days.** Simpler than a list, but a code shared earlier would still stop working unexpectedly.

## Consequences

- A code lasts until an admin changes it, so a leaked code keeps working until then. The risk is small: a code only sends a request, an admin approves every request, and wrong guesses are rate-limited.
- The settings show one code with Copy, Share and Change code.
- Deploy the migration together with the updated `send-invite-email` function: the function no longer expects `invite_id` and `valid_days`.
