# FlatMate — Software Requirements Specification

**Version:** 2.0
**Date:** 2026-11-24
**Status:** Describes the product as built through Phase 3. Section 14 records every product decision.
**Product:** Open-source app for people who share a flat
**Platforms:** Android first, iOS from the same codebase
**Stack:** Expo SDK 58, React Native, TypeScript (strict), Expo Router (typed routes), HeroUI Native 1.x, TanStack Query; Supabase (Auth, PostgreSQL with row-level security, Storage, Realtime, Edge Functions, pg_cron); Expo push service

This is the single source of truth for what FlatMate does and the rules behind it. How the parts are built is in [ARCHITECTURE.md](ARCHITECTURE.md), and the journeys through the app are in [USER-FLOWS.md](USER-FLOWS.md), and how it is tested in [TESTING.md](TESTING.md). When behavior changes, update this document in the same change.

## 1. Introduction

### 1.1 Vision

FlatMate helps roommates, students, friends and other shared-living groups record shared costs, split them fairly, see who owes whom, raise disagreements, and settle up. One person can belong to several apartments, each fully separate. The project is open source and self-hostable; an official app is distributed through Google Play and the App Store.

### 1.2 Product principles

- **The apartment is the isolation boundary.** Data, settings, roles and balances belong to one apartment and never leak into another.
- **FlatMate never moves money.** Members pay each other outside the app and record it. A recorded payment is a claim, not proof of a bank transfer, and nothing in the app suggests otherwise.
- **Every balance is explainable.** Balances are derived from records that are added and never edited. Corrections are new linked entries.
- **Expenses are accepted by default.** Nobody has to click Accept. An affected member can object within a window (7 days by default), which opens a dispute.
- **Statuses mean what they say.** Recorded, provisional, disputed and final are kept distinct in data and on screen; "confirmed by app policy" never means bank-verified.
- **Scheduled work is safe to repeat.** Recurring charges, finalization, reminders and push delivery can run twice without doing their work twice.
- **Wording is plain.** The app says *you owe*, *you'll receive*, *provisional*, *disputed* and *final*. UI copy is English, written so it can be localized later.

### 1.3 Out of scope

- Holding, moving or verifying money; bank or wallet access; regulated payment processing.
- Verifying transfers automatically without an authorized provider integration.
- Landlord or property-management features: leases, tenant screening, rent collection.
- Several currencies in one apartment, and currency conversion.

### 1.4 Glossary

| Term | Meaning |
|---|---|
| Apartment (flat) | A group of members with its own currency, timezone, settlement day and records |
| Admin | A member who manages the apartment; an apartment has at least one |
| Expense | A purchase or bill, with who paid (payers) and who shares it (the split) |
| Unpaid bill | An expense owed to someone outside the apartment (a landlord, a utility) that no member has paid yet; it creates no debt until a member pays it |
| Collector | The member named as the one who will pay an unpaid bill; naming them creates no debt |
| Share | One member's part of an expense |
| Objection window | The days after posting during which an affected member can dispute (default 7) |
| Provisional / Final | Inside / after the objection window |
| Disputed | Held by an open dispute; not payable |
| Payment | A member's claim that they paid another member |
| Confirmed by app policy | A payment nobody objected to within its window; not bank verification |
| Offset (net off) | Cancelling what two members owe each other against each other |
| Adjustment | A new ledger entry saying one member owes another more, used for corrections |
| Settlement period | From the settlement day to the day before the next one |
| Minor units | Integer amounts in the currency's smallest unit (paisa for PKR) |

## 2. Actors and permissions

| Actor | Can |
|---|---|
| Guest | Sign up, sign in, reset a password |
| Member | Read the apartment's expenses; add one-time expenses (unless an admin turned this off); dispute their shares; record and object to payments; net off; propose and answer debt simplifications; manage quick-adds and inventory (if allowed to add expenses); see rooms, deposits, activity they may see; export their own statement; manage their profile and receiving accounts; leave |
| Admin | Everything a member can, plus: approve or decline join requests; share, email and change the join code; remove members, change roles and expense permission; hide former members and invite them back; edit apartment settings, categories, budgets and reminder schedules; manage repeatable expenses and enter their bills; manage rooms and occupancy; record and correct deposits; export the apartment report; decide escalated disputes as a neutral admin |
| Former member | Read the records they were part of; pay what they still owe; answer an invitation back |
| System | Finalize expired objection windows; confirm payments by app policy; close settlement periods; charge repeatable expenses; send reminders and budget alerts; deliver push notifications |

Rules:

- A person can be in several apartments with a different role in each. There can be several admins.
- An apartment always keeps at least one admin: the last admin must appoint another before stepping down or leaving.
- One-time expenses are allowed for every member until an admin turns it off for that member. Only admins manage repeatable expenses.
- Every rule is enforced in the database, under row-level security and inside the functions that change data. Hiding a button is never the access control.

## 3. Navigation and screens

### 3.1 Starting the app

