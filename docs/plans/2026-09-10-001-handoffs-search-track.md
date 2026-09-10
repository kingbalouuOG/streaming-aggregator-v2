# Handoffs: H1 search-and-discoverability track (roadmap v1.1 items 1.2, 1.4, 1.5)

**Date:** 2026-09-10 · **Source:** [roadmap v1.1](../strategy/Videx_Product_Strategy_and_Roadmap_v1.1.md) §6 H1 and the [10 Sept review](../strategy/Videx_Roadmap_Review_2026-09-10.md) §5 · One session per prompt; run in this order: **1.5 (services) → 1.4 (voice) → 1.2 (query understanding) → 1.3 (flip)**. 1.5 and 1.4 are small and independent of 1.2; doing them first gets visible product change out while 1.2 is designed. Every session: worktree branch off `main`, relative paths, `native/src/lib` is a symlink to `src/lib` (never recursive-delete inside `native/`), `npx expo lint` in `native/`, wiki updated from the same worktree, PR footer standard. **The user track (1.1) runs in parallel and is Joe's; none of these sessions touches growth work.**

---

## 1.5 — Service coverage wave 1

```
Context: Videx (native/ Expo app + shared src/lib + workers/api Cloudflare Worker + Supabase). Implement roadmap v1.1 item 1.5 — read docs/strategy/Videx_Product_Strategy_and_Roadmap_v1.1.md §6 H1 row 1.5 and docs/strategy/Videx_Roadmap_Review_2026-09-10.md §5.3 first.

Goal: surface five services the pipeline already delivers rows for — HBO Max (vendor id `hbo`; UK launch 26 Mar 2026), Discovery+ (`discovery`), Crunchyroll (`crunchyroll`), MUBI (`mubi`), Pluto TV (`plutotv`). Verify the live row counts first with the Supabase MCP (read-only): `select service_id, stream_type, count(*) from streaming_availability where service_id in ('hbo','discovery','crunchyroll','mubi','plutotv') group by 1,2`. If `hbo` has zero rows, check whether the sync's catalog list (supabase/functions/sync-incremental + scripts/sync-content.ts) enumerates it; add it if not — that is in scope.

Per service, the full checklist (find how the existing ten are wired and mirror it exactly):
1. `ServiceId` union in src/lib/types/content.ts and the vendor↔Videx id mapping in src/lib/adapters/platformAdapter.ts (note the vendor uses `all4`/`iplayer` where Videx uses `channel4`/`bbc` — same mapping layer). TMDb provider ids for discover (`serviceIdsToProviderIds`) — look them up on TMDb watch/providers for GB and cite them in the PR.
2. Logo asset + `SERVICE_DISPLAY_NAMES` + brand colour in src/components/platformLogos.ts and the native tailwind `svc` palette (native/tailwind.config.js).
3. Deep-link pattern with search-URL fallback in src/lib/deepLinks.ts; test each on a real title (document the URL shape and whether it opens the app on iOS).
4. Onboarding service tile (native/src/components/onboarding) and the Profile services editor.
5. workers/api/src/index.ts `VALID_SERVICE_IDS` (both /v1/foryou and /v1/home validate against it).
6. Service fingerprints: run `npm run eval:fingerprints` and check the new services get a fingerprint row (src/lib/recommendations-v2 fingerprint code); if a service has too few titles for a fingerprint, say so and fall back to the neutral behaviour the code already has.
7. Per-service chart row on Home (`fetchPerServiceCharts`) picks them up automatically once in the user's services — verify on device.
8. `titles.available_services` (migration 075) already aggregates all service ids; confirm the new ids appear after the next sync.

Also: model Sky Go honestly as an alias of NOW's tiers ONLY if it is a one-line mapping; otherwise leave for wave 2 and say so.

Do NOT add My5/UKTV Play/STV/S4C (wave 2, needs TMDb watch-provider blending). Do NOT touch search code (1.2/1.4 sessions).

Verify on device: onboarding shows the five tiles; a user with HBO Max selected sees an HBO Max chart row on New and HBO Max titles in For You; "Free to watch" preset surfaces Pluto TV titles; deep links open. Update docs/legal/store-privacy-disclosures.md ONLY if a new data type appears (it should not). Wiki: entities/streaming-services/ one page per new service (mirror netflix.md), for-you-surface.md service list, log.md.
```

