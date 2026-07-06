---
title: V3 Conversational Discovery & Semantic Search Strategy v0.1 (forward-planning)
type: concept
tags: [forward-planning, exploratory, v3, conversational, knowledge-graph, graphiti, kuzu]
status: superseded (absorbed into Product Strategy & Roadmap v1.0, H3 Bet 1, approved 2026-07-06)
horizon: post-v2 (Phase 7 / v3)
created: 2026-04-26
updated: 2026-07-06
sources:
  - raw/forward-planning/Videx_v3_Conversational_Discovery_Semantic_Search_Strategy_v0_1.md
related:
  - wiki/concepts/architecture/recommendation-pipeline.md
  - wiki/concepts/architecture/mood-rooms.md
  - wiki/concepts/techniques/embeddings.md
---

# V3 Conversational Discovery & Semantic Search Strategy v0.1

> **⚠ SUPERSEDED 2026-07-06** by the approved [Product Strategy & Roadmap v1.0](../../sources/strategy-roadmap-2026-07.md), H3 Bet 1 ("Agents — the callable taste layer"). The reframe: the "Videx 3.0" moment is **"Videx answers you anywhere"** — Videx's own conversational surface *and* a per-user MCP server callable from ChatGPT/Claude/Gemini (assistants share the MCP substrate; Tubi's April-2026 single-catalogue ChatGPT app left the cross-service slot empty). **Graphiti + Kuzu is demoted from headline to implementation option**, evaluated at build time. Trigger unchanged in spirit: public-traffic Tier-1 baseline + H2 retention holds. The architecture exploration below remains the best reference for the knowledge-graph option.

## Problem

What v2 does well: structured signals (thumbs ±, watchlist, impressions, dwell), 1536D OpenAI embeddings via pgvector, deterministic ranking, three-layer metadata.

What v2 lacks:

- **Qualitative preference reasoning.** v2 knows the user rated Succession and The Bear highly. It does not explicitly know they're drawn to "intense workplace dramas where competence is a form of power".
- **Explainable recommendations.** v2 cannot tell the user *why* something was recommended. The ranking score is a number.
- **Natural-language search.** Current Browse/Search uses TMDb text-matching. "Something like Fleabag but darker" gets no useful results.
- **Conversational discovery.** Phase 7 in v2 strategy describes this as "built on top of v2 infrastructure, using mood rooms as primary mapping surface for natural-language queries". No implementation detail in v2 docs.

## Why these matter together

All three (semantic search, explanation, conversational discovery) share an infrastructure requirement: structured, queryable knowledge about content relationships and user preferences beyond vector similarity. A knowledge-graph layer serves all three.

## Landscape (April 2026)

| Tool | Category | OSS? | Graph DB | Videx fit | Monthly cost (managed) |
|---|---|---|---|---|---|
| Mem0 | Chat memory | Yes (Qdrant) | No | Poor (no chat history to compress) | Free-$249 |
| **Graphiti** | Temporal KG | **Yes (Apache 2.0)** | Neo4j/FalkorDB/Kuzu | **Strong** | **Free (OSS)** |
| Zep | Managed Graphiti | No | Managed | Moderate | $25-475 |
| Cognee | Knowledge engine | Yes | Neo4j/Kuzu/others | Moderate (overkill) | $35-200 |
| Letta | Agent framework | Yes | N/A | Poor (different problem) | Free-$200 |

**Leading candidate: Graphiti (OSS) with Kuzu embedded backend.**

## Proposed architecture

KG layer **complements** v2; does not replace pgvector, ranking pipeline, or taste vector. Adds a structured semantic layer that enables new product surfaces.

```
v2 (existing)                          v3 (new layer)
─────────────                          ──────────────
user_interactions ──→ taste vector     user_interactions ──→ Graphiti episodes
titles.embedding  ──→ cosine sim       content metadata  ──→ entity/relationship graph
ranking pipeline  ──→ For You rows     NL query          ──→ hybrid graph search
                                       graph traversal   ──→ recommendation explanation
```

## Data flow

**Ingestion** (batch, scheduled GitHub Actions cron matching mood rooms pattern):

1. Read recent `user_interactions` from Supabase.
2. Format each as Graphiti episode (structured JSON: user_id, content_id, event_type, timestamp, content metadata from `titles`).
3. Graphiti extracts entities (users, titles, genres, directors, actors, thematic concepts) and relationships (watched, loved, dismissed, similar_to, directed_by, stars_in).
4. Temporal graph updates incrementally. Old preference edges invalidated when contradicted (bi-temporal model).

**Retrieval** (real-time):

1. Semantic search: NL query hits Graphiti's hybrid search (semantic + BM25 + graph traversal).
2. Recommendation explanation: traverse graph from user to title to find reasoning path.
3. Conversational discovery: LLM receives query + Graphiti search results as context, generates NL response with specific titles.

## Graph DB: Kuzu (embedded)

Recommended starting point. No additional infrastructure: graph is local file on disk, initialised with `KuzuDriver(db='/path/to/graphiti.kuzu')`. Matches solo-developer constraint and avoids adding Neo4j or FalkorDB to the stack.

Scaling thresholds (per source):

- Embedded Kuzu: starting point.
- FalkorDB (Redis-compatible Docker): ~20K users.
- Neo4j: ~100K users.

## Use cases

- Browse/Search upgrade: "dark comedy about a dysfunctional family" hits Graphiti hybrid search, returns titles connected to genre + thematic-concept nodes, ranked by graph distance and filtered by user's services.
- Recommendation explanation: "Because you loved Succession and The Bear — tense dramas about power in professional settings".
- Conversational discovery: chat interface; LLM uses Graphiti search results as grounded context. Mood rooms (v2 Phase 4.5) serve as mapping surface for vague queries.

## Cost (Option A: Graphiti + Kuzu)

- Graph DB: £0 (embedded file).
- Graphiti library: £0 (Apache 2.0).
- Platform fee: £0.

Zero infrastructure cost at early scale; clear migration thresholds.

## Why this is forward-planning

Per Step 4 of the ingest brief, forward-planning material informs but does not override locked v2 decisions. Phase 7 commits the conceptual surface (conversational discovery on top of v2); this doc is the first detailed exploration of the implementation. Promote to `concepts/architecture/` if/when the spike validates Graphiti+Kuzu and the work is committed.