1. The splash screen restores the session and the saved (encrypted) copy of the user's data, for at most 5 seconds.
2. Signed out: sign in or sign up with email and password, or Google. Sign-up, password reset and email change are confirmed with a 6-digit code sent by email.
3. Signed in with apartments: the app opens the apartment last opened on that device, or the first one if the user has left it.
4. Signed in with no apartment: the home screen offers **Join by code** (with paste) and **Create apartment**, and lists pending join requests and invitations back.
5. Creating asks for a name, an optional location (shown to members when given), the currency (a searchable list of every currency in circulation with its symbol; fixed afterwards), the settlement day and the objection window (7 days by default). The timezone comes from the phone. The creator becomes admin.

### 3.2 The apartment

- **Top bar:** FlatMate's logo and name with the open apartment's name under it; tapping either opens **My Apartments**, where choosing another apartment replaces the open one. The members icon sits on the other side with a count of unread items behind it. There is no notification bell and no settings icon here.
- **Bottom bar:** Expenses, Add (+), Profile, icons only and the same size, with only the open tab coloured. Profile shows the user's photo, and its screen has its own header with a back arrow and sign-out.
- **Dashboard (Expenses tab):** an offline banner when it applies; expenses waiting on the phone to be sent; two figures side by side, **You'll receive** and **You'll send** (tapping one filters the feed to that side); the month selector (arrows, or month and year wheels for this year and last); the user's share of the month with **Compare**; budget bars; the filter chips; and the expense feed. A figure that includes provisional amounts says so. There is no net figure and no Settle up button on the dashboard.
- **Members screen:** links to Settlement, Deposit, Inventory, Rooms and Activity; then each member with the net between them and the viewer, and former members. Tapping a member opens the ledger with them. Admins act from a person's page and send invites from the top bar.
- **Apartment settings** (admins): reached from the gear next to the apartment in My Apartments; tabs for General, Members, Expense control and Repeatable expenses.
- The app follows the device's light or dark setting.

### 3.3 Screen list

- Sign in, sign up, code entry, password reset, change email, change password.
- Home without an apartment; My Apartments; create, join and edit apartment.
- Dashboard; filter sheet; month comparison; expense detail; add and edit expense; receipts; photo viewer; quick-adds.
- Members; ledger with a person; member page (admin actions); former members.
- Record a payment; payment detail; payment objection; adjustment.
- Dispute an expense; dispute detail.
- Settlement; settle with a person; statements (PDF); simplify debts.
- Apartment settings: general, members (join code, requests, invitations back), expense control (categories, expense permission, budgets), repeatable expenses (templates, waiting bills).
- Repeatable expense form; enter a waiting bill.
- Deposits: list, record, detail, take over, refund, return.
- Inventory: list, item, add and edit item.
- Rooms: list, room, add and edit room.
- Activity timeline.
- Profile; receiving accounts; account detail and edit; notification preferences; leave apartment; past apartments.

## 4. Functional requirements

### FR-01 Accounts and profiles

- **FR-01.1** Sign up and sign in with email and password, or Google. Sign-up, password reset and email change are confirmed with 6-digit email codes; changing email needs a code from both the current and the new address. The password is changed on its own screen. Sessions persist and sign-out clears everything saved on the phone.
- **FR-01.2** A profile has a name and an optional photo. The name saves itself shortly after typing stops, when the field is left, and when the screen closes. Tapping the photo adds, changes or removes it.
- **FR-01.3** Push notifications can be turned off by group (expenses, payments, disputes, members, reminders, settlement, budgets) for every apartment at once. The notification is still created and its red dot still shows; only the push is held back.
- **FR-01.4** A user may register several **receiving accounts**: bank or wallet, provider, account title, account number or wallet identifier, and one preferred account. FlatMate never asks for banking passwords, PINs or OTPs.
- **FR-01.5** Accounts are private by default. The owner shares each one with chosen apartments, and only current members of those apartments see it, with the number masked until revealed and copyable. The owner sees their own accounts in full, in a list that opens each account (edit, delete, make preferred, and the payments made into it); swiping a row right edits it and left asks to delete it.

### FR-02 Apartments and membership

- **FR-02.1** Creating an apartment makes the creator its admin (section 3.1).
- **FR-02.2** **Join code.** An apartment has one join code at a time, eight characters shown as XXXX-XXXX. It does not expire. Admins see it, copy it, share it, and change it, which stops the old one. Only admins can read it; joining matches on its hash, and wrong guesses are rate-limited.
- **FR-02.3** **Joining needs approval.** A valid code sends a request. Any current admin lets the person in or declines, and the first to act decides; admins are told about requests, and the person about the answer. The person sees their pending requests, can cancel them, and may ask again after a decline. Invalid or changed codes fail safely.
- **FR-02.4** **Invite emails.** An admin can type an address and FlatMate emails the join code (through an Edge Function and Resend). Limits: 20 emails a day per admin, and 3 a day to the same address from one apartment. The address is never stored; only a hash is kept for the limit. Without a configured email provider the app suggests sharing the code instead.
- **FR-02.5** One person can be in several apartments. Balances, settings and roles never mix between them.
- **FR-02.6** **Leaving and removal.** A member may leave; an admin may remove a member. Their records stay, and what they owe or are owed stays attached to them and is shown when they leave. A former member can still pay what they owe.
- **FR-02.7** **Former members.** An admin can remove a former member from the list, which only hides them there and changes no record; they can still ask to join with a code. An admin can invite a former member back; the person accepts or declines from their home screen or My Apartments, and accepting makes them a member again. An admin can withdraw a waiting invitation.
- **FR-02.8** Admins promote and demote admins and turn a member's permission to add expenses on or off.
- **FR-02.9** Join and leave dates are kept. Splits only include current members.

