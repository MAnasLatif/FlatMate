# FlatMate — Software Requirements Specification (SRS)

**Version:** 1.1  
**Date:** 2026-11-13  
**Status:** Baseline for implementation. Product decisions are recorded in section 12; the few still open are marked there.  
**Product:** Open-source shared-flat expense management application  
**Platforms:** Android first, iOS supported from the same codebase  
**Stack:** Expo, React Native, TypeScript, HeroUI Native, Expo Router, Supabase (Auth, PostgreSQL, Storage, Edge Functions), Expo Notifications

> **Purpose:** This document is intended to be placed in the root of the repository as `SRS.md`. It captures requirements discussed for FlatMate and distinguishes confirmed behavior from proposed implementation choices. App name/store/trademark availability, HeroUI Native version/API compatibility, and provider deep-link capabilities must be verified before release.

## 1. Vision and Scope

FlatMate helps roommates, students, friends, and other shared-living groups record shared costs, divide expenses fairly, track who owes whom, resolve disagreements, and settle balances. A user may belong to multiple independent apartments. The application is open-source and self-hostable/customizable by developers while an official mobile app may be distributed through Google Play and Apple App Store.

### 1.1 Product principles
- Apartment-isolated data and settings.
- Every financial movement is explainable and auditable.
- Expense acceptance is automatic by default; objections create disputes.
- Recording a payment is **not** verification of an external bank transfer.
- Support flexible expense splits, multiple payers, partial payments, and net settlement.
- Keep recurring expense generation, notification delivery, and settlement processing idempotent.
- User-facing terminology should distinguish *you owe*, *you are owed*, *net balance*, *pending*, *disputed*, and *finalized*.

### 1.2 Out of scope for initial release
- Custody or movement of money, bank account access, and regulated payment processing.
- Automatic verification of bank/wallet transfers without an authorized provider integration.
- A landlord/property-management SaaS with leases, tenant screening, or rent collection infrastructure.

## 2. Actors and Permissions

| Actor | Capabilities |
|---|---|
| Guest | Sign up, log in, recover account |
| Member | Join/leave apartment, view permitted apartment data, add one-time expenses by default, manage own profile/accounts, record payments, raise disputes, review balances, use reports |
| Admin | All member capabilities plus invite/remove members, appoint other admins, configure apartment, create/manage recurring expenses, control member expense-creation permission, review settlements/disputes |
| System | Schedule reminders, instantiate fixed recurring charges, prompt for variable amounts, calculate balances, finalize time-window states, generate reports |

**Permission rules:** Multiple admins are allowed. One-time expense creation is enabled for members unless an admin revokes it. Only admins may create/manage recurring expense templates and their monthly variable instances. A user may be a member of multiple apartments with a different role in each. An apartment must retain at least one admin; transfer admin rights before the last admin leaves. All sensitive actions must be authorized in the database, not only hidden in the UI.

## 3. Navigation and Screen Inventory

### 3.1 First-time and returning users
1. Splash/session check.
2. Unauthenticated: Login / Sign Up via email/password or Google (Supabase Auth); password recovery and verification as appropriate.
3. Authenticated: **My Apartments** list of joined flats; `New Apartment` action.
4. New Apartment screen: `Join by Code` (code input, Join) and `Create Apartment` (create flow).
5. Create: apartment name, optional location and visibility, settlement day, default approval window (7 days), reminders, other settings; creator becomes admin.
6. Select an apartment to enter its dashboard. The user can switch apartments from the top-bar apartment-name dropdown.
7. Subsequent launches: show apartment list/selector as agreed, not a forced auto-entry to one apartment.

