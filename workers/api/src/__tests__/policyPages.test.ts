/**
 * Unit tests for the legal-pages Markdown renderer. Pure module (no
 * Workers/Hono imports), runs under the root vitest rig.
 */

import { describe, it, expect } from 'vitest';
import { markdownToHtml, renderPolicyPage } from '../policyPages';

describe('markdownToHtml', () => {
  it('renders headings by level', () => {
    expect(markdownToHtml('# Privacy Policy')).toBe('<h1>Privacy Policy</h1>');
    expect(markdownToHtml('## 1. Who we are')).toBe('<h2>1. Who we are</h2>');
    expect(markdownToHtml('### Sub')).toBe('<h3>Sub</h3>');
  });

  it('joins hard-wrapped paragraph lines into one <p>', () => {
    const md = 'This is a paragraph that the\nauthor hard-wrapped across\nthree lines.';
    expect(markdownToHtml(md)).toBe('<p>This is a paragraph that the author hard-wrapped across three lines.</p>');
  });

  it('renders bold, italic and inline code', () => {
    expect(markdownToHtml('a **bold** and *em* and `code` here')).toBe(
      '<p>a <strong>bold</strong> and <em>em</em> and <code>code</code> here</p>',
    );
  });

  it('renders unordered lists and joins wrapped list items', () => {
    const md = '- first item\n- second item that wraps\n  onto a continuation line\n- third';
    expect(markdownToHtml(md)).toBe(
      '<ul><li>first item</li><li>second item that wraps onto a continuation line</li><li>third</li></ul>',
    );
  });

  it('rewrites internal .md cross-links to the hosted routes', () => {
    expect(markdownToHtml('see [the terms](./terms-of-service.md) now')).toBe(
      '<p>see <a href="/terms">the terms</a> now</p>',
    );
    expect(markdownToHtml('see [the policy](./privacy-policy.md)')).toBe(
      '<p>see <a href="/privacy">the policy</a></p>',
    );
  });

  it('renders external links and autolinks', () => {
    expect(markdownToHtml('[ICO](https://ico.org.uk/x)')).toBe('<p><a href="https://ico.org.uk/x">ICO</a></p>');
    expect(markdownToHtml('complain at <https://ico.org.uk/make-a-complaint/>.')).toBe(
      '<p>complain at <a href="https://ico.org.uk/make-a-complaint/">https://ico.org.uk/make-a-complaint/</a>.</p>',
    );
  });

  it('renders horizontal rules', () => {
    expect(markdownToHtml('a\n\n---\n\nb')).toBe('<p>a</p>\n<hr>\n<p>b</p>');
  });

  it('strips HTML comments (editorial slots) so they never reach the page', () => {
    const md = 'before\n\n<!--\nPENDING SLOT: push notifications\n-->\n\nafter';
    expect(markdownToHtml(md)).toBe('<p>before</p>\n<p>after</p>');
  });

  it('escapes HTML special characters in text', () => {
    expect(markdownToHtml('rock & roll < > tags')).toBe('<p>rock &amp; roll &lt; &gt; tags</p>');
  });
});

describe('renderPolicyPage', () => {
  it('wraps a fragment in a full HTML document with an escaped title', () => {
    const page = renderPolicyPage('Privacy Policy', '<h1>Hi</h1>');
    expect(page).toContain('<!doctype html>');
    expect(page).toContain('<title>Privacy Policy — Videx</title>');
    expect(page).toContain('<main>\n<h1>Hi</h1>\n</main>');
  });
});
