# 0007. Offline reading and live sync

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

The app loads data with TanStack Query and keeps it only in memory. Three things follow:

- A user who opens the app without a connection sees nothing, even data they looked at an hour earlier.
- React Query's refetch-on-focus and online detection listen for browser events that React Native never fires. Returning to the app from the background refreshes nothing, and a lost connection is not noticed: requests retry and then fail.
- Nothing tells the app that something changed on the server. A flatmate's new expense, or a scheduled job moving an expense from provisional to final, appears only when a screen is opened again or pulled to refresh.

The owner asked on 2026-11-14 for an experience like a messaging app: previously loaded data stays readable offline, and new data arrives by itself when online.

The server already keeps the financial history as events: posted records cannot be changed (decision 0003), and every change that matters to an apartment writes a row to `audit_events` in the same transaction, including the changes made by the pg_cron jobs. What is missing is getting those events to the phone, and keeping a copy of what the phone has already seen.

## Decision

**The server stays the only authority.** The phone keeps a cache of answers the server gave it, not a second database. Nothing financial is written on the phone and synced later. Offline expense drafts remain a separate, later feature (FR-10.7, task 3.4).

**1. Network and app lifecycle.** React Query's `onlineManager` is fed by `@react-native-community/netinfo` and its `focusManager` by `AppState`. While offline, queries pause and keep their data instead of failing; when the connection or the app comes back, stale queries refetch. Mutations do not queue while offline: actions that write are disabled with a reason ("Connect to the internet to save"), so a payment or expense is never sent later without the user seeing it happen.

**2. A saved, encrypted cache.** The query cache is saved with `@tanstack/react-query-persist-client` and restored before the first signed-in screen renders, behind the splash screen.

- Storage is `expo-sqlite/kv-store`, an AsyncStorage-compatible store backed by SQLite, to avoid AsyncStorage's size limit on Android.
- The saved cache is encrypted the same way as the session: a random AES-256 key in SecureStore, the encrypted data in storage (`src/lib/supabase.ts`).
- It is stored per user id and deleted on sign-out. A version tag (app version plus a cache-format number) makes an update discard a cache it cannot read.
- Only successful queries are saved. Signed image links are not saved, since they expire after an hour. Offline, a photo shows "Available when online".
- Saved data lives up to 7 days; `gcTime` is raised to match, or React Query would drop it after 5 minutes.
- Every screen shows saved data with a banner giving the time it was last updated. A screen never loaded before shows an offline state, not an error. Provisional, disputed and final labels stay as they were saved.

**3. Every visible change is an event.** The app is event-driven: any write that changes data another member, or the same user on another device, can see sends a change event. The app never polls. It refreshes on an event, on reconnect, and when it returns to the foreground; pull-to-refresh stays as a manual fallback.

- **One way to send.** A function `private.emit_change(topic, kind)` sends `{ "kind": <kind> }` with `realtime.send` as a private Broadcast message. The send is wrapped in its own exception block: Supabase documents that `realtime.send` fails when no message partition exists for the day, and a failed event must never roll back the write it describes. A failure is logged as a warning, and the app's catch-up covers it.
- **Two kinds of topic.** `apartment:<id>` carries changes to an apartment's data and is readable only by its active members. `user:<id>` carries changes that concern one person across apartments (being added to or removed from an apartment, their receiving accounts, their profile) and is readable only by that user. RLS policies on `realtime.messages` enforce both. "Allow public access" is turned off in the Realtime settings of every hosted project.
- **Where events come from.**
  - *Apartment changes* already write an `audit_events` row in the same transaction, including those made by the pg_cron jobs. An `AFTER INSERT` trigger on `audit_events` emits the row's `entity_type` to the apartment topic. A membership change also goes to the affected member's user topic, since a removed member can no longer read the apartment topic.
  - *Personal changes* are written straight to their tables under RLS (`profiles`, `receiving_accounts`, `receiving_account_shares`), so triggers on those tables emit `profile` or `account` to the owner's user topic and to the topic of every apartment that can see the change.
  - *Gaps to close:* `add_payment_proof` writes no `audit_events` row today; it must, both for the history and for the event. Other helpers that write without auditing are checked by the coverage test below.
- **Events carry no data.** The payload is only the kind of record that changed (`expense`, `payment`, `dispute`, `member`, `profile`, `account` and so on): no ids, amounts, names or account details. Some records, such as payments, are visible only to some members (D8), so even an id would say too much. The app fetches the data itself through the existing RLS-protected queries, so the security model does not change.
- **Coverage is tested, not remembered.** A pgTAP test fails when a `private` function writes to a `public` table without writing `audit_events` or calling `private.emit_change`, unless it is on a short allow-list of helpers whose callers do, each with its reason. It also fails when a `public` table that client roles can write has no change trigger. A new feature cannot forget its events.
- **One router in the app.** `src/lib/sync/` joins the user's topic while signed in and the open apartment's topic while it is open, with `private: true` after `supabase.realtime.setAuth()`. It maps each kind to the cache keys to invalidate through one exhaustive table, typed so that a new kind without a mapping fails the type check. Features declare their keys; they do not subscribe to channels themselves. A mutation still invalidates its own keys at once, so the person acting sees the result without waiting for the event.
- **Catch-up.** Delivery while disconnected is not guaranteed. Whenever a channel (re)subscribes or the app returns to the foreground, the router invalidates everything under that topic. Broadcast replay (at most 25 messages) is not relied on.

**4. Push notifications stay a separate task** (1.43), delivered through an Edge Function to the Expo push service, for when the app is closed.

## Alternatives considered

- **A local-first database on the phone (WhatsApp style, or WatermelonDB, PowerSync).** Writes made offline would skip the server's checks on permissions, split totals, membership and closed periods, and conflicts would have to be undone after the user had seen a balance. A full local copy also outlives a member's removal. It is far more work than the requirement needs. If offline writing ever becomes a requirement beyond drafts, PowerSync is the option to evaluate, in a new record.
- **Postgres Changes instead of Broadcast.** Simpler to set up, but Supabase recommends Broadcast for scalability and security. Postgres Changes checks RLS for every subscriber on every change.
- **Edge Functions to fan out changes.** An extra network hop, cold starts and use of the service-role key, for something the database can send itself.
- **Polling on a timer.** Wasted requests and battery, and still slower than a signal.
- **AsyncStorage for the saved cache.** Simpler, but Android caps its database size by default, and a large apartment's history could exceed it.
- **An unencrypted saved cache.** The cache holds balances, names and possibly shared account details, so it is encrypted like the session.

## Consequences

- New native packages (`@react-native-community/netinfo`, `expo-sqlite`) need a new development build.
- Every screen gains an offline state, and every action that writes gains a disabled-when-offline state. The MVP acceptance pass (1.44) checks both.
- Every new feature must emit events for its changes, through `audit_events` or `private.emit_change`, and map its event kinds in the app's router. The coverage test and the type check enforce both.
- Realtime checks the topic policy when a channel is joined and caches it for the connection. A removed member can keep receiving bare change events on the apartment topic until their access token is refreshed (one hour by default). The events carry no data, and the app leaves the channel as soon as its user topic reports the removal.
- A removed member keeps their encrypted saved cache until the app is next online, when the server refuses access and the app deletes the apartment's saved data.
- Realtime has per-project limits on concurrent connections and messages per second (200 and 100 on the free plan). Check them against expected usage before release (task 4.3).
