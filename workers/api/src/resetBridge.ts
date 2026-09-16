/**
 * Auth email bridge page. Gmail (and most clients) refuse to activate
 * custom-scheme links (videx://) in email, so auth emails link HTTPS to
 * /reset on this Worker; this module renders the page that forwards the
 * Supabase token_hash into the app scheme (auto-attempt + tap fallback).
 *   type=recovery        -> videx://reset-password (password reset)
 *   type=email | signup  -> videx://confirm-email  (sign-up confirmation,
 *                           Growth S3 follow-up; reuses this route so no new
 *                           Cloudflare dashboard route is needed)
 * Pure module (no Workers/Hono imports) so it runs under the root vitest rig.
 */

export const TOKEN_HASH_RE = /^[A-Za-z0-9_-]{1,256}$/;

export type BridgeKind = 'recovery' | 'confirm';

export function bridgeKind(type: string): BridgeKind {
  return type === 'recovery' ? 'recovery' : 'confirm';
}

/** The app URL for an email link, or null when the token or type is not
 *  acceptable. The token is charset-checked before interpolation. */
export function bridgeAppUrl(tokenHash: string, type: string): string | null {
  if (!TOKEN_HASH_RE.test(tokenHash)) return null;
  if (type === 'recovery') return `videx://reset-password?token_hash=${tokenHash}&type=recovery`;
  // 'signup' is Supabase's older name for the same confirmation; verifyOtp takes 'email'.
  if (type === 'email' || type === 'signup') return `videx://confirm-email?token_hash=${tokenHash}&type=email`;
  return null;
}

const COPY: Record<BridgeKind, { title: string; heading: string; lead: string; invalidLead: string; invalidHint: string }> = {
  recovery: {
    title: 'Reset your Videx password',
    heading: 'Reset your password',
    lead: 'Continue in the Videx app to set your new password.',
    invalidLead: 'This reset link is incomplete or invalid.',
    invalidHint: 'Open Videx and request a new password-reset email from the sign-in screen.',
  },
  confirm: {
    title: 'Confirm your Videx email',
    heading: 'Confirm your email',
    lead: 'Continue in the Videx app to finish setting up your account.',
    invalidLead: 'This confirmation link is incomplete or invalid.',
    invalidHint: 'Open Videx and sign in with your email: the app will offer to send a new link.',
  },
};

export function renderResetBridgePage(appUrl: string | null, kind: BridgeKind = 'recovery'): string {
  const copy = COPY[kind];
  const body = appUrl
    ? `<p class="lead">${copy.lead}</p>
       <a class="btn" href="${appUrl}">Open Videx</a>
       <p class="hint">Nothing happening? Open this link on the phone where
       Videx is installed, then tap the button.</p>
       <script>setTimeout(function(){ window.location.href = ${JSON.stringify(appUrl)}; }, 400);</script>`
    : `<p class="lead">${copy.invalidLead}</p>
       <p class="hint">${copy.invalidHint}</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${copy.title}</title>
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
<h1>${copy.heading}</h1>
${body}
</main></body></html>`;
}
