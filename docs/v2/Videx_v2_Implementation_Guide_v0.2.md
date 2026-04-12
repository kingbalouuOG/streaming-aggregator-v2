# Videx v2 — Implementation Guide

**Status:** v0.2 — Fresh-strategist-session workflow, end-of-phase summary requirement, and status summary templates added
**Version:** 0.2
**Date:** April 2026
**Audience:** Joe (primary), with prompts and templates that CC will see when referenced

**Changes from v0.1:**
- New Section 4 Step 0 codifying the fresh-strategist-session workflow for phase kick-offs
- Section 4 Step 1 reframed — the template is illustrative, the actual prompt comes from the strategist
- Section 4 Step 6 expanded — end-of-phase summary from CC is now a mandatory closing task with full template
- New Section 4.7 with the status summary template for opening fresh strategist sessions
- Section 5.3 cross-references the new workflow
- Section 10 Quick Reference updated with new entries

---

## 1. Purpose and how to use this document

This is the operational runbook for the Videx v2 build. The five strategy documents and the design reference tell CC *what* to build and *what it looks like*. This document tells you *how to actually run the build* with CC as your primary implementer.

Read it once end-to-end before Phase 0 starts. After that, treat it as a reference: open it when you're starting a phase (Section 4 templates), when you're stuck (Section 7), when you need the phase-specific gotchas (Section 8), or when you're closing out a phase (Section 4 step 6).

The implementation guide is alive — update it during the build as you learn what works. If a section's advice doesn't match reality after your first phase, edit the section to match reality. The guide is for you, not for posterity.

**Where this document lives:** `docs/v2/Videx_v2_Implementation_Guide.md` in the v1 repo, alongside the five strategy documents and the design reference.

---

## 2. Pre-Phase 0 checklist

These are the tasks that must be complete before you brief CC for any Phase 0 work. Tick each item as you complete it. When all items are green, you're cleared for Phase 0 kick-off.

The checklist is split into three groups: **repo and infrastructure** (the build environment), **services and accounts** (the third-party setup), and **Joe's personal habits** (optional but recommended local safety).

### 2.1 Repo and infrastructure

#### ☐ Task 1 — Confirm v1 main is in a known-good state

**What to do:** open the current v1 app, run it locally, and confirm the main user flows work end-to-end. Onboarding, content browsing, watchlist add/remove, detail page navigation, recommendation generation. Note any outstanding bugs or known issues so you have a baseline.

**Why it matters:** the `v1-archive` Git tag preserves whatever state main is in at the moment you tag it. If main is broken, the tag preserves a broken archive. Tag from a known-good commit, not a half-finished one.

**Verification:** the app launches and basic flows work without errors. You can list any existing known issues from memory or your Notion tracker.

#### ☐ Task 2 — Tag `v1-archive` on current main and push

**What to do:** from the v1 repo, run:

```bash
git checkout main
git pull origin main
git tag -a v1-archive -m "v1 archive — final state before v2 rebuild begins"
git push origin v1-archive
```

This creates an annotated tag at the current main HEAD and pushes it to your origin remote. Annotated tags include the message and your name; lightweight tags don't, so use `-a`.

**Why it matters:** this is the recoverable archive of the entire v1 codebase. If anything in the v2 build goes catastrophically wrong, you can `git checkout v1-archive` and have the v1 codebase back in seconds. Project Orchestration v0.3.1 Section 11 locks this as the archival model for v1.

**Verification:** `git tag -l "v1-archive"` returns `v1-archive` locally. On the GitHub repo page, the tag appears under Releases or Tags with your annotation message.

#### ☐ Task 3 — Set up a mirror remote for backup

**What to do:** add a second Git remote pointing at a backup host (GitLab is recommended, BitBucket also works). Push main and the v1-archive tag to the mirror.

```bash
# Example with GitLab as the backup
git remote add backup git@gitlab.com:joe/videx-backup.git
git push backup main
git push backup v1-archive
```

You'll need to create the empty backup repo on the backup host first.

**Why it matters:** a single Git remote (even GitHub) is a single point of failure. Two remotes means a catastrophic loss on one host doesn't lose the work. Strategy doesn't require it but the cost is low and the protection is real.

**Verification:** `git remote -v` shows two remotes (origin and backup). The backup repo's web interface shows the latest commit and the v1-archive tag.

#### ☐ Task 4 — Add the v2 documentation to the repo

**What to do:** create a `docs/v2/` subfolder in the v1 repo and add the six strategy documents plus the design reference and the 24 design reference images.

```bash
mkdir -p docs/v2/design-references
# Copy the six strategy docs into docs/v2/
# Copy the 24 PNG files into docs/v2/design-references/
git add docs/v2
git commit -m "Add v2 strategy documents and design references"
git push origin main
git push backup main
```

The folder structure should look like:

```
docs/
  v2/
    Videx_v2_Project_Orchestration_v0.3.1.md
    Videx_Recommendation_Engine_v2_Strategy_v1.6.2.md
    Videx_v2_Detail_Page_Signal_Capture_Spec_v0.3.2.md
    Videx_v2_Home_and_ForYou_Composition_Hypothesis_v0.3.md
    Videx_v2_Implementation_Notes_Parking_Lot_v0.3.2.md
    Videx_v2_Design_Reference_v0.1.md
    Videx_v2_Implementation_Guide.md           ← this document
    design-references/
      Home.png
      For_You.png
      Menu_BottomNav.png
      ... (22 more PNGs)
```

**Why it matters:** CC running in VS Code can read these files directly from the repo without you re-pasting them every session. The strategy docs and design references become part of the build artefacts, version-controlled and backed up alongside the code. This is the foundational habit that makes every subsequent CC session efficient.

**Verification:** `ls docs/v2/` shows the seven markdown files. `ls docs/v2/design-references/` shows 24 PNG files. The commit is pushed to both remotes.

#### ☐ Task 5 — Set up GitHub Actions CI

**What to do:** ask CC to inspect the repo and tell you whether any CI is currently configured. If none exists, ask CC to create two GitHub Actions workflow files:

1. `.github/workflows/typecheck-lint.yml` — runs `tsc --noEmit` and your linter on every push and pull request
2. `.github/workflows/build-verify.yml` — runs `npm run build` (or `pnpm build`, whatever your build command is) on every push and pull request

These are guard rails. They catch broken builds and type errors before they land on main.

**Why it matters:** during a multi-phase build, CC will occasionally introduce a type error or import a function that doesn't exist. CI catches these immediately rather than letting them sit until you notice. Project Orchestration v0.3.1 Section 4 locks CI as a Phase 0 prerequisite.

**Verification:** push a small commit (e.g. a comment change in a TypeScript file) and watch the GitHub Actions tab. Both workflows should run and pass.