### FR-03 One-time expenses

- **FR-03.1** A member who may add expenses records a title, category, amount, date (from a calendar), optional receipts (any number, from the camera or gallery), and optional notes (last on the form). For a catch-all category such as Other, they say what it was ("Other · Gas cylinder").
- **FR-03.2** An expense is either already paid, with one or more payers whose contributions add up to the total, or an **unpaid bill**. A bill may have a due date and a collector, who is told and suggested as the payer when the bill is paid. An unpaid bill creates no debt until a member records paying it.
- **FR-03.3** The split is equal, by percentage, or by fixed amounts, among chosen current members. Percentages must total 100% and fixed amounts the total. The server computes every share (section 5.2).
- **FR-03.4** A bill for a period can be **split by room** (FR-10.6): the server works out the amounts and the form fills them in as a split by amount.
- **FR-03.5** There is no preview of who owes whom on the add and edit forms. The expense detail shows shares, payers, the debts they create, receipts, status and history.
- **FR-03.6** **Editing.** The person who added an expense, or an admin, may edit it. Descriptive fields (title, category, notes, dates) change in place and are logged. A change to the amount, split or payers writes a new revision: the old charges are reversed and the new ones posted in one transaction, and the expense becomes provisional again so everyone in it can object. Voiding cancels its charges the same way. Nothing is deleted.
- **FR-03.7** A final expense dated in a closed settlement period is locked: it cannot be edited or voided. No expense can be dated, or moved, into a closed period.
- **FR-03.8** **Quick-adds** (FR-10.3) fill the form with one tap, and a new expense can be saved as one.
- **FR-03.9** Retried submissions add the expense once (each carries a request id).

### FR-04 Repeatable expenses

- **FR-04.1** Admins add and manage repeatable expenses in the apartment's settings; the Add (+) flow is for one-time expenses only.
- **FR-04.2** A template repeats every day, every 1 or 2 weeks from its first date (keeping that weekday), or every 1, 3 or 12 months on a bill day (29 to 31 fall on the last day of shorter months). It has an optional number of days to pay, an optional collector, and its own split.
- **FR-04.3** **Fixed amount** (such as rent): on the bill day the scheduled job adds it as an unpaid bill with the template's split, once per billing period. If the split names someone who has left, it waits for an admin to check the split instead.
- **FR-04.4** **Changing amount** (such as electricity): on the bill day admins are told to enter the real amount. Nothing is charged until they do; the app never invents an amount. An admin may also skip a period.
- **FR-04.5** An admin can change one period's split when entering its bill, without changing the template. Template changes apply to charges not yet made; past charges stay as they are and can be edited like any expense.
- **FR-04.6** A template can be paused (the paused periods are not charged afterwards) or stopped for good (its charges stay).
- **FR-04.7** A repeatable expense can **split by room** each time, in advance or in arrears (FR-10.6).
- **FR-04.8** A billing period is charged at most once, however often the job runs. A charge that would fall in a closed period is dated today.

### FR-05 Acceptance and disputes

- **FR-05.1** Expenses are accepted the moment they are posted and count in balances at once, as **provisional**.
- **FR-05.2** The objection window closes at midnight in the apartment's timezone after its last full day; a scheduled job then makes the expense **final** within minutes.
- **FR-05.3** Anyone in the current split except the person who added it may dispute: a **decline** (their share should be zero) or an **adjustment** (their share should be a stated amount), always with a reason, and optionally evidence files. One dispute per expense is open at a time.
- **FR-05.4** A dispute raised inside the window holds the whole expense: it becomes **disputed**, none of it is payable, and the window pauses with the time left kept on the dispute. Other expenses stay payable.
- **FR-05.5** The person who added the expense accepts, which applies the proposal, or rejects with a message, which escalates it. An escalated dispute is decided by an admin who is neither the raiser nor the creator: they apply the proposal or uphold the expense. If the creator has left, such an admin may decide directly. The raiser may withdraw at any time before it is resolved. Upholding or withdrawing resumes the window with the time that was left.
- **FR-05.6** Applying a proposal gives the raiser the share they proposed and spreads the difference over the other participants in proportion to their shares (largest remainder, ties to the lowest user id), as a new revision with a fresh objection window. A proposal nobody could absorb is refused when raised.
- **FR-05.7** An objection to a final expense is a **late case**: it holds nothing and the expense stays final. On a locked expense (FR-03.7), an accepted late case posts the per-pair differences as adjustments; the closed revision is left as it was.
- **FR-05.8** Edits, voiding and recording a bill payment are refused while a dispute is open. Every step of a dispute is kept, unchangeable, with who did it, the message and details.

### FR-06 Balances and ledgers

