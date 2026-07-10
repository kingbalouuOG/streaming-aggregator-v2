/**
 * Password-reset bridge page. Gmail (and most clients) refuse to activate
 * custom-scheme links (videx://) in email, so the reset email links HTTPS
 * to /reset on this Worker; this module renders the page that forwards the
 * Supabase recovery token into the app scheme (auto-attempt + tap fallback).
 * Pure module (no Workers/Hono imports) so it runs under the root vitest rig.
 */

export const TOKEN_HASH_RE = /^[A-Za-z0-9_-]{1,256}$/;

export function renderResetBridgePage(appUrl: string | null): string {
  const body = appUrl
    ? `<p class="lead">Continue in the Videx app to set your new password.</p>
       <a class="btn" href="${appUrl}">Open Videx</a>
       <p class="hint">Nothing happening? Make sure Videx is installed on this
       device, then tap the button.</p>
       <script>setTimeout(function(){ window.location.href = ${JSON.stringify(appUrl)}; }, 400);</script>`
    : `<p class="lead">This reset link is incomplete or invalid.</p>
       <p class="hint">Open Videx and request a new password-reset email from
       the sign-in screen.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Reset your Videx password</title>
<style>
  body{background:#0a0a0f;color:#c6c3b8;font-family:Georgia,serif;margin:0;
       display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
  main{max-width:420px;text-align:center}
  .kicker{color:#e85d25;font-size:13px;letter-spacing:2px}
  h1{color:#f2ead9;font-size:22px;font-weight:600;margin:12px 0 8px}
  .lead{font-size:15px;line-height:1.6}
  .btn{display:inline-block;background:#e85d25;color:#0a0a0f;text-decoration:none;
       padding:14px 28px;border-radius:14px;font-size:16px;margin:20px 0}
  .hint{color:#8b8a94;font-size:13px;line-height:1.6}
</style></head><body><main>
<div class="kicker">VIDEX</div>
<h1>Reset your password</h1>
${body}
</main></body></html>`;
}
