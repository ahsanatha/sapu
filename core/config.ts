// Shared config resolver utilities to avoid duplication across plugins
import type { Site, WaitUntil, ScrapingSelectors } from './types.js';

type ClientContext = {
  user_agent?: string;
  http_headers?: Record<string, string>;
  accept_language?: string;
  navigator_language?: string;
  navigator_languages?: string[];
  timezone?: string;
  viewport?: { width: number; height: number; deviceScaleFactor?: number; isMobile?: boolean };
};

export function resolvePageLoad(site: Site, global: any, kind: 'scraping' | 'url_collection') {
  const sc = site?.config?.scraping || {};
  const uc = site?.config?.url_collection || {};
  const local = (kind === 'scraping' ? sc.page_load : uc.page_load) || {};
  const timeout = local.timeout ?? (kind === 'scraping' ? sc.timeout : undefined) ?? global?.page_load?.timeout ?? global?.timeout ?? 30000;
  const protocol_timeout = local.protocol_timeout ?? global?.page_load?.protocol_timeout ?? timeout;
  const wait_until = local.wait_until ?? global?.page_load?.wait_until ?? (kind === 'scraping' ? 'domcontentloaded' : undefined);
  return { timeout, protocol_timeout, wait_until } as { timeout: number; protocol_timeout: number; wait_until?: WaitUntil };
}

export function resolveWaitUntil(site: Site, global: any, kind: 'scraping' | 'url_collection'): WaitUntil {
  const pl = resolvePageLoad(site, global, kind);
  const wu = pl.wait_until as any;
  if (!wu) {
    if (kind === 'url_collection') {
      throw new Error('Missing required SiteConfig: url_collection.page_load.wait_until');
    }
    return 'domcontentloaded';
  }
  const allowed: WaitUntil[] = ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'];
  if (!allowed.includes(wu)) {
    throw new Error(`Invalid wait_until value: ${String(wu)}`);
  }
  return wu;
}

export function resolveClientContext(site: Site, global: any, kind: 'scraping' | 'url_collection'): ClientContext {
  const sc = site?.config?.scraping || {};
  const uc = site?.config?.url_collection || {};
  const ctx: ClientContext = {
    user_agent: (kind === 'url_collection' ? uc.user_agent : sc.user_agent) || global?.user_agent,
    http_headers: {
      ...(global?.http_headers || {}),
      ...((kind === 'url_collection' ? uc.http_headers : sc.http_headers) || {})
    },
    accept_language: (kind === 'url_collection' ? uc.accept_language : sc.accept_language) || global?.accept_language,
    navigator_language: (kind === 'url_collection' ? uc.navigator_language : sc.navigator_language) || global?.navigator_language,
    navigator_languages: (kind === 'url_collection' ? uc.navigator_languages : sc.navigator_languages) || global?.navigator_languages,
    timezone: (kind === 'url_collection' ? uc.timezone : sc.timezone) || global?.timezone,
    viewport: (kind === 'url_collection' ? uc.viewport : sc.viewport) || global?.viewport
  };
  return ctx;
}

export async function applyPageContext(page: any, ctx: ClientContext): Promise<void> {
  try {
    if (ctx.user_agent) {
      await page.setUserAgent(ctx.user_agent);
    }
    const headers: Record<string, string> = { ...(ctx.http_headers || {}) };
    if (ctx.accept_language && !headers['Accept-Language']) {
      headers['Accept-Language'] = ctx.accept_language;
    }
    if (Object.keys(headers).length > 0) {
      await page.setExtraHTTPHeaders(headers);
    }
    const navigatorLanguage = ctx.navigator_language;
    const navigatorLanguages = ctx.navigator_languages;
    if (navigatorLanguage || navigatorLanguages) {
      const lang = JSON.stringify(navigatorLanguage || 'en-US');
      const langs = JSON.stringify(navigatorLanguages || ['en-US', 'en']);
      await page.evaluateOnNewDocument(`
        try {
          Object.defineProperty(navigator, 'language', { get: () => ${lang} });
          Object.defineProperty(navigator, 'languages', { get: () => ${langs} });
        } catch {}
      `);
    }
    if (ctx.timezone) {
      try { await page.emulateTimezone(ctx.timezone); } catch {}
    }
    if (ctx.viewport && typeof page.setViewport === 'function') {
      try { await page.setViewport(ctx.viewport); } catch {}
    }
  } catch {}
}

export function resolveSelectors(site: Site, global: any, effectiveUrl?: string): Required<ScrapingSelectors> {
  const base = (site?.config?.scraping?.selectors || global?.selectors || {}) as ScrapingSelectors;
  let selectors: ScrapingSelectors = { ...base };
  try {
    const host = effectiveUrl ? new URL(effectiveUrl).hostname.replace(/^www\./, '') : undefined;
    const hostMap = site?.config?.scraping?.selectors_by_host || global?.selectors_by_host || {};
    if (host && hostMap && hostMap[host]) {
      selectors = { ...base, ...hostMap[host] };
    }
  } catch {}
  return {
    links: selectors.links || 'a[href]',
    title: selectors.title || [],
    content: selectors.content || [],
    publish_time: selectors.publish_time || []
  };
}

export function resolvePatterns(site: Site, global: any) {
  const sc = site?.config?.scraping || {};
  const cls = site?.config?.classification || {};
  const follow = [
    ...((sc.follow_patterns || []) as string[]),
    ...((cls.article_patterns || []) as string[]),
    ...((global?.follow_patterns || []) as string[])
  ];
  const exclude = [
    ...((sc.exclude_patterns || []) as string[]),
    ...((global?.exclude_patterns || []) as string[])
  ];
  return { follow, exclude };
}

export function resolveLimits(site: Site, _global: any) {
  const uc = site?.config?.url_collection || {};
  return {
    max_links_on_page: Math.max(1, Number(uc.max_links_on_page ?? 100) || 100),
    max_urls_per_run: Math.max(0, Number(uc.max_urls_per_run ?? 50) || 50),
    max_found_urls: Math.max(0, Number(uc.max_found_urls ?? 300) || 300),
    max_collected_urls: Math.max(0, Number(uc.max_collected_urls ?? 200) || 200),
    max_index_pages_per_run: Math.max(1, Number(uc.max_index_pages_per_run ?? 5) || 5),
    max_depth: Math.max(0, Number(uc.max_depth ?? 0) || 0)
  };
}
