# Videx v3 — Conversational Discovery & Semantic Search Strategy v0.1

**Status:** Early exploration / pre-spike
**Author:** Joe (with Claude review)
**Date:** April 2026
**Prerequisites:** v2 live, Phase 6 complete, Tier 1 metrics baseline established

---

## 1. Problem Statement

### 1.1 What v2 does well

The v2 recommendation engine captures structured behavioural signals (thumbs up/down, watchlist actions, card impressions, dwell time with exit outcome), builds mathematical taste representations (1536D OpenAI embeddings via pgvector), and runs a deterministic ranking pipeline (60% taste / 25% similar / 15% trending). Content metadata flows through three layers: raw TMDb data, LLM-generated Videx tags, and vector embeddings.

This architecture is strong at quantitative signal processing. It answers "what should I watch?" through similarity maths.

### 1.2 What v2 lacks

**Qualitative preference reasoning.** v2 knows a user rated *Succession*, *The Bear*, and *Industry* highly. It does not explicitly know the user is drawn to "intense workplace dramas where competence is a form of power." The embedding space captures some of this implicitly through cosine similarity, but it is opaque and unqueryable in natural language.

**Explainable recommendations.** v2 cannot tell a user *why* something was recommended. The ranking score is a number. There is no traversable reasoning path from "you liked X" to "therefore Y."

**Natural-language search.** The current Browse/Search surface uses TMDb's text-matching API. A user searching for "something like Fleabag but darker" gets no useful results. Semantic search over embeddings would improve this, but embeddings alone handle single-hop similarity. Multi-hop queries ("dark comedies set in workplaces where the protagonist is morally grey") require structured knowledge to resolve.

**Conversational discovery.** Phase 7 in the v2 Strategy describes this as "built on top of v2 infrastructure, using mood rooms as the primary mapping surface for natural-language queries." The Home & For You doc lists it as explicitly out of scope. No implementation detail exists.

### 1.3 Why these matter together

Semantic search, recommendation explanation, and conversational discovery share a common infrastructure requirement: structured, queryable knowledge about content relationships and user preferences that goes beyond vector similarity. A knowledge graph layer would serve all three use cases, making this a single infrastructure investment with three product payoffs.

---

## 2. Landscape Review

Five tools were evaluated in April 2026. They fall into two categories.

### 2.1 Conversational memory layers (Mem0)

**Mem0** (mem0.ai) extracts structured "memories" from chat history (e.g. "user is vegetarian") and stores them as searchable embeddings for injection into future LLM prompts. It compresses long conversation histories into compact factual nuggets to reduce token costs.

**Assessment for Videx:** Poor fit. Mem0 solves a conversational memory problem. Videx captures preferences through structured UI signals (thumbs up, watchlist, impressions), not through chat. There is no conversation to compress. The managed platform pricing ($19-249/month) adds cost for a problem that does not exist in the current product.

**Open-source option:** Mem0 OSS uses Qdrant + OpenAI embeddings. This would introduce a second vector store alongside pgvector for limited additional value.

### 2.2 Knowledge graph frameworks (Zep/Graphiti, Cognee)

**Graphiti** (github.com/getzep/graphiti, Apache 2.0, ~23K GitHub stars) is a Python framework for building temporally-aware knowledge graphs. It ingests data as "episodes" (text, messages, or structured JSON), uses LLM-powered extraction to identify entities and relationships, and stores them in a graph database (Neo4j, FalkorDB, or Kuzu). Key differentiators:

- **Bi-temporal model:** tracks both when an event occurred and when it was ingested, enabling point-in-time queries. Old facts are invalidated (not deleted) when new information contradicts them.
- **Hybrid retrieval:** combines semantic embeddings, BM25 keyword search, and graph traversal for sub-second queries.
- **Custom entity types:** domain-specific entities via Pydantic models.
- **Multiple graph DB backends:** including Kuzu, an embedded graph engine requiring zero additional infrastructure.
- **Supports structured JSON ingestion:** can ingest pre-structured data alongside unstructured text.

**Zep** (getzep.com) is the managed commercial platform built on Graphiti. Flex plan starts at $25/month (20K credits). Adds dashboards, SDKs, and managed infrastructure.

**Cognee** (cognee.ai) positions itself as a "knowledge engine that learns" with custom ontologies, self-improvement from feedback, and 30+ data source integrations. GDPR-compliant (Berlin-based). More ambitious scope than Graphiti: data warehouse integration, agentic framework connectors, multi-tenant architecture.

**Assessment for Videx:** Cognee is enterprise-grade infrastructure. The Developer plan ($35/month for 1K documents) and Team plan ($200/month) are priced for teams, not solo developers. The breadth of features (data warehouses, multi-tenant, 30+ connectors) is overkill. Graphiti provides the core temporal knowledge graph capability with less operational overhead.

### 2.3 Stateful agent frameworks (Letta)

