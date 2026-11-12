# FlatMate

An open-source app for sharing flat expenses. Roommates record shared costs, split them fairly, see who owes whom, resolve disagreements, and settle up each month.

> **Status: early development.** The mobile app has its foundation in place and runs, showing a single home screen. No feature is built yet, and the backend and website are not initialized. See the [roadmap](#roadmap).

## What it will do

- **Multiple apartments.** Join or create several flats, each with its own members, settings and balances.
- **Flexible splits.** Equal, percentage or fixed amounts, with members excluded where needed and more than one payer per expense.
- **Clear balances.** What you owe, what you are owed, and the net with each flatmate, traceable to the expenses behind it.
- **Recurring bills.** Fixed charges such as rent are created automatically. Variable ones such as electricity wait for the real amount.
- **Disputes.** Expenses are accepted by default. Anyone affected can object within a set window.
- **Payment records.** Pay outside the app, then record it. The recipient can object if it never arrived.
- **Monthly settlement.** Each apartment picks its settlement day. Unresolved amounts carry forward.

FlatMate does not move money, connect to bank accounts or verify transfers. It keeps the record straight between people who trust each other enough to share a flat.

## Repository layout

| Path | Contents |
|---|---|
| [app/](app/) | The mobile application (Expo, React Native, TypeScript) |
| [supabase/](supabase/) | Backend: migrations, security policies, database functions, Edge Functions |
| [web/](web/) | Public marketing website (Next.js) |
| [docs/](docs/) | Requirements, architecture and decision records |
| [.github/](.github/) | CI workflows, issue and pull request templates |

## Tech stack

- **Mobile:** Expo, React Native, TypeScript, Expo Router, HeroUI Native
- **Backend:** Supabase (Auth, PostgreSQL, Storage, Edge Functions)
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

More detail is in the [app README](app/README.md). Setup commands for the backend and the website will be added here as each is initialized. To understand the project first, start with the [requirements](docs/SRS.md) and the [architecture overview](docs/ARCHITECTURE.md).

## Documentation

- [Software Requirements Specification](docs/SRS.md): what the product must do
- [Task list](docs/TASKS.md): what remains to be built, in order
- [Architecture](docs/ARCHITECTURE.md): how the pieces fit together
- [Decision records](docs/decisions/): why things are the way they are
- [AGENTS.md](AGENTS.md): working rules for AI coding agents and a quick orientation for contributors

## Roadmap

| Phase | Scope |
|---|---|
| 0. Foundation | Repository, project setup, auth, migrations, security policies, CI |
| 1. Financial MVP | Apartments, roles, expenses and splits, ledgers, payments, disputes, settlement |
| 2. Automation and reporting | Recurring expenses, reminders, reports and PDF export, budgets |
| 3. Shared-living extras | Deposits, inventory, room-based splits, offline drafts |
| 4. Release | Android and iOS store releases |

Details are in [section 11 of the SRS](docs/SRS.md#11-recommended-delivery-phases).

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first, and note that participation is covered by the [Code of Conduct](CODE_OF_CONDUCT.md).

To report a security problem, follow [SECURITY.md](SECURITY.md) and do not open a public issue.

## License

[MIT](LICENSE)
