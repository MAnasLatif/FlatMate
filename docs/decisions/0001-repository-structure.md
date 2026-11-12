# 0001. Repository structure

- **Status:** Accepted
- **Date:** 2026-11-12

## Context

FlatMate consists of a mobile app, a Supabase backend and a marketing website. It is an open-source project that developers should be able to clone, understand and self-host. The structure needs to make it obvious where each kind of code belongs, for people and for AI coding agents.

## Decision

Keep everything in one repository with four top-level folders:

- `app/` for the mobile application (Expo, React Native),
- `supabase/` for the backend (migrations, policies, functions),
- `web/` for the marketing website (Next.js),
- `docs/` for all documentation.

`app/` and `web/` are independent projects. Each has its own `package.json` and lockfile and is installed, built and tested from inside its own folder. There is no workspace tool or shared package. Both use npm.

Rules for contributors and AI agents live in a single `AGENTS.md` at the repository root.

## Alternatives considered

- **Separate repositories for each part.** Rejected because a feature usually changes the schema and the app together, and one repository lets that happen in a single reviewed change. It also gives self-hosters one thing to clone.
- **A monorepo workspace with shared packages** (npm or pnpm workspaces, Turborepo). Rejected for now because the website shares no code with the app. Workspace tooling adds configuration and makes Expo's dependency resolution more delicate, with nothing gained yet.

## Consequences

- A change that spans the backend and the app is one pull request.
- Dependencies are installed separately in `app/` and `web/`, and CI runs each project's checks on its own.
- If the app and the website later need to share real code, such as generated database types or validation logic, this decision should be revisited with a new record.
- npm was chosen as the default because it needs no extra setup with Expo or Next.js. Switching package manager later means changing the lockfiles, the CI workflow and the documentation together.
