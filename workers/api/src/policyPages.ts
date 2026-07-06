/**
 * Legal pages renderer — turns the Markdown policy sources in
 * docs/legal/*.md into simple, self-contained HTML for GET /privacy and
 * GET /terms (launch-compliance checklist §D). Single source of truth:
 * the same Markdown the app renders in-app, bundled as text via the
 * wrangler [[rules]] Text rule.
 *
 * Deliberately a tiny purpose-built renderer, not a Markdown library:
 * our policy docs use only headings, paragraphs, bold/italic/code,
 * unordered lists, links (incl. autolinks), and horizontal rules. Pure
 * (no Workers/Hono imports) so it unit-tests under the root vitest rig.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Internal .md cross-links point at the hosted routes, not files. */
function resolveHref(url: string): string {
  if (/privacy-policy\.md$/.test(url)) return '/privacy';
  if (/terms-of-service\.md$/.test(url)) return '/terms';
  return url;
}

/** Inline formatting on already block-split text. */
function inline(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t, url) => `<a href="${resolveHref(url)}">${t}</a>`);
  // Autolinks <https://…> — angle brackets are escaped to &lt; / &gt; above.
  s = s.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, (_m, url) => `<a href="${url}">${url}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, (_m, b) => `<strong>${b}</strong>`);
  s = s.replace(/\*([^*]+)\*/g, (_m, it) => `<em>${it}</em>`);
  return s;
}

const isBlank = (s: string): boolean => s.trim() === '';
const isRule = (s: string): boolean => /^---+\s*$/.test(s);
const isHeading = (s: string): boolean => /^#{1,3}\s+/.test(s);
const isListItem = (s: string): boolean => /^-\s+/.test(s);

/** Render our Markdown subset to an HTML fragment. */
export function markdownToHtml(md: string): string {
  // Strip HTML comments (editorial slots, e.g. the pending push section)
  // so they never reach the public page.
  const lines = md.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/);
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) { i++; continue; }

    if (isRule(line)) { out.push('<hr>'); i++; continue; }

    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    if (isListItem(line)) {
      const items: string[] = [];
      while (i < lines.length && !isBlank(lines[i])) {
        const m = /^-\s+(.*)$/.exec(lines[i]);
        if (m) {
          items.push(m[1]);
        } else if (/^\s+\S/.test(lines[i]) && items.length) {
          // Continuation of a hard-wrapped list item.
          items[items.length - 1] += ' ' + lines[i].trim();
        } else {
          break;
        }
        i++;
      }
      out.push('<ul>' + items.map((it) => `<li>${inline(it.trim())}</li>`).join('') + '</ul>');
      continue;
    }

    // Paragraph: join hard-wrapped lines until a blank / block boundary.
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !isRule(lines[i]) &&
      !isHeading(lines[i]) &&
      !isListItem(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    out.push(`<p>${inline(para.join(' ').trim())}</p>`);
  }

  return out.join('\n');
}

/** Wrap a rendered fragment in a minimal, self-contained HTML page. */
export function renderPolicyPage(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Videx</title>
<style>
:root { color-scheme: light dark; }
body { max-width: 44rem; margin: 0 auto; padding: 2rem 1.25rem 4rem;
  font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #1a1a1a; background: #fff; }
@media (prefers-color-scheme: dark) { body { color: #e8e6e1; background: #131318; } }
h1 { font-size: 1.9rem; margin: 0 0 1rem; }
h2 { font-size: 1.3rem; margin: 2rem 0 .5rem; }
h3 { font-size: 1.05rem; margin: 1.5rem 0 .4rem; }
p, li { margin: .5rem 0; }
ul { padding-left: 1.4rem; }
a { color: #3b6ef5; }
code { font: .875em ui-monospace, SFMono-Regular, Menlo, monospace;
  background: rgba(127,127,127,.16); padding: .1em .35em; border-radius: 4px; }
hr { border: 0; border-top: 1px solid rgba(127,127,127,.3); margin: 2rem 0; }
</style>
</head>
<body>
<main>
${bodyHtml}
</main>
</body>
</html>`;
}
