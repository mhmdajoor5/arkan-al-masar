import {readFile} from 'node:fs/promises';
const expected=['id','category','party','entry_date','statement','description','debit','credit','created','actor'];
// This deployment initializes only the additive ledger migration. It never
// applies other pending migrations or alters existing booking/account tables.
export async function ensureLedgerDatabase(run){
 const execute=async(sql)=>{
  const output=await run(['d1','execute','DB','--config','wrangler.json','--remote','--json','--command',sql],true);
  const result=JSON.parse(output);
  if(!Array.isArray(result)||result.some(x=>x.success===false))throw Error('Ledger database verification failed.');
  return result;
 };
 const state=await execute("PRAGMA table_info(ledger_entries); SELECT name FROM d1_migrations WHERE name='0004_ledger_entries.sql';");
 const columns=state[0]?.results||[],recorded=state[1]?.results?.length>0;
 if(columns.length&&!expected.every(name=>columns.some(c=>c.name===name)))throw Error('Existing ledger schema differs; manual review is required.');
 if(recorded&&!columns.length)throw Error('Recorded ledger migration is missing its table.');
 if(recorded)return;
 const source=await readFile(new URL('../drizzle/0004_ledger_entries.sql',import.meta.url),'utf8');
 const sql=source.replaceAll('--> statement-breakpoint','').replace('CREATE TABLE `ledger_entries`','CREATE TABLE IF NOT EXISTS `ledger_entries`').replaceAll('CREATE INDEX `','CREATE INDEX IF NOT EXISTS `');
 await execute(sql);
 const verified=await execute('PRAGMA table_info(ledger_entries);');
 if(!expected.every(name=>verified[0]?.results?.some(c=>c.name===name)))throw Error('Ledger schema verification failed.');
 await execute("INSERT OR IGNORE INTO d1_migrations(name) VALUES('0004_ledger_entries.sql');");
 console.log('Accounting ledger database is ready.');
}
