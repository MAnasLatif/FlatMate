# 0002. HeroUI Native 1.x on Expo SDK 58

- **Status:** Accepted
- **Date:** 2026-11-13

## Context

The SRS names HeroUI Native as the component library, but left open whether its current version works with the Expo SDK the app is built on (SRS section 12, item 12). The app is on Expo SDK 58 (React Native 0.88, React 19.3). HeroUI Native is at 1.0.11 and is built on Uniwind and Tailwind CSS 4.

## Decision

Use HeroUI Native 1.x with Expo SDK 58.

The evidence:

- The package and all of its peer dependencies install from the lockfile with no conflicts, and `expo-doctor` passes all of its checks.
- The app bundles for Android with Metro and Uniwind.
- The project owner ran the app on an Android device on 2026-11-13, and it launched and rendered the home screen.

HeroUI Native fixes the major version of some of its peer dependencies. In particular `tailwind-variants` must stay on 3, and a bump to 4 broke `npm ci`. Dependabot is configured not to propose new majors of those packages.

## Alternatives considered

- **Another component library**, such as React Native Paper or Tamagui. Not needed, since HeroUI Native works on this SDK, and switching would go against the SRS.
- **Building components from scratch.** More work for the same result, and weaker accessibility than a maintained library.

## Consequences

- The device run covered the app shell: the providers, theming and the home screen. Individual components such as Button, TextField, Dialog, BottomSheet and Toast were not exercised, because no screen uses them yet. Check each one on a device when a feature first uses it.
- A HeroUI Native release that changes its peer dependency majors needs the same coordinated upgrade as an Expo SDK upgrade.