### 3.2 Apartment dashboard
- Top bar: apartment name + dropdown on one side; members icon and notification entry on the other. Location subtitle is optional and admin-controlled.
- Summary: `You'll Receive`, `You Owe`, `Net Balance`, and the user's share of expenses for the selected month.
- Expense feed with month selector, search/filter, status indicators, and detail navigation.
- Bottom navigation **left Profile | center Add (+) | right Expenses List**. The apartment dashboard/list is the main content area.
- Member icon opens member directory; tapping a member opens a pairwise ledger.
- Admin apartment settings accessible through a gear on an apartment in the selector and/or an appropriate admin entry.
- Follow device light/dark appearance automatically.

### 3.3 Required screens / views
- Authentication, account recovery, profile edit.
- My Apartments; join/create; apartment setup; apartment switcher.
- Dashboard/expense list; expense detail; add/edit expense; split editor; payer editor; receipt viewer.
- Members list; member detail/pairwise ledger; payment account details.
- Pay flow; payment detail; proof submission; payment objection/dispute.
- Expense objection/change request; dispute detail; resolution/adjustment.
- Recurring templates; fixed schedule; variable-bill prompt and amount entry.
- Settlement overview, preview, payment allocation, settlement history, carry-forward.
- Notifications/inbox; reminders; reports and PDF export.
- Admin settings: members, roles, permissions, invites, dates, categories, budgets, visibility, approval rules.
- Optional advanced: security deposits, shared inventory, room occupancy/splits, offline drafts.

## 4. Functional Requirements

### FR-01 Authentication and Profiles
- FR-01.1 Email/password signup/login and Google OAuth; session persistence and sign-out.
- FR-01.2 Profile name, optional photo, account identity, notification preferences.
- FR-01.3 Each user may register multiple **receiving** accounts (bank name/provider, account title, account number/IBAN or wallet identifier, preferred flag, visibility). Copy details when authorized. Never request banking passwords, PINs or OTPs.
- FR-01.4 Account visibility defaults to private; only explicitly shared receiving accounts are visible to other eligible apartment members.

### FR-02 Apartment Lifecycle
- FR-02.1 Create apartment with unique identifier and join code; creator becomes admin.
- FR-02.2 Join with valid code; invalid/revoked/expired codes fail safely. Admin can rotate/revoke codes.
- FR-02.3 Multiple memberships per user; all apartment balances and settings remain isolated.
- FR-02.4 Member may leave; admin may remove member. Historical transactions remain immutable/auditable; outstanding dues and disputes remain attached to the former member.
- FR-02.5 Track join/leave effective dates. Do not automatically include a member in expenses outside their eligible occupancy interval; explicit overrides require permission and history.
- FR-02.6 Admin may promote/demote admins and configure expense-creation rights.

### FR-03 One-Time Expenses
- FR-03.1 Eligible member creates expense with title, category, amount, currency, expense date, optional description, optional receipt/image.
- FR-03.2 Indicate whether already paid or payable later. For unpaid obligations allow optional due date and designated recipient/payment account. A due date is optional for every expense.
- FR-03.3 Support **one or more payers**, each with a contributed amount. Contributions must sum to the total paid amount. Unpaid portions must be explicitly represented.
- FR-03.4 Split among selected apartment members: equal, percentage, or custom fixed amounts; exclude members. Validate sum of percentages = 100% and sum of fixed allocations = total, using deterministic rounding.
- FR-03.5 Preview payer contributions, individual shares, and resulting pairwise balances before save.
- FR-03.6 Expense details display receipt, split, payer(s), payment state, due date, status, audit trail, and actions according to role.
- FR-03.7 Edits to financially posted expenses must be versioned; settled historical records are corrected with explicit adjustment/reversal, not silent overwrite.
- FR-03.8 Optional apartment-level approval requirement can be configured for specific scenarios; otherwise expenses are auto-accepted on save. *Deferred beyond the MVP (section 12, item 1).*

