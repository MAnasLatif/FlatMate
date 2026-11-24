# FlatMate backend

Everything that runs on Supabase: the database schema, security policies, database functions, Edge Functions, scheduled jobs, seed data and database tests.

> **Status: Phase 1 schema in place.** Profiles, apartments and members (joining by request, approved by an admin), expenses and the ledger (with who will pay an unpaid bill and what an Other expense was), disputes, payments (naming the account they went into), offsets, receiving accounts, settlement periods, adjustments, member exits, change events and notifications exist, with pgTAP tests. What is left is in [docs/TASKS.md](../docs/TASKS.md).

## Layout

```
supabase/
├── config.toml         Local Supabase configuration.
├── migrations/         Versioned SQL migrations: tables, constraints, indexes,
│                       RLS policies and Postgres functions.
├── functions/          Edge Functions, one folder per function.
├── tests/database/     pgTAP tests, mainly for RLS policies and financial functions.
└── seed.sql            Development seed data. Never real user data.
```

`migrations/` and `functions/` are created by the CLI with their first file.

## What lives here and why

The database is where FlatMate's rules are enforced. The mobile app is an untrusted client, so:

- **Authorization** is done with row-level security on every table that holds apartment data, checking membership and role.
- **Financial operations** (posting an expense, recording or reversing a payment, resolving a dispute, closing a settlement) are transactional Postgres functions, so they either complete fully or not at all.
- **Money arithmetic** (split validation, rounding, allocation sums) is checked on the server, using integer minor units.
- **Scheduled work** (objection-window deadlines, settlement periods, repeatable charges and reminders) runs as pg_cron jobs calling `private` functions. It is idempotent and uses each apartment's timezone.
- **Change events.** The app is event-driven ([decision 0007](../docs/decisions/0007-offline-reading-and-live-sync.md)): every write that changes data another member, or the same user on another device, can see must send a change event. Apartment changes do it by writing an `audit_events` row in the same transaction, which a trigger turns into an event; a table clients write directly needs its own trigger calling `private.emit_change`. `tests/database/change_event_coverage_test.sql` fails when a function writes data without recording it or sending an event, or a table clients write has no event trigger; its allow-list names the few exceptions and why.

