import { db } from '../database.js';

const TIMEOUT_MS = Math.max(1000, Number(process.env.CLI_TIMEOUT_MS ?? 8000));

async function main() {
  const timer = setTimeout(() => {
    console.error(`timeout after ${TIMEOUT_MS}ms, aborting`);
    process.exit(1);
  }, TIMEOUT_MS);
  try {
    await db.connect();
    await db.query(`SET LOCAL statement_timeout = ${TIMEOUT_MS}`);
    await db.query(`SET LOCAL lock_timeout = ${Math.max(500, Math.floor(TIMEOUT_MS/4))}`);
    await db.query('ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_site_id_fkey');
    await db.query('DROP INDEX IF EXISTS idx_articles_site_id');
    await db.query('DROP TABLE IF EXISTS sites CASCADE');
    await db.close();
    clearTimeout(timer);
    console.log('dropped sites table');
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

main().catch(async (e) => { try { await db.close(); } catch {} console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
