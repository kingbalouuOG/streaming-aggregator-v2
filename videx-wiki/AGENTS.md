# Schema — Videx Wiki

Rules for any LLM operating in this vault. Read this first.

## Layers

| Path        | Owner | Mutability                                     |
|-------------|-------|-----------------------------------------------|
| `raw/`      | Human | LLM reads only. Never edit, rename, or delete. The LLM may create new raw files only when explicitly directed by the human (e.g. "draft and add to raw/"). |
| `wiki/`     | LLM   | LLM creates and maintains.                     |
| `index.md`  | LLM   | LLM maintains.                                 |
| `log.md`    | LLM   | LLM appends only. Never rewrite history.       |
| `AGENTS.md` | Human | Schema. LLM proposes changes; human approves.  |

## File conventions

- All files are `.md` (UTF-8, LF line endings).
- File names: `kebab-case.md` (e.g. `streaming-availability-api.md`).
- One topic per page. Split when a page exceeds ~400 lines.
- Pages live under one of:
  - `wiki/entities/` — concrete things (services, APIs, companies, products, libraries). Subfolders:
    - `apis/` — third-party API integrations (TMDb, OMDB, Streaming Availability).
    - `streaming-services/` — UK streaming platforms (Netflix, Prime, BBC iPlayer, etc.).
    - `infrastructure/` — Supabase, Capacitor, RapidAPI, hosting, libraries.
    - `codebase/` — internal code references (DB schema, modules, hooks, components, RPCs).
  - `wiki/concepts/` — patterns, decisions, techniques, gotchas, recurring problems. Subfolders:
    - `architecture/` — system-level design (two-surface, recommendation pipeline, sync pipeline).
    - `techniques/` — algorithms and methods (HDBSCAN, embeddings, RLS pattern, deep linking).
    - `domain/` — domain primers (UK streaming market, JustWatch, recommender taxonomy).
    - `operations/` — runbooks, phase summaries, post-mortems (under `solutions/`), risks register, eval-harness reference, version log.
    - `decisions/` — Architecture Decision Records (ADRs).
    - `evaluations/` — eval reports (cluster coherence, service discrimination, variant decisions, wire-format spike).
    - `product/` — product-shaping concepts (mission, personas, privacy, tone, accessibility, frontend conventions).
    - `forward-planning/` — exploratory v3+ material (status: exploratory unless promoted).
    - `glossary.md` — terminology, acronyms, internal naming conventions.
  - `wiki/sources/` — one page per ingested raw document, summarising it.
  - `wiki/registers/` — cross-cutting at-a-glance lookups (parking lot, open questions, pre-launch blockers, deferred items, acceptance gates, next steps, cheatsheet). Each register pulls from multiple raw sources; refresh when underlying sources change.
- Cross-link liberally. Prefer relative markdown links: `[Netflix](../entities/streaming-services/netflix.md)`.

## `raw/` subfolder layout

Group source documents by type. Suggested layout (mirrors the wiki structure where useful):

- `raw/v2-strategy/` — the seven canonical v2 strategy and design documents (engine strategy, project orchestration, implementation guide, parking lot, detail page spec, composition hypothesis, design reference).
- `raw/phase-summaries/` — end-of-phase summary documents from `docs/v2/phase-summaries/`. New ones added per phase.
- `raw/evaluations/` — eval reports (cluster coherence, service discrimination, variance, wire format spike, decision docs).
- `raw/solutions/` — post-mortems and resolved issues from `docs/solutions/`.
- `raw/plans/` — implementation plans from `docs/plans/`.
- `raw/screenshots/` — design reference PNGs from `docs/v2/design-references/`.
- `raw/codebase-snapshots/` — generated snapshots from the repo (schema, migrations, modules, hooks, components, RPCs, event taxonomy).
- `raw/api-references/` — third-party API references (TMDb, OMDB, SA API).
- `raw/streaming-services/` — UK service profiles (deep links, pricing, gaps).
- `raw/infrastructure/` — Supabase, Capacitor, pgvector, pg_partman, RapidAPI.
- `raw/concepts/` — primers (embeddings, HDBSCAN, RLS, two-surface, cold start).
- `raw/runbooks/` — operational procedures.
- `raw/adrs/` — decision records.
- `raw/reference/` — glossary, phase timeline, risks register, eval harness.
- `raw/research/` — competitor scans, market research, recommendation algorithm reports.
- `raw/frontend/` — Tailwind, Motion, accessibility, design tokens.
- `raw/product/` — mission, personas, privacy, tone of voice.
- `raw/forward-planning/` — v3 thinking, monetisation strategies, scaling plans, post-v2 roadmap material. Less stable than other folders; mark each file's `status` (exploratory | shortlisted | locked | shipped | parked) in frontmatter.