- **FR-06.1** The dashboard shows what the user will receive and will send across the apartment, and their share of the month's expenses. Figures that include provisional amounts say so. Disputed amounts are shown separately, as held, and never counted in those figures. Each expense in the feed says what the user will still receive or send for it, or that it is settled, after payments, offsets and simplifications; the receive and send figures filter the feed to the expenses still open.
- **FR-06.2** The members screen shows, for the viewer, the net with each member; the ledger with a person shows what each owes the other, the net, the shared expenses (paginated), the other debts behind the balance (from simplifications, deposits and adjustments), payments, disputes, and the person's shared receiving accounts. Settling with a person lists every debt between them, oldest first, with how much is settled and the record it comes from.
- **FR-06.3** **Net off.** When two members owe each other, either can offset the smaller amount. The screen shows exactly which obligations it covers. Who funded each original expense never changes, and nothing is counted twice.
- **FR-06.4** **Debt simplification.** When one member owes a second who owes a third, the first can pay the third directly. Suggestions are offered only when a step cuts the number of transfers, from amounts payable now (never disputed ones). Any of the three proposes it; it applies only once all three accept within 7 days, and lapses if the debts change or someone leaves first. Each sees only the amount moved, never anyone's whole balance with someone else. It is written as new ledger entries (section 5.3); nobody is given a new creditor without their yes.
- **FR-06.5** Money is integer minor units everywhere, never floating point (section 5.1).

### FR-07 Payments

- **FR-07.1** A payment starts from an expense (paying a bill) or from the ledger with a person, for what is owed or a part of it. It can never be more than the payer owes the recipient.
- **FR-07.2** The recipient's shared accounts are shown so the payer can copy the details; the transfer happens outside FlatMate.
- **FR-07.3** The payer records the amount, time, an optional reference, optional proof images, and optionally which shared account it went into. The payment keeps a snapshot of that account (provider, title, masked number), so later edits or deletion do not change it. The account owner sees the payments made into each account.
- **FR-07.4** A recorded payment is **provisional** and counts at once; the recipient is told.
- **FR-07.5** Only the recipient may object, with a reason. Inside the window (7 days from recording) the payment becomes **disputed** and stops counting, so the payer owes the full amount again; the window pauses. The recipient can withdraw the objection (it counts again, the window resumes), or the payer can void a payment that is not final (it stops counting and stays in the history).
- **FR-07.6** A payment nobody objected to becomes **final**, labelled *confirmed by app policy*, which is not bank verification. A final payment cannot be voided. A late objection is a separate case: the payer, or an admin who is not the recipient, records an adjustment of up to the payment's amount as owed again.
- **FR-07.7** An admin can see a payment objection but cannot rule on it, since that would certify a transfer. An unresolved case is carried forward.
- **FR-07.8** A payment is visible to its payer, its recipient and the apartment's admins. Retried submissions record it once.

### FR-08 Settlement

- **FR-08.1** Each apartment has a settlement day, set by admins. A period runs from it to the day before the next one; 29 to 31 fall on the last day of shorter months. A change takes effect from the next period.
- **FR-08.2** The settlement screen shows, for the open period, what the user owes and is owed by each person, what is held by disputes, and the net, with links to settle with each person, statements, simplify debts, and past periods.
- **FR-08.3** A scheduled job closes a period once its last day has passed in the apartment's timezone, records an unchangeable snapshot of every pair's balance by status and the number of open disputes, and opens the next period.
- **FR-08.4** Nothing is zeroed because a date passed. Unpaid and unresolved amounts stay in the ledger and carry forward.
- **FR-08.5** Closed periods stay as they were; corrections are linked adjustments.

### FR-09 Notifications

- **FR-09.1** People are told about: expenses that include them (added, edited, cancelled, bill paid), being named collector, disputes on their expenses, payments to or from them and objections, netting and adjustments with them, membership changes (joins and departures to admins; role and permission changes to the member), requests to join and their answers, invitations back, repeatable bills waiting for an admin, reminders, budget alerts, deposit changes to their share, debt simplifications they are part of, and closed settlement periods. Whoever made a change is never told about it.
- **FR-09.2** **No inbox.** A red dot marks each place with something unread (section 6.2), and opening that place clears it.
- **FR-09.3** **Push.** Push text is generic, because it shows on lock screens ("An expense that includes you was added."). It never contains names, amounts or account details. Tapping a push loads the notification under the user's own access and opens its record, which checks access again; a record the user may no longer see shows as not available.
- **FR-09.4** **Reminders.** An unpaid bill with a due date reminds its collector, or the admins when nobody is named or the collector has left, a set number of days before and on the day. A set number of days before the settlement day, each current member who still owes someone (final and provisional, not disputed) is reminded. Admins set both lead times per apartment (0 to 14 days for bills, 1 to 14 for settlement, or off; new apartments start at 1 and 2). Reminders go out from 09:00 in the apartment's timezone, and each reminder reaches each person once.
- **FR-09.5** Scheduled jobs use each apartment's timezone and are safe to run twice.

### FR-10 Reports and shared living

