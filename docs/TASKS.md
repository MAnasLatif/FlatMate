# Task list

Everything that remains to take FlatMate from its current state to a released app, in the order it should be done. It is derived from the [SRS](SRS.md): every functional requirement (FR) and acceptance criterion (AC) is covered by a task below.

Last reviewed: 2026-11-12.

## How to use this list

- Work from top to bottom. Each task builds on the ones above it.
- One task is one branch and one pull request. If a task turns out too large, split it and add the new tasks here.
- Tick the box in the same pull request that completes the task.
- A task marked **Owner** needs something only the project owner can provide, such as an account, a device or a decision.
- A task marked **Needs** a decision depends on one that is still [open](#decisions). Settle it first and record it in the SRS.
- Backend tasks are done when the migration, the RLS policies and their database tests are all in. App tasks are done when the screen has its loading, empty and error states and its tests.

## Where the project stands

Done:

- [x] Repository structure, licence, contributor documentation and CI.
- [x] Rules for AI coding agents (`AGENTS.md`) and 21 pinned agent skills.
- [x] Requirements (SRS), architecture overview and first decision record.
- [x] Mobile app foundation: Expo SDK 58, Expo Router, HeroUI Native, Supabase client with encrypted session storage, configuration validation, money formatting, lint, type check and tests.
- [x] App icon, Android adaptive icon, splash screen and brand source images.

- [x] Backend initialized: Supabase CLI 3.1.0 local stack, a pgTAP test that every public table has row-level security, and generated database types in the app.

Not started: the database schema, every app feature, and the website (`web/`).

## Decisions

These come from section 12 of the SRS, where each decision is written out in full. Most were decided on 2026-11-13. The ones still open block the tasks listed next to them.

| No. | Decision | Status | Affects |
|---|---|---|---|
| D1 | Explicit approval mode | Decided: not in the MVP, every expense is accepted automatically | 1.24 |
| D2 | What a dispute holds | Decided: every share of the disputed expense | 1.12, 1.23 |
| D3 | Start of the payment objection window | Decided: when the payment is recorded | 1.27 |
| D4 | Objections after the deadline | Decided: adjustment case; the two members agree, an admin decides if they cannot | 1.23 |
| D5 | Who can be owed | Decided: members only; a third-party bill becomes a debt to the member who pays it | 1.12 |
| D6 | Receiving accounts | Decided: one table for bank and wallet accounts, private by default, shared per apartment, masked until revealed; no encryption beyond the platform's at-rest encryption for the MVP | 1.26 |
| D7 | Currency | Decided: one per apartment, PKR by default, no conversion | 1.6 |
| D8 | Member visibility | Decided: members see all expenses; a payment is visible to its payer, recipient and admins; former members see only their own records | 1.10 |
| D9 | Settlement period | Decided: settlement day to the day before the next; days 29 to 31 fall on the last day of short months; a change applies from the next period | 1.6, 1.32 |
| D10 | Open-source licence | **Open:** MIT or Apache-2.0; the repository currently uses MIT | 4.8 |
| D11 | Product name | Decided in part: identifiers are `com.manaslatif.flatmate`. **Open:** trademark, store-name and domain checks | 4.6, 4.7 |
| D12 | HeroUI Native and the Expo SDK | Decided: HeroUI Native 1.x runs on Expo SDK 58 (decision 0002) | 0.2 |

## Phase 0: Foundation

- [x] **0.1 Repair `main`.** `npm ci` fails on `main` since `tailwind-variants` was bumped to version 4, because HeroUI Native requires version 3. Restore version 3, confirm lint still passes on ESLint 10 (which was bumped at the same time and has never run), and stop Dependabot from proposing the `tailwind-variants` major again. Done when CI on `main` is green.
- [x] **0.2 Run the app on an Android device.** Confirm the home screen renders, light and dark themes follow the device, and the HeroUI Native components the app will rely on work: button, text field, dialog, bottom sheet and toast. Record the result in a decision record. *(Owner: a device or emulator.)*
- [x] **0.3 App identifiers and development build.** Set the Android package name and iOS bundle identifier, create the EAS project and `eas.json`, and produce a development build. Push notifications need this, since they do not work in Expo Go on Android. *(Owner: Expo account.)* The EAS project is `@m.anaslatif/flatmate`, and the first Android development build finished on 2026-11-12.
- [x] **0.4 Initialize the backend.** Run `supabase init`, commit `config.toml`, confirm the local stack starts, add an empty `seed.sql`, and confirm the CI database job now runs.
- [x] **0.5 Database tests and generated types.** Set up pgTAP with a first passing test. Add a script that generates TypeScript types from the schema into `app/src/types/`, and document both.
- [x] **0.6 Hosted development project.** Create a Supabase project for development, link it, and document how migrations reach it. *(Owner: Supabase account.)* The project exists and the app's local `.env` points at it. Linking the CLI needs the owner's access token and moves to task 1.1.
- [x] **0.7 Settle the Phase 1 decisions.** Decide D1 to D9 in one sitting and update section 12 of the SRS, so Phase 1 is not interrupted task by task. *(Owner.)*

## Phase 1: Financial MVP

### Accounts

- [x] **1.1 Profiles.** `profiles` table created automatically at sign-up, with RLS and tests. Link the CLI to the hosted development project and push this first migration to it, as described in `supabase/README.md`. *(FR-01.2. Owner: access token for the link.)* The migration is applied to the hosted development project.
- [x] **1.2 Email sign-up and sign-in.** Sign-up, sign-in, sign-out, session persistence, and a session check at launch that routes signed-out users to the auth screens. *(FR-01.1)* Test it in the development build: Expo Go lacks the native module behind the encrypted session storage (`react-native-get-random-values`).
- [x] **1.3 Account recovery and email verification.** Password reset and email confirmation through deep links back into the app. *(FR-01.1)* Uses 6-digit codes instead of links, because mail apps can use up one-time links by opening them automatically. The hosted project needs the matching auth settings (`supabase/README.md`).
- [ ] **1.4 Google sign-in.** *(FR-01.1. Owner: Google OAuth credentials.)* Done: the app side, behind `EXPO_PUBLIC_AUTH_GOOGLE_ENABLED`. Remaining: a Google OAuth client and enabling the provider in the hosted project (`supabase/README.md`).
- [x] **1.5 Profile screen.** Edit display name and photo, with photos in a private bucket. *(FR-01.2)* Also lets users change their password and sign out.

### Apartments and members

- [x] **1.6 Apartments and membership.** `apartments` and `apartment_members` tables, membership and role helper functions for RLS, and a function that creates an apartment and makes the creator its admin. Tests prove one apartment's data is invisible from another. *(FR-02.1, FR-02.3, AC-01)*
- [x] **1.7 Join codes.** Hashed codes with expiry, rotation and revocation, and a rate-limited join function that fails safely on a bad code. *(FR-02.2)*
- [x] **1.8 My Apartments and New Apartment screens.** List of joined apartments, join by code, and the create form (name, optional location, settlement day, approval window, currency, timezone). *(SRS 3.1)*
- [x] **1.9 Apartment shell.** Top bar with the apartment switcher, members and notification entries, the bottom navigation in the order Profile, Add, Expenses, and an empty dashboard. *(SRS 3.2, AC-13)* The Add tab arrives with task 1.17, and the notification entry with task 1.35.
- [x] **1.10 Members and roles.** Member directory, promote and demote admins, the expense-creation permission, remove a member, leave an apartment, the rule that one admin must remain, and join and leave dates. *(FR-02.4, FR-02.5, FR-02.6, AC-11)*
- [x] **1.11 Apartment settings.** Admin screen for name, location visibility, settlement day, approval window, expense categories and invite codes. *(FR-08.1)*

### Ledger core

- [x] **1.12 Ledger model decision record.** Write down the entities, the ledger entry model, the exact rounding rule for leftover minor units, the status transitions, and how unpaid vendor bills are represented. No code. *(SRS 5.2, 5.3)* See decision record 0003.
- [x] **1.13 Split arithmetic.** Equal, percentage and fixed splits with excluded members, as a TypeScript function for previews and as a database function that is the authority. Both run the same test cases, starting with the worked examples in SRS 5.1. *(FR-03.4, FR-06.6, AC-03)*
- [x] **1.14 Expense and ledger schema.** `expenses`, `expense_payers`, `expense_splits`, `ledger_entries` and `audit_events`, with constraints and RLS. *(SRS 6)*
- [x] **1.15 Posting an expense.** One transactional function that checks permission, validates that payers and splits add up, writes the expense, its ledger entries and an audit event, and marks it accepted by default. Supports several payers and unpaid portions. Tests include a restricted member calling the function directly. *(FR-03.1, FR-03.2, FR-03.3, FR-05.1, AC-02, AC-04)*
- [x] **1.16 Balance queries.** A user's totals for an apartment (payable, receivable, net, monthly share) and pairwise balances with each member. *(FR-06.1, FR-06.2)*

### Expenses in the app

- [x] **1.17 Add expense.** Details, payer editor, split editor and a preview of shares and resulting balances before saving. *(FR-03.1–03.5)* Dates are typed as YYYY-MM-DD with Today and Yesterday shortcuts; a native date picker needs a new development build and can follow.
- [x] **1.18 Receipts.** Upload to a private bucket, storage policies, signed URLs and a viewer. *(FR-03.1, AC-12)* Photos come from the library; taking one with the camera needs a new development build and can follow.
- [x] **1.19 Dashboard.** Summary cards and the monthly expense feed with a month selector, pagination and status indicators. *(FR-06.1, SRS 3.2)*
- [x] **1.20 Expense detail.** Receipt, split, payers, payment state, due date, status, audit trail and the actions the viewer's role allows. *(FR-03.6)*
- [x] **1.21 Editing a posted expense.** Edits create a new version. Corrections to settled records are linked adjustments or reversals. *(FR-03.7)*
- [x] **1.22 Member balances and pairwise ledger.** The members directory shows what the viewer owes and is owed by each member. Tapping a member shows their shared expenses, payments, dues and disputes. *(FR-06.2, FR-06.3)* Done for expenses; disputes (1.25), shared receiving accounts (1.26) and payments (1.30) are added to the pairwise ledger in their own tasks.

### Disputes

- [x] **1.23 Dispute schema and functions.** Decline with a reason, request an adjustment with a proposed share, creator accepts or rejects, and the affected shares are held while uncontested amounts stay payable. Every step is recorded. *(FR-05.2, FR-05.3, FR-05.4, FR-05.7, AC-06)* See [decision 0004](decisions/0004-expense-disputes.md).
- [x] **1.24 Objection window.** A scheduled, idempotent job that finalizes expenses when the window closes, in the apartment's timezone. Late objections open a new adjustment case. *(FR-05.5, FR-05.6, AC-06)*
- [x] **1.25 Dispute screens.** Decline and adjustment forms, dispute detail with its history, the creator's response, the admin's decision, and dispute status on expense screens. Includes evidence files on a dispute, stored privately like receipts. *(FR-05.2, FR-05.3, FR-05.7)* In the pairwise ledger, shared expenses that are disputed show it.

### Payments

- [x] **1.26 Receiving accounts.** Accounts a user can be paid into, private by default and visible to flatmates only when shared, with copy to clipboard. *(FR-01.3, FR-01.4, AC-12)* Also show the recipient's shared accounts on the pay screen (1.30).
- [x] **1.27 Recording a payment.** A function that records a payment with an idempotency key, supports partial amounts, allocates it to specific obligations, and applies a provisional credit. *(FR-07.1, FR-07.3, FR-07.4, FR-07.7, AC-07, AC-09)* Allocation is derived oldest first, as decision 0003 requires; a payment's proof photo comes with the pay flow (1.30).
- [x] **1.28 Payment objections and finalization.** The recipient can decline within the window, which marks the payment disputed and reverses the provisional credit while keeping the evidence. With no objection, a scheduled job finalizes it as confirmed by app policy. *(FR-07.5, FR-07.6, FR-07.8, AC-07, AC-08)* See [decision 0005](decisions/0005-payment-objections.md).
- [x] **1.29 Net-off.** Offset reciprocal dues between two members, showing exactly which obligations are offset and never counting anything twice. *(FR-06.4, AC-09)* The database side; choosing net-off in the app is part of the pay flow (1.30).
- [x] **1.30 Pay flow screens.** Start from an expense or a member's ledger, choose gross or net and the amount, see the recipient's shared accounts, mark as paid with an optional reference and proof, and view the payment with its status. *(FR-07.1, FR-07.2, FR-07.3, FR-07.8)*

### Settlement

- [ ] **1.31 Settlement calculation and preview.** A function that computes balances from expenses, payments, offsets and adjustments, excludes disputed amounts, and returns a preview with the source obligations. *(FR-08.2, FR-08.3, AC-10)* Includes adjustment entries, so a late objection to a final payment can be corrected without voiding it (decision 0005).
- [ ] **1.32 Settlement cycle job.** Opens a cycle on each apartment's settlement day in its timezone, handles short months, closes only reconciled items and carries the rest forward. *(FR-08.4, FR-08.5, FR-08.6, FR-09.4, AC-10)* Once a period is closed, editing or voiding an expense dated in it, or moving an expense into it, must be refused or recorded as an adjustment in the open period (FR-03.7).
- [ ] **1.33 Settlement screens.** Overview, preview, payment allocation, history and carried-forward balances. *(FR-08.3, FR-08.4)*
- [ ] **1.34 Member exit.** When a member leaves or is removed, show their final balance and an exit settlement, and keep their history auditable. *(FR-02.4, AC-11)*

### Notifications and sign-off

- [ ] **1.35 Notification foundation.** `notifications` table, in-app inbox, push token registration, and push delivery for expenses, payments, disputes and membership changes. Opening a notification goes to the record and rechecks permission. *(FR-09.1, FR-09.3)*
- [ ] **1.36 MVP acceptance pass.** Walk through AC-01 to AC-13 on an Android device, review every RLS policy, and check loading, empty, error and offline states on every screen. Fix what fails.

## Phase 2: Automation and reporting

- [ ] **2.1 Recurring templates.** Template and split-rule tables that only admins can manage. *(FR-04.1, FR-04.4, AC-02)*
- [ ] **2.2 Fixed recurring charges.** A scheduled job that creates exactly one expense per template and billing period. *(FR-04.2, FR-04.6, AC-05)*
- [ ] **2.3 Variable recurring bills.** On the expected day, prompt admins for the real amount, optional proof and due date. No charge exists until an admin enters it. *(FR-04.3, AC-05)*
- [ ] **2.4 Recurring screens.** Manage templates, override the split for one month, and apply template changes to future months only. *(FR-04.4, FR-04.5)*
- [ ] **2.5 Reminders and notification preferences.** Due-date and settlement reminders on a configurable schedule, per-user preferences, and no duplicate reminders. *(FR-09.2, FR-09.4, FR-01.2)*
- [ ] **2.6 Search, filters and comparison.** Filter expenses by month, member, category, amount and status, and compare spending between months. *(FR-10.1)*
- [ ] **2.7 PDF statements.** Monthly per-user statements and apartment reports with gross, net, outstanding, disputed and carried-forward amounts. *(FR-10.2, AC-14)*
- [ ] **2.8 Quick-add and budgets.** Templates for common expenses, and budget caps with alerts. *(FR-10.3)*
- [ ] **2.9 Activity history.** A timeline of who created, edited, disputed and settled each record. *(FR-10.8)*

## Phase 3: Shared-living extras

- [ ] **3.1 Security deposits.** Track deposits, refunds and exit adjustments. *(FR-10.4)*
- [ ] **3.2 Shared inventory.** Items, ownership and maintenance costs. *(FR-10.5)*
- [ ] **3.3 Rooms and occupancy.** Room-based allocations and splits driven by who lived where and when. *(FR-10.6)*
- [ ] **3.4 Offline drafts.** Save expense drafts offline, review them on reconnect, and submit without duplicates. *(FR-10.7)*
- [ ] **3.5 Debt simplification.** Suggest fewer transfers across the group. The user applies a suggestion explicitly, and the underlying ledger is preserved. *(FR-06.5)*

## Phase 4: Release

- [ ] **4.1 Marketing website.** Initialize the Next.js project in `web/` and build the landing page with store links.
- [ ] **4.2 Privacy policy and terms.** Publish both on the website. The stores require a privacy policy link. *(Owner: the content must be approved by the owner.)*
- [ ] **4.3 Production environment.** Production Supabase project, secrets, backups with a tested restore, and written deployment and rollback steps for migrations.
- [ ] **4.4 Error reporting and monitoring.** Crashes and failures in scheduled jobs, financial functions and notification delivery are visible to maintainers.
- [ ] **4.5 Quality pass.** Screen reader labels, font scaling and contrast, plus performance of the dashboard and add-expense flows on a mid-range Android phone.
- [ ] **4.6 Android release.** Device testing, store listing, data safety form and submission to Google Play. *(Needs the open part of D11. Owner: Google Play developer account.)*
- [ ] **4.7 iOS release.** Device testing, TestFlight and submission to the App Store. *(Needs the open part of D11. Owner: Apple developer account.)*
- [ ] **4.8 Open-source launch.** Confirm the licence, add the Code of Conduct contact, enable private vulnerability reporting, write the self-hosting guide, and tag the first release. *(Needs D10. Owner.)*

## Deferred

- **Optional approval mode** (FR-03.8). Not part of the MVP (decision D1). Reconsider after release.
