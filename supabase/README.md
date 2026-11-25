# FlatMate backend

Everything that runs on Supabase: the database schema, security policies, database functions, Edge Functions, scheduled jobs, seed data and database tests.

> **Status: schema complete through Phase 3**, with pgTAP tests for every area. What the backend must do is in the [SRS](../docs/SRS.md).

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
- **Change events.** The app is event-driven ([SRS section 7](../docs/SRS.md#7-offline-use-and-live-updates)): every write that changes data another member, or the same user on another device, can see must send a change event. Apartment changes do it by writing an `audit_events` row in the same transaction, which a trigger turns into an event; a table clients write directly needs its own trigger calling `private.emit_change`. `tests/database/change_event_coverage_test.sql` fails when a function writes data without recording it or sending an event, or a table clients write has no event trigger; its allow-list names the few exceptions and why.

The data model is in [section 9 of the SRS](../docs/SRS.md#9-data-model), and the ledger in [section 5](../docs/SRS.md#5-money-and-the-ledger).

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

Open apps stay current through Realtime Broadcast ([SRS section 7](../docs/SRS.md#7-offline-use-and-live-updates)). `private.emit_change(topic, kind)` sends `{ "kind": ... }` as a private message; a failure only raises a warning and never undoes the write. A statement-level trigger on `audit_events` sends one event per apartment and kind per statement to `apartment:<id>`, and membership changes and join request events also to the person's `user:<id>`, since someone asking to join is not a member yet. The policy on `realtime.messages` lets only an apartment's active members receive its topic and only the user receive their own, through `private.can_receive_topic`; there is no insert policy, so only the database sends. Profiles and receiving accounts, which owners write directly, have their own triggers: a name or photo change goes to the user and to every apartment they are or were in, and an account change goes to the owner and to the apartments it is shared with. Tests: `tests/database/change_events_test.sql` and `personal_change_events_test.sql`.

In every hosted project, turn off **Allow public access** under Realtime settings in the dashboard, so clients can only join private channels. The events are sent as private messages either way; this closes public channels entirely.

## Notifications

A trigger on `audit_events` creates one `notifications` row per person to tell (`private.notification_recipients`), and pg_cron calls the `deliver-push` Edge Function in `functions/` while pushes are due. The function needs the `PUSH_DELIVERY_SECRET` secret, and the database needs the Vault secrets `project_url` and `push_delivery_secret`; until both are set nothing is pushed, and the app's unread dots still work. Setup, local and hosted, and troubleshooting: [Push notifications setup](#push-notifications-setup) below. Tests: `tests/database/notifications_test.sql`.

Each push Expo accepts keeps its ticket in `push_tickets`; `deliver-push` reads due receipts with `claim_push_receipts` and `report_push_receipts` about 15 minutes later, deletes tokens of uninstalled apps, and keeps other receipt errors for 30 days. Credential errors are logged as `push_credentials_invalid`. Tests: `tests/database/push_receipts_test.sql`.

Reminders are written straight to `notifications`, without an audit event: every 15 minutes the `send-reminders` cron job calls `private.send_due_reminders`, which reminds an unpaid bill's collector (or the admins) before its due date and on the day, and members who owe before the settlement day, from 09:00 in the apartment's timezone. Each reminder has a `reminder_key`, unique per person, so it is sent once however often the job runs. Admins set the lead times with `update_apartment_reminders` (`apartments.due_reminder_days`, `settlement_reminder_days`). People turn push off by group with `set_notification_push` (`notification_mutes`); `claim_pushes` then skips those pushes as `muted`. Tests: `tests/database/reminders_test.sql`, `tests/database/notification_preferences_test.sql`.

## Expense search

`search_expenses` returns an apartment's expenses for a date range, filtered by member (shares in or paid for, in the current version), category, status (`unpaid` for a bill nobody has paid), amount range and a literal text match on the title, Other detail and notes. It runs as the caller, so row-level security applies, and returns `expenses` rows, so the app embeds and pages them as it would the table. Filters on rows embedded two levels deep are not applied to a function's results, so the app picks out the user's own shares itself. `get_monthly_spending` gives current members the apartment's total and their own share per month, in the apartment's timezone. Tests: `tests/database/expense_search_test.sql`.

## Statements

`get_my_statement` and `get_apartment_report` (admins only) return one settlement period as JSON for the app, which makes the PDF. What was carried forward comes from the previous period's closing snapshot in `settlement_balances`, and the closing figures from the period's own snapshot, or from the ledger while it is open (`private.pair_balances_now`). Tests: `tests/database/statements_test.sql`.

## Quick-adds and budgets

`expense_templates` holds an apartment's quick-adds, which `save_expense_template` (replacing one of the same name) and `delete_expense_template` change for anyone who may add expenses. `budgets` holds admin-set monthly caps, for all spending (`category_id` null) or one category; `set_budget`, `remove_budget` and `get_budgets` (with the month's spending, for current members) are the interface. The `send-budget-alerts` job raises the level in `budget_alerts` and notifies members at 80% and 100%. Tests: `tests/database/quick_add_and_budgets_test.sql`.

## Activity history

`get_activity` pages an apartment's `audit_events` newest first for current members, filtered by group (`private.activity_group`) and by actor, with each entry's record name, amount and people where the caller can read them. The audit trail's read policy makes each entry as private as its record: payments, offsets and adjustments follow those tables' policies, and invites, join requests, invitations back and repeatable expenses are for admins. A new audit entity type that is private must be added to that policy. Tests: `tests/database/activity_history_test.sql`.

## Security deposits

`record_deposit`, `take_over_deposit_share`, `refund_deposit_share`, `return_deposit` and `undo_deposit_action` are admin-only and retry-safe. Each locks the deposit, writes a `deposit_actions` row and signed `deposit_entries` (a person's share is the sum of theirs), and posts any debts as adjustments linked by `deposit_action_id`, without their own audit events: the deposit's event tells the people affected. Deductions on a return are split with `private.split_by_weights`, the rounding rule of `compute_shares`. Tests: `tests/database/deposits_test.sql`.

## Shared inventory

`inventory_items` holds an apartment's things, each the flat's (`owner_type` apartment) or one member's, with a condition and a status; `inventory_costs` links an expense to at most one item as its purchase or maintenance. Neither table stores an amount: `get_inventory` adds up the linked expenses' current amounts, leaving out cancelled ones. `save_inventory_item` (retry-safe when adding), `link_inventory_cost` and `unlink_inventory_cost` are for anyone who may add expenses; `remove_inventory_item` is for admins. Each writes an `inventory_item` audit event. Tests: `tests/database/inventory_test.sql`.

## Rooms and occupancy

`rooms` (with a weight) and `room_occupancies` (who lived in a room from which day to which day) are managed by admins through `save_room`, `archive_room`, `add_room_occupant`, `end_room_occupancy` and `remove_room_occupancy`, serialized per apartment by `private.lock_rooms`. `get_room_split` splits an amount for a period by room weight and days lived, equally within a room, with the largest-remainder rule of `compute_shares`, and lists former members' days as left out. Nothing here stores an amount: the app posts the result as a split by amount. A repeatable expense with `split_method = 'room'` and a `room_period` (advance or arrears) is split the same way (`private.room_split`) for the days each charge covers (`private.recurring_room_period`), by `charge_next_period` for a fixed amount, which waits for review when days would be left out, and by `post_recurring_bill` when an admin enters it with `p_split_method = 'room'`. Tests: `tests/database/rooms_test.sql`, `recurring_room_split_test.sql`.

## Debt simplification

`get_debt_transfer_suggestions` lists steps the caller is part of where one member can pay another directly instead of through a third, from `pair_payable` amounts. `propose_debt_transfer` (retry-safe) and `answer_debt_transfer` manage `debt_transfers` and `debt_transfer_answers`; once all three accept, `private.apply_debt_transfer` rechecks the debts under the pairs' locks and writes two `transfer` ledger entries and an adjustment linked by `debt_transfer_id`, or lets the step lapse. Steps are readable by their three people and admins. Tests: `tests/database/debt_simplification_test.sql`.

## Join codes

Each apartment has one join code at a time (SRS FR-02.2). `get_join_code` returns it to an admin, making it the first time, and `change_join_code` replaces it, stopping every older code. It does not expire: joining with it only asks to join, an admin approves every request, and wrong guesses are rate-limited. Admins can read the code; joining matches on its hash. `create_invite` stays for app versions that still call it. Tests: `tests/database/join_code_test.sql`, `invites_test.sql`.

## Repeatable expenses

Admins manage `recurring_templates` through the `*_recurring_template` functions; only admins can read them. Every 15 minutes the `charge-repeatable-expenses` cron job calls `private.charge_due_recurring`, which opens one `recurring_instances` row per template and billing period (the month for monthly repeats, the day for daily and weekly ones) once its bill date has come in the apartment's timezone. A fixed template is charged at once as an unpaid bill with its split. A variable one, or a fixed one whose split names someone who has left, waits for an admin, who is notified (`recurring_bill.amount_needed`, `recurring_bill.needs_review`) and enters it with `post_recurring_bill` or skips it. The unique period per template makes the job safe to run twice. Tests: `tests/database/repeatable_expenses_test.sql`.

## Invite emails

Admins can email a join code from the app (SRS FR-02.4). The `send-invite-email` Edge Function calls `private.prepare_invite_email` as the signed-in admin, which checks the address, applies the daily limits and gives the apartment's join code, then sends the email through Resend. The code is the one admins also copy and share, so a failed email leaves it as it is. Only a hash of the address is stored. Tests: `tests/database/invite_emails_test.sql`.

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

## Push notifications setup

How push reaches phones is in [SRS section 6](../docs/SRS.md#6-notifications). This is how to set it up for your own build: Firebase for Android, Expo's push service, and the Supabase side.

Expo's push service delivers to Android through Firebase Cloud Messaging (FCM), which is why Android needs a Firebase project. FlatMate uses nothing else from Firebase.

### What you need

- The Expo account that owns the EAS project (`@m.anaslatif/flatmate`), or your own if you forked the project.
- A Google account for the Firebase console.
- Access to the hosted Supabase project you are setting up, and the Supabase CLI linked to it (see [Hosted development project](#hosted-development-project)).
- An Android phone, or an emulator with Google Play services. Push does not work in Expo Go on Android.

Do the setup once per environment: development, then staging and production when they exist. Use a separate Firebase project for production if you want to keep its credentials apart.

### Part 1: Firebase, for Android

#### 1. Create the Firebase project

1. Open the [Firebase console](https://console.firebase.google.com) and choose **Create a project**.
2. Name it, for example `FlatMate Development`.
3. Google Analytics is not needed. You can turn it off on the next screen.

#### 2. Add the Android app

1. In the project, choose **Add app** and then the Android icon.
2. **Android package name:** `dev.manaslatif.flatmate`. It must match `android.package` in `app/app.config.ts` exactly, or Firebase will not deliver to the app. A fork with its own package name uses that instead.
3. The nickname is optional. Leave the SHA-1 field empty; push does not need it.
4. Choose **Register app**, then **Download google-services.json**.
5. Skip the remaining steps of the wizard (the Gradle instructions): Expo applies them during the build.

Save the file as `app/google-services.json`. It is ignored by git: it holds only public identifiers, but it ties a build to one Firebase project, so each fork or environment supplies its own.

#### 3. Create the service account key

Expo needs this key to send through FCM on your behalf. **It is a secret.** Anyone holding it can send notifications as your app.

1. In the Firebase console, open the gear icon, then **Project settings** and **Service accounts**.
2. Choose **Generate new private key**, then **Generate key**. A JSON file downloads.
3. Keep it outside the repository, for example in your password manager. Never commit it or paste it anywhere public. (`app/.gitignore` ignores files named like `*firebase-adminsdk*.json` as a safety net.)

#### 4. Give the key to EAS

From the `app/` folder:

```sh
npx eas-cli@latest credentials
```

Then choose:

1. **Android**, then the build profile (do it for `development`, and later for `preview` and `production`).
2. **Google Service Account**.
3. **Manage your Google Service Account Key for Push Notifications (FCM V1)**.
4. **Set up a Google Service Account Key for Push Notifications (FCM V1)**, then **Upload a new service account key**, and select the JSON file from step 3.

The same can be done in the [Expo dashboard](https://expo.dev): **Project settings**, then **Credentials**, the Android application identifier, then **FCM V1 service account key**, then **Add a service account key**.

Once uploaded, you can delete the local copy of the key. EAS keeps it.

#### 5. Give the build the google-services.json

The app config reads the file's path from the `GOOGLE_SERVICES_JSON` variable. Without it the app still builds, but Android push does not work.

**Cloud builds (EAS).** Upload the file as a secret file variable for each environment you build:

```sh
npx eas-cli@latest env:set --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret --environment development
```

**Local tooling.** Add this line to `app/.env`:

```sh
GOOGLE_SERVICES_JSON=./google-services.json
```

#### 6. Rebuild the development build

Notifications add native code, so the installed development build must be replaced:

```sh
npx eas-cli@latest build -p android --profile development
```

Install the new APK on the phone, as in [app/README.md](../app/README.md).

### Part 2: Supabase

These steps change the hosted project, so read each command before running it.

#### 1. Apply the migrations

```sh
npx supabase@3.1.0 db push --remote --dry-run
npx supabase@3.1.0 db push --remote
```

This adds the notifications tables, the change events and the delivery job.

#### 2. Create the delivery secret

The database uses this secret to start a delivery run. It cannot do anything else, which is why it is a separate secret and not the project's secret key. Generate one and keep it for the next two steps:

```sh
openssl rand -hex 32
```

#### 3. Give the secret to the Edge Function, and deploy it

From the repository root:

```sh
npx supabase@3.1.0 secrets set PUSH_DELIVERY_SECRET=<the secret>
npx supabase@3.1.0 functions deploy deliver-push
```

`supabase/config.toml` turns off JWT checking for this function, because pg_cron calls it with the delivery secret instead of a user's token. The function reads the project's secret key from its own environment, which Supabase provides.

If you turn on [enhanced push security](https://expo.dev/settings/access-tokens) for the Expo project, also set `EXPO_ACCESS_TOKEN` the same way.

#### 4. Tell the database where the function is

In the Supabase dashboard, open the **SQL Editor** and run, with your project reference and the secret from step 2:

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<the secret>', 'push_delivery_secret');
```

These are stored encrypted in Vault. They are configuration, not schema, so they are not in a migration. Until both exist, the delivery job does nothing.

#### 5. Close public Realtime channels

Under **Realtime** settings, turn off **Allow public access**.

### Part 3: Try it

1. Open the new build on the phone and sign in. Allow notifications when Android asks.
2. On a second device, sign in as a flatmate in the same apartment and add an expense that includes the first person.
3. Within about 10 seconds the first phone shows "An expense that includes you was added." Before tapping it, the expense's row on the dashboard has a red dot. Tapping the push opens the expense and the dot goes.

### Troubleshooting

Check what happened to a notification in the SQL Editor:

```sql
select type, push_status, push_attempts, push_error, created_at
from public.notifications order by created_at desc limit 20;
```

| Status | Meaning |
|---|---|
| `pending` | Waiting for the next delivery run. Still pending after a minute: check the Vault secrets, `PUSH_DELIVERY_SECRET`, and that the function is deployed. |
| `sent` | Expo accepted it for at least one of the person's devices. |
| `failed` | Expo refused it. `push_error` holds the code, and it is retried up to five times. |
| `skipped` | `no_device`: the person has no registered device or did not allow notifications. `muted`: the person turned this group off in their profile. `expired`: it waited over a day. `DeviceNotRegistered`: the app was uninstalled, so the token was deleted. |

Common causes:

- **Nothing pending is ever sent.** See whether the job runs and what the function answers: `select status, return_message from cron.job_run_details order by start_time desc limit 5;` and `select status_code, content from net._http_response order by created desc limit 5;`. A 401 means the two copies of the delivery secret differ. The function's logs are under **Edge Functions** in the dashboard.
- **`InvalidCredentials`.** The FCM key in EAS is missing or wrong. Upload it again (Part 1, step 4).
- **`MismatchSenderId`.** The FCM key in EAS and `google-services.json` come from different Firebase projects. Use the key and file of the same project (Part 1, steps 3 to 5) and rebuild.
- **Problems Expo reported after accepting a push.** Receipt errors from the last 30 days: `select error, count(*), max(checked_at) from public.push_tickets where status = 'error' group by error;`. In the Edge Function logs, search for `push_credentials_invalid`. `NoReceipt` in numbers means Expo's service had trouble.
- **`403 PERMISSION_DENIED`.** The API key in `google-services.json` is restricted in Google Cloud. Allow the Firebase Cloud Messaging and Firebase Installations APIs for it, or remove the restriction.
- **`no_device` for someone with the app.** They refused the notification permission, or are using Expo Go. They can allow it again in Android's app settings and reopen the app.
- **No reminder arrives.** Reminders go out from 09:00 in the apartment's timezone, only if the apartment has them on (`select due_reminder_days, settlement_reminder_days from public.apartments`) and only for bills still unpaid with a due date in the window. See what the job created with `select type, user_id, reminder_key, created_at from public.notifications where reminder_key is not null order by created_at desc limit 20;`.
- **Notifications arrive but show nothing.** The app creates its Android channel when it registers. Reopen the app once after installing.

### iOS

The iOS build uses the same backend and Expo service. It needs an Apple Push Notifications key instead of Firebase, set up with `npx eas-cli@latest credentials` for iOS, which requires a paid Apple Developer account.

### Local development

The local stack runs the same job and function:

1. `cp supabase/functions/.env.example supabase/functions/.env` and set `PUSH_DELIVERY_SECRET` to a random value. Restart the stack (`supabase stop`, then `supabase start`) so the function reads it.
2. In the local database, store the function's address as the database container sees it, and the same secret:

   ```sql
   select vault.create_secret('http://supabase_kong_FlatMate:8000', 'project_url');
   select vault.create_secret('<the same secret>', 'push_delivery_secret');
   ```

   `supabase db reset` clears them, so run this again after a reset.
3. A phone cannot reach a local stack, so real pushes need the hosted project. Locally you can watch notifications being created, claimed and reported.
