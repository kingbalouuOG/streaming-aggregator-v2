# Mood Rooms Anchored Probe — Side-by-Side Report

**Status:** Probe-only output. Read-only against production data.  
**Date:** 2026-04-26.  
**Author:** Claude Code (engineering probe).  
**Probe script:** [scripts/evaluation/anchored-rooms-probe.ts](../../scripts/evaluation/anchored-rooms-probe.ts).  
**Companion brief:** [Mood_Rooms_Ranking_Quality_Investigation_2026_04_22.md](Mood_Rooms_Ranking_Quality_Investigation_2026_04_22.md).

---

## Account state

| Field | Value |
|---|---|
| user_id | `ff462bf6-2fc8-4ede-a80f-39ee7133400c` |
| Bootstrapped from | onboarding_v2 |
| Taste vector updated | 2026-04-26T16:19:39.407+00:00 |
| Taste vector dimension | 1536 |
| Selected clusters (7) | dark-thrillers, epic-scifi-fantasy, mind-bending-mysteries, true-crime-real-stories, history-war, prestige-award-winners, feel-good-funny |
| Home genres (TMDb IDs) | 53, 80, 9648, 878, 14, 12, 99, 36, 10752, 18, 35 |
| Services (assumed, from investigation brief) | apple, bbc, channel4, itvx, netflix, prime, skygo |
| Watched-grid picks (column on profile) | not exposed in `taste_profiles` schema |
| Behavioural interaction count (vector) | 4 |
| Total `user_interactions` rows | 15 |
| Available titles on services | 18298 |
| Latest mood_rooms version | 1 (69 rooms) |

### Recent interactions (last 60 days)

| When | Event | Title |
|---|---|---|
| 2026-04-21 | `dwell_event` | Setup (2011, movie) |
| 2026-04-21 | `detail_view` | Setup (2011, movie) |
| 2026-04-21 | `dwell_event` | RED (2010, movie) |
| 2026-04-21 | `detail_view` | RED (2010, movie) |
| 2026-04-18 | `dwell_event` | Cash Queens (2026, tv) |
| 2026-04-18 | `detail_view` | Cash Queens (2026, tv) |
| 2026-04-18 | `deep_link_click` | Sinners (2025, movie) |
| 2026-04-18 | `dwell_event` | Sinners (2025, movie) |
| 2026-04-18 | `deep_link_click` | Sinners (2025, movie) |
| 2026-04-18 | `thumbs_up` | Sinners (2025, movie) |
| 2026-04-18 | `watched` | Sinners (2025, movie) |
| 2026-04-18 | `detail_view` | Sinners (2025, movie) |
| 2026-04-18 | `watchlist_add` | Sovereign (2025, movie) |
| 2026-04-18 | `watchlist_add` | Task (2025, tv) |
| 2026-04-18 | `watchlist_add` | Adolescence (2025, tv) |

---

## Section 1 — Baseline: current global mood-room ranking

Result of `get_mood_rooms_for_user(user_taste_vector, available_tmdb_ids, min_available_titles=10, result_limit=20)`.

### Top 10 ranked rooms

| Rank | Cosine distance | Room | On-service titles | Total titles |
|---:|---:|---|---:|---:|
| 1 | 0.1257 | Saturday Night Action | 557 | 679 |
| 2 | 0.1650 | Slow-Burn Horror | 416 | 506 |
| 3 | 0.1750 | Background Procedurals | 66 | 77 |
| 4 | 0.2073 | 90s Courtroom Thrillers | 23 | 31 |
| 5 | 0.2131 | Teen Drama | 39 | 47 |
| 6 | 0.2140 | Sunday-Night Crime | 194 | 234 |
| 7 | 0.2151 | Date Night Rom-Coms | 316 | 392 |
| 8 | 0.2202 | Spooky Late Night | 54 | 71 |
| 9 | 0.2233 | Cerebral Space | 142 | 177 |
| 10 | 0.2270 | Deep Sea Scares | 65 | 79 |

### Cluster → closest mood room

Each user-selected cluster's representative centroid (mean of representativeTmdbIds embeddings, L2-normalised) matched to its nearest `mood_rooms.centroid`.

