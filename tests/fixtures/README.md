# Conversation fixtures

Sanitized claude.ai conversation payloads used by the parser snapshot harness
(`tests/parser-fixtures.test.ts`). Every serializer (M2) re-uses the same
fixtures, so adding one here re-verifies the whole pipeline.

## Provenance — read this before trusting the fixtures

These files are **synthesized from documented API shapes**, not recorded from a
live claude.ai session: this repository's development environment cannot log in
to claude.ai. The shapes come from
`docs/research/2026-07-06-technical-architecture.md` (sections 1.2–1.3), which
cross-references several independent exporter codebases. Field names, block
types, the `parent_message_uuid` tree, and the artifact command stream follow
that research; incidental fields (`settings`, `index`, `sync_sources`,
`start_timestamp`/`stop_timestamp`, …) are plausible reconstructions.

**They must be validated against a live capture** of
`GET /api/organizations/{orgId}/chat_conversations/{convId}?tree=True&rendering_mode=messages&render_all_tools=true`
before the first release; replace or extend these files with sanitized real
payloads as soon as one is available (tracked by the API-shape-change work,
issue #7).

## Sanitization checklist

Whenever a fixture is refreshed from a real capture, it must satisfy all of:

- [ ] No real personal data: names, e-mail addresses, account identifiers,
      org names, file contents, or anything user-identifying replaced with
      representative invented text.
- [ ] All UUIDs randomized (conversation, message, file, and org UUIDs must
      not match any real account's values). Keep them valid UUIDs and keep
      `parent_message_uuid` references internally consistent.
- [ ] Timestamps shifted to arbitrary dates (keep ISO-8601 format and keep
      relative ordering, since branch selection uses `created_at`).
- [ ] Conversation content replaced with representative text that still
      exercises the feature the fixture exists for (tables, code blocks,
      thinking, tool calls, …).
- [ ] Base64 image data replaced with a tiny placeholder (the 1×1 PNG used in
      `images.json` is fine).
- [ ] URLs reduced to relative API paths; no signed or tokenized URLs.

## What each fixture covers

| Fixture | Covers |
| --- | --- |
| `simple-text.json` | Plain two-turn chat; Markdown table + code block in text |
| `thinking.json` | Thinking blocks with summaries and without |
| `tool-use.json` | `web_search` tool_use/tool_result, and a `tool_result` with `is_error: true` |
| `artifacts.json` | Artifact `create` followed by an `update` chain |
| `attachments-files.json` | `attachments` (with `extracted_content`) and `files_v2` |
| `images.json` | Inline `image` content block + `files_v2` image entry |
| `branched-tree.json` | `tree=True` payload with an edited message → two branches; `current_leaf_message_uuid` picks the newer one |
| `unknown-block.json` | An unrecognised content block type (parser must preserve it and report a parse issue) |

Fixtures are auto-discovered: drop a new `*.json` file in this directory and
the harness snapshot-tests it with no code changes.
