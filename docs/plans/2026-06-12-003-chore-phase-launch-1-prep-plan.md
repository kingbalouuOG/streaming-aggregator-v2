# LAUNCH-1 Implementation Plan — Pre-launch blockers

**Status:** DRAFT for Joe's review.
**Branch:** `phase-launch-1-prep`.
**Scope:** the four standing blockers — IN-XPS-014 (solicitor review), IN-PX-60 (rate limiting), signed release APK, prototype-user re-onboarding. Heterogeneous by nature: two are code (CC), two are process (CC prepares, Joe executes).

## W1 — IN-PX-60: rate limiting on `/v1/foryou` (code, CC)

- **Mechanism: Cloudflare's native Workers rate-limiting binding** (`unsafe.bindings` type `ratelimit` in wrangler.toml) keyed on the **verified userId** — applied AFTER JWT verification so attackers can't burn another user's budget, and unauthenticated requests are already 401-rejected before any cost.
- Limit: **30 requests / 60s per user** — generous (a real session makes 1-3 feed requests/min; KV hits don't stress Supabase but still count, keeping the maths simple), strict enough to kill the cost-amplification loop from the security review (full renders at sustained rate).
- 429 response with `retry-after`; the client's existing fallback chain treats 429 as a worker failure → client pipeline → no UX cliff during the D4 window, and after D4 the page shows its error state (acceptable: a 429 at 30/min means automation, not a person).
- Caveat to verify at implementation: the ratelimit binding's plan availability. If it's not available on the free plan, fallback design = fixed-window counter in the existing `FORYOU_CACHE` KV namespace (`rl:{userId}:{minuteBucket}`, TTL 120s) — weaker (KV is eventually consistent, ~60s window smear) but adequate against sustained abuse, zero new infrastructure.
- Tail-verified smoke: 31 rapid curls → 30 OK + 429.

## W2 — Signed release APK (code CC, keystore custody Joe)

1. CC generates the upload keystore via `keytool` (RSA 4096, 10k-day validity) directly into a NON-repo path (`%USERPROFILE%\videx-release.keystore`), with passwords Joe supplies at the prompt (not typed into the chat or stored in files CC writes).
2. `android/keystore.properties` (gitignored) carries path + alias + passwords; `build.gradle` release signingConfig reads it, **soft-skips to unsigned if the file is absent** so CI and other machines still build debug/unsigned without the secret.
3. Version bump: `versionCode 3`, `versionName "1.1.0"` (first post-E&P/UX release).
4. `minifyEnabled` stays **false** for this release (flipping R8 on is a real-device regression risk the day before handing builds to testers — parked as a follow-up with its own device pass).
5. Build `assembleRelease`, install on Joe's phone over the debug build (signature change forces an uninstall/reinstall — data survives via Supabase + onboarding, but localStorage caches reset; noted in the test script).
6. **Joe actions:** choose/enter the two passwords; back up the keystore + passwords somewhere durable (password manager + a second location). Losing it means losing the app identity — it cannot be regenerated.

## W3 — IN-XPS-014: solicitor review package (CC prepares, Joe engages)

CC produces `docs/legal/solicitor-review-pack.md` containing:
- The two documents (links + word counts) and what the app actually does with data (plain-English data inventory: what's collected, where it lives — Supabase EU/US region to confirm, third parties: TMDb/OMDB/Streaming Availability API/Cloudflare/OpenAI embeddings, what leaves the device).
- The specific questions a UK solicitor should answer: UK GDPR lawful basis adequacy, data-export/deletion flows (already implemented — migrations 042/043) vs Art. 15/17 wording, children/age wording (streaming content), liability caps in the ToS, the "no warranty on availability data" clause, and whether the current consent surface at signup suffices.
- Known gaps already flagged in the docs' footers.
- **Joe actions:** pick a solicitor (recommend a fixed-fee UK tech/startup firm — typical £400-900 for a two-doc review), send the pack, paste feedback back; CC applies the redlines to the markdown.

## W4 — Prototype-user re-onboarding (CC prepares, Joe executes)

Why required: ENG-1 changed profile mechanics (interest centroids, positive-only weights) and the bootstrap path is the only way to a clean multi-interest profile; existing prototype profiles ride a legacy single-vector anchor.
1. CC writes the runbook (`docs/v2/launch/prototype-reonboarding.md`): per user — confirm release APK installed → Profile → Settings → delete account (the migration-042 flow, full clean slate) → fresh signup → onboarding (services + taste quiz grid) → verify For You renders + interest centroids exist (SQL check per user, CC runs it via MCP read query).
2. Open question Q2: full account deletion vs a softer "reset taste profile" path. **Recommend full deletion** — it also exercises the legal deletion flow end-to-end before launch, doubling as the W3 evidence that Art. 17 works.
3. Distribution: the signed APK from W2 (direct file share is fine pre-Play-Store).
4. **Joe actions:** send the APK + a short instruction message (CC drafts it) to both testers; confirm completion; CC verifies profiles server-side.

## Sequencing

W1 (rate limit, ships behind CI) → W2 (signed APK) → W4 (re-onboarding needs W2's APK) — W3 runs in parallel from day one since the solicitor turnaround is the long pole. One PR for W1+W2 code; W3/W4 artifacts ride it.

## Open questions (recommendations inline)

- **Q1 — rate-limit numbers:** 30/min per user (recommended) vs stricter 10/min. 30 is invisible to humans, fatal to loops.
- **Q2 — re-onboarding mechanism:** full account deletion (recommended — exercises the legal flow) vs taste-profile reset.
- **Q3 — versionName:** `1.1.0` (recommended) vs `2.0.0` given the engine/platform overhaul.

## Explicitly out of scope

Play Store listing/submission, R8/minification, custom Worker domain, IN-PX-61 polish, the D4/IN-PX-59 deletion (clock starts at this release).
