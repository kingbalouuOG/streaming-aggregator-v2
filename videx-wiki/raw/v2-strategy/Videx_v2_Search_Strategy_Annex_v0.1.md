---
title: Videx v2 — Search Strategy Annex
version: v0.1
status: locked-for-phase-1
horizon: v2
generated: 2026-05-11
supersedes: none
---

# Videx v2 — Search Strategy Annex

Annex to the v2 build. Phase 1 (filtered + semantic search) is locked for implementation in the current build. Phases 2 (entity search) and 3 (search-as-signal) are forward-looking — see `raw/forward-planning/roadmap-search-v2-entity-and-signal.md`.

---

## 1. Why now

Search currently sits inside the Browse tab as a thin TMDb keyword wrapper plus a category pill. It does two jobs badly: lookup (exact title) works passably; filtered browse (services + genre + constraints) is missing because `BrowsePage` only applies a subset of `FilterSheet`'s axes to results.

v2 infrastructure makes a much better search cheap to build. All five Layer 1 metadata columns are populated (`keywords`, `cast_top_5`, `director`, `content_rating`, `runtime`). Embeddings and `match_titles_by_vector` are live. `get_available_tmdb_ids(service_ids)` exists. `card_impressions` already accepts `source_surface = 'search'`. `emitSearch` already writes `event_type='search'` to `user_interactions`. Search is the surface where v2's data investment has the highest unrealised return.

---

## 2. Current-state ground truth (post-audit)

| Belief | Reality |
|---|---|
| `deep_links` join used for service filter | Table is `streaming_availability`. The `get_available_tmdb_ids(service_ids text[])` RPC (migration 028) is what For You uses. Not yet wired into search. |
| FilterSheet is service / genre / rating only | Sheet exposes services, contentType, cost, genres, minRating, languages, showWatched. `BrowsePage` applies only genres / minRating / languages to search results. Missing axes: runtime, year/decade, content_rating. |
| App uses TMDb `/search/multi` | App uses `/search/movie` + `/search/tv`. `/search/multi` unused; `/search/person` unused. |
| Search queries unconsumed | Capture exists. `emitSearch` writes `{query, result_count}`. No session_id, no surface, no click tie-back. Downstream consumption is zero. |

---

## 3. Three retrieval modes

- **Mode A — Lookup.** Exact / near-exact title match. Dominates when query unambiguously names a title.
- **Mode B — Entity.** Person resolution (actor / director). Filmography filtered by services, ranked by taste fit.
- **Mode C — Semantic.** Natural-language descriptive queries. Embed the query, cosine against title embeddings, filter, rank.

Filters compose across all three modes.

### Architectural decision: TMDb vs Postgres catalogue

Mode A targets TMDb (catalogue breadth). Modes B and C target Postgres (where embeddings and Layer 1 metadata live). Postgres `titles` cache is ~20K rows; TMDb catalogue is millions.

Consequence: a Mode A click can land on a card with no embedding, no enrichment, no deep link. The result-render path needs a graceful fallback ("available externally, no provider info yet" + retry-on-detail-open).

---

## 4. Architecture for Phase 1

### Filter composition

Filters apply post-retrieval as `WHERE` clauses on the candidate set. The structured filter set already implicit in `titles`:

- Services (via `get_available_tmdb_ids` RPC)
- Movie / TV (`media_type`)
- Genre (`genre_ids` array)
- Runtime band (`runtime`)
- Year / decade (`release_year`)
- UK rating (`content_rating`)
- "On my services / off my services / all" toggle

Same operation regardless of mode.

### No mode classifier in Phase 1

Earlier drafts proposed a classifier returning three result sets in one RPC. Dropped — earns nothing when only Modes A and C are in play, and Phase 2 hasn't shipped Mode B. Reconsider at Phase 3 close.

### Ranking inside results

Lighter version of the For You pipeline. Weights illustrative pending eval:

- ~60% query relevance (title-match for A, cosine for C)
- ~25% taste fit (tie-breaker)
- ~15% recency / popularity floor

Personalisation is a tie-breaker, never a re-ranker.

---

## 5. Search-as-signal

