# Videx v2 — Detail Page Signal Capture Specification

**Status:** v0.3.2 — Residual column name references in Captured data lists corrected
**Version:** 0.3.2

**Changes from v0.3.1:**
- Corrected `tmdb_id` → `content_id` in Captured data bullet lists for Sections 2.1, 2.6, 2.7, 3.1, 3.2 (missed in v0.3.1 because the corrections pass targeted specific sections and pseudocode blocks, not every bullet list)
- Clarified the `{media_type}-{content_id}` format narrative in Section 2.7 to match the pseudocode below it
- See Corrections v0.3.2 patch document for the full diff

**Changes from v0.3:**
- Schema diagram in Section 5.1 corrected to reflect actual `user_interactions` columns (`event_type`, `content_id`, `metadata`) plus migration 013 additions (`source_surface`, `session_id`)
- `getDismissedIds()` pseudocode in Section 2.7 corrected to use real column names
- `card_impressions` schema in Section 5.2 uses `content_id` for naming consistency with `user_interactions`
- Share signal removed from Section 2.9 and Section 4.1 weight tables — not implementable in v1 codebase
- `emitDetailView()` already-exists status acknowledged in Section 3.1 and Section 7.1
- `interactions.ts` modification scope expanded to include `source_surface` field handling (Section 9.3)
- Migration 013 description in Section 9.1 expanded to reflect Option C (source_surface as top-level column, no JSONB backfill)
- See Corrections v0.3.1 document for the full diff

**Purpose:** Define what behavioural and explicit signals the detail page captures for the v2 recommendation engine, how they're stored, how they feed into taste vector updates and ranking, and how they're disclosed to users under GDPR.

**Changes from v0.2:**
- **Section 2.6 (Deep Link Click-Through):** added confidence tagging based on `AppLauncher.openUrl()` outcome. High-confidence when the primary intent succeeds; low-confidence when it falls back to a browser URL.
- **Section 2.7 (Not Interested):** expanded with the `getDismissedIds()` Phase 0 rewrite. The rename from `dismiss` to `not_interested` is not a simple rename because the v1 localStorage dismissal list and the `dismiss` event type are two separate systems. Full Phase 0 transition approach specified.
- **Section 3.2 (Dwell Time):** expanded with full lifecycle handling — pause on background, resume on foreground, deep-link correlation window, and the lifecycle manager module (`src/lib/lifecycle/appState.ts`).
- **Section 5.1 (Storage):** impression tracking moved out of `user_interactions` and into a dedicated `card_impressions` table with `pg_partman` partitioning and client-side batching.
- **Section 5.1 (Storage):** `user_interactions` event_type enum updated with the `not_interested` rename and addition of `session_id` column.
- **Section 7.1 (UI Changes):** expanded "Not Interested" with the rename context.
- **New Section 9 (Implementation References):** cross-references to Project Orchestration v0.3 migrations and parking lot entries.

---

## 1. Framing

### 1.1 Why the detail page matters for signals

The detail page is the highest-signal surface in Videx. Users arrive at it when they're considering a title seriously enough to investigate — this is qualitatively different from a card impression in a scrolling feed. Every interaction on the detail page carries more weight than an equivalent interaction elsewhere because the user has already self-selected into consideration.

In v2, the detail page becomes the **primary behavioural signal surface** for the recommendation engine, feeding the taste vector and the ranking pipeline.

### 1.2 Core principle: silent tracking with upfront disclosure

Signals are tracked silently. Users don't toggle them, don't see them being captured, and don't need to understand them for the app to work. They are disclosed in:

- **Onboarding** (one screen or modal briefly explaining what Videx learns from)
- **Privacy policy** (full disclosure, accessible from Profile)
- **Data export** (GDPR right to access)
- **Account deletion** (GDPR right to erasure)

**No per-signal toggles.** No "allow dwell time tracking" switch. No "pause learning" button. These add UX friction and invite paranoia without improving outcomes. The user's high-level control is in the sliders (which affect how recommendations are served) and in explicit signals like thumbs up/down.

### 1.3 Two signal categories

**Explicit signals:** user-initiated, intentional actions. The user knows they're signalling something. Thumbs up, thumbs down, watchlist add, watchlist remove, "Not interested," mark as watched.

**Silent signals:** behaviour-derived, tracked passively. The user doesn't think of them as signals. Detail page visit, dwell time, scroll depth, section expansion, deep-link click-through, back-navigation speed.

Both categories feed the recommendation engine, but they contribute with different weights. Explicit signals are high-confidence; silent signals are lower-confidence but appear in volume.

---

## 2. Explicit Signals

These are user-initiated actions on the detail page.

### 2.1 Thumbs Up

**Current state:** exists in v1.
**v2 behaviour:** unchanged.
**Captured data:** `user_id`, `content_id`, `media_type`, `timestamp`, source surface.

**Recommendation engine effect:**
- Taste vector update: add title's embedding with weight `+1.0`
- Positively influences ranking of similar titles

**UI:** thumbs-up button, active (filled) state when selected. Can be toggled off.

