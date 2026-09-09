---
title: Signal architecture
type: concept
tags: [signals, instrumentation, lifecycle, dwell, deep-link]
created: 2026-04-26
updated: 2026-09-09
sources:
  - raw/v2-strategy/Videx_Recommendation_Engine_v2_Strategy_v1.6.3.md
  - raw/v2-strategy/Videx_v2_Detail_Page_Signal_Capture_Spec_v0.3.2.md
  - raw/concepts/signal-weighting-overview.md
  - raw/phase-summaries/Videx_v2_Phase_0_End_of_Phase_Summary.md
related:
  - wiki/concepts/architecture/taste-vector.md
  - wiki/concepts/architecture/lifecycle-manager.md
  - wiki/entities/codebase/event-taxonomy.md
  - wiki/concepts/decisions/adr-006-card-impressions-dedicated-table.md
  - wiki/concepts/decisions/adr-009-not-interested-rename.md
  - wiki/sources/detail-page-signal-capture-spec-v0-3-2.md
---

# Signal architecture

Two signal categories: **explicit** (user-initiated, intentional) and **silent** (behaviour-derived, passive). Both feed the recommendation engine with different weights and confidence levels. Captured silently with upfront disclosure (no per-signal toggles).

## Routing

| Destination | Events | Backed by |
|---|---|---|
| `user_interactions` | thumbs ±, watchlist ±, marked watched, `not_interested`, detail_view, dwell_event, deep_link_click, section_expanded, cast_carousel_scroll, back_navigation_speed, report_availability, **search** | Migration 010, expanded migration 013 (`session_id`, `source_surface` top-level). Search-text retention: migration 079. |
| `card_impressions` | impressions | Migration 014 (pg_partman monthly). See [ADR-006](../decisions/adr-006-card-impressions-dedicated-table.md), [ADR-010](../decisions/adr-010-pg-partman-card-impressions.md). |
| Onboarding analytics table | onboarding funnel events | `lib/analytics/logger.ts`. Separate from `user_interactions`. |

## Capture lifecycle

