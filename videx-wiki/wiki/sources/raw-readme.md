---
title: Source — raw/ README
type: source
tags: [meta, readme]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/README.md
---

# Source: raw/ README

Brief file at `raw/README.md` describing the drop-zone convention.

## Content

- Files in `raw/` are immutable. The LLM reads but never edits, renames, or deletes (except where explicitly directed).
- Use descriptive `kebab-case` filenames where possible. Originals are fine if not.
- Subfolders allowed (`raw/sa-api/`, `raw/screenshots/`).

## Why it matters

Defines the read-only contract that allows the LLM to ingest without risk of mutating source material. AGENTS.md duplicates and extends this rule.