#### ☐ Task 6 — Verify Supabase Pro backups are active

**What to do:** after upgrading to Supabase Pro (Task 8 below), open the Supabase dashboard, navigate to Database → Backups, and confirm that automatic daily backups are enabled. Pro tier includes 7 days of point-in-time recovery as standard.

**Why it matters:** the Phase 0 migrations modify the user_interactions table and add card_impressions with partitioning. Migrations can go wrong. Daily backups + 7-day PITR means you can roll back to yesterday's state if a migration corrupts data.

**Verification:** the Backups tab shows recent successful backups. PITR is enabled and shows a recoverable time range.

### 2.2 Services and accounts

#### ☐ Task 7 — Apply migration 011 (profiles baseline)

**What to do:** the `profiles` table exists in production but has no version-controlled migration. Migration 011 codifies the existing schema so it's reproducible in fresh environments. The full SQL is in Implementation Notes Parking Lot v0.3.2 entry IN-PRE-001.

Create the migration file at `supabase/migrations/011_profiles_baseline.sql` with the SQL from IN-PRE-001. Apply it via the Supabase CLI or dashboard. Because the migration is idempotent (uses `CREATE TABLE IF NOT EXISTS` and `DROP POLICY IF EXISTS` + `CREATE POLICY`), applying it against the live production state changes nothing — it just brings the schema under version control.

**Why it matters:** every subsequent migration in the v2 build (012 through 021) assumes profiles is part of the migration history. Without migration 011, the migration sequence breaks if you ever need to rebuild from scratch.

**Verification:** the migration file exists in `supabase/migrations/`. After applying, `\d+ profiles` in psql shows the same schema as before (no changes). New signups still create profile rows automatically via the trigger. Commit the migration file to the repo.

#### ☐ Task 8 — Upgrade Supabase from Free to Pro tier

**What to do:** in the Supabase dashboard, upgrade your project from Free to Pro. Pro tier costs around £20/month. Budget is £180 for 6-9 months of v2 build.

**Why it matters:** Phase 1 needs pgvector with HNSW indexing for content embeddings (1536-dim × 20K titles). The Free tier's 500MB database limit can't accommodate this. Pro tier raises the limit to 8GB with no extension restrictions. Project Orchestration v0.3.1 Section 11 locks this decision.

**Verification:** dashboard shows project on Pro tier. Billing is configured. New tier-specific features (pg_partman, pgvector at scale, point-in-time recovery) are now available.

#### ☐ Task 9 — Generate or rotate the OpenAI API key

**What to do:** you'll need an OpenAI API key for two things during the build: generating embeddings via `text-embedding-3-small` (Phase 1) and labelling mood room clusters (Phase 4.5). Either generate a new key or confirm you have an existing one with sufficient credit.

Estimate: one-time embedding backfill of 20K titles costs around £0.20. Ongoing embedding costs around £0.50/month. Mood room labelling costs a few pence per re-clustering run. Total OpenAI spend across the build: under £10.

Store the key in a local `.env` file (gitignored) and add it as a GitHub Actions secret if you want CI to be able to use it.

**Why it matters:** Phase 1 cannot start without this key. Better to confirm it's working before you reach Phase 1.

**Verification:** test the key with a small curl request to OpenAI's API and confirm you get a response. Confirm the key has credit available.

### 2.3 Joe's personal habits (optional but recommended)

#### ☐ Task 10 — Save a local snapshot of the v1 codebase

**What to do:** copy the entire v1 project folder to a snapshot location on your machine, separate from your active working directory. Name it something obvious like `videx-v1-snapshot-2026-04-08/`.

This is **not** a separate repo, **not** a fork, **not** a branch. It's a dumb file-system copy that you set aside and don't touch.

**Why it matters:** the `v1-archive` Git tag is the canonical recovery mechanism. The local snapshot is your psychological safety net — knowing there's an untouched copy of the working v1 app on your hard drive that you can run independently if you ever need to verify behaviour or compare against.

**Verification:** you can navigate to the snapshot folder, run `npm install` and `npm run dev` (or whatever the v1 command is), and the v1 app launches successfully from the snapshot. After confirming it works, leave it alone.

#### ☐ Task 11 — Update the Notion tracker

**What to do:** open the Videx project in Notion and add a new section or page for the v2 build. Mark Phase 0 as "Ready to start" once all checklist items above are complete. Optionally, create cards for each phase so you can track progress as you go.

**Why it matters:** keeping the build progress visible to yourself helps you remember where you are between sessions. Notion has been your source of truth for v1 work; staying consistent for v2 helps.

**Verification:** Notion shows the v2 build with Phase 0 ready to start.

### 2.4 Green light criteria

When all 11 tasks above are ticked, you are cleared for Phase 0 kick-off. Don't start briefing CC for Phase 0 until every item is done. Skipping a checklist item to "save time" creates a problem you'll discover later when something doesn't work.

If you're unsure whether a task is "done enough," err on the side of finishing it properly. The checklist exists because each item has a real failure mode if skipped.

---

## 3. Repo setup for v2 work

The v2 build happens on the existing repo, on main, with the `v1-archive` tag preserving the pre-build state. There is no parallel branch, no v2 folder, no separate codebase. CC works directly on main.

### 3.1 Folder structure inside the repo

The relevant folders for the v2 build are:

```
videx/                          ← repo root
├── docs/
│   ├── v2/                     ← all v2 strategy docs and references
│   │   ├── Videx_v2_Project_Orchestration_v0.3.1.md
│   │   ├── Videx_Recommendation_Engine_v2_Strategy_v1.6.2.md
│   │   ├── Videx_v2_Detail_Page_Signal_Capture_Spec_v0.3.2.md
│   │   ├── Videx_v2_Home_and_ForYou_Composition_Hypothesis_v0.3.md
│   │   ├── Videx_v2_Implementation_Notes_Parking_Lot_v0.3.2.md
│   │   ├── Videx_v2_Design_Reference_v0.1.md
│   │   ├── Videx_v2_Implementation_Guide.md
│   │   └── design-references/
│   │       ├── Home.png
│   │       ├── For_You.png
│   │       ├── Menu_BottomNav.png
│   │       └── ... (21 more PNGs)
│   └── ... (existing v1 docs untouched)
├── src/                        ← v1 codebase, modified during v2 build
├── supabase/
│   └── migrations/
│       ├── 010_user_interactions.sql       ← existing
│       ├── 011_profiles_baseline.sql       ← added in pre-Phase 0
│       ├── 012_profiles_v2_onboarding.sql  ← added in Phase 0
│       └── ... (013 through 021 added across phases)
├── .github/
│   └── workflows/
│       ├── typecheck-lint.yml              ← added in pre-Phase 0
│       └── build-verify.yml                ← added in pre-Phase 0
└── ... (rest of existing repo)
```

