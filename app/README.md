# FlatMate mobile app

The FlatMate application for Android and iOS, built with Expo, React Native and TypeScript. This is the product itself. Everything a user does in FlatMate happens here.

> **Status: not initialized.** The Expo project has not been created yet. The layout below is the agreed target, not a description of existing files.

## Stack

- Expo and React Native, TypeScript in strict mode
- Expo Router with typed routes
- HeroUI Native for components and theming (compatibility with the chosen Expo SDK still to be verified)
- Supabase client for auth, data and storage
- Expo Notifications for push

## Target layout

```
app/
├── src/
│   ├── app/            Expo Router routes. Screens compose features and hold no business logic.
│   ├── features/       One folder per domain: auth, apartments, expenses, payments,
│   │   └── <feature>/  disputes, settlements, notifications. Each holds its own
│   │                   components, hooks, data access and pure logic.
│   ├── components/     Shared UI that belongs to no single feature.
│   ├── lib/            Supabase client, money and date helpers, configuration checks.
│   └── types/          Types generated from the database schema. Never edited by hand.
├── assets/             Icons, splash screen, fonts, images.
├── app.config.ts       Expo configuration.
└── .env.example        Names of the required environment variables.
```

Folders are created when the first code that belongs in them is written, not in advance.

## Rules specific to this folder

- A screen calls hooks and renders components. Queries, split calculations and permission decisions live in a feature's logic or data-access code, or on the server.
- The app can preview a split or a balance, but the server decides. Never treat a client-side calculation as authoritative.
- Money is an integer number of minor units from the database to the screen, and is formatted for display only at the last step.
- Only `EXPO_PUBLIC_` variables reach the app, and everything in the app bundle is public. No secrets here.
- Test on Android first, then iOS.

## Environment

Copy `.env.example` to `.env` and fill in the values from your Supabase project (local or hosted).

## Scripts

Once initialized, this project provides the scripts CI depends on:

```sh
npm run lint
npm run typecheck
npm test
```

The general engineering rules are in [AGENTS.md](../AGENTS.md).