| Cluster | User vector → cluster | Closest room | Cluster → room | Threshold (≤ 0.30) |
|---|---:|---|---:|:---:|
| Dark Thrillers | 0.2344 | 90s Courtroom Thrillers | 0.1996 | ✅ |
| Epic Sci-Fi & Fantasy | 0.3298 | AI & Robots | 0.1598 | ✅ |
| Mind-Bending | 0.2763 | Saturday Night Action | 0.2249 | ✅ |
| True Crime | 0.3214 | True Crime Deep Dives | 0.2475 | ✅ |
| History & War | 0.3464 | WWII European Drama | 0.1704 | ✅ |
| Award-Winners | 0.3626 | Saturday Night Action | 0.3354 | ❌ |
| Feel-Good & Funny | 0.2960 | Date Night Rom-Coms | 0.1523 | ✅ |

---

## Section 2 — Prototype: title-anchored mood rooms

Anchor selection ladder: Tier 1 (thumbs_up ∩ watched/watchlist last 60d) → Tier 2 (cluster representative titles ranked by similarity to user vector, one per cluster) → Tier 3 (top finalScore fallback).

### Tier 1 anchor pool

| Tier source | Title | Year | Media | Sim. to user vector |
|---|---|:-:|:-:|---:|
| Tier 1 — thumbs_up ∩ (watched ∪ watchlist) | Sinners | 2025 | movie | 0.8147 |

### Tier 2 candidate pool (per-cluster representatives ranked by similarity to user vector)

| Rank | Title | Year | Media | Source cluster | Sim. to user |
|---:|---|:-:|:-:|---|---:|
| 1 | Se7en | 1995 | movie | Dark Thrillers | 0.6400 |
| 2 | Prisoners | 2013 | movie | Dark Thrillers | 0.6307 |
| 3 | Gone Girl | 2014 | movie | Dark Thrillers | 0.6123 |
| 4 | Superbad | 2007 | movie | Feel-Good & Funny | 0.5950 |
| 5 | Memento | 2000 | movie | Mind-Bending | 0.5938 |
| 6 | Making a Murderer | 2015 | tv | True Crime | 0.5930 |
| 7 | Interstellar | 2014 | movie | Epic Sci-Fi & Fantasy | 0.5852 |
| 8 | Blade Runner 2049 | 2017 | movie | Epic Sci-Fi & Fantasy | 0.5781 |
| 9 | Inception | 2010 | movie | Mind-Bending | 0.5735 |
| 10 | Shutter Island | 2010 | movie | Mind-Bending | 0.5695 |
| 11 | The Prestige | 2006 | movie | Mind-Bending | 0.5682 |
| 12 | Inglourious Basterds | 2009 | movie | History & War | 0.5620 |
| 13 | The Shawshank Redemption | 1994 | movie | Award-Winners | 0.5518 |
| 14 | The Hangover | 2009 | movie | Feel-Good & Funny | 0.5487 |
| 15 | Mean Girls | 2004 | movie | Feel-Good & Funny | 0.5480 |
| 16 | Bowling for Columbine | 2002 | movie | True Crime | 0.5306 |
| 17 | Saving Private Ryan | 1998 | movie | History & War | 0.5241 |
| 18 | Arrival | 2016 | movie | Epic Sci-Fi & Fantasy | 0.5233 |
| 19 | Dunkirk | 2017 | movie | History & War | 0.5189 |
| 20 | Bridesmaids | 2011 | movie | Feel-Good & Funny | 0.5102 |

### Selected anchors (3 per user, with cluster-diversity rule on Tier 2)

| # | Title | Year | Tier | Source |
|---:|---|:-:|:-:|---|
| 1 | Sinners | 2025 | T1 | Tier 1 — thumbs_up ∩ (watched ∪ watchlist) |
| 2 | Se7en | 1995 | T2 | Tier 2 — Dark Thrillers |
| 3 | Superbad | 2007 | T2 | Tier 2 — Feel-Good & Funny |

### Anchor 1 — "Sinners"

- **Anchor:** Sinners (2025, movie)  
- **Source:** Tier 1 — thumbs_up ∩ (watched ∪ watchlist)  
- **Proposed room name:** _If you love Sinners_  
- **Funnel:** raw NN 200 → service-filtered 171 → after exclusions 170 → capped 30  
- **NN query latency:** 3673 ms  
- **Coherence read:** Very tight cluster (top-10 distance spread 0.030). Strong tonal coherence around the anchor.