No taste-vector update from raw query text. Searches are routinely on behalf of others or sceptical, and a pipeline that infers preference from query text will drift.

- Query alone → no signal.
- Query → click → standard detail-page-visit signal.
- Query → click → deep-link → standard +0.8 weight.
- Failed search → no taste signal; kept as analytics (zero-result queries reveal catalogue / availability gaps).

Capture is already in `emitSearch`. Phase 3 (forward planning) wires consumption + retention policy.

---

## 6. UX shape

Search remains in the existing tab; the tab may be renamed Search (rename-and-expand, no new browse surface to retire — Browse already is search + a few editor's-note chips).

- **Empty state:** recent searches + entry-point chips (mood, decade, service). No "trending searches" until there's a real fleet to aggregate over.
- **As-you-type:** instant title suggestions; "Search for '...'" semantic fall-through on submit when no strong title match.
- **Results page:** filter bar pinned; results grid below; mode indicator visible when results are semantic ("Showing titles like '...'") so the system's interpretation is overridable.
- **Filter sheet:** existing axes wired through; runtime, year/decade, content_rating, on-services toggle added.

### Latency targets

- Title typeahead: < 150ms (debounce, reuse cached TMDb results).
- Submit-to-results (Mode A + filters): < 400ms.
- Submit-to-results (Mode C semantic): < 700ms (~50–150ms OpenAI embed + ~100ms pgvector + filter + render). Embed only on submit. Cache by query string for ~1h.

---

## 7. Phasing

| Phase | Scope | Status |
|---|---|---|
| 1 — Filtered + semantic search | Modes A + C, filter composition, semantic behind feature flag | Locked for current build |
| 2 — Entity search | Mode B, TMDb `/search/person` + Postgres filmography | Forward planning |
| 3 — Search-as-signal + retention | Wire `emitSearch` consumption + retention + PII pass | Forward planning |

Phase 1 ships as a single PR, two clusters internally:

**Cluster A (no flag):** filter axis wiring, `get_available_tmdb_ids` integration, FilterSheet expansion, mode indicator shell, instrumentation. Shippable standalone in 2–3 days.

**Cluster B (flagged off until eval green):** `embed-query` Edge function, `match_titles_by_vector` wiring, semantic fall-through, eval rig.

Why combined: single UX iteration; FilterSheet axes land once accounting for both modes; single launch story ("search now works") instead of two ("more filters" → "semantic"); ~1–2 days saved on context-switching.

Why flagged: Cluster A has no eval dependency. Cluster B does. Flag decouples shipping risk from validation risk.

---

## 8. Cost (semantic search)

OpenAI `text-embedding-3-small` at $0.02 per 1M tokens. Average query ~10 tokens.

Per Mode C query: ~$0.0000002 = effectively zero.

| Active users | Mode C queries / month | Embedding cost |
|---|---|---|
| 10 (prototype) | ~450 | < $0.01 |
| 100 | ~4,500 | < $0.01 |
| 1,000 | ~45,000 | ~$0.01 |
| 10,000 | ~450,000 | ~$0.10 |
| 100,000 | ~4.5M | ~$0.90 |

Title backfill (sunk): ~$0.20 one-off. Ongoing enrichment: ~$0.10/year. Vector storage in Pro: included. Edge invocations: included up to 2M/month, ~$5/month overage at 100K-user scale.

Net: semantic search is effectively free below 10K users; sub-£1 at 100K. The line worth watching is Phase 7 conversational discovery (GPT-class), not this.

---

## 9. Open questions

1. Filter axis cap — four new axes on the FilterSheet; mobile UI gets crowded fast. Design pass needed before Phase 1 cluster A ships.
2. Mode C eval rig — fixture set + pass criterion + CI integration. Needs a one-page spec before cluster B ships.
3. Feature flag mechanism — boolean in `profiles` table, app config, or reuse an existing pattern. Confirm before Phase 1 starts.
4. Capacitor app-launcher tag preservation in deep links from search — same open spike as monetisation strategy; resolution sits outside this phase.
5. Search tab rename — keep "Browse" or rename to "Search"? Cosmetic, design call.
