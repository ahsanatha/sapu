import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

import { db } from '../database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIR = process.env.FILE_CONFIG_DIR || path.join(__dirname, '../../config/sites');

function slugify(name: string, baseUrl: string): string {
  try {
    const host = new URL(baseUrl).hostname.replace(/^www\./, '');
    return host.replace(/[^a-z0-9.-]/gi, '-');
  } catch {
    return String(name || '').toLowerCase().replace(/[^a-z0-9.-]/gi, '-').replace(/-+/g, '-');
  }
}

const TIMEOUT_MS = Math.max(1000, Number(process.env.CLI_TIMEOUT_MS ?? 10000));

async function main() {
  const timer = setTimeout(() => {
    console.error(`timeout after ${TIMEOUT_MS}ms, aborting`);
    process.exit(1);
  }, TIMEOUT_MS);
  try {
    await fs.mkdir(DIR, { recursive: true });
    await db.connect();
    await db.query(`SET LOCAL statement_timeout = ${TIMEOUT_MS}`);
    const sites = await db.getSites();
    let count = 0;
    for (const s of sites) {
      const fileName = slugify(s.name, s.base_url) || String(s.id || 'site');
      const p = path.join(DIR, `${fileName}.json`);
      const payload = { id: s.id, name: s.name, base_url: s.base_url, enabled: s.enabled, config: s.config };
      await fs.writeFile(p, JSON.stringify(payload, null, 2), 'utf8');
      count++;
    }
    await db.close();
    clearTimeout(timer);
    console.log(`exported ${count} sites to ${DIR}`);
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

main().catch(async (e) => { try { await db.close(); } catch {} console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
