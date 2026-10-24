import {readdir,readFile} from 'node:fs/promises';
export async function migrateLocal(db){
 await db.prepare('CREATE TABLE IF NOT EXISTS local_schema_migrations(name TEXT PRIMARY KEY)').run();
 let journalEntries=[];
 try{
  const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));
  journalEntries=(journal.entries||[]).map(e=>`${e.tag}.sql`);
 }catch{}
 const dirFiles=(await readdir('drizzle')).filter(x=>x.endsWith('.sql'));
 const allFiles=[...new Set([...journalEntries,...dirFiles])].sort();
 for(const name of allFiles){
  if(await db.prepare('SELECT name FROM local_schema_migrations WHERE name=?').bind(name).first())continue;
  // Pre-0.8 local previews already applied migration zero without a journal.
  const legacy=name.startsWith('0000')&&await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='coaching_accounts'").first();
  if(!legacy)for(const sql of (await readFile('drizzle/'+name,'utf8')).split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql.trim()).run();
  await db.prepare('INSERT INTO local_schema_migrations(name) VALUES(?)').bind(name).run();
 }
}
