# FlatMate backend

Everything that runs on Supabase: the database schema, security policies, database functions, Edge Functions, scheduled jobs, seed data and database tests.

> **Status: not initialized.** `supabase init` has not been run yet. The layout below is the agreed target, not a description of existing files.

## Target layout

```
supabase/
├── config.toml         Local Supabase configuration, created by `supabase init`.
├── migrations/         Versioned SQL migrations: tables, constraints, indexes,
│                       RLS policies and Postgres functions.
├── functions/          Edge Functions, one folder per function.
├── tests/              Database tests (pgTAP), mainly for RLS policies and
│                       financial functions.
└── seed.sql            Development seed data. Never real user data.
```

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

## Common commands

Run these from the repository root once the project is initialized. They need Docker and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```sh
supabase start                    # start the local stack
supabase migration new <name>     # create a new migration file
supabase db reset                 # rebuild the local database from migrations and seed
supabase test db                  # run the database tests
supabase gen types typescript --local   # print TypeScript types for the schema
```

The general engineering rules are in [AGENTS.md](../AGENTS.md).