### FR-04 Recurring Expenses
- FR-04.1 Admin-only recurring template management; multiple admins may act.
- FR-04.2 Fixed: predetermined amount and recurrence schedule (e.g. monthly rent), automatically instantiate once per cycle.
- FR-04.3 Variable: expected monthly arrival day (e.g. electricity on the 5th); notify admins to enter actual amount, optional proof and due date. Do not create a financial charge with an invented amount.
- FR-04.4 Each template has independent split rules, included/excluded members, and optional percentage/custom allocations; admins can override splits for one generated month without rewriting the template.
- FR-04.5 Changes to recurring templates apply prospectively by default; historical instances remain unchanged.
- FR-04.6 Prevent duplicate instances for the same template and billing period.

### FR-05 Expense Acceptance and Disputes
- FR-05.1 **Default: auto-accepted immediately**, visible in balances and to all affected members. No mandatory Accept click.
- FR-05.2 Affected member can `Decline` with mandatory reason, or `Request Adjustment` with proposed share and explanation.
- FR-05.3 Notify expense creator. Creator may accept a proposed change (recalculate and record adjustment) or reject it (create unresolved settlement case).
- FR-05.4 Only the disputed portion should be held from final settlement where mathematically feasible; when split redistribution affects all shares, hold the impacted allocation set. Uncontested obligations remain payable. *Decided: a dispute holds every share of the disputed expense (section 12, item 2).*
- FR-05.5 Configurable dispute/approval window, default **7 days**. If no objection, the provisional acceptance becomes final at the end of the window. An objection filed within the window pauses finalization for affected shares.
- FR-05.6 Late objections after finalization may create a new adjustment case, not mutate a closed historical settlement.
- FR-05.7 Every dispute includes initiator, reason, proposed value, evidence, state, responses, timestamps, and resolution history.

### FR-06 Balances and Member Ledgers
- FR-06.1 Show user-specific apartment totals: payable, receivable, net, and monthly expense share.
- FR-06.2 Members directory shows, **relative to current viewer**, amounts viewer owes each member, amounts each owes viewer, and net.
- FR-06.3 Tapping a member opens all relevant shared expenses, payments, outstanding dues, disputes, and explicitly shared receiving accounts.
- FR-06.4 Show gross pairwise dues and **net-off** option; present exactly which obligations will be offset. Do not double-count an expense or a settlement.
- FR-06.5 Offer debt simplification suggestions across a group to reduce transfer count; require explicit settlement allocation and preserve the underlying ledger/audit history. Do not silently reassign creditors.
- FR-06.6 Monetary values use integer minor units (e.g. paisa) or exact numeric arithmetic, never binary floats; apply stable rounding rules.

### FR-07 Payment Recording and Objections
- FR-07.1 Start payment from a specific expense or a member ledger, for gross dues or a net amount after eligible offsets.
- FR-07.2 Display only receiving accounts explicitly shared by the recipient; allow copy and optional external app/deep link when supported. The user performs the actual transfer outside FlatMate.
- FR-07.3 User marks paid with amount, time, optional transaction reference, and optional proof; partial payments are supported.
- FR-07.4 On marking paid, set `provisionally_confirmed` and immediately adjust **provisional** displayed balances. Notify recipient.
- FR-07.5 Recipient may decline within default 7 days, with mandatory reason (e.g. not received). Mark payment `disputed`; reverse the provisional credit in outstanding balance while preserving the original evidence and transaction history.
- FR-07.6 No objection by deadline: finalize as `confirmed_by_app_policy` (not bank-verified). Late objections become separate adjustment cases.
- FR-07.7 Prevent duplicate payment submissions, including retries/offline sync; store idempotency keys.
- FR-07.8 Distinguish `recorded`, `provisional`, `disputed`, and `final` clearly in UI. Admin review cannot certify a bank transfer.

### FR-08 Settlement and Monthly Close
- FR-08.1 Each apartment configures its own monthly settlement day, editable by admins.
- FR-08.2 On settlement day, calculate balances from expenses, payer contributions, payments, offsets and adjustments; exclude/hold unresolved disputed portions.
- FR-08.3 Provide settlement preview with detailed source obligations and available gross/net choices.
- FR-08.4 Support full and partial settlement, receiver objections, settlement case review, and carry-forward of unpaid balances to the next cycle.
- FR-08.5 Do **not** zero balances merely because the date passed. Finalize only reconciled obligations; unresolved balances carry forward.
- FR-08.6 Closed periods remain auditable; corrections use linked adjustment entries.

