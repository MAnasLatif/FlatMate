# FlatMate mobile app

The FlatMate application for Android and iOS, built with Expo, React Native and TypeScript. This is the product itself. Everything a user does in FlatMate happens here.

> **Status: Phase 1 in progress.** Accounts, apartments, expenses, disputes, payments, settlement and member exit work. Offline reading, live sync and notifications are next, in the order in [docs/TASKS.md](../docs/TASKS.md).

## Run it

You need Node.js (current LTS) and an Android phone or emulator (or an iOS device or simulator).

```sh
cd app
npm install
cp .env.example .env    # then fill in the two values
```

There are two ways to open the app:

- **Development build (the normal way).** A FlatMate build installed on the device that loads your code from the dev server. Build it once, as described below, then run `npm start` and open the app on the device. It runs every native module the app uses, including push notifications.
- **Expo Go (quick checks only).** Run `npm run start:go` and scan the QR code with the Expo Go app. Expo Go does not contain every native module the app uses, so some features will fail in it, for example push notifications on Android and the encrypted session storage behind sign-in.

The home screen runs without a `.env` file. The Supabase client reads the configuration the first time it is imported and stops with a clear error if a value is missing.

### Development build

Builds are made with [EAS](https://docs.expo.dev/build/introduction/), configured in `eas.json`. The EAS project is `@m.anaslatif/flatmate`, set as `owner` and `extra.eas.projectId` in `app.config.ts`. Cloud builds count against that account's build allowance, so building needs access to it. If you fork the project, remove those two fields and run `npx eas-cli@latest init` to create your own.

```sh
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile development
```

When the build finishes, open the link EAS prints on the phone and install the APK. Rebuild only when native code changes: a new package with native code, a config plugin, or a change to `app.config.ts`. Android signing keys are generated and stored by EAS.

| Profile       | For                                               | Output            |
| ------------- | ------------------------------------------------- | ----------------- |
| `development` | Day-to-day work, loads code from the dev server   | Installable APK   |
| `preview`     | Testing a standalone build without the dev server | Installable APK   |
| `production`  | Store releases                                    | Play Store bundle |

Cloud builds do not receive your local `.env`. Before a `preview` or `production` build, store the two `EXPO_PUBLIC_` values as EAS environment variables for that environment (`npx eas-cli@latest env:create`).

## Scripts

| Command                                   | What it does                                   |
| ----------------------------------------- | ---------------------------------------------- |
| `npm start`                               | Start the dev server for the development build |
| `npm run start:go`                        | Start the dev server for Expo Go               |
| `npm run android` / `npm run ios`         | Start and open on a device or emulator         |
| `npm run lint`                            | ESLint with Expo's rules                       |
| `npm run typecheck`                       | TypeScript, strict mode                        |
| `npm test`                                | Jest unit tests                                |
| `npm run format` / `npm run format:check` | Prettier                                       |
| `npm run db:types`                        | Regenerate `src/types/database.ts`             |

CI runs `lint`, `typecheck` and `test` on every pull request.

`db:types` reads the schema from the local Supabase stack, so start it first (see [supabase/README.md](../supabase/README.md)). Run it after every migration and commit the result with the migration.

## Layout

```
app/
├── src/
│   ├── app/                    Expo Router routes only: every file here becomes a route.
│   │   ├── _layout.tsx         Providers, and the switch between signed-in and signed-out routes.
│   │   ├── (auth)/             Sign-in, sign-up, email code, password reset.
│   │   ├── (app)/              Everything behind sign-in.
│   │   └── auth/callback.tsx   Where Google sign-in returns.
│   ├── features/<feature>/     One folder per domain (auth, apartments, expenses, payments,
│   │                           disputes, settlements, notifications): its API calls, logic,
│   │                           components and tests.
│   ├── components/             UI shared by more than one feature (screen container, form fields).
│   ├── lib/                    Infrastructure: configuration, Supabase client, query client, money formatting.
│   ├── test/                   Test helpers, such as rendering inside the app's providers.
│   ├── types/database.ts       Generated from the database schema by `npm run db:types`. Never edited by hand.
│   ├── global.css              Tailwind, Uniwind and HeroUI Native styles.
│   └── uniwind-types.d.ts      Generated by Metro. Committed so type checks pass in CI.
├── assets/images/              App icon, Android adaptive icon, logo mark.
├── app.config.ts               Expo configuration.
├── jest.setup.ts               Mocks that let HeroUI Native and Reanimated run under Jest.
└── .env.example                Names of the environment variables.
```

Tests sit next to the code they test, as `name.test.ts`. Tests for a route go in the feature's `__tests__` folder, because any file inside `src/app` would be bundled as a route.

## How data flows

A screen calls a feature's hooks; hooks wrap TanStack Query around the feature's `api.ts`; `api.ts` calls Supabase through the client in `src/lib/supabase.ts`. Reads are table selects or read-only functions, and writes are always database functions (`supabase.rpc`). After a write, a hook invalidates the affected cache keys: everything about an apartment's money is under `['money', apartmentId]` (`useRefreshMoney`), and apartment data under `['apartments', apartmentId]`. The full picture is in [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md#data-in-the-app).

Planned in [decision 0007](../docs/decisions/0007-offline-reading-and-live-sync.md), tasks 1.35 to 1.40: network and app-state awareness for React Query, an encrypted saved cache so loaded data stays readable offline, and live updates through Supabase Realtime.

## Rules specific to this folder

- A screen calls hooks and renders components. Queries, split calculations and permission decisions live in a feature's logic or data-access code, or on the server.
- The app can preview a split or a balance, but the server decides. Never treat a client-side calculation as authoritative.
- Money is an integer number of minor units from the database to the screen. Format it with `formatMinorUnits` at the last step, and never divide it into a decimal.
- Render screens in tests with `renderWithProviders` from `src/test/render.tsx`. Theme colours do not exist under Jest, so tests check behaviour and text, not colours.
- Build UI with HeroUI Native components and theme classes such as `bg-background`, `text-foreground`, `text-muted` and `text-accent`, not hard-coded colours. The theme follows the device's light or dark setting.
- Add packages with `npx expo install <package>`, which picks the version that matches the Expo SDK and uses npm underneath.
- In this Expo SDK, `Stack` is imported from `expo-router/stack` and `Link` from `expo-router/link`, not from `expo-router`.
- Only `EXPO_PUBLIC_` variables reach the app, and everything in the app bundle is public. No secrets here.
- Test on Android first, then iOS.

## Dependencies

| Package                                                                                                                                                                                               | Why it is here                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `expo`, `react-native`, `react`                                                                                                                                                                       | The platform (Expo SDK 58)                                                |
| `expo-router`                                                                                                                                                                                         | File-based navigation with typed routes                                   |
| `heroui-native`                                                                                                                                                                                       | Component library and theme                                               |
| `uniwind`, `tailwindcss`, `tailwind-merge`, `tailwind-variants`                                                                                                                                       | Styling engine HeroUI Native is built on                                  |
| `react-native-reanimated`, `react-native-worklets`, `react-native-gesture-handler`, `react-native-safe-area-context`, `react-native-screens`, `react-native-svg`, `@gorhom/bottom-sheet`, `expo-blur` | Required by HeroUI Native and navigation                                  |
| `@supabase/supabase-js`                                                                                                                                                                               | Auth, database, storage and functions client. Pinned to an exact version. |
| `expo-secure-store`, `@react-native-async-storage/async-storage`, `aes-js`, `react-native-get-random-values`                                                                                          | Encrypted storage for the signed-in session                               |
| `@tanstack/react-query`                                                                                                                                                                               | Fetching, caching and loading and error states for server data            |
| `zod`                                                                                                                                                                                                 | Validation of configuration and of input at the app's boundaries          |
| `react-hook-form`, `@hookform/resolvers`                                                                                                                                                              | Forms with validation                                                     |
| `expo-notifications`, `expo-device`                                                                                                                                                                   | Push notifications                                                        |
| `expo-image`, `expo-image-picker`                                                                                                                                                                     | Displaying images, and picking receipts and payment proofs                |
| `expo-clipboard`                                                                                                                                                                                      | Copying a flatmate's shared account details                               |
| `expo-linking`, `expo-web-browser`                                                                                                                                                                    | Deep links and the Google sign-in flow                                    |
| `expo-splash-screen`, `expo-status-bar`, `expo-system-ui`, `expo-constants`, `expo-font`                                                                                                              | App shell                                                                 |
| `expo-dev-client`                                                                                                                                                                                     | The development build                                                     |

`expo-notifications` is installed for task 1.41 and is not used by any screen yet.

Development tools: TypeScript, ESLint with `eslint-config-expo`, Prettier, Jest with `jest-expo`, and React Native Testing Library.

## Identifiers

The Android package name and the iOS bundle identifier are both `com.manaslatif.flatmate`. They cannot be changed once the app is published.

The general engineering rules are in [AGENTS.md](../AGENTS.md).
