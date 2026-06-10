---
title: Source — Project Orchestration v0.8
type: source
tags: [orchestration, version-control, migrations, e-p-track, eng-1]
created: 2026-06-10
updated: 2026-06-10
supersedes:
  - wiki/sources/project-orchestration-v0-5.md
sources:
  - raw/v2-strategy/Videx_v2_Project_Orchestration_v0.8.md
related:
  - wiki/sources/ep-hardening-brief-v0-2.md
  - wiki/sources/phase-eng-1-summary.md
  - wiki/entities/codebase/migrations.md
  - wiki/concepts/decisions/adr-011-edge-function-shared-modules.md
  - wiki/concepts/decisions/adr-012-server-side-foryou-render.md
  - wiki/registers/cheatsheet.md
---

# Source: Project Orchestration v0.8

E&P Hardening track kickoff bump (ENG-1, 2026-06-10). §3.4 (migration table) and §11 (confirmed decisions) are the live sections; §§1–10, 12 retain Phase-0-era text as historical record. Supersedes [v0.5](project-orchestration-v0-5.md) (the wiki chain skips v0.6/v0.7 — never snapshotted to raw/; their deltas are summarised in the v0.8 changelog).

## v0.8 changes (load-bearing)

- **§11: E&P Hardening track lock** — ENG-1 → REPO-1 → PLAT-1 → PLAT-2 → PLAT-3 → (Phase 6 launch, parallel) → ENG-2 (data-gated), all before v3/Phase 7, with the six D1–D6 decisions confirmed by Joe 2026-06-10. See the [E&P brief source page](ep-hardening-brief-v0-2.md).
- **§11: ADR-011 / ADR-012 supersession path** — the `_shared/` mirror and Edge-render-with-client-fallback remain binding through ENG-1/REPO-1/PLAT-1/PLAT-2; a new ADR at PLAT-3 cutover supersedes both (single server-side engine; mirror + `shared-tree-drift` + parity apparatus + `warmup-foryou` + 1.5s fallback all deleted; client pipeline survives one release per D4).
- **§3.4: ENG-1 rows added** — 044 `user_interest_centroids` + 045 training-extract view (split for independent revertability; brief anticipated one).
- **§3.4: 040 row corrected** — the number was consumed by `040_editor_notes.sql` (Phase 6 PR-AD, in repo, NOT applied — `public.editor_notes` verified absent 2026-06-10). The IN-458 typed-pairs work takes the next free number when it lands.

## Carried-forward intermediate-version deltas (v0.6/v0.7, per the v0.8 changelog)

- v0.6: migration 041 (`user_feature_flags`) applied; Phase Search V2 architecture + per-user feature-flag pattern locks; Phase Search V2 actuals note.
- v0.7 (referenced as "process ground truth" by the E&P brief): Phase 5/5.5 close-out actuals — migrations 036–039, 042–043, the wiki-knowledge-base cross-phase note.

## §3.4 status at v0.8 publication

044/045 applied (Joe via Studio); 040 in repo not applied; 046 written awaiting apply (since applied — see the regenerated [database-schema snapshot](../entities/codebase/database-schema.md)). The migration ledger has gaps; **orchestration §3.4 is the authoritative applied-status table, never `supabase db push`**.
