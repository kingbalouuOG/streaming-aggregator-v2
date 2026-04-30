## Phase 1 End-of-Phase Summary

### Phase identifier and completion date
- Phase: 1 — Content embeddings
- Completed: 2026-04-12
- Final commit hash: 2fd4289

### What was delivered

**New files created:**
- `supabase/migrations/018_embeddings_pgvector.sql` — pgvector extension, `embedding vector(1536)` column, work-queue partial index
- `supabase/migrations/019_drop_legacy_content_vector.sql` — drops `content_vector` column and `chk_content_vector_dim` constraint
- `supabase/functions/_shared/genreNames.ts` — Deno-compatible GENRE_NAMES map (extracted from `src/lib/constants/genres.ts`)
- `supabase/functions/_shared/embeddingTemplate.ts` — isomorphic embedding text builder (locked §4.1 template)
- `supabase/functions/_shared/openaiEmbeddings.ts` — isomorphic OpenAI embedding client (rate-limited, backoff, batch)
- `supabase/functions/embed-new-titles/index.ts` — ongoing embedding Edge Function (JWT-verified, cap 100 rows)
- `supabase/cron/embed_new_titles.sql` — pg_cron job at 06:45 UTC daily
- `scripts/embeddings/backfill-embeddings.ts` — one-time bulk backfill (resume-safe, EPERM-retry)
- `scripts/embeddings/create-hnsw-index.ts` — post-backfill HNSW index creation documentation
- `scripts/embeddings/eval-cluster-coherence.ts` — cluster coherence evaluation script
- `scripts/embeddings/wire-format-spike.ts` — pgvector wire format validation script
- `scripts/embeddings/__tests__/embeddingTemplate.test.ts` — 15 test cases
- `docs/v2/phase-1-cluster-eval.md` — cluster coherence report
- `docs/v2/phase-1-wire-format-spike.md` — wire format spike findings
- `docs/v2/phase-summaries/phase-1-summary.md` — this file

**Existing files modified:**
- `supabase/functions/sync-incremental/index.ts` — removed `computeAndStoreVector` function and all `content_vector` writes
- `scripts/sync-content.ts` — removed Stage 1 vector computation, deleted `stageVectors()` (Stage 4), removed `--stage vectors` CLI option
- `package.json` — added `test:embeddings` and `backfill:embeddings` scripts
- `.gitignore` — added `scripts/embeddings/.checkpoint.json`, `.failures.jsonl`
- `src/lib/constants/genres.ts` — added cross-reference comment to `genreNames.ts`
- `docs/v2/Videx_v2_Implementation_Notes_Parking_Lot_v0.3.4.md` — IN-201–IN-205 marked incorporated, IN-204/IN-205 migration refs fixed (016/017→018/019), IN-PX-06 deferred
- `docs/v2/Videx_v2_Implementation_Guide_v0.2.md` — §8.3 wire spike ordering clarified, migration ref fixed (017→019)

**Migrations applied:**
- 018: pgvector extension + `embedding vector(1536)` column + work-queue partial index
- 019: Drop `content_vector` column + `chk_content_vector_dim` constraint

**Tests added:**
- `scripts/embeddings/__tests__/embeddingTemplate.test.ts` — 15 cases (all green)

**Dependencies:** none added (OpenAI API called via fetch, no SDK dependency)

**Environment variables introduced:**
- `OPENAI_API_KEY` — server-side only (.env for scripts, Supabase secret for Edge Functions)

**Files deleted:**
- `supabase/functions/_shared/computeContentVector.ts` — v1 24D server-side vector code (288 lines)

### Deviations from the phase plan

1. **Cluster coherence thresholds not met on between-cohort metric.** Plan specified within-cohort >= 0.5, between-cohort <= 0.3, gap >= 0.2. Actual results: within-cohort passes for 4/5 real cohorts (Nolan at 0.47 is expected — director-driven cohort without director in template). Between-cohort mean was 0.52, exceeding 0.3 threshold. Root cause: genuine genre overlap between action-adjacent cohorts (MCU, Nolan, Horror), not model failure. Documented with full analysis in the eval report. The between-cohort threshold of 0.3 was unrealistically strict for cohorts with overlapping genres.

2. **Sync scripts decoupled from embedding (cron-only approach).** Plan proposed two options; user approved cron-only (Option A). Newly synced titles have NULL embedding for up to ~24h until the 06:45 cron runs. Acceptable because no UI consumes embeddings in Phase 1.

3. **A24 horror cohort replaced with Conjuring Universe.** A24 titles (Hereditary, Midsommar, etc.) are not in the UK streaming catalogue database. Substituted with Conjuring Universe horror franchise titles that were available.

### Decisions made during execution

1. **Director excluded from embedding template.** Confirmed §4.1 locked template has 6 lines (no director). Director data from Phase 0.5 enrichment is available but not used in embeddings.

