# ADR 0005: MIT license

- **Status:** accepted
- **Date:** 2026-07-06
- **Deciders:** Laurie Calverley (owner)

## Context

The project needs a permissive license (README principle 4: "IP-clean and permissively licensed"). The licensing research ([naming, branding & store requirements](../research/2026-07-06-naming-branding-stores.md) §5) narrowed the choice to MIT vs Apache-2.0, and ruled out copyleft: GPL conflicts with App Store distribution terms (the VLC precedent), and Safari/App Store is a target (ADR 0003).

Apache-2.0's advantages over MIT are an explicit patent grant and an explicit no-trademark-rights clause (§6). This project has no novel patentable methods, and its real IP exposure is the Anthropic trademark — which is addressed by the disclaimer and branding rules in ADR 0004, not by the code license.

## Decision

The project is licensed under the **MIT License** (see `LICENSE`, copyright 2026 Laurie Calverley).

- Not GPL/copyleft: incompatible with App Store distribution.
- Not Apache-2.0: its extra clauses buy little here; MIT is shorter, universally understood, matches the main open-source incumbent, and maximizes contribution and adoption.
- Trademark hygiene lives in the ADR 0004 disclaimer and branding rules, not in the license.

## Consequences

- All bundled runtime dependencies must be MIT-compatible permissive licenses (the chosen format libraries already are — see ADR 0006).
- No NOTICE-file handling or per-file headers required; contributors face minimal friction.
- No explicit patent grant — an accepted risk for a DOM/API-parsing extension.
