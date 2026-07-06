# ADR 0004: Name and brand — Hardcopy

- **Status:** accepted
- **Date:** 2026-07-06
- **Deciders:** Laurie Calverley (owner)

## Context

CLAUDE is a registered US trademark of Anthropic, PBC (Reg. #7645254), and Anthropic's trademark guidelines require prior written approval for uses implying sponsorship or affiliation — with no published "X for Claude" safe-harbor. Anthropic actively enforces (it forced the rename of "Clawdbot" for mere phonetic closeness). Store policies compound this: Chrome Web Store prohibits implying authorization/endorsement, AMO's accepted community pattern is nominative "*Name* for *Mark*", and Apple's App Review (guideline 5.2) routinely demands proof of authorization when a third-party trademark leads an app name.

The naming research ([naming, branding & store requirements](../research/2026-07-06-naming-branding-stores.md)) evaluated candidates for brandability and collisions. **Hardcopy** had the cleanest collision profile (no extension, product, or notable repo using it) and is on-theme: turning ephemeral chats into permanent documents.

## Decision

The project is named **Hardcopy**.

Branding rules, binding for all listings, docs, and code:

1. **Brand first, descriptor second.** "Claude" appears only as a nominative descriptor after the brand, e.g. "Hardcopy — export chats from Claude to Markdown, PDF & Word". Never "Claude Hardcopy" or any form where "Claude" leads. For the Apple submission, keep "Claude" out of the app *name* entirely (subtitle/description only).
2. **"claude"-free identifiers.** The repo slug, package names, bundle IDs, and any domains contain no "claude" (repo: `hardcopy-extension`).
3. **Explicit non-affiliation disclaimer**, verbatim, in the README and every store listing:

   > Hardcopy is an independent open-source project, not affiliated with, endorsed by, or sponsored by Anthropic. Claude is a trademark of Anthropic, PBC.

4. **No Anthropic branding.** Never use Anthropic's logo, starburst, colours, or visual identity in the icon, screenshots, or promo assets.

## Consequences

- Trademark exposure is limited to defensible nominative use; a rename demand would at most affect listing descriptors, not the brand or slugs.
- Store SEO for "claude" relies on descriptions/subtitles rather than the name — a deliberate trade of discoverability for safety.
- The disclaimer sentence above is canonical: copy it verbatim, don't paraphrase.
