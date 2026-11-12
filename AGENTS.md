# AGENTS.md

This file is the entry point for any AI coding agent working on FlatMate, and a good orientation for human contributors too. **Read all of it before you change anything**, then read the documents it points to for the area you are working in.

If instructions conflict, what the user explicitly asks for wins over this file, and this file wins over your general habits. The exception is the security, privacy and data-safety rules: those hold unless the user knowingly overrides them.

## What FlatMate is

FlatMate is an open-source mobile app for people who share a flat. Roommates record shared costs, split them fairly, see who owes whom, raise disputes, and settle up each month. One user can belong to several apartments, each fully separate from the others.

A few product facts shape almost every technical decision:

- **FlatMate never moves money.** Users pay each other outside the app and then record it. A recorded payment is a claim, not proof of a bank transfer, and the UI and data model must never suggest otherwise.
- **The apartment is the isolation boundary.** Data, settings, roles and balances belong to one apartment and must never leak into another.
- **Financial history is never rewritten.** Every balance must be explainable from the records behind it. Corrections are new linked entries, not edits to old ones.
- **Expenses are accepted by default.** Nobody has to click "accept". An affected member can object within a window (7 days by default), which opens a dispute.
- **Android ships first, iOS from the same codebase.** UI copy is English for now, written so it can be localized later.

The full requirements live in [docs/SRS.md](docs/SRS.md). Its section 12 lists product decisions that are still open. If your task depends on one of them, stop and ask instead of quietly choosing.

The remaining work is listed in order in [docs/TASKS.md](docs/TASKS.md). When the user asks you to continue or to do the next task, take the first unticked one. Tick a task in the same change that completes it, and add a task there when you find work the list is missing.

## Repository map

| Path | What it is |
|---|---|
| [app/](app/) | The mobile application: Expo, React Native, TypeScript. This is the product. |
| [supabase/](supabase/) | The backend: database migrations, RLS policies, Postgres functions, Edge Functions, seed data, database tests. |
| [web/](web/) | The public marketing website (Next.js). It presents the app and sends people to the stores. It has no accounts and handles no user data. |
| [docs/](docs/) | All project documentation: requirements, architecture, decision records. |
| [.github/](.github/) | CI workflows, issue and pull request templates. |

`app/` and `web/` are independent projects, each with its own `package.json` and lockfile. There is no shared workspace, and none should be added until two projects need to share real code.

The repository started as a scaffold. A folder without a `package.json` (or, for the backend, without `supabase/config.toml`) has not been initialized yet, and the layouts described in each folder's README are targets, not existing files. Check what exists before you rely on it.

## Stack

- **Mobile:** Expo, React Native, TypeScript in strict mode, Expo Router with typed routes, HeroUI Native for components, Expo Notifications for push.
- **Backend:** Supabase: Auth, PostgreSQL with row-level security, Storage, Edge Functions, scheduled jobs.
- **Website:** Next.js with TypeScript.
- **Package manager:** npm, with the lockfile committed.

Versions are whatever is installed, not whatever you remember. Before using a framework or library API, check the installed version in `package.json` and read the official documentation for that version. The app is on Expo SDK 58 with HeroUI Native 1.x. That pair installs cleanly and bundles for Android, but it has not been run on a device yet (SRS section 12, item 12), so confirm a component exists and works before building on it.

## Roles

Every task is done in one of these roles. Pick the one that matches the work. A typical feature passes through several of them in this order, and your final report should say which you worked in.

**Planner.** For anything large, cross-cutting or ambiguous. Read the relevant SRS sections, find the open decisions, and produce a short plan broken into steps that can each be tested on their own. Writes no code until the plan is agreed.

**Backend engineer** (`supabase/`). Owns the schema, RLS policies, Postgres functions, Edge Functions and scheduled jobs. Treats the database as the place where rules are enforced: authorization, money arithmetic and state transitions are decided here, never trusted from a client.

**Mobile engineer** (`app/`). Owns screens, navigation, components and client-side state. Builds on what the backend exposes, keeps business rules out of the UI layer, and tests on Android first.

**Web engineer** (`web/`). Owns the marketing site. Cares about load speed, SEO, accessibility and correct store links. Never adds accounts, user data or a connection to the production database.

