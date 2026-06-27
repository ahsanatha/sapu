import { db } from '../database.js';

import { scrape } from './scraper.js';
import { notify } from './notifier.js';
import { schedule } from './scheduler.js';
import { collectUrls } from './url-collector.js';
import { autoScale } from './autoscaler.js';
import { embedding } from './embedding.js';

export async function executeProcessor(processorName: string, action: string, params: any = {}): Promise<any> {
  const processors = await db.getProcessors();
  let processor = processors.find((p: any) => p.name === processorName);
  
  if (!processor) {
    const byType = processors.find((p: any) => p.type === processorName && p.enabled);
    if (byType) {
      processor = byType;
    } else {
      throw new Error(`Processor not found: ${processorName}`);
    }
  }
  
  if (!processor.enabled) {
    console.log(`⏭️  Skipping disabled processor: ${processorName}`);
    return;
  }

  const globalPageLoadCfg = (await db.getConfiguration('page_load'))?.value || {};
  const globalScrapingCfg = (await db.getConfiguration('scraping_defaults'))?.value || {};
  const globalDebugCfg = (await db.getConfiguration('debug'))?.value || {};
  const dupConfigRow = await db.getConfiguration('duplicate_prevention');
  let globalDupCfg: any = dupConfigRow?.value || null;
  if (!globalDupCfg) {
    const dotKeys = [
      'duplicate_prevention.enabled',
      'duplicate_prevention.check_url',
      'duplicate_prevention.check_title_hash',
      'duplicate_prevention.check_content_hash'
    ];
    const entries: Record<string, any> = {};
    for (const k of dotKeys) {
      try {
        const r = await db.getConfiguration(k);
        if (r && r.value !== undefined && r.value !== null) {
          const vRaw = r.value;
          let v: any = vRaw;
          if (typeof vRaw === 'string') {
            const l = vRaw.toLowerCase();
            if (l === 'true' || l === 'false') {
              v = l === 'true';
            } else {
              try { v = JSON.parse(vRaw); } catch { v = vRaw; }
            }
          }
          const prop = k.split('.').slice(1).join('_');
          entries[prop] = v;
        }
      } catch {}
    }
    globalDupCfg = Object.keys(entries).length ? entries : null;
  }
  const mergedConfig = {
    ...globalPageLoadCfg,
    ...globalScrapingCfg,
    ...globalDebugCfg,
    ...processor.config,
    page_load: {
      ...(globalPageLoadCfg?.page_load || globalPageLoadCfg || {}),
      ...(processor.config?.page_load || {})
    },
    scraping: {
      ...(globalScrapingCfg?.scraping || globalScrapingCfg || {}),
      ...(processor.config?.scraping || {})
    },
    debug: {
      ...(globalDebugCfg?.debug || globalDebugCfg || {}),
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
    case 'scheduler':
      return schedule(action, params, mergedConfig);
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
