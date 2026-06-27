import { createHash } from 'crypto';

import { db } from '../database.js';
import { queue } from '../queue.js';
import type { Site } from '../types.js';
import { resolvePageLoad, resolveWaitUntil, resolveClientContext, applyPageContext, resolvePatterns, resolveLimits } from '../config.js';

import { getBrowser, createPage } from './browser.js';

export async function collectUrls(action: string, params: any, config: any, asWorker?: boolean): Promise<any> {
  switch (action) {
    case 'collect_urls':
      if (params && (params.sites === 'all_enabled' || Array.isArray(params.sites))) {
        try {
          console.log('url-collector:batch:invoke', { sites: params.sites, collection_type: params.collection_type });
          const res = await collectForSites(params, config);
          console.log('url-collector:batch:done', res);
          return res;
        } catch (e) {
          console.error('url-collector:batch:error', e instanceof Error ? e.message : String(e));
          try { const { notify } = await import('./notifier.js'); await notify('notify', { template: 'collection_failed', error: e instanceof Error ? e.message : String(e) }, { enabled: true, provider: 'telegram' }); } catch {}
          throw e;
        }
      }
      try {
        console.log('url-collector:single:invoke', { site_id: params?.site?.id, url: params?.url, collection_type: params?.collection_type });
        const res = await collectFromSite(params, config, true);
        console.log('url-collector:single:done', res);
        return res;
      } catch (e) {
        console.error('url-collector:single:error', e instanceof Error ? e.message : String(e));
        try { const { notify } = await import('./notifier.js'); await notify('notify', { template: 'collection_failed', site_name: params?.site?.name, url: params?.url || params?.site?.base_url, error: e instanceof Error ? e.message : String(e) }, { enabled: true, provider: 'telegram' }); } catch {}
        throw e;
      }
    default:
      throw new Error(`Unknown url-collector action: ${action}`);
  }
}

async function collectForSites(params: any, config: any): Promise<any> {
  const list = await import('../sites.js').then(m => m.listSites(true)).catch(() => [] as any[]);
  const sites = Array.isArray(params.sites)
    ? list.filter(s => params.sites.includes(String(s.id)))
    : list;
  const collectionType = String(params.collection_type || 'general');
  let queued = 0;
  let skipped = 0;
  console.log('url-collector:batch:start', { enabled_sites_total: list.length, selected_sites: sites.length, collection_type: collectionType });
  for (const site of sites) {
    const enabled = !!site?.enabled;
    const urlEnabled = !!site?.config?.url_collection?.enabled;
    if (!enabled || !urlEnabled) {
      skipped++;
      console.log('url-collector:batch:skip', { site_id: site?.id, name: site?.name, enabled, url_collection_enabled: urlEnabled });
      continue;
    }
    const id = createHash('sha1').update(`url_collection:${String(site.base_url || site.id || site.name || '')}`).digest('hex');
    console.log('url-collector:batch:publish', { site_id: site?.id, base_url: site?.base_url, job_id: id, priority: 4, collection_type: collectionType });
    await queue.publish({ id, type: 'url_collection', url: site.base_url, site_id: site.id, priority: 4, config: { collection_type: collectionType } });
    queued++;
  }
  return { success: true, queued_jobs: queued, skipped_sites: skipped, selected_sites: sites.length, collection_type: collectionType };
}