### FR-09 Notifications
- FR-09.1 Notify for expense creation/edits, variable bill prompts, due dates, payment marked, payment decline, disputes, invitations, membership changes and settlement summaries.
- FR-09.2 Configurable reminder schedule and user notification preferences; avoid excessive duplicate reminders.
- FR-09.3 Notifications open the corresponding in-app record; permissions are checked again on open.
- FR-09.4 Scheduled jobs must be timezone-aware per apartment and retry-safe.

### FR-10 Reports, Convenience and Advanced Shared Living
- FR-10.1 Search/filter expenses by month, member, category, amount and status; compare monthly spending.
- FR-10.2 Export monthly per-user statements and apartment reports to PDF with gross, net, outstanding and disputed breakdowns.
- FR-10.3 Quick-add templates for common expenses and budget caps/alerts.
- FR-10.4 Track security deposits and refund/exit adjustments.
- FR-10.5 Optional shared inventory, ownership and maintenance costs.
- FR-10.6 Optional room-based allocations and occupancy-driven splits.
- FR-10.7 Offline expense **drafts** with explicit review and idempotent submission on reconnect; do not imply a payment is final while offline.
- FR-10.8 Activity history shows who created/edited/approved/disputed/settled each record.

## 5. Core Business Rules and Examples

### 5.1 Example: three roommates
Members: Anas, Zubair, Ajmal.
- Anas pays Rs 200 cleaning, split equally. Each share = Rs 66.67 / 66.67 / 66.66 according to deterministic rounding; Zubair and Ajmal owe Anas their shares.
- Ajmal pays Rs 1,000 for a shared item, split equally. Each share = Rs 333.34 / 333.33 / 333.33 according to deterministic rounding.
- Netting Anas↔Ajmal must offset their reciprocal obligations without changing who funded each original expense. Zubair's obligations to both are shown separately unless an explicit group simplification is applied.
- A 50% / 25% / 25% split must be supported and produce exact total allocations.

### 5.2 Financial accounting model
- **Expense** is the purchase/obligation record.
- **Payer contribution** identifies who funded it (possibly multiple people).
- **Split allocation** identifies who owes what share.
- **Payment** records a claimed transfer against one or more obligations.
- **Dispute** challenges an allocation or claimed payment.
- **Adjustment/settlement entry** records offsets, corrections and reconciliations.
- Never equate expense creation with proof of actual bank transfer.
- Distinguish a payable vendor bill from a roommate-to-roommate reimbursement; unpaid bills should not automatically create a fictitious payer credit.

### 5.3 Status models
**Expense:** draft → posted/auto_accepted → (disputed allocation or adjustment requested) → resolved/finalized.  
**Payment:** recorded → provisionally_confirmed → confirmed_by_app_policy OR disputed → resolved/adjusted.  
**Settlement:** preview → open → partially_settled / disputed → closed; remaining balances carry forward.

## 6. Supabase Data Architecture (Proposed)

Use Supabase Auth `auth.users` for identity and `public.profiles` for app profile. All apartment-owned tables include `apartment_id` and enforce RLS membership/role checks.

