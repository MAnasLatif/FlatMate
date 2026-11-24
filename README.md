# FlatMate

An open-source app for sharing flat expenses. Roommates record shared costs, split them fairly, see who owes whom, resolve disagreements, and settle up each month.

> **Status: Phases 0 to 3 done.** The Android app and the Supabase backend cover expenses, disputes, payments, settlement, repeatable bills, reports, deposits, inventory, rooms, offline use and debt simplification. Next is the release work: the website and the store releases. See the [roadmap](#roadmap).

## What it does

- **Multiple apartments.** Join or create several flats, each with its own members, settings and balances. Joining with a code needs an admin's approval.
- **Flexible splits.** Equal, percentage or fixed amounts, with members excluded where needed and more than one payer per expense.
- **Clear balances.** What you owe, what you are owed, and the net with each flatmate, traceable to the expenses behind it.
- **Recurring bills.** Fixed charges such as rent are created automatically. Variable ones such as electricity wait for the real amount.
- **Disputes.** Expenses are accepted by default. Anyone affected can object within a set window.
- **Payment records.** Pay outside the app, then record it. The recipient can object if it never arrived.
- **Monthly settlement.** Each apartment picks its settlement day. Unresolved amounts carry forward, statements export to PDF, and debts can be simplified when everyone agrees.
- **Shared living.** Security deposits, a shared inventory, rooms with splits by room and time lived there, and expenses added offline that send themselves later.

FlatMate does not move money, connect to bank accounts or verify transfers. It keeps the record straight between people who trust each other enough to share a flat.

## Repository layout

| Path | Contents |
|---|---|
| [app/](app/) | The mobile application (Expo, React Native, TypeScript) |
| [supabase/](supabase/) | Backend: migrations, security policies, database functions, Edge Functions |
| [web/](web/) | Public marketing website (Next.js) |
| [docs/](docs/) | Requirements, architecture and user flows |
| [.github/](.github/) | CI workflows, issue and pull request templates |

## Tech stack

- **Mobile:** Expo, React Native, TypeScript, Expo Router, HeroUI Native
- **Backend:** Supabase (Auth, PostgreSQL, Storage, Realtime, Edge Functions, pg_cron)
- **Website:** Next.js

## Getting started

You will need Node.js (current LTS), npm, Docker and the [Supabase CLI](https://supabase.com/docs/guides/cli) for the local backend, and Android Studio or Xcode to run the app on a device or emulator.

To run the mobile app:

```sh
cd app
npm install
cp .env.example .env
npm start
```

More detail is in the [app README](app/README.md). Backend setup, local and hosted, is in the [supabase README](supabase/README.md). To understand the project first, start with the [requirements](docs/SRS.md) and the [architecture overview](docs/ARCHITECTURE.md).

## Documentation

- [Software Requirements Specification](docs/SRS.md): what the product must do
- [Architecture](docs/ARCHITECTURE.md): how the pieces fit together
- [User and UX flows](docs/USER-FLOWS.md): the screens and journeys through the app
- [Testing](docs/TESTING.md): automated tests and the last device test pass
- [AGENTS.md](AGENTS.md): working rules for AI coding agents and a quick orientation for contributors

## Roadmap

| Phase | Scope |
|---|---|
| 0. Foundation | Repository, project setup, auth, migrations, security policies, CI (done) |
| 1. Financial MVP | Apartments, roles, expenses and splits, ledgers, payments, disputes, settlement (done) |
| 2. Automation and reporting | Recurring expenses, reminders, reports and PDF export, budgets, activity (done) |
| 3. Shared-living extras | Deposits, inventory, room-based splits, offline expenses, debt simplification (done) |
| 4. Release | Website, privacy policy, production environment, monitoring, Android and iOS store releases |

Details are in [section 12 of the SRS](docs/SRS.md#12-delivery).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first, and note that participation is covered by the [Code of Conduct](CODE_OF_CONDUCT.md).

To report a security problem, follow [SECURITY.md](SECURITY.md) and do not open a public issue.

## License

[MIT](LICENSE)
