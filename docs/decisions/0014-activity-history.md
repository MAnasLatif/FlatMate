# 0014. Activity history

- **Status:** Accepted
- **Date:** 2026-11-24

## Context

FR-10.8 asks for an activity history showing who created, edited, approved, disputed and settled each record. Every change already writes an `audit_events` row, and expenses, payments and disputes already show their own history on their screens. Every current member could read every audit row, including those about payments between two other people, which decision 8 keeps private. The owner decided the rest on 2026-11-24.

## Decision

**One timeline per apartment.** An Activity screen, opened from the members screen, lists the apartment's audit trail newest first, paged by id. Each entry is a sentence naming who did it and what it was about ("Zubair recorded a payment of Rs 100.00 to Anas") and opens its record. The per-record histories stay as they are.

**Entries are as private as their records.** The audit trail's read policy now checks the record behind each entry. Payments, netting and adjustments show only to their two people and to admins, because those tables' own policies decide it. Join codes, requests to join, invitations back and repeatable expenses show only to admins, who manage them. Everything else (expenses and their disputes, members, settings, closed periods) shows to every current member. Former members have no timeline; they keep the histories of records they were part of.

**Filters.** By type (expenses, disputes, payments and settling up, members, settings) and by who did it. The database maps each entry to a type in `private.activity_group`.

## Alternatives considered

- **History sections on every remaining record.** Fills gaps record by record, but gives no view of what happened across the apartment.
- **Admins only.** Simpler, but members are the ones checking what changed in shared costs.
- **Everyone sees everything, without amounts.** Still tells others who paid whom, which decision 8 keeps between the two people and the admins.

## Consequences

- `get_activity` runs as the caller, so the policy decides what each person sees; it adds each entry's record name, amount and people where the caller can read them.
- A new audit entity type is visible to every current member unless it is added to the policy. Anything private must be listed there when it is introduced.
- Entries name records by their current title; an expense renamed later shows its new name in older entries.
- Every change event also refreshes the timeline's cache.
