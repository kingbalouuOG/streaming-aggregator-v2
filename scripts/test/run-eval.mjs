// Local runner for the semantic eval: loads .env, maps VITE_SUPABASE_URL to
// the SUPABASE_URL the eval script expects, then execs it. CI passes the
// same variables as real env, so this file is a convenience for local runs
// only and is not on the CI path.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = { ...process.env };

for (const line of readFileSync(resolve(root, '.env'), 'utf-8').split(/\r?\n/)) {
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
