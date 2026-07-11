---
title: Auth email — custom SMTP sender + branding runbook
type: concept
tags: [runbook, supabase, auth, email, smtp, dns, password-reset]
created: 2026-07-10
updated: 2026-07-11
sources:
  - https://supabase.com/docs/guides/auth/auth-smtp
  - https://supabase.com/docs/guides/auth/auth-email-templates
  - https://supabase.com/docs/guides/auth/native-mobile-deep-linking
related:
  - wiki/entities/infrastructure/supabase.md
---

# Auth email — custom SMTP sender + branding runbook

> ✅ **Status (2026-07-11): DONE and verified end-to-end.** Auth email sends
> from `Videx Streaming <noreply@videxstreaming.com>` via Resend (eu-west-1);
> DKIM/SPF/DMARC pass; the reset flow was proven on-device (email → HTTPS
> bridge → app → new password → reused link shows the expired state). The
> steps below are kept as the record / rebuild guide. The domain is
> **videxstreaming.com** (the `videx.streaming` placeholder this doc was
> drafted with was never registered — `.streaming` is not a real TLD).

Reset-password and other auth emails originally shipped from Supabase's
built-in sender (`noreply@mail.app.supabase.io`). That was fine for internal
testing but had two problems for launch:

1. **Deliverability + trust** — a shared Supabase-owned domain lands in spam
   more often and shows an unbranded sender. Beta feedback (2026-07-09) flagged
   the reset email as easy to miss.
2. **Rate limits** — the built-in sender is throttled to a low volume (≈2–4
   auth emails/hour on the free tier), which will bottleneck real signups.

This runbook makes auth email send from a Videx-owned address via a custom SMTP
provider, with SPF/DKIM set up and the templates branded. Written to be
followed blind.

> The product domain is **videxstreaming.com** (Cloudflare-managed DNS;
> registered 2026-07-10). Substitute it wherever an older note says
> `videx.streaming` or `videx.app`.

---

## Step 0 — Decide the sender identity

| Field | Value |
|-------|-------|
| From name | `Videx` |
| From address | `noreply@videxstreaming.com` (or `hello@` if we want replies) |
| Reply-to | optional; `support@videxstreaming.com` if a mailbox exists |

Keep the local-part stable — changing it later resets deliverability reputation.

---

## Step 1 — Pick an SMTP provider (solo UK dev)