## 1.4 — Voice input

```
Context: Videx native app (native/, Expo 56, NativeWind 4). Implement roadmap v1.1 item 1.4 — read docs/strategy/Videx_Product_Strategy_and_Roadmap_v1.1.md §6 H1 row 1.4 and docs/strategy/Videx_Roadmap_Review_2026-09-10.md §5.2 first.

Goal: a microphone button beside the Browse search field (native/src/app/(tabs)/browse.tsx) that dictates a query. The transcript is dropped into the search box as typed text and settles like any other query, so logging (useSearchLogging), routing (title hit vs described) and — later — query understanding are unchanged. Voice is an input method, not a new backend.

1. Add `expo-speech-recognition@^56` (jamsch). The native lockfile is stale (memory: adding one dep churns ~400 lines) — do the lockfile repair as a SEPARATE first commit in the same PR so the feature diff is reviewable. Config plugin injects NSSpeechRecognitionUsageDescription, NSMicrophoneUsageDescription, RECORD_AUDIO; write the usage strings in Videx's voice ("Videx listens only while you hold the mic, to find what you describe."). Note iOS minimum rises to 16.4 — confirm app.json/expo-build-properties and say so in the PR.
2. Behaviour: press-and-hold mic (or tap to start, tap to stop — pick one and justify), live partial transcript in the field, final transcript settles on release. `lang: 'en-GB'`. Request `requiresOnDeviceRecognition: true` when `supportsOnDeviceRecognition()` is true; else OS server mode. Show a one-time sheet explaining on-device vs server processing the first time the fallback is used. Android: call `androidTriggerOfflineModelDownload` for en-GB once, non-blocking.
3. Logging: add `input: 'voice' | 'typed'` to the search-row metadata written by useSearchLogging (typed is the default; keep rows small). Add `input` to docs/legal/store-privacy-disclosures.md's metadata table.
4. Privacy obligations: policy §2 gains one sentence (audio is processed by your device or by Apple/Google's speech service; Videx never receives audio); update docs/legal/store-privacy-disclosures.md: Apple "Audio Data — app functionality, not linked" and Play "Audio → Voice or sound recordings" ONLY IF the server fallback is enabled — if you ship on-device-only, document that choice instead. Joe files the forms.
5. Empty/permission states: denied permission → the mic button explains and links to Settings; no recogniser available → hide the button (never a dead control).
6. Verify on an iOS device (Joe's iPhone via EAS preview — see memory reference_ios_device_testing): "something dark for late at night" dictated lands on the described route with the flag on; "severance" dictated lands on the title card; a settled voice query writes ONE search row with input:'voice'.
7. Tests: unit-test the transcript→settle glue (src/lib/search/settledQuery.ts already has a suite); tsc clean; expo lint.
8. Wiki: phase-search-v2.md addendum (voice), privacy-and-gdpr.md (audio line), log.md.
```

## 1.2 — Query understanding + hybrid retrieval

