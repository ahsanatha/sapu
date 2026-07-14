import crypto from 'node:crypto';

import { createPage } from './plugins/browser.js';

export type X402ToolMode = 'http' | 'browser';

export interface FetchOptions {
  url: string;
  timeoutMs?: number;
  userAgent?: string;
  mode?: X402ToolMode;
}

export interface PriceEstimate {
  endpoint: string;
  priceUsd: number;
  estimatedCostUsd: number;
  grossMarginPct: number;
  assumptions: string[];
}

const DEFAULT_UA =
  'Mozilla/5.0 (compatible; SapuX402/0.1; +https://rekursa.id)';

const MAX_HTTP_BYTES = Math.max(64_000, Number(process.env.X402_MAX_HTTP_BYTES ?? 1_500_000));
const HTTP_TIMEOUT_MS = Math.max(1000, Number(process.env.X402_HTTP_TIMEOUT_MS ?? 8000));
const BROWSER_TIMEOUT_MS = Math.max(3000, Number(process.env.X402_BROWSER_TIMEOUT_MS ?? 20_000));

export function assertPublicHttpUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    throw new Error('Invalid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP/HTTPS URLs are allowed');
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(host) ||
    host === 'metadata.google.internal'
  ) {
    throw new Error('Private/reserved network addresses are not allowed');
  }
  return parsed;
}

