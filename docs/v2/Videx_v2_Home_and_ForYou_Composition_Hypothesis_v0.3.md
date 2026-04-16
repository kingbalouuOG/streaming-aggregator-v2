# Videx v2 — Homepage & For You Surface Composition Hypothesis

**Status:** v0.3 — Minor updates reflecting locked decisions from strategy review rounds 1-3
**Version:** 0.3
**Purpose:** Define the composition logic, row types, ordering rules, and cold-start behaviour for the two primary content surfaces in v2: the Home surface (discovery-led) and the For You surface (personalised-led).

**Changes from v0.2:**
- **Section 3.2 (slider panel):** "Depth vs breadth" slider renamed to "Focused ↔ Varied" to reflect what the mechanism actually does. Videx has no episode-level progress tracking, so the "Finish what I start" framing was misleading.
- **Section 2.2 row 6 (Critically Acclaimed New Releases):** added sequencing constraint — this row is gated on OMDB backfill completion because it depends on Rotten Tomatoes scores being populated for the relevant recent releases. The row does not ship until OMDB data coverage reaches at least 80% of titles released in the last 90 days.
- **Section 3.2 row 3 (Mood Rooms for Tonight):** added cross-reference to the HDBSCAN execution model in the Recommendation Engine Strategy v1.6 Section 5.2 (Python + GitHub Actions monthly cron).
- **Section 5.2 (Row freshness and caching):** clarified that Home cache TTL refers to the rendered row content, not the underlying data. Cache invalidation triggers are unchanged.
- **Section 9 (Summary):** updated to reflect the slider rename and OMDB sequencing note.
- All other sections unchanged from v0.2.

---

## 1. Context and Framing

### 1.1 Why two surfaces instead of one

In v1, Videx has a single homepage that tries to do everything: show trending, surface new releases, recommend personalised content, feature hero content, and expose genre-based rows. Every row competes with every other row for attention, and the mental model is muddled — users arriving in different mental states ("what's new?" vs "what matches me?") see the same mixed surface.

v2 splits this into two surfaces with clean purposes:

**Home = discovery mode.** Answers the question: *what's happening across my services right now?* Leans into recency, trending, new releases, and zeitgeist content. Personalisation is present but light: the content is filtered hard by the user's services, and ordered softly by taste. The mental model is "zeitgeist surface."

**For You = personalised mode.** Answers the question: *what should I watch that matches me?* Leans into the taste vector, mood rooms, deep catalogue, and aesthetic coherence. Personalisation is heavy: this is where the recommendation engine's full signal is expressed. Sliders live here. The mental model is "curated surface."

Both surfaces coexist and are equally important. The bottom navigation has both as primary tabs. Users can fluidly move between them depending on their mental state.

### 1.2 Which surface is the landing surface after onboarding?

**Proposal: users land on For You immediately after onboarding completes.**

Reasoning: onboarding is an investment in personalisation. Users have just answered questions about themselves, picked services, selected watched titles, and set slider preferences. The most honest payoff is to show them the personalised surface that all that data just populated. Landing on Home instead would make the onboarding feel disconnected from the first viewing experience.

After the first session, the landing tab should be either (a) the last tab they used, or (b) always For You, pending a design test. Instinct is last-used, because it respects user agency.

### 1.3 How the two surfaces relate

The two surfaces are not hierarchical — neither is the "real" homepage with the other as a side feature. They're parallel destinations with different purposes. A user might spend 70% of their time on one and 30% on the other, or split it evenly; we'll instrument both and see.

Content flows between them:
- A mood room on For You can be "featured" on Home for a week as an editorial push
- A trending title on Home can be surfaced on For You via "More like this" if it fits the user's taste
- A title on the user's watchlist appears in both surfaces

But the two surfaces don't compete — they complement.

---

## 2. The Home Surface

### 2.1 Purpose and principles

**Purpose:** Give users a zeitgeist view of what's happening across the services they pay for. Help them discover new releases, trending content, and editorial picks without needing to trust the recommendation engine.

**Principles:**
1. **Hard-filtered by services.** Every title shown on Home must be available on at least one of the user's subscribed services. This is foundational — breaking this rule breaks the USP.
2. **Lightly ordered by taste (15–20% weight).** Within rows, ordering is softly influenced by the user's taste vector. A user who loves horror sees trending horror before trending romcoms, but still sees the romcom if it's at zeitgeist-level popularity. The taste influence is a tiebreaker, not a filter — 80–85% of ordering is driven by the row's primary signal (popularity, recency, critical score), with 15–20% from taste fit. The Featured Hero uses a higher taste weight (30–40%) because it's a single high-stakes slot.
3. **Recency-dominant.** Home is the surface where "new" matters most. Recency is a baseline sort signal on most rows.
4. **Shallow personalisation.** No deep "because you watched X" logic. No hidden gems. No mood rooms. Home is honest about what's out there; For You interprets it through the lens of your taste.
5. **Familiar structure.** Home should feel like something users recognise from Netflix, Disney+, and JustWatch — a scrollable feed of rows with clear labels. Innovation lives on For You; Home earns trust through familiarity.