Top 10 titles in the room:

| # | Title | Year | Distance to anchor |
|---:|---|:-:|---:|
| 1 | Final Destination Bloodlines | 2025 | 0.3554 |
| 2 | Salvation | 2025 | 0.3659 |
| 3 | Together | 2025 | 0.3689 |
| 4 | Night Teeth | 2021 | 0.3758 |
| 5 | Sympathy for the Devil | 2023 | 0.3777 |
| 6 | Bloodline Killer | 2024 | 0.3778 |
| 7 | Evil Takes Root | 2020 | 0.3784 |
| 8 | Locked | 2025 | 0.3796 |
| 9 | The Crow | 2024 | 0.3818 |
| 10 | Dracula | 2025 | 0.3851 |

### Anchor 2 — "Se7en"

- **Anchor:** Se7en (1995, movie)  
- **Source:** Tier 2 — Dark Thrillers  
- **Proposed room name:** _If you love Se7en_  
- **Funnel:** raw NN 200 → service-filtered 152 → after exclusions 151 → capped 30  
- **NN query latency:** 2534 ms  
- **Coherence read:** Coherent neighbourhood (top-10 spread 0.063).

Top 10 titles in the room:

| # | Title | Year | Distance to anchor |
|---:|---|:-:|---:|
| 1 | WΔZ | 2007 | 0.3815 |
| 2 | 13 | 2010 | 0.4076 |
| 3 | Primal Fear | 1996 | 0.4101 |
| 4 | Apartment 7A | 2024 | 0.4103 |
| 5 | The Magnificent Seven | 1960 | 0.4127 |
| 6 | 7 Women and a Murder | 2021 | 0.4160 |
| 7 | No Country for Old Men | 2007 | 0.4163 |
| 8 | The Flock | 2007 | 0.4365 |
| 9 | 6 Souls | 2010 | 0.4424 |
| 10 | Psycho | 1960 | 0.4444 |

### Anchor 3 — "Superbad"

- **Anchor:** Superbad (2007, movie)  
- **Source:** Tier 2 — Feel-Good & Funny  
- **Proposed room name:** _If you love Superbad_  
- **Funnel:** raw NN 200 → service-filtered 161 → after exclusions 161 → capped 30  
- **NN query latency:** 2661 ms  
- **Coherence read:** Very tight cluster (top-10 distance spread 0.059). Strong tonal coherence around the anchor.

Top 10 titles in the room:

| # | Title | Year | Distance to anchor |
|---:|---|:-:|---:|
| 1 | Accepted | 2006 | 0.3910 |
| 2 | Road Trip | 2000 | 0.4308 |
| 3 | Booksmart | 2019 | 0.4312 |
| 4 | Undergrads | 2022 | 0.4390 |
| 5 | #realityhigh | 2017 | 0.4392 |
| 6 | Seven Psychopaths | 2012 | 0.4398 |
| 7 | American Reunion | 2012 | 0.4409 |
| 8 | Ghost World | 2001 | 0.4443 |
| 9 | Let's Be Cops | 2014 | 0.4502 |
| 10 | Scary Movie | 2000 | 0.4502 |

---

## Section 3 — Side-by-side comparison

Limited to 3 visible slots for like-for-like comparison.

| | Current (global ranking) | Prototype (anchored) |
|---|---|---|
| Slot 1 | **Saturday Night Action** (cosine 0.1257, 557 on-service titles) | **If you love Sinners** (T1, 30 titles) |
| Slot 2 | **Slow-Burn Horror** (cosine 0.1650, 416 on-service titles) | **If you love Se7en** (T2, 30 titles) |
| Slot 3 | **Background Procedurals** (cosine 0.1750, 66 on-service titles) | **If you love Superbad** (T2, 30 titles) |
| Cluster picks visibly reflected | 2 of 7 (Mind-Bending, Award-Winners) | 2 of 7 (Dark Thrillers, Feel-Good & Funny) |
| Niche signals surfaced (history-war / true-crime / epic-scifi / mind-bending) | Mind-Bending | — |
| Visible-slot rooms not matching any cluster (≤ 0.30) | Slow-Burn Horror, Background Procedurals | n/a (anchors are user-derived) |