### 3.2 Branching and commit conventions during the build

Work happens on `main`. No feature branches per phase, no v2 branch. Each phase produces a series of commits on main with conventional messages.

**Commit message convention:** prefix each commit with the phase identifier so the history is scannable. Examples:

```
[Phase 0] Add migration 013 expanding user_interactions schema
[Phase 0] Implement lifecycle manager (appState.ts)
[Phase 0] Rewrite getDismissedIds to query Supabase (IN-008)
[Phase 0.5] Backfill keywords and credits for existing titles
[Phase 1] Add embedding column and HNSW index
[Phase 3] Rewrite useHomeContent for v2 ranking pipeline
```

This makes `git log --oneline` produce a phase-by-phase view of the build.

**Tag at the end of each phase:** after a phase is verified complete, create an annotated tag.

```bash
git tag -a v2-phase-0-complete -m "Phase 0 instrumentation complete"
git push origin v2-phase-0-complete
git push backup v2-phase-0-complete
```

Phase tags give you per-phase recovery points. If Phase 4 introduces a regression that traces back to Phase 3, you can `git diff v2-phase-3-complete v2-phase-4-complete` to see exactly what changed.

### 3.3 What CC has access to during the build

When you open VS Code with this repo, CC has access to:

- The entire current codebase (the v1 code that's being modified)
- The six strategy documents in `docs/v2/`
- The design reference index and 24 PNG files in `docs/v2/design-references/`
- This implementation guide
- The Git history (via shell commands when needed)
- The Supabase CLI (if installed locally)

CC does **not** automatically read the strategy docs at the start of every session. You need to point it at them in each session's first message. Section 4 explains how.

---

## 4. The phase work loop

This is the pattern you repeat for every phase. It has six steps. Each step has a specific goal, an estimated duration, and (for steps 1, 2, 4, and 6) a copy-paste-ready prompt template.

The pattern is the same as your existing CC workflow: brief CC with a markdown document describing what you want, ask CC to produce a plan, review and iterate on the plan, let CC execute, review the output. The templates below adapt this to the specifics of the v2 build.

### Step 0 — Request the kick-off prompt from the strategist

**Goal:** get a phase-specific kick-off prompt from the strategist before briefing CC, so that CC receives a prompt tailored to this specific phase's risks, dependencies, and gotchas rather than a generic template.

**Duration:** 15-30 minutes. Open a fresh strategist session, share the current state, receive the kick-off prompt in return.

**Why this step exists:** a one-size-fits-all template for CC kick-offs misses phase-specific nuances. Phase 0 needs to emphasise the `getDismissedIds()` critical fix. Phase 1 needs to front-load the wire format spike. Phase 3 needs to warn CC about the 9-file scope. Phase 4.5 needs the HDBSCAN fallback plan embedded. A template cannot know these things. A strategist with fresh context can produce a prompt that bakes them in.

**What you do:**

1. Open a fresh strategist session (not a continuation of a previous strategist conversation)
2. Share the seven v2 documents with the strategist (or point at the repo path if the strategist has filesystem access)
3. Share the current codebase state — either by pointing at the repo or by providing the status summary described in Section 4.7
4. State explicitly which phase you're preparing for and confirm that the prerequisite checklist (pre-Phase 0 for Phase 0, or the previous phase's close-out for later phases) is complete
5. Request the kick-off prompt

The strategist will review the docs, produce a Phase N kick-off prompt tailored to this specific phase, and deliver it back to you as a copy-paste-ready message to give to CC.

**Opening message template for the fresh strategist session:** see Section 4.7 for the full status summary template. At minimum, the opening message should tell the strategist:

- Which phase you're preparing for
- That the prerequisite checklist or previous phase is complete
- The current commit hash
- Any decisions or doc updates that happened since the last strategist session
- Any specific concerns or questions you want the strategist to address in the prompt

**What you get back:** a full kick-off prompt for CC, tailored to the specific phase, that references the right strategy doc sections, highlights the phase-specific risks, includes any parking lot entries relevant to the phase, and explicitly tells CC that producing an end-of-phase summary (Section 4 Step 6) is a mandatory closing task.

You take that prompt and paste it into a fresh CC session as the first message (Step 1).

### Step 1 — Phase kick-off (brief CC with the strategist's prompt)

**Goal:** give CC the strategist's phase-specific kick-off prompt (produced in Step 0), then let CC read the docs and produce its implementation plan.

**Duration:** 5 minutes to paste the prompt, then CC takes 15-30 minutes to read the docs and produce the plan.

