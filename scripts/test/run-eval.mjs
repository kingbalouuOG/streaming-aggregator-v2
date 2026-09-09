// Local runner for the semantic eval: loads .env, maps VITE_SUPABASE_URL to
// the SUPABASE_URL the eval script expects, then execs it. CI passes the same
// variables as real environment, so this file is a local convenience only and
// is not on the CI path (see .github/workflows/search-semantic-eval.yml).
//
//   node scripts/test/run-eval.mjs
//   node scripts/test/run-eval.mjs scripts/search/eval-moods.ts
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const envPath = resolve(root, '.env');

if (!existsSync(envPath)) {
  console.error(
    `No .env at ${envPath}.\n\n` +
      'This runner only exists to save exporting four variables by hand. Either\n' +
      'create a .env with OPENAI_API_KEY, SUPABASE_SERVICE_ROLE_KEY and\n' +
      'VITE_SUPABASE_URL, or run the eval directly with those exported:\n\n' +
      '  npx tsx scripts/test/search-semantic-eval.ts',
  );
  process.exit(2);
}

const env = { ...process.env };
for (const line of readFileSync(envPath, 'utf-8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
env.SUPABASE_URL ||= env.VITE_SUPABASE_URL;

const target = process.argv[2] ?? 'scripts/test/search-semantic-eval.ts';
const r = spawnSync('npx', ['tsx', target, ...process.argv.slice(3)], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: true,
});
process.exit(r.status ?? 1);
