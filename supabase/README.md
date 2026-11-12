# FlatMate backend

Everything that runs on Supabase: the database schema, security policies, database functions, Edge Functions, scheduled jobs, seed data and database tests.

> **Status: first schema in place.** The only table is `profiles`, created for each user at sign-up. The rest of the schema arrives with the tasks in [docs/TASKS.md](../docs/TASKS.md).

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
- **Scheduled work** (recurring charges, objection-window deadlines, reminders) is idempotent and uses each apartment's timezone.

The proposed data model is in [section 6 of the SRS](../docs/SRS.md#6-supabase-data-architecture-proposed).

## Rules specific to this folder

- Change the schema only by adding a migration. Never edit one that has been merged or applied to a shared environment.
- A new table is not finished until it has RLS enabled, policies written, and tests for those policies.
- Before a destructive change, know what depends on the data and how it would be recovered, and get approval.
- The service-role key is used only in server-side code and never appears in the repository, the app or the website.
- Receipts and payment proofs go in private storage buckets and are served through signed URLs.
- Regenerate the app's database types after every schema change.
- Grant client roles only what they need: revoke the default table privileges from `anon` and `authenticated`, then grant specific operations and columns. Row-level policies decide which rows; grants decide which operations and columns.
- Functions that run with elevated rights (`security definer`), trigger functions and other internal helpers go in the `private` schema. It is not exposed through the Data API and grants nothing to client roles. Set `search_path = ''` on every function and write fully qualified names.
- Check a new migration with `npx supabase@3.1.0 db advisors` before committing it.

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

New projects can be created with an option that turns row-level security on for every new table. It installs a `public.rls_auto_enable()` function and an event trigger, and the security advisor then warns that `anon` and `authenticated` can execute that function. Calling it directly fails, because it is an event trigger function, so the warning is harmless.

The general engineering rules are in [AGENTS.md](../AGENTS.md).