### 2.2 Proposed row composition for Home

In approximate order from top to bottom:

**1. Featured Hero Carousel (3–5 titles, auto-rotating or swipeable)**
- A rotating carousel of 3–5 large hero cards at the top of the surface
- Editorially adjacent but algorithmically selected from "high-profile new releases this week"
- Content type: major new film releases, anticipated TV premieres, notable additions to services
- **Selection logic:** pool = titles released or added to services in last 14 days that are available on at least one of the user's services AND have vote_count > threshold AND popularity > threshold. Within pool, rank by (popularity × taste fit). Top 3–5 matches populate the carousel. The carousel rotates automatically every 5–7 seconds and allows manual swipe.
- **Why carousel over single hero:** a single static hero feels like an editorial choice the user might not care about. A carousel of 3–5 lets us surface more zeitgeist content without sacrificing the hero's visual weight, and gives users a sense of "what's worth knowing about right now" rather than "here's one thing we picked."
- **Why at the top:** Home is discovery mode. The carousel sets the tone for what the surface is about — multiple things, happening now.

**2. Recently Added to Your Services (10–50 titles, horizontal scroll)**
- Titles that joined any of the user's services in the last 30 days OR were released in that window
- Ordered by: (date_added_to_service DESC × light taste fit × popularity secondary)
- **Selection logic:** pull titles where `earliest_available_on_services >= now() - 30 days` OR `release_date >= now() - 30 days`. This catches both brand-new releases and back-catalogue titles that were recently licensed to a service. A 2018 film that joined Netflix last Tuesday and a film released yesterday both belong here. Dedupe if a title meets both conditions.
- **Lazy-loaded:** 10 initial, +5 on horizontal scroll, cap 50 (per the existing lazy loading spec)
- **Why row 2:** "What's new to me" is the most common discovery question. This merges what was previously two rows ("New This Week" and "Recently Added") into a single cleaner row that captures both new releases and catalogue additions. This is also a USP row — individual services bury catalogue additions while promoting only originals, so a unified "recently added" view across services is differentiating.

**3. Trending Across Your Services (10–50 titles, horizontal scroll)**
- Currently trending titles across all user services, deduplicated
- Ordered by: (cross-service trending score × light taste fit)
- **Selection logic:** pull titles with high `popularity` values, filtered to user's services. Dedupe if a title is on multiple services (show once, label with all available services). Taste vector softly influences ordering.
- **"Trending" definition:** rolling 7-day popularity score from TMDb, smoothed against historical baseline to surface genuine momentum rather than evergreen popularity.
- **Why row 3:** "What's everyone watching" is the second most common discovery question. It also validates the cross-service USP — a title trending on Apple TV+ appears next to one trending on Netflix.

