# Contributing to FlatMate

Thanks for your interest in FlatMate. This guide explains how to propose changes and what a pull request needs before it can be merged.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug** using the bug report issue template.
- **Suggest a feature** using the feature request template. Check the [requirements](docs/SRS.md) first, since it may already be planned.
- **Improve the documentation.** Fixes to unclear or outdated docs are always welcome.
- **Write code.** For anything larger than a small fix, open an issue first so the approach can be agreed before you spend time on it.

Security problems are the exception: report them privately as described in [SECURITY.md](SECURITY.md).

## Before you start

Read these so your change fits the project:

1. [README.md](README.md) for the overview and layout.
2. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the parts connect.
3. [AGENTS.md](AGENTS.md) for the engineering standards. It is written for AI coding agents, and the same standards apply to everyone.
4. The README in the folder you will work in: [app/](app/README.md), [supabase/](supabase/README.md) or [web/](web/README.md).

## Workflow

1. Fork the repository and create a branch from `main`, named `feat/short-description`, `fix/short-description` or `docs/short-description`.
2. Make your change in small, focused commits.
3. Run the checks for the project you touched (see below).
4. Open a pull request against `main` and fill in the template.

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) with the area as the scope:

```
feat(app): add split preview to the expense form
fix(supabase): enforce admin check when rotating invite codes
docs: explain settlement carry-forward
```

Common types are `feat`, `fix`, `docs`, `refactor`, `test`, `chore` and `ci`. Scopes are `app`, `supabase`, `web`, `docs` and `repo`.

### Checks

Each project provides the same three scripts, and CI runs them on every pull request:

```sh
npm run lint
npm run typecheck
npm test
```

Run them from inside `app/` or `web/`. Database changes are tested with `supabase test db` from the repository root.

## What a good pull request looks like

- It does one thing, and the description says what and why.
- It includes tests for the behavior it changes. Changes to amounts, splits, balances, payments or settlements need edge-case tests.
- It updates documentation and `.env.example` when behavior or configuration changes.
- It contains no secrets, credentials or personal data.
- It has no unrelated formatting changes or dependency upgrades.

### Database changes

- Change the schema only by adding a new migration file in `supabase/migrations/`. Never edit a migration that has already been merged.
- Every table holding apartment data needs row-level security policies, and those policies need tests.
- Explain in the pull request how a destructive change would be recovered from.

### Money

Amounts are integers in minor units and are never stored or computed as floating point. Financial records are corrected with new linked entries, not edited in place. The full set of rules is in [AGENTS.md](AGENTS.md#money-and-ledger-rules).

## Review

A maintainer will review your pull request. Expect questions and requested changes, since that is how the project stays consistent. Once it is approved and CI passes, a maintainer will merge it.

## License

By contributing, you agree that your contributions are licensed under the project's [MIT License](LICENSE).
