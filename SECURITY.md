# Security Policy

## Supported versions

Hardcopy is pre-release. Until v1.0 ships, only the `main` branch is supported: security fixes land on `main` and there are no maintained release branches. Once versioned releases exist, this table will list them; the intent is to support the latest published store version.

| Version | Supported |
| --- | --- |
| `main` (pre-release) | Yes |

## Reporting a vulnerability

Please report vulnerabilities **privately** — do not open a public issue.

1. **Preferred:** GitHub private vulnerability reporting — use ["Report a vulnerability"](https://github.com/birax/hardcopy-extension/security/advisories/new) on this repository's Security tab.
2. **Fallback:** email **laurie@calverley.me.uk** with a description, reproduction steps, and impact assessment.

### What to expect

- **Acknowledgement within 7 days** of your report.
- A triage assessment (accepted / needs more info / out of scope) and, for accepted reports, a remediation plan within 14 days.
- Credit in the fix's release notes if you would like it (tell us how you'd like to be credited).

Please give us a reasonable window to fix an accepted issue before public disclosure; we will keep you informed of progress.

## Scope notes

Some context that helps target reports well:

- **Hardcopy never handles credentials.** The extension has no accounts, secrets, or tokens of its own. It relies entirely on the browser's existing claude.ai session: requests are made with `credentials: 'include'` and the browser attaches session cookies automatically. The extension **never reads, stores, or transmits cookies or any other credential** — it has no `cookies` permission.
- **All processing is local.** There is no server component. The only network host the extension can contact is `https://claude.ai/*` (its sole host permission). Anything that would cause the extension to contact another host, execute remote code, or exfiltrate conversation content is a serious vulnerability — please report it.
- **Injection into exports is in scope.** Conversation content is untrusted input. A crafted conversation that produces a malicious export file (e.g. via RTF control words, Markdown/HTML injection, or PDF string escapes) or that achieves script execution in the extension's UI is exactly the kind of bug we want to hear about. See the [threat model](docs/security/threat-model.md).
- **Out of scope:** vulnerabilities in claude.ai itself (report those to [Anthropic](https://www.anthropic.com/responsible-disclosure-policy)), issues requiring an already-compromised browser or machine, and what users do with exported files after they are saved.

## Permissions rationale

The extension requests only `host_permissions: ["https://claude.ai/*"]`, `storage` (export preferences), and `downloads` (saving export files). These are security invariants — see the [threat model](docs/security/threat-model.md) for the full list, including no remote code and the default MV3 content security policy.

## Further reading

- [Privacy policy](PRIVACY.md)
- [Threat model](docs/security/threat-model.md)
- [ADR 0002 — fully client-side, no external dependencies](docs/decisions/0002-fully-client-side-no-external-dependencies.md)
- [ADR 0006 — core architecture](docs/decisions/0006-core-architecture.md)
