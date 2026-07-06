// Markdown policy sources are bundled as text (wrangler [[rules]] Text
// rule) and imported by index.ts to serve /privacy and /terms.
declare module '*.md' {
  const content: string;
  export default content;
}