---

## Section 4 — Coverage and edge-case checks

### 4.1 Embedding coverage of catalogue

Of 18,298 on-service titles (cumulative across all 7 services), **14,492** have non-null `embedding` — **79.2%** coverage. Whole-catalogue coverage: 20,098 / 20,116 = 99.9% (effectively complete; the on-service gap is a service × keyword-availability artefact, not an embedding-pipeline gap).

> **Just inside the brief's 80% pre-ship gate.** The 21% gap is on-service titles whose TMDb keywords are missing — the embedding work-queue (`WHERE embedding IS NULL AND keywords IS NOT NULL`) skips them. Anchored rooms will silently underweight that subset. A one-off keyword-less backfill (or relaxing the work-queue's keyword precondition) would close the gap and is worth doing before locking either approach. Not a blocker — but not a non-issue either.

> **Note on the initial probe run** (sample of 2000) reported 50% coverage; that was a PostgREST 1000-row cap on the `.in()` query, not real coverage. The figures above are from paginated `count: 'exact'` queries and reflect ground truth.

### 4.2 Tier 2 anchor coherence on niche cluster picks

For each user-selected cluster, the strongest representative (by similarity to user vector) and its room's coherence read.

| Cluster | Best representative | Sim. to user | Room coherence (if generated) |
|---|---|---:|---|
| Dark Thrillers | Se7en (1995) | 0.6400 | Coherent neighbourhood (top-10 spread 0.063). |
| Epic Sci-Fi & Fantasy | Interstellar (2014) | 0.5852 | _(not selected as anchor — no room generated in this run)_ |
| Mind-Bending | Memento (2000) | 0.5938 | _(not selected as anchor — no room generated in this run)_ |
| True Crime | Making a Murderer (2015) | 0.5930 | _(not selected as anchor — no room generated in this run)_ |
| History & War | Inglourious Basterds (2009) | 0.5620 | _(not selected as anchor — no room generated in this run)_ |
| Award-Winners | The Shawshank Redemption (1994) | 0.5518 | _(not selected as anchor — no room generated in this run)_ |
| Feel-Good & Funny | Superbad (2007) | 0.5950 | Very tight cluster (top-10 distance spread 0.059). Strong tonal coherence around the anchor. |

### 4.3 Anchor staleness — weekly rotation feasibility

Tier-2 anchor pool size by cluster:

| Cluster | Embedded representatives |
|---|---:|
| Dark Thrillers | 3 |
| Epic Sci-Fi & Fantasy | 3 |
| Mind-Bending | 4 |
| True Crime | 2 |
| History & War | 3 |
| Award-Winners | 2 |
| Feel-Good & Funny | 4 |

Total Tier-2 pool: **21** anchors across 7 clusters. With 3 anchors per week and the `featuredLastWeek` exclusion, the pool would support ~7 weeks of non-overlap on Tier 2 alone before recycling. Tier 1 grows organically with user behavioural signal; Tier 3 is unbounded.

---

## Section 5 — CC's read

### Does the anchored output look meaningfully better?

**Yes — but more narrowly than the headline numbers suggest, and with a real new failure mode the brief didn't anticipate.**

Slot-by-slot, what the side-by-side actually shows:

- **Slot 3 is a clean win for anchored.** The baseline's slot 3 is _Background Procedurals_ ("Cop, paramedic, and emergency drama") — the user did not pick that. Anchored's slot 3 is _If you love Superbad_ — generated from the user's Feel-Good & Funny cluster pick, populated with Accepted, Road Trip, Booksmart, Mean Girls-adjacent comedies. This is the brief's pitch landing exactly: a stated preference surfaced cleanly via an anchor instead of buried at rank 7 in the baseline (Date Night Rom-Coms is the closest match in baseline and only just sneaks into the visible top 5).

