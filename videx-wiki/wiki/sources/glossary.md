---
title: Source — Glossary
type: source
tags: [reference, glossary]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/reference/glossary.md
related:
  - wiki/concepts/glossary.md
---

# Source: Glossary (raw/reference/glossary.md)

Internal reference compiled 2026-04-26. Five sections: project terms, recommendation terms, signal terms, ops terms, stack acronyms, plus file/path conventions.

## Why it matters

Pins canonical names. Anchors consistent terminology across every wiki page (`event_type` not `interaction_type`, `content_id` not `tmdb_id`, `not_interested` not `dismiss`, "Focused ↔ Varied" not "Depth vs breadth").

## Key claims

- Service slugs are exhaustive and locked at 10 entries.
- Migration numbering is monotonic with one intentional gap (021).
- Two surfaces only: Home (discovery) and For You (personalised).
- Phase identifiers run 0, 0.5, 1, 2, 2.5, 2.6, 3, 4, 4.5.
- Capacitor `AppLauncher` confidence is binary (`high`/`low`).

Keep the wiki glossary at [concepts/glossary.md](../concepts/glossary.md) in lock-step with this raw source. Re-ingest on any new term added to `docs/`.
