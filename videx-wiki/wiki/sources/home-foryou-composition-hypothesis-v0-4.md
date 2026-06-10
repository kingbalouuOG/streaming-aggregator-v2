---
title: Source — Home and For You Composition Hypothesis v0.4
type: source
tags: [home, for-you, surfaces, composition, mood-rooms, anchored-rooms]
created: 2026-06-10
updated: 2026-06-10
supersedes:
  - wiki/sources/home-foryou-composition-hypothesis-v0-3.md
sources:
  - raw/v2-strategy/Videx_v2_Home_and_ForYou_Composition_Hypothesis_v0.4.md
related:
  - wiki/concepts/architecture/two-surface-architecture.md
  - wiki/concepts/architecture/home-surface.md
  - wiki/concepts/architecture/for-you-surface.md
  - wiki/concepts/architecture/mood-rooms.md
  - wiki/concepts/architecture/sliders.md
---

# Source: Home and For You Composition Hypothesis v0.4

The Phase 4.5 redirect bump of the two-surface composition doc. Supersedes [v0.3](home-foryou-composition-hypothesis-v0-3.md); all v0.3 content (row tables, locked rules, slider rename, OMDB gating) carries forward unchanged except §3.2 row 3 and §3.6.

## v0.4 changes (the anchored-rooms flip)

- **§3.2 row 3 "Mood Rooms for Tonight" rewritten** — flips from global cosine-ranked HDBSCAN rooms to **title-anchored generation**: five anchors per user per week from the tiered ladder (behavioural → cluster-rep → top-finalScore), rooms generated on demand around each anchor, named "If you love {anchor}" in v1 (LLM thematic labels since IN-463). Full anchor-selection logic in Strategy v1.7 §5.2.1.
- **§3.6 confirmed** — the deferred v2.5 dedicated browse surface still uses the **global** HDBSCAN rooms, not anchored variants. Deliberately different surfaces: For You = fast personalised tonight-fit (anchored); v2.5 browse = slower exploration of the full clustered catalogue (global).
- Underlying global-rooms infrastructure (HDBSCAN monthly cron, `mood_rooms`/`mood_room_titles`) unchanged — reserved for v2.5 browse + Phase 7 conversational discovery.

## Why it matters

Closes the documentation gap between the shipped anchored-rooms reality (April 2026) and the composition doc — the wiki's [mood-rooms](../concepts/architecture/mood-rooms.md) and [for-you-surface](../concepts/architecture/for-you-surface.md) pages already describe the anchored model; this snapshot makes the raw source agree.