**What you do:** open a fresh CC session in VS Code (don't continue an old session — fresh sessions read the relevant docs cleanly without baggage). Paste the strategist's kick-off prompt as the first message.

**Important:** do not use the template below verbatim. It is included as an illustration of what a kick-off prompt looks like, but the actual prompt you give to CC comes from the strategist in Step 0 and is tailored to the specific phase. The strategist's prompt will be more specific about sections to read, risks to watch for, and the mandatory end-of-phase summary format.

If you find yourself about to paste the template below into a CC session, stop and go back to Step 0 — request the phase-specific prompt from the strategist instead.

#### Illustrative template — what a Phase kick-off prompt looks like

```
We're starting Phase [N] of the Videx v2 build. Before you write any code, I need you to read the relevant strategy documents and produce a phase implementation plan that I'll review.

Documents to read in this order:
1. docs/v2/Videx_v2_Project_Orchestration_v0.3.1.md — Section 3.4 (migration table), Section [X] (Phase [N] description)
2. docs/v2/Videx_Recommendation_Engine_v2_Strategy_v1.6.2.md — Section 7.2 (Phase [N] paragraph), plus any sections that Phase [N] specifically depends on
3. docs/v2/Videx_v2_Detail_Page_Signal_Capture_Spec_v0.3.2.md — only if Phase [N] involves detail page signals
4. docs/v2/Videx_v2_Home_and_ForYou_Composition_Hypothesis_v0.3.md — only if Phase [N] involves Home or For You surfaces
5. docs/v2/Videx_v2_Implementation_Notes_Parking_Lot_v0.3.2.md — search for entries tagged to Phase [N] (entries are organised by phase)
6. docs/v2/Videx_v2_Design_Reference_v0.1.md — only if Phase [N] involves UI work that has design references

Also read the current state of the codebase. You have full repo access. Look at the files that Phase [N] will touch, understand the existing patterns, identify dependencies.

Once you've read the above, produce a Phase [N] implementation plan as a markdown document. The plan should include:

1. **Scope statement** — what this phase delivers in one paragraph
2. **Files to be created** — new files with their paths and purpose
3. **Files to be modified** — existing files with what changes and why
4. **Files to be deleted** — anything being removed
5. **Migrations** — any new SQL migrations with migration numbers
6. **Task breakdown** — the work split into 30-90 minute tasks I can review individually
7. **Dependencies** — anything that must happen before this phase, anything blocking later phases
8. **Verification checks** — how we confirm the phase is complete and correct
9. **Open questions or risks** — anything you noticed in the docs or codebase that needs my input before you start

Do not write any code yet. Produce the plan, share it with me, wait for my review and approval. I will iterate with you on the plan before giving the green light to execute.

If you find contradictions between the strategy docs and the current codebase, flag them rather than guessing. If you find ambiguity in the strategy docs, flag it rather than picking a direction.
```

**Why this template works:** it tells CC exactly which docs to read (so it doesn't miss any), points it at the codebase (so the plan is grounded in reality), and explicitly forbids code-writing at this stage. The list of plan sections forces CC to think through the whole phase before suggesting any work.

### Step 2 — Plan review and iteration

**Goal:** review CC's plan, push back where needed, lock the plan before any code is written.

**Duration:** 30 minutes to several hours depending on phase complexity. Phase 0 might take 30 minutes; Phase 3 might take a couple of hours of back-and-forth.

**What you do:** read CC's plan carefully. Look for:

- **Missing scope** — anything the strategy docs say should happen in this phase that the plan doesn't cover
- **Out-of-scope additions** — anything the plan includes that belongs in a later phase or isn't needed at all
- **Wrong file references** — CC sometimes hallucinates file paths or function names; verify the files actually exist
- **Hand-waving** — sections of the plan that say "we'll figure this out during implementation" should be made concrete now
- **Contradictions with the strategy docs** — if CC's plan disagrees with what the strategy says, the strategy wins (and CC should explain why it diverged)
- **Missing verification steps** — every task should have a way to confirm it's done correctly

When you find issues, push back. Don't accept the first plan if it's not right.

#### Template — Plan review prompt

```
Reviewing your Phase [N] plan. Here's my feedback:

**Approved as-is:**
[list of plan items you accept without changes]

**Needs change:**
[For each item that needs revision, give specific feedback. Examples:]
- Task 3 (Implement lifecycle manager): the plan says to subscribe to App.addListener directly, but Detail Page Signal Capture Spec v0.3.2 Section 5.1 specifies that lifecycle subscriptions go through a centralised module to avoid race conditions. Please rewrite this task.
- Files to be modified: you missed src/lib/storage/recommendations.ts. The getDismissedIds rewrite in IN-008 lives there.
- Verification checks: the plan doesn't have a check that the new card_impressions table is actually receiving inserts after the impression batcher is wired up. Add a verification step that opens the Supabase dashboard and confirms rows are appearing.

**Open questions for me to answer:**
[Things CC flagged that you can now answer]
- Q1: Yes, use content_id (not tmdb_id) — this is locked in the v0.3.2 corrections.
- Q2: The dwell_seconds field goes in the metadata JSONB, not as a top-level column. See Detail Page Spec Section 5.1.

Please revise the plan based on the feedback above and share the updated version. We'll iterate again if needed.
```

**Iterate as many times as it takes to get the plan right.** It is much cheaper to fix a plan than to fix code that was built from a bad plan. There's no prize for going to implementation quickly with a wrong plan.

When the plan is fully locked, give CC the green light explicitly:

```
Plan is approved. You can begin implementation. Work through the tasks in order. Pause and check in with me after each task is complete so I can review before you move to the next one.

Commit each task as a separate commit using the convention: [Phase N] <task description>. Push to main after I've reviewed each commit.
```

### Step 3 — Lock the plan and start execution

**Goal:** give CC the green light to start writing code, having locked the plan in the previous step.

**Duration:** zero — this is a transition point, not a step that takes time.

**What you do:** the green-light message above ends Step 2 and starts Step 3. From this point CC writes code, you review.

### Step 4 — Review CC's output (task by task)

**Goal:** review each commit before letting CC move to the next task.

**Duration:** 10-30 minutes per task. For a phase with 8 tasks, that's 1-4 hours of review time spread across the phase.

**What you do:** when CC completes a task and commits, you review the diff before approving the next task. Look for the things in Section 6 below (common CC failure modes).

The simplest review process is:

1. Open the commit in VS Code's Git view or in the GitHub PR view
2. Read the diff line by line for the files you understand well
3. For files you don't understand well, read CC's commit message and the test output it produced
4. Run the app locally if the change is user-facing
5. Approve and tell CC to move to the next task, or push back if something's wrong

#### Template — Task review prompt (when approving)

```
Reviewed task [N]. Looks good. Proceed to task [N+1].
```

#### Template — Task review prompt (when pushing back)

```
Reviewed task [N]. Issues found:

1. [specific issue with file path and line number]
2. [specific issue]

Please fix these before moving to task [N+1]. Don't proceed with new work until these are resolved.

Note: don't rewrite the whole task. Make targeted fixes for the issues above and re-commit as a fix-up commit.
```

### Step 5 — Verification at end of phase

**Goal:** confirm the phase actually delivers what the plan said it would.

**Duration:** 30 minutes to a couple of hours depending on the phase.

**What you do:** run through the verification checks from the plan (which CC produced in Step 1). For each check, either run it yourself or ask CC to run it and report the result.

Common verification activities:

- Run the app locally and confirm v1 features still work (regression check)
- Run any new automated tests CC added
- Inspect the database to confirm new tables exist with the right schema
- Inspect the database to confirm new rows are being created when expected
- Run TypeScript compilation and linting via the CI workflows
- Check the GitHub Actions tab to confirm the latest commit's CI runs all passed

If any verification fails, treat it as a Step 4 push-back: tell CC the verification failed, ask for a fix, re-verify.

### Step 6 — Phase close-out

**Goal:** mark the phase as complete, capture everything the next strategist session needs to know, and prepare for the next phase.

**Duration:** 30-45 minutes (most of which is CC producing the end-of-phase summary; your hands-on time is around 15 minutes).

**This step has six parts, in order:**

1. CC produces the end-of-phase summary (mandatory — the phase is not complete until this is done)
2. You review and save the summary
3. You tag the commit that completes the phase and push to both remotes
4. You apply any documentation updates identified in the summary
5. You update the Notion tracker
6. You take a buffer before the next phase

Do not skip or abbreviate the end-of-phase summary. It is the primary artifact that the next strategist session uses to produce the next phase's kick-off prompt. Without it, the next phase starts from stale context.

#### Part 1 — Request the end-of-phase summary from CC

After the final task of the phase is reviewed and approved, before moving on, instruct CC to produce the end-of-phase summary. CC was told at the start of the phase (in the strategist's kick-off prompt) that this was a mandatory closing task, so it should not come as a surprise.

**Prompt to give CC:**

```
All tasks for Phase [N] are complete and reviewed. Before we close out the phase, produce the end-of-phase summary as specified in the Implementation Guide Section 4 Step 6 Part 1. Use the exact template below. Be specific and concrete — vague summaries make the next phase harder.

## Phase [N] End-of-Phase Summary

### Phase identifier and completion date
- Phase: [N — name]
- Completed: [date]
- Final commit hash: [run `git rev-parse HEAD` and include the output]

### What was delivered
A concrete list of the outputs of this phase. Include:
- New files created (with paths)
- Existing files modified (with paths and what changed)
- Migrations applied (with migration numbers and what they did)
- Tests added or modified (with paths)
- Dependencies added to package.json (with name and version)
- Environment variables introduced (names only, not values)
- GitHub Actions workflows added or changed

Be exhaustive. If you touched it, list it.

### Deviations from the phase plan
For each place where the actual implementation differed from the Phase [N] plan that was approved in Step 2:
- What the plan said
- What was actually done
- Why the deviation was necessary
- Whether this deviation should be reflected in any strategy doc updates (see Documentation updates needed below)

If there were no deviations, write "No deviations — the plan was implemented as specified."

### Decisions made during execution
For each decision you had to make that was not explicit in the plan:
- The decision point (what needed to be decided)
- The options considered
- The decision taken
- The rationale
- Whether this decision should be reflected in any strategy doc updates

If no implementation decisions came up, write "No additional decisions — the plan was sufficiently specific."

### Documentation updates needed
For each strategy doc that should be updated to reflect reality after this phase:
- Document name and version
- Section or entry that needs updating
- The specific change needed (old text → new text)
- Why the update is necessary

If no doc updates are needed, write "No documentation updates needed — the docs accurately reflect the delivered state."

These updates are the most important part of this summary for the next strategist session. Be precise.

### Open items carried forward
Anything that was in the phase plan but was not completed, was deferred, or was left incomplete:
- The item
- The reason it was not completed
- Where it is being deferred to (next phase, parking lot, explicitly abandoned)
- Whether this affects any other phase's scope

If everything in the plan was completed, write "No open items — the phase plan was fully executed."

### Verification results
For each verification check defined in the phase plan:
- The check
- How it was performed
- The result (pass / fail / partial / not applicable)
- Evidence (a command output, a screenshot description, a database query result, etc.)

If any verification check could not be performed, state why and propose how it should be verified before the next phase starts.

### Current state summary
One paragraph describing where the codebase is right now, what works, and what the next phase needs to know about the current state. Written as if briefing someone who last saw the project before this phase started.

### Observations for the next phase
Anything you noticed during this phase that the next phase's strategist should know about. Examples:
- "While implementing X, I noticed that file Y has pattern Z that will matter for Phase [N+1] when it refactors Y"
- "The test coverage for module W is weaker than I'd like — consider adding tests during Phase [N+1] when W is touched again"
- "I noticed the codebase uses [convention] in some places and [other convention] in others — the next phase should decide which to standardise on"

These observations help the strategist produce a more informed kick-off prompt for the next phase.

Do not write code or make changes while producing this summary. This is a report, not a task.
```

#### Part 2 — Review and save the summary

CC produces the summary. You review it for completeness and accuracy. If anything is missing or unclear, push back and ask CC to revise the summary. Common push-back reasons:

- Vague "what was delivered" lists ("I improved several files")
- Missing deviations (you noticed drift during review that CC didn't capture)
- Missing doc updates (you know a strategy doc section is now stale)
- Incomplete verification results

Once the summary is accurate, save it in two places:

1. Commit it to the repo as `docs/v2/phase-summaries/phase-[N]-summary.md`. This creates a permanent record of each phase's outcomes.
2. Keep a local copy ready to paste into the next strategist session.

Commit the summary with a message like `[Phase N] Add end-of-phase summary`.

#### Part 3 — Tag the commit and push

After the summary is committed, tag the phase completion:

```bash
git tag -a v2-phase-[N]-complete -m "Phase [N] [name] complete"
git push origin v2-phase-[N]-complete
git push backup v2-phase-[N]-complete
```

Phase tags give you per-phase recovery points. If Phase 4 introduces a regression that traces back to Phase 3, you can `git diff v2-phase-3-complete v2-phase-4-complete` to see exactly what changed.

#### Part 4 — Apply any documentation updates identified in the summary

If the summary's "Documentation updates needed" section has entries, apply those updates to the relevant strategy docs now — before starting the next phase's strategist session. The rule from Section 5.3 applies: between phases, make sure the docs reflect reality.

For small updates, edit the docs directly and commit. For large updates (multiple sections affected, or a locked decision changing), treat it as a strategy-level change and bring it back to a fresh strategist session for a proper corrections pass (similar in pattern to the v0.3.1 and v0.3.2 correction rounds that happened during the strategy phase).

Commit the doc updates with a message like `[Strategy] Update [doc] Section [X] to reflect [decision from Phase N]`.

#### Part 5 — Update Notion tracker

Mark Phase [N] as Done and Phase [N+1] as Ready to Start in Notion. Add any observations from the summary that will be useful for tracking project-level progress.

#### Part 6 — Take a buffer before starting the next phase

Don't just immediately roll into Phase [N+1]. Give yourself at least a few hours, ideally a day. Phase transitions are a good point to rest, reset, and come back fresh for the next Step 0 request to the strategist.

### 4.7 Status summary template for opening a fresh strategist session

When you open a fresh strategist session to request the next phase's kick-off prompt (Step 0), paste a status summary as the opening message. This gives the strategist the context needed to produce an accurate kick-off prompt without having to ask orientation questions.

The status summary is built from three sources:

1. **Standard context** — which phase, which docs, current commit hash
2. **The previous phase's end-of-phase summary** — what was delivered, what changed, what open items carry forward
3. **Your own observations** — anything you want to flag that isn't in the phase summary

#### Template — Status summary for fresh strategist session

```
I'm opening a fresh strategist session to prepare for Phase [N] of the Videx v2 build.

## Current state

**Phase I'm preparing for:** [N — name]
**Previous phase completed:** [N-1 — name] on [date]
**Current commit hash:** [sha]
**Repo state:** [clean / uncommitted changes exist / anything unusual]

## Documents available

All seven v2 documents are in the repo at `docs/v2/`:
- Videx_v2_Project_Orchestration_v0.3.1.md [or later version if updated]
- Videx_Recommendation_Engine_v2_Strategy_v1.6.2.md [or later]
- Videx_v2_Detail_Page_Signal_Capture_Spec_v0.3.2.md [or later]
- Videx_v2_Home_and_ForYou_Composition_Hypothesis_v0.3.md [or later]
- Videx_v2_Implementation_Notes_Parking_Lot_v0.3.2.md [or later]
- Videx_v2_Design_Reference_v0.1.md [or later]
- Videx_v2_Implementation_Guide.md [current version]

Design reference images are in `docs/v2/design-references/`.

[If any documents have been updated since strategy lock, note which and why:]
**Document updates since strategy lock:**
- [doc] updated to [version] — [reason]

## Previous phase summary

[Paste the relevant portions of the previous phase's end-of-phase summary here. At minimum include:]

**What was delivered in Phase [N-1]:**
[from the phase summary]

**Decisions made during Phase [N-1]:**
[from the phase summary]

**Documentation updates made after Phase [N-1]:**
[list of strategy doc updates that were applied, if any]

**Open items carried forward to Phase [N]:**
[from the phase summary]

**Observations for Phase [N]:**
[from the phase summary]

## Checklist status

Pre-Phase 0 checklist: [complete / not applicable for this phase]
Previous phase close-out: [complete / not applicable]
Documentation updates: [applied / none needed]
Repo in known-good state: [yes / any issues to note]

## What I'm asking for

Please review the strategy docs, the Implementation Guide Section 8.[N] for phase-specific gotchas, the parking lot entries tagged to Phase [N], and the design references if relevant. Then produce a Phase [N] kick-off prompt that I can paste into a fresh CC session.

The kick-off prompt should:
- Tell CC which specific doc sections to read (not just "read the strategy docs")
- Emphasise the Phase [N] critical risks and gotchas from Section 8 of the Implementation Guide
- Include any parking lot entries CC needs to incorporate into the plan
- Explicitly mention that producing an end-of-phase summary (format in Section 4 Step 6) is a mandatory closing task
- Forbid code-writing until after I've reviewed and approved the plan

I'll take the prompt you produce and paste it into a fresh CC session as the first message.

## Specific concerns for this phase

[Optional — anything you want the strategist to specifically address in the prompt. Examples:]
- I'm worried about X because Y
- Please make sure the prompt covers [specific risk]
- I want to defer [specific scope item] to the next phase — can you include that in the brief?

[If no specific concerns, write "No specific concerns. Produce the prompt based on the strategy docs and previous phase summary."]
```

This template looks long but most of it is copy-paste from the previous phase's end-of-phase summary. Your actual writing time is 5-10 minutes per phase transition.

---

## 5. Working with the strategy docs and design references during the build

The six v2 documents in `docs/v2/` are the source of truth. The implementation guide does not replace them — it tells you how to use them with CC.

### 5.1 Pointing CC at specific sections rather than re-pasting

Don't paste large chunks of the strategy docs into CC sessions. CC can read the files directly from the repo. Instead, point CC at specific sections:

**Don't do this:**

> "Here's the section of the Strategy doc about mood rooms: [paste 800 lines]"

**Do this:**

> "Read Recommendation Engine Strategy v1.6.2 Section 5.2, the Mood Rooms subsection."

CC will open the file, navigate to the section, and read it. Faster, fewer tokens, no copy-paste errors.

### 5.2 Handling the parking lot

Implementation Notes Parking Lot v0.3.2 contains phase-tagged entries (e.g. IN-008, IN-301, IN-455). When briefing a phase, ask CC to scan the parking lot for entries tagged to that phase and incorporate them into the plan:

> "Read Implementation Notes Parking Lot v0.3.2 and find all entries tagged to Phase 0 (the entries are organised by phase). Incorporate each of those entries into your phase plan as named tasks."

After a phase completes, the parking lot entries that were addressed should be marked as ✅ in the parking lot file. CC can do this as part of the close-out commit, or you can do it manually.

### 5.3 Updating the strategy docs mid-build

Sometimes a decision changes during the build. CC discovers that the locked approach doesn't work, or a new constraint emerges that wasn't visible when the docs were written.

When this happens:

1. **Stop CC immediately.** Don't let it work around the issue or improvise.
2. **Open a discussion in this implementation guide or in a fresh strategist conversation.** Decide what the new approach should be.
3. **Update the relevant strategy doc** with a corrections-style entry (similar to v0.3.1 and v0.3.2). Bump the version number.
4. **Commit the doc update separately** from any code changes, with a message like `[Strategy] Update Section X.Y to reflect [decision]`.
5. **Re-brief CC** with the updated doc. The plan for the current phase may need revision.

This is rare but it will happen at least once during a build this size. Don't fight it — capture the decision in the docs so the source of truth stays accurate.

**Relationship to the end-of-phase summary (Section 4 Step 6):** CC's end-of-phase summary includes a "Documentation updates needed" section that identifies any strategy doc updates required as a result of phase execution. These updates should be applied during the phase close-out (Step 6 Part 4), before starting the next phase's strategist session. The end-of-phase summary workflow ensures that doc drift is caught at phase boundaries rather than accumulating silently across multiple phases. If you follow Step 6 properly, the mid-build update scenario described above becomes routine rather than exceptional.

### 5.4 Keeping the implementation guide updated

This document is alive. If a section's advice doesn't match reality after your first phase, update it. Common updates you might make:

- "The Phase 0 plan template needs an extra question about [X]" → update the template
- "I learned that CC tends to drift on long sessions, so I'm now starting fresh sessions every 2 hours" → add this to Section 6 or 7
- "The verification check I wrote for Phase 0 missed [Y], here's what I should have checked" → add to Section 8

Treat the guide as a build journal as well as a runbook.

---

## 6. Reviewing CC's work — common failure modes to watch for

CC is an excellent implementer but it has predictable failure modes on long projects. Knowing what to look for in diffs makes review much faster.

### 6.1 Drift from spec

CC sometimes implements something close to but not exactly what the strategy docs specify. The differences are usually small but they add up.

**What to look for:** read the relevant strategy doc section while reviewing the diff. Specifically check the field names, the function signatures, and the data flow. If the diff says `metadata.source` but the strategy says `source_surface` (top-level column), that's drift.

**Why it happens:** CC reads the strategy docs at the start of a phase and then works from memory for the next several hours. Memory drifts. Reality doesn't.

**Fix:** push back, point at the specific line in the strategy doc, ask for the correction.

### 6.2 Hallucinated functions, files, or imports

CC sometimes references a function or file that doesn't exist. The code looks plausible but won't compile.

**What to look for:** the CI typecheck workflow catches most of these (which is why Task 5 in pre-Phase 0 sets it up). Also watch for imports of files that don't exist in the repo, especially during refactors.

**Fix:** the CI failure makes this obvious. Push back with the CI error message and ask CC to either create the missing file or correct the reference.

### 6.3 Unrequested "improvements"

CC sometimes "improves" code that wasn't part of the task — refactors a file you didn't ask it to touch, renames a variable for clarity, changes a code style.

**What to look for:** the file list in the diff. If a commit touches files that aren't part of the current task's scope, that's an unrequested improvement.

**Fix:** push back. Ask CC to revert the unrelated changes and re-commit only the in-scope work. This is important: unrequested improvements are how technical debt gets introduced under the guise of cleanup, and they make commits harder to review.

### 6.4 Scope creep

CC sometimes does more than the task asked, completing two or three tasks in one commit because they "naturally fit together."

**What to look for:** the commit size. If a commit is much larger than the task description suggested, scope creep is likely.

**Fix:** ask CC to split the commit into separate commits per task. Tell it to wait for your review between tasks rather than batching them.

### 6.5 Missing verification

CC sometimes claims a task is complete without actually verifying it works.

**What to look for:** explicit evidence of verification in CC's commit message or in the response when CC says the task is done. "I added the migration" is not verification. "I added the migration, ran it against the local Supabase instance, confirmed the new column exists with `\d+ user_interactions`, and inserted a test row to confirm the column accepts data" is verification.

**Fix:** push back, ask CC to actually run the verification and report what it saw.

### 6.6 Forgetting the locked column names

Specifically for Videx: CC might use `interaction_type` and `tmdb_id` because they're more intuitive names, even though the docs lock `event_type` and `content_id`.

**What to look for:** grep the diff for `interaction_type` and `tmdb_id`. If either appears in code (not in `titles` table queries, where `tmdb_id` is correct), that's a regression.

**Fix:** point CC at the v0.3.2 corrections in the relevant strategy doc and ask for the correction.

---

## 7. Handling problems

### 7.1 When CC gets stuck

CC sometimes hits a dead end — it can't figure out how to implement something, or its attempts keep failing in different ways.

**What to do:** stop and diagnose. Don't let CC keep trying randomly. Ask CC explicitly: "What is the specific blocker? What have you tried? What do you think the next step should be?" The answer often reveals that CC misunderstands a constraint, or that a strategy doc section is ambiguous, or that the codebase has an undocumented quirk.

If the blocker is genuine (not a CC misunderstanding), bring it back to the strategist (me) for a spec clarification. Stop CC, get clarity, restart CC with the clarification.

### 7.2 When CC makes the wrong call

If you spot a wrong decision after several commits, you have two options:

**Option 1 — Forward fix.** Have CC write new commits that correct the wrong decision in place. Faster but produces messier history.

**Option 2 — Revert and retry.** `git revert <bad-commit-sha>` to undo the bad commits, then have CC re-do the work correctly. Cleaner history but slower.

**My recommendation:** forward fix for small mistakes (a wrong field name, a missing case), revert for large mistakes (an entire task implemented against the wrong spec).

### 7.3 When you change your mind mid-phase

Sometimes you'll realise mid-phase that a decision in the strategy docs was wrong and needs updating. This is allowed and expected.

Process:

1. Pause CC
2. Update the strategy doc (Section 5.3)
3. Re-brief CC with the updated doc
4. Continue the phase from where you paused

The longer you wait to capture the decision change in the doc, the more risk that the codebase and the doc drift apart.

### 7.4 When to start a fresh CC session vs continue

CC sessions accumulate context as they run. Eventually the context window fills up, CC slows down, or it loses track of earlier decisions.

**Start a fresh CC session when:**

- A phase is complete (each phase gets a fresh session by default)
- CC is visibly slower or repeating itself
- You've been in the same session for more than 2-3 hours
- CC is making mistakes that the v0.3.2 docs explicitly address (sign of context drift)
- You're moving from one phase to the next

**Continue an existing CC session when:**

- You're in the middle of a multi-task phase and CC has all the context loaded
- The session has been productive in the last hour
- You're doing a quick review or fix-up commit

A fresh session means re-briefing CC with the kick-off prompt. That's a few minutes of overhead, but it pays for itself in CC reliability.

### 7.5 When to escalate back to the strategist

Some things require strategy-level thinking, not implementation-level. Bring these back to me (the strategist):

- A locked decision in the strategy docs turns out to be wrong
- Two strategy docs contradict each other (this should be rare after the v0.3.2 corrections, but possible)
- A new constraint emerges that the strategy docs don't address
- You want to add scope to a phase (e.g. "while we're in Phase 0, can we also do X?") — this is almost always a bad idea but worth discussing
- You want to defer scope from a phase (e.g. "let's skip the impression batcher for now, do it later") — also usually a bad idea but sometimes warranted

Don't escalate implementation questions ("how do I make this TypeScript type work") — those are CC's job.

---

## 8. Phase-by-phase notes

Phase-specific gotchas to remember when briefing each phase. These supplement the strategy docs rather than replacing them.

### 8.1 Phase 0 — Instrumentation

**Critical fix that must not be forgotten:** the `getDismissedIds()` rewrite (IN-008). This is the single most important commit in the phase. Without it, the v1 engine running through Phases 1-3 will start surfacing already-dismissed titles. Verify the rewrite is in place and the function returns Set entries in the correct format before moving on.

**Watch for:** the impression batcher flush triggers. There are six of them (timer, buffer size, lifecycle background, lifecycle foreground, tab change, detail page entry). Easy to forget one. The Detail Page Signal Capture Spec v0.3.2 Section 5.2 has the full list.

**Migration order matters:** 011 (profiles baseline) before 012 (profiles v2 onboarding fields) before 013 (user_interactions expansion) before 014 (card_impressions). Don't let CC apply them out of order.

**Verification specific to Phase 0:** after the impression batcher is wired, browse the Home or For You surface and then check the Supabase dashboard to confirm `card_impressions` rows are appearing. If no rows appear, the batcher isn't flushing.

### 8.2 Phase 0.5 — Content enrichment

**Watch for:** runtime backfill is in scope (added in v0.3 corrections, see IN-105). Don't let CC skip the runtime field thinking it's optional.

**OMDB sequencing:** the "Critically Acclaimed New Releases" row depends on OMDB having ≥80% coverage of the last 90 days of titles. Phase 0.5 should not start the row implementation until the OMDB backfill confirms coverage. Check this before Phase 4.

**Sync function split:** one-time backfill from Joe's laptop, ongoing enrichment via separate Edge Function. Don't let CC bundle them into one Edge Function — that hits the 150s timeout on busy days.

### 8.3 Phase 1 — Content embeddings

**Wire format spike de-risks Phase 3.** The spike from IN-203 validates whether the Supabase JS client returns pgvector columns as parsed arrays or as serialised strings. It runs after the bulk backfill (needs real embeddings in the column to validate against) but its output (the locked wire format pattern) is consumed by Phase 3's `useContentDetail.ts` rewrite. Phase 1 result: PostgREST returns strings, locked pattern is `JSON.parse(row.embedding)`. See `docs/v2/phase-1-wire-format-spike.md`.

**Embedding column name:** use `embedding`, not `content_vector`. The v1 column has a CHECK constraint on the old name that blocks reuse. See IN-204.

**Drop the legacy column at end of Phase 1, not Phase 3.** Migration 019. With the v1-archive model there's no parallel engine reading from `content_vector`, so it can be dropped as soon as embeddings ship.

### 8.4 Phase 2 — Service fingerprints

**Smaller phase**, mostly database work. Watch for the service fingerprint computation being correctly weighted (recency-decayed, see Strategy Section 5.2).

### 8.5 Phase 3 — User taste vector v2 and hook rewrites

**Biggest single phase.** Nine files need rewrites. Plan for this to take significantly longer than Phase 0. Don't try to rush it.

**The 9 files** (memorise this list, it's the most asked-about scope item):
1. `useHomeContent.ts`
2. `useContentDetail.ts` (depends on Phase 1 wire format spike)
3. `useSectionData.ts`
4. `useRecommendations.ts` (thin wrapper, trivial)
5. `useHiddenGems.ts` (thin wrapper, trivial)
6. `useUserPreferences.ts`
7. `OnboardingFlow.tsx`
8. `ProfilePage.tsx`
9. `LazyGenreSection.tsx`

**Migration 020 deletes the v1 taste system.** Quiz files, 24D vectors, scoreCandidate, recomputeVector, era hacks. Don't be sentimental about it — the v1 system is being replaced, not preserved.

**The two prototype users lose their v1 taste profiles** at this phase. They re-onboard on v2. This is acceptable and locked.

### 8.6 Phase 4 — Ranking pipeline and row generation

**scoreCandidate scale mismatch must not be reintroduced.** The v1 bug (cosine similarity on 0-100 scale added to weighted components) was the canonical example of what not to do. v2 enforces consistent scoring. CC should not write any code that mixes raw and normalised scores.

**Slider state shared between Profile and For You.** Both UI locations write to the same backend table. Don't let CC implement two separate state stores.

**Slider parameter mapping** is in Strategy Section 5.2. Each slider modifies a specific pipeline parameter, not the taste vector.

### 8.7 Phase 4.5 — Mood rooms

**HDBSCAN may need a fallback.** The first run might produce poor clusters (mega-clusters or mostly noise). IN-457 has the fallback plan: tune parameters, switch to k-means, or hybrid approach. Don't commit to mood rooms in production until you've inspected the cluster output.

**Python + GitHub Actions execution.** Not a Node script, not an Edge Function. The `scripts/mood_rooms/recluster.py` Python script runs via a monthly GitHub Actions cron with `psycopg2` direct PostgreSQL connection. See IN-455 and IN-456.

**Two-pass labelling:** OpenAI labels first, manual editorial review overrides second. The `is_curated` flag persists overrides across re-clusterings.

### 8.8 Phase 5 — Privacy hardening and pre-launch

**IN-XPS-002 must be addressed.** The `profiles` table policy "Allow public username lookup" currently exposes the entire table to public reads. Before any real users sign up, this must be tightened to a SECURITY DEFINER function or restricted view.

**Privacy disclosure copy** must accurately describe what's captured per the Detail Page Signal Spec. Generic privacy boilerplate is not acceptable.

**Pre-public-launch checklist:** several items have been flagged throughout the build for "address before any real users." Phase 5 is where they get addressed. Search the Parking Lot for entries tagged "pre-launch" or "IN-XPS-".

---

## 9. Closing out the build

### 9.1 When v2 is "done" for the prototype users

v2 reaches "done for prototype users" when:

- All phases (0 through 5) are complete and tagged
- The v1 taste system is fully removed (no dead code)
- The two prototype users have been re-onboarded on v2
- The recommendation engine is producing v2-ranked results
- All locked decisions in the strategy docs are reflected in the codebase
- All Parking Lot entries are marked ✅ (or explicitly deferred with a note)

At this point you have a working v2 app that you and the second prototype user can use day-to-day. This is the major milestone.

### 9.2 Pre-public-launch checklist (separate from "done for prototypes")

Before opening v2 to any real users beyond the two prototypes:

1. **IN-XPS-002 resolved** — profiles public read policy tightened
2. **Privacy policy updated** to match the actual signal capture behaviour
3. **GDPR data export and delete flows tested end-to-end**
4. **API key rotation** for OpenAI, Supabase, and any other services
5. **Security review** of RLS policies on all v2 tables
6. **Load testing** if you expect more than a handful of users (Supabase Pro can handle reasonable traffic but not unlimited)
7. **iOS App Store submission** (if going beyond Capacitor preview to native iOS)
8. **Trade mark filing** (£170/class via UK IPO, flagged in earlier strategy notes)
9. **Commercial data agreement** with TMDb or commitment to SA API as primary data source
10. **Terms of service and acceptable use policy** drafted

This list lives separately from the build because it's not part of the v2 implementation work — it's the bridge between "v2 build complete" and "v2 ready for public users."

### 9.3 Handover from build mode to maintenance mode

After v2 is locked and stable, the working pattern shifts. You're no longer running phases. CC's role shifts from "implementer of the build" to "implementer of small features and bug fixes."

The implementation guide is still useful in maintenance mode but the phase loop pattern doesn't apply. Instead:

- Bug fixes: brief CC with the bug, ask for a fix, review the diff, commit
- Small features: brief CC with a one-page spec, ask for a plan, review, execute
- Larger features: write a strategist-style spec (similar in shape to the v2 strategy docs but smaller), then run a mini phase loop

Treat the v2 strategy docs as the architecture documentation for the live app from this point forward. They are the reference for "why is the system the way it is" when future questions arise.

---

## 10. Quick reference — the most-used parts of this guide

For when you don't want to read the whole document:

- **Pre-Phase 0 checklist:** Section 2
- **Fresh strategist session per phase — request the kick-off prompt:** Section 4 Step 0
- **Status summary template for opening a fresh strategist session:** Section 4.7
- **Phase kick-off in CC (using the strategist's prompt):** Section 4 Step 1
- **Plan review prompt:** Section 4 Step 2
- **Task review prompts:** Section 4 Step 4
- **End-of-phase summary from CC (mandatory closing task):** Section 4 Step 6 Part 1
- **Phase close-out commands:** Section 4 Step 6 Part 3
- **Documentation updates from phase summary:** Section 4 Step 6 Part 4
- **What to look for when reviewing CC's work:** Section 6
- **Phase-specific gotchas:** Section 8
- **When to start a fresh CC session:** Section 7.4

---

*End of Implementation Guide v0.1. Update this document during the build as you learn what works.*
