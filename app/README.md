# FlatMate mobile app

The FlatMate application for Android and iOS, built with Expo, React Native and TypeScript. This is the product itself. Everything a user does in FlatMate happens here.

> **Status: Phase 1 in progress.** Accounts, apartments (joining with an admin's approval), expenses, disputes, payments, settlement, member exit, offline reading, live sync and notifications work. What is left is in [docs/TASKS.md](../docs/TASKS.md).

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

A `.env.local` file, if you keep one (for example pointing at the local stack), wins over `.env`. The dev server bundles the values from these files directly, so variables set in the shell do not override them. To run against the hosted project, move `.env.local` aside and restart the dev server with `--clear`.

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
│   │   ├── (app)/              Everything behind sign-in:
│   │   │   ├── (home)/         Where the app opens. In an apartment, it goes straight to the one last
│   │   │   │                   opened on this device; in none, it shows joining and creating, with a
│   │   │   │                   bottom bar of Apartments and Profile.
│   │   │   ├── apartments/     The list of the user's apartments (index), new, join, and one
│   │   │   │                   apartment ([apartmentId]) with its Expenses | Add | Profile tabs.
│   │   │   ├── accounts/       The user's bank and wallet accounts: details ([accountId]) and edit.
│   │   │   └── profile, change-email, change-password
│   │   └── auth/callback.tsx   Where sign-in and email links return.
│   ├── features/<feature>/     One folder per domain (auth, profile, accounts, apartments, expenses,
│   │                           payments, disputes, settlement, notifications, sync): its API calls,
│   │                           logic, components and tests.
│   ├── components/             UI shared by more than one feature: the screen container, form fields
│   │                           (text, password, date picker), the app logo, the tab header back arrow.
│   ├── lib/                    Infrastructure: configuration, Supabase client, query client, money formatting.
│   ├── test/                   Test helpers, such as rendering inside the app's providers.
│   ├── types/database.ts       Generated from the database schema by `npm run db:types`. Never edited by hand.
│   ├── global.css              Tailwind, Uniwind and HeroUI Native styles.
│   └── uniwind-types.d.ts      Generated by Metro. Committed so type checks pass in CI.
├── assets/images/              App icon, Android adaptive icon, logo mark.
├── app.config.ts               Expo configuration.
├── jest.setup.ts               Mocks that let native modules run under Jest: Reanimated, the bottom
│                               sheet, the swipeable row, AsyncStorage, notifications, network status.
└── .env.example                Names of the environment variables.
```

Tests sit next to the code they test, as `name.test.ts`. Tests for a route go in the feature's `__tests__` folder, because any file inside `src/app` would be bundled as a route.

## How data flows

A screen calls a feature's hooks; hooks wrap TanStack Query around the feature's `api.ts`; `api.ts` calls Supabase through the client in `src/lib/supabase.ts`. Reads are table selects or read-only functions, and writes are always database functions (`supabase.rpc`). After a write, a hook invalidates the affected cache keys: everything about an apartment's money is under `['money', apartmentId]` (`useRefreshMoney`), and apartment data under `['apartments', apartmentId]`. The full picture is in [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md#data-in-the-app).

React Query follows the device: `src/lib/network.ts` tells it when the device goes offline or online and when the app returns to the foreground, so loads pause offline and stale data refetches on return. Reads retry only failures that could change; writes never wait in a queue and fail at once offline. `Screen` shows a `FreshnessBanner` offline, with when the data was last updated, and online when a refresh failed over saved data.

Loaded data is saved on the device (`src/lib/saved-cache.ts`), so it stays readable offline and appears at once on the next launch. It is encrypted with `EncryptedStorage` (`src/lib/encrypted-storage.ts`), the same scheme as the session, kept per user for up to 7 days, and deleted at sign-out. Signed image links and failed loads are never saved. The splash screen stays up until it is restored. A query whose data must never be saved goes in `UNSAVED_QUERY_ROOTS` there.

The app is event-driven ([decision 0007](../docs/decisions/0007-offline-reading-and-live-sync.md)). `src/lib/realtime-topic.ts` joins a private Realtime topic; `src/features/sync/` holds the router: `changes.ts` maps each kind of change event to the cache keys it makes stale, and `hooks.ts` listens on the user's topic while signed in (`(app)/_layout.tsx`) and on the open apartment's topic while it is open (`apartments/[apartmentId]/_layout.tsx`). On (re)joining a topic it refreshes what may have missed an event; when a membership ends it stops listening and drops that apartment's unshown money data.

Notifications live in `src/features/notifications/`: the red dots for unread notifications (`unread.ts` says which place each belongs to and which screen clears it, [decision 0008](../docs/decisions/0008-unread-dots-instead-of-an-inbox.md)), registering the device for push after sign-in, and opening the record a tapped push is about. Sign-out removes the device first. Android push needs a Firebase file at build time, through `GOOGLE_SERVICES_JSON`; the setup is in [docs/NOTIFICATIONS.md](../docs/NOTIFICATIONS.md).

## Rules specific to this folder

- A screen calls hooks and renders components. Queries, split calculations and permission decisions live in a feature's logic or data-access code, or on the server.
- Freshness comes from events, not timers. Never poll or refetch on an interval. A new kind of change event gets its cache keys in `src/features/sync/changes.ts`, whose tests list the kinds the database sends, and features never open Realtime channels themselves. A mutation still invalidates its own keys so the person acting sees the result at once.
- Offline, every screen keeps what it has. Pass the screen's main query to `Screen` as `freshness`, so the banner can say when it was last updated. Decide on a load error with `isLoadingError` or `loadingError(...)` from `src/components/query-states.tsx`, never `isError` or `error`, which are also set when a refresh fails over data that is still worth showing. Use `LoadingRows` or `PendingSkeleton` for loading, so a load that waits for the connection says so.
- Every button that writes to the server is an `OnlineButton`, which is disabled offline. Buttons that only navigate stay `Button`.
- A failed load shows `LoadError`, which the user taps to try again; there is no separate Try again button.
- Dates are picked with `DateField` (`src/components/form/date-field.tsx`), a calendar in a sheet, never typed. Dates stay `YYYY-MM-DD` strings in the apartment's time zone.
- `Screen` makes room for the keyboard on both platforms (Android draws edge to edge, so the window no longer shrinks) and scrolls the field being typed in above it. Put every form inside a `Screen`.
- Pop-ups and choices use HeroUI's `BottomSheet`, `Select` or `Menu`, not React Native's `Alert`, except for confirmations that need nothing more than OK and Cancel.
- The app can check a split or show a balance it computed, but the server decides. Never treat a client-side calculation as authoritative.
- Money is an integer number of minor units from the database to the screen. Format it with `formatMinorUnits` at the last step, and never divide it into a decimal.
- Render screens in tests with `renderWithProviders` from `src/test/render.tsx`. Theme colours do not exist under Jest, so tests check behaviour and text, not colours.
- Build UI with HeroUI Native components and theme classes such as `bg-background`, `text-foreground`, `text-muted` and `text-accent`, not hard-coded colours. The theme follows the device's light or dark setting.
- Add packages with `npx expo install <package>`, which picks the version that matches the Expo SDK and uses npm underneath.
- In this Expo SDK, `Stack` is imported from `expo-router/stack` and `Link` from `expo-router/link`, not from `expo-router`.
- Only `EXPO_PUBLIC_` variables reach the app, and everything in the app bundle is public. No secrets here.
- Test on Android first, then iOS.

## Dependencies

| Package                                                                                                                                                                                               | Why it is here                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `expo`, `react-native`, `react`                                                                                                                                                                       | The platform (Expo SDK 58)                                                                               |
| `expo-router`                                                                                                                                                                                         | File-based navigation with typed routes                                                                  |
| `heroui-native`                                                                                                                                                                                       | Component library and theme                                                                              |
| `uniwind`, `tailwindcss`, `tailwind-merge`, `tailwind-variants`                                                                                                                                       | Styling engine HeroUI Native is built on                                                                 |
| `react-native-reanimated`, `react-native-worklets`, `react-native-gesture-handler`, `react-native-safe-area-context`, `react-native-screens`, `react-native-svg`, `@gorhom/bottom-sheet`, `expo-blur` | Required by HeroUI Native and navigation                                                                 |
| `@supabase/supabase-js`                                                                                                                                                                               | Auth, database, storage and functions client. Pinned to an exact version.                                |
| `expo-secure-store`, `@react-native-async-storage/async-storage`, `aes-js`, `react-native-get-random-values`                                                                                          | Encrypted storage for the session and saved data                                                         |
| `@tanstack/react-query`                                                                                                                                                                               | Fetching, caching and loading and error states for server data                                           |
| `@react-native-community/netinfo`                                                                                                                                                                     | Network status, so data loads pause offline and resume on reconnect                                      |
| `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister`                                                                                                                     | Saving loaded data on the device and restoring it at launch                                              |
| `expo-sqlite`                                                                                                                                                                                         | The store behind the saved data, without AsyncStorage's size limit                                       |
| `zod`                                                                                                                                                                                                 | Validation of configuration and of input at the app's boundaries                                         |
| `react-hook-form`, `@hookform/resolvers`                                                                                                                                                              | Forms with validation                                                                                    |
| `expo-notifications`, `expo-device`                                                                                                                                                                   | Push notifications                                                                                       |
| `expo-image`, `expo-image-picker`                                                                                                                                                                     | Displaying images, and taking or picking receipts, payment proofs and the profile photo                  |
| `expo-crypto`                                                                                                                                                                                         | SHA-256 for the PKCE sign-in check (`src/lib/web-crypto.ts`); needs a development build that includes it |
| `expo-clipboard`                                                                                                                                                                                      | Copying account numbers, and pasting a join code                                                         |
| `expo-linking`, `expo-web-browser`                                                                                                                                                                    | Deep links and the Google sign-in flow                                                                   |
| `expo-splash-screen`, `expo-status-bar`, `expo-system-ui`, `expo-constants`, `expo-font`                                                                                                              | App shell                                                                                                |
| `expo-dev-client`                                                                                                                                                                                     | The development build                                                                                    |

`expo-device` is installed and is not used by any screen yet.

Development tools: TypeScript, ESLint with `eslint-config-expo`, Prettier, Jest with `jest-expo`, and React Native Testing Library. Jest allows each test 15 seconds, since screen tests that type and press run slowly when the whole suite runs at once.

## Identifiers

The Android package name and the iOS bundle identifier are both `com.manaslatif.flatmate`. They cannot be changed once the app is published.

The general engineering rules are in [AGENTS.md](../AGENTS.md).
