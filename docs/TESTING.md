# FlatMate — Testing

How FlatMate is tested, and the record of the last full test pass. Requirements are in the [SRS](SRS.md); the journeys tested follow [USER-FLOWS.md](USER-FLOWS.md).

## 1. Automated tests

| Suite | Where | Command | Last result (2026-11-24) |
|---|---|---|---|
| App unit and component tests (Jest, React Native Testing Library) | `app/src/**/*.test.ts(x)` | `cd app && npm test` | 778 passed (2026-11-25) |
| App lint and types | `app/` | `npm run lint`, `npx tsc --noEmit` | Clean |
| Database tests (pgTAP): RLS, money arithmetic, every function and job | `supabase/tests/database/` | `npx supabase@3.1.0 db reset` then `npx supabase@3.1.0 test db` | 940 passed in 47 files |
| Database lint | local stack | `npx supabase@3.1.0 db lint --level warning` | Two known warnings (unused loop variables in `generate_invite_code` and `charge_due_recurring`) |

CI runs the app, Supabase and web checks on every pull request. Run `db reset` before the database tests if end-to-end scripts have left data in the local stack.

## 2. Device test pass, 2026-11-24

### Setup

- **Backend:** the hosted Supabase project, with all 50 migrations applied and `deliver-push` version 2.
- **Build:** EAS Android development build `03a14921` (Expo SDK 58, with `expo-print` and `expo-sharing`), served by Metro.
- **Devices:** two expoemu Android emulators with Google APIs: phone A (Pixel profile, 1080×2400) and phone B (small profile, 720×1600).
- **Accounts:** two fresh accounts created for this pass through the app's own sign-up, confirmed with the emailed 6-digit codes: **Tara Test** (A, admin) and **Umar Test** (B, member). Test apartments: "QA Flat" and "QA Flat Two".

### Results

**47 checks: 41 passed, 3 passed after fixing a bug found here, 3 passed with an observation that could not be reproduced. None failed.**