export function sha256(value: string | Buffer): string {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

export function classifyUrl(rawUrl: string): any {
  const u = assertPublicHttpUrl(rawUrl);
  const path = u.pathname.toLowerCase();
  const host = u.hostname.toLowerCase();
  const ext = path.split('.').pop() || '';
  const signals: string[] = [];
  let kind = 'web_page';

  if (/\.(pdf)$/.test(path)) {
    kind = 'pdf';
    signals.push('pdf_extension');
  } else if (/\.(csv|tsv|xlsx|xls|json|xml)$/.test(path)) {
    kind = 'data_file';
    signals.push(`data_extension:${ext}`);
  } else if (/\/(api|v1|v2|graphql)\b/.test(path)) {
    kind = 'api_endpoint';
    signals.push('api_path');
  } else if (/(news|article|blog|posts?|story|berita|read)\b/.test(path)) {
    kind = 'article_candidate';
    signals.push('article_path_keyword');
  } else if (/(search|tag|category|archive|indeks|index)\b/.test(path)) {
    kind = 'listing_candidate';
    signals.push('listing_path_keyword');
  }

  if (host.includes('github.com')) signals.push('github');
  if (host.includes('linkedin.com')) signals.push('linkedin');
  if (host.includes('x.com') || host.includes('twitter.com')) signals.push('social');

  return {
    url: u.toString(),
    host,
    path: u.pathname,
    kind,
    signals,
    retrievedAt: new Date().toISOString(),
  };
}

function stripTags(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(html: string): string | null {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (og?.[1]) return og[1].trim();
  const tw = html.match(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i);
  if (tw?.[1]) return tw[1].trim();
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return title?.[1] ? stripTags(title[1]).slice(0, 300) : null;
}

function extractDescription(html: string): string | null {
  const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  return desc?.[1] ? desc[1].trim().slice(0, 1000) : null;
}

function extractLinks(html: string, baseUrl: string, maxLinks = 100): any[] {
  const out: any[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < maxLinks) {
    try {
      const href = new URL(m[1], baseUrl).toString();
      if (seen.has(href)) continue;
      seen.add(href);
      out.push({ url: href, text: stripTags(m[2]).slice(0, 300) });
    } catch {}
  }
  return out;
}

function extractArticleText(html: string): string {
  const articleMatch = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch?.[1]) return stripTags(articleMatch[1]).slice(0, 80_000);

  const paragraphs = Array.from(html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
    .map((m) => stripTags(m[1]))
    .filter((p) => p.length >= 30);
  if (paragraphs.length) return paragraphs.join('\n\n').slice(0, 80_000);
  return stripTags(html).slice(0, 80_000);
}

export async function fetchHttp(options: FetchOptions): Promise<any> {
  const u = assertPublicHttpUrl(options.url);
  const timeoutMs = Math.min(Math.max(1000, options.timeoutMs ?? HTTP_TIMEOUT_MS), 20_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const res = await fetch(u, {
      signal: controller.signal,
      headers: {
        'user-agent': options.userAgent || DEFAULT_UA,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
      },
      redirect: 'follow',
    });
    const arrayBuffer = await res.arrayBuffer();
    const raw = Buffer.from(arrayBuffer);
    const truncated = raw.byteLength > MAX_HTTP_BYTES;
    const body = raw.subarray(0, MAX_HTTP_BYTES).toString('utf8');
    return {
      ok: res.ok,
      backend: 'http',
      url: u.toString(),
      finalUrl: res.url,
      status: res.status,
      contentType: res.headers.get('content-type') || '',
      bytes: raw.byteLength,
      truncated,
      elapsedMs: Date.now() - startedAt,
      contentHash: sha256(body),
      body,
      retrievedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function extractArticle(options: FetchOptions): Promise<any> {
  const fetched = options.mode === 'browser'
    ? await fetchBrowser(options)
    : await fetchHttp(options);
  const html = String(fetched.html || fetched.body || '');
  return {
    ok: fetched.ok !== false,
    backend: fetched.backend,
    url: fetched.url,
    finalUrl: fetched.finalUrl || fetched.url,
    status: fetched.status,
    title: extractTitle(html),
    description: extractDescription(html),
    text: extractArticleText(html),
    links: extractLinks(html, fetched.finalUrl || fetched.url, 25),
    contentHash: sha256(html),
    elapsedMs: fetched.elapsedMs,
    retrievedAt: new Date().toISOString(),
  };
}

export async function extractLinksTool(options: FetchOptions): Promise<any> {
  const fetched = await fetchHttp(options);
  return {
    ok: fetched.ok,
    backend: fetched.backend,
    url: fetched.url,
    finalUrl: fetched.finalUrl,
    status: fetched.status,
    links: extractLinks(fetched.body || '', fetched.finalUrl || fetched.url, 200),
    contentHash: fetched.contentHash,
    elapsedMs: fetched.elapsedMs,
    retrievedAt: new Date().toISOString(),
  };
}

export async function fetchBrowser(options: FetchOptions): Promise<any> {
  const u = assertPublicHttpUrl(options.url);
  const timeoutMs = Math.min(Math.max(3000, options.timeoutMs ?? BROWSER_TIMEOUT_MS), 45_000);
  const backend = process.env.SAPU_BROWSER_BACKEND || 'local-puppeteer';
  // Cloudflare Browser Run can be wired here when credentials/REST shape are finalized.
  // The public API remains stable: backend reports whether this used Cloudflare or local fallback.
  const startedAt = Date.now();
  const { browser, page, isShared } = await createPage({
    page_load: {
      timeout: timeoutMs,
      protocol_timeout: timeoutMs + 5000,
      use_shared_browser: true,
      headless: true,
    },
  });
  try {
    await page.setUserAgent(options.userAgent || DEFAULT_UA);
    await page.goto(u.toString(), { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const html = await page.content();
    const title = await page.title().catch(() => null);
    return {
      ok: true,
      backend,
      url: u.toString(),
      finalUrl: page.url(),
      status: null,
      title,
      html,
      contentHash: sha256(html),
      elapsedMs: Date.now() - startedAt,
      retrievedAt: new Date().toISOString(),
    };
  } finally {
    try { await page.close(); } catch {}
    try { if (browser && !isShared) await browser.close(); } catch {}
  }
}

export function estimateCost(endpoint: string, params: any = {}): PriceEstimate {
  const seconds = Math.max(1, Number(params.seconds ?? 8));
  const browserHourCost = Number(process.env.CLOUDFLARE_BROWSER_HOUR_COST_USD ?? 0.09);
  const map: Record<string, { price: number; cost: number; assumptions: string[] }> = {
    'classify-url': {
      price: 0.001,
      cost: 0.00005,
      assumptions: ['CPU-only URL classification', 'no network fetch'],
    },
    'extract-links': {
      price: 0.003,
      cost: 0.0005,
      assumptions: ['single HTTP fetch', 'bounded response bytes', 'no browser'],
    },
    'extract-article': {
      price: 0.005,
      cost: 0.001,
      assumptions: ['single HTTP fetch + parser', 'browser fallback not included'],
    },
    'extract-article-browser': {
      price: 0.018,
      cost: (seconds / 3600) * browserHourCost + 0.001,
      assumptions: [`${seconds}s browser duration`, 'browser-rendered article extraction', `$${browserHourCost}/browser-hour`, 'storage/proxy excluded'],
    },
    'fetch-browser': {
      price: 0.015,
      cost: (seconds / 3600) * browserHourCost + 0.0003,
      assumptions: [`${seconds}s browser duration`, `$${browserHourCost}/browser-hour`, 'storage/proxy excluded'],
    },
  };
  const e = map[endpoint] || map['extract-article'];
  const margin = e.price > 0 ? ((e.price - e.cost) / e.price) * 100 : 0;
  return {
    endpoint,
    priceUsd: Number(e.price.toFixed(6)),
    estimatedCostUsd: Number(e.cost.toFixed(6)),
    grossMarginPct: Number(margin.toFixed(2)),
    assumptions: e.assumptions,
  };
}
