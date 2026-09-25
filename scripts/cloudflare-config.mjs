import { readFile } from 'node:fs/promises';

export const projectRoot = new URL('../', import.meta.url);
export async function readConfig(relative = 'wrangler.json') {
  return JSON.parse(await readFile(new URL(relative, projectRoot), 'utf8'));
}
export function validDatabaseId(value) {
  return typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value)
    && !/^00000000-0000-/.test(value);
}
export function validSubject(value) {
  if (typeof value !== 'string' || value.length > 500) return false;
  if (/^mailto:[^\s@?]+@[^\s@?]+\.[^\s@?]+$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}
export function validateConfig(config) {
  const binding = config.d1_databases?.find(item => item.binding === 'DB');
  if (!validDatabaseId(binding?.database_id)) throw new Error('Configure the real Cloudflare D1 database ID before deploying.');
  if (!validSubject(config.vars?.VAPID_SUBJECT)) throw new Error('Configure VAPID_SUBJECT with your HTTPS contact URL or mailto: address.');
  if (config.vars?.BOOKING_MODE !== 'demo') throw new Error('Online payment is not integrated. Keep BOOKING_MODE=demo for unpaid booking requests.');
  return binding;
}
