# FlatMate documentation

All project documentation lives in this folder.

| Document | What it covers |
|---|---|
| [SRS.md](SRS.md) | Software Requirements Specification: what the product must do, the proposed data model, acceptance criteria, delivery phases and open decisions. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How the app, backend and website fit together, and where each responsibility lives. |
| [decisions/](decisions/) | Architecture decision records: significant choices and the reasons behind them. |

Related documents in the repository root: [README](../README.md), [AGENTS.md](../AGENTS.md), [CONTRIBUTING](../CONTRIBUTING.md) and [SECURITY](../SECURITY.md).

## Keeping documentation useful

- Update a document in the same change that makes it out of date.
- When a product decision in section 12 of the SRS is settled, update the SRS and add a decision record if the choice affects the architecture.
- Add new guides here (for example local development, deployment and rollback, or the ledger model) when there is real content for them. Do not add empty placeholders.
- Keep documents short and specific. Explain decisions and rules that are not obvious, and do not repeat what the code already shows.
