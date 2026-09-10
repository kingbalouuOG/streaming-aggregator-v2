# Videx — Roadmap Review, 10 September 2026

**Status:** review for Joe's decision; not yet a v1.1 of the roadmap · **Reviews:** [Product Strategy & Roadmap v1.0](Videx_Product_Strategy_and_Roadmap_v1.0.md) (approved 6 July 2026) · **Evidence:** delivery audit of every H0/H1 item against merged PRs and the wiki; live production database on 2026-09-10; the September search research ([2026-09-08-002 §8](../plans/2026-09-08-002-recommendation-quick-filters-and-search-presets.md)); a fresh research brief on query understanding, voice input and UK service coverage (sources cited inline where they matter).

---

## 0. Verdict in five lines

1. **The engineering is further ahead than the July roadmap imagined, and the audience is exactly where it was.** v2.3.1 is stable, fast, natively current and correctly declared. Production has one real third-party user and two sign-ins in the last 30 days.
2. **H0's exit gate is still not met, eight weeks after its engineering was declared done.** The four non-engineering items (ICO registration, the 14-day closed test, the production-access application, the App Store review) have not moved. Store privacy forms were filed today. In the same eight weeks roughly seventy PRs of unplanned engineering landed, including the search work this session recommended.
3. **The July thesis was right and is now overdue: users are the critical path.** The roadmap diagnosed the problem correctly; execution routed around it. This review does not change the thesis. It changes the sequencing so the thesis cannot be routed around again.
4. **Your new emphasis on search and discoverability is compatible with the plan and belongs in H1, not H3.** The September work built the piece everything else attaches to: one intent object on Browse that typed text, preset taps and refine chips all resolve into. Natural language and voice are two more inputs onto that object, not new products. The research says the shipped form of "conversational" is describe-then-refine with prompt chips, which is what Browse now is.
5. **Service coverage is cheaper than the roadmap assumed.** The availability table already holds rows for seven services the app hides, and the vendor's UK catalogue has HBO Max, which launched in the UK in March and Videx does not list.

---

## 1. Where we are

### 1.1 Product and data (10 Sept 2026, live)

| | July roadmap | Today | Note |
|---|---|---|---|
| App | v2.0.2, internal tracks | **v2.3.1**, Play internal + TestFlight, natively current | Store privacy forms filed today; typegen and OTA plumbing now real |
| Titles | 22,864 | **34,577** (34,569 embedded; 30,629 available somewhere) | 11,713 added in the last 30 days: the August freeze repair drained the backlog |
| Availability rows | ~75K | **99,162** across 17 service ids | Buy 31K · subscription 27K · rent 22K · addon 12K · free 7K |
| Services surfaced | 10 | **10** | The table already holds Pluto TV (196), Hotstar (152), Discovery+ (128), Zee5 (121), MUBI (48), Crunchyroll (16), Curiosity (16) rows the app never shows |
| Leaving-soon dates | ~2,000 | 1,382 future `expires_on` rows | Alert raw material still exists |
| Pipeline | frozen since 7 June | **healthy**: daily incremental completing since the 8 Sept move to the vendor's direct channel; backfill draining; health check in CI | SA API quota is a hard wall with no pay-as-you-go (R-032) |
| Engine | v2 hardened | + engagement fatigue, ordering rotation, longer rows, recency floor in the vector RPC, MMR cap | Cold-open latency fixed by the warm cron and the Home aggregator |
| Search | keyword + flag-gated moods | keyword · **one-intent Browse** · 8 presets · refine row · title-hit routing · free-text semantic behind the flag · search logging with 30-day retention | Semantic flag remains internal-only, deliberately |
| Notifications | none | built, credentialed, device-verified (July); 10 tokens, 5 deliveries | The wiki architecture page and IN-SL-003 still say "blocked on credentials". That is stale: the device-test checklist recorded FCM V1 + APNs as verified on 13 July. No evidence yet of a real, non-seeded alert firing |
| Share + title pages | none | live on videxstreaming.com | |

### 1.2 Users (the honest bit, again)

| | July | Today |
|---|---|---|
| Registered | 5 | 14 profiles, of which 6 are Joe's accounts, 6 are empty test shells, 1 is the store-review account, **1 is a real person** (signed up 21 June, three active days over two months) |
| Sign-ins, last 30 days | — | 2 |
| Interactions | 68 total | 280 total, 99 in the last 30 days |
| Deep-link clicks, last 30 days | — | 3 |
| Watchlist rows | 7 | 19 |
| Availability reports | 0 | 1 |
| Search rows | 0 | 52 (one user) |

