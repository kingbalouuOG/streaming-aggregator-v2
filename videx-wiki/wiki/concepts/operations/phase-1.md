---
title: Phase 1 — Content embeddings
type: concept
tags: [phase, phase-1, embeddings, pgvector, hnsw, openai]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/phase-summaries/phase-1-summary.md
  - raw/evaluations/phase-1-cluster-eval.md
  - raw/evaluations/phase-1-wire-format-spike.md
related:
  - wiki/concepts/operations/phase-history.md
  - wiki/concepts/decisions/adr-004-1536d-embeddings.md
  - wiki/concepts/techniques/embeddings.md
  - wiki/entities/codebase/migrations.md
  - wiki/concepts/evaluations/phase-1-cluster-eval.md
  - wiki/concepts/evaluations/phase-1-wire-format-spike.md
---

# Phase 1 — Content embeddings

Completed 2026-04-12 at commit `2fd4289`.

## What was delivered

| Migration | Purpose |
|---|---|
| 018 | pgvector extension, `embedding vector(1536)` column on `titles`, work-queue partial index on `(id) WHERE embedding IS NULL`. |
| 019 | Drop legacy 24D `content_vector` column and `chk_content_vector_dim` constraint (destructive, manual snapshot taken pre-apply). |

New code:

- `supabase/functions/_shared/genreNames.ts` — Deno-compatible `GENRE_NAMES` (extracted from `src/lib/constants/genres.ts`).
- `supabase/functions/_shared/embeddingTemplate.ts` — isomorphic embedding text builder (locked §4.1 template).
- `supabase/functions/_shared/openaiEmbeddings.ts` — isomorphic OpenAI client (rate-limited, backoff, batch).
- `supabase/functions/embed-new-titles/index.ts` — ongoing embedding Edge Function (JWT-verified, 100 rows/invocation).
- `supabase/cron/embed_new_titles.sql` — pg_cron 06:45 UTC daily.
- `scripts/embeddings/backfill-embeddings.ts` — bulk backfill (resume-safe, EPERM-retry).
- `scripts/embeddings/create-hnsw-index.ts` — index build documentation (actual build via `supabase db query --linked` because HTTP gateway timed out, but server-side completed).
- `scripts/embeddings/eval-cluster-coherence.ts`, `wire-format-spike.ts`.
- 15 test cases for embedding template.

Deleted: `supabase/functions/_shared/computeContentVector.ts` (288 lines of v1 24D server-side code).

## Verification

| Check | Result |
|---|---|
| HNSW index exists with `vector_cosine_ops`, `indisvalid=true` | PASS, 156 MB |
| `COUNT(WHERE embedding IS NOT NULL)` ≥ 19,990 | PASS (19,993) |
| `COUNT(WHERE embedding IS NULL AND keywords IS NOT NULL)` = 0 | PASS |
| Cluster eval | conditional pass (see below) |
| Wire format spike | PASS, locked pattern: `JSON.parse(row.embedding as string)` |
| `embed-new-titles` deployed with JWT verification | PASS |
| Cron at 06:45 UTC | PASS |
| `\d titles` no longer shows `content_vector` | PASS |
| `tsc --noEmit` and 15/15 tests | PASS |

## Deviations

1. **Cluster coherence between-cohort threshold not met** — within-cohort passed for 4/5 real cohorts (Nolan at 0.47 expected, director not in template). Between-cohort mean 0.52 vs 0.30 threshold. Root cause: genuine genre overlap between action-adjacent cohorts (MCU, Nolan, Horror), not model failure. Threshold of 0.3 unrealistically strict for genre-overlapping cohorts.
2. **Sync scripts decoupled from embedding (cron-only).** Plan offered two options; cron-only chosen. Newly synced titles have NULL embedding for up to ~24h. No UI consumes embeddings in Phase 1 so acceptable.
3. **A24 horror cohort replaced with Conjuring Universe.** A24 not in UK streaming catalogue.

## Decisions made during execution

- Director excluded from embedding template (locked 6-line template; director from Phase 0.5 available but unused).
- Wire format: `JSON.parse(row.embedding as string)` is the locked Phase 3 pattern.
- Genre map duplicated in `_shared/genreNames.ts` rather than cross-tree imports.
- HNSW build via `supabase db query --linked` (HTTP gateway timed out client-side; server completed).
- IN-PX-06 deferred: BBC Period Dramas TV cohort passes at 0.53, director widening unnecessary for current template.

## Observations

- Backfill cost: $0.047 for 20K titles (2.35M tokens, ~117 tokens/title).
- 24/19,993 transient `fetch failed` errors all recovered on immediate re-run.
- HNSW build can exceed HTTP gateway timeout but completes server-side.
- Between-cohort cosine thresholds may need revision for Phase 3 (within/between ratio rather than absolute thresholds).

## Open items carried forward

1. Client-side v1 taste vector code (5 active consumers) — deferred to Phase 3 hook rewrites.
2. IN-PX-06 deferred (revisit only if template revision adds director).
3. IN-XPS-004 service-role JWT rotation (pre-existing, not Phase 1 specific).