| Table | Main fields / responsibility |
|---|---|
| `profiles` | `id` (auth user FK), display_name, avatar_path, created_at |
| `receiving_accounts` | id, user_id, provider, title, account_identifier (protected), preferred, visibility |
| `apartments` | id, name, location_optional, show_location, timezone, settlement_day, approval_days, creator_id |
| `apartment_members` | id, apartment_id, user_id, role, can_add_expense, joined_at, left_at, status |
| `apartment_invites` | id, apartment_id, code_hash, expires_at, revoked_at, created_by |
| `expense_categories` | id, apartment_id, name, archived_at |
| `expenses` | id, apartment_id, title, amount_minor, currency, expense_date, paid_status, due_date, description, created_by, status, recurring_instance_id |
| `expense_payers` | id, expense_id, payer_user_id, amount_minor |
| `expense_splits` | id, expense_id, member_user_id, amount_minor, split_rule_snapshot, status |
| `expense_attachments` | id, expense_id, storage_path, uploaded_by, type |
| `recurring_templates` | id, apartment_id, title, fixed_or_variable, amount_minor_nullable, schedule, expected_bill_day, enabled, created_by |
| `recurring_split_rules` | id, template_id, member_user_id, allocation_type, allocation_value, excluded |
| `recurring_instances` | id, template_id, billing_period, expense_id_nullable, state, UNIQUE(template_id,billing_period) |
| `payments` | id, apartment_id, sender_user_id, recipient_user_id, amount_minor, currency, reference, proof_path, status, idempotency_key, recorded_at, final_after |
| `payment_allocations` | id, payment_id, obligation_reference, allocated_amount_minor |
| `disputes` | id, apartment_id, subject_type, subject_id, raised_by, reason, proposed_amount_minor_nullable, state, created_at, resolved_at |
| `dispute_events` | id, dispute_id, actor_id, action, payload, created_at |
| `ledger_entries` | id, apartment_id, source_type, source_id, debtor_user_id, creditor_user_id, amount_minor, state, posted_at, reversal_of_nullable |
| `settlement_cycles` | id, apartment_id, period_start, period_end, settlement_date, status |
| `settlement_actions` | id, cycle_id, actor_id, type, amount_minor, references, created_at |
| `notifications` | id, user_id, apartment_id_nullable, type, record_ref, read_at, created_at |
| `audit_events` | id, apartment_id, actor_id, entity_type, entity_id, action, before_after_metadata, created_at |
| `budgets` | id, apartment_id, category_id_nullable, period, limit_minor |
| `deposits` | id, apartment_id, member_user_id, amount_minor, paid_at, refunded_minor, status |
| `inventory_items` | id, apartment_id, name, owner_type, purchase_reference, condition, status |
| `rooms` / `room_members` | room metadata and occupancy dates for advanced splitting |

**Implementation notes:**
- Design a normalized obligation/ledger model and use **transactional Postgres functions** (RPC) for financial postings, reversals, settlements and dispute resolution. A naive mutable `balance` column is insufficient.
- Use CHECK constraints for positive amounts, valid states, and split consistency enforced within transactions; use unique indexes for membership and idempotency.
- Monetary rounding and allocation sum validation must happen on the server.
- Use Supabase Storage private buckets with signed URLs and membership authorization for receipts and proofs.
- Never expose service-role credentials in the Expo client; use Edge Functions/RPC with server-side authorization where necessary.
- Implement RLS for apartment-scoped tables, plus strict per-user policies for receiving accounts and notification inboxes. Historical member access after leaving needs a deliberate privacy policy.
- Prefer a dedicated apartment timezone, e.g. `Asia/Karachi`, and define settlement-day handling for short months (e.g. day 31 → last day).
- Use scheduled functions/cron for recurring instances, 7-day windows and reminders, and Expo push tokens for notifications.

## 7. UX and Design Requirements
- Expo Router with typed routes; TypeScript strict mode.
- HeroUI Native components and theming, **subject to verification of exact installed version and React Native/Expo compatibility**.
- Follow OS light/dark theme; accessible text contrast and touch targets.
- English initial UI copy; architecture should support localization later.
- Strong empty/loading/error/offline states; confirmation before destructive admin actions.
- Financial detail screens must show whether balances are provisional, final or disputed.
- Avoid overwhelming dashboard: default to monthly summary and expense list; deeper workflows open detail screens/bottom sheets.

## 8. Nonfunctional Requirements

