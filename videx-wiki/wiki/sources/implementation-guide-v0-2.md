---
title: Source — Implementation Guide v0.2
type: source
tags: [implementation, workflow, cc, claude-code]
created: 2026-04-26
updated: 2026-04-26
sources:
  - raw/v2-strategy/Videx_v2_Implementation_Guide_v0.2.md
related:
  - wiki/concepts/operations/cc-workflow.md
  - wiki/sources/project-orchestration-v0-3-3.md
---

# Source: Implementation Guide v0.2

Operational runbook for the Videx v2 build with Claude Code as primary implementer. Audience: Joe.

## v0.2 additions

- §4 Step 0 fresh-strategist-session workflow.
- §4 Step 1 reframed; the prompt template is illustrative, not the brief itself.
- §4 Step 6 expanded: end-of-phase summary from CC is mandatory closing task with full template.
- §4.7 status summary template for opening fresh strategist sessions.
- §5.3 cross-references the new workflow.

## Headline content

- §2 Pre-Phase 0 checklist split into repo+infra, services+accounts, Joe's personal habits.
- §4 The phase loop: spec → branch → CC implementation (plan-review-code-review gate) → local test → migration apply → merge → tracking.
- §4.6 End-of-phase summary template (deliverables, deviations, follow-ups, evidence).
- §5 What Joe does himself vs what CC does.
- §7 Stuck states (CC loop, scope creep, schema doubt).
- §8 Phase-specific gotchas (Phase 0 partition RLS, Phase 0.5 row-count gates, Phase 1 wire format spike, Phase 4.5 GitHub Actions secrets).
- §10 Quick reference card.

## Why it matters

Process glue between strategy intent and CC execution. The end-of-phase summary template is what produces the `phase-summaries/` set.