The proposed data model is in [section 6 of the SRS](../docs/SRS.md#6-supabase-data-architecture-proposed).

## Rules specific to this folder

- Change the schema only by adding a migration. Never edit one that has been merged or applied to a shared environment.
- A new table is not finished until it has RLS enabled, policies written, and tests for those policies.
- Before a destructive change, know what depends on the data and how it would be recovered, and get approval.
- The service-role key is used only in server-side code and never appears in the repository, the app or the website.
- Receipts and payment proofs go in private storage buckets under `<apartment id>/<record id>/`, are served through signed URLs, and are evidence: storage policies allow no update or delete. A file counts only once a database function has checked and registered it.
- Regenerate the app's database types after every schema change.
- Grant client roles only what they need: revoke the default table privileges from `anon` and `authenticated`, then grant specific operations and columns. Row-level policies decide which rows; grants decide which operations and columns.
- Functions that run with elevated rights (`security definer`), trigger functions and other internal helpers go in the `private` schema, which the Data API does not expose. Set `search_path = ''` on every function and write fully qualified names.
- An RPC endpoint is a `security invoker` wrapper in `public` that calls the `private` function doing the work. Revoke execute from `public` and `anon` on the wrapper and grant it to `authenticated`.
- Postgres lets everyone execute a new function, and a per-schema default cannot take that away. Revoke execute from `public` on every function in `private`, then grant only what a client needs. A database test fails if any `private` function is executable without signing in.
- Database functions raise stable, lower-case error keys such as `not_admin` or `last_admin`. The app maps them to sentences and never shows server messages.
- Check a new migration with `npx supabase@3.1.0 db advisors` before committing it.
- Joining needs an admin's approval, so a test that needs members adds them with a `pg_temp.join(code)` helper that asks with the code and approves as an admin; copy it from an existing test.

## Change events

Open apps stay current through Realtime Broadcast ([decision 0007](../docs/decisions/0007-offline-reading-and-live-sync.md)). `private.emit_change(topic, kind)` sends `{ "kind": ... }` as a private message; a failure only raises a warning and never undoes the write. A statement-level trigger on `audit_events` sends one event per apartment and kind per statement to `apartment:<id>`, and membership changes and join request events also to the person's `user:<id>`, since someone asking to join is not a member yet. The policy on `realtime.messages` lets only an apartment's active members receive its topic and only the user receive their own, through `private.can_receive_topic`; there is no insert policy, so only the database sends. Profiles and receiving accounts, which owners write directly, have their own triggers: a name or photo change goes to the user and to every apartment they are or were in, and an account change goes to the owner and to the apartments it is shared with. Tests: `tests/database/change_events_test.sql` and `personal_change_events_test.sql`.

In every hosted project, turn off **Allow public access** under Realtime settings in the dashboard, so clients can only join private channels. The events are sent as private messages either way; this closes public channels entirely.

## Notifications

A trigger on `audit_events` creates one `notifications` row per person to tell (`private.notification_recipients`), and pg_cron calls the `deliver-push` Edge Function in `functions/` while pushes are due. The function needs the `PUSH_DELIVERY_SECRET` secret, and the database needs the Vault secrets `project_url` and `push_delivery_secret`; until both are set nothing is pushed, and the app's unread dots still work. Setup, local and hosted, and troubleshooting: [docs/NOTIFICATIONS.md](../docs/NOTIFICATIONS.md). Tests: `tests/database/notifications_test.sql`.

Each push Expo accepts keeps its ticket in `push_tickets`; `deliver-push` reads due receipts with `claim_push_receipts` and `report_push_receipts` about 15 minutes later, deletes tokens of uninstalled apps, and keeps other receipt errors for 30 days. Credential errors are logged as `push_credentials_invalid`. Tests: `tests/database/push_receipts_test.sql`.

Reminders are written straight to `notifications`, without an audit event: every 15 minutes the `send-reminders` cron job calls `private.send_due_reminders`, which reminds an unpaid bill's collector (or the admins) before its due date and on the day, and members who owe before the settlement day, from 09:00 in the apartment's timezone. Each reminder has a `reminder_key`, unique per person, so it is sent once however often the job runs. Admins set the lead times with `update_apartment_reminders` (`apartments.due_reminder_days`, `settlement_reminder_days`). People turn push off by group with `set_notification_push` (`notification_mutes`); `claim_pushes` then skips those pushes as `muted` ([decision 0012](../docs/decisions/0012-reminders-and-push-preferences.md)). Tests: `tests/database/reminders_test.sql`, `tests/database/notification_preferences_test.sql`.

## Expense search

`search_expenses` returns an apartment's expenses for a date range, filtered by member (shares in or paid for, in the current version), category, status (`unpaid` for a bill nobody has paid), amount range and a literal text match on the title, Other detail and notes. It runs as the caller, so row-level security applies, and returns `expenses` rows, so the app embeds and pages them as it would the table. Filters on rows embedded two levels deep are not applied to a function's results, so the app picks out the user's own shares itself. `get_monthly_spending` gives current members the apartment's total and their own share per month, in the apartment's timezone. Tests: `tests/database/expense_search_test.sql`.

## Statements

`get_my_statement` and `get_apartment_report` (admins only) return one settlement period as JSON for the app, which makes the PDF. What was carried forward comes from the previous period's closing snapshot in `settlement_balances`, and the closing figures from the period's own snapshot, or from the ledger while it is open (`private.pair_balances_now`). Tests: `tests/database/statements_test.sql`.

## Join codes

Each apartment has one join code at a time ([decision 0011](../docs/decisions/0011-one-join-code-per-apartment.md)). `get_join_code` returns it to an admin, making it the first time, and `change_join_code` replaces it, stopping every older code. It does not expire: joining with it only asks to join, an admin approves every request, and wrong guesses are rate-limited. Admins can read the code; joining matches on its hash. `create_invite` stays for app versions that still call it. Tests: `tests/database/join_code_test.sql`, `invites_test.sql`.

## Repeatable expenses

Admins manage `recurring_templates` through the `*_recurring_template` functions; only admins can read them. Every 15 minutes the `charge-repeatable-expenses` cron job calls `private.charge_due_recurring`, which opens one `recurring_instances` row per template and billing period (the month for monthly repeats, the day for daily and weekly ones) once its bill date has come in the apartment's timezone. A fixed template is charged at once as an unpaid bill with its split. A variable one, or a fixed one whose split names someone who has left, waits for an admin, who is notified (`recurring_bill.amount_needed`, `recurring_bill.needs_review`) and enters it with `post_recurring_bill` or skips it. The unique period per template makes the job safe to run twice. Tests: `tests/database/repeatable_expenses_test.sql`.

## Invite emails

Admins can email a join code from the app ([decision 0010](../docs/decisions/0010-invite-emails.md)). The `send-invite-email` Edge Function calls `private.prepare_invite_email` as the signed-in admin, which checks the address, applies the daily limits and gives the apartment's join code, then sends the email through Resend. The code is the one admins also copy and share, so a failed email leaves it as it is. Only a hash of the address is stored. Tests: `tests/database/invite_emails_test.sql`.

**Local:** add these lines to `supabase/functions/.env` and serve the functions with `npx supabase@3.1.0 functions serve --env-file supabase/functions/.env`. Emails appear in Mailpit at http://127.0.0.1:54324.

```sh
INVITE_EMAIL_FROM=FlatMate <invites@flatmate.local>
MAILPIT_URL=http://supabase_inbucket_FlatMate:8025
```

**Hosted:** create a [Resend](https://resend.com) account, verify the domain you send from, and create an API key with sending access only. Then:

```sh
npx supabase@3.1.0 secrets set RESEND_API_KEY=<the key> "INVITE_EMAIL_FROM=FlatMate <invites@your-domain>"
npx supabase@3.1.0 functions deploy send-invite-email
```

Until both secrets are set the function answers `not_configured`, and the app suggests sharing a code instead. The function's logs, under **Edge Functions** in the dashboard, record `sent` and `send_failed` with the provider's status code, never an address or a code.

## Supabase CLI

The project uses **Supabase CLI 3.1.0**, the same version CI installs. You also need Docker running. The CLI can be used without installing it, through npx:

```sh
npx supabase@3.1.0 <command>
```

Or install it with Homebrew (`brew install supabase/tap/supabase`) and check that `supabase --version` matches. When upgrading, change the version here, in `.github/workflows/ci.yml` and in the `db:types` script in `app/package.json` together.

CLI 3 runs every command against the **local** stack unless you pass `--remote`, and asks for confirmation before changing a hosted project. Never pass `--yes` to a command that targets a hosted project unless you mean it.

## Common commands

Run these from the repository root.

```sh
npx supabase@3.1.0 start                   # start the local stack (first run downloads the images)
npx supabase@3.1.0 status                  # print local URLs and keys
npx supabase@3.1.0 migration new <name>    # create a new, timestamped migration file
npx supabase@3.1.0 db reset                # rebuild the local database from migrations and seed.sql
npx supabase@3.1.0 test db                 # run the pgTAP tests
npx supabase@3.1.0 stop                    # stop the local stack
```

If `supabase start` stops with an unhealthy `supabase_analytics` or `supabase_vector` container, start without them: `npx supabase@3.1.0 start -x logflare,vector`. They only power the log explorer in Studio.

Local emails, such as sign-up codes, are caught by Mailpit at http://127.0.0.1:54324 instead of being sent.

`supabase status` prints the local API URL and the publishable key. Put them in `app/.env` to point the app at the local stack. A phone cannot reach `127.0.0.1` on your computer, so for testing on a device use the hosted development project below.

## Hosted development project

Each developer or self-hoster uses their own Supabase project for development, separate from staging and production. Create one at [supabase.com](https://supabase.com/dashboard), then:

1. **Point the app at it.** Copy the project URL and the publishable key (`sb_publishable_...`) from the project's API settings into `app/.env`.
2. **Link the CLI**, once per machine. Prefer a [scoped personal access token](https://supabase.com/docs/guides/platform/personal-access-tokens) limited to this project over `supabase login`, which creates a token with access to your whole account.

   ```sh
   export SUPABASE_ACCESS_TOKEN=<scoped token>
   npx supabase@3.1.0 link --project-ref <project-ref>
   ```

3. **Push migrations** after they pass locally. Check the list first, then apply. The CLI asks for confirmation before changing a hosted project.

   ```sh
   npx supabase@3.1.0 db push --remote --dry-run
   npx supabase@3.1.0 db push --remote
   ```

Migrations reach a hosted project only through `db push` from the committed files in `migrations/`. Never change a hosted schema in the dashboard's SQL editor or through an MCP server, because the change would exist in no migration and the environments would drift apart. AI agents connected through the Supabase MCP server use it to inspect the project (tables, migrations, advisors, logs), not to change it.

### Auth settings

`config.toml` holds the auth settings for the local stack: email confirmation on, passwords of at least 8 characters, 6-digit email codes, the email templates in `templates/`, and `flatmate://auth/callback` as an allowed redirect. Changing email needs a code from both the old and the new address (secure email change, on by default in hosted projects); the email-change template is sent to each with its own code. A hosted project needs the same settings, or sign-up confirmation emails will contain a link instead of the code the app asks for.

**Connect an email provider first.** Supabase's built-in sender only sends its default link emails, and the API refuses custom templates until custom SMTP is set up. The project uses [Resend](https://resend.com) with a verified sending domain:

1. In Resend, create an API key with **Sending access**, limited to the domain.
2. In the Supabase dashboard, under **Authentication → Emails → SMTP Settings**, enable custom SMTP with host `smtp.resend.com`, port `465`, username `resend`, the API key as the password, a sender such as `no-reply@<your domain>`, sender name `FlatMate`, and a minimum interval of 60 seconds (the app's resend countdown). Enter the key there yourself. It never goes in the repository or through an agent.

**Then push only the auth settings.** Do not run `config push --remote` from this folder: `config.toml` also holds values meant only for the local stack (such as a one-second email interval and `site_url` on 127.0.0.1). Instead, copy `templates/` and `.temp/project-ref` into a temporary folder's `supabase/`, give it a `config.toml` that declares only `project_id`, `[auth] additional_redirect_urls` and `minimum_password_length`, `[auth.email] otp_length`, and the three `[auth.email.template.*]` sections (confirmation, recovery, email change), then from that folder:

```sh
npx supabase@3.1.0 config diff --remote   # check that only the intended properties change
npx supabase@3.1.0 config push --remote
```

Properties the file does not declare, including the SMTP settings, are left as they are. Alternatively, set the same values in the dashboard: OTP length 6, `templates/confirmation.html`, `templates/recovery.html` and `templates/email_change.html` as the "Confirm signup", "Reset password" and "Change email address" templates, and `flatmate://auth/callback` in the redirect URLs.

Google sign-in additionally needs a Google OAuth client. Enable the Google provider in the project with its client ID and secret, then set `EXPO_PUBLIC_AUTH_GOOGLE_ENABLED=true` in `app/.env` to show the button. Locally, put the two values in `supabase/.env` as `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` and set `enabled = true` under `[auth.external.google]`.

New projects can be created with an option that turns row-level security on for every new table. It installs a `public.rls_auto_enable()` function and an event trigger, and the security advisor then warns that `anon` and `authenticated` can execute that function. Calling it directly fails, because it is an event trigger function, so the warning is harmless.

The general engineering rules are in [AGENTS.md](../AGENTS.md).
