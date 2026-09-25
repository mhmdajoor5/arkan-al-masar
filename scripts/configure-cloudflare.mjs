#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { projectRoot, readConfig, validateConfig } from './cloudflare-config.mjs';

const usage = 'Usage: node scripts/configure-cloudflare.mjs --database-id <D1 UUID> --vapid-subject <https contact URL or mailto address>';
const args = process.argv.slice(2);
try {
  if (args.length === 1 && args[0] === '--help') { console.log(usage); process.exit(0); }
  if (args.length !== 4) throw new Error(usage);
  const values = new Map();
  for (let i = 0; i < args.length; i += 2) {
    if (!['--database-id', '--vapid-subject'].includes(args[i]) || values.has(args[i])) throw new Error(usage);
    values.set(args[i], args[i + 1]);
  }
  const config = await readConfig();
  const binding = config.d1_databases?.find(item => item.binding === 'DB');
  if (!binding) throw new Error('wrangler.json is missing its DB binding.');
  binding.database_id = values.get('--database-id');
  config.vars.VAPID_SUBJECT = values.get('--vapid-subject');
  validateConfig(config);
  await writeFile(new URL('wrangler.json', projectRoot), JSON.stringify(config, null, 2) + '\n');
  console.log('Cloudflare configuration saved. Rebuild before deploying. No remote resources were changed.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