### 2.2 Thumbs Down

**Current state:** exists in v1.
**v2 behaviour:** unchanged conceptually; weight important to tune.
**Captured data:** same as thumbs up.

**Recommendation engine effect:**
- Taste vector update: subtract with weight `-0.6`
- Penalises candidates similar to this title for a decaying window
- The title itself is filtered out of future recommendations

### 2.3 Add to Watchlist

**Current state:** exists in v1.
**v2 behaviour:** unchanged.
**Recommendation engine effect:**
- Taste vector update: add with weight `+0.3` (lower than thumbs up — watchlisting is intent, not endorsement)
- Positive signal for ranking similar titles

### 2.4 Mark as Watched

**Current state:** already exists on the v1 detail page.
**v2 behaviour:** unchanged UI; signal weight updated and captured for the ranking engine.

**Recommendation engine effect:**
- Taste vector update: add with weight `+0.5`
- Combined with thumbs up: `+1.5` (watched + endorsed)
- Combined with thumbs down: treated as `-0.6` with a "completed anyway" flag

### 2.5 Remove from Watchlist

**Current state:** exists in v1.
**v2 behaviour:** unchanged but modest weight.
**Recommendation engine effect:**
- Taste vector update: subtract with weight `-0.4`

### 2.6 Deep Link Click-Through

**Current state:** exists in v1 via `@capacitor/app-launcher`.
**v2 behaviour:** captured as the **highest-weight behavioural signal** with **confidence tagging** based on the `AppLauncher.openUrl()` call outcome.

**The confidence tagging problem:** when `AppLauncher.openUrl()` is called on Android, the OS routes the intent. If the target app is installed, the intent succeeds and the target app foregrounds within ~500ms-1s. If the target app is not installed, Android either shows a disambiguation dialog or (more commonly for `https://` links) opens the URL in a browser. The `openDeepLink.ts:28-45` code in v1 already handles this with a try/catch fallback to a browser URL.

The problem: both outcomes cause the app to go to background, and from the detail page's perspective they look identical. But the signal value is very different — a confirmed deep link launch is the strongest behavioural signal we have; a fallback-to-browser might mean the user genuinely went to watch, or it might mean they bounced from Chrome back to Videx immediately.

**v2 solution: tag the event with confidence level at the source.**

- If `AppLauncher.openUrl()` succeeds on its primary call → tag the `deep_link_click` event with `confidence: 'high'` (weight `+0.8`)
- If the call throws and falls back to the browser URL → tag with `confidence: 'low'` (weight `+0.4`)

