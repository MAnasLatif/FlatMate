# Decision records

This folder holds architecture decision records (ADRs): short documents that capture a significant choice, the context it was made in, and its consequences. They explain why the project is the way it is, so the reasoning does not have to be rediscovered later.

## When to write one

Write a record when a decision is hard to reverse, affects more than one part of the system, or is likely to be questioned later. Examples: choosing a state management approach, changing the ledger model, adding a new service or a major dependency, or settling one of the open items in [SRS section 12](../SRS.md#12-decisions-requiring-confirmation-before-coding).

Routine implementation choices do not need one.

## How to write one

1. Copy [0000-template.md](0000-template.md) to a new file with the next number and a short name, for example `0002-ledger-entry-model.md`.
2. Fill it in. Keep it to about a page.
3. Add it to the index below in the same pull request.

Records are not edited after they are accepted, apart from their status. To change a decision, write a new record and mark the old one as superseded.

## Index

| No. | Decision | Status |
|---|---|---|
| [0001](0001-repository-structure.md) | Repository structure | Accepted |