**Letta** (formerly MemGPT) is a persistent agent framework where each agent maintains its own memory, context, and persona across sessions. Background "subagents" optimise prompts and context over time.

**Assessment for Videx:** Letta solves a different problem entirely. It would be relevant if Videx built a persistent AI assistant that users converse with. That is a product direction decision, not a recommendation engine improvement. Pricing ranges from free to $200/month for power users.

### 2.4 Summary matrix

| Tool | Category | OSS? | Graph DB | Videx fit | Monthly cost (managed) |
|---|---|---|---|---|---|
| Mem0 | Chat memory | Yes (Qdrant) | No | Poor | Free-$249 |
| Graphiti | Temporal KG | Yes (Apache 2.0) | Neo4j/FalkorDB/Kuzu | Strong | Free (OSS) |
| Zep | Managed Graphiti | No | Managed | Moderate | $25-475 |
| Cognee | Knowledge engine | Yes | Neo4j/Kuzu/others | Moderate (overkill) | $35-200 |
| Letta | Agent framework | Yes | N/A | Poor | Free-$200 |

**Leading candidate: Graphiti (OSS) with Kuzu embedded backend.**

---

## 3. Proposed Architecture

### 3.1 Design principle: complement, not replace

The knowledge graph layer sits alongside the existing v2 embedding pipeline. It does not replace pgvector, the ranking pipeline, or the taste vector. Instead, it adds a structured semantic layer that enables new product surfaces.

```
v2 (existing)                          v3 (new layer)
─────────────                          ──────────────
user_interactions ──→ taste vector     user_interactions ──→ Graphiti episodes
titles.embedding  ──→ cosine sim       content metadata  ──→ entity/relationship graph
ranking pipeline  ──→ For You rows     NL query          ──→ hybrid graph search
                                       graph traversal   ──→ recommendation explanation
```

### 3.2 Data flow

**Ingestion (batch, not real-time):**

1. A scheduled Python job (GitHub Actions cron, matching the existing mood rooms pattern) reads recent `user_interactions` events from Supabase.
2. Each interaction is formatted as a Graphiti episode (structured JSON: user_id, content_id, event_type, timestamp, plus content metadata from `titles`).
3. Graphiti extracts entities (users, titles, genres, directors, actors, thematic concepts) and relationships (watched, loved, dismissed, similar_to, directed_by, stars_in).
4. The temporal graph updates incrementally. Old preference edges are invalidated when contradicted (e.g. a user who loved horror but now consistently dismisses it).

**Retrieval (real-time):**

1. For semantic search: user's NL query hits Graphiti's hybrid search (semantic + BM25 + graph traversal), returning ranked content entities.
2. For recommendation explanation: given a recommended title, traverse the graph from user to title to find the reasoning path.
3. For conversational discovery: LLM receives user query + Graphiti search results as context, generates a natural-language response with specific title recommendations.

### 3.3 Graph DB choice

**Kuzu (embedded)** is the recommended starting point. It requires no additional infrastructure: the graph is a local file on disk, initialised with `KuzuDriver(db='/path/to/graphiti.kuzu')`. This matches the solo-developer constraint and avoids adding Neo4j or FalkorDB to the stack.

If the graph grows beyond what embedded Kuzu handles comfortably, FalkorDB (Redis-compatible, lightweight Docker container) is the next step up.

---

## 4. Use Cases

### 4.1 Semantic search (Browse/Search upgrade)

**Current state:** TMDb text-matching API. Query "dark comedy" returns titles with those words in the title or overview.

**With knowledge graph:** Query "dark comedy about a dysfunctional family" hits Graphiti's hybrid search, traverses genre nodes, thematic concept nodes ("dysfunctional family", "dark humour"), and returns titles connected to those entities. Results are ranked by graph distance from the query concepts and filtered by the user's subscribed services.

### 4.2 Recommendation explanation

**Current state:** "Recommended for You" row with no explanation.

**With knowledge graph:** Each recommended title has a traversable path: User → loves → "tense workplace drama" → contains → *Industry*. The path is rendered as a natural-language explanation: "Because you loved Succession and The Bear — tense dramas about power in professional settings."

### 4.3 Conversational discovery

**Current state:** Does not exist. Referenced as Phase 7 in v2 Strategy.

**With knowledge graph:** A chat interface where users describe what they want in natural language. The LLM uses Graphiti search results as grounded context to recommend specific titles available on the user's services. Mood rooms (from v2 Phase 4.5) serve as a mapping surface for vague queries.

---

## 5. Cost Analysis

### 5.1 Infrastructure costs

| Component | Option A: Graphiti + Kuzu (recommended) | Option B: Graphiti + FalkorDB | Option C: Zep managed |
|---|---|---|---|
| Graph database | £0 (embedded file) | £0 (Docker on existing server) or ~£5/month (small VPS) | Included |
| Graphiti library | £0 (Apache 2.0) | £0 (Apache 2.0) | N/A |
| Platform fee | £0 | £0 | ~£20/month (Flex) |