Nothing here can measure activation, retention or engine quality. The ENG-2 data gate is as far away as it was in July.

### 1.3 H0 exit gate, item by item

| Gate item | Status | Evidence |
|---|---|---|
| ICO registration | **not started** | No number in the policy; checklist §A unticked; no wiki entry since July |
| Contact details, hosted policies, policy text | done | videxstreaming.com; `privacy@` route; July |
| Store forms consistent with policy | **done today** | Joe filed both, 10 Sept, with search history declared |
| Funnel + crash instrumentation | done | PR #51; Sentry sessions confirmed |
| Arrival + leaving-soon alerts firing on real data | built and device-verified; **no real firing observed** | 5 deliveries, all from testing |
| Share → title page → store round-trip | done | July |
| Friends-and-family shakeout = Play closed test (12 testers, 14 days) | **not started** | A tester list exists on the Play account; no clock, no production-access application; CI still submits to the internal track |
| Crash-free ≥ 99% | unmeasurable | no cohort |
| Quiet v1 live on both stores | **blocked** on the three above | |

### 1.4 What shipped that the roadmap never planned (July → September)

Catalogue freeze repair and the speed/freshness plan (about 25 PRs) · the SA API quota incident and the move off RapidAPI · OTA and CI plumbing, including the Android update channel that had silently never existed · search logging, quick filters, presets, one-intent Browse, refine row, and their review and fixes (PRs #131–#151) · paid-titles row, delete-account page, marketing-site briefs · three releases to internal tracks.

All of it was worth doing. The freeze repair in particular was unavoidable: a catalogue frozen for 79 days would have sunk any beta. But none of it moved a single stranger through the app, and the roadmap's own rule was that every H1+ item must grow users, retention or revenue.

### 1.5 Stale records to fix when v1.1 is cut

- Roadmap §7 still shows pg_partman and pricing refresh as open; both closed 6 July.
- `notifications-v1.md` and IN-SL-003 say delivery is blocked on credentials; the checklist says verified. Reconcile.
- `next-steps.md` was last updated 13 July and predates everything in §1.4.
- The memory note used by planning sessions repeats the stale "blocked" claim; corrected alongside this review.

---

## 2. Has the priority shifted?

Joe's framing today: search and discoverability are the most critical thing; semantic, natural-language and dictated search should make it easy to just say what you want; a broader range of services should be considered.

**Where this agrees with the roadmap.** The vision (§4.1) already ends with a callable taste layer that answers "what should we watch tonight?" wherever it is asked. H3 Bet 1 is exactly the conversational surface. Semantic search sits in H1 (1.3). The wedge list (§3.4) leads with UK-first data quality, which is the service-coverage question.

**Where it appears to conflict.** Operating principle 3 says "recommendation-first, not search-first". Read literally, that argues against putting search at the centre. The research resolves this rather than forcing a choice:

- Discovery mostly starts outside the app (friends 56–68%, platform rows ~50%, social ~43%; 87% of UK 16–24s have started a show after a clip). Most in-app searches are retrieval of something already heard about. So a fast, accurate title lookup is the single most-used discovery feature, and it is search.
- "Easy search" is the most-valued feature (60% very important vs 31% for recommendations, Hub 2026). Failed search is where people leave (19% abandon, 29% of under-25s).
- Every conversational feature that has actually shipped is describe-then-refine with suggested chips, not a chat window. Netflix's mobile text-chat search stalled; its TV voice "Ask" launched with three canned intents, two of them constraint-led.

**The reconciliation.** Recommendation and search are not rivals; they are the two halves of one job, and the conversational layer is what joins them. Principle 3 should be restated as: **one question, any input.** Whether a user taps a chip, types a sentence, or says it out loud, it resolves to the same intent, runs through the same taste-aware retrieval, and returns the same kind of answer. The September work built that intent object. What is missing is two input adapters (query understanding for typed sentences, speech for spoken ones) and better retrieval for short queries. That is an H1-sized track, not an H3 bet.

**What has not shifted.** Users are still the critical path. A brilliant search with one user is unmeasurable, and the semantic flag cannot be flipped for the public on the strength of internal accounts. The search track and the user track have to run together, and the user track has to start first because its clocks are longer.

---

## 3. What is missing from the roadmap

1. **Query understanding is not named anywhere before H3.** It is the gate on H1 1.3 (the semantic flip), the fix for the measured failure (short typed sentences match surface words: "fast and fun" → Fast & Furious), the fix for IN-SL-012 (the title-hit scorer cannot tell a half-remembered name from a genre phrase), and the substrate for H3 Bet 1. It should be an H1 committed item with a design (§5.1).
2. **Voice input is absent.** It is cheap (an input adapter onto the same box), the research names a low-risk path, and it is the most literal version of "just say what you want". H1 committed, small.
3. **Service coverage is treated as fixed.** The roadmap mentions arthouse services only as "a catalogue question". The vendor's UK catalogue has 17 services including HBO Max; Videx surfaces 10 and already stores rows for 7 more. Adding a service is mostly an id mapping, a logo, a deep-link pattern and an onboarding tile. Two waves (§5.3).
4. **Retrieval quality for short queries has no plan.** pgvector alone is weak on short lexical queries; the standard fix is Postgres full-text search fused with the vector result by reciprocal rank fusion, then a cheap reranker. Supabase ships everything needed. Belongs with item 1.
5. **Search has no place in the metric tree.** The north star (weekly watch decisions) is right. Beneath it, search now has real instrumentation and no named metrics: zero-result rate, retrieval-vs-discovery split, described-route tap-through, preset tap share, voice share. Add a Tier-1 search row (§5.5).
6. **The four clock-bound items have no dates and no single owner list.** They are the reason nothing has moved. v1.1 should carry a dated close-out (§4).
7. **Data dependency is understated.** The SA API quota is a hard wall with no overage; the incident cost three days of catalogue. The tier ladder ($49 / $99 / $299 per month for 25K / 100K / 1M requests) needs to be in the cost floor, and the "verification network" idea in H3 Bet 4 is the only structural mitigation. Not a new item, but the risk row needs the numbers.
8. **The metrics dashboard was never stood up.** SQL exists; nobody reads it because there is nothing to read. It becomes real the day the closed test starts. Make it part of the weekly ritual, which also has not started.
9. **Monetisation plumbing (1.2) is in the wrong horizon for a product with one user.** Move it to H2 entry. Nothing is lost: it was always invisible plumbing, and doing it before there is traffic is capacity spent on a config change.
10. **The agent connector (H3 Bet 1) could be pulled forward as an experiment**, since query understanding gives it its tools for free and aggregators are currently invisible in assistant answers. Recommendation: keep it in H2 as a stretch pilot, not H1. It still needs auth plumbing and users to matter.

---

## 4. Close H0 first: a dated two-week close-out

None of this is engineering. It is the work the roadmap said was the critical path in July.

| When | Action | Owner |
|---|---|---|
| This week | Register with the ICO (self-serve, about £50/yr). Put the number in the policy. | Joe |
| This week | Promote v2.3.1 to the Play **closed** testing track and invite the 12+ testers already listed on the account. Start the 14-day clock. | Joe |
| This week | Update the two stale wiki pages (§1.5) and cut roadmap v1.1 from this review. | CC session |
| Week 2 | Weekly ritual begins: dashboard read, feedback triage, one two-hour growth block. | Joe, recurring |
| Day 14 | Apply for Play production access (about 7 days). Submit the same build for App Store review with the pre-submission guideline check. | Joe |
| Late October | Quiet v1 live on both stores. | |

If the closed test starts this week, the earliest public availability is roughly the third week of October. That still leaves the pre-Christmas marketing beat reachable, which is the single most time-sensitive thing in H1.

---

## 5. H1 replan (October–December 2026): "Grow, and make it easy to ask"

Capacity is unchanged at 6–16 hours a week. The July H1 had five committed items; this replaces two of them and adds a search track. It is not lighter. It is reordered so the people work cannot be displaced by the engineering work again.

### Committed

| # | Item | Size | Replaces / notes |
|---|---|---|---|
| 1.1 | **Community rollout + activation read + engine pulse** against the live listing. 30–50 stranger users. Written branch unchanged: pulse fails → cold-start iteration, no marketing beat. | M, recurring | unchanged |
| 1.2 | **Query understanding + hybrid retrieval** (§5.1). Worker-side, cached. Gate for the semantic flip. | M | replaces "monetisation plumbing", which moves to H2 |
| 1.3 | **Semantic search for everyone**: flip `search_semantic` on for new sign-ups once 1.2's eval passes on the short-sentence fixtures. | S once 1.2 lands | re-scoped: the fixture alone was never going to be enough |
| 1.4 | **Voice input** (§5.2). Mic button on Browse; transcript goes through the same pipeline as typed text. | S | new |
| 1.5 | **Service coverage wave 1** (§5.3): HBO Max, Discovery+, Crunchyroll, MUBI, Pluto TV from data already flowing. | M | new |
| 1.6 | **ASO iteration + review prompts + growth block** | S, recurring | unchanged |
| 1.7 | **Marketing beat**, pre-Christmas, once 1.1's pulse passes. Hook: "Describe it, or just say it. Videx finds what's worth watching across everything you pay for." | M | unchanged in slot; the search track gives it a story |

### Stretch

Service coverage wave 2 (NOW tiers as Sky Go alias; the free UK services via a second data source) · dedicated calendar screen · importers (dedup fix shipped, so unblocked) · the agent-connector pilot (four tools on the Worker: recommend-tonight, where-to-watch, add-to-watchlist, worth-it-this-month) if 1.2 lands early.

### Moved to H2 entry

Monetisation plumbing (`/out` redirector, server-verified entitlements, RevenueCat). Reason: no users, no revenue, and it was always designed to be invisible.

### Exit gate (revised)

Engine pulse passed on stranger users · marketing beat executed · semantic search on by default for new sign-ups with zero-result rate under 10% · voice used in ≥ 10% of Browse sessions that search · notification opt-in > 60% · W4 retention baseline known · per-channel growth numbers · ENG-2 data gate passed or in sight.

### 5.1 Query understanding and retrieval (design outline, for the implementing session)

**Step 1, parse.** One small-model call with a JSON schema returning two things: a `BrowseFilters` object (content type, genres, released window, runtime band, cost, min rating, services) and an `expanded_query`, a one-sentence hypothetical synopsis written the way title overviews are written. This is the HyDE pattern; it is why the long preset phrases retrieve well and the short sentences do not. Run it in the Worker. Start with Workers AI in JSON mode (Llama 3.1 8B or GLM-4.7-Flash; a parse costs roughly $0.00003 and sits inside the free daily allowance at current scale; no egress hop). Keep Claude Haiku 4.5 behind a per-user flag through AI Gateway for an A/B on mood nuance; it has the best comprehension and the highest latency (~0.8 s to first token). Cache the parse in KV by normalised query; the head of the distribution ("something funny", "scary but not gory") repeats heavily, so cached hits cost ~5 ms.

**Step 2, retrieve.** Keep `match_titles_by_vector` for the expanded query. Add a Postgres full-text query (`tsvector` on title + overview + cast; no extension needed on Supabase) for the raw text, and fuse the two lists by reciprocal rank fusion. Field reports put precision gains for short lexical queries at roughly 60% → 80%. Then apply the structured filters server-side (the released floor is already in the RPC; cost via `subscription_included_titles`; the rest as predicates).

**Step 3, rerank.** `bge-reranker-base` on Workers AI over the fused top 50. Roughly 100–200 ms and ~$0.003 per million input tokens.

**Budget.** Parse 300–800 ms uncached, ~5 ms cached; embed ~100 ms; hybrid query 50–150 ms; rerank 100–200 ms. Target p50 under one second, well under 500 ms on cache hits. Title lookups never enter this path: the confident-title-hit route stays first and stays instant.

**Where it plugs in.** `intent.text` → parse → `{filters, expanded_query}` merged into the same intent object Browse already holds. The refine row and the sheet keep working on the parsed filters. The "Reading that as a feeling" banner becomes "Looking for: [expanded_query], filtered by [chips]", which is also the explanation surface.

**Eval.** The 16-query fixture, plus the 30-day raw search log, plus a new set of 20 short sentences with known-good answers. Gate the flip on zero-result rate and on the short-sentence set returning at least one expected title in the top 10 for 80% of queries. Keep the known-title set as the build gate it already is.

### 5.2 Voice input

`expo-speech-recognition` (Expo 56 support, new-architecture safe; raises iOS minimum to 16.4). Request on-device recognition where `supportsOnDeviceRecognition()` is true; fall back to the OS server mode otherwise; `en-GB`. The transcript is dropped into the search box as typed text and settles like any other query, so logging, routing and parsing are unchanged. A mic button beside the search field and a long-press on the Browse tab.

Obligations: microphone and speech-recognition usage strings (the config plugin injects them); update both store privacy forms to declare audio for app functionality if the server-mode fallback is enabled, since audio may leave the device to Apple or Google in that mode; one line in the privacy policy §2. Do not ship an on-device Whisper model in v1: 40–150 MB and native build risk for unproven gains on search-length utterances.

### 5.3 Service coverage

**Wave 1 (from data the pipeline already delivers; no new API cost):** HBO Max (UK launch 26 March 2026; the vendor id is `hbo`), Discovery+, Crunchyroll, MUBI, Pluto TV. Per service: id mapping in `platformAdapter`, logo, deep-link pattern with search fallback, onboarding tile, Worker `VALID_SERVICE_IDS`, and a fingerprint pass so the per-service charts work. Note the vendor uses `all4` and `iplayer` where Videx uses `channel4` and `bbc`; the mapping layer already absorbs that.

**Wave 2 (needs a decision or a second source):** NOW tiers as the honest model for Sky Go (Sky Go mirrors NOW by tier; the vendor models NOW's add-ons). The UK free services the vendor does not carry (My5, U/UKTV Play, STV Player, S4C) need TMDb's watch-provider data blended in, which is JustWatch data with attribution and no deep links, so they would be "where to watch" without a working link. Decide whether partial coverage is better than none for free-to-air; the "Free to watch" preset makes the case for yes.

**Not worth adding:** BritBox (folded into ITVX, April 2024), Freevee (closed August 2025; content now under Prime free), Rakuten and the storefronts (rent/buy only, low taste value).

### 5.4 Flip conditions for `search_semantic`

Do not flip on preset behaviour. Flip for new sign-ups when: the short-sentence eval passes (§5.1), zero-result rate on the described route is under 10% over two weeks of internal use, p95 described-route latency is under 1.5 s, and the banner and "Search titles instead" escape remain in place. Existing users can be flipped in cohorts afterwards.

### 5.5 Search metrics (new Tier-1 row)

| Metric | Source | Why |
|---|---|---|
| Zero-result rate, by route | search rows, `result_count = 0` | the documented abandonment point |
| Retrieval vs discovery split | 30-day raw terms classified title-shaped vs descriptive | decides how much search optimises for "where is X" |
| Described-route tap-through | search rows joined to detail views within 60 s | is the conversational path working |
| Preset tap share and per-card taps | `mood_key` rows | ranks the pool |
| Voice share of Browse searches | new `input: 'voice'` metadata key | is dictation used |
| Semantic p50 / p95 | Worker log line, like `foryou_render` | latency budget |

---

## 6. Risks and open questions added or changed by this review

| Risk | Change |
|---|---|
| **Users remain the critical path, and eight weeks were spent elsewhere** | New, High. Mitigation is §4: dated close-out, and the weekly ritual actually starting. If the closed test has not started by 24 September, H1's marketing beat should be moved to January and the review should say so. |
| **Semantic search flipped on preset evidence** | New, Medium. Mitigation: §5.4 conditions; the measured failure is written down. |
| **Query-understanding cost and latency at scale** | New, Low today. Cached parses and Workers AI keep it under the free allowance; revisit at 5K MAU. |
| **Voice privacy** | New, Low. On-device preferred; disclosure if server fallback enabled. |
| **SA API quota** | Existing, raise to High with numbers: hard cap, no overage, $49–$299/month ladder. Budget into the cost floor. |
| **Service id churn** (Discovery+ leaving the WBD ecosystem; Sky Go as a NOW alias) | New, Low. Keep the mapping layer the single point of truth. |
| **Notifications never observed firing for real** | Existing, re-scored. Not a credential problem; a cohort problem. The closed test resolves it. |

---

## 7. Decisions needed from Joe

1. **Close H0 on the dates in §4** (ICO and the closed-test start this week). This is the one decision that changes the outcome of H1.
2. **Adopt the H1 replan in §5**: search track in, monetisation plumbing to H2 entry.
3. **Restate operating principle 3** as "one question, any input" (recommendation and search are one job; the conversational layer joins them).
4. **Service coverage wave 1** as listed, and a view on wave 2's free-to-air question (partial coverage without deep links, or nothing).
5. **Query-understanding model choice**: Workers AI first with Haiku behind a flag, as recommended, or Haiku first for quality.
6. **Marketing beat fallback**: if the closed test slips past 24 September, move the beat to January rather than rush it.

On yes to 1–3, the next session cuts roadmap v1.1 from this document, refreshes the two stale wiki pages and `next-steps.md`, and writes the handoff prompts for 1.2, 1.4 and 1.5 in the format the search work used.

---

## 8. Decision record (10 September 2026, evening)

Joe accepted decisions 1–3 and took the review's recommendations on 4–6. One decision was added that the review had not proposed: **release iOS first.** The iOS build was submitted to the App Store as publicly available on 10 Sept; Android follows once 12 closed-test testers are sourced (3 at the time of the decision). All growth actions link to the App Store until Android clears its gate. Roadmap v1.1 was cut from this document the same day: [Videx_Product_Strategy_and_Roadmap_v1.1.md](Videx_Product_Strategy_and_Roadmap_v1.1.md). Handoff prompts for the search track: [2026-09-10-001-handoffs-search-track.md](../plans/2026-09-10-001-handoffs-search-track.md).