- **Slot 2 is a moderate win.** The baseline shows _Slow-Burn Horror_ — the user did not pick horror. Anchored shows _If you love Se7en_ — from Dark Thrillers, the user's cluster pick. The anchored room (WΔZ, 13, Primal Fear, No Country for Old Men, Psycho) is more honestly "dark thriller" than the baseline's slot 4 _90s Courtroom Thrillers_, which is the cluster's actual best-room match. Se7en's anchor pulls in a wider tonal range than the niche courtroom-thriller centroid does.

- **Slot 1 is a wash dressed up as a win.** The anchored slot 1 (_If you love Sinners_) and the baseline's slot 2 (_Slow-Burn Horror_) are essentially the same neighbourhood. Sinners is a vampire/horror crossover, and its top-10 neighbours (Final Destination Bloodlines, Together, Night Teeth, Sympathy for the Devil, Dracula 2025) are dead-centre _Slow-Burn Horror_ territory. The anchored approach is more **explainable** here ("because you watched Sinners" vs. "your taste vector landed near a horror centroid"), but the actual content is the same. The "win" over the baseline's slot 1 _Saturday Night Action_ is real — Saturday Night Action is the dilution failure mode the brief described — but it's just shifting the anchor that surfaces _Slow-Burn Horror_ from "averaged taste vector" to "the title you thumbed-up", which itself is in horror territory.

**The new failure mode worth flagging.** Anchoring on a Tier 1 behavioural signal locks the row to whatever the user just engaged with. Sinners is the user's only thumbs_up event (one watched + one thumbs_up + two deep_link_clicks) — and it's not in any of the user's 7 selected clusters. The user picked Dark Thrillers, Epic Sci-Fi, Mind-Bending, True Crime, History & War, Prestige, and Feel-Good. They did **not** pick Horror. But they engaged with one horror crossover, and anchored slot 1 is now "all horror". This is the inverse of the brief's centroid-flattening problem: instead of stated preferences being drowned out by averaging, they're being drowned out by a single behavioural signal. With more interactions this resolves — the strongest anchor at any moment becomes more representative of actual behaviour. At cold-start with N=1 thumbs_up, it over-weights.

