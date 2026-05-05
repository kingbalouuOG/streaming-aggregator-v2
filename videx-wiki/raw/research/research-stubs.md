---
title: Research Inputs (Stubs)
generated: 2026-04-26
status: stubs — fill from existing research artefacts
---

# Research Inputs (Stubs)

The v2 strategy doc lists the following inputs. Each is a stub here. If you have the source material elsewhere (Notion, email, doc), drop it into the appropriate `raw/research/` file.

## 1. Streaming Recommendation Algorithms Report (April 2026)

**Referenced as:** Strategy v1.6.3 frontmatter "Inputs".

**Likely covers:** survey of public industry knowledge about Netflix, Prime, Disney+, BBC iPlayer's recommendation systems. Cosine similarity, two-tower architectures, contextual bandits, mood/context layers.

**Why useful in wiki:** grounds the engine choices in industry context. Lets the LLM answer "why did we choose X" with reference to comparable patterns.

**Suggested file:** `raw/research/streaming-recommendation-algorithms-report.md`.

---

## 2. Consolidated Research Brief

**Referenced as:** Strategy v1.6.3 frontmatter "Inputs".

**Likely covers:** synthesis of competitor scans, user research, UK market data, technical proofs of concept. The "where v2 came from" document.

**Suggested file:** `raw/research/consolidated-research-brief.md`.

---

## 3. JustWatch Hands-On Testing

**Referenced as:** Strategy v1.6.3 frontmatter "Inputs".

**Likely covers:** structured testing of JustWatch UK app: surface composition, deep link behaviour, recommendation quality, gaps, monetisation cues.

**Why useful:** specific learnings about the closest direct competitor.

**Suggested file:** `raw/research/justwatch-hands-on-testing.md`.

---

## 4. Competitor Scan

**Referenced indirectly via positioning materials.**

**Likely covers:** JustWatch, Reelgood, Trakt, TV Guide UK, Plex Discover, possibly StreamHint, Likewise. Per-competitor: surface design, personalisation depth, UK coverage, deep linking behaviour, business model.

**Suggested file:** `raw/research/competitor-scan.md`.

---

## 5. CC Codebase Review Rounds 1-3

**Referenced as:** Strategy v1.6.3 frontmatter "Inputs". The source of many corrections in the strategy doc (column names, schema fixes, share-button removal).

**Likely covers:** structured walkthroughs of the v1 codebase by Claude Code, identifying gaps between strategy assumptions and actual implementation.

**Why useful:** captures the "what surprised us about our own code" findings that shaped Phase 0.

**Suggested file:** `raw/research/cc-codebase-review-rounds-1-3.md`.

---

## 6. UK Market Data

Currently stubbed at `raw/concepts/uk-streaming-market.md`. Sources to chase: Ofcom Media Nations report, BARB SVOD data, Enders Analysis briefings, Antenna State of Subscriptions.

---

## How to ingest these

When the source documents land:

1. Drop the file into `raw/research/{kebab-case-name}.md` (or PDF, the LLM can read both).
2. Ask the LLM to ingest per the AGENTS.md workflow.
3. The ingest creates a `wiki/sources/` summary page and updates relevant `wiki/concepts/` pages.