**4. Coming Soon (10–30 titles, horizontal scroll)**
- Titles with release dates in the next 30 days, filtered to user's services
- Ordered by: release_date ASC (soonest first), with anticipation signals (vote count, popularity on TMDb pre-release) as secondary sort
- **Selection logic:** pull titles where `release_date BETWEEN now() AND now() + 30 days` AND (either already available or announced on user's services). Show countdown badges.
- **Why row 4:** anticipation is a distinct content discovery mode. Users plan their viewing weeks ahead. This is also where Videx's calendar feature ties in.

**5. Popular on [Service A] (10–30 titles, horizontal scroll)**
- Per-service top charts, ordered by that service's own popularity signal
- **Selection logic:** one row per user's service, in the order of most-used service first (inferred from deep-link click-throughs and detail views). User with Netflix + Prime + Apple TV+ sees three rows: "Popular on Netflix," "Popular on Prime," "Popular on Apple TV+."
- **Ordering within row:** service-specific popularity. Taste fit as light secondary sort.
- **Why these rows:** validates the JustWatch pattern (per-service charts are heavily used). Also gives users a clear mental model: "I want to see what's on Netflix right now." Quick switching between services without navigating into each.
- **Row count:** one row per service the user has. If they have 5+ services, show the top 3 and link to "See all service charts."

**6. Critically Acclaimed New Releases (10–15 titles, horizontal scroll)**
- An algorithmically selected row of recent releases that have received strong critical reception
- **Selection logic:** pull titles released in the last 90 days that meet multiple quality signals: high Rotten Tomatoes score (≥80%), high IMDb rating (≥7.5), high vote_count (to filter out small-sample titles), AND availability on at least one of the user's services. Rank by (composite critical score × recency × taste fit × service spread). Show a mix across services — no single service should dominate this row.
- **Why this row, not "Editorial Picks":** an editorial picks row would require manual weekly curation, which isn't realistic at launch. A critically acclaimed row gets the same effect (surfacing quality content users might otherwise miss) using signals we already have: Rotten Tomatoes scores from the OMDB integration, IMDb ratings, and TMDb vote metrics. No ongoing curation burden.
- **Why this works as an editorial substitute:** critical consensus is a reasonable proxy for editorial judgment. If critics broadly love a new release, it's usually worth surfacing. Users who want editorial voice get quality signal; users who don't care about critical scores still see the content on other rows.
- **Future option:** this row can be replaced with or supplemented by genuine editorial curation later if we decide to invest in that operational layer. For v2 MVP, algorithmic is the right call.
- **⚠️ Sequencing constraint (new in v0.3):** this row depends on OMDB-sourced Rotten Tomatoes scores being current for the relevant pool of recent releases. The current OMDB daily refresh job has a multi-week backfill window. **The Critically Acclaimed row does not ship until OMDB data coverage reaches at least 80% of titles released in the last 90 days.** This is a hard sequencing gate — the row cannot surface critically acclaimed content if it doesn't have critical scores to rank against. During Phase 4 implementation, verify the OMDB coverage percentage before enabling this row on Home. If the row is enabled prematurely, it will either surface sparse results or over-weight the small subset of titles that happen to have scores, producing a confusing "this doesn't seem like the best of the last 3 months" experience.

**7. Genre spotlight (rotating, 10–30 titles)**
- One genre row, rotated weekly or daily
- **Selection logic:** pick one genre per day/week (could be time-of-week based — "Horror Fridays," "Comedy Sundays"). Within the genre, show trending and recently added titles from user's services.
- **Why this row:** seasonal and editorial flavour without needing full curation. Also helps cover genres the user might not have selected in onboarding.

### 2.3 Home row ordering rules

1. **Featured Hero carousel first, always.** Anchors the surface with rotating big-ticket content.
2. **Recently Added before Trending.** "What's new to me" takes precedence over "what's popular" because recency is the Home surface's primary thesis.
3. **Coming Soon after Trending.** Anticipation sits between current popularity and per-service browse.
4. **Per-service rows before Critically Acclaimed and Genre.** Users want to know what's on their services before they see the cross-service quality mix or a genre spotlight.
5. **Critically Acclaimed and Genre rows as the "long tail."** Further down the scroll, giving users a reason to keep going but not cluttering the initial view.
6. **Maximum row count: 7–9.** With 7 base rows plus up to 3 per-service charts (top 3 services shown), the surface caps at around 9 rows. Beyond that, users don't scroll and rows lower down become zombie content.

### 2.4 Home rows that we explicitly DON'T include (and why)

- **"For You" row.** That's what the For You surface is. Duplicating it here muddies both surfaces.
- **"Hidden Gems" row.** Belongs on For You. Hidden Gems are personalised low-popularity high-fit titles — that's not Home's job.
- **Mood rooms.** Belong on For You. Home is zeitgeist; mood rooms are taste-driven.
- **"Because you watched X" rows.** Belong on For You. Home doesn't reason about individual titles you've watched.
- **"Continue Watching."** Not tracked in v2 — Videx has no per-episode progress state.

### 2.5 Home behaviour during edge cases

**New user with 0 interactions (post-onboarding, pre-behavioural data):**
- Hero: selected from new releases on their services, with service-fingerprint-based taste fit (using Pillar 3's cold-start prior)
- All rows populate normally because they're not dependent on behavioural data
- Taste vector influence is minimal but service fingerprints provide a reasonable proxy

**User with only 1 service:**
- Extreme edge case in the UK market. Most UK users have BBC iPlayer, Channel 4, and ITVX as free baselines, plus at least one subscription service on top
- v2 does not optimise for single-service users. Home still works (one "Popular on [Service]" row, cross-service rows become single-service), but we do not add special padding or differentiated treatment
- The app's USP is about aggregating multiple services — single-service users are not the target audience

**User with many services (5+):**
- Show top 3 service-specific rows; collapse the rest into a "See all" link
- Cross-service rows (Recently Added, Trending) become the dominant surface

**User who has dismissed a title:**
- Dismissed (not_interested) titles don't appear on Home at all, even if they're trending on services
- Dismissal is respected across both surfaces
- In v2, dismissals are read from the `user_interactions` table (see Detail Page Signal Capture Spec v0.3 Section 2.7 for the Phase 0 transition from the legacy localStorage approach)

---

## 3. The For You Surface

> **Phase 3 implementation note (April 2026):** Phase 3 ships a minimal For You surface with only two rows: "Recommended For You" (cosine-sorted from `match_titles_by_vector`) and "Hidden Gems" (popularity-capped variant). The full row composition described below (Mood Rooms, Because You Watched, Outside Your Usual, etc.) is Phase 4 scope.

### 3.1 Purpose and principles

**Purpose:** Give users a highly personalised view of content that matches their taste. This is the surface where the recommendation engine is fully expressed. It's where users go when they want Videx to interpret their taste rather than show them what's out there.

**Principles:**
1. **Heavy personalisation.** Every row is taste-aware. Some rows are fully personalised (taste vector ranking). Others are pre-curated categories but ordered by taste fit within the category.
2. **Sliders have dual access.** Catalogue age, Comfort zone, Content mix, Focused ↔ Varied live in both Profile (canonical settings home) and For You (contextual access via a collapsed entry point that opens as a modal or tray). Users can adjust them from either location and the state is shared.
3. **Mood rooms are the dominant row type.** Most rows on For You are either a mood room or a personalised curated row. Mood rooms are the primary organising metaphor, even if some rows are not mood rooms per se.
4. **Service-filtered, always.** Like Home, everything on For You is filtered to the user's services. This is non-negotiable.
5. **Deep catalogue-friendly.** For You is where older, less-popular-but-high-fit titles get surfaced. Hidden gems, back-catalogue recommendations, director-signature clusters — all the work the recommendation engine does that Home can't express.
6. **Mood-adaptive.** The rows shown can rotate based on time of day, day of week, and — eventually — explicit context chips ("Solo," "With partner," "With kids"). The same user sees slightly different For You at 2pm on Tuesday vs 9pm on Saturday.

### 3.2 Proposed row composition for For You

**Top of surface: slider control panel (collapsed by default, opens as modal/tray)**
- Four sliders: Catalogue age, Comfort zone, Content mix, Focused ↔ Varied
- **Option C approach:** sliders live in BOTH Profile (canonical state, always accessible from settings) AND on For You (contextual access in the moment of use)
- On For You, sliders appear as a collapsed "Tune your recommendations" entry point. Tapping it opens a **modal or tray UI** (not an inline expansion of the row) — this gives the sliders space to breathe visually without pushing content rows down the screen
- When a user adjusts sliders in either location, the state is shared: slider changes made on For You persist in Profile and vice versa
- When sliders change, rows on For You re-rank and refresh
- **Why Option C:** Profile gives sliders a canonical "settings" home for users who treat them as configuration. For You gives them contextual access for users who want to adjust in the moment. The modal/tray treatment on For You ensures sliders feel like a control surface, not a content row — they're a tool you invoke, not content you consume.
- **Why modal/tray, not inline expansion:** inline expansion would push content rows down the screen every time the sliders are opened, which feels janky and steals real estate. A modal or bottom-sheet tray gives sliders their own space, makes it clear they're a tool, and dismisses cleanly back to the content view.

**Note on the fourth slider name:** in v0.2 this was called "Depth vs breadth" with poles "Finish what I start ↔ Try lots of things." In v0.3 it is renamed to **"Focused ↔ Varied"** with poles "Go deeper ↔ See more variety." The rename reflects what the mechanism actually does: it modulates row composition between "more similar-content rows, tighter clusters" and "more variety, broader clusters." The earlier "Finish what I start" framing implied Videx tracked episode-level progress — it does not, and cannot without explicit progress tracking infrastructure which is not in v2 scope. The new framing is honest about the mechanism.

**1. Recommended For You (10–30 titles, horizontal scroll)**
- The core personalised row: top candidates from the ranking pipeline
- Ordered by: full v2 ranking score (50% taste + 20% recency × Catalogue-age slider + 10% contextual + 10% diversity + 10% cross-service spread)
- **Selection logic:** Stage 1 retrieval returns top 500 candidates; Stage 2 ranks them; top ~30 are shown. All sliders affect this row.
- **Why row 1:** this is the headline feature of For You. If a user only looks at one row, this is the one that must be good.

**2. Mood Rooms for Tonight (3–5 rooms, horizontal scroll of room cards)**
- A selection of mood rooms that refreshes **weekly**, with shuffled order within the week so it feels fresh across sessions
- Each room card shows: room name, short description, 3–4 preview thumbnails from room content
- Tapping a room card opens the full room view (a dedicated sub-page or modal showing all titles in the room)
- **Selection logic:** pick 3–5 mood rooms from the full set based on (time-of-day fit × taste fit × room variety). The full set refreshes weekly on a predictable schedule (e.g., every Monday), with different rooms featured each week to let users discover the full catalogue of rooms over time. Within the week, the order shuffles between sessions so the same user sees a slightly different arrangement each time they open For You.
- **Why weekly, not daily:** this matches Spotify's Discover Weekly cadence. Weekly refresh is predictable, anticipated, and creates a "something new to explore" moment. Daily churn feels unpredictable and forces users to re-learn what's available each day. Shuffled ordering within the week maintains session-to-session freshness without the disorienting effect of daily room turnover.
- **Mood room selection examples (week of 15 April):**
  - Sunday afternoon set: "Comfort-watch British sitcoms," "Slow-burn character dramas," "Family-friendly adventures"
  - Friday night set: "Cerebral sci-fi," "Neo-noir crime," "Cult comedies"
  - Tuesday evening default: "Critically acclaimed recent TV," "Underrated prestige drama," "Hidden gems in your genres"
- **Why row 2:** mood rooms are the Pillar 1 USP. They need prime positioning on For You.
- **Cross-reference:** mood room clustering is generated by a monthly HDBSCAN job running as Python via GitHub Actions cron. See Recommendation Engine Strategy v1.6 Section 5.2 for the full execution model (psycopg2 direct connection, OpenAI-based two-pass labelling, stability-preserving re-clustering). The row on For You consumes from the `mood_rooms` and `mood_room_titles` tables; it does not run any clustering itself.

**3. Hidden Gems (10–30 titles, horizontal scroll)**
- Low-popularity, high-taste-fit titles from user's services
- **Selection logic:** filter for titles with popularity below a threshold (e.g., bottom 50% by popularity) AND taste fit above a threshold. Within that pool, rank by taste fit.
- **Why this row:** surfaces the long tail. Hidden gems is a concept users already understand and one of the few rows where "not popular" is a feature, not a bug. Validates the catalogue-depth thesis on a personalised surface.

**4. Because You Watched [Title] (10–20 titles, one row per qualifying title, up to 2 rows)**
- Titles similar to something the user has added to their watchlist AND rated thumbs-up
- **Selection logic:** identify titles that satisfy BOTH conditions: (a) on the user's watchlist, AND (b) marked thumbs-up. This double-condition prevents noise from watchlist-only signals (users can watchlist many titles casually) and ensures only genuinely loved content anchors these rows. For each qualifying title, compute nearest neighbours in embedding space (filtered to user's services, excluding already-watched and already-watchlisted).
- **When they appear:** only when at least one title satisfies the double condition. Show up to 2 rows (two most recent qualifying titles). If the user has zero qualifying titles, these rows don't appear.
- **Why the double condition:** watchlist alone is too low-signal (users add things casually). Thumbs-up alone can happen without intent to watch. The combination of "I put this on my list AND I loved it" is a much stronger signal that this represents the user's genuine taste.
- **Why this row:** explainable personalisation. Users understand "because you watched X" intuitively. It's one of the highest-trust row types on any streaming platform, and the strict signal qualification ensures the row quality is high.

**5. More From [Director/Creator] or [Actor] (10–15 titles, optional)**
- Filmography or featured-work row anchored on a specific person the user has shown interest in
- **Selection logic:** identify a director or actor who appears in 2+ of the user's thumbs-up or watched titles. Pull their other work from the catalogue, filtered to services.
- **When they appear:** only when there's a clear signal. Conservative — we don't want to show director rows for directors with only one signal.
- **Why this row:** rewards depth of interest. Users who love Paul Thomas Anderson want to see more PTA, and competitors don't do this well because they lack first-party cast/crew data (which Phase 0.5 fixes).

**6. Outside Your Usual (10–15 titles)**
- Exploration row — titles NOT closely matching the user's taste vector, but high-quality and potentially interesting
- **Selection logic:** invert the ranking signal. Find titles with high editorial/critical scores but LOW taste-vector similarity. Show a mix, weighted by the Comfort Zone slider.
- **When they appear:** always (exploration is a committed principle), but the row is larger when Comfort Zone slider is "Adventurous" and smaller when it's "Comfortable."
- **Why this row:** v2's committed exploration principle. Prevents filter bubbles. Also a source of genuine discovery moments.

**7. From Your Watchlist (dynamic row)**
- Titles the user has added to their watchlist but not yet watched
- **Selection logic:** pull the user's full watchlist, filter to unwatched titles, order by (recency of add × availability concerns — titles about to leave a service get boosted). Show top 10–15.
- **Note:** Videx v2 does not track explicit "continue watching" / watch progress on individual titles. This row is the closest equivalent — it surfaces watchlist additions the user hasn't yet marked as watched, giving a "pick up where you left your planning" moment rather than "pick up mid-episode."
- **Why this row:** users add titles to their watchlist and forget about them. Surfacing unwatched watchlist items closes the loop without requiring progress tracking infrastructure.

### 3.3 For You row ordering rules

1. **Sliders always at the top** (fully collapsible)
2. **Highest-confidence personalised row first** ("Recommended For You")
3. **Mood rooms second** (high-value USP expression)
4. **Deeper-cut personalised rows next** (Hidden Gems, Because You Watched)
5. **Person-specific rows when available** (director/actor)
6. **Exploration row** (committed principle, but not top because it's deliberately lower confidence)
7. **Utility row at the bottom** (From Your Watchlist)

**Maximum row count: 7–8**, with the same principle as Home — beyond 7-8 rows, lower rows become zombie content.

### 3.4 For You behaviour during edge cases

**Cold-start user (post-onboarding, no behavioural data yet):**
- Recommended For You is populated from onboarding signals: watched-grid selections + genre preferences + service fingerprints + slider positions
- Mood rooms are populated (they exist globally, not per-user)
- Hidden Gems is populated (also global-category filtered by taste fit from cold-start signals)
- "Because You Watched X" rows don't appear (no titles yet satisfy both the watchlist AND thumbs-up condition)
- "More From [Director]" doesn't appear (no signal yet)
- Exploration row is present
- "From Your Watchlist" is empty; the row is hidden

The first For You load is thinner than a mature user's, but it's still populated. The cold-start experience is: "here's what we think you'll like based on what you told us, plus some mood rooms to explore."

**Mature user with strong signals:**
- All rows populated
- Because You Watched rows appear with high relevance
- More From [Director/Actor] rows appear if the signal is clear
- Mood rooms are rotated more aggressively based on session history

**User who hasn't opened the app in weeks:**
- Refresh behaviour: re-compute recommendations on open
- Recently released titles in their taste get boosted to catch them up
- Mood rooms might feature a "New in [room name]" treatment

**User who has rejected a lot of recent recommendations:**
- Taste vector gets noisier
- Exploration row grows larger as a diversifier
- Slider defaults may be worth nudging (e.g., suggest "Try opening up your comfort zone")

### 3.5 Mood Rooms for Tonight — rotation cadence

The "Mood Rooms for Tonight" row on For You rotates on a **weekly refresh model**, not daily. This is informed by how Spotify's Discover Weekly works: a predictable weekly cadence that users come to anticipate, rather than a daily churn that feels unpredictable.

**How the weekly refresh works:**

1. Every Monday (or a chosen day of the week), the row refreshes with a new rotation of 3–5 mood rooms.
2. The refresh is **additive and corrective**, not a full wipe. The selection algorithm:
   - Keeps rooms from last week that are still relevant (no change in content, taste vector hasn't drifted meaningfully)
   - Swaps out any rooms whose content has meaningfully changed (new titles added or removed due to service licensing shifts)
   - Introduces 1–2 new rooms the user hasn't seen recently to aid discovery
3. **No assumption of completion.** The algorithm does not assume the user has watched the content from last week's rooms. Users watch at their own pace — a few films or episodes per week is typical — so refreshing content the user hasn't had time to explore would feel churny and disrespectful of their actual viewing habits.
4. **Mid-week updates are minimal.** If a title leaves a service mid-week, it's removed from the relevant room quietly. If a major new release lands on a user's service mid-week that fits an active room, it can be added. But the overall rotation doesn't change until the next Monday.

**Why weekly, not daily:**

- Users form a weekly rhythm with content (weekend viewing, weeknight episodes, etc.)
- Daily rotation feels unpredictable and punishes users who return to a room they enjoyed
- A predictable weekly cadence creates anticipation, similar to Discover Weekly or New Music Friday
- Reduces algorithmic churn that could feel noisy or arbitrary
- Gives users time to actually watch content from a room before it changes

**Why not monthly or longer:**

- Users would feel the surface was stale
- Weekly captures the natural rhythm of new releases and service catalogue changes without being either hyperactive or inert

**Time-of-day variation:**

Within a given week's rotation, the specific rooms *displayed in what order* can still vary slightly by time of day and day of week. A user returning on Friday night sees the same weekly pool, but ordered to show more "Friday night" rooms near the top. Sunday afternoon shows the same pool, re-ordered for "Sunday afternoon." This gives the surface time-of-day sensitivity without the churn of full content rotation.

**Monthly re-clustering coordination:** the weekly row refresh is independent from the monthly HDBSCAN re-clustering. The monthly job generates new cluster membership; the weekly row picks from whatever cluster set is current. If the monthly re-clustering runs on the 1st and the weekly rotation happens on Mondays, the Monday closest to the 1st gets the new cluster set; other Mondays see the same clusters with different featured selections.

### 3.6 Dedicated mood rooms browse surface — deferred to v2.5

The "Mood Rooms for Tonight" row on For You shows a rotating selection of 3–5 rooms per week.

If we build a dedicated mood rooms browse surface (where users can see all 30–60 rooms as a grid), that surface would be a separate destination — accessed from within the For You row via "See all rooms" or from main navigation. That's a browse experience, not a feed.

For v2 MVP, we ship without the dedicated full-mood-rooms surface. Only the "Mood Rooms for Tonight" row on For You exists. The full browse surface is a **v2.5 addition** once we see how users engage with the weekly-rotated row.

This keeps v2 scope manageable and lets us learn whether users want to explore the full room catalogue or are satisfied with the curated weekly selection.

---

## 4. Interaction Between Home and For You

### 4.1 How users move between them

- **Bottom navigation:** both Home and For You are primary tabs. Users tap to switch.
- **No cross-linking from within rows:** a title card on Home doesn't invite the user to "see more on For You." Rows are self-contained.
- **Detail page behaviour is the same on both surfaces:** tapping a card on either surface opens the same detail page.

**Impression tracking at tab change:** when a user switches from Home to For You (or vice versa), the impression batcher flushes any pending impressions from the previous surface before the new surface loads. This keeps impressions attributed to the correct surface and prevents buffer drift. See Detail Page Signal Capture Spec v0.3 Section 5.2 for the full impression batching approach.

### 4.2 How the same title appears on both surfaces

A title can appear on both Home (as trending or recently added) and For You (as a recommendation or mood room member). That's fine — the two surfaces are not mutually exclusive. If a new Denis Villeneuve film lands on Netflix, it will:
- Appear on Home as "Recently Added" and possibly "Trending"
- Appear on For You in "Recommended For You" (high taste fit) and possibly "Because You Watched" (if the user has loved Villeneuve's other work)
- Possibly be featured as a Hero on Home if it's a major release

The two surfaces show the title in different contexts, not different titles.

---

## 5. First-Session and Caching Behaviour

### 5.1 First session after onboarding

User lands on **For You** immediately after completing onboarding.

For You is populated with:
- Recommended For You (from cold-start signals)
- Mood rooms for tonight (context-aware)
- Hidden Gems (from cold-start signals)
- Exploration row
- Watchlist (empty — hide or show placeholder)

Home is populated normally (it doesn't depend on behavioural data).

### 5.2 Row freshness and caching

**Home caching:** the rendered row content (titles, ordering, per-row selection) is cached per user for 30-60 minutes. The underlying TMDb/OMDB/SA API data is not re-fetched on every surface load — the cache serves subsequent loads within the TTL. Cache invalidation triggers: service changes (user adds/removes a service), midnight UTC rollover (to catch new releases), user-triggered pull-to-refresh.

**For You caching:** rendered rows cached for 10-20 minutes. Shorter TTL because taste-sensitive. Cache invalidation triggers: any explicit taste signal (thumbs up/down, watchlist add/remove, mark watched, not interested), slider change, service change, hourly refresh.

**Mood rooms:** cluster membership changes at most monthly (per the re-clustering cadence), so cluster membership can be cached for days. Only the "rooms shown on For You tonight" selection rotates per session (within the weekly window).

**Cache storage location:** cached row content lives in Supabase for cross-device consistency, with a client-side memory cache layered on top for hot reads within a single session. The server-side cache is keyed by (user_id, surface, slider_state_hash) so that slider changes invalidate the correct cache entries without affecting other users.

### 5.3 Pull-to-refresh behaviour

Both surfaces support pull-to-refresh. On Home, refresh re-pulls trending and new releases. On For You, refresh re-runs the ranking pipeline (useful after rating several titles).

---

## 6. What This Hypothesis Does NOT Cover

Things that are out of scope for this document and need separate treatment:

- **Detail page signal capture.** See Detail Page Signal Capture Spec v0.3.
- **Recommendation engine architecture (ranking pipeline, embedding generation, mood room clustering).** See Recommendation Engine Strategy v1.6.
- **Browse surface changes.** v2 may or may not change Browse. Not addressed here.
- **Watchlist surface changes.** Similarly out of scope.
- **Search.** v2 may introduce semantic search via embeddings — separate topic.
- **Profile/Settings.** Where sliders live outside of For You is covered in the profile restructure designs.
- **Onboarding flow details.** See Recommendation Engine Strategy v1.6 Section 4.5.
- **The dedicated mood rooms browse surface.** Deferred to v2.5 unless explicitly prioritised.
- **"Moods" / rooms naming.** Locked as "For You" for the surface name.
- **Conversational discovery.** Phase 7, post-v2.
- **v1/v2 migration model and archival approach.** See Project Orchestration v0.3.

---

## 7. Resolved Questions (from Joe's review of v0.1)

All seven open questions from v0.1 were resolved in v0.2 and remain committed in v0.3:

**Q1. Does v2 track "continue watching" / watch progress?**
→ **No.** v2 does not track explicit watch progress. The equivalent need is met by "From Your Watchlist" row on For You.

**Q2. Is editorial curation for Home a feature we can support?**
→ **No, not at launch.** Replaced with "Critically Acclaimed New Releases" — algorithmic. **Gated on OMDB backfill completion (new in v0.3).**

**Q3. How aggressive is the mood room rotation on "Mood Rooms for Tonight"?**
→ **Weekly refresh with shuffled ordering within the week.**

**Q4. What's the minimum interaction count before "Because You Watched X" rows appear?**
→ **Titles must satisfy BOTH conditions: on the watchlist AND thumbs-up rated.** Up to 2 rows shown.

**Q5. Should the sliders panel on For You be fully collapsible?**
→ **Collapsed by default, Option C dual-access.**

**Q6. What happens if a user has very few services?**
→ **Edge case, not solved for at v2 launch.**

**Q7. Service-fingerprint-driven taste softening on Home — how strong?**
→ **Start at 20% weight on ordering.** Tunable post-launch.

---

## 8. Previously-Surfaced Open Questions (from v0.2)

**Q8. How are "critically acclaimed" thresholds set for the Critically Acclaimed New Releases row?**
Still open. Rotten Tomatoes ≥80%, IMDb ≥7.5, and vote_count above a minimum are reasonable starting points. Validate once OMDB backfill is complete and the row ships.

**Q9. Does the Featured Hero carousel auto-rotate or only manual-swipe?**
Still open. v0.2 proposed auto-rotation every 5–7 seconds with manual swipe override. Worth user-testing once the design lands.

**Q10. Do we need a "Genre Spotlight" row at all, or does "Critically Acclaimed New Releases" cover it?**
Still open. Some overlap between the two. Worth reviewing after a few weeks of Phase 4 data.

---

## 9. Summary: What This Hypothesis Commits To (v0.3)

1. **Two distinct surfaces.** Home (discovery) and For You (personalised). Both primary tabs in bottom nav.
2. **Home is service-filtered, lightly taste-ordered (15–20% weight on rows, 30–40% on Featured Hero), recency-dominant.** Familiar structure, zeitgeist-focused.
3. **For You is service-filtered, heavily personalised, taste-dominant, slider-tunable.** Mood rooms are the primary USP expression. Full recommendation engine.
4. **Users land on For You after onboarding**, then use last-viewed tab on subsequent sessions.
5. **Mood rooms appear on For You as a weekly-refreshed "Mood Rooms for Tonight" row.** Weekly refresh with shuffled ordering within the week. Full mood room browse surface deferred to v2.5. Clustering runs via Python + GitHub Actions monthly cron (see Recommendation Engine Strategy v1.6 Section 5.2).
6. **Sliders use Option C dual-access.** Canonical state in Profile, contextual access on For You via a collapsed "Tune your recommendations" affordance that opens as a modal or tray. Shared state between locations.
7. **Home rows:** Featured Hero Carousel → Recently Added to Your Services → Trending Across Your Services → Coming Soon → Per-service charts (top 3) → Critically Acclaimed New Releases → Genre Spotlight.
8. **For You rows:** Sliders entry point → Recommended For You → Mood Rooms for Tonight → Hidden Gems → Because You Watched [X] → More From [Director/Actor] → Outside Your Usual → From Your Watchlist.
9. **"Because You Watched" requires BOTH watchlist AND thumbs-up** — prevents noise, ensures quality. Max 2 rows, triggered by ≥1 qualifying signal in the last 30 days, expires at 60 days.
10. **Weekly mood room refresh with shuffled session ordering** — predictable cadence, fresh-feeling sessions.
11. **No continue-watching tracking** — the "From Your Watchlist" row is the equivalent need, without requiring progress tracking infrastructure.
12. **No special handling for single-service users** — edge case in the UK, not a target audience for v2.
13. **Maximum 7–9 rows per surface** to prevent zombie content at the bottom of infinite scrolls.
14. **Instrumentation tags every impression with its source surface** for later tuning. Impression flushing at tab change prevents buffer drift.
15. **Fourth For You slider renamed from "Depth vs breadth" to "Focused ↔ Varied"** (new in v0.3) — the mechanism modulates row composition, not episode-level progress, which Videx doesn't track.
16. **Critically Acclaimed New Releases row gated on OMDB backfill completion** (new in v0.3) — does not ship until OMDB data coverage reaches at least 80% of relevant recent releases.

---

*End of hypothesis v0.3. Two minor content updates (slider rename, OMDB sequencing) incorporated. All other sections unchanged from v0.2. Ready for CC review as part of the v2 document set.*