| # | Area | Action | Result | Notes |
|---|---|---|---|---|
| 1 | Accounts | Sign up A and B with 6-digit email codes | Pass | An unconfirmed account signing in is taken back to the code screen |
| 2 | Accounts | Sign out (confirm sheet) on both | Pass | |
| 3 | Apartments | A creates "QA Flat" (name, location, PKR, settlement day 1, 7 days) | Pass | Opens the dashboard as admin |
| 4 | Joining | Admin sees the join code with Copy, Share, Email and Change | Pass | |
| 5 | Joining | B joins with the code; request pending with Cancel | Pass | |
| 6 | Joining | Request appears live on A; A lets B in | Pass | B's screen switched to the flat by itself |
| 7 | Expenses | A adds Rs 1,000 paid by A, equal split, saved as a quick-add | Pass | A: receive Rs 500 (provisional note); B: send Rs 500 |
| 8 | Live sync | The expense appears on B without refreshing | Pass | |
| 9 | Push | B receives generic pushes (join approved, expense added) | Pass | Through the hosted `deliver-push` |
| 10 | Unread dots | Red dot on the expense row on B | Pass | |
| 11 | Expenses | Detail shows Provisional and the objection deadline | Pass | |
| 12 | Disputes | B proposes a Rs 300 share with a reason | Pass | Disputed on both; A's Rs 500 moves to "held" live |
| 13 | Disputes | A accepts | Pass | Split becomes 700/300 as a new provisional version |
| 14 | Payments | B records a Rs 100 partial payment with a reference | Pass | "Recorded, provisional", claim wording; A notified |
| 15 | Payments | A declines with a reason | Pass | B notified "A payment you recorded was declined." |
| 16 | Payments | A withdraws the objection | Pass | The deadline resumes and rounds up to the apartment's next midnight (Dec 1 → Dec 2) |
| 17 | Quick-adds | B uses A's quick-add; the form fills | Pass | |
| 18 | Expenses | B adds Rs 400 paid by B | Pass | Both owe each other Rs 200; dashboards show the net |
| 19 | Netting | A: Pay Umar → Net off first → Net off | Pass | Explained before confirming; both square; expenses unchanged |
| 20 | Settlement | Settlement screen for the open period | Pass | |
| 21 | Simplification | Simplify debts with two members | Pass (limited) | "Nothing to simplify". A suggestion needs three members, so proposing and accepting were covered by the 36 database tests only |
| 22 | Statements | My statement PDF made on the phone; share sheet; print preview | Pass | Share Rs 900, paid Rs 1,000, received Rs 100, net Rs 0; open-period and "not proof of a bank transfer" notes |
| 23 | Activity | Timeline, type filter and person filter | Pass after fix | Bug fixed: "between You and Umar Test" capitalized "You" mid-sentence |
| 24 | Reports | Compare months | Pass | Nov total Rs 1,400, share Rs 900, change from October |
| 25 | Filters | Search "internet" with a removable chip | Pass | |
| 26 | Budgets | Admin sets Rs 1,500 for all spending | Pass | |
| 27 | Repeatable | Admin adds monthly rent Rs 20,000, first charge now | Pass | |
| 28 | Inventory | Member adds "Fridge" (the flat's, in use, good) | Pass | |
| 29 | Inventory | Add a cost from the item; Rs 600 counted towards it | Pass | Item totals with the provisional note |
| 30 | Rooms | Admin adds Master (3) and Small (2) | Pass | |
| 31 | Rooms | Admin records stays: Tara in Master, Umar in Small | Pass after fix | Bug fixed: screen-reader label "Remove You's stay" |
| 32 | Rooms | Split by room for Nov 1–30 → Rs 3,000 and Rs 2,000 (7 days each) | Pass | Fills By amount and the notes "Split by room for Nov 1, 2026 – Nov 30, 2026." |
| 33 | Bills | Unpaid bill Rs 5,000 with Umar as collector | Pass | Umar told "You were asked to pay a bill for your apartment." |
| 34 | Budgets | Alerts at 80% and 100% (scheduled job) | Pass | Both pushes on B; dashboard bar "Rs 500.00 over" |
| 35 | Push | Netting, objection and withdrawal pushes | Pass | |
| 36 | Bills | Collector records paying the bill, with a preview of the debt | Pass | A sees "You'll send Rs 3,000" live |
| 37 | Offline | Airplane mode on B; Add expense offers Save offline | Pass after fix | Fixed: the general offline banner on Add expense said "Saving needs a connection" next to Save offline |
| 38 | Offline | Saved offline → "Not sent yet / Waiting to send"; A does not see it | Pass | |
| 39 | Offline | Reconnect → sent by itself, once | Pass | About 20 seconds |
| 40 | Deposits | Admin records a Rs 10,000 deposit paid by Tara, equal shares | Pass | Umar notified; his net becomes Rs 1,550 (5,000 − 3,000 − 300 − 150), correct |
| 41 | Permissions | Admin stops Umar adding expenses, then allows it again | Pass | Umar's Add explains it; push "Your permission to add expenses changed." |
| 42 | Repeatable | Rent charged by the scheduled job | Pass | Unpaid bill dated Nov 1 |
| 43 | Expenses | Admin voids an expense (confirm) | Pass | Umar's net Rs 1,550 → Rs 1,700, with the breakdown |
| 44 | Apartments | Second apartment, isolated figures, switcher count, switch back | Pass | Back after switching leaves the app, as specified |
| 45 | Membership | Member leaves; owed amount shown first; confirm | Pass | Debt kept; listed under Past apartments; admin notified |
| 46 | Membership | Former members on the admin's members screen | Pass with observation | Once, the open screen did not list Umar until the flat was reopened; the server data was right. Not reproduced |
| 47 | Apartments | The app reopens the last apartment used | Pass with observation | Once, a cold start straight after switching opened the other flat; not reproduced |

Also checked along the way: the profile name saves itself; a former member's view refreshes such changes later, since they no longer get the flat's live updates.

### Bugs found and fixed in this pass

1. **Activity wording:** names in the middle of a sentence wrote "You" with a capital, and "You owes" in adjustments. Fixed in `app/src/features/activity/describe.ts`, with tests.
2. **Rooms:** the screen-reader label "Remove You's stay" now reads "Remove your stay".
3. **Offline:** Add expense no longer shows the general "Saving needs a connection" banner, since its own notice explains Save offline (`Screen`'s new `offlineBanner` prop).

## 3. Device test pass, 2026-11-25: what the first pass left out

### Setup

- **Backend:** the local Supabase stack, so deadlines could be moved and scheduled jobs called directly: `finalize_after` set in the past, the period's end moved to yesterday, and the flat briefly put in a timezone already past 09:00 for reminders, then put back.
- **Build and devices:** the same development build and emulators as section 2.
- **Accounts:** **Tara Local** (A, admin), **Umar Local** (B) and **Vera Local**, in "Local Flat". Vera had no phone; her one action went through the same database function the app calls, signed in as herself. A fourth account, **Wes Local**, tried the join codes.

### Results

**21 checks: 19 passed, 1 passed after fixing a bug found here, 1 failed (an open bug, below).**

| # | Area | Action | Result | Notes |
|---|---|---|---|---|
| 1 | Simplification | Three-person suggestion "Umar pays Vera Rs 1,000 directly" | Pass | |
| 2 | Simplification | A proposes; B sees a red dot and accepts; Vera accepts | Pass | Applied live on both phones; Umar owes Vera Rs 1,000, Tara square with Umar |
| 3 | Simplification | The settle and ledger screens explain the moved debt | **Fail** | Open bug 1 below |
| 4 | Payments | B pays Vera with a reference and a proof from the photo picker | Pass after fix | Bug fixed: the form flashed "You do not owe Vera Local anything right now" while the proof uploaded |
| 5 | Payments | The proof opens | Pass | |
| 6 | Finalizing | An expense becomes final after its window | Pass | "Final since Nov 25, 2026" |
| 7 | Finalizing | A payment becomes final after its window | Pass | "Confirmed by app policy … No bank has verified it", live on B |
| 8 | Settlement | The period closes; Rs 1,500 unpaid | Pass | Carried into the new period; listed under Past periods as "You owed Umar Local Rs 1,500.00" |
| 9 | Notifications | Rows for proposals, recording, proofs, confirmation and period closing | Pass | Not pushed: the local stack has no push delivery, which section 2 covered on hosted |
| 10 | Reminders | "Bill due today" and "settlement soon" | Pass | Only the collector and the one person who owed were told; a second run added nothing |
| 11 | Repeatable | A changing-amount bill waits for an admin | Pass | "The bill has arrived. Enter its amount"; nothing charged |
| 12 | Repeatable | The admin enters Rs 2,400 | Pass | Unpaid bill, Rs 800 each, collector kept; dated today because its day fell in a closed period (FR-04.8); a second job run charged nothing |
| 13 | Deposits | Rs 9,000 paid by Tara, then Tara takes over Umar's share | Pass | |
| 14 | Deposits | Vera's share refunded with a Rs 500 deduction and a reason | Pass | |
| 15 | Deposits | The rest returned to Umar with a Rs 1,000 deduction | Pass | Preview before saving; Umar's balance changed live |
| 16 | Deposits | Undo the latest change, after confirming | Pass | Shares and balances restored; the undo stays in the history |
| 17 | Expenses | An admin raises a member's expense from Rs 3,000 to Rs 3,600 | Pass | New version with a fresh window; the old one kept; the member notified |
| 18 | Accounts | B adds a bank account and shares it with the flat | Pass | A missing bank name is explained; A sees it masked (•••• 7890), with Show and Copy, preselected under "Paid into" |
| 19 | Joining | Change code | Pass | Confirmed first; the old code is refused and the new one works; the request appears live |
| 20 | Roles | A makes B an admin; B answers a request, then steps down | Pass | B's settings open and close with the role |
| 21 | Roles | The last admin tries to step down | Pass | "An apartment needs at least one admin. Make someone else an admin first." |

### Bugs found

1. **Open: debts that do not come from an expense cannot be traced on screen.** Simplifications, deposit takeovers and returns, and their undos write ledger entries with no expense. Balances include them correctly, but "Settle with" lists only expenses (it told Umar he owed Vera nothing, with no Pay button, while his balance said Rs 1,000), and a person's ledger lists only expenses and payments. A simplified expense still reads "You owe Tara Local Rs 1,000.00" after the debt moved. This breaks "every balance can be explained from the records behind it" for these records.
2. **Fixed:** Record a payment no longer turns into the "nothing owed" warning while the proof uploads (`pay-member.tsx`, with a test).
3. **Fixed:** button icons are hidden from screen readers, which read labels such as ", Copy" and ", Add a receipt".

### Observations

- Dashboard rows show each person's share of an expense, so they still show it after a payment, netting or simplification has covered it.
- "Step down as admin" applies at once, without a confirmation, though only another admin can undo it.
- Amounts filled in for you (takeover, refund, return) show as "3000.00", while the same amounts elsewhere show as "3,000.00".

## 4. Not covered yet

- **Need setup not yet done:** Google sign-in (OAuth client) and invite emails (Resend secrets).
- **iOS:** there is no iOS simulator or build yet.
- **Push delivery of reminders and of the new events** on a phone, which needs the hosted project.

## 5. Running the device pass again

1. Build or reuse an EAS development build (`npx eas-cli build -p android --profile development`) and install it on two emulators or phones.
2. Point Metro at the backend you want: `app/.env.local` (local stack) wins over `app/.env` (hosted). Use the local stack to fast-forward deadlines by moving `finalize_after` or period dates and calling the job functions.
3. Walk through the tables above with two or three accounts, and add rows for anything new.
4. Record the date, build, backend and results here, replacing the older pass.
