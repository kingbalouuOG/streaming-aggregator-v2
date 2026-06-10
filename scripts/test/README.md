# scripts/test/ — parity probe + eval rigs

## For You parity probe — Phase 5.5 C9 / IN-PX-33

`foryou-parity-probe.mjs` (in this directory — moved from the scripts/
root, where it was `_inspect_foryou_parity.mjs`, in REPO-1) is the
per-PR CI gate that catches
divergence between the `render-foryou-rows` Edge Function and the
client-side fallback in `src/hooks/useForYouContent.ts`. Five checks:

  1. Determinism — two consecutive Edge calls produce identical rows.
  2. Filter-leak — no thumbs-down / dismissed / watchlist titles
     surface in `recommendedForYou` / `hiddenGems` / `outsideYourUsual`.
  3. Cross-row dedup — no title appears in more than one of those three.
  4. Anchor selection — tier breakdown and per-room thumbnail counts.
  5. **Property-level golden** (new in Phase 5.5) — diffs the current
     run against the committed `foryou-parity-golden.json` snapshot
     (row order + per-item `matchPercentage` + anchor tier + slider
     echo). Any property-level divergence is a hard fail.

### Required secrets

Configure in Settings → Secrets and variables → Actions:

| Secret                              | What                                                                    |
|-------------------------------------|-------------------------------------------------------------------------|
| `PARITY_TEST_EMAIL`                 | Test-user email — the probe signs in itself and mints a fresh token per run (REPO-1; Supabase access tokens live ~1h, which killed the stored-JWT model). |
| `PARITY_TEST_PASSWORD`              | Test-user password.                                                      |
| `PARITY_SUPABASE_ANON_KEY`          | Anon key for the sign-in call.                                           |
| `PARITY_USER_ID`                    | `auth.users.id` of the test user (flagged `profiles.is_test_user`); probe refuses to run if the signed-in user mismatches. |
| `PARITY_SERVICES`                   | Comma-separated service ids the test user has selected.                  |
| `PARITY_SUPABASE_URL`               | Project API URL (`https://fmusugdcnnwiuzkbjquo.supabase.co`).            |
| `PARITY_SUPABASE_SERVICE_ROLE_KEY`  | Service-role key — used by the probe for direct DB cross-checks.         |

(`PARITY_USER_JWT` is retired as a CI secret — a pre-minted `USER_JWT`
env var remains a fallback for one-off local runs only, and
`refresh-parity-jwt.ts` survives as a manual debug tool.)

With these set, the workflow hard-fails on divergence. Without any
secret set, the workflow soft-skips with a `::warning::` and exits 0
(used for forked-PR scenarios where secrets aren't available).

### Regenerating the golden

Run when ranking weights / strategy intentionally change, or when the
test user's content state genuinely drifted. The test user should
otherwise be a do-not-touch account; treat parity-fail-after-real-
content-change as expected and use:

```bash
PARITY_USER_JWT='…' PARITY_USER_ID='…' PARITY_SERVICES='netflix,…' \
  PARITY_SUPABASE_URL='…' PARITY_SUPABASE_SERVICE_ROLE_KEY='…' \
  node scripts/test/foryou-parity-probe.mjs --update-golden
```

Commit the resulting `scripts/test/foryou-parity-golden.json`.

### Refreshing PARITY_USER_JWT — `refresh-parity-jwt.ts`

Supabase user JWTs default to a 1-week expiry. Run weekly (or whenever
the workflow fails with a 401 from the Edge call):

```bash
PARITY_TEST_EMAIL='videx-parity-test@…' \
PARITY_TEST_PASSWORD='…' \
  npx tsx scripts/test/refresh-parity-jwt.ts | gh secret set PARITY_USER_JWT --body -
```

Pipes the access token from a fresh sign-in straight into the GitHub
secret. Status output (user id, expiry) goes to stderr so the pipe
captures only the JWT.

> ⚠ **POSIX shells only.** PowerShell's pipe re-encodes stdout and bakes
> a trailing newline into the secret → the Edge function rejects it with
> `UNAUTHORIZED_INVALID_JWT_FORMAT` (bit us at ENG-1 close-out). From
> PowerShell use:
> `$jwt = (npx tsx scripts/test/refresh-parity-jwt.ts).Trim()` then
> `gh secret set PARITY_USER_JWT --body $jwt`.

A weekly GitHub Action could automate this end-to-end — deferred to
Phase 6+ on the basis that prototype scale doesn't warrant the
infrastructure today.

## Semantic search eval — pre-existing

`../search-semantic-eval.ts` is the Phase Search V2 semantic-quality
fixture rig. Unrelated to the parity probe — see Phase Search V2
documentation for usage.