Recommended: **Resend** (https://resend.com). Rationale for a solo dev:

- Free tier: 3,000 emails/month, 100/day — comfortably covers early auth volume.
- First-class SMTP endpoint (`smtp.resend.com:465`) that drops straight into
  Supabase's custom-SMTP form; no code.
- Clean DNS setup wizard that generates the exact SPF/DKIM records to paste.
- UK/EU data handling is documented; no card required for the free tier.

Alternatives if Resend doesn't fit:

| Provider | Free tier | Notes |
|----------|-----------|-------|
| Brevo (ex-Sendinblue) | 300/day | EU-based (France); generous daily cap. |
| Mailgun | 100/day (flexible trial) | Powerful but more setup. |
| Amazon SES | 3,000/mo if sent from an AWS-hosted app; else pay-as-you-go | Cheapest at scale, fiddliest DNS/console. |

The steps below assume **Resend**; the shape is identical for the others (host,
port, username, password/API-key, plus SPF/DKIM DNS).

### 1a. Create the Resend account + domain

1. Sign up at resend.com with the Videx testing account
   (`joegreenwas@gmail.com` — see the testing-account note).
2. Dashboard → **Domains** → **Add Domain** → enter `videxstreaming.com`.
3. Resend shows a set of DNS records to add (see Step 2). Leave this tab open.
4. Dashboard → **API Keys** → create a key named `supabase-smtp` with
   **Sending access**. Copy it — this is the SMTP password. It is shown once.

---

## Step 2 — DNS records (SPF + DKIM + optional DMARC)

Add these at the registrar / DNS host for `videxstreaming.com`. Resend's domain
page lists the exact values; the shapes are:

| Type | Host / Name | Value | Purpose |
|------|-------------|-------|---------|
| `TXT` | `send.videxstreaming.com` (or `@`) | `v=spf1 include:amazonses.com ~all` (Resend uses SES under the hood; paste the value Resend shows) | **SPF** — authorises the provider to send as your domain. |
| `TXT`/`CNAME` | `resend._domainkey.videxstreaming.com` | the long DKIM key Resend generates | **DKIM** — cryptographically signs mail; the single biggest deliverability lever. |
| `MX` | `send.videxstreaming.com` | `feedback-smtp.<region>.amazonses.com` (as shown) | bounce/complaint handling. |
| `TXT` | `_dmarc.videxstreaming.com` | `v=DMARC1; p=none; rua=mailto:dmarc@videxstreaming.com` | **DMARC** (optional but recommended) — start at `p=none` to monitor, tighten to `quarantine` later. |

Notes:

- If the domain already has an SPF `TXT` record, **merge** — one SPF record per
  domain only. Add the provider's `include:` into the existing record; don't
  add a second `v=spf1` line.
- DNS propagation is minutes-to-hours. Back in Resend's Domains page, click
  **Verify** until every record goes green before continuing.
- `CAA` records, if present, don't affect email — ignore.

---

## Step 3 — Point Supabase at the SMTP provider

Dashboard → project `fmusugdcnnwiuzkbjquo` → **Authentication → Emails → SMTP
Settings** (older UI: **Project Settings → Auth → SMTP**).

1. Toggle **Enable Custom SMTP** on.
2. Fill in (Resend values):

   | Field | Value |
   |-------|-------|
   | Sender email | `noreply@videxstreaming.com` |
   | Sender name | `Videx` |
   | Host | `smtp.resend.com` |
   | Port | `465` (SSL) — or `587` (STARTTLS) if `465` is blocked |
   | Username | `resend` |
   | Password | the `supabase-smtp` API key from Step 1a |

3. **Minimum interval between emails** — leave at the default (60s) or lower it
   only if the resend-cooldown UX needs it. The app's Forgot-password screen
   enforces a 30s client cooldown regardless.
4. Save. Supabase sends a test on save — confirm it lands (check spam on the
   first send; DKIM warms up over a few messages).

> The `SA_API_KEY`-style server-secret discipline does **not** apply here — the
> SMTP password lives only in the Supabase dashboard, never in the app bundle
> or repo.

---

## Step 4 — Brand the auth email templates

Dashboard → **Authentication → Email Templates**. Edit at least the **Reset
Password** template (and Confirm-signup / Magic-link for consistency).

### 4a. The reset link: token_hash + HTTPS bridge (both are load-bearing)

Two independent failure classes were hit here (2026-07-09/10); the live
template dodges both. **Do not regress either.**

**Failure 1 — fragment tokens.** The default `{{ .ConfirmationURL }}` returns
tokens in the URL **fragment**, which the HTTP→custom-scheme redirect hop
frequently **drops**, leaving the app with no params (the old infinite
spinner). Fix: link with `token_hash` as a **query** parameter and let the app
call `verifyOtp` (root-cause note in `native/src/app/reset-password.tsx`).

**Failure 2 — custom-scheme hrefs in email.** Gmail (and most clients)
**refuse to activate `videx://` anchors** — the button renders as flat,
non-tappable styled text with no long-press URL. An earlier draft of this
runbook recommended hard-coding the scheme in the template; that advice was
wrong. Email links must be `https://` on a domain we control.

The live shape is therefore an **HTTPS bridge** on the videx-api Worker
(PR #62, `workers/api/src/resetBridge.ts` + the `/reset` route in `index.ts`):

```html
<a href="https://videxstreaming.com/reset?token_hash={{ .TokenHash }}&type=recovery">
  <span style="color:#0a0a0f;">Reset your password</span>
</a>
```

- `GET /reset` validates `token_hash` (charset/length regex, 400 otherwise),
  sets `no-store`/`no-referrer`/`noindex`, and serves a branded page that
  forwards to `videx://reset-password?token_hash=…&type=recovery` (auto after
  ~400 ms, plus an explicit **Open Videx** button for clients that block
  scriptless redirects). The token is never logged and never touches Supabase
  from the bridge — only the app consumes it.
- The inner `<span style="color:…">` is deliberate: Gmail dark mode repaints
  anchor text white unless the colour is set on a child element.
- Include a **plain-text copy of the same URL** in the body (Gmail
  auto-linkifies bare https URLs even when it distrusts anchors) — the live
  template has a "Button not working?" row.

**App-side pairing (PR #63):** the reset screen reads `token_hash` from
expo-router `useLocalSearchParams`, NOT `Linking.useURL()` — the latter misses
the deep link on **warm starts** (the url event fires before the screen
subscribes), which produced "couldn't verify" errors on the first real
end-to-end test. Raw-URL parsing remains only as the legacy-fragment fallback.

Available template variables (`{{ .TokenHash }}`, `{{ .ConfirmationURL }}`,
`{{ .Token }}`, `{{ .SiteURL }}`, `{{ .RedirectTo }}`, `{{ .Email }}`) are
documented in Supabase's Email Templates guide.

> ⚠ **Template saves can silently not take.** The 2026-07-10 session saved
> the new template, yet Supabase kept sending the old one. After saving:
> hard-refresh the dashboard page and confirm the editor still shows the new
> HTML, then verify a real delivery via Gmail **⋮ → Show original** and
> Ctrl-F for `videxstreaming.com/reset`.

### 4b. Videx branding

- Subject: `Reset your Videx password`.
- Body: dark-friendly minimal HTML, `#e85d25` primary button, `#0a0a0f`
  background (mirror the in-app `--vx-*` tokens / the title-page CSS in
  `workers/api/src/titlePage.ts`).
- Keep the button text short (`Reset password`) and include a plain-text
  fallback URL beneath it.

> ⚠ **Email tracking breaks the link.** If the provider offers open/click
> tracking, **disable it for these templates** — tracking rewrites the href and
> corrupts the `token_hash`, producing "token invalid" on tap. (Supabase docs,
> Email Templates → Limitations.)

> ⚠ **Link prefetch (Microsoft Defender Safe Links etc.)** can consume the
> one-time token before the user taps it, producing "expired" on the first
> click. The `{{ .Token }}` OTP fallback mitigates this if it becomes a
> problem; not expected for the current beta audience.

---

## Step 5 — Redirect-URL allowlist (already done — verify)

Dashboard → **Authentication → URL Configuration → Redirect URLs** must contain
`videx://reset-password` (or the wildcard `videx://*`). Without it Supabase
ignores `redirectTo` and the email link dead-ends at the Site URL. This entry
is already present from the A5 reset work — **just confirm it's still there**
after any URL-config edits. The native provider sets `redirectTo` via
`Linking.createURL('reset-password')` in `native/src/providers/auth.tsx`.

---

## Step 6 — End-to-end verification

1. In the app: sign-in screen → **Forgot password?** → enter the testing email
   → **Send reset link** → confirmation state appears.
2. Inbox: the email is from `Videx <noreply@videxstreaming.com>`, not the Supabase
   default. Headers show `dkim=pass` and `spf=pass` (Gmail: "Show original").
3. Tap the link **on the device running the app**. The branded bridge page
   flashes up, forwards into the app's `/reset-password` screen, which
   verifies within a second (no infinite spinner) and shows the new-password
   form. Test **both** warm (app backgrounded) and cold (app killed) starts —
   the warm path is the one PR #63 fixed.
4. Set a new password → lands back in the app signed in.
5. Tap the **same** link again → the app now shows the explicit "expired or
   already used — request a new one" state (not a spinner).

---

## Rollback

Toggle **Enable Custom SMTP** off in Supabase → auth email reverts to the
built-in sender immediately. No app rebuild needed. DNS records can stay; they
are inert without the SMTP toggle.