1. **Detail page mount** → `detail_view` event fires (anchor only, NOT positive). Dwell timer starts. Subscribe to lifecycle manager.
2. **Lifecycle events** (background/foreground): pause/resume dwell timer. 3-second deep-link expected-background window. See [lifecycle-manager](lifecycle-manager.md).
3. **Detail page unmount**: `dwell_event` fires once with `dwell_seconds` and `exit_reason`.
4. **Explicit interactions** (thumbs, watchlist, watched, not_interested, deep-link click): emit immediately. Replace previous signal on same title (rule 2 of combination).
5. **Card shown**: `recordImpression` to in-memory buffer. Flushed by [impression batcher](#impression-batcher) on six triggers.
6. **Search**: one `search` row per *settled* search intent — see below.

## Search events

`emitSearch` (`src/lib/storage/interactions.ts`) has existed since Phase Search V2, but until 2026-09-08 **only the web app called it**: `native/` never did, so production held **zero** `search` rows. Native now emits from `native/src/hooks/useSearchLogging.ts`, wired into `browse.tsx`.

**Emission ships dark, and the gate is in the emitter.** `emitSearch` itself checks the per-user `search_logging` flag (`src/lib/featureFlags.ts`, default false) before writing anything. No row is written for a user until Joe turns the flag on for them, having told them first — the interim stand-in for the §10 in-app change notice that does not exist yet (IN-SL-003). The gate fails closed: logged out, flag unset, or a failed read all mean "do not log".

It started as a check in the native hooks and moved down on 2026-09-08, before Session 2 began. The reason is worth keeping: Session 2's quick-filter chips call `emitSearch` directly from a store, per §10, and would have logged for every user regardless of consent. A safety property that each call site has to remember is not one. Two consequences follow — **the three web call sites are gated too** (`useSearch.ts`, `BrowsePage.tsx`), so the web app logs nothing unless a flag is on; and **the attribution boost is gated with it**, because recording the timestamp while writing no row would let the incremental path boost a search the nightly recompute cannot see, which the recompute would then undo. Covered by `src/lib/storage/__tests__/emitSearchGate.test.ts`.

| Trigger | `mode` | `metadata` |
|---|---|---|
| Typed query, settled | `lookup` | `query`, `result_count`, `route` |
| Mood card tap, `search_semantic` ON | `semantic` | `query` (the app-authored mood phrase), `result_count`, `mood_key`, `slot`, `selection_reason`, `semantic: true` |
| Mood card tap, flag OFF (filter preset) | `filter` | `query: null`, `result_count`, `mood_key`, `slot`, `selection_reason`, `semantic: false` |
| FilterSheet apply | `filter` | `query: null`, `result_count`, `filters` |
| Refine-chip toggle | `filter` | `query: null`, `result_count`, `refine`, `on`, `filters` — **and nothing else**, see below |

`route` (`title` / `described` / `lookup`) replaced the `category` this table used to name: the category pills that set it went with the refine row, and route is the field §6 actually wants — the same text routes differently depending on the `search_semantic` flag and on what Mode A returned that day.

**The flag read is local and expires.** `getFlag` reads `supabase.auth.getSession()` (storage) rather than `getUser()` (a network round trip), and memoises for ten minutes. Until 2026-09-09 it did the opposite: `getUser()` ran *ahead of* the memo, so a user with `search_logging` off paid one auth request per settled query — the "no network at all" claim in the hook's own header was false — and a memo with no expiry meant a flag turned OFF mid-session, which is how consent is withdrawn, kept logging until the app restarted. `native/src/hooks/useSearchLogging.ts` also asks the flag **before** recording a query in its once-per-search dedupe set: marking a query written when nothing was written made it unrecoverable for the life of that mount, so turning the flag on reached the next app launch rather than the next search.

**Settled, never per keystroke — and never per pause.** A typed query settles when its results have arrived AND the text has been unchanged for ≥ 1.5 s, short-circuited by the keyboard's search key or the first result tap.

A settled query is then **held, not written**. The next settled query decides its fate: if the two are the same search still being typed or fixed, the newer supersedes it and the older is never written. Two tests, both earned by a real capture — **prefix in either direction** (typing and backspacing), and **edit distance ≤ 2** on queries of 4+ characters (a correction mid-word, where neither is a prefix of the other).

The held query is written when an unrelated query settles, on a terminal signal, or after an 8 s idle. The terminal signals are: submit, first result tap, cleared box, **app backgrounded** (via the same `appState.subscribe` the impression batcher uses), **Browse losing focus** (`useFocusEffect` — switching tabs does not unmount the screen), and unmount. `reconcileSettled` in `src/lib/search/settledQuery.ts` is the rule; the write dedupes on `(query, category)`, so overlapping flushes are free.

> ⚠ The original implementation assumed the settle timer made §5.3's prefix rule redundant — "a prefix can only settle if the user stopped on it". **The first real capture disproved that** (2026-09-08, one search for "severance"):
>
> | time | query | results |
> |---|---|---|
> | 17:58:34 | `sev` | 56 |
> | 17:58:37 | `severence` | 0 |
> | 17:58:40 | `sever` | 41 |
> | 17:58:43 | `severance` | 13 |
>
> Four rows ~2.8 s apart for one search: people type in bursts and read between them, and a mid-word pause is indistinguishable from a finished query by elapsed time alone. The cost is not just noise — §6 treats zero-result rate as the retrieval-bug tripwire at ~10%, and that session reports **25%** off an ordinary typo, plus `sev`/`sever` counted as intended terms in `search_terms_daily`. The bidirectional test matters because the correction backspaced: a forward-only prefix check still emits three of the four.
>
> ⚠ The **second** capture then broke the prefix rule itself: `severenc` → `severance` diverge at character six, so neither is a prefix of the other and the abandoned typo was written as a real row anyway. Hence the edit-distance test. The first capture only collapsed because the user happened to pause on the stem `sever` long enough for it to settle — the prefix chain had no hole in it by luck.
>
> ⚠ That same round **lost two real searches** ("The Bear", "Lord of The…"): both were held, and no following query, tap, clear or 8 s idle ever came. Buffering trades fabricated rows for lost ones, and holding is only safe if every way of leaving writes first — which is why background and blur are now terminal signals. A hard kill with no background event still loses the held query: an accepted under-count, and the safer failure of the two.

### Not every `search` row earns the attribution boost

`emitSearch` marks the session "recently searched" so the next positive interaction inside the 60 s window gets the search-attribution taste boost (IN-PX-43). **That is gated on content intent**, because a `search` row is not always a search for something:

| `mode` | metadata | Boost |
|---|---|---|
| `lookup` | — | yes — the user typed what they wanted |
| `semantic` | `mood_key` | yes — the user picked a described vibe |
| `filter` | `mood_key` | yes — a mood preset with the flag off: same intent, different retrieval |
| `filter` | has `refine` | **no** — a refine chip, whatever else the row carries |
| `filter` | no `mood_key` | **no** — a bare FilterSheet apply or a quick-filter chip |
| absent (legacy) | — | yes — keeping real history beats dropping it |

Why it matters: Session 2's quick-filter chips emit a `mode: 'filter'` row on **every chip change** on New and For You. Ungated, tapping "Movies" would hand a 1.3x boost to every interaction on that page for the next minute, turning an idle browse into a taste event.

**The `refine` line was added on 2026-09-09, and it is the interesting one.** Session 4's refine row stamped `mood_key: intent.moodKey` on every chip toggle, which satisfies the mood-preset line two rows above — so every chip tapped while a preset was lit re-armed the boost on a re-slice of the page already on screen, and typing kept `moodKey`, so a chip on a typed grid boosted off a stale preset. Nothing failed; the rows looked reasonable. This is the failure mode to remember: **a later session wrote metadata that an earlier session's rule interpreted as intent**, three sessions and one merge apart, with the two definitions in files neither session had reason to open together.

Both ends are fixed, deliberately. The call site builds its metadata through `refineLogMetadata` (`src/lib/content/refineChips.ts`) — a function rather than an object literal, because what makes the row safe is the fields it does *not* have, and absence is not something a call site can be trusted to keep getting right. And the predicate excludes any `filter` row carrying a `refine` key outright, because the batch recompute still has to judge the rows already written to production, and a rule that holds only while every caller remembers is not a rule.

`isContentIntentSearch` (`src/lib/taste-v2/searchAttribution.ts`) is the **single definition**. Both paths route through it — `emitSearch` before `recordSearchTimestamp` (incremental), and `recomputeFromInteractionsScoped` when it builds `searchesBySession` (batch, which is why that query now selects `metadata`). The rule is deliberately *not* duplicated as a PostgREST filter: two copies silently disagreeing is the bug class it exists to prevent. Covered by `src/lib/taste-v2/__tests__/searchAttribution.test.ts`.

A refine row also carries `query: null` rather than the text being refined. That is the other half of the same fix: the nightly rollup aggregates on `metadata->>'query' IS NOT NULL`, so a chip toggle that repeated the typed text had one term counted twice — once as its `lookup` row and again under `mode='filter'`.

One more thing worth knowing: the taste recompute reads these rows for `created_at` + `session_id` only — never the query text. That is what lets migration 079 null the text without breaking attribution. Migration **081** (2026-09-09) tightened that job's 30-day cutoff to `(now() AT TIME ZONE 'UTC')::date`, which was session-timezone before and agreed with the UTC `day` column only because pg_cron happens to run UTC; the same migration made its `ON CONFLICT` add rather than overwrite, so a re-run over a partially stripped day no longer replaces the day's total with the remainder.

See [privacy-and-gdpr](../product/privacy-and-gdpr.md) for the 30-day retention on the text.

## Interpretation matrix (canonical)

| Dwell | Exit outcome | Weight |
|---|---|---|
| <3s | any | ignored |
| 3-10s | back_to_previous, no action | −0.15 |
| 10-30s | back_to_previous, no action | −0.25 |
| 30s+ | back_to_previous, no action | −0.35 |
| any | deep_link_click (high conf) | +0.8 |
| any | deep_link_click (low conf) | +0.4 |
| any | watchlist_add | +0.3 |
| any | thumbs_up | +1.0 |
| any | thumbs_down | −0.6 |
| any | not_interested | filter only, no taste update |
| any | marked_watched | +0.5 |
| any | watched + thumbs_up combo | +1.5 (replaces both) |
| any | app_backgrounded (not expected) | ignored until session resumes |

## Combination rules

1. Dedup within 24h.
2. Replace, don't add (explicit signals supersede).
3. Decay: 90d behavioural, 180d explicit.
4. Confidence floor: first 20 interactions weighted 1.5x.
5. **Negative session cap −1.0** prevents collapse during exploratory browsing.

## Deep-link confidence tagging

`AppLauncher.openUrl()` returning successfully ≠ landing in target app. Solution: tag at the source.

- **High confidence**: openUrl succeeded **AND** `linkType === 'exact'` from `getDeepLink`.
- **Low confidence**: search-URL fallback (e.g. Prime Video), browser fallback, or any case where openUrl resolved without true app handoff.

3-second deep-link expected-background window: `markDeepLinkExpected()` is called **before** `await AppLauncher.openUrl()` to avoid the Android race (Phase 0 Task 9a hotfix). Subsequent background events within the window are tagged `expected: true` so the dwell timer doesn't treat them as session interruption.

## Impression batcher

Lives in `src/lib/instrumentation/impressionBatcher.ts`. Subscribes to lifecycle manager.

Six flush triggers:

1. 10-second interval timer.
2. Buffer reaches 100 events.
3. App lifecycle: background, foreground.
4. Bottom nav tab change (between Home/For You/Browse/Watchlist/Profile).
5. Detail page entry (before detail page loads).
6. Component unmount on app close (fire-and-forget).

Failure handling: one retry on network failure, then drop the batch. Impressions are not critical data. Tab change and detail page entry as flush boundaries prevent buffer drift between surfaces.

## Privacy stance

- No date of birth (age range only, optional).
- No gender.
- No precise location (UK-regional at most).
- No cross-app tracking or device fingerprinting.
- Viewing context stored as user setting, not tracked behaviour.
- No share-button signal (removed from weight tables — not implementable in v1 codebase).

GDPR basis: legitimate interest. Disclosure in onboarding + Privacy & Data sub-page + privacy policy. Data export (JSON) and account deletion (cascading hard-delete) per Articles 15, 17, 20.

## Conflict resolution applied

- `interaction_type` → `event_type` (canonical column name, strategy v1.6).
- `tmdb_id` → `content_id` on `card_impressions` (strategy v1.6.1).
- `dismiss` → `not_interested` event type (Phase 0, ADR-009).
- Detail view as weak positive (older drafts) → NOT positive (anchor only) (corrected per detail page spec §3.1, industry-aligned with Netflix/Prime/YouTube).
- Share signal in weight tables → removed (not implementable in v1 codebase).
