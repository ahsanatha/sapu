import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIR = process.env.FILE_CONFIG_DIR || path.join(__dirname, '../config/sites');

type CacheEntry = { mtimeMs: number; data: any };
const cache = new Map<string, CacheEntry>();
let cacheDirMtimeMs = 0;

async function dirMaxMtime(): Promise<number> {
  try {
    const dirStat = await fs.stat(DIR);
    return dirStat.mtimeMs;
  } catch {
    return 0;
  }
}

async function loadAllSites(): Promise<any[]> {
  const currentDirMtime = await dirMaxMtime();
  if (currentDirMtime && currentDirMtime === cacheDirMtimeMs && cache.size > 0) {
    return Array.from(cache.values()).map((e) => e.data);
  }
  cache.clear();
  cacheDirMtimeMs = currentDirMtime;
  const files = await fs.readdir(DIR).catch(() => [] as string[]);
  const siteFiles = files.filter((f) => f.endsWith('.json'));
  await Promise.all(siteFiles.map(async (f) => {
    try {
      const full = path.join(DIR, f);
      const [stat, txt] = await Promise.all([fs.stat(full), fs.readFile(full, 'utf8')]);
      cache.set(f, { mtimeMs: stat.mtimeMs, data: JSON.parse(txt) });
    } catch {}
  }));
  return Array.from(cache.values()).map((e) => e.data);
}

export async function listSites(enabled?: boolean): Promise<any[]> {
  const items = await loadAllSites();
  if (enabled === undefined) return items;
  return items.filter((s) => !!s.enabled === !!enabled);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function hostMatches(siteHost: string, queryHost: string): boolean {
  if (!siteHost || !queryHost) return false;
  if (siteHost === queryHost) return true;
  // Allow subdomains (query.cnn.com matches cnn.com) but NOT suffix-attack
  // (attacker-cnn.com does NOT match cnn.com).
  return queryHost.endsWith('.' + siteHost);
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
    const host = hostOf(asUrl);
    if (!host) return null;
    for (const s of items) {
      const baseHost = hostOf(s.base_url);
      if (hostMatches(baseHost, host)) return s;
    }
  } catch {}
  return null;
}

export async function findSiteByUrlHost(url: string): Promise<any | null> {
  try {
    const host = hostOf(url);
    if (!host) return null;
    const items = await listSites(true);
    for (const s of items) {
      const baseHost = hostOf(s.base_url);
      if (hostMatches(baseHost, host)) return s;
    }
    return null;
  } catch {
    return null;
  }
}
