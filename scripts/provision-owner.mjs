#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { randomBytes, scrypt } from 'node:crypto';
import { access, chmod, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { readConfig, validDatabaseId } from './cloudflare-config.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const usage = 'Usage: node scripts/provision-owner.mjs --local | --remote';
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  console.log(usage);
  process.exit(0);
}
if (args.length !== 1 || !['--local', '--remote'].includes(args[0])) {
  console.error(usage);
  process.exit(1);
}
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.error('Owner provisioning requires an interactive terminal. Passwords cannot be supplied as arguments or environment variables.');
  process.exit(1);
}

const target = args[0];
const abort = new AbortController();
const interrupt = () => abort.abort();
let prompt;
let temporaryDirectory;
let muted = false;
const terminalOutput = new Writable({
  write(chunk, encoding, callback) {
    if (muted) callback();
    else process.stdout.write(chunk, encoding, callback);
  },
});
const quoteSql = value => "'" + value.replaceAll("'", "''") + "'";

async function question(label, hidden = false) {
  if (!hidden) return prompt.question(label, { signal: abort.signal });
  process.stdout.write(label);
  muted = true;
  try {
    return await prompt.question('', { signal: abort.signal });
  } finally {
    muted = false;
    process.stdout.write('\n');
  }
}

async function provision() {
  const wrangler = path.join(projectRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const configuration = path.join(projectRoot, 'wrangler.json');
  try {
    await Promise.all([access(wrangler), access(configuration)]);
  } catch {
    throw new Error('Install the pinned dependencies and configure wrangler.json before provisioning.');
  }
  if (target === '--remote') {
    const config = await readConfig();
    if (!validDatabaseId(config.d1_databases?.find(item => item.binding === 'DB')?.database_id)) {
      throw new Error('Configure the real D1 database ID before remote owner provisioning.');
    }
  }
  console.log(`Create the initial owner in ${target.slice(2)} D1 binding DB. Existing owners are never replaced.`);
  prompt = createInterface({ input: process.stdin, output: terminalOutput, terminal: true });
  prompt.on('SIGINT', interrupt);
  const emailResult = z.string().trim().email().max(180).transform(value => value.toLowerCase())
    .safeParse(await question('Owner email: '));
  if (!emailResult.success) throw new Error('Enter a valid owner email address, at most 180 characters.');
  const nameResult = z.string().trim().min(2).max(100).regex(/^[^\u0000-\u001f\u007f]+$/u)
    .safeParse(await question('Owner display name: '));
  if (!nameResult.success) throw new Error('The display name must contain 2–100 characters without control characters.');
  let password = await question('Password (12–128 characters, hidden): ', true);
  if (password.length < 12 || password.length > 128) throw new Error('The password must contain 12–128 characters.');
  let confirmation = await question('Confirm password (hidden): ', true);
  if (password !== confirmation) throw new Error('Passwords do not match.');
  prompt.close();
  prompt = undefined;
  abort.signal.throwIfAborted();

  // Match lib/operations-auth.ts exactly so ordinary staff sign-in can verify it.
  const salt = randomBytes(24);
  const key = await new Promise((resolve, reject) => {
    scrypt(password, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, derived) => error ? reject(error) : resolve(derived));
  });
  password = '';
  confirmation = '';
  const hash = `scrypt$32768$8$3$${salt.toString('hex')}$${key.toString('hex')}`;
  abort.signal.throwIfAborted();

  // A real path check also rejects TMPDIR aliases that resolve inside the repo.
  const [temporaryRoot, realProjectRoot] = await Promise.all([realpath(tmpdir()), realpath(projectRoot)]);
  const relativeTemporaryRoot = path.relative(realProjectRoot, temporaryRoot);
  if (!relativeTemporaryRoot || (!relativeTemporaryRoot.startsWith(`..${path.sep}`) && relativeTemporaryRoot !== '..' && !path.isAbsolute(relativeTemporaryRoot))) {
    throw new Error('The operating system temporary directory must be outside the project checkout.');
  }
  temporaryDirectory = await mkdtemp(path.join(temporaryRoot, 'arkan-owner-'));
  await chmod(temporaryDirectory, 0o700);
  const sqlFile = path.join(temporaryDirectory, 'provision.sql');
  const sql = 'INSERT INTO accounts(id,email,name,role,driver_id,password_hash,must_change,active,created) VALUES(' +
    ["'owner'", quoteSql(emailResult.data), quoteSql(nameResult.data), "'admin'", "''", quoteSql(hash), '0', '1', String(Date.now())].join(',') + ');\n';
  await writeFile(sqlFile, sql, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  abort.signal.throwIfAborted();

  // Wrangler may include SQL in diagnostics. Keep its output and log files off.
  const status = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wrangler, 'd1', 'execute', 'DB', '--config', configuration,
      target, '--file', sqlFile, '--yes'], {
      cwd: projectRoot,
      shell: false,
      stdio: ['ignore', 'ignore', 'ignore'],
      signal: abort.signal,
      env: { ...process.env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG: 'error' },
    });
    child.once('error', reject);
    child.once('close', resolve);
  });
  if (status !== 0) throw new Error('Owner creation failed. Check Cloudflare access, the DB binding and applied migrations. An existing owner or email is never overwritten.');
  console.log('Owner account created. Sign in at /admin with the credentials you entered.');
}

process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
try {
  await provision();
} catch (error) {
  // Only locally defined messages may be shown; third-party diagnostics can
  // contain the SQL statement, its password hash, or authentication details.
  const safeMessages = new Set([
    'Install the pinned dependencies and configure wrangler.json before provisioning.',
    'Configure the real D1 database ID before remote owner provisioning.',
    'Enter a valid owner email address, at most 180 characters.',
    'The display name must contain 2–100 characters without control characters.',
    'The password must contain 12–128 characters.',
    'Passwords do not match.',
    'The operating system temporary directory must be outside the project checkout.',
    'Owner creation failed. Check Cloudflare access, the DB binding and applied migrations. An existing owner or email is never overwritten.',
  ]);
  console.error(abort.signal.aborted ? 'Owner provisioning cancelled.' : safeMessages.has(error?.message) ? error.message : 'Owner provisioning failed. No credentials or database diagnostics were printed.');
  process.exitCode = 1;
} finally {
  prompt?.close();
  if (temporaryDirectory) {
    try {
      await rm(temporaryDirectory, { recursive: true, force: true });
    } catch {
      console.error('Could not remove the private temporary provisioning directory; remove it from your operating system temporary directory.');
      process.exitCode = 1;
    }
  }
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', interrupt);
}