### 5.2 LLM costs (the main variable)

Graphiti uses LLM calls during episode ingestion for entity extraction, edge extraction, deduplication, and contradiction detection. This is the primary cost driver.

**Per-episode cost estimate:**

Each `add_episode` call triggers multiple LLM calls (entity extraction, edge extraction, deduplication). Based on community reports, a single episode can consume several thousand tokens across these calls. Using `gpt-4o-mini` ($0.15/1M input, $0.60/1M output) as the LLM backend:

- Estimated cost per episode ingestion: ~£0.001-0.005 (1-5 thousandths of a penny)
- This varies significantly based on episode complexity and graph size

**Monthly cost modelling for Videx:**

| Scenario | Interactions/month | Episodes ingested | Est. LLM cost | Embedding cost | Total LLM+embedding |
|---|---|---|---|---|---|
| 2 prototype users | ~200 | ~200 | ~£0.20-1.00 | ~£0.01 | ~£0.21-1.01 |
| 50 early users | ~5,000 | ~5,000 | ~£5-25 | ~£0.25 | ~£5.25-25.25 |
| 500 users | ~50,000 | ~50,000 | ~£50-250 | ~£2.50 | ~£52.50-252.50 |

**Important caveat:** These are rough estimates. The GitHub issue #1193 on the Graphiti repo highlights that LLM cost per episode is a known concern for high-volume use cases. The issue asks about bypassing Graphiti's extraction pipeline for pre-structured data (using `add_fact_triple` instead of `add_episode`). This is directly relevant to Videx, where interaction data is already structured.

### 5.3 Cost optimisation strategies

**Strategy 1: Use `add_fact_triple` for structured interactions.** Since `user_interactions` data is already structured (user_id, content_id, event_type, timestamp), we can skip Graphiti's LLM extraction entirely and ingest pre-formed triples. This eliminates the per-episode LLM cost for behavioural data. LLM calls would only be needed for NL query processing at retrieval time.

**Strategy 2: Batch ingestion with `add_episode_bulk`.** For content metadata (which does benefit from LLM extraction of thematic entities), use bulk ingestion to reduce overhead.

**Strategy 3: Use a cheaper LLM for extraction.** Graphiti supports `gpt-4o-mini` and Gemini Flash as alternatives to larger models. For entity extraction from structured data, smaller models are sufficient.

**Strategy 4: Ingest content metadata once, interactions as triples.** The 20K content catalogue is ingested once (one-time cost). Ongoing user interactions are ingested as pre-structured triples with zero LLM cost. Only NL queries at retrieval time incur LLM costs.

**Estimated cost with Strategy 1+4 (recommended):**

| Component | One-time | Monthly (50 users) | Monthly (500 users) |
|---|---|---|---|
| Content catalogue ingestion (20K titles) | ~£10-50 | £0 | £0 |
| User interaction triples | £0 | £0 | £0 |
| NL search queries (~5 per user/month) | £0 | ~£0.50-2.50 | ~£5-25 |
| Embedding for search queries | £0 | ~£0.01 | ~£0.10 |
| **Total** | **~£10-50** | **~£0.51-2.51** | **~£5.10-25.10** |

This brings the ongoing cost to roughly the same order as the existing OMDB API and SA API costs.

### 5.4 Build-your-own comparison

An alternative to Graphiti is building a lightweight knowledge graph directly in Supabase using standard relational tables (entities, relationships, with timestamps). This avoids all external dependencies.

| Aspect | Graphiti + Kuzu | Build on Supabase |
|---|---|---|
| Graph traversal | Native (Cypher-like queries) | Manual recursive CTEs or application-level traversal |
| Temporal invalidation | Built-in bi-temporal model | Must be hand-built |
| Entity resolution | LLM-powered deduplication | Manual or rule-based |
| Hybrid search | Semantic + BM25 + graph traversal | pgvector similarity only (no graph traversal) |
| New dependency | Python + Kuzu file | None |
| Dev effort | Low (library handles graph logic) | High (build temporal graph engine from scratch) |
| Maintenance | Track Graphiti releases | Own all maintenance |

**Recommendation:** Graphiti is worth the dependency for the temporal logic and hybrid search alone. Building equivalent functionality from scratch would take weeks and produce an inferior result. The Kuzu backend keeps infrastructure minimal.

### 5.5 Scaling projections (50 to 5,000 users)

Using the recommended Strategy 1+4 (pre-structured triples for interactions, one-time content ingestion, LLM calls only at retrieval time):