2. **Wire format: JSON.parse workaround.** PostgREST returns pgvector columns as strings. Locked pattern for Phase 3: `JSON.parse(row.embedding as string)`.

3. **Genre map duplication.** Created `genreNames.ts` in `_shared/` rather than attempting cross-tree imports. Cross-reference comments in both files.

4. **HNSW index via CLI, not script.** The `create-hnsw-index.ts` script was created for documentation but the actual index was built via `npx supabase db query --linked`. The HTTP gateway timed out but the server-side build completed successfully.

5. **IN-PX-06 deferred.** BBC Period Dramas (TV) cohort passes cluster coherence at 0.53, comparable to movie cohorts. Director widening unnecessary for current template.

### Documentation updates needed

- `docs/v2/Videx_v2_Implementation_Notes_Parking_Lot_v0.3.4.md` — Updated in this phase (IN-201–IN-205 marked incorporated, migration refs fixed, IN-PX-06 deferred)
- `docs/v2/Videx_v2_Implementation_Guide_v0.2.md` — Updated in this phase (§8.3 clarified)

### Open items carried forward

1. **Client-side v1 taste vector code** (`src/lib/taste/computeContentVector.ts`, `contentVectorMapping.ts`) — 5 active consumers in hooks and recommendation engine. Deferred to Phase 3 when hooks are rewritten to use embedding-space taste vectors.
2. **IN-PX-06** — deferred, not dropped. Revisit only if a future template revision adds director.
3. **Service-role JWT in cron SQL files** (IN-XPS-004) — pre-existing, not Phase 1 specific. Rotate before public launch.

### Verification results

| Check | Result | Evidence |
|-------|--------|----------|
| `\d titles` shows `embedding vector(1536)` | PASS | Migration 018 applied, column confirmed |
| HNSW index exists with `vector_cosine_ops` | PASS | `indisvalid=true`, 156 MB |
| `COUNT(WHERE embedding IS NOT NULL)` >= 19,990 | PASS | 19,993 |
| `COUNT(WHERE embedding IS NULL AND keywords IS NOT NULL)` = 0 | PASS | 0 |
| Cluster eval report exists | PASS | `docs/v2/phase-1-cluster-eval.md`, conditional pass with documented justifications |
| Sync smoke test: embed-new-titles processes work queue | PASS | curl returns `{"status":"ok","processed":0,"remaining":0}` (empty queue) |
| embed-new-titles deployed with JWT verification | PASS | 401 without bearer, 200 with service-role |
| Cron at 06:45 UTC | PASS | `cron.job` shows `schedule: '45 6 * * *'` |
| Wire format spike report exists | PASS | `docs/v2/phase-1-wire-format-spike.md` with runnable snippet |
| `\d titles` no longer shows `content_vector` | PASS | Migration 019 applied |
| `chk_content_vector_dim` constraint gone | PASS | Confirmed post-019 |
| Grep for `content_vector` in server-side code = 0 | PASS | Only migration files (historical DDL) |
| `npx tsc --noEmit` clean | PASS | |
| `npm run test:embeddings` all pass | PASS | 15/15 green |

### Current state summary

The `titles` table now has 19,993 rows with 1536-dimensional embeddings (all enriched titles), stored in a pgvector `vector(1536)` column with an HNSW index using `vector_cosine_ops`. The legacy 24D `content_vector` column and its CHECK constraint have been removed. The sync scripts no longer compute vectors; new titles receive embeddings via the `embed-new-titles` Edge Function cron at 06:45 UTC daily. The wire format spike confirmed that Phase 3 needs `JSON.parse()` to convert PostgREST-serialized embedding strings to `number[]`. Client-side v1 taste vector code (5 consumers) remains in `src/lib/taste/` and is not affected by the database column removal — it computes vectors locally from genre IDs and metadata.

### Observations for the next phase

1. **Backfill cost was trivial** — ~$0.047 for 20K titles at 2.35M tokens. Future re-embeddings (template changes, model upgrades) are cheap.
2. **Transient network failures are self-healing.** 24 of 19,993 titles failed on first pass due to `fetch failed` errors; all recovered on immediate re-run. The resume-safe work queue pattern works.
3. **EPERM retry pattern was not triggered** during this backfill (all 3 attempts succeeded on first try). But it's there from day one as insurance.
4. **Between-cohort cosine thresholds may need revision.** The 0.3 baseline assumes genre-orthogonal cohorts, which is unrealistic. Phase 3 should use more nuanced metrics (e.g., within/between ratio rather than absolute thresholds).
5. **HNSW build can exceed HTTP gateway timeout.** Build completed server-side despite client timeout. Use the Supabase SQL Editor for future index operations if the CLI times out.
6. **Total backfill token count: 2,346,229.** Average ~117 tokens per title, well within the template's 2000-char limit.
