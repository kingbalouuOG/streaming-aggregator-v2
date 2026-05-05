---
title: Source — Research inputs
type: source
tags: [research, stubs, xlsx]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/research/research-stubs.md
  - raw/research/Top_40_Movies_and_TV_Shows_Research.xlsx
  - raw/research/quiz_pair_pool_review.xlsx
  - raw/research/Copy of quiz_pair_pool_review.xlsx
  - raw/research/videx-cluster-testing.xlsx
  - raw/research/videx_uk_providers.xlsx
related:
  - wiki/concepts/domain/uk-streaming-market.md
  - wiki/concepts/architecture/onboarding-flow.md
  - wiki/concepts/architecture/mood-rooms.md
---

# Source: Research inputs

Six files under `raw/research/`: one markdown stub list and five spreadsheets.

## research-stubs.md

Stub list of inputs cited in the v2 strategy doc but not yet copied into raw/. Names six expected files:

1. Streaming Recommendation Algorithms Report (April 2026).
2. Consolidated Research Brief.
3. JustWatch Hands-On Testing.
4. Competitor Scan.
5. CC Codebase Review Rounds 1-3.
6. UK Market Data (currently stubbed at [uk-streaming-market](../concepts/domain/uk-streaming-market.md)).

When the source documents land, drop into `raw/research/{kebab-case-name}.md` and re-ingest per AGENTS.md workflow.

## Spreadsheets (.xlsx)

> ⚠ unverified — these are binary XLSX files. The wiki has not parsed their contents. Filing as stubs.

| File | Likely purpose |
|---|---|
| `Top_40_Movies_and_TV_Shows_Research.xlsx` | Title pool seeding for onboarding watched-grid (Step 3, 6 titles × 3 rounds). |
| `quiz_pair_pool_review.xlsx` | Legacy v1 quiz pair pool (deleted in Phase 3). May still be referenced by historical docs. |
| `Copy of quiz_pair_pool_review.xlsx` | Duplicate copy. |
| `videx-cluster-testing.xlsx` | Mood room cluster testing (Phase 4.5 tuning). |
| `videx_uk_providers.xlsx` | UK provider IDs / mappings. Likely the source of the 10-service catalogue and `PROVIDER_ID_VARIANTS` table in `lib/constants/platforms.ts`. |

To make these properly ingestible, export to CSV/Markdown or include a per-file summary doc and re-snapshot. Filed as stubs to preserve the raw file mappings without blocking the wiki.

## Why it matters

Strategy and design references rely on these inputs. Without parsed contents, the wiki cannot fully cross-reference them. Treat as a placeholder set; refresh when content is available in markdown/CSV.