```
Context: Videx — workers/api (Cloudflare Worker, Hono), shared src/lib/recommendations-v2/search (semanticRetrieval.ts, semanticCore.ts), Supabase (pgvector, migration 082's 3-arg match_titles_by_vector), native Browse (one-intent state in native/src/app/(tabs)/browse.tsx). Implement roadmap v1.1 item 1.2 — read docs/strategy/Videx_Roadmap_Review_2026-09-10.md §5.1 and §5.4 in full, then videx-wiki/wiki/concepts/evaluations/semantic-search-quality.md (the measured failure: short typed sentences match surface words) and the parking-lot entries IN-SL-012 and IN-PX-40/41. Load the `cloudflare`/`workers-best-practices` skills before touching the Worker.

Goal: a Worker endpoint POST /v1/understand {text, services} → {filters: BrowseFilters, expanded_query: string, confidence} that turns a short utterance into (a) structured filters and (b) a one-sentence hypothetical synopsis written the way title overviews are written (HyDE); then hybrid retrieval that fuses full-text and vector results; then a reranker. Title lookups never enter this path (the confident-title-hit route stays first and instant).

Design constraints (from the review, decided by Joe 10 Sept):
1. Parse with Workers AI in JSON mode first (Llama 3.1 8B or GLM-4.7-Flash; JSON schema = BrowseFilters fields + expanded_query + confidence). Put Claude Haiku 4.5 behind a per-user flag (`search_understand_model` in user_feature_flags) routed through AI Gateway so the two can be A/B'd on the same fixture. Load the `claude-api` skill for the Haiku call. Cache parses in KV keyed on the normalised query (lowercase, trimmed, whitespace-collapsed) with a 7-day TTL; log cache hit/miss + latency as a structured line like the existing `foryou_render`.
2. Retrieval: add a `tsvector` column (title + overview + cast_top_5 + director, english config) with a GIN index on `titles` via a new migration (next free number after 082 — verify live with to_regclass first; remote schema_migrations is not authoritative), a `search_titles_fts(query text, limit int)` RPC, and fuse with match_titles_by_vector by reciprocal rank fusion (k=60) in the Worker. Structured filters are applied server-side: released via the RPC's min_release_year, cost via subscription_included_titles (migration 080), the rest as predicates in a new `filter_candidates` RPC or in SQL — do not post-filter 150 rows in JS for selective predicates (the review explains why Newer was thin).
3. Rerank the fused top 50 with `@cf/baai/bge-reranker-base` (query = the user's raw text). Measure before/after on the fixture; keep the reranker only if it helps.
4. Client: native calls /v1/understand on the described route (browse.tsx describedRoute, after Session 3's routing), merges the returned filters into the intent object (chips light up), and shows "Looking for: <expanded_query>" in place of the "Reading that as a feeling" banner with the same "Search titles instead" escape. Refine chips and the sheet keep working on the merged filters and refetch as today.
5. Latency budget: p50 < 1 s uncached, < 500 ms cached; p95 < 1.5 s. Log it. Never block the title-hit path on any of this.
6. Eval: extend scripts/test/search-semantic-fixtures.json with a `short-sentence` kind — 20 entries authored from the 30-day raw search log (read it via the Supabase MCP; 52 rows as of 10 Sept) plus the 8 preset sentences, each with 2–3 expected titles that exist in the catalogue. Gate: ≥80% of short-sentence entries have an expected title in the top 10; the known-title set stays the build gate. Update scripts/test/search-semantic-eval.ts to run the full path (understand → hybrid → rerank) with the app's quality floor.
7. Cost note in the PR: tokens per parse, Workers AI neuron usage per 1,000 queries, projected monthly cost at 5K MAU.
8. Do NOT flip `search_semantic` (1.3 is separate and gated on this session's eval). Do NOT build a chat UI.
9. Wiki: phase-search-v2.md addendum, a new concepts/techniques/query-understanding.md, evaluations/semantic-search-quality.md updated with the before/after tables, parking-lot: IN-SL-012 → resolved-by, IN-PX-40 → closed, log.md.
```

## 1.3 — Semantic search for everyone (after 1.2 merges)

```
Context: Videx. Roadmap v1.1 item 1.3. Read docs/strategy/Videx_Roadmap_Review_2026-09-10.md §5.4 and the 1.2 PR's eval tables. Preconditions (verify, do not assume): 1.2 merged; short-sentence eval ≥80%; two weeks of internal use with described-route zero-result rate <10% (query user_interactions search rows, mode 'semantic'/'lookup', route 'described', result_count=0); p95 <1.5 s from the Worker log. If any precondition fails, stop and report — do not flip.

Then: make `search_semantic` default ON for new sign-ups (the onboarding completion path writes the flag row; see src/lib/featureFlags.ts and native/src/hooks/useCompleteOnboarding.ts), flip existing users in two cohorts a week apart (Joe's accounts first, then everyone except reviewer@videxstreaming.com), keep the banner and "Search titles instead" escape, and add a kill switch (a single row in user_feature_flags for a sentinel user id is not a kill switch — add a `search_semantic_global` boolean in a config table read by getFlag with a 10-minute memo). Update the wiki next-steps.md gate section and parking-lot IN-PX-41, log.md. Store forms: no change (no new data type).
```