| Area | Requirement |
|---|---|
| Security | RLS, secure session/token storage, least privilege, audit trails, private attachments, input validation, rate limiting on join codes |
| Privacy | Consent-based sharing of payment details; avoid exposing account identifiers in public logs, analytics, or notifications |
| Reliability | Transactional financial updates, idempotent jobs, retries without duplicates, backup/restore plan |
| Accuracy | Exact minor-unit arithmetic, deterministic split rounding, conservation of allocations and ledger entries |
| Performance | Paginated expense feeds; indexed apartment/member/date lookups; responsive mobile navigation |
| Accessibility | Screen-reader labels, dynamic font sizes where feasible, sufficient contrast |
| Cross-platform | Android initial launch; iOS-ready implementation and device testing |
| Open source | README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY.md, .env.example, migration/seed scripts, test instructions |
| Deployability | Clear instructions for using own Supabase project and Expo/EAS configuration |

## 9. Primary End-to-End User Flows

1. **New user:** launch → sign up/login → apartment selector → create/join → dashboard.
2. **Returning multi-flat user:** launch → apartment list → select flat → switch via top bar.
3. **One-time expense:** Add → details/payers → split/exclusions → preview → save → notify → ledger.
4. **Fixed recurring:** admin config → schedule → monthly instance → apply saved split → notify.
5. **Variable recurring:** admin config expected day → reminder → enter actual amount/proof/due date → create instance → notify.
6. **Expense objection:** auto-accepted → member declines/requests change → creator approves or rejects → adjustment or settlement case.
7. **Pairwise ledger:** members icon → select person → gross payable/receivable/net → inspect expenses/payments/disputes.
8. **Payment:** expense/member ledger → choose gross/net and amount → copy recipient account → external transfer → mark paid → provisional credit → receiver objection or 7-day finalization.
9. **Monthly settlement:** configured date → preview net balances → exclude disputed allocations → pay/partial/carry forward → close reconciled items.
10. **Membership exit:** member leaves or admin removes → effective date → final balance/exit settlement → retain financial history.
11. **Reports:** filter by month/category/member → compare totals → export statement.
12. **Admin operations:** members/permissions/invites → recurring settings → settlement and approval windows → audit events.

## 10. Acceptance Criteria (Minimum)

- AC-01: A user can create two apartments and switch between them without mixing financial records.
- AC-02: Two admins can manage recurring templates; a restricted member cannot add an expense or bypass this restriction via API.
- AC-03: Equal, percentage (50/25/25), fixed amount and excluded-member splits sum exactly to the expense amount.
- AC-04: Multiple payers' contributions are attributed correctly and pairwise net balances reconcile.
- AC-05: A fixed recurring expense is generated exactly once per billing period; a variable one waits for admin-entered amount.
- AC-06: Expense is accepted by default, and a dispute within 7 days holds the impacted amount; no objection finalizes at the deadline.
- AC-07: Payment marked paid changes provisional balance; recipient decline reverses that provisional credit and opens a case.
- AC-08: No objection to a recorded payment within 7 days finalizes app-policy confirmation without claiming bank verification.
- AC-09: Partial payment and gross/net payment modes allocate against the correct obligations without double-counting.
- AC-10: Settlement date changes apply to the apartment only; unresolved dues carry forward; historical close remains traceable.
- AC-11: Removed/leaving member cannot access current private apartment data but historical obligations remain auditable under defined access rules.
- AC-12: Private bank accounts and attachments are inaccessible to unauthorized users.
- AC-13: UI follows device theme and uses Profile | Add | Expenses bottom-navigation order.
- AC-14: PDF statement includes monthly expense share, payments, receivables, payables, disputed and carry-forward amounts.

## 11. Recommended Delivery Phases

**Phase 0 — Foundation:** Repo, open-source governance, Expo + HeroUI Native verification, Supabase project, migrations, RLS, CI, auth, testing baseline.