async function collectFromSite(params: any, config: any, asWorker?: boolean): Promise<any> {
  const site: Site = params.site;
  const pl = resolvePageLoad(site, config, 'url_collection');
  const waitUntil = resolveWaitUntil(site, config, 'url_collection');
  const ctx = resolveClientContext(site, config, 'url_collection');
  const patterns = resolvePatterns(site, config);
  const limits = resolveLimits(site, config);

  const { browser, page } = await createPage({ ...config, page_load: { ...config.page_load, protocol_timeout: pl.protocol_timeout } });
  await applyPageContext(page, ctx);
  try {
    const targetUrl: string = params.url || site.base_url;
    console.log('url-collector:site:navigate', { site_id: site?.id, name: site?.name, url: targetUrl, wait_until: waitUntil, timeout_ms: pl.timeout });
    await page.goto(targetUrl, { waitUntil, timeout: pl.timeout });

    const allLinks: string[] = await page.$$eval('a[href]', (anchors: any[]) => anchors.map((a: any) => String(a.href || a.getAttribute('href') || '')));
    const cleanLinks = allLinks.filter((u) => typeof u === 'string' && u.length);
    const followPatterns = Array.isArray(patterns.follow) ? patterns.follow : [];
    const excludePatterns = Array.isArray(patterns.exclude) ? patterns.exclude : [];
    const articlePatterns = Array.isArray((site as any)?.config?.classification?.article_patterns)
      ? (site as any).config.classification.article_patterns as string[]
      : [];
    console.log('url-collector:site:links', { urls_found: cleanLinks.length, follow_patterns_count: followPatterns.length, exclude_patterns_count: excludePatterns.length });
    const matched: string[] = [];
    for (const u of cleanLinks) {
      const include = followPatterns.some((p) => matchesPattern(u, p));
      const exclude = excludePatterns.some((p) => matchesPattern(u, p));
      if (include && !exclude) matched.push(u);
    }
    console.log('url-collector:site:matched', { matched_count: matched.length });

    const limited = matched.slice(0, Math.max(1, Number(limits.max_links_on_page || 100)));
    const collected: string[] = [];
    let duplicatesSkipped = 0;
    let spawnedScrape = 0;
    let spawnedCollect = 0;
    let articleUrls = 0;
    let indexUrls = 0;
    for (const u of limited) {
      const exists = config.duplicate_prevention?.check_url ? await db.articleExists(u) : false;
      if (exists) {
        duplicatesSkipped++;
        continue;
      }
      const isArticle = articlePatterns.some((p) => matchesPattern(u, p));
      if (isArticle) {
        articleUrls++;
        collected.push(u);
        if (asWorker) {
          const createScrape = params.collection_type !== 'index_only' && (config?.job_spawning?.create_scrape_jobs ?? true);
          if (createScrape) {
            const id = createHash('sha1').update(`scraping:${u}`).digest('hex');
            await queue.publish({ id, type: 'scraping', url: u, site_id: site.id, priority: 5 });
            spawnedScrape++;
          }
        }
      } else {
        indexUrls++;
        if (asWorker) {
          const createCollect = (config?.job_spawning?.create_collection_jobs ?? true);
          if (createCollect) {
            const id = createHash('sha1').update(`url_collection:${u}`).digest('hex');
            await queue.publish({ id, type: 'url_collection', url: u, site_id: site.id, priority: 1 });
            spawnedCollect++;
          }
        }
      }
    }

    console.log('url-collector:site:result', { site_id: site?.id, urls_found: cleanLinks.length, matched: matched.length, article_urls: articleUrls, index_urls: indexUrls, collected: collected.length, duplicates_skipped: duplicatesSkipped, spawned_scrape_jobs: spawnedScrape, spawned_collect_jobs: spawnedCollect });
    return {
      success: true,
      site: site.name,
      urls_found: cleanLinks.length,
      urls_matched: matched.length,
      found_urls: limited,
      article_urls: articleUrls,
      index_urls: indexUrls,
      urls_collected: collected.length,
      collected_urls: collected,
      duplicates_skipped: duplicatesSkipped,
      spawned_scrape_jobs: spawnedScrape,
      spawned_collect_jobs: spawnedCollect
    };
  } catch (error) {
    console.error('url-collector:site:error', error instanceof Error ? error.message : String(error));
    try { const { notify } = await import('./notifier.js'); await notify('notify', { template: 'collection_failed', site_name: site?.name, url: params?.url || site?.base_url, error: error instanceof Error ? error.message : String(error) }, { enabled: true, provider: 'telegram' }); } catch {}
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    try { await page.close(); } catch {}
    try { if (browser) await browser.close(); } catch {}
  }
}

function matchesPattern(url: string, pattern: string): boolean {
  if (!pattern) return false;
  if (pattern.startsWith('regex:')) {
    const re = new RegExp(pattern.slice('regex:'.length));
    return re.test(url);
  }
  return url.includes(pattern);
}