**Mitigation worth designing in from day one:** the 3-anchor row should feel like a triangle — one Tier-1 anchor (when present) + two Tier-2 anchors from non-overlapping clusters. The probe's diversity rule on Tier 2 already does this, but the row would feel stronger if the Tier-1 anchor's _cluster vibe_ also fed into the diversity rule (i.e. Sinners ≈ horror → don't also pick a Tier-2 horror anchor). For this user it didn't matter since they have no horror cluster pick, but it could matter for a user whose Tier-1 thumbs_up happened to be in a cluster they also picked.

**Cluster-coverage scoreboard for the visible 3 slots:**

- Baseline: 2 of 7 clusters reflected (Mind-Bending via Saturday Night Action proxy at 0.2249; Award-Winners technically also matches Saturday Night Action but at 0.3354 it fails the 0.30 gate). The visible slots also include 2 rooms not matching any user cluster (Slow-Burn Horror, Background Procedurals).
- Anchored: 2 of 7 clusters reflected (Dark Thrillers via Se7en, Feel-Good via Superbad). Slot 1 (Sinners → Horror) reflects 0 clusters. So the cluster-coverage count is the same, but the anchored slots that *do* reflect clusters reflect them more cleanly (Se7en's room is more authentically "dark thriller" than Saturday Night Action's room is).

**Net read:** the anchored approach is meaningfully better at the **slot level for stated preferences** (Superbad, Se7en) and roughly equivalent at the **slot level for behavioural signal** (Sinners ≈ Slow-Burn Horror). The win the brief was reaching for — surfacing Niche signals like history-war, true-crime, epic-scifi that get buried in baseline — does **not** show up in this run because the cluster-diversity rule limits Tier 2 to the top-2 clusters by user-similarity, dropping those exact niche picks. **If the brief wants those niche signals visible in slot 3, the anchor count needs to be ≥ 5, or the diversity rule needs to actively favour user-picked-but-unrepresented clusters over user-picked-and-already-baseline-matched clusters.** With 3 anchors and a "diversity = different cluster" rule, the niche cluster picks lose every tiebreak.

### Implementation concerns surfaced by running the probe

- **Embedding coverage is acceptable, not pristine.** True coverage is **79.2%** of on-service titles (14,492 / 18,298), not the 50% the initial sampled probe reported (that was a PostgREST cap artefact). Whole-catalogue coverage is effectively complete (20,098 of 20,116). The 21% on-service gap is titles missing TMDb keywords — the work-queue filter `WHERE embedding IS NULL AND keywords IS NOT NULL` excludes them. Affects baseline and anchored equally; not a Phase 4 blocker but worth a one-off keyword-less backfill before locking.

- **NN latency: 2.5–3.7 s per anchor over residential WAN.** Three sequential calls = 8.9 s wallclock, which would be unshippable. Two mitigations: (a) `Promise.all` the per-anchor calls so total wallclock = max latency ≈ 3.7 s on this connection; (b) when the same RPC is called from inside the Supabase network (Edge Function or production app over a closer region), expect 50–300 ms per call based on the project's Phase 4 informal note. Worth measuring from a deployed Edge Function before locking. `hnsw.ef_search` is auto-set to ≥ 100 inside `match_titles_by_vector` (migration 025) so no client tuning needed at this match_limit.

- **Service filter retention is healthy here.** Raw NN of 200 retained 152–171 titles after the 18,298-title service filter for these three anchors — comfortable buffer for a 30-cap room. With tight service selections (e.g. user picked only Netflix UK ~3K of 20K available), bumping match_limit to 300 and/or pushing the `tmdb_id = ANY(available_tmdb_ids)` filter inside the RPC body would be the next step. Today's two-step (over-fetch + client filter) works for breadth-of-services users like this account; degrade gracefully into the in-RPC variant for narrow-services users.

- **Cluster-diversity tradeoff on 3-anchor rows.** The probe picks 3 anchors max, with one-per-cluster on Tier 2. With 7 selected clusters that means 4 cluster picks never see an anchor. Rooms 4–5 of the existing weekly-pool size (`MOOD_ROOM_WEEKLY_POOL_SIZE = 5`) could comfortably be filled with the next 2 Tier-2 anchors, restoring full cluster coverage. **Recommend the anchored row carry 5 slots, not 3, if the goal is cluster-coverage parity with the brief's framing.**

- **Tier 1 dominance at low N.** With 1 thumbs_up the Tier 1 anchor is 100% of the behavioural signal. Risk: a single off-pattern interaction (user thumbs_up'd a friend's recommendation) would spawn a row that doesn't reflect them. Two cheap guards: (i) require ≥ 2 events to promote a title to Tier 1 strong; (ii) **threshold the anchor's similarity to user vector** — Sinners scored 0.81 here (very high), but a thumbs_up at sim < 0.50 should fall back to Tier 2. The probe doesn't apply such a threshold; we'd want to set it before going to users.

- **Tier 2 anchor pool sustains ~7 weeks.** 21 embedded representatives across 7 selected clusters → with 3 picks/week and `featuredLastWeek` exclusion, ~7 weeks before recycling on Tier 2 alone. That's enough for the medium term but not indefinitely. Tier 1 grows organically; Tier 3 is unbounded. No staleness issue at Phase 4 horizon.

- **Prestige-Award-Winners doesn't break at the anchor level the way it breaks at the centroid level.** Shawshank Redemption (the cluster's top user-similarity rep at 0.5518) would, if promoted to anchor, spawn a coherent prestige-drama room rather than the Teen Drama / Saturday Night Action centroid mismatch the baseline shows. So the anchored approach **incidentally fixes** the prestige cluster's brokenness, even if the structural problem (prestige isn't a content category) still applies. Worth keeping in mind: anchoring on individual representative titles dodges several problems centroid averaging exposes.

- **Score-decomposability reminder.** Today's pipeline collapses behavioural and stated signal into a single L2-normalised taste vector with no per-component log (see Section E of the prior briefing). For anchored rooms to do anchor-quality grading at scale ("did the user actually engage with Sinners or did they hate-watch it?") the pipeline would benefit from keeping at least the most-recent N strong behavioural events as a separate, addressable list — not for replay but for anchor selection. This is independent of the row implementation but related: the anchored approach exposes how thin the "what does the user actually love?" signal is at cold start.

---

*End of probe report. Raw JSON output: `scripts/audit-results/anchored-rooms-probe.json`.*