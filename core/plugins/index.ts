import { db } from '../database.js';

import { scrape } from './scraper.js';
import { notify } from './notifier.js';
import { collectUrls } from './url-collector.js';
import { autoScale } from './autoscaler.js';
import { embedding } from './embedding.js';

interface CachedGlobalConfig {
  fetchedAt: number;
  processors: any[];
  globalCfg: any;
}

let cachedGlobal: CachedGlobalConfig | null = null;
const GLOBAL_CACHE_TTL_MS = 5000; // 5s; config rarely changes

async function loadGlobalConfig(force = false): Promise<CachedGlobalConfig> {
  const now = Date.now();
  if (!force && cachedGlobal && (now - cachedGlobal.fetchedAt) < GLOBAL_CACHE_TTL_MS) {
    return cachedGlobal;
  }
  const [processors, pageLoadRow, scrapingRow, debugRow, dupRow] = await Promise.all([
    db.getProcessors(),
    db.getConfiguration('page_load'),
    db.getConfiguration('scraping_defaults'),
    db.getConfiguration('debug'),
    db.getConfiguration('duplicate_prevention'),
  ]);
  let globalDupCfg: any = dupRow?.value || null;
  if (!globalDupCfg) {
    const dotKeys = [
      'duplicate_prevention.enabled',
      'duplicate_prevention.check_url',
      'duplicate_prevention.check_title_hash',
      'duplicate_prevention.check_content_hash',
    ];
    const entries: Record<string, any> = {};
    await Promise.all(dotKeys.map(async (k) => {
      try {
        const r = await db.getConfiguration(k);
        if (r && r.value !== undefined && r.value !== null) {
          let v: any = r.value;
          if (typeof v === 'string') {
            const l = v.toLowerCase();
            if (l === 'true' || l === 'false') {
              v = l === 'true';
            } else {
              try { v = JSON.parse(v); } catch { v = r.value; }
            }
          }
          entries[k.split('.').slice(1).join('_')] = v;
        }
      } catch {}
    }));
    globalDupCfg = Object.keys(entries).length ? entries : null;
  }
  const pageLoadCfg = pageLoadRow?.value || {};
  const scrapingCfg = scrapingRow?.value || {};
  const debugCfg = debugRow?.value || {};
  cachedGlobal = {
    fetchedAt: now,
    processors,
    globalCfg: { pageLoadCfg, scrapingCfg, debugCfg, globalDupCfg },
  };
  return cachedGlobal;
}

export async function executeProcessor(processorName: string, action: string, params: any = {}): Promise<any> {
  const { processors, globalCfg } = await loadGlobalConfig();
  let processor = processors.find((p: any) => p.name === processorName);
  if (!processor) {
    const byType = processors.find((p: any) => p.type === processorName && p.enabled);
    if (byType) processor = byType;
    else throw new Error(`Processor not found: ${processorName}`);
  }
  if (!processor.enabled) {
    console.log(`⏭️  Skipping disabled processor: ${processorName}`);
    return;
  }

  const { pageLoadCfg, scrapingCfg, debugCfg, globalDupCfg } = globalCfg;
  const mergedConfig = {
    ...pageLoadCfg,
    ...scrapingCfg,
    ...debugCfg,
    ...processor.config,
    page_load: {
      ...(pageLoadCfg?.page_load || pageLoadCfg || {}),
      ...(processor.config?.page_load || {})
    },
    scraping: {
      ...(scrapingCfg?.scraping || scrapingCfg || {}),
      ...(processor.config?.scraping || {})
    },
    debug: {
      ...(debugCfg?.debug || debugCfg || {}),
      ...(processor.config?.debug || {})
    },
    duplicate_prevention: {
      ...(globalDupCfg || {}),
      ...(processor.config?.duplicate_prevention || {})
    }
  };

  switch (processor.type) {
    case 'scraper':
      return scrape(action, params, mergedConfig);
    case 'notifier':
      return notify(action, params, mergedConfig);
    case 'url_collector':
      return collectUrls(action, params, mergedConfig);
    case 'autoscaler':
      return autoScale(action, params, mergedConfig);
    case 'embedding':
      return embedding(action, params, mergedConfig);
    default:
      throw new Error(`Unknown processor type: ${processor.type}`);
  }
}
