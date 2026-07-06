# H0 work-stream briefs — "Prove it & equip it" (Jul–Sep 2026)

Execution briefs for H0 of the approved [Product Strategy & Roadmap v1.0](../Videx_Product_Strategy_and_Roadmap_v1.0.md). Each brief is self-contained — start a fresh session with "Read `docs/strategy/briefs/<file>` and execute it".

| Stream | Brief | Roadmap items | Depends on | Session type |
|---|---|---|---|---|
| **A** — Measurement & integrity fixes | [h0-stream-a-measurement-fixes.md](h0-stream-a-measurement-fixes.md) | 0.2, 0.3, 0.4, 0.5, 0.7 (dashboards), 0.8 | — (start now) | Code |
| **B** — Notifications v1 + Share v1 | [h0-stream-b-notifications-share.md](h0-stream-b-notifications-share.md) | 0.9, 0.10 | Phase 1 (spike) has none; run in week 1 — its data-model note feeds Stream C | Code (largest) |
| **C** — Legal & compliance pack | [h0-stream-c-legal-pack.md](h0-stream-c-legal-pack.md) | 0.1 | Stream B Phase 1 output | Doc-assembly + Joe-led engagement |
| **D** — Security & ops batch | [h0-stream-d-security-ops.md](h0-stream-d-security-ops.md) | 0.11 + Play-access check from 0.12 | — (start now) | Code/ops |
| **E** — Shakeout & quiet release | *(no brief yet — process checklist in roadmap §6 items 0.6 + 0.12)* | 0.6, 0.12 | A + B merged, C cleared, D's Play-access answer | Joe-led process |

**Suggested order:** week 1 = A + B-Phase-1 + D in parallel, book the solicitor (C) immediately; B-Phase-2 (delivery) weeks 2–6; C pack finalised as soon as B-Phase-1 lands; E when A+B are merged and legal is cleared.

**Parallel-session note:** A and B both touch `native/` + `src/lib` but in mostly disjoint areas. Run them on separate branches/worktrees; merge A before B's final merge to keep rebases trivial. D is fully independent.

**Conventions for all streams:** branch + PR per stream (house style); `native/` build notes in `videx-wiki/wiki/concepts/architecture/platform-architecture.md`; consult `videx-wiki/` before starting (read `videx-wiki/AGENTS.md` first); British English in user-facing copy; wiki ingest of any notable outcome rides the same PR.