**Reviewer.** Reads a diff with fresh eyes before it is called done: correctness, security, the money rules below, missing tests, and changes that fall outside the task. Runs the checks instead of trusting that they pass.

**Docs maintainer** (`docs/`). Keeps the documentation true. Updates it in the same change that alters behavior, and records significant decisions.

## Skills

Skills are packaged instructions for one technology or kind of task, written by the teams that maintain that technology. They are more current than what you remember about a framework, so load the matching skill before you start work in its area, and load every skill that applies when a task spans several.

### Which skill to use

**Mobile app (`app/`)**

| Skill | Load it when |
|---|---|
| `expo-overview` | Starting any Expo or EAS task. Load it first: it routes you to the other Expo skills. |
| `expo-router` | Adding or changing routes, layouts, tabs, modals, headers or navigation. |
| `expo-data-fetching` | Writing or debugging any network request, caching, offline handling, or a screen's loading, empty and error states. |
| `expo-dev-client` | Building or distributing a development build, which is needed once a library does not run in Expo Go. |
| `expo-upgrade` | Upgrading the Expo SDK or fixing dependency version conflicts. |
| `eas-app-stores` | Configuring `eas.json`, signing, versions and build numbers, or submitting to Google Play or the App Store. |
| `heroui-native` | Building any UI with HeroUI Native: components, theming, light and dark mode, or looking up a component's API. |
| `vercel-react-native-skills` | Writing or reviewing React Native components, lists, animations or anything performance-sensitive. |
| `react-native-testing` | Writing, reviewing or fixing component tests with React Native Testing Library. |

**Backend (`supabase/`)**

| Skill | Load it when |
|---|---|
| `supabase` | Doing anything with Supabase: Auth, Storage, Edge Functions, cron, the client library, the CLI, or local development. |
| `supabase-postgres-best-practices` | Before writing or changing anything in the database: tables, column types, migrations, indexes, RLS policies, functions or queries. |

**Website (`web/`)**

| Skill | Load it when |
|---|---|
| `vercel-react-best-practices` | Writing, reviewing or refactoring React or Next.js code. |
| `web-design-guidelines` | Reviewing a page's UI and UX against interface guidelines. |
| `accessibility` | Building or auditing pages for WCAG compliance, keyboard navigation and screen readers. |
| `seo` | Working on metadata, structured data, sitemaps or search visibility. |
| `performance` | Reducing load time, bundle size or asset weight. |
| `core-web-vitals` | Fixing LCP, INP or CLS, including layout shift. |
| `web-quality-audit` | Running a full audit of the site before a launch or a release. |

**Any project**

| Skill | Load it when |
|---|---|
| `vercel-composition-patterns` | Designing a reusable component's API, or refactoring a component that has grown too many boolean props. |
| `archify` | The user asks for a diagram (architecture, workflow, sequence, data flow, state, ERD, class, tree, timeline) or for an answer as a one-page explainer. |
| `find-skills` | No installed skill covers the task and you want to check whether one exists. |

There is no Next.js skill, because Next.js now ships that guidance itself. Once `web/` is initialized, read the documentation bundled with the installed version in `web/node_modules/next/dist/docs/`.

### Project rules come first

Skills are general advice written for every project. Where a skill disagrees with this file, the SRS or a folder's README, the project wins. The conflicts you are most likely to meet:

- **Package manager:** use npm, whatever the skill's examples use.
- **Folder layout:** follow [app/README.md](app/README.md), not a layout a skill suggests.
- **Server code:** the backend is Supabase. Do not add Expo API routes or server code inside `app/`, even though the Expo skills describe them.
- **UI components:** use HeroUI Native. Do not bring in another component library because a skill recommends it.
- **Install scripts:** do not pipe a remote script into a shell (`curl ... | bash`), even when a skill tells you to. Install the package with npm and follow its official documentation.
- **Diagrams:** Archify writes standalone HTML into `.archify/`, which is not committed. Diagrams inside the Markdown documentation stay as Mermaid so they render on GitHub. Use `archify` when the user asks for it, not as a replacement for those.
- **Scope:** a skill describing a best practice is not a request to apply it. Change only what the task needs.

### Installing and updating