| Scale | Users | Interactions/month | NL searches/month | Graph nodes (est.) | Graph edges (est.) | Monthly LLM cost | Kuzu file size (est.) | Total monthly |
|---|---|---|---|---|---|---|---|---|
| Prototype | 2 | ~200 | ~10 | ~20,500 | ~1,000 | ~£0.02 | ~5-10 MB | **~£0.02** |
| Early adopters | 50 | ~5,000 | ~250 | ~21,000 | ~10,000 | ~£0.50 | ~15-30 MB | **~£0.51** |
| Growth | 500 | ~50,000 | ~2,500 | ~25,000 | ~80,000 | ~£5 | ~50-100 MB | **~£5.10** |
| Scale | 2,000 | ~200,000 | ~10,000 | ~35,000 | ~300,000 | ~£20 | ~200-400 MB | **~£20.40** |
| Target | 5,000 | ~500,000 | ~25,000 | ~50,000 | ~700,000 | ~£50 | ~500 MB - 1 GB | **~£51** |

**Assumptions behind these numbers:**

- ~100 interactions per active user per month (thumbs, watchlist, watched, dismissed, impressions aggregated)
- ~5 NL search queries per active user per month (conservative; many users will use traditional browse)
- Each NL search query consumes ~2,000 tokens input + ~500 tokens output via `gpt-4o-mini` ($0.15/1M in, $0.60/1M out) = ~£0.0006 per query
- Retrieval itself (hybrid search over the graph) uses zero LLM calls; only the final NL response generation requires an LLM
- Content nodes grow slowly (~20K base + new titles from daily sync, perhaps 2-3K/year)
- User nodes scale linearly; edge count grows as users x interactions
- Kuzu file size estimated from graph DB benchmarks at ~10-20 bytes per edge including indexes

**Kuzu scaling headroom:** Kuzu is benchmarked on the LDBC SF100 dataset (280M nodes, 1.7B edges) on a single machine. Videx at 5,000 users would have roughly 50K nodes and 700K edges, which is orders of magnitude below Kuzu's demonstrated capacity. The embedded file would remain under 1 GB. There is no scaling concern at any realistic Videx user count.

**If Kuzu becomes insufficient (unlikely below 100K users):** FalkorDB in a Docker container is the next step. It adds ~£5/month for a small VPS and supports the same Graphiti API. No code changes required beyond swapping the driver constructor.

**Retrieval latency at scale:** Graphiti's hybrid search avoids LLM calls at retrieval time entirely. It combines semantic embeddings, BM25 keyword search, and graph traversal, all of which use indexes that provide near-constant-time access regardless of graph size. P95 retrieval latency is approximately 300ms based on published benchmarks. At 5,000 users, with concurrent searches likely in single digits, this is well within acceptable bounds.

### 5.5.1 Extended scaling: 10,000 to 100,000 users

| Scale | Users | Interactions/month | NL searches/month | Graph edges (est.) | Kuzu file size (est.) | Monthly LLM cost (NL queries only) | Total monthly |
|---|---|---|---|---|---|---|---|
| 10,000 | 10K | 1M | 50K | 1.5M | 1-2 GB | ~£100 | **~£100** |
| 25,000 | 25K | 2.5M | 125K | 4M | 3-5 GB | ~£250 | **~£250** |
| 50,000 | 50K | 5M | 250K | 8M | 6-10 GB | ~£500 | **~£500** |
| 100,000 | 100K | 10M | 500K | 15M | 12-20 GB | ~£1,000 | **~£1,000** |

**Assumptions (same model, extended):**