- **FR-10.1** **Search and filters.** A sheet on the dashboard filters the month shown by title or notes, member (expenses they share in or paid for), category, status and amount range, applied on the server, with a chip per filter to remove it. **Compare** shows the apartment's total and the user's share for the last six months, without cancelled expenses.
- **FR-10.2** **PDF statements.** For any settlement period, a member exports their statement: their share and payments of its expenses, payments sent and received, and per person what was carried forward, what is owed each way at close (or so far, while open) and what is held by disputes. Admins also export the apartment report of per-member totals. Closed periods use their snapshots, so their statements never change. The PDF is made on the phone and opened in the share sheet; nothing is stored on a server.
- **FR-10.3** **Quick-adds and budgets.** Quick-adds belong to the apartment (at most 30, one per name): anyone who may add expenses saves one from the Add expense form or deletes it, and picking one fills the form. An equal split among everyone includes members who join later. Admins set monthly budgets, for all spending and per category, counted like the comparison; every current member is told the first time a month reaches 80% and 100% of a budget.
- **FR-10.4** **Security deposits.** Admins record a deposit with who paid the landlord and each member's share; whoever paid more than their share is owed the difference through linked adjustments. When someone moves out, their share is refunded by the landlord (with deductions; nothing changes between members) or taken over by a current member, who then owes them. At the end, the rest is returned to one member, deductions are shared in proportion to the shares still held, and that member owes each other holder their refund. A share held by someone who has left must be refunded or taken over first. The latest change can be undone with reversing entries. Every current member sees deposits and shares; holders are told when their share changes; a former member still sees deposits they held a share of.
- **FR-10.5** **Shared inventory.** An item belongs to the flat or to one member (a record only; it moves no money), with a condition (new, good, fair, poor), a status (in use, needs repair, gone) and notes. What it cost to buy and maintain are ordinary expenses linked to it, each to one item at most; the item adds them up, leaves out cancelled ones, and says when a total includes provisional or disputed amounts. Anyone who may add expenses adds and edits items and links expenses (from the item, or from the expense); admins remove items added by mistake. A sale, disposal or owner moving out is a change of status, with any money recorded as an expense or payment.
- **FR-10.6** **Rooms and occupancy.** Admins record rooms with a weight (1 to 100) and who lived in each from which day to which day (one room per person at a time). A bill for a period can be split by room: each day is worth the same; a day's part is shared by the rooms someone lived in that day by weight, and within a room equally; empty rooms and days nobody lived anywhere take no part. Only current members are in a split: a former member's days are shown as left out and their room counts as empty on those days. The server works out the amounts and the expense is saved as a split by amount with the period in its notes, so later room changes never alter it. A repeatable expense can split by room each time it is charged, **in advance** (from its bill date to the day before the next, like rent) or **in arrears** (from the previous bill date to the day before this one, like electricity); the job charges a fixed amount at once unless someone's days would be left out or nobody lived in a room, when it waits for an admin, and an admin entering a changing amount can have the server split it by room.
- **FR-10.7** **Expenses added offline.** Offline, Add expense saves the expense into an encrypted queue on the phone instead of posting it. It is sent by itself when the app starts online or the connection returns, checked against the current members (anyone who joined since is left out of the split) and posted with its own id as the request id, so it is added once. One the server turns down stays with the reason, for the user to fix or delete. The dashboard lists them as *Waiting to send* or *Not sent*; nobody else sees them and no total counts them until sent. Receipts and saving as a quick-add wait until it is sent. At most 20 per apartment, kept up to 30 days, deleted at sign-out. Only adding expenses can wait offline.
- **FR-10.8** **Activity.** Each expense, payment and dispute shows its own history. The apartment's Activity screen shows the whole timeline, newest first, filtered by type (expenses, disputes, payments, members, settings) and by who did it; each entry opens its record. An entry is visible only to those who can read its record: payments, netting, adjustments and simplifications to their people and admins; join codes, requests and repeatable expenses to admins. Former members have no timeline.

## 5. Money and the ledger

### 5.1 Amounts

Amounts are integer minor units (paisa for PKR), at most 10¹² per record, in the apartment's one currency. No floating point is used for money anywhere: in the database, in TypeScript (which uses `BigInt` in split arithmetic), or in tests.

### 5.2 Splitting

The server computes every share; the app only previews with the same rules.

- **Equal** and **percentage** splits use the largest-remainder method: each participant gets `floor(total × weight / total weight)`, and the minor units left over go one each to the participants with the largest remainders, ties to the participant whose user id sorts first. Equal splits use weight 1; percentages are basis points that must total 10,000.
- **Fixed** splits take the amounts given, which must total the expense.
- **By room** splits are worked out by the server (FR-10.6) with the same remainder rule and saved as fixed amounts.
- **Who owes whom for one expense:** each person's contribution first covers their own share; those who paid more are creditors and those who paid less debtors; both lists are sorted by user id and matched in order, each time for the smaller remaining amount.

Worked examples (members Anas, Zubair, Ajmal):

- Rs 200.00 split equally: 66.67, 66.67 and 66.66; which two get the extra paisa follows user id order, so it is the same every time.
- Rs 1,000.00 split equally: 333.34, 333.33, 333.33.
- A 50% / 25% / 25% split of any amount adds up exactly.
- Netting Anas and Ajmal offsets their debts to each other without changing who funded each expense; Zubair's debts to both stay separate unless a simplification is agreed.

### 5.3 Ledger entries

Every balance comes from ledger entries between a debtor and a creditor, both members, each with a positive amount. No balance is stored. Expenses, revisions, payers, splits, ledger entries, payments, offsets, adjustments, deposit actions and closing snapshots can never be updated or deleted; a trigger rejects it whatever the role.