## `raw/` and `docs/` relationship

Files under `raw/` are snapshots of source material that lives elsewhere (primarily under `docs/` in the main repo, plus generated extracts from code).

- **Source of truth lives in `docs/` and the repo**, not in `raw/`. When a strategy doc, runbook, or extract changes, update it where it lives, then refresh the `raw/` copy.
- **`raw/` is read-only to the LLM** and is meant to be re-snapshotted by the human periodically. The LLM may create raw files only when explicitly directed (e.g. "draft a glossary and add to raw/").
- **`wiki/sources/` pages preserve the synthesised knowledge** with attribution to the raw file path. Even if a `raw/` copy goes stale, the wiki page's claims remain useful and traceable.
- **Refresh cadence:** when a `docs/` file is bumped (e.g. strategy v1.6.3 → v1.7), copy the new version into `raw/`, ask the LLM to re-ingest just that file, and let it update the relevant `wiki/sources/`, `wiki/entities/`, `wiki/concepts/` pages plus `index.md` and `log.md`.

## Frontmatter (required on every wiki page)

```yaml
---
title: Streaming Availability API
type: entity            # entity | concept | source
tags: [api, deep-links, rapidapi]
created: 2026-04-26
updated: 2026-04-26
sources:                # paths into raw/ that informed this page
  - raw/sa-api-docs.pdf
related:                # other wiki pages
  - wiki/concepts/deep-linking.md
---
```

## `index.md` format

Grouped by category, one line per page:

```
- [Streaming Availability API](wiki/entities/streaming-availability-api.md) — Movie of the Night API, source of UK deep links and pricing.
```

Keep summaries to one sentence. The index is for scanning, not reading.

## `log.md` format

Append-only. One entry per operation. Newest at the bottom.

```
## [2026-04-26] ingest | sa-api-docs.pdf
- New page: wiki/entities/streaming-availability-api.md
- Updated: wiki/concepts/deep-linking.md (added rate-limit note)
- Cross-refs: wiki/entities/netflix.md, wiki/entities/prime-video.md

## [2026-04-26] query | "why does Prime fall back to search?"
- Read: wiki/entities/prime-video.md, wiki/concepts/deep-linking.md
- Filed: wiki/concepts/prime-deep-link-limitation.md (new)

## [2026-04-26] lint
- Resolved 1 contradiction (Channel 4 slug format in two pages)
- 2 orphan pages flagged: wiki/concepts/old-watchmode-notes.md, ...
```

Prefix is always `## [YYYY-MM-DD] {ingest|query|lint} | {short subject}`. This keeps the log greppable.

## Workflows

### Ingest

When a new file appears in `raw/`:

1. Read it fully.
2. Discuss takeaways with the human; agree on what is worth keeping.
3. Decide which existing pages to update vs. what new pages to create.
4. Create `wiki/sources/{name}.md` summarising the source itself (key claims, dates, author, why it matters).
5. Update or create `entities/` and `concepts/` pages, linking back to the source page and to `raw/{file}`.
6. Update `index.md`.
7. Append a single entry to `log.md`.

### Query

When the human asks a question:

1. Search relevant wiki pages first; only fall back to `raw/` if the wiki is thin.
2. Answer with citations: `[Netflix](wiki/entities/netflix.md)`.
3. If the answer is non-trivial and reusable, file it as a new page (usually under `wiki/concepts/`) and update `index.md`.
4. Append a `query` entry to `log.md`.

### Lint

On request:

1. Scan for contradictions across pages.
2. Flag stale claims (compare `updated` dates against current date).
3. Find orphan pages (no inbound links).
4. Find broken links and missing cross-references.
5. Report findings; fix the trivial ones; surface the rest for the human to decide.
6. Append a `lint` entry to `log.md`.

## Style

- Terse, factual, no marketing voice. Match the tone of `CLAUDE.md` / repo memory.
- Date format: `YYYY-MM-DD`.
- When uncertain, mark it inline: `> ⚠ unverified — source X claims this but no second source.`
- Prefer tables and bulleted facts over prose.