**Phase 1 — Financial MVP:** Apartment lifecycle/multi-flat, roles, one-time expenses, equal/custom/percentage splits, multiple payers, receipt uploads, member ledger, gross/net balances, account sharing, payment recording, 7-day objection windows, dispute handling, settlement/carry-forward.

**Phase 2 — Automation & Reporting:** Fixed/variable recurring expenses, reminders, monthly reports/PDF, quick-add, filters, budgets, audit timeline, configurable settings.

**Phase 3 — Shared-Living Extensions:** Deposits, inventory, room-based allocations, offline drafts, advanced settlement simplification and analytics.

**Phase 4 — Release:** Android QA/store publication, iOS QA/store publication, privacy policy, store disclosures, documentation and open-source contribution workflow.

## 12. Product Decisions

Items 1–9 and 12 were decided on 2026-11-13. Items 10 and 11 are still open, and part of item 6.

1. **Explicit approval mode — decided.** Not part of the MVP. Every expense is accepted automatically, and affected members object within the window (FR-05). An optional approval mode (FR-03.8) may be reconsidered after release.
2. **What a dispute holds — decided.** A dispute holds every share of the disputed expense until it is resolved, so settlement never sees inconsistent totals. Other expenses stay payable.
3. **Payment objection window — decided.** The 7-day window starts when the payment is recorded, with reliable notification retries.
4. **Objections after the deadline — decided.** They open an adjustment case and never change closed history. The two members involved agree on the adjustment; if they cannot, an admin of the apartment decides.
5. **Who can be owed — decided.** Only apartment members can be creditors. A bill owed to a third party, such as a landlord or utility, becomes a debt to the member who pays it. Until a member pays it, it has no creditor and creates no reimbursement.
6. **Receiving accounts — decided.** One table holds bank and wallet accounts. Accounts are private by default; the owner shares each one with specific apartments, and only current members of those apartments can see it. Account numbers are shown masked until revealed. For the MVP they rely on the platform's encryption at rest and row-level security; no extra column encryption.
7. **Currency — decided.** One currency per apartment, PKR by default. No multi-currency apartments and no conversion.
8. **Member visibility — decided.** Every current member sees all of the apartment's expenses. A payment is visible to its payer, its recipient and the apartment's admins. A former member sees only the records they were part of.
9. **Settlement period — decided.** A period runs from the settlement day to the day before the next settlement day. A settlement day of 29, 30 or 31 falls on the last day of shorter months. A change to the settlement day takes effect from the next period.
10. **Open-source license — open.** The repository currently uses MIT; MIT or Apache-2.0 remain the options. Decide before the open-source launch.
11. **Product name — open in part.** The store identifiers are `com.manaslatif.flatmate` on Android and iOS. Trademark, store-name and domain checks for "FlatMate" are still to be done before publication.
12. **HeroUI Native version — decided.** HeroUI Native 1.x runs on Expo SDK 58. See decision record 0002 in `docs/decisions/`.


## 13. Suggested First Implementation Tasks

1. Initialize Expo + TypeScript + Expo Router and validate HeroUI Native on a real Android device.
2. Set up Supabase migrations, local development, typed client, and secure authentication.
3. Implement profiles, apartments, membership, invites, and RLS tests.
4. Define ledger invariants and build **unit tests first** for equal/percentage/custom splits, multi-payer reimbursement, netting, rounding and reversals.
5. Implement expense create/detail and immutable posting functions.
6. Implement member directory and pairwise balances.
7. Implement payment recording, objections, timers, and audit trails.
8. Implement settlement preview and carry-forward.
9. Add recurring templates, scheduled jobs, notifications, reports and advanced modules.

---

**Document control:** Requirements reflect the product discussion as of 2026-11-12, with the decisions in section 12 recorded on 2026-11-13. Sections marked proposed or requiring confirmation are not settled technical contracts. Keep schema changes in versioned migrations and update this SRS when decisions change.