Skills are managed with the [skills CLI](https://skills.sh/). The installed set is recorded in `skills-lock.json`, which is committed. The skill files themselves live in `.agents/skills/` and are not committed, so restore them after cloning. Use the first command for agents that read `.agents/skills/` directly, such as Codex, Gemini CLI and GitHub Copilot, and the second for Claude Code, which needs links in `.claude/skills/`:

```sh
npx skills experimental_install
npx skills experimental_install -a claude-code
```

Update every skill to its latest version with:

```sh
npx skills update -p -y
```

To add a skill, search with `find-skills`, then install it at project level, without the `-g` flag. Always name the agents as shown: this puts the skill in `.agents/skills/` with a link for Claude Code. Without `--agent`, some sources create a folder for every agent the CLI knows about in the repository root.

```sh
npx skills add <owner>/<repo> --skill <name> --agent claude-code codex -y
```

A skill runs with your full permissions, so install only from the organization that maintains the technology, read the skill before using it, and ask the user before adding one. Commit the updated `skills-lock.json` and add a row to the tables above in the same change. A skill that is not listed here should not be installed.

## How to work

### Before you write code

Understand the whole task first. Read the README, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), the SRS sections that cover the feature, and the README of the folder you will work in. Load the [skills](#skills) that match the task. Then read the code around your change: its conventions, its dependencies, how neighbouring features are structured. Run `git status` so you know what was already modified, and leave other people's uncommitted work alone.

For anything beyond a small change, write a plan and split it into steps you can verify one at a time. State the assumptions you are making. If a requirement is unclear or an SRS decision is still open, ask.

### While you work

Build the simplest thing that fully meets the requirement. Follow the patterns already in the project instead of introducing a second way to do the same job. Do not add features, abstractions, configuration or dependencies that the task did not ask for, and do not touch code or files unrelated to it. Prefer a small targeted change over a rewrite, and do not remove existing behavior unless that is the task.

Never invent things. Imports, file paths, project APIs, database columns and library functions must exist: open the file or the documentation and check. Finished features contain no placeholder implementations and no mock data standing in for real data.

Check your work as you go. After each significant step, run the relevant checks before moving on, so a failure points at the change that caused it.

### When you finish

Run formatting, linting, type checks and the relevant tests, and fix anything your change broke. If something was already failing before you started, say so and keep it separate from your own results.

Then report plainly: what changed, what you verified and how, and what is unresolved or assumed. Never say a test, build, migration, deployment or integration succeeded unless you ran it and saw it succeed. "I could not run this" is a useful answer. A guess presented as a result is not.

Ask before any destructive or far-reaching action: deleting files or data, destructive schema changes, anything touching a production service, publishing, or spending money.

## Money and ledger rules

These come from the SRS and are the rules most expensive to get wrong. They apply to every change that touches amounts, balances, payments, disputes or settlements.

- **Amounts are integers in minor units** (paisa for PKR), stored and computed as integers. Never use floating point for money, in the database or in TypeScript.
- **Splits always add up exactly.** Equal, percentage and fixed splits must sum to the expense total, with leftover minor units distributed by a deterministic, documented rule. Payer contributions must sum to the paid amount. The server validates this. The client may preview it but is never the authority.
- **Balances are derived, not stored as a mutable number.** They come from ledger entries created by expenses, payer contributions, payments, offsets and adjustments. No `balance` column that gets overwritten.
- **Posted financial records are immutable.** Editing a posted expense creates a new version. Correcting something settled creates a linked adjustment or reversal. Closed periods stay exactly as they were.
- **Financial writes are atomic.** Posting, reversing, settling and resolving disputes happen inside transactional Postgres functions, so partial state can never be observed.
- **Anything that can be retried is idempotent.** Payment submissions carry idempotency keys. Recurring charges are unique per template and billing period. Scheduled jobs and notifications can run twice without doing their work twice.
- **Variable recurring bills never get an invented amount.** The system prompts an admin and waits for the real figure.
- **Statuses mean what they say.** Keep `recorded`, `provisional`, `disputed` and `final` distinct in data and in the UI. A payment nobody objected to becomes `confirmed_by_app_policy`, which is not bank verification, and no admin action can certify a transfer.
- **Disputes hold only what they affect.** Uncontested obligations stay payable. Unresolved balances carry forward at settlement and are never zeroed just because the date passed.
- **Time is the apartment's time.** Settlement days, objection windows and reminders use the apartment's timezone, and short months are handled explicitly.
- **Netting and debt simplification are explicit.** Show exactly which obligations are offset, never reassign a creditor silently, and never count an expense or payment twice.

Write the tests for this logic before or alongside the code. The SRS acceptance criteria (section 10) and worked examples (section 5.1) are the starting test cases.

## Engineering standards

### Code

Write code a new contributor can read and trust: clear names, small functions that do one thing, types everywhere the language supports them, and no `any` used to silence the compiler. Keep business logic in one place and share it. Extract a component or utility when there is real reuse, not in anticipation of it. SOLID, DRY, KISS and YAGNI are useful when they make the code simpler and should be ignored when they make it more elaborate.

Comment the decisions a reader could not guess, not what the code already says. Remove unused imports, dead code and debugging output before you finish. Never swallow an error: handle it, or let it surface with enough context to diagnose.

### Architecture

Keep four concerns apart: UI, business logic, data access, and infrastructure. A screen composes components and calls hooks. It does not build queries or compute splits. Organize by feature (auth, apartments, expenses, payments, disputes, settlements, and so on) so that one feature's code lives together and its dependencies on other modules are explicit and one-directional. No circular imports.

Choose the plainest pattern that fits the app's size. Do not add global state libraries, extra services, queues or new infrastructure until a concrete problem requires them, and record the reason in a decision record when you do.

### UI and UX

Follow the project's design system: HeroUI Native components and theme tokens for colour, spacing and typography, not one-off values. The app follows the device's light or dark setting. Respect platform conventions on Android and iOS, and make layouts hold up across screen sizes and larger font settings.

Every screen that loads or submits data needs all of its states: loading, empty, error, success, and offline where it matters. Avoid layout jumps as content arrives. Make the main action on each screen obvious, validate input with messages that say how to fix the problem, and confirm before destructive actions. Financial screens always show whether a figure is provisional, disputed or final.

Accessibility is part of the work: screen-reader labels, sufficient contrast, adequate touch targets, and on the website semantic HTML and keyboard navigation.

### Security and privacy

No secret ever goes in the repository: no API keys, tokens, passwords or service-role keys, in code, tests, docs or commit history. Secrets come from environment variables or managed secret storage, and each project keeps an `.env.example` with names only. Anything shipped in the mobile app or prefixed `EXPO_PUBLIC_` or `NEXT_PUBLIC_` is public. The Supabase service-role key never leaves server-side code.

Authorization is enforced on the server. Every apartment-scoped table has RLS policies that check membership and role, and hiding a button is not access control. Grant the least privilege that works. Validate all untrusted input at the boundary where it arrives, including Edge Function payloads, RPC arguments, uploaded files and responses from external services. Guard against the usual attacks for each surface: injection, XSS and CSRF on the web, unsafe uploads, and brute-forcing of join codes, which need rate limiting.

Treat personal and financial data carefully. Receiving-account details are private by default and visible only when the owner shares them. Receipts and payment proofs live in private buckets behind signed URLs. Never ask for banking passwords, PINs or OTPs. Collect only the data a feature needs, and keep account identifiers and other personal details out of logs, analytics, error messages and push notification text.

When a change touches authentication, permissions, RLS, payments or sensitive data, review its security impact deliberately and say what you checked.

### Data and APIs

Schema changes happen only through versioned migration files in `supabase/migrations/`. Never edit a migration that has been applied anywhere shared: add a new one. Before a destructive change (dropping or rewriting columns, tables or data), understand what depends on it and how it would be recovered, and get approval.

Keep contracts consistent and predictable across RPC functions and Edge Functions: validated inputs, structured errors, meaningful status codes. Expose a deliberate shape to clients instead of leaking internal table structure. Paginate anything that can grow, such as expense feeds, ledgers and notifications. Use transactions where several writes must succeed together, and think about concurrent writers before assuming a sequence is safe. Calls to external services need timeouts, sensible retries and a defined behavior when the service is down.

Index for the queries the app really makes, and optimize a query once it is shown to be slow.

### Performance

Get it correct first, then measure before optimizing anything significant. Avoid the common waste: unnecessary re-renders, duplicate network requests, queries inside loops. Cache only with a clear invalidation rule. Lazy-load heavy screens and assets, size images for the devices that display them, and clean up subscriptions, timers and listeners so nothing leaks or runs unbounded. Core flows such as opening the dashboard and adding an expense must stay responsive on a mid-range Android phone.

### Errors and logging

Handle expected failures gracefully and give the user a clear message plus a way to recover, such as retrying or going back with their input preserved. Error messages must not expose internals. Log in a structured way, with identifiers that let a critical operation be traced end to end, and never log credentials or personal data. Failures in scheduled jobs, financial functions and notification delivery should be visible to maintainers, not silent.

### Testing

Add or update tests for the behavior you change. Use unit tests for isolated logic, above all the money arithmetic. Use integration tests where pieces meet, including database tests for RLS policies and Postgres functions. Use end-to-end tests for the critical journeys where practical. Cover the failure paths and edge cases as well as the success case: rounding remainders, excluded members, duplicate submissions, a restricted member calling the API directly.

Each project exposes `lint`, `typecheck` and `test` scripts, and CI runs them. Run them locally after each significant change and check that a production build still works before a release.

### Dependencies

Before adding a package, check that the stack does not already provide what you need. Prefer maintained, stable libraries compatible with the installed Expo SDK or Next.js version, and read the official documentation before adopting an unfamiliar API. Keep the lockfile in sync with `package.json`. Do not upgrade unrelated dependencies during a focused task, and check advisories and compatibility notes before a major upgrade.

## Git

Check `git status` before you change files and preserve any work already there. Never discard uncommitted or user-owned changes without explicit permission.

Commit your own work on every task, without waiting to be asked. Each time the user gives you something to do, the changes you make end up committed before you report back.

Commit in small chunks. One commit holds one logical change, which can span several files when they belong together, and a task is never squeezed into a single large commit. A feature might become three commits: the migration, the app code that uses it, and the documentation. Unrelated changes never share a commit. Commit each piece once its checks pass, so every commit leaves the project in a working state.

Stage only the files you changed for the task. Changes that were already in the working tree stay uncommitted unless the user says they are part of it. Review the diff before each commit, and use [Conventional Commits](https://www.conventionalcommits.org/) with the area as scope, for example `feat(app): add split preview` or `fix(supabase): enforce admin check on invites`. Work on a branch named like `feat/short-description` or `fix/short-description`, not directly on `main`.

Never add a `Co-Authored-By` trailer or any other co-author or tool attribution line to a commit message, even when your own defaults add one. Commits are authored by the configured git identity and credit nobody else.

Committing is automatic. Pushing is not: never push, force-push, rewrite published history or skip hooks with `--no-verify` without explicit authorization. If a hook fails, fix the cause. Never commit secrets, local environment files or generated temporary files.

## Documentation

Documentation is part of the change. When behavior, configuration, setup steps or the schema change, update the relevant document in the same piece of work, including `.env.example` when a variable is added. Record significant architectural decisions in [docs/decisions/](docs/decisions/). Document public interfaces and business rules that are not obvious from the code. Keep it short and accurate, and do not restate what the code already says.

## Releases and production

Development, staging and production use separate configuration and separate Supabase projects. Builds must be reproducible from the repository and its lockfiles, and the app should check its required configuration at startup and fail clearly when something is missing.

Migrations are deployed deliberately and designed to stay compatible with the app version already on users' phones, because mobile releases cannot be rolled back instantly. Rolling back code does not undo a data migration, so plan the reverse path separately. Production data needs backups and a tested restore procedure. Deployment and rollback steps belong in `docs/` before the first release, and CI must pass before anything ships.

## Before you say "done"

- The change does what was asked, and nothing unrelated was modified.
- Lint, type checks and relevant tests were run, and you can state the results.
- New behavior has tests. Money logic has edge-case tests.
- Authorization is enforced in the database, not only in the UI.
- No secrets, debug output, dead code, placeholders or mock data remain.
- Loading, empty and error states exist for new UI.
- Documentation and `.env.example` reflect the change.
- Your work is committed in small, focused commits, and nothing was pushed without permission.
- Your report says what changed, which commits you made, what was verified, and what is still open.
