import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIR = process.env.FILE_CONFIG_DIR || path.join(__dirname, '../config/sites');

async function readJson(p: string): Promise<any> {
  const txt = await fs.readFile(p, 'utf8');
  return JSON.parse(txt);
}

export async function listSites(enabled?: boolean): Promise<any[]> {
  const files = await fs.readdir(DIR).catch(() => [] as string[]);
  const siteFiles = files.filter(f => f.endsWith('.json'));
  const items: any[] = [];
  for (const f of siteFiles) {
    try {
      const data = await readJson(path.join(DIR, f));
      if (enabled === undefined || !!data.enabled === !!enabled) {
        items.push(data);
      }
    } catch {}
  }
  return items;
}

export async function getSite(idOrKey: string): Promise<any | null> {
  const key = String(idOrKey || '');
  const items = await listSites();
  const byId = items.find(s => String(s.id || '') === key);
  if (byId) return byId;
  const byName = items.find(s => String(s.name || '') === key || String(s.base_url || '') === key);
  if (byName) return byName;
  try {
    const asUrl = key.includes('://') ? key : `https://${key}`;
    const host = new URL(asUrl).hostname.replace(/^www\./, '');
    for (const s of items) {
      try {
        const baseHost = new URL(s.base_url).hostname.replace(/^www\./, '');
        if (baseHost === host || host.endsWith(baseHost) || baseHost.endsWith(host)) {
          return s;
        }
      } catch {}
    }
  } catch {}
  return null;
}

export async function findSiteByUrlHost(url: string): Promise<any | null> {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const items = await listSites(true);
    for (const s of items) {
      try {
        const baseHost = new URL(s.base_url).hostname.replace(/^www\./, '');
        if (baseHost === host || host.endsWith(baseHost) || baseHost.endsWith(host)) {
          return s;
        }
      } catch {}
    }
    return null;
  } catch {
    return null;
  }
}