| Kind | Created by | Effect on what the debtor owes the creditor |
|---|---|---|
| `charge` | Posting an expense revision | increases |
| `charge_reversal` | Replacing or voiding a revision | decreases, cancelling one earlier charge |
| `payment` | Recording a payment | decreases |
| `offset` | Netting two members' debts (a pair of entries) | decreases |
| `adjustment` | Corrections, late cases, deposit debts, the new debt of a simplification | increases |
| `transfer` | Applying a debt simplification (two entries) | decreases |

What A owes B is the sum of A→B entries that increase, minus those that decrease, minus the same for B→A. An entry takes the status of its source: expense entries are provisional, disputed or final with their expense; payment entries are provisional, disputed or final with their payment, and void payments count for nothing; offsets, adjustments and transfers are final when made. Balances are reported per status, so the app can show what is final, provisional or held.

A **debt simplification** writes, in one transaction: a transfer lowering what the debtor owes the middle person, a transfer lowering what the middle person owes the creditor, and an adjustment for the debtor's new debt to the creditor. Everyone's net with the group stays the same.

### 5.4 Status models

| Record | States |
|---|---|
| Expense | `provisional` → `final`; `disputed` while a dispute holds it; `void` when cancelled (its charges reversed) |
| Payment | `provisional` → `final` (confirmed by app policy); `disputed` while the recipient objects; `void` when the payer voids it |
| Expense dispute | `open` → `escalated` → `resolved` (accepted, decided, upheld or withdrawn) |
| Payment objection | `open` → `resolved` (withdrawn, voided or adjusted) |
| Settlement period | `open` → `closed` |
| Repeatable bill | `waiting` (amount needed, or split to check) → `posted` or `skipped` |
| Debt simplification | `proposed` → `applied`, `declined` or `lapsed` |

### 5.5 Rules that protect the ledger

- Only members can be owed. A bill owed to a landlord or utility becomes a debt to the member who pays it; until then it has no creditor.
- Financial writes run inside transactional database functions, under per-pair locks where amounts are checked, so partial state is never visible.
- Anything that can be retried carries an idempotency key or a uniqueness rule: expenses, payments, offsets, adjustments, deposit actions, quick-adds, items, rooms, simplifications, and one charge per template and billing period.
- Disputes hold only what they affect; uncontested amounts stay payable, and unresolved ones carry forward.
- Time is the apartment's time: windows, settlement days, reminders and repeatable bills use its timezone, and short months are handled explicitly.

## 6. Notifications

### 6.1 How they are made and delivered

- Every notifiable change writes an `audit_events` row; a trigger turns it into one `notifications` row per person to tell, in the same transaction. Reminders and budget alerts are not changes, so their jobs write notifications directly, each with a key so none is sent twice.
- Push is a queue. While anything is due, pg_cron calls the `deliver-push` Edge Function every 10 seconds; it claims a batch, sends it through the Expo push service (FCM on Android), and reports the answer. Failed pushes are retried up to five times with growing delays; pushes older than a day are skipped; tokens of uninstalled apps are deleted.
- About 15 minutes after a push, the function checks Expo's receipt. An ok receipt is deleted; `DeviceNotRegistered` deletes the token; other errors are kept for 30 days and credential errors are logged for maintainers.
- Every notification type belongs to one push group (FR-01.3); a database test checks that each has one.

### 6.2 Where the red dots are

