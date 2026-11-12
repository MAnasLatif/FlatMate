# Security Policy

FlatMate stores financial records and payment account details that people share with their flatmates. Security reports are taken seriously and handled privately.

## Reporting a vulnerability

**Do not open a public issue, pull request or discussion for a security problem.**

Report it through GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**. Include:

- what the problem is and what an attacker could do with it,
- the steps to reproduce it, or a proof of concept,
- the affected component (`app`, `supabase` or `web`) and the version or commit.

You can expect an acknowledgement within 5 working days and an update once the report has been assessed. Please give the maintainers reasonable time to release a fix before disclosing the issue publicly. Reporters are credited in the release notes unless they prefer otherwise.

## Supported versions

FlatMate has not had a stable release yet. Security fixes are applied to the `main` branch only.

## What matters most

Reports in these areas are especially valuable:

- Reading or changing data that belongs to an apartment you are not a member of.
- Bypassing row-level security or role checks, for example a member performing an admin action through the API.
- Access to another user's private receiving-account details, receipts or payment proofs.
- Altering or deleting financial history that should be immutable.
- Account takeover, session handling flaws, or abuse of apartment join codes.
- Secrets or service credentials exposed in the repository, the app bundle or the website.

## Out of scope

- Problems that require physical access to an unlocked device.
- Vulnerabilities in third-party services (Supabase, Expo, the app stores) that are not caused by how FlatMate uses them. Report those to the vendor.
- Self-hosted deployments that have been modified or misconfigured.

## For self-hosters

If you run your own FlatMate backend, you are responsible for its configuration. Keep the Supabase service-role key out of every client, keep row-level security enabled on all tables, and keep storage buckets private.
