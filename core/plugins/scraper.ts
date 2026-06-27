import { createHash } from 'crypto';

import { db } from '../database.js';
import type { Site } from '../types.js';
import { resolvePageLoad, resolveWaitUntil, resolveClientContext, applyPageContext, resolveSelectors } from '../config.js';

import { collectUrls } from './url-collector.js';
import { notify } from './notifier.js';
import { getBrowser, createPage } from './browser.js';

export async function scrape(action: string, params: any, config: any): Promise<any> {
  switch (action) {
    case 'scrape':
      return performScraping(params, config);
    case 'get_html':
      return getPageHtml(params, config);
    default:
      throw new Error(`Unknown scraper action: ${action}`);
  }
}

async function getPageHtml(params: any, config: any): Promise<any> {
  const site: Site = params.site;
  const url: string = params.url;
  const pl = resolvePageLoad(site, config, 'scraping');
  const waitUntil = resolveWaitUntil(site, config, 'scraping');
  const ctx = resolveClientContext(site, config, 'scraping');
  const { browser, page } = await createPage({ ...config, page_load: { ...config.page_load, protocol_timeout: pl.protocol_timeout } });
  await applyPageContext(page, ctx);
  try {
    await page.goto(url, { waitUntil, timeout: pl.timeout });
    const html = await page.content();
    return { success: true, html };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    try { await page.close(); } catch {}
    try { if (browser) await browser.close(); } catch {}
  }
}

async function performScraping(params: any, config: any): Promise<any> {
  const site: Site = params.site;
  const url: string = params.url;
  const pl = resolvePageLoad(site, config, 'scraping');
  const waitUntil = resolveWaitUntil(site, config, 'scraping');
  const ctx = resolveClientContext(site, config, 'scraping');
  const selectors = resolveSelectors(site, config, url);

  const { browser, page } = await createPage({ ...config, page_load: { ...config.page_load, protocol_timeout: pl.protocol_timeout } });
  await applyPageContext(page, ctx);
  try {
    if (params.check_duplicates) {
      const dup = await db.articleExists(url);
      if (dup) {
        try { await notify('notify', { template: 'scrape_failed', site_name: site.name, url, error: 'duplicate_url' }, { enabled: true, provider: 'telegram' }); } catch {}
        return { success: false, skipped: true, reason: 'duplicate_url', url };
      }
    }
    await page.goto(url, { waitUntil, timeout: pl.timeout });

    const titleSel = Array.isArray(selectors.title) ? selectors.title.join(',') : selectors.title;
    const contentSel = Array.isArray(selectors.content) ? selectors.content.join(',') : selectors.content;
    const titleHandle = titleSel ? await page.$(titleSel) : null;
    const contentHandle = contentSel ? await page.$(contentSel) : null;
    let title = titleHandle ? await page.evaluate((el: any) => el.textContent?.trim(), titleHandle) : null;
    let content = contentHandle ? await page.evaluate((el: any) => el.textContent?.trim(), contentHandle) : null;
    if (!title) {
      try { title = await page.$eval('meta[property="og:title"]', (el: any) => el.getAttribute('content')?.trim() || ''); } catch {}
      if (!title) {
        try { title = await page.$eval('meta[name="twitter:title"]', (el: any) => el.getAttribute('content')?.trim() || ''); } catch {}
        if (!title) {
          try { title = await page.title(); } catch {}
        }
      }
      if (title) title = String(title || '').trim();
      if (!title?.length) title = null;
    }
    if (!content || content.length < 200) {
      try {
        const blocks = await page.evaluate(() => {
          const sels = [
            'article p',
            '.article-content p',
            '.entry-content p',
            '.c-article__content p',
            'main article p',
            'main .content p',
            'div[itemprop="articleBody"] p',
            '.detail-text p',
            '.detail__text p',
            '.detail__content p'
          ];
          const seen = new Set();
          const texts: string[] = [];
          for (const s of sels) {
            const nodes = Array.from(document.querySelectorAll(s));
            for (const n of nodes) {
              const t = (n as any).textContent?.trim();
              if (t && !seen.has(t)) { seen.add(t); texts.push(t); }
            }
          }
          return texts.join('\n');
        });
        const desc = await page.$eval('meta[name="description"]', (el: any) => el.getAttribute('content')?.trim() || '' ).catch(() => '');
        const combined = [blocks || '', desc || ''].join('\n').trim();
        if (combined.length > (content?.length || 0)) content = combined;
      } catch {}
      if (!content || content.length < 200) {
        try {
          await page.waitForFunction(() => {
            const nodes = document.querySelectorAll('article p, .article-content p, .entry-content p, .c-article__content p, div[itemprop="articleBody"] p');
            let len = 0;
            nodes.forEach((n) => { const t = (n as any).textContent || ''; len += t.trim().length; });
            return len >= 500;
          }, { timeout: Math.min(pl.timeout / 3, 8000) });
          const more = await page.evaluate(() => {
            const sels = [
              'article p',
              '.article-content p',
              '.entry-content p',
              '.c-article__content p',
              'div[itemprop="articleBody"] p'
            ];
            const seen = new Set();
            const texts: string[] = [];
            for (const s of sels) {
              const nodes = Array.from(document.querySelectorAll(s));
              for (const n of nodes) {
                const t = (n as any).textContent?.trim();
                if (t && !seen.has(t)) { seen.add(t); texts.push(t); }
              }
            }
            return texts.join('\n');
          });
          if (more && more.length > (content?.length || 0)) content = more;
        } catch {}
      }
    }

    const titleHash = title ? createHash('sha256').update(title).digest('hex') : null;
    const contentHash = content ? createHash('sha256').update(content).digest('hex') : null;

    if (!title || !content) {
      try { await notify('notify', { template: 'scrape_failed', site_name: site.name, url, error: 'missing_title_or_content' }, { enabled: true, provider: 'telegram' }); } catch {}
      return { success: false, skipped: true, reason: 'missing_title_or_content', url };
    }

    const articleId = await db.saveArticle({
      site_id: site.id,
      url,
      title,
      title_hash: titleHash || undefined,
      content,
      content_hash: contentHash || undefined,
      metadata: { site: site.name }
    });
    if (!articleId) {
      try { await notify('notify', { template: 'scrape_failed', site_name: site.name, url, error: 'insert_conflict_or_failed' }, { enabled: true, provider: 'telegram' }); } catch {}
      return { success: false, skipped: true, reason: 'insert_conflict_or_failed', url, title, content_length: content.length };
    }
    return { success: true, article_id: articleId, url, title, content_length: content.length };
  } catch (error) {
    try { await notify('notify', { template: 'scrape_failed', site_name: site.name, url, error: error instanceof Error ? error.message : String(error) }, { enabled: true, provider: 'telegram' }); } catch {}
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    try { await page.close(); } catch {}
    try { if (browser) await browser.close(); } catch {}
  }
}
