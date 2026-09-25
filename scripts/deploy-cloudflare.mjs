#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { projectRoot, readConfig, validateConfig } from './cloudflare-config.mjs';

const root = fileURLToPath(projectRoot);
const wrangler = fileURLToPath(new URL('node_modules/wrangler/bin/wrangler.js', projectRoot));
const args = process.argv.slice(2);
function run(arguments_, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wrangler, ...arguments_], {
      cwd: root, shell: false,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false' },
    });
    let stdout = '';
    if (capture) {
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.resume();
    }
    child.once('error', () => reject(new Error('Could not start the pinned Wrangler CLI. Install project dependencies.')));
    child.once('close', code => code === 0 ? resolve(stdout) : reject(new Error(capture
      ? 'D1 owner verification failed. Check Cloudflare access, migrations, and the DB binding.'
      : 'Cloudflare deployment failed. Review the Wrangler result above.')));
  });
}
try {
  if (args.length && !(args.length === 1 && args[0] === '--check-config-only')) throw new Error('Usage: node scripts/deploy-cloudflare.mjs [--check-config-only]');
  const source = await readConfig();
  const sourceBinding = validateConfig(source);
  let built;
  try { built = await readConfig('dist/server/wrangler.json'); }
  catch { throw new Error('Run pnpm build before deployment.'); }
  const builtBinding = validateConfig(built);
  if (builtBinding.database_id !== sourceBinding.database_id || built.name !== source.name
      || built.vars.VAPID_SUBJECT !== source.vars.VAPID_SUBJECT) {
    throw new Error('Built configuration is stale. Run pnpm build again.');
  }
  if (args[0] === '--check-config-only') {
    console.log('Source and built deployment settings match. No remote access or deployment was performed.');
  } else {
    const result = await run(['d1', 'execute', 'DB', '--config', 'wrangler.json', '--remote', '--json', '--command',
      "SELECT count(*) AS owners FROM accounts WHERE id='owner' AND role='admin' AND active=1"], true);
    let rows;
    try { rows = JSON.parse(result); } catch { throw new Error('Could not verify the D1 owner. No deployment was performed.'); }
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0].success === false || rows[0].results?.[0]?.owners !== 1) {
      throw new Error('Provision the initial owner securely, or import existing accounts, before deployment.');
    }
    await run(['deploy', '--config', 'dist/server/wrangler.json']);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
