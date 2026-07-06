# ADR 0001: Record architecture decisions as ADRs

- **Status:** accepted
- **Date:** 2026-07-06
- **Deciders:** Laurie Calverley (owner), Claude (agent)

## Context

This project is explicitly designed to be maintainable by humans **and** AI agents. Both need the *why* behind decisions, not just the code. Decisions made in chat sessions are otherwise lost.

## Decision

We record every significant decision as an Architecture Decision Record in `docs/decisions/`, numbered sequentially, using this template:

```markdown
# ADR NNNN: Title

- **Status:** proposed | accepted | superseded by ADR-XXXX
- **Date:** YYYY-MM-DD
- **Deciders:** who

## Context
## Decision
## Consequences
```

## Consequences

- Any contributor (human or agent) can reconstruct the project's reasoning from the repo alone.
- Superseded decisions are never deleted, only marked superseded.