| About | Dot on | Cleared when the user opens |
|---|---|---|
| An expense | Its row in the dashboard feed | The expense |
| A dispute | The expense's row and the dispute's row on it | The dispute |
| A payment | The members icon, the Settlement entry, the person's line in the settlement, the payment's row | The payment |
| An offset or adjustment | The members icon, the Settlement entry, the person's line | The ledger with that person |
| A closed period | The members icon and the Settlement entry | The settlement screen |
| Members and requests to join | The members icon, with a count | The members screen (requests: the settings' Members tab) |
| A deposit | The members icon and the Deposit entry | The deposit |
| A debt simplification | The members icon, the Settlement entry and the Simplify debts entry | Simplify debts |
| Repeatable bills waiting | The admin's settings entry | The Repeatable expenses tab |
| The apartment, such as being let in | (opens there) | The dashboard |
| Anything in another apartment | The apartment switcher, with a count, and the apartment in My Apartments | (cleared as above, inside it) |
| An invitation back | The apartment switcher, with a count | My Apartments, where it is answered |

There is no list of past notifications; once read, a notification lives on in its record's history.

## 7. Offline use and live updates

- **The server is the only authority.** The phone keeps a copy of what the server said, never a second database.
- **Offline reading.** The data the user has loaded is saved on the phone, encrypted with a key in the device keychain, per user, for up to 7 days, and deleted at sign-out; a version tag discards a copy an update cannot read. Offline, screens show it with the time it was last updated; a screen never loaded shows an offline state. Signed photo links are not saved, so a photo shows "Available when online".
- **Writing needs a connection**, with one exception: adding an expense, which waits in the offline queue (FR-10.7). Every other action that writes is disabled offline, with the reason shown.
- **Live updates.** Every write another member, or the same user on another device, could see sends a change event, including changes made by scheduled jobs. An event names only the kind of record that changed, never ids, amounts or names. The app refetches through row-level security, refreshes everything on reconnect and when it returns to the foreground, and never polls. A database test fails if a function writes visible data without sending an event.

## 8. UX and design

- Expo Router with typed routes; TypeScript strict mode.
- HeroUI Native components and theme tokens for colour, spacing and typography; the app follows the device's light or dark setting.
- Every screen that loads or submits data has loading, empty, error and offline states, and avoids layout jumps.
- Each screen has one obvious main action. Input errors say how to fix them. Destructive actions ask for confirmation.
- Financial screens always show whether a figure is provisional, disputed or final.
- Screen-reader labels, sufficient contrast, adequate touch targets, and layouts that hold up with larger fonts.
- The dashboard stays light: the month's summary and feed, with deeper work on detail screens and sheets.
- The journeys through the app are described in [USER-FLOWS.md](USER-FLOWS.md).

## 9. Data model

All apartment-owned tables carry `apartment_id` and enforce row-level security; clients write financial and apartment data only through database functions. The tables, by area:

| Area | Tables |
|---|---|
| People | `profiles`, `receiving_accounts`, `receiving_account_shares`, `notification_mutes`, `push_tokens` |
| Apartments | `apartments`, `apartment_members`, `apartment_invites`, `join_requests`, `rejoin_invites`, `member_exits`, `member_exit_balances` |
| Expenses | `expense_categories`, `expenses`, `expense_revisions`, `expense_payers`, `expense_splits`, `expense_attachments`, `expense_templates` (quick-adds) |
| Ledger | `ledger_entries`, `payments`, `payment_attachments`, `offsets`, `adjustments`, `debt_transfers`, `debt_transfer_answers` |
| Disputes | `disputes`, `dispute_events`, `dispute_attachments`, `payment_disputes`, `payment_dispute_events` |
| Settlement | `settlement_periods`, `settlement_balances` |
| Repeatable | `recurring_templates`, `recurring_instances` |
| Shared living | `deposits`, `deposit_actions`, `deposit_entries`, `inventory_items`, `inventory_costs`, `rooms`, `room_occupancies` |
| Budgets | `budgets`, `budget_alerts` |
| History and notifications | `audit_events`, `notifications`, `push_tickets` |

Receipts, payment proofs, dispute evidence and profile photos are in private Storage buckets, read through signed links that expire.

## 10. Nonfunctional requirements

| Area | Requirement |
|---|---|
| Security | Row-level security on every table; authorization, money arithmetic and state changes decided in the database; the service-role key only in server-side code; rate-limited join codes; validated input at every boundary |
| Privacy | Receiving accounts private unless shared; payments private to their two people and admins; no names, amounts or account details in push text, logs or change events; invite addresses never stored |
| Reliability | Transactional financial writes; idempotent jobs and retries; backups with a tested restore before release |
| Accuracy | Integer minor units, deterministic rounding, conservation of every split and ledger entry |
| Performance | Paginated feeds and ledgers; indexes for the app's queries; responsive dashboard and add-expense on a mid-range Android phone |
| Offline | Readable offline, encrypted, deleted at sign-out; only adding expenses waits to be sent (section 7) |
| Freshness | Changes by others or by scheduled jobs appear on open screens within seconds, without polling |
| Accessibility | Screen-reader labels, font scaling, contrast, touch targets |
| Platforms | Android first; iOS from the same code |
| Open source | README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, `.env.example` files, migrations and tests; self-hosting with one's own Supabase project and EAS configuration |

## 11. Acceptance criteria

- **AC-01** A user creates two apartments and switches between them without records mixing.
- **AC-02** Two admins manage repeatable expenses; a member whose expense permission is off cannot add an expense, even by calling the API.
- **AC-03** Equal, percentage (50/25/25), fixed and excluded-member splits add up exactly.
- **AC-04** Several payers are credited correctly and pairwise nets reconcile.
- **AC-05** A fixed repeatable expense is charged exactly once per period; a changing one waits for an admin's amount.
- **AC-06** An expense is accepted by default; a dispute within the window holds it; no objection makes it final at the deadline.
- **AC-07** A recorded payment changes the provisional balance; the recipient's objection reverses it and opens a case.
- **AC-08** An unobjected payment becomes final as confirmed by app policy, never as bank-verified.
- **AC-09** Partial payments and netting cover the right obligations without double counting.
- **AC-10** A settlement day change applies to that apartment from the next period; unresolved dues carry forward; closed periods stay traceable.
- **AC-11** A removed or departed member cannot read current private data, while their past obligations stay auditable.
- **AC-12** Private accounts and attachments are unreadable to anyone not allowed.
- **AC-13** The app follows the device theme and uses the Expenses | Add | Profile bottom bar.
- **AC-14** A PDF statement includes the expense share, payments, what is owed each way, disputed and carried-forward amounts.
- **AC-15** A simplification changes nobody's net and applies only after all three people accept.
- **AC-16** An expense added offline is added exactly once after reconnecting, and never appears to others before that.

## 12. Delivery

| Phase | Scope | State |
|---|---|---|
| 0 Foundation | Repository, governance, Expo and HeroUI Native on Expo SDK 58, Supabase, migrations, RLS, CI, auth, tests | Done |
| 1 Financial MVP | Apartments, roles, joining, expenses, splits, payers, receipts, ledgers, accounts, payments, objection windows, disputes, settlement, exits, offline reading, live sync, notifications | Done |
| 2 Automation and reporting | Repeatable expenses, reminders and push preferences, push receipts, search and comparison, PDF statements, quick-adds, budgets, activity | Done |
| 3 Shared living | Deposits, inventory, rooms and room splits, offline expense queue, debt simplification | Done |
| 4 Release | Marketing website, privacy policy and terms, production environment (backups, restore, Realtime limits), error reporting and monitoring, quality pass (accessibility, performance), Android and iOS store releases, open-source launch | Open |

Before release, the hosted project also needs Google sign-in (an OAuth client) and the invite-email secrets.

## 13. Technical decisions

These shape the code and are summarized here; [ARCHITECTURE.md](ARCHITECTURE.md) explains how they fit together.

1. **One repository**, with `app/`, `supabase/`, `web/` and `docs/`. `app/` and `web/` are independent npm projects with their own lockfiles; there is no workspace until they need to share code. Rules for contributors and agents are in `AGENTS.md`.
2. **HeroUI Native 1.x on Expo SDK 58.** Its peer dependencies keep fixed majors (for example `tailwind-variants` 3), which Dependabot does not bump. From 1.1 its `BottomSheet` is a native sheet through `@lodev09/react-native-true-sheet` instead of `@gorhom/bottom-sheet`; the app opens sheets through its own `Sheet` wrapper, which keeps the open-and-close-by-state pattern.
3. **The ledger model** of section 5: immutable records, derived balances, server-side splitting.
4. **Event-driven sync** through private Realtime Broadcast messages that carry only a kind (section 7), chosen over polling, Postgres Changes or a local-first database, which would let writes skip the server's checks.
5. **Unread dots instead of an inbox** (section 6.2).
6. **Supabase Edge Functions** only where the database cannot do the work itself: push delivery and invite emails.
7. **Passwords** need at least 8 characters. Supabase's leaked-password protection (passwords found in known breaches are refused) needs the Pro plan, so it is off on the free plan and is to be turned on with the production upgrade; the app already explains that refusal.

## 14. Product decisions

All decided between 2026-11-13 and 2026-11-25.

1. **No explicit approval mode.** Every expense is accepted automatically, and affected members object within the window. An approval mode may be reconsidered after release.
2. **A dispute holds the whole expense** until resolved, so settlement never sees inconsistent totals. Other expenses stay payable.
3. **The payment objection window** starts when the payment is recorded.
4. **Late objections** open an adjustment case and never change closed history. The two members agree on the adjustment; if they cannot, a neutral admin decides.
5. **Only members can be owed.** A third-party bill becomes a debt to the member who pays it.
6. **Receiving accounts** are private, shared per apartment, masked until revealed; protected by encryption at rest and row-level security, with no extra column encryption.
7. **One currency per apartment**, PKR by default, no conversion.
8. **Visibility.** Every current member sees all of the apartment's expenses; a payment is visible to its two people and admins; a former member sees only the records they were part of.
9. **Settlement periods** run from the settlement day to the day before the next; 29 to 31 fall on the last day of short months; changes apply from the next period.
10. **Open-source licence:** MIT (decided 2026-11-25).
11. **Product name:** FlatMate, with the store identifiers (Android package and iOS bundle identifier) `dev.manaslatif.flatmate` (decided 2026-11-25).
12. **HeroUI Native 1.x** runs on Expo SDK 58.
13. **Joining needs an admin's approval**; the first admin to act decides.
14. **Repeatable expenses live in the apartment's settings**; Add (+) is for one-time expenses.
15. **No expense preview** on the add and edit forms.
16. **Naming a collector** only records who will pay and tells them; it creates no debt.
17. **Payments may name the account they went into**, keeping a snapshot of it.
18. **Repeatable bills are not categories.** New apartments do not start with rent, utilities or internet categories.
19. **One join code per apartment**, readable by admins, lasting until changed.
20. **Reminders and push preferences** as in FR-09.4 and FR-01.3: reminders go to whoever can act; preferences hold back only the push, for every apartment.
21. **Filters and comparison** as in FR-10.1.
22. **Statements and reports** as in FR-10.2, made on the phone; only admins export the apartment report, since payments between others are private.
23. **Quick-adds and budgets** as in FR-10.3.
24. **Activity history** as in FR-10.8: one timeline, each entry as private as its record.
25. **Security deposits** as in FR-10.4: shares linked to balances, admins only, the latest change undoable.
26. **Shared inventory** as in FR-10.5: ownership moves no money; costs are linked expenses; no buyout flow.
27. **Rooms and occupancy** as in FR-10.6: weight × days, equally within a room, worked out by the server and saved as a split by amount.
28. **Repeatable room splits** in advance or in arrears per expense; the job waits for an admin when days would be left out.
29. **Expenses added offline** are queued and sent by themselves on reconnect (FR-10.7), instead of drafts to review; only adding expenses can wait.
30. **Debt simplification** one agreed step at a time among three people (FR-06.4), from payable amounts, showing only the amount moved.

---

**Document control.** Keep this document true: change it in the same piece of work that changes behavior, and record new product decisions in section 14. Schema changes happen only through versioned migrations in `supabase/migrations/`.
