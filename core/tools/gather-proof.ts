// gather-proof.ts — standalone proof that Sapu's data moat works end-to-end.
//
// Reuses the REAL stealth browser (core/plugins/browser.ts), the REAL site
// configs (config/sites/*.json), and the REAL pure config resolvers
// (core/config.ts). It does NOT need Postgres / RabbitMQ — gathered articles
// are persisted to data/gathered-proof.jsonl so the moat is demonstrable on a
// bare machine. This is the "gather unique data across the internet" step.
//
// Run:  pnpm tsx core/tools/gather-proof.ts
//
// Why this exists: a plain `curl https://www.tempo.co` returns HTTP 403 (the
// site's anti-bot blocks non-browser clients). Sapu's puppeteer-extra + stealth
// + real per-site UA/viewport/language config is what gets through. This script
// makes that capability concrete and citable.

import { createHash } from 'crypto';
import { readdirSync, readFileSync, mkdirSync, appendFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { createPage } from '../plugins/browser.js';
import {
  resolvePageLoad,
  resolveWaitUntil,
  resolveClientContext,
  applyPageContext,
  resolveSelectors,
  resolvePatterns
} from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITES_DIR = join(__dirname, '../../config/sites');
const OUT_DIR = join(__dirname, '../../data');
const OUT_FILE = join(OUT_DIR, 'gathered-proof.jsonl');
const SUMMARY_FILE = join(OUT_DIR, 'gathered-proof-summary.json');

// ---- pattern matching, mirrored from core/plugins/url-collector.ts ----
type CompiledPattern = { regex?: RegExp; literal?: string };

function compilePatterns(patterns: string[]): CompiledPattern[] {
  return (patterns || []).map((p) => {
    if (!p) return { literal: '' };
    if (p.startsWith('regex:')) {
      try { return { regex: new RegExp(p.slice('regex:'.length)) }; } catch { return { literal: p }; }
    }
    return { literal: p };
  });
}

function patternMatches(url: string, p: CompiledPattern): boolean {
  if (p.regex) return p.regex.test(url);
  return !!p.literal && url.includes(p.literal);
}

interface Site {
  id: string;
  name: string;
  base_url: string;
  enabled: boolean;
  config: any;
}

// The ordered list of entry-point URLs to collect article links from for a site.
// Honours an optional `url_collection.seed_urls` array in the site config — this
// is how the moat targets a *section* (e.g. a site's finance/business desk)
// instead of its homepage, so the gathered corpus IS market intelligence rather
// than ambient homepage news. Without seed_urls the behaviour is unchanged
// (homepage, then the /indeks fallback), so this is a strict, backward-compatible
// refinement: it can only raise relevance, never lose articles a site had before.
function resolveSeeds(site: Site): string[] {
  const seeds: string[] = [];
  const configured = site.config?.url_collection?.seed_urls;
  if (Array.isArray(configured)) {
    for (const u of configured) {
      if (typeof u === 'string' && /^https?:\/\//.test(u)) seeds.push(u);
    }
  }
  // Always include the homepage as a backstop seed so a site never yields
  // fewer articles than before — finance sections can be JS-heavy/empty on a
  // cold render while the homepage reliably lists articles.
  seeds.push(site.base_url);
  return Array.from(new Set(seeds));
}

function loadSites(): Site[] {
  const files = readdirSync(SITES_DIR).filter((f) => f.endsWith('.json'));
  const sites: Site[] = [];
  for (const f of files) {
    try {
      const s = JSON.parse(readFileSync(join(SITES_DIR, f), 'utf8'));
      if (s && s.enabled && s.config?.url_collection?.enabled && s.base_url) sites.push(s);
    } catch (e: any) {
      console.warn(`skipping ${f}: ${e?.message || e}`);
    }
  }
  return sites;
}

const RUNTIME_CONFIG: any = {
  page_load: { use_shared_browser: true, timeout: 30000, protocol_timeout: 60000 }
};

async function collectArticleUrls(site: Site, targetUrl: string): Promise<string[]> {
  const { browser, page, isShared } = await createPage(RUNTIME_CONFIG);
  await applyPageContext(page, resolveClientContext(site, RUNTIME_CONFIG, 'url_collection'));
  try {
    const pl = resolvePageLoad(site, RUNTIME_CONFIG, 'url_collection');
    // cold-browser leniency for the one-shot proof: never shorter than 25s.
    // The moat (selectors, patterns, stealth, language config) is unchanged.
    const timeout = Math.max(pl.timeout || 25000, 25000);
    await page.goto(targetUrl, { waitUntil: resolveWaitUntil(site, RUNTIME_CONFIG, 'url_collection'), timeout });
    // small settle for lazy-loaded link lists
    try { await page.waitForSelector('a[href]', { timeout: 8000 }); } catch {}
    const links: string[] = await page.$$eval('a[href]', (as: any[]) =>
      as.map((a) => String(a.href || a.getAttribute('href') || '')).filter(Boolean));
    const { follow, exclude } = resolvePatterns(site, RUNTIME_CONFIG);
    const articleC = compilePatterns(site.config?.classification?.article_patterns || []);
    const followC = compilePatterns(follow);
    const excludeC = compilePatterns(exclude);
    const seen = new Set<string>();
    const rootUrls = new Set([site.base_url, site.base_url.replace(/\/$/, ''), site.base_url + '/']);
    const articleMatches: string[] = [];
    const followOnly: string[] = [];
    for (const u of links) {
      if (seen.has(u) || !/^https?:\/\//.test(u)) continue;
      seen.add(u);
      let pathName = '';
      try { pathName = new URL(u).pathname; } catch {}
      if (rootUrls.has(u) || pathName === '' || pathName === '/') continue; // never "scrape" a homepage
      const isArticle = articleC.some((p) => patternMatches(u, p));
      const isFollow = followC.some((p) => patternMatches(u, p));
      const isExcluded = excludeC.some((p) => patternMatches(u, p));
      if (isExcluded || (!isArticle && !isFollow)) continue;
      // prefer real article URLs over index/follow-only URLs (mirrors url-collector)
      if (isArticle) articleMatches.push(u); else followOnly.push(u);
    }
    return [...articleMatches, ...followOnly];
  } catch (e: any) {
    console.log(`  collect error on ${targetUrl}: ${e?.message || e}`);
    return [];
  } finally {
    try { await page.close(); } catch {}
    try { if (browser && !isShared) await browser.close(); } catch {}
  }
}

// Coerce a selector value (string | string[] | undefined) to a CSS string or
// null. resolveSelectors returns arrays (often empty []) for missing selectors,
// and an empty array is TRUTHY in JS — passing it to page.$() throws
// "selector.startsWith is not a function". This guard is what lets configs that
// only define e.g. title/content (not publish_time) scrape without crashing.
const selStr = (v: any): string | null =>
  Array.isArray(v) ? (v.length ? v.join(',') : null) : v ? String(v) : null;

async function scrapeArticle(site: Site, url: string) {
  const { browser, page, isShared } = await createPage(RUNTIME_CONFIG);
  await applyPageContext(page, resolveClientContext(site, RUNTIME_CONFIG, 'scraping'));
  try {
    const pl = resolvePageLoad(site, RUNTIME_CONFIG, 'scraping');
    const waitUntil = resolveWaitUntil(site, RUNTIME_CONFIG, 'scraping');
    const timeout = Math.max(pl.timeout || 25000, 25000); // cold-browser leniency
    try {
      await page.goto(url, { waitUntil, timeout });
    } catch (e: any) {
      // networkidle2 can hang on pages with persistent ad/analytics connections;
      // retry with domcontentloaded so we still extract the rendered article.
      console.log(`  scrape goto retry (${e?.message || e})`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    }
    const selectors = resolveSelectors(site, RUNTIME_CONFIG, url);

    // ---- title ----
    let title: string | null = null;
    const titleSel = selStr(selectors.title);
    if (titleSel) {
      const h = await page.$(titleSel);
      if (h) title = await page.evaluate((el: any) => el.textContent?.trim() || '', h);
    }
    if (!title) { try { title = await page.$eval('meta[property="og:title"]', (el: any) => el.getAttribute('content')?.trim() || ''); } catch {} }
    if (!title) { try { title = await page.title(); } catch {} }
    title = title ? String(title).trim() : null;
    if (title && !title.length) title = null;

    // ---- content ----
    let content: string | null = null;
    const contentSel = selStr(selectors.content);
    if (contentSel) {
      const h = await page.$(contentSel);
      if (h) content = await page.evaluate((el: any) => el.textContent?.trim() || '', h);
    }
    if (!content || content.length < 200) {
      const blocks: string = await page.evaluate(() => {
        // Broad fallback ladder for the article body. Covers common CMS/theme
        // containers (WordPress, Newspaper, proprietary) so JS-heavy SEA sites
        // (e.g. ABS-CBN, Nation Thailand) whose <article> is empty still yield
        // the real paragraphs.
        const sels = [
          'article p', '.article-content p', '.entry-content p',
          'div[itemprop="articleBody"] p', '.detail-text p', '.detail__body-text p',
          'main article p',
          '.article-body p', '.post-content p', '.post-body p',
          '.story-content p', '.news-body p', '.news-article p', '.content-body p',
          '.article__content p', '.article__body p', '.td-post-content p',
          '.node-content p', '.field-body p',
        ];
        const seen = new Set<string>(); const texts: string[] = [];
        for (const s of sels) for (const n of Array.from(document.querySelectorAll(s))) {
          const t = (n as any).textContent?.trim();
          if (t && !seen.has(t)) { seen.add(t); texts.push(t); }
        }
        return texts.join('\n');
      });
      if (blocks && blocks.length > (content?.length || 0)) content = blocks;
    }

    // ---- publish time ----
    let published: string | null = null;
    const timeSel = selStr(selectors.publish_time);
    if (timeSel) {
      const h = await page.$(timeSel);
      if (h) published = await page.evaluate((el: any) => el.textContent?.trim() || el.getAttribute('datetime') || el.getAttribute('content') || '', h);
    }
    if (!published) { try { published = await page.$eval('meta[property="article:published_time"]', (el: any) => el.getAttribute('content')?.trim() || ''); } catch {} }
    published = published ? String(published).trim() : null;
    if (published && !published.length) published = null;

    return {
      title,
      content: content ? String(content).trim() : null,
      content_length: content ? content.length : 0,
      published
    };
  } finally {
    try { await page.close(); } catch {}
    try { if (browser && !isShared) await browser.close(); } catch {}
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, '');

  const all = loadSites();
  console.log(`enabled sites with url_collection: ${all.length}`);

  // Use every enabled source — proves the full SEA breadth of the moat, not just ID.
  const list = all.slice(0, Number(process.env.PROOF_SITES || all.length));
  console.log(`sites selected: ${list.map((s) => s.name).join(', ')}\n`);

  const results: any[] = [];
  for (const site of list) {
    console.log(`=== ${site.name} (${site.base_url}) ===`);
    // Build the entry-point ladder: configured seed URLs (e.g. the finance
    // section) first, then the homepage backstop, then the /indeks index page
    // many ID sites expose. The first seed that yields article candidates wins —
    // so a finance section that renders cleanly preempts the homepage, while an
    // empty/JS-only section transparently falls through to the homepage.
    const seedLadder: string[] = resolveSeeds(site);
    const idx = site.base_url.replace(/\/$/, '') + '/indeks';
    if (!seedLadder.includes(idx)) seedLadder.push(idx);
    let candidates: string[] = [];
    let seedUsed: string | null = null;
    for (const seed of seedLadder) {
      try {
        const found = await collectArticleUrls(site, seed);
        if (found.length) {
          candidates = found;
          seedUsed = seed;
          console.log(`  collected ${found.length} candidates from seed: ${seed}`);
          break;
        }
        console.log(`  seed ${seed} → no candidates`);
      } catch (e: any) {
        console.log(`  collect error on ${seed}: ${e?.message || e}`);
      }
    }
    console.log(`  article candidates: ${candidates.length}` + (seedUsed ? ` (via ${seedUsed})` : ''));
    if (!candidates.length) {
      results.push({ site: site.name, base_url: site.base_url, status: 'no_candidates' });
      continue;
    }
    // Gather multiple articles per source (PROOF_PER_SITE, default 3) so the
    // corpus scales in volume per market — not just one headline per site. This
    // turns the one-shot "the moat works" proof into a "the moat compounds" proof.
    const perSite = Math.max(1, Number(process.env.PROOF_PER_SITE || 3));
    const targets = candidates.slice(0, perSite);
    let gatheredHere = 0;
    for (const url of targets) {
      console.log(`  scraping (${gatheredHere + 1}/${targets.length}): ${url}`);
      try {
        const art = await scrapeArticle(site, url);
        if (art.title && art.content_length >= 200) {
          const rec = {
            site: site.name,
            site_id: site.id,
            base_url: site.base_url,
            seed: seedUsed,
            url,
            gathered_at: new Date().toISOString(),
            title: art.title,
            published: art.published,
            content_length: art.content_length,
            content: art.content,
            title_hash: createHash('sha256').update(art.title).digest('hex'),
            content_hash: createHash('sha256').update(art.content || '').digest('hex')
          };
          appendFileSync(OUT_FILE, JSON.stringify(rec) + '\n');
          gatheredHere++;
          results.push({ site: site.name, base_url: site.base_url, status: 'success', seed: seedUsed, url, title: art.title, published: art.published, content_length: art.content_length });
          console.log(`  OK — "${art.title.slice(0, 90)}" (${art.content_length} chars)${art.published ? ' @ ' + art.published : ''}`);
        } else {
          results.push({ site: site.name, base_url: site.base_url, status: 'thin_content', url, title: art.title, content_length: art.content_length });
          console.log(`  thin content (${art.content_length} chars) — title: ${art.title || '<none>'}`);
        }
      } catch (e: any) {
        results.push({ site: site.name, base_url: site.base_url, status: 'error', url, error: e?.message || String(e) });
        console.log(`  scrape error: ${e?.message || e}`);
      }
    }
  }

  const successes = results.filter((r) => r.status === 'success').length;
  const sourcesWithArticles = new Set(results.filter((r) => r.status === 'success').map((r) => r.site)).size;
  const summary = {
    generated_at: new Date().toISOString(),
    provenance: 'gather-proof.ts — reuses Sapu real stealth engine (core/plugins/browser.ts) + real site configs (config/sites/*.json) + pure resolvers (core/config.ts); no Postgres/RabbitMQ',
    sites_attempted: list.length,
    sources_with_articles: sourcesWithArticles,
    articles_gathered: successes,
    successes,
    failures: list.length - sourcesWithArticles,
    artifacts: { articles_jsonl: OUT_FILE, summary_json: SUMMARY_FILE },
    results
  };
  writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));
  console.log(`\n=== SUMMARY ===`);
  console.log(JSON.stringify(summary, null, 2));

  // best-effort browser cleanup
  try { const { getBrowser } = await import('../plugins/browser.js'); const b = await getBrowser(RUNTIME_CONFIG); try { await b.close(); } catch {} } catch {}
  setTimeout(() => process.exit(0), 1500);
}

main().catch((e) => { console.error('fatal:', e); process.exit(1); });
