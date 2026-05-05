# Videx Wiki

A persistent, LLM-maintained knowledge base for the Videx project, following the [LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) by Andrej Karpathy.

## How it works

Three layers:

1. **`raw/`** — immutable source documents you drop in (articles, docs, transcripts, screenshots, exports, notes). The LLM reads but never modifies these.
2. **`wiki/`** — markdown pages the LLM owns. Created and updated as new raw sources are ingested.
3. **Schema (`AGENTS.md`)** — the rules: structure, conventions, and the three workflows (ingest, query, lint).

Plus two top-level index files:

- **`index.md`** — content catalog of every wiki page, by category.
- **`log.md`** — append-only chronological record of every ingest/query/lint operation.

## Using it

- **Add knowledge**: drop a file into `raw/` and ask the LLM to *ingest* it.
- **Ask questions**: ask the LLM to *query* the wiki. Useful answers get filed back as new pages.
- **Maintain**: periodically ask the LLM to *lint* — surfaces contradictions, stale claims, orphan pages.

See [AGENTS.md](AGENTS.md) for the full schema and conventions.

## Obsidian

This vault works as-is in Obsidian. Both `[standard](links)` and `[[wikilinks]]` are accepted; the LLM defaults to standard markdown links for portability.