**Captured data:**
- `user_id`
- `content_id`, `media_type`
- `service_id` (which service's deep link was tapped)
- `timestamp`
- `dwell_seconds_before_click`
- `confidence` (`'high'` or `'low'`)
- Source surface

**Recommendation engine effect:**
- High-confidence: taste vector update with weight `+0.8` — strongest behavioural signal
- Low-confidence: taste vector update with weight `+0.4` — still positive but discounted
- Also feeds service usage metrics (which services does the user actually deep-link into)
- Service usage affects service-fingerprint weighting in cold-start refreshes for this user

**Deep link correlation window (for the dwell timer):** see Section 3.2. When a deep link click event is fired, the dwell timer tags the next `appStateChange { isActive: false }` event within a 3-second window as "expected backgrounding from deep link" rather than "session interruption." This prevents the dwell timer from logging a spurious session-end event immediately after a legitimate deep link tap.

**UI:** the existing "Watch on [Service]" button. No UI change, but signal capture is more sophisticated in v2.

### 2.7 "Not Interested" — renamed from `dismiss` in Phase 0

**Current state:** the v1 codebase has an unused `dismiss` event type in `interactions.ts:24` and a separate localStorage-based dismissal list in `recommendations.ts` (`@app_dismissed_recommendations`) that the v1 recommendation engine actually consults via `getDismissedIds()`. These are two separate systems, and the transition to v2's "Not Interested" must handle both.

**v2 target state:** a single source of truth for "the user has dismissed this title" that lives in `user_interactions` as event type `not_interested`, is server-authoritative, integrates with the Phase 4 ranking pipeline, and is accessible to the v1 recommendation engine during Phases 1-3 without requiring transitional dual-write.

**Phase 0 transition plan:**

1. **Rename the event type.** `interactions.ts:24` changes `'dismiss'` to `'not_interested'` in the event_type union. The `not_interested` value joins the `user_interactions` event_type enum in migration 013.

2. **Rewrite `getDismissedIds()` in `recommendations.ts`.** The function signature stays identical — it continues to return `Promise<Set<string>>` in the `{media_type}-{content_id}` format (e.g., `"movie-12345"`, where 12345 is the TMDb ID stored in the `content_id` column). What changes is the data source:

   **Old implementation:** reads `@app_dismissed_recommendations` from localStorage, applies TTL expiry, returns the remaining IDs.
   
   **New implementation:**
   ```typescript
   // Pseudocode — actual implementation lives in src/lib/storage/recommendations.ts
   const { data } = await supabase
     .from('user_interactions')
     .select('content_id, media_type')
     .eq('user_id', userId)
     .eq('event_type', 'not_interested');
   
   return new Set(data.map(row => `${row.media_type}-${row.content_id}`));
   ```

   Cache the result in memory for the session. Invalidate on any new `not_interested` event. This keeps the hot recommendation path fast — the v1 engine calls `getDismissedIds()` once per recommendation refresh, and the cached result serves subsequent calls until a new dismissal happens.

3. **Parallelise with existing TMDb calls.** The existing recommendation engine path in `recommendationEngine.ts:628` awaits `getDismissedIds()` before the candidate filter step. With the Supabase query, this can be `Promise.all()`'d with the TMDb discover fetches to avoid adding serial latency.

4. **Delete the localStorage writer path.** `dismissRecommendation()`, `isDismissed()`, `cleanExpiredDismissals()`, and `getDismissedRecommendations()` in `recommendations.ts` all go away. The `cleanExpiredDismissals()` call in `recommendationEngine.ts:557` is removed.

5. **Add a new writer: `markNotInterested(tmdbId, mediaType)`.** This writes a new `not_interested` event to `user_interactions` and invalidates the session cache for `getDismissedIds()`. Called from the new detail page "Not Interested" button.

6. **No data migration needed.** With only two prototype users, any `@app_dismissed_recommendations` localStorage entries will be cleared by the Phase 0 housekeeping item (localStorage v1 clear via `@videx_version` flag). The dismissal history is not preserved — the two users start fresh on v2.

**Why this matters:** without this rewrite, dropping the localStorage dismissal list in Phase 0 would leave the v1 engine (still running through Phases 1-3) without its dismissal filter. The engine would start recommending already-dismissed titles for weeks of dev time. The `getDismissedIds()` rewrite closes this gap by swapping the data source while keeping the interface identical, so the v1 engine continues working unchanged.

**Captured data for `not_interested` events:**
- `user_id`
- `content_id`, `media_type`
- `timestamp`
- `session_id`

No optional reason menu. A binary action is enough.

**Recommendation engine effect:**
- Hard filter: the title is removed from future recommendations for this user (via the `getDismissedIds()` query in Phase 0-3, via the Phase 4 candidate retrieval filter in Phase 4 onwards)
- Taste vector update: none — this is a discovery signal, not a taste signal
- Does not propagate to similar titles (thumbs down is the signal for that)

**UI:** new small icon button on detail page, placement TBD in design exploration. Secondary to thumbs up/down. Not competing visually with the primary action row.

### 2.8 Save for Later — OPTIONAL, deferred to v2.5

**Current state:** v1 has a single watchlist concept.
**v2 MVP:** single watchlist concept, no change.
**v2.5 consideration:** distinction between "Watchlist" (intent to watch) and "Save for Later" (considering but not committed). Deferred unless onboarding/design tests surface a clear need.

---

## 3. Silent Signals

### 3.1 Detail Page Visit

**What it captures:** the user opened the detail page for a title.
**Data:**
- `user_id`
- `content_id`, `media_type`
- `timestamp`
- `session_id`
- Source surface (Home, For You, Browse, Watchlist, Search)
- Entry method

**Recommendation engine effect:**
- A detail page visit on its own is **NOT treated as a positive signal** in v2. It's the act of consideration, not endorsement. See Section 3.2 for dwell time interpretation.
- The visit event is logged regardless, as the anchor for all other signals (dwell, outcome) associated with this impression.

**Why this is a correction from earlier drafts:** initial versions treated a detail view as a weak positive (+0.15). This is wrong and contradicts Netflix, Prime, and YouTube's published research on title rejection patterns. A user who opens a detail page and then leaves has *considered and rejected* the title. Treating that as positive would train the engine to recommend more things the user considered but chose not to watch.

**Storage:** logged to `user_interactions` table as `detail_view` event. The emitter `emitDetailView()` already exists in `src/lib/storage/interactions.ts:99-111` and is called from `useContentDetail.ts`. Phase 0 enhances it to populate the new `source_surface` and `session_id` top-level columns (currently passed inside the `metadata` JSONB via the `source` field). Anchor event for subsequent dwell/outcome events.

### 3.2 Dwell Time and Exit Outcome (with full lifecycle handling)

**What it captures:** how long the user remained on the detail page, and what happened when they left.

**Data:**
- `user_id`, `content_id`, `media_type`, `timestamp`
- `dwell_seconds` — total time the page was open and foregrounded
- `exit_reason` — what the user did when they left: `deep_link_click`, `added_to_watchlist`, `thumbs_up`, `thumbs_down`, `marked_watched`, `not_interested`, `back_to_previous`, `app_backgrounded`
- `session_id`

**Measurement — full lifecycle:**

The dwell timer requires coordination across several Capacitor lifecycle events and the deep link correlation window. Getting this wrong produces either inflated dwell times (counting background time as dwell) or missed positive signals (treating a deep link launch as an app backgrounding event). The v2 implementation centralises this coordination in a new module:

**`src/lib/lifecycle/appState.ts` (new in Phase 0) — the lifecycle manager.**

The module wraps `App.addListener('appStateChange')` from `@capacitor/app` and exposes:

- `subscribe(listener)` — register a listener for background/foreground transitions. Returns an unsubscribe function.
- `isForeground()` — synchronous check of current state.
- `markDeepLinkExpected()` — called immediately after `AppLauncher.openUrl()` succeeds. Starts a 3-second window during which the next background event is tagged `expected: true` rather than `expected: false`.
- `flushImpressions()` — called by the impression batcher at lifecycle boundaries.

Both the dwell timer and the card impression batcher subscribe to this manager rather than registering their own Capacitor listeners. Centralising prevents the order-of-event issues that arise when multiple listeners race.

**Dwell timer behaviour:**

1. On DetailPage mount: start timer, record mount timestamp, subscribe to lifecycle manager.
2. On `appStateChange { isActive: false }`: 
   - If the `expected: true` flag is set (within 3s of a deep link click), do not pause the timer — the deep link click has already been recorded as the exit outcome, and the background event is a known consequence.
   - Otherwise, pause the timer (save elapsed so far).
3. On `appStateChange { isActive: true }`: if timer was paused, resume it.
4. On DetailPage unmount (via back button, navigation, or app close): stop the timer, determine the exit outcome, fire a single `dwell_event` with `{ dwell_seconds, exit_reason, session_id }` in the payload.
5. On app backgrounded for >5 minutes without returning: the session is considered abandoned. Fire a `dwell_event` with `exit_reason: 'app_backgrounded'` and close the detail page tracking. A new session_id is generated on the next foreground.

**Deep link click path:**

1. User taps "Watch on [Service]" button.
2. Detail page handler calls `AppLauncher.openUrl(deepLinkUrl)`.
3. If the primary call succeeds (promise resolves):
   - Fire `deep_link_click` event with `confidence: 'high'`.
   - Call `markDeepLinkExpected()` on the lifecycle manager.
   - The subsequent background event (arriving within ~500ms-1s) is tagged `expected: true`, so the dwell timer doesn't treat it as a session interruption.
4. If the primary call throws (target app not installed or intent has no handler):
   - Fall back to browser URL via `window.open()` or equivalent.
   - Fire `deep_link_click` event with `confidence: 'low'`.
   - Call `markDeepLinkExpected()` anyway — the browser opening also causes backgrounding.
5. Regardless of path, the detail page unmounts as part of the backgrounding flow, firing the final `dwell_event`.

**The interpretation matrix (unchanged from v0.2):**

Dwell time by itself is ambiguous:
- A 30-second dwell followed by a deep-link click = **strong positive**
- A 30-second dwell followed by back-navigation with no action = **weak negative**
- A 2-second dwell followed by back-navigation = **noise**
- A 45-second dwell followed by a thumbs-down = **clear taste rejection**

The same dwell duration means opposite things depending on exit outcome. v2 interprets dwell only through exit outcome.

**Recommendation engine effect — the interpretation matrix:**

| Dwell | Exit outcome | Signal interpretation | Weight |
|---|---|---|---|
| < 3s | Any | Accidental tap / noise | Ignored |
| 3–10s | Back to previous, no action | Quick rejection | **−0.15** |
| 10–30s | Back to previous, no action | Considered rejection | **−0.25** |
| 30s+ | Back to previous, no action | Deep consideration, deliberate rejection | **−0.35** |
| Any | Deep-link click (high confidence) | Commitment | **+0.8** |
| Any | Deep-link click (low confidence) | Discounted commitment | **+0.4** |
| Any | Watchlist add | Intent to return | **+0.3** |
| Any | Thumbs up | Explicit endorsement | **+1.0** |
| Any | Thumbs down | Explicit rejection | **−0.6** |
| Any | Not interested | Explicit discovery rejection | Filter only, no taste update |
| Any | Marked watched | Watched, no rating | **+0.5** |
| Any | App backgrounded (not expected) | Unknown — session incomplete | Ignored until session resumes |

**Industry alignment:** Netflix, Prime, YouTube, and Spotify research converges on the pattern that a detail view that does not convert to an action is a title rejection. v2's negative dwell signals align with this.

**Privacy note:** dwell time and exit outcome are behavioural data and must be disclosed in the privacy policy as "how long you spend looking at content details, and what you do next."

### 3.3 Scroll Depth — DEFERRED TO POST-v2

**Not implemented in v2 MVP.** Kept for reference in case we revisit.

### 3.4 Section Expansion

**What it captures:** which sections of the detail page the user expanded (cast accordion, synopsis "read more," reviews, similar titles row scroll, etc.)
**v2 MVP:** log the events but don't weight them into the taste vector. Collect the data for future use.
**Storage:** new sub-event type in `user_interactions` with `event_type: 'section_expanded'` and section name in payload.

### 3.5 Back-Navigation Speed — subsumed into Section 3.2

Back-navigation is one of the `exit_reason` values in the dwell event. Not tracked as a separate signal.

### 3.6 Trailer Play — NOT APPLICABLE

Videx has no in-app trailer playback.

### 3.7 Rating Panel Interaction — NOT IMPLEMENTED

Not worth the implementation cost for v2 MVP.

---

## 4. Signal Weights Summary

### 4.1 Explicit signals (user-initiated)

| Signal | Type | Default Weight | Notes |
|---|---|---|---|
| Thumbs Up | Explicit | **+1.0** | Highest explicit positive |
| Watched + Thumbs Up | Explicit combo | **+1.5** | Combined signal replaces both individual signals |
| Mark as Watched | Explicit | **+0.5** | Watched without rating |
| Add to Watchlist | Explicit | **+0.3** | Intent to return |
| Remove from Watchlist | Explicit | **−0.4** | Interest lost |
| Thumbs Down | Explicit | **−0.6** | Taste rejection |
| Not Interested | Explicit | **Hard filter only** | No taste update |

### 4.2 Behavioural signals (interpreted through exit outcome)

| Dwell duration | Exit outcome | Interpretation | Weight |
|---|---|---|---|
| Any | Deep-link click (high confidence) | Strongest commitment | **+0.8** |
| Any | Deep-link click (low confidence) | Discounted commitment | **+0.4** |
| Any | Thumbs up / watchlist add / mark watched | See explicit signals above | (explicit weight) |
| < 3s | Any | Noise | **Ignored** |
| 3–10s | Back, no action | Quick rejection | **−0.15** |
| 10–30s | Back, no action | Considered rejection | **−0.25** |
| 30s+ | Back, no action | Deep rejection | **−0.35** |
| Any | App backgrounded (not expected) | Session incomplete | **Ignored until resumed** |

### 4.3 How signals combine

**Rule 1 — Deduplication within 24 hours.** Multiple detail views of the same title within a 24-hour window count as one signal, using the highest-weight component.

**Rule 2 — Replace, don't add.** Explicit signals on a title replace previous signals rather than adding to them. If a user watchlisted a title (+0.3), then thumbs-upped it (+1.0), the taste vector update is +1.0.

**Rule 3 — Decay.** Older signals decay. Half-life of **90 days** for behavioural signals, **180 days** for explicit signals.

**Rule 4 — Confidence floor.** First 20 interactions from a new user weighted at 1.5x.

**Rule 5 — Negative dwell signals cap.** Cumulative negative dwell signal per session capped at **−1.0**.

### 4.4 Scale consistency

All scoring on the same scale:
- Taste vector updates are weighted sums of unit-length embedding deltas
- Ranking weights are percentages that sum to 100%
- No mixing of raw scores and normalised scores

The v1 `scoreCandidate()` scale mismatch bug is explicitly not carried forward.

---

## 5. Data Storage

### 5.1 `user_interactions` table (explicit and outcome events)

This table exists in v1 (migration 010). v2 expands its schema via migration 013, which adds two new top-level columns and renames one event type. The existing column names (`event_type`, `content_id`, `metadata`) are preserved for compatibility with all existing code that references them.

```
user_interactions (existing table, expanded in migration 013)
├── id (uuid, primary key)
├── user_id (uuid, FK to profiles.id)
├── content_id (integer)                        -- existing, holds the TMDb ID
├── media_type (text: 'movie' | 'tv')           -- existing
├── event_type (text enum — see below)          -- existing, renamed values in migration 013
├── source_surface (text, nullable)             -- NEW in migration 013
├── session_id (uuid, nullable)                 -- NEW in migration 013
├── metadata (jsonb)                            -- existing, holds ad-hoc fields
└── created_at (timestamptz)                    -- existing
```

**Notes on the schema:**
- `content_id` (not `tmdb_id`) is the existing column name; it holds the TMDb ID. All v2 code references `content_id` to match the existing table.
- `event_type` (not `interaction_type`) is the existing column name. v2 docs and code reference `event_type`.
- `source_surface` is added as a top-level column in migration 013 (not stored in `metadata`) because it's queried frequently for surface-level analytics and benefits from being indexable. Existing rows have `source_surface = NULL` by design (no JSONB-to-column backfill — see Phase 0 migration notes).
- `session_id` is added as a top-level column in migration 013 for the same reason.
- `metadata` JSONB continues to hold ad-hoc fields: `client_version`, `confidence` (for deep link events), `dwell_seconds`, `exit_reason`, and any signal-specific payload.

**event_type values (v2):**
- `thumbs_up`, `thumbs_down`
- `watchlist_add`, `watchlist_remove`
- `watched` (was previously listed as `marked_watched`; the `marked_watched` event_type was dropped in Phase 5 migration 037 — only `watched` survives in `user_interactions.event_type`. Note: `marked_watched` is still a canonical `exit_reason` value inside `dwell_event` metadata, see line 237.)
- `deep_link_click`
- `not_interested` (renamed from `dismiss` in migration 013)
- `detail_view` (fired on detail page open — already wired in v1 via `emitDetailView()` at `interactions.ts:99-111`, enhanced in Phase 0 to populate the new `source_surface` and `session_id` columns)
- `dwell_event` (fired on detail page close with dwell duration AND exit_reason in metadata)
- `section_expanded` (logged for future use, not weighted in v2 MVP)

**metadata payload examples:**
- `dwell_event`: `{ "dwell_seconds": 43, "exit_reason": "back_to_previous" }` or `{ "dwell_seconds": 12, "exit_reason": "deep_link_click" }`
- `thumbs_up`: `{ "previous_rating": null }` (to support toggling)
- `deep_link_click`: `{ "service_id": "netflix", "deep_link_url": "...", "dwell_seconds_before_click": 28, "confidence": "high" }`
- `not_interested`: `{}` (just the event_type, content_id, and timestamp are needed)

### 5.2 `card_impressions` table (dedicated, new in Phase 0)

**Impression tracking does NOT live in `user_interactions`.** Card impressions are fundamentally different from explicit and outcome events:

- **Volume:** 50-200 impressions per session, vs 5-20 discrete user actions
- **Query pattern:** aggregate analytics (CTR by surface, position-weighted click rates) rather than per-user history reads
- **Retention:** short-to-medium term (90 days row-level, then aggregated) vs long-term signal history

Putting impressions in `user_interactions` would bloat the table, slow down taste vector recomputation queries, and force analytics queries through a JSONB payload column that can't be efficiently indexed for the access patterns we need.

**Schema (migration 014):**

```
card_impressions (partitioned by month via pg_partman)
├── id (bigint, primary key — auto-increment)
├── user_id (uuid, FK to profiles.id)
├── content_id (integer — holds the TMDb ID, named for consistency with user_interactions)
├── source_surface (text: 'home' | 'for_you' | 'browse' | 'watchlist' | 'search' | 'detail')
├── position (integer — 0-indexed position within the row on that surface)
├── session_id (uuid)
├── shown_at (timestamptz)
```

**Naming consistency note:** `content_id` is used here (not `tmdb_id`) to match the existing `user_interactions` table. Both tables hold TMDb IDs as integers; using the same column name across both tables avoids confusion when joining or analysing.

**Partitioning:** monthly via `pg_partman` extension (available on Supabase Pro). `pg_partman` handles automatic partition creation so new months don't require manual DDL. Without it, missing a partition creation would cause inserts to fail silently.

**Retention policy:**
- **Row-level retention:** 90 days. Individual impression rows are kept for 90 days to support fine-grained analytics (position effects, session reconstruction, surface-level CTR tuning).
- **Aggregation step:** a daily scheduled job (pg_cron entry) rolls impressions older than 90 days into a `card_impression_daily_totals` table with schema `(date, user_id, source_surface, content_id, impression_count)`. The aggregation job runs BEFORE the deletion step to prevent data loss.
- **Partition drop:** after the aggregation job confirms a month's partition is fully rolled up, the month's partition is dropped via pg_partman's retention logic.

**Indexes:**
- `(user_id, shown_at DESC)` for per-user recency queries
- `(source_surface, shown_at DESC)` for surface-level analytics
- `(session_id)` for session reconstruction

**Client-side batching (required):**

The impression batcher lives in `src/lib/instrumentation/impressionBatcher.ts` (new in Phase 0) and subscribes to the lifecycle manager (`appState.ts`) for lifecycle events.

**Flush triggers:**
- **Interval:** every 10 seconds
- **Buffer size:** flush immediately on reaching 100 events
- **App lifecycle:** on background, on foreground (the batcher subscribes to the lifecycle manager)
- **Bottom nav tab change:** flush on any switch between Home / For You / Browse / Watchlist / Profile. Hook into the existing `handleTabChange` in `App.tsx:226-233` — add the flush call before `setActiveTab(tab)` so impressions from the previous surface are captured.
- **Detail page entry:** flush before the detail page loads. Hook into the existing `handleItemSelect` in `App.tsx:204-209`. This keeps detail page impressions separable from the source surface's impressions.
- **Component unmount:** flush on app close (fire-and-forget)

**Failure handling:** one retry on network failure, then drop the batch. Impressions are not critical data — losing some is acceptable and preferable to introducing complex retry state.

**Why these triggers specifically:** without tab change and detail page entry as flush boundaries, impressions from one surface sit in the buffer while the user browses another. The `source_surface` field on each event is still attributed correctly, but the flush timing drifts away from actual browsing cadence, which breaks session-based analysis.

### 5.3 Row volume considerations

At the two-prototype-user scale, volume is trivial. The design choices above matter for future scaling, not current operation.

**At 10K MAU (future target):**
- `user_interactions`: 5-20 events per active user per day → 50K-200K rows/day → 1.5M-6M rows/month
- `card_impressions`: 50-200 events per session, 2-5 sessions/user/day → 1M-10M rows/day
- Without partitioning and retention, `card_impressions` would become unmanageable within weeks

The pg_partman + 90-day retention + daily aggregation policy keeps `card_impressions` at a manageable steady-state size even at 100K MAU.

### 5.4 Derived data: taste vector recomputation

The `taste_profiles` table stores the user's current taste vector. In v2 it's recomputed from `user_interactions` events (not from the `card_impressions` table — impressions are analytics, not taste signal):

- On every explicit signal (thumbs, watchlist, watched, deep-link)
- Asynchronously every 30-60 minutes for silent dwell signals
- On slider changes (sliders affect pipeline parameters, but also trigger a recomputation)

Index `user_interactions` on `(user_id, created_at DESC)` for efficient taste recomputation queries.

---

## 6. GDPR Compliance

### 6.1 Lawful basis for processing

For a UK-focused app, the lawful basis is **legitimate interest** — the signals are necessary to provide the core product feature (personalised recommendations). This requires:

1. Clear privacy notice explaining what's collected and why
2. User ability to object (via account deletion or explicit opt-out)
3. Signal minimisation
4. Reasonable retention periods

### 6.2 Required disclosures

**Onboarding disclosure (brief):**

> "Videx learns from what you watch, rate, and explore in the app so we can recommend content that matches your taste. We never sell this data or share it with other services. You can see and delete your data anytime from your profile."

**Privacy policy (full):** accessible from Profile → Settings → Privacy. Lists all signals collected, why, retention, user rights, contact.

**In-product accessibility:** Profile → Settings → "What Videx learns from you" page translating the signals list into user-facing language:
- "We track what you rate, add to your watchlist, and tap to watch"
- "We track how long you spend looking at a title's details"
- "We track which services you actually open vs just browse"
- "We do NOT track your location, your other apps, or your viewing habits outside Videx"

### 6.3 Data access and deletion

**Access (GDPR Article 15):** Profile → Settings → "Download my data" generates a JSON export of `user_interactions`, `card_impression_daily_totals` (aggregated only, not row-level), `taste_profile`, `watchlist`, `preferences`. Delivered via email or in-app download.

**Deletion (GDPR Article 17):** Profile → Settings → "Delete my account" triggers hard-delete of all user-scoped data including `card_impressions` rows. Retain only anonymised aggregates with no identifiers.

**Portability (GDPR Article 20):** same export as access, in machine-readable JSON.

### 6.4 Retention policy

- **Active users:** `user_interactions` retained as long as account is active. `card_impressions` row-level for 90 days, then aggregated.
- **Inactive users (> 18 months no login):** soft-delete on interactions older than 12 months; retain taste vector and watchlist.
- **Deleted accounts:** immediate hard delete across all user-scoped tables.
- **Children's data (UK < 13):** should not exist — no child accounts in v2.

### 6.5 What we do NOT capture

- No location data (beyond initial region for service availability)
- No device-level tracking beyond what's visible to the app
- No third-party advertising identifiers
- No sharing with third parties for marketing
- No selling of data
- No keystroke or input tracking outside explicit forms
- No microphone, camera, or contacts access
- No watching habits on other apps

---

## 7. What Changes on the Detail Page UI

### 7.1 New affordances

**Only one new visible affordance in v2 MVP:**

1. **"Not Interested" button** — new v2 detail page button. Placement TBD via design exploration. Not competing visually with thumbs up/down. Wires to the `markNotInterested()` function which writes a `not_interested` event to `user_interactions` and invalidates the `getDismissedIds()` session cache.

**Already implemented in v1 (no UI change needed):**
- Thumbs up / thumbs down
- Add to / remove from watchlist
- Mark as Watched button
- Deep-link click-through ("Watch on [Service]")
- Share button
- Push notifications

**Invisible changes in Phase 0:**
- The existing `AppLauncher.openUrl()` call site gains confidence tagging logic (Section 2.6)
- The detail page mount registers with the lifecycle manager (`appState.ts`) for dwell timer coordination
- The existing `emitDetailView()` emitter is enhanced to populate the new top-level `source_surface` column instead of stuffing the source inside `metadata` JSONB. The `detail_view` event continues to fire on every detail page view as it does today.
- The dwell timer is new — every detail page exit fires a `dwell_event` with the appropriate `exit_reason` (this is added in Phase 0)
- All interaction events now include `session_id` from the lifecycle manager

### 7.2 No new visible tracking UI

- No visible dwell time display
- No scroll depth indicator
- No "we're learning from you" banners
- No per-signal toggles
- No explanation of why this title is being shown

### 7.3 One small consideration: feedback moments

Optional: after the first few thumbs-ups in a session, show a one-time ephemeral toast: "Updated your recommendations." Doesn't persist, doesn't require interaction, just confirms the action had an effect. Ship without this in v2 MVP; add later if users ask "is this doing anything?"

---

## 8. Open Questions — Resolutions

Most open questions from v0.1 and v0.2 are now resolved:

1. **"Not interested" in v2 MVP?** ✅ Yes, with the full Phase 0 rename-plus-rewrite approach in Section 2.7.
2. **Scroll depth in v2 MVP?** ✅ Deferred.
3. **Decay half-life?** ✅ 90 days for behavioural, 180 days for explicit.
4. **Mark as Watched on detail page?** ✅ Already in v1, signal weight updated.
5. **Data retention policy — 12 months for silent signals?** ✅ Yes, with revisit if storage becomes an issue.
6. **"Pause learning" mode?** ✅ Deferred.
7. **Partial watch / progress tracking?** ✅ Binary only for v2.
8. **"Updated your recommendations" feedback toast?** Deferred — ship without, add if needed.
9. **Dwell negative signal cap per session — is −1.0 the right cap?** Starting point, tune empirically in Phase 4.
10. **Deep link confidence weight (low=+0.4, high=+0.8)** — starting points, tune in Phase 4.
11. **Impression batcher flush interval (10s)** — starting point, tune if users report impressions dropping or stale.
12. **Is pg_partman working as expected for monthly partition creation?** Verify in Phase 0 after first month ticks over.

---

## 9. Implementation References

### 9.1 Migrations introduced by this spec

- **Migration 013 — `013_user_interactions_v2_expansion.sql`** (Phase 0):
  - Rename `dismiss` to `not_interested` in the `event_type` enum (or update any CHECK constraint, depending on how the v1 schema enforces event_type values)
  - Add `session_id` column (uuid, nullable) to `user_interactions`
  - Add `source_surface` column (text, nullable) to `user_interactions` as a top-level field. This is for queryability — surface analytics frequently filter on source_surface. Storing it as JSONB inside `metadata` would slow these queries.
  - Any existing `dismiss` rows are migrated in-place (there should be zero in production, but handle gracefully)
  - Existing rows have `source_surface = NULL` and `session_id = NULL` by design. No JSONB-to-column backfill is performed — the analytics value of historical source data for two prototype users is near zero, and skipping the backfill keeps the migration simpler. Add a comment in the migration noting this design decision.

- **Migration 014 — `014_card_impressions_table.sql`** (Phase 0):
  - Enable `pg_partman` extension
  - Create `card_impressions` table with monthly partitioning
  - Create `card_impression_daily_totals` aggregation table
  - Create pg_cron entry for daily aggregation job
  - Create pg_partman retention policy for 90-day row retention

### 9.2 New code modules introduced by this spec

- **`src/lib/lifecycle/appState.ts`** — lifecycle manager wrapping Capacitor's `App.addListener('appStateChange')`. Exposes subscribe, isForeground, markDeepLinkExpected, flushImpressions.
- **`src/lib/instrumentation/impressionBatcher.ts`** — client-side impression batcher with the flush trigger set specified in Section 5.2.
- **`src/lib/instrumentation/sessionId.ts`** — session ID generator, produces a new UUID on app foreground after >5 minutes of background time.
- **`src/lib/instrumentation/dwellTimer.ts`** — dwell timer with pause/resume on background/foreground, deep link correlation window, exit outcome capture.

### 9.3 Code modules modified by this spec

- **`src/lib/storage/interactions.ts`** — rename `'dismiss'` to `'not_interested'` in the `event_type` union. Add new emitter `markNotInterested()`. Add `source_surface` as an optional field on `InteractionEvent` (line 26-31), defaulting to `null` in the Supabase insert at line 47-55. Only `emitDetailView()` passes `source_surface` explicitly (currently passes `source` inside `metadata` — Phase 0 migrates this to the new top-level column). Other emitters (`emitContentInteraction`, `emitQuizAnswer`, `emitQuizCompleted`, `emitSearch`) do not need to pass `source_surface` — their events get `null` which is correct because actions taken on the detail page have implicit context (the source is always 'detail' for actions taken there).
- **`src/lib/storage/recommendations.ts`** — rewrite `getDismissedIds()` to query `user_interactions` instead of localStorage. Delete `dismissRecommendation`, `isDismissed`, `cleanExpiredDismissals`, `getDismissedRecommendations`.
- **`src/lib/utils/recommendationEngine.ts:557`** — remove the `cleanExpiredDismissals()` call.
- **`src/components/DetailPage.tsx`** (or equivalent) — register with lifecycle manager on mount, fire `detail_view` anchor event, set up dwell timer, add "Not Interested" button with `markNotInterested()` handler.
- **`src/lib/api/openDeepLink.ts`** — add confidence tagging based on openUrl success vs fallback.
- **`src/App.tsx`** — add impression flush calls to `handleTabChange` and `handleItemSelect`.

### 9.4 Cross-references

- **Migration numbering and phase sequencing:** Project Orchestration v0.3 Section 3.4
- **Implementation Notes Parking Lot:** see IN-001, IN-002, IN-003 (dwell lifecycle), IN-004 (negative session cap), IN-005 (impression source tagging), IN-006 (session ID generation) in Parking Lot v0.3
- **Recommendation Engine Strategy:** Section 6.4 (Instrumentation Prerequisites) in Strategy v1.6

---

*End of Detail Page Signal Capture Spec v0.3.1. All CC round 2 findings incorporated. Cross-document corrections applied. Ready for Phase 0 specification work.*
