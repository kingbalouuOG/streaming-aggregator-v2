---
title: Forward Planning (Index)
generated: 2026-04-26
---

# Forward Planning

Drop-zone for documents looking past the current v2 build: v3 thinking, monetisation strategies, scaling plans, business model exploration, and any other forward-thinking strategy material.

## Distinct from `raw/v2-strategy/`

| Folder | Time horizon | Mutability |
|---|---|---|
| `raw/v2-strategy/` | Current build. Locked decisions actively being implemented. | Snapshot of `docs/v2/` originals. |
| `raw/forward-planning/` | Post-v2 horizon. Hypotheses, options, exploratory plans. | Less stable; expect frequent additions and revisions. |

## Suggested file naming

- `v3-{topic}.md` for v3 product thinking.
- `monetisation-{angle}.md` for revenue model exploration.
- `scaling-{dimension}.md` for infrastructure or operational scaling.
- `roadmap-{date}.md` for time-stamped roadmap snapshots.

## Status conventions

Add a `status:` field in the frontmatter of each file so the LLM and any future reader can tell what's locked vs exploratory:

```yaml
---
title: V3 Subscription Pricing Hypothesis
status: exploratory   # exploratory | shortlisted | locked | shipped | parked
horizon: post-v2
---
```

This keeps speculative material clearly tagged so it does not contaminate the wiki's authoritative pages with unverified claims.