- 100 interactions per active user per month (not all users are active; assume 60% MAU at higher scales, so 100K users = ~60K active)
- 5 NL search queries per active user per month
- Pre-structured triple ingestion for interactions (zero LLM cost)
- `gpt-4o-mini` for NL response generation at $0.15/1M input, $0.60/1M output
- Graph nodes grow slowly (content catalogue + user nodes); edges are the main growth driver
- Kuzu file size at ~1.5 bytes per edge (Kuzu's columnar storage is more compact than the 10-20 bytes estimated earlier for less optimised stores)

**Does Kuzu hold up at 100K users?**

Yes, comfortably. At 100K users the graph would contain roughly 15M edges and ~120K nodes. Kuzu is benchmarked at 280M nodes and 1.7B edges (LDBC SF100). The Videx graph at 100K users is roughly 0.04% of Kuzu's demonstrated capacity. The file would be 12-20 GB, fitting easily on any server disk.

The real constraint at this scale is not Kuzu's capacity but **concurrency**. Kuzu is an embedded (in-process) database. It handles concurrent reads well via multi-threaded query execution, but it assumes a single process owns the file. At 100K users, you would likely have multiple concurrent NL search requests. This is manageable if the search process is a single long-running server (e.g. a lightweight Python API on a VPS), but breaks down if you try to serve from stateless Edge Functions that each open the file independently.

**Migration thresholds and what triggers them:**

| Threshold | Trigger | Action | Cost impact |
|---|---|---|---|
| ~5,000 users | Kuzu file needs to be served by a persistent process (not Edge Functions) | Deploy a lightweight Python API (FastAPI) on a small VPS (e.g. Hetzner CX22, ~£4/month) hosting the Kuzu file and Graphiti search | +£4-8/month |
| ~20,000 users | Concurrent search load exceeds what a single-process Kuzu instance handles comfortably (~50+ concurrent queries) | Migrate from Kuzu to FalkorDB (Docker). Graphiti supports this as a driver swap, no application code changes. FalkorDB is Redis-protocol based, handles concurrent connections natively | +£10-20/month (VPS with more RAM) |
| ~50,000 users | FalkorDB on a single VPS hits memory/CPU limits for the graph size + query load | Scale VPS (e.g. Hetzner CX42, 16GB RAM, ~£15/month) or move to FalkorDB Cloud managed service | +£15-50/month |
| ~100,000 users | Need for high availability, redundancy, multi-region | Move to Neo4j AuraDB Professional (~£65/month for small instance) or FalkorDB Cloud Pro (~£350/month for HA). At this scale, the product likely has revenue to support this | +£65-350/month |

**The key point:** each migration is a driver swap in Graphiti, not an application rewrite. The code that ingests data and runs searches remains the same. Only the `graph_driver` constructor changes:

```python
# Phase 1: Kuzu (0-20K users)
driver = KuzuDriver(db='/path/to/graphiti.kuzu')

# Phase 2: FalkorDB (20K-50K users)
driver = FalkorDriver(host='localhost', port=6379)

# Phase 3: Neo4j (50K+ users)
driver = Neo4jDriver(uri='bolt://...', user='neo4j', password='...')
```

No Graphiti API changes, no query rewrites, no data model changes. This is the primary reason Graphiti is the recommended framework over a bespoke build: it abstracts the graph DB layer, giving you a clean upgrade path.

**LLM cost at 100K users: the real scaling concern.**

At 100K users, the LLM cost for NL search responses (~£1,000/month) becomes the dominant expense. Infrastructure costs (graph DB, VPS) are comparatively small. Cost reduction strategies at this scale:

1. **Cache frequent queries.** "dark comedy", "something like Breaking Bad", "family-friendly animation" will recur. Cache the NL response for identical or near-identical queries (embed the query, check similarity against cache). This could reduce LLM calls by 30-50%.
2. **Use OpenAI Batch API.** For non-real-time NL queries (e.g. pre-computing "explanation" text for recommendations shown on For You), the Batch API provides 50% off both input and output tokens.
3. **Model routing.** Use `gpt-4o-mini` for simple queries, escalate to a larger model only for complex multi-hop queries. Most queries ("show me thrillers on Netflix") are simple.
4. **Switch to cheaper models.** By the time Videx reaches 100K users, cheaper models will exist. LLM pricing has dropped ~99% over 3 years (GPT-3 era to present). This trend continues.

**With caching and batch API at 100K users, realistic LLM cost: ~£400-600/month.**

**Total cost projection at 100K users (realistic):**

| Component | Monthly cost |
|---|---|
| Graph DB (Neo4j AuraDB or FalkorDB Cloud) | £65-350 |
| VPS for search API | £15-30 |
| LLM for NL responses (with caching) | £400-600 |
| OpenAI embeddings for search queries | £5-10 |
| **Total** | **~£485-990/month** |

At 100K users, the app would need to be generating revenue. £500-1,000/month for the entire knowledge graph + NL search infrastructure is reasonable as a proportion of operating costs for a product at that scale.

### 5.5.2 LLM provider options and cost comparison

The cost projections above assume `gpt-4o-mini`. OpenAI is the safe default because Graphiti is optimised for it (structured output support is best), but it is far from the cheapest option. Graphiti natively supports OpenAI, Google Gemini, Anthropic, Groq, and any OpenAI-compatible API (DeepSeek, Ollama/local models, Mistral via OpenRouter, etc.).

There are two distinct LLM use cases in this architecture, and they can use different providers:

**Use case 1: Content ingestion (one-time, batch).** Extracting entities and relationships from the 20K title catalogue. This is a one-off batch job where latency is irrelevant and quality matters moderately. Best candidate for cheap/batch providers.

**Use case 2: NL search response generation (real-time, user-facing).** Turning graph search results into a natural-language answer. This is user-facing, so latency and quality matter more. Still a simple task (summarise these results for the user), so mid-tier models suffice.

**Current pricing comparison (April 2026, per 1M tokens, input/output):**

| Provider / Model | Input | Output | Structured output? | Graphiti support | Best for |
|---|---|---|---|---|---|
| OpenAI `gpt-4o-mini` | $0.15 | $0.60 | Yes (native) | Native client | Default safe choice |
| OpenAI `gpt-4.1-nano` | $0.10 | $0.40 | Yes (native) | Native client | Cheapest OpenAI; batch ingestion |
| Google `Gemini 2.5 Flash` | $0.15 | $0.60 | Yes (native) | Native Gemini client | Equivalent to 4o-mini; free tier available |
| Google `Gemini 2.5 Flash Lite` | $0.075 | $0.30 | Yes | Native Gemini client | Cheapest major-provider option for simple tasks |
| DeepSeek V3.2 | $0.14 | $0.28 | Via OpenAI-compat | OpenAIGenericClient | Cheapest high-quality hosted API |
| Mistral Small | $0.20 | $0.60 | Via OpenAI-compat | OpenAIGenericClient | EU data residency option |
| Groq (Llama 3.1 70B) | Free tier / $0.59 | $0.79 | Partial | Native Groq client | Fast inference; free tier for prototyping |
| Ollama (local, e.g. Llama 4) | £0 (compute only) | £0 (compute only) | Partial (model-dependent) | OpenAIGenericClient | Zero API cost; requires VPS with GPU |

**What this means for the cost projections:**

Taking the 100K user scenario (500K NL search queries/month, ~2,000 input + ~500 output tokens each):

| Provider | Monthly NL search cost | vs. gpt-4o-mini baseline |
|---|---|---|
| OpenAI `gpt-4o-mini` | ~£1,000 | Baseline |
| OpenAI `gpt-4.1-nano` | ~£700 | -30% |
| Google `Gemini 2.5 Flash Lite` | ~£375 | -63% |
| DeepSeek V3.2 | ~£280 | -72% |
| Ollama (self-hosted, Llama 4) | ~£30-50 (VPS cost only) | -95% |

**Recommendations by stage:**

**Spike and prototype (0-50 users):** Use `gpt-4o-mini`. It's the path of least resistance with Graphiti, has the best structured output support, and the cost at this scale is negligible (under £1/month). Google Gemini's free tier (1,500 requests/day) is also worth testing during the spike as it would cost literally nothing.

**Early growth (50-5,000 users):** Stay with `gpt-4o-mini` or switch to `Gemini 2.5 Flash`. Monthly costs are still under £50, so optimising the provider is premature. Focus engineering effort on the product, not on saving £10/month.

**Scale (5,000-50,000 users):** Switch NL response generation to `Gemini 2.5 Flash Lite` or `DeepSeek V3.2`. At this scale, the provider choice saves £200-600/month. Both are supported by Graphiti via their respective clients. Test quality during the spike to confirm they handle the Videx use case acceptably.

**High scale (50,000-100,000 users):** Evaluate self-hosting via Ollama on a GPU VPS. A Hetzner GPU server (e.g. GX11 with an A16 GPU) costs roughly £40-60/month and can run Llama 4 or equivalent locally, reducing per-query LLM cost to effectively zero. The trade-off is operational complexity (maintaining a GPU server, model updates). Only worth it if LLM costs exceed £300-400/month.

**Important caveat on structured output:** Graphiti explicitly warns that it works best with LLM services supporting structured output (OpenAI and Gemini). Other providers may produce incorrect output schemas during ingestion, particularly with smaller models. For the NL response generation use case (Use case 2), structured output is less critical since you're generating free-text answers. For content ingestion (Use case 1), stick with OpenAI or Gemini.

**Mixing providers is supported.** Graphiti allows different LLM clients for different operations. You could use `gpt-4o-mini` for content ingestion (where structured output quality matters) and `DeepSeek V3.2` for NL search responses (where it doesn't). This is the optimal cost configuration at scale.

**The trend line matters more than current prices.** LLM API pricing has dropped roughly 80% between early 2025 and early 2026. By the time Videx reaches 50K-100K users (likely 2-3 years from now), current pricing will look quaint. Designing the architecture to be provider-agnostic (which Graphiti already is) is more valuable than optimising for any single provider's current rates.

### 5.6 Relationship to existing infrastructure

**This layer does not replace any existing v2 infrastructure.** It adds a new capability on top. Here is the explicit mapping:

| Existing component | Status with v3 | Rationale |
|---|---|---|
| pgvector (content embeddings) | **Stays** | Still powers the core ranking pipeline, "More Like This", and mood room clustering |
| Taste vector (user embeddings) | **Stays** | Still the mathematical representation of accumulated user preference |
| Ranking pipeline (60/25/15 weights) | **Stays** | Still generates For You and recommendation rows |
| Mood rooms (HDBSCAN clusters) | **Stays** | Still the primary discovery surface; knowledge graph enriches them with NL access |
| TMDb API | **Stays** | Still the source for content metadata and discovery queries |
| OMDB API | **Stays** | Still the source for Rotten Tomatoes scores |
| Streaming Availability API | **Stays** | Still the source for deep links and availability data |
| `user_interactions` table | **Stays** | Still the immutable event log; knowledge graph reads from it, does not replace it |
| `card_impressions` table | **Stays** | Still the impression tracking infrastructure |

**What the knowledge graph adds (new, additive):**

- Semantic search over content (queries Browse/Search cannot handle today)
- Recommendation explanations (traversable reasoning paths)
- Conversational discovery interface (Phase 7, new product surface)
- Structured representation of preference evolution over time

**No existing API is replaced or deprecated.** The knowledge graph is a consumer of existing data, not a replacement for any data source.

### 5.7 Technical debt considerations

Adding a knowledge graph layer introduces new dependencies and maintenance surface. This section explicitly addresses the debt implications.

**New dependencies introduced:**

| Dependency | Type | Maintenance burden | Mitigation |
|---|---|---|---|
| `graphiti-core` Python package | Runtime | Track releases, test upgrades | Pin version, upgrade quarterly |
| Kuzu embedded DB | Runtime (file on disk) | Minimal; embedded, no server | MIT-licensed, actively maintained, backed by academic research |
| OpenAI API (for NL query responses) | Runtime | Already a dependency for content embeddings | Shared API key, no new account needed |
| Python runtime | Build/CI | Already present for HDBSCAN mood rooms cron | Shared environment |
| GitHub Actions cron (ingestion job) | CI/CD | Already present for mood rooms | Same pattern, separate workflow file |

**Debt mitigation principles:**

1. **No new server infrastructure.** Kuzu is an embedded file. No Docker containers, no managed databases, no new cloud services. The graph lives alongside the codebase as a file managed by the ingestion cron job.

2. **Single integration point.** The knowledge graph reads from `user_interactions` and `titles` in Supabase. It does not write back to Supabase. The only output path is search results returned to the client via an Edge Function or lightweight API endpoint. This keeps the data flow unidirectional and simple.

3. **Graceful degradation.** If the knowledge graph is unavailable (ingestion fails, Kuzu file corrupted, cron job down), the app continues to function normally. All existing recommendation surfaces (For You, mood rooms, "More Like This") are powered by pgvector and the ranking pipeline, which are unaffected. Semantic search and conversational discovery degrade, but these are additive features.

4. **No schema coupling.** Graphiti manages its own graph schema within Kuzu. It does not modify the Supabase schema. No new migrations, no new RLS policies, no interaction with pg_partman. The two systems are decoupled.

5. **Reuse existing patterns.** The ingestion job follows the exact same pattern as the mood rooms HDBSCAN cron: Python script, GitHub Actions workflow, reads from Supabase via `psycopg2`, writes to a separate store. This is a proven pattern in the Videx codebase.

6. **Clear ownership boundary.** Graphiti owns: entity extraction, graph storage, hybrid search. Videx owns: interaction data, content metadata, ranking, UI. The boundary is the data flowing in (Supabase rows) and the search results flowing out (ranked entities).

**What to watch for (potential debt sources):**

- **Graphiti API stability.** The library is at v0.27.x (pre-1.0). Breaking changes are possible. Pin the version and test before upgrading.
- **Kuzu file management.** The graph file needs to be accessible to whatever process runs the ingestion and search. If the ingestion runs on GitHub Actions and the search runs on an Edge Function, the file needs to be stored somewhere both can access (e.g. Supabase Storage, or a small persistent volume). This is a deployment detail to resolve during the spike.
- **LLM model deprecation.** If `gpt-4o-mini` is deprecated, the extraction and NL generation prompts need updating. Graphiti supports multiple LLM providers, so switching is straightforward.
- **Graph size over years.** At 5,000 users over 3 years, the graph could accumulate several million edges. Kuzu handles this comfortably, but old edges should be periodically pruned (Graphiti's temporal invalidation handles this naturally by marking old edges invalid rather than deleting them; a periodic cleanup job could compact truly ancient data).

---

## 6. Prerequisites from v2

Before this work begins, the following must be true:

1. **v2 Phase 6 (Launch) is complete.** All core recommendation infrastructure is live and stable.
2. **Tier 1 metrics have a baseline.** Detail-view rate, watchlist conversion rate, and deep-link CTR are measured for at least 4-6 weeks post-launch. Without this, there is no way to measure whether the knowledge graph layer improves outcomes.
3. **Card impression tracking is operational.** The `card_impressions` table and client-side batching are producing reliable data. This is the foundation for evaluating any new recommendation surface.
4. **Mood rooms are live (Phase 4.5).** Conversational discovery uses mood rooms as a mapping surface. They must exist first.
5. **Content embeddings are stable (Phase 1).** The 1536D embeddings in pgvector are the foundation the knowledge graph enriches.
6. **Videx tags exist (Phase 1.5, if completed).** LLM-generated enrichment tags on `titles` provide richer content metadata for graph ingestion. If Phase 1.5 has not shipped, the knowledge graph can still ingest raw TMDb metadata, but thematic entity extraction will be less precise.

---

## 7. Spike Scope

### 7.1 Objective

Validate that Graphiti + Kuzu can ingest Videx content and interaction data and produce useful graph structures for semantic search and recommendation explanation.

### 7.2 Tasks

1. **Set up Graphiti with Kuzu locally.** `pip install graphiti-core[kuzu]`, configure with OpenAI API key.
2. **Ingest 500 titles as episodes.** Use `add_episode_bulk` with structured JSON (title, genres, overview, cast, director, keywords). Measure LLM cost and ingestion time.
3. **Ingest 200 synthetic interactions as fact triples.** Use `add_fact_triple` to create (User, watched, Title), (User, loved, Title), (User, dismissed, Title) relationships. Verify zero LLM cost.
4. **Test hybrid search.** Query "dark comedy about a dysfunctional family" and evaluate result quality against the pgvector-only baseline.
5. **Test graph traversal for explanation.** Given a user and a recommended title, traverse the graph to find the reasoning path. Evaluate whether the path produces a sensible natural-language explanation.
6. **Measure retrieval latency.** Target sub-500ms for search queries.
7. **Measure graph storage size.** Kuzu file size for 500 titles + 200 interactions, extrapolate to 20K titles.

### 7.3 Success criteria

- Hybrid search returns more relevant results than pgvector cosine similarity alone for NL queries.
- Graph traversal produces at least 3 sensible recommendation explanations from 5 test cases.
- Retrieval latency is under 500ms.
- Per-episode ingestion cost for content metadata is under £0.01.
- `add_fact_triple` for interactions incurs zero or negligible LLM cost.

### 7.4 Estimated effort

2-3 days of focused work. Python scripting (consistent with the mood rooms HDBSCAN pattern).

---

## 8. Open Questions

1. **Does `add_fact_triple` fully bypass LLM calls?** The Graphiti docs are ambiguous on whether deduplication/resolution still triggers LLM calls when UUIDs are controlled. The spike must validate this.
2. **How does Kuzu perform at 20K entities + 100K relationships?** Extrapolation from the 500-title spike will inform this, but production-scale testing may be needed.
3. **Where does the Graphiti process run?** Options: GitHub Actions cron (matching mood rooms pattern), Supabase Edge Function (150s timeout constraint), or a lightweight scheduled job on a VPS. The batch nature of ingestion favours cron.
4. **How is the NL search interface exposed to users?** Options range from a simple search bar upgrade (lowest effort) to a full chat interface (highest effort). The search bar upgrade is the likely first step.
5. **How do Graphiti's entity types map to Videx's domain?** Custom Pydantic entity types for Title, User, Genre, Director, Actor, ThematicConcept need to be designed during the spike.
6. **What LLM model is optimal for entity extraction?** `gpt-4o-mini` is the likely choice for cost reasons, but extraction quality must be validated.
7. **How does the knowledge graph interact with delivery sliders?** The sliders (catalogue-age, comfort-zone, films-vs-TV, focused-varied) modify the ranking pipeline. Do they also constrain graph traversal? Likely yes, but the mechanism needs design.
8. **Is there a path from graph-based explanations to in-app UI?** The explanation text needs to be concise enough for a subtitle under a recommendation row. This is a design question as much as a technical one.

---

## 9. Dependencies on v2 Evaluation Data

The decision to proceed from spike to implementation depends on v2 performance data:

| v2 metric | Implication for v3 |
|---|---|
| Tier 1 metrics improve over v1 | v2 architecture is validated; knowledge graph is an enhancement, not a fix |
| Tier 1 metrics flat or worse | v2 needs debugging first; do not layer complexity on a broken foundation |
| High "Not Interested" rate | Users are seeing irrelevant recommendations; better explanation and NL search may help |
| Low deep-link CTR from detail page | Users are finding content but not committing; explanation may improve confidence |
| Mood rooms engagement data | If users engage with mood rooms, conversational discovery has a natural entry point |
| Search usage patterns | If users search frequently but convert poorly, semantic search upgrade is high-priority |

---

## 10. Future Considerations

**Collaborative filtering.** At ~10K MAU (per v2 Strategy Section 8.3), collaborative filtering becomes viable. A knowledge graph can represent user-to-user similarity through shared entity connections, providing a natural foundation for "users like you also watched" without building a separate CF pipeline.

**Content-to-content knowledge.** The graph can capture relationships that embeddings miss: franchise connections (MCU films), creator connections (same showrunner), thematic sequencing ("watch X before Y for context"). These are editorial-quality insights that improve recommendation quality.

**Privacy.** The knowledge graph stores explicit preference facts per user. GDPR right-to-erasure requires the ability to delete all nodes and edges for a given user_id. Graphiti's CRUD operations support node and edge deletion. This must be tested during the spike.

---

*End of strategy document v0.1. All content is exploratory. No decisions are locked. This document will be updated after the Graphiti spike is complete and v2 Tier 1 metrics are available.*
