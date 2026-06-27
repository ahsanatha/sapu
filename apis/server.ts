// Sapu API Server
// Basic CRUD endpoints for configuration management
// Target: 100 lines

import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import express, { Express } from 'express';

import { db } from '../core/database.js';
import { queue, getPrefetchMap, isQueueConnected } from '../core/queue.js';
// Engine runs in worker process; server should not import engine for execution
import { subscribe, publish } from '../core/events.js';
import { executeProcessor } from '../core/plugins/index.js';
import { listSites, getSite as getSiteFromFiles, findSiteByUrlHost } from '../core/sites.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Express = express();
app.use(express.json());
// Disable ETag for API responses to avoid 304 on dynamic data
app.set('etag', false);

const clean = (s?: string) => String(s || '').trim().replace(/^['"`]+|['"`]+$/g, '');
const ADMIN_PASSWORD = clean(process.env.ADMIN_PASSWORD || process.env.VITE_ADMIN_PASSWORD || '');
const ADMIN_PASSWORD_MISSING = !ADMIN_PASSWORD;
const MAX_SKEW_MS = Math.max(30000, Number(process.env.ADMIN_AUTH_MAX_SKEW_MS ?? 300000)); // default 5 minutes
function requireAdmin(req: any, res: any, next: any) {
  try {
    if (ADMIN_PASSWORD_MISSING) {
      return res.status(503).json({ error: 'ADMIN_PASSWORD is not configured on the server' });
    }
    const tsHeader = String(req.headers['x-admin-ts'] || req.query.ts || '');
    const sigHeader = String(req.headers['x-admin-auth'] || req.query.sig || '');

    const now = Date.now();
    const ts = Number(tsHeader);
    if (!ts || Math.abs(now - ts) > MAX_SKEW_MS) {
      return res.status(401).json({ error: 'invalid admin credentials' });
    }

    const method = (req.method || 'GET').toUpperCase();
    const pathOnly = String(req.path || req.url || '/');
    const msg = `${ts}:${method}:${pathOnly}`;
    const h = crypto.createHmac('sha256', ADMIN_PASSWORD).update(msg).digest('hex');
    if (h !== sigHeader) {
      return res.status(401).json({ error: 'invalid admin credentials' });
    }
    return next();
  } catch {
    return res.status(401).json({ error: 'invalid admin credentials' });
  }
}

const PUBLIC_DIR = fs.existsSync(path.join(__dirname, '../public/index.html'))
  ? path.join(__dirname, '../public')
  : path.join(__dirname, '../../public');
const ADMIN_DIR = path.join(PUBLIC_DIR, 'admin');

app.use(express.static(PUBLIC_DIR));
app.use((req: any, res: any, next: any) => {
  try {
    const allowOrigin = String(process.env.CORS_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-auth, x-admin-ts');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  } catch {}
  next();
});
app.use('/admin', express.static(ADMIN_DIR));

const workerHeartbeats = new Map<string, { ts: number; data: any }>();
const HEARTBEAT_TTL_MS = Math.max(10000, Number(process.env.HEARTBEAT_TTL_MS ?? 30000));

const getWorkersInfo = async () => {
  try {
    const autoscalers = await db.getProcessors('autoscaler', true);
    const cfg = autoscalers[0]?.config || {};
    const prefetchMapLocal = getPrefetchMap();
    const now = Date.now();
    const activeWorkers: any[] = [];
    const aggPrefetch: Record<string, number> = {};
    for (const [id, rec] of workerHeartbeats) {
      if ((now - rec.ts) > HEARTBEAT_TTL_MS) continue;
      activeWorkers.push(id);
      const pm = (rec.data?.prefetch) || {};
      for (const k of Object.keys(pm)) {
        aggPrefetch[k] = (aggPrefetch[k] || 0) + Number(pm[k] || 0);
      }
    }
    const scrapingInfo = await queue.getQueueInfo('scraping');
    const urlInfo = await queue.getQueueInfo('url_collection');
    const backlog = (scrapingInfo?.messageCount ?? 0) + (urlInfo?.messageCount ?? 0);
    const currentWorkers = activeWorkers.length || Object.values(prefetchMapLocal).reduce((sum, n) => sum + (Number(n) || 0), 0);
    const targetWorkers = Math.min(
      (cfg.max_workers ?? currentWorkers),
      Math.max((cfg.min_workers ?? currentWorkers), currentWorkers)
    );
    return {
      enabled: !!autoscalers?.length,
      current: currentWorkers,
      target: targetWorkers,
      backlog,
      prefetch: Object.keys(aggPrefetch).length ? aggPrefetch : prefetchMapLocal,
      queues: {
        scraping: scrapingInfo ?? { messageCount: 0, consumerCount: 0 },
        url_collection: urlInfo ?? { messageCount: 0, consumerCount: 0 }
      },
      config: {
        min_workers: cfg.min_workers ?? 1,
        max_workers: cfg.max_workers ?? 1,
        threshold: cfg.scale_up_threshold ?? 0
      },
      active_ids: activeWorkers
    };
  } catch {
    return { enabled: false, current: 0, target: 0 };
  }
};

// Ensure DB-backed dedup table exists even when server runs standalone
(async () => { try { await db.ensureScheduledIndexTables(); } catch (e) { console.warn('scheduled_index ensure failed:', e instanceof Error ? e.message : String(e)); } })();

// Configuration UI route (clean URL without .html)
app.get('/config', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Monitoring UI route (clean URL without .html)
app.get('/monitoring', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// SPA fallback for non-API routes
app.get('*', (req, res, next) => {
  const p = req.path || '';
  if (p.startsWith('/api')) return next();
  if (p === '/health') return next();
  if (p.startsWith('/admin')) {
    return res.sendFile(path.join(ADMIN_DIR, 'index.html'));
  }
  if (/\.[^/]+$/.test(p)) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Configuration endpoints
app.get('/api/configurations', requireAdmin, async (req, res) => {
  try {
    const category = req.query.category as string;
    const configs = await db.getConfigurations(category);
    try { console.log(`[api] /configurations category=${category ?? ''} count=${configs.length}`); } catch {}
    res.json(configs);
  } catch (error) {
    try { console.error('[api] /configurations error:', error instanceof Error ? error.message : String(error)); } catch {}
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/api/configurations/:key', requireAdmin, async (req, res) => {
  try {
    const config = await db.getConfiguration(req.params.key);
    if (!config) {
      return res.status(404).json({ error: 'Configuration not found' });
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/configurations', requireAdmin, async (req, res) => {
  try {
    await db.setConfiguration(req.body.key, req.body.value, req.body.category, req.body.description);
    res.json({ created: true, key: req.body.key });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.put('/api/configurations/:key', requireAdmin, async (req, res) => {
  try {
    await db.setConfiguration(req.params.key, req.body.value, req.body.category, req.body.description);
    res.json({ updated: true, key: req.params.key });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.delete('/api/configurations/:key', requireAdmin, async (req, res) => {
  try {
    await db.deleteConfiguration(req.params.key);
    res.json({ deleted: true, key: req.params.key });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Processor endpoints
app.get('/api/processors', requireAdmin, async (req, res) => {
  try {
    const type = req.query.type as string;
    const enabled = req.query.enabled === 'true' ? true : req.query.enabled === 'false' ? false : undefined;
    const processors = await db.getProcessors(type, enabled);
    try { console.log(`[api] /processors type=${type ?? ''} enabled=${enabled ?? ''} count=${processors.length}`); } catch {}
    res.json(processors);
  } catch (error) {
    try { console.error('[api] /processors error:', error instanceof Error ? error.message : String(error)); } catch {}
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/api/processors/:id', requireAdmin, async (req, res) => {
  try {
    const processor = await db.getProcessor(req.params.id);
    if (!processor) {
      return res.status(404).json({ error: 'Processor not found' });
    }
    res.json(processor);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/processors', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name || !body.type) {
      return res.status(400).json({ error: 'Missing required fields: name, type' });
    }
    const id = await db.saveProcessor(body);
    res.json({ created: true, id });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.put('/api/processors/:id', requireAdmin, async (req, res) => {
  try {
    const existing = await db.getProcessor(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Processor not found' });
    }
    const payload: any = { ...existing, ...req.body, id: req.params.id };
    await db.saveProcessor(payload);
    res.json({ updated: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.delete('/api/processors/:id', requireAdmin, async (req, res) => {
  try {
    await db.deleteProcessor(req.params.id);
    res.json({ deleted: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Workflow endpoints
app.get('/api/workflows', requireAdmin, async (req, res) => {
  try {
    const enabled = req.query.enabled === 'true' ? true : req.query.enabled === 'false' ? false : undefined;
    const workflows = await db.getWorkflows(enabled);
    try { console.log(`[api] /workflows enabled=${enabled ?? ''} count=${workflows.length}`); } catch {}
    res.json(workflows);
  } catch (error) {
    try { console.error('[api] /workflows error:', error instanceof Error ? error.message : String(error)); } catch {}
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/api/workflows/:id', requireAdmin, async (req, res) => {
  try {
    const workflow = await db.getWorkflow(req.params.id);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    res.json(workflow);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/workflows', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name) {
      return res.status(400).json({ error: 'Missing required field: name' });
    }
    const id = await db.saveWorkflow(body);
    res.json({ created: true, id });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.put('/api/workflows/:id', requireAdmin, async (req, res) => {
  try {
    const existing = await db.getWorkflow(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    const payload: any = { ...existing, ...req.body, id: req.params.id };
    await db.saveWorkflow(payload);
    res.json({ updated: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.delete('/api/workflows/:id', requireAdmin, async (req, res) => {
  try {
    await db.deleteWorkflow(req.params.id);
    res.json({ deleted: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/workflows/:id/trigger', requireAdmin, async (req, res) => {
  try {
    const wf = await db.getWorkflow(req.params.id);
    if (!wf) return res.status(404).json({ error: 'Workflow not found' });
    const jobId = `workflow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await queue.publish({ id: jobId, type: 'workflow', workflow_id: wf.id, priority: 3 });
    res.json({ queued: true, queue: 'workflow', job_id: jobId, workflow_id: wf.id });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Site endpoints
app.get('/api/sites', async (req, res) => {
  try {
    const enabled = req.query.enabled === 'true' ? true : req.query.enabled === 'false' ? false : undefined;
    const sites = await listSites(enabled);
    try { console.log(`[api] /sites enabled=${enabled ?? ''} count=${sites.length}`); } catch {}
    res.setHeader('Cache-Control', 'no-store');
    res.json(sites);
  } catch (error) {
    try { console.error('[api] /sites error:', error instanceof Error ? error.message : String(error)); } catch {}
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/api/sites/:id', async (req, res) => {
  try {
    const site = await getSiteFromFiles(req.params.id);
    if (!site) return res.status(404).json({ error: 'Site not found' });
    res.json(site);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Article endpoints
app.get('/api/articles', async (req, res) => {
  try {
    const q = (req.query.q as string | undefined) || undefined;
    const siteId = (req.query.site_id as string | undefined) || undefined;
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;

    const items = await db.getArticles({ q, site_id: siteId, limit, offset });
    try { console.log(`[api] /articles q=${q ?? ''} site=${siteId ?? ''} limit=${limit} offset=${offset} count=${items.length}`); } catch {}
    res.json({ items, limit, offset });
  } catch (error) {
    try { console.error('[api] /articles error:', error instanceof Error ? error.message : String(error)); } catch {}
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/api/articles/:id', requireAdmin, async (req, res) => {
  try {
    const item = await db.getArticle(req.params.id);
    if (!item) return res.status(404).json({ error: 'Article not found' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Stories endpoint backed by pgvector KNN clusters
app.get('/api/stories', async (req, res) => {
  try {
    const count = Math.max(1, Number(req.query.count ?? 6));
    const perStory = Math.max(3, Number(req.query.per_story ?? 4));
    const stories = await db.getStoryClusters(count, perStory);
    if (Array.isArray(stories) && stories.length) {
      return res.json(stories);
    }
    const now = new Date();
    const iso = (d: Date, minusMinutes = 0) => new Date(d.getTime() - minusMinutes * 60000).toISOString();
    const fallback = [
      {
        id: 'story-saudi-pro-league-salary',
        title: 'Saudi Pro League Salary Debate',
        articles: [
          { id: 'a1', url: 'https://www.cnnindonesia.com/olahraga/20251129132956-142-1300813/hanya-ronaldo-yang-dinilai-pantas-digaji-tinggi-di-saudi-pro-league', title: 'Hanya Ronaldo yang Dinilai Pantas Digaji Tinggi di Saudi Pro League', site: 'CNN Indonesia', created_at: iso(now, 5) },
          { id: 'a2', url: 'https://example.com/saudi-pro-league-salary-analyst', title: 'Analyst: Salary Structure in Saudi Pro League', site: 'Example News', created_at: iso(now, 12) },
          { id: 'a3', url: 'https://sport360.com/saudi-pro-league-wages-breakdown', title: 'Breaking down Saudi Pro League wages', site: 'Sport360', created_at: iso(now, 18) }
        ]
      }
    ];
    res.json(fallback);
  } catch (error) {
    try { console.error('[api] /stories error:', error instanceof Error ? error.message : String(error)); } catch {}
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/maintenance/embeddings/backfill', requireAdmin, async (req, res) => {
  try {
    const limit = Math.max(1, Number(req.body?.limit ?? req.query.limit ?? 500));
    const batchSize = Math.max(1, Number(req.body?.batch_size ?? req.query.batch_size ?? 16));
    const result = await executeProcessor('embedding', 'backfill', { limit, batch_size: batchSize });
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/maintenance/embeddings/reindex', requireAdmin, async (_req, res) => {
  try {
    const result = await executeProcessor('embedding', 'reindex', {});
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.post('/api/articles', requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.url) {
      return res.status(400).json({ error: 'Missing required field: url' });
    }
    const articleId = await db.saveArticle(body);
    res.json({ id: articleId, created: true });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get('/api/articles/check/:url', async (req, res) => {
  try {
    const exists = await db.articleExists(decodeURIComponent(req.params.url));
    res.json({ exists, url: req.params.url });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Event endpoints
app.get('/api/events', requireAdmin, async (req, res) => {
  try {
    // Events removed from DB; return empty list
    res.json([]);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Server-Sent Events stream for real-time monitoring
app.get('/api/events/stream', requireAdmin, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // @ts-ignore
  res.flushHeaders?.();

  // Initial keepalive comment to open stream
  res.write(':ok\n\n');

  let closed = false;
  let _lastEventTime = new Date();

  const send = (type: string, payload: any) => {
    try {
      res.write(`event: ${type}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (e) {
      // If writing fails, close intervals
      cleanup();
    }
  };

  const buildStatus = async () => {
    const sites = await db.getSites(true);
    const processors = await db.getProcessors(undefined, true);
    const workflows = await db.getWorkflows(true);
    const workers = await getWorkersInfo();
    return {
      system: 'Sapu',
      timestamp: new Date().toISOString(),
      stats: {
        enabled_sites: sites.length,
        enabled_processors: processors.length,
        enabled_workflows: workflows.length,
        recent_events: 0
      },
      components: {
        database: 'connected',
        queue: isQueueConnected() ? 'connected' : 'disconnected',
        engine: 'running'
      },
      workers
    };
  };

  // Send initial status snapshot
  try {
    const status = await buildStatus();
    send('status', status);
    send('event', { type: 'connected', source: 'sse', status: 'completed', data: { message: 'stream connected' }, created_at: new Date().toISOString() });
  } catch {
    // Ignore initial failure; stream will try again on interval
  }

  const intervalEnv = Math.max(250, Math.min(10000, Number(process.env.EVENTS_STREAM_INTERVAL_MS ?? 500)));
  const intervalParamRaw = req.query.interval_ms as string | undefined;
  const intervalParam = intervalParamRaw !== undefined ? Math.max(250, Math.min(10000, Number(intervalParamRaw) || intervalEnv)) : intervalEnv;
  const silentRaw = String(req.query.silent || '').toLowerCase();
  const silent = ['true','1','yes','y','on'].includes(silentRaw);
  const statusInterval = silent ? null : setInterval(async () => {
    if (closed) return;
    try {
      const status = await buildStatus();
      send('status', status);
    } catch (e) {
    }
  }, intervalParam);

  // Subscribe to in-memory events and forward to SSE stream
  const unsubscribe = subscribe((ev) => {
    if (closed) return;
    try {
      send('event', ev);
      _lastEventTime = new Date();
    } catch {
      // ignore write errors; cleanup will handle
    }
  });

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (statusInterval) clearInterval(statusInterval);
    try { unsubscribe(); } catch { }
    try { res.end(); } catch { }
  };

  req.on('close', cleanup);
});

// Manual scrape endpoint: scrape a specific URL using configured scraper
app.get('/api/scrape', requireAdmin, async (req, res) => {
  try {
    const url = req.query.url as string;
    const siteId = req.query.site_id as string | undefined;
    if (!url) {
      return res.status(400).json({ error: 'Missing required query param: url' });
    }

    let site: any = undefined;
    if (siteId) {
      site = await getSiteFromFiles(siteId);
    } else {
      site = await findSiteByUrlHost(url);
    }
    if (!site) {
      return res.status(400).json({ error: 'Unable to resolve site from url. Provide site_id or ensure url host matches a known site.' });
    }

    const jobId = `scrape_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await queue.publish({
      id: jobId,
      type: 'scraping',
      url,
      site_id: site.id,
      config: { check_duplicates: true, kind: 'article' },
      priority: 5,
    });

    res.json({ queued: true, queue: 'scraping', job_id: jobId, site: site?.name, url });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Simple HTML dump endpoint to assist selector discovery
app.get('/api/html', requireAdmin, async (req, res) => {
  try {
    const url = req.query.url as string;
    const siteId = req.query.site_id as string | undefined;
    const dumpFlag = (req.query.dump as string | undefined)?.toLowerCase();
    const dumpToFile = dumpFlag === 'true' || dumpFlag === 'yes' || dumpFlag === '1';
    if (!url) {
      return res.status(400).json({ error: 'Missing required query param: url' });
    }

    let site: any = undefined;
    if (siteId) {
      site = await getSiteFromFiles(siteId);
      if (!site) return res.status(404).json({ error: 'Site not found', site_id: siteId });
    } else {
      site = await findSiteByUrlHost(url);
    }

    const result = await executeProcessor('scraper', 'get_html', { url, site, dump_to_file: dumpToFile });
    res.json({ ok: true, site: site?.name, result });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Alias for get_html to match external consumers
app.get('/api/get_html', requireAdmin, async (req, res) => {
  try {
    const url = req.query.url as string;
    const siteId = req.query.site_id as string | undefined;
    const dumpFlag = (req.query.dump as string | undefined)?.toLowerCase();
    const dumpToFile = dumpFlag === 'true' || dumpFlag === 'yes' || dumpFlag === '1';
    if (!url) return res.status(400).json({ error: 'Missing required query param: url' });

    let site: any = undefined;
    if (siteId) {
      site = await getSiteFromFiles(siteId);
      if (!site) return res.status(404).json({ error: 'Site not found', site_id: siteId });
    } else {
      site = await findSiteByUrlHost(url);
    }

    const result = await executeProcessor('scraper', 'get_html', { url, site, dump_to_file: dumpToFile });
    res.json({ ok: true, site: site?.name, result });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Manual URL collection endpoint: collect links for a site or URL
app.get('/api/collect-urls', requireAdmin, async (req, res) => {
  try {
    const url = req.query.url as string | undefined;
    const siteId = req.query.site_id as string | undefined;
    const collectionType = (req.query.collection_type as ('general' | 'indeks') | undefined) ?? 'general';
    const depthParam = req.query.depth as string | undefined;
    const depth = depthParam !== undefined ? Math.max(0, Number(depthParam) || 0) : undefined;

    if (!url) {
      return res.status(400).json({ error: 'Missing required query param: url' });
    }

    let site: any = undefined;
    if (siteId) {
      site = await getSiteFromFiles(siteId);
      if (!site) return res.status(404).json({ error: 'Site not found', site_id: siteId });
    } else if (url) {
      site = await findSiteByUrlHost(url);
    }

    if (!site) {
      return res.status(400).json({ error: 'Unable to resolve site from url. Provide site_id or ensure url host matches a known site.' });
    }

    const jobId = `collect_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await queue.publish({
      id: jobId,
      type: 'url_collection',
      url,
      site_id: site.id,
      config: {
        collection_type: collectionType,
        ...(depth !== undefined ? { recursion: { depth } } : {}),
      },
      priority: 4,
    });

    res.json({ queued: true, queue: 'url_collection', job_id: jobId, site: site?.name, url, collection_type: collectionType, depth });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// System status endpoint
app.get('/api/status', requireAdmin, async (req, res) => {
  try {
    const sites = await listSites(true);
    const processors = await db.getProcessors(undefined, true);
    const workflows = await db.getWorkflows(true);

    const workers = await (async () => {
      try { return await getWorkersInfo(); } catch { return { enabled: false, current: 0, target: 0 }; }
    })();

    res.json({
      system: 'Sapu',
      timestamp: new Date().toISOString(),
      stats: {
        enabled_sites: sites.length,
        enabled_processors: processors.length,
        enabled_workflows: workflows.length,
        recent_events: 0
      },
      components: {
        database: 'connected',
        queue: isQueueConnected() ? 'connected' : 'disconnected',
        engine: 'running'
      },
      workers
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 API server running on port ${PORT}`);
  if (ADMIN_PASSWORD_MISSING) {
    console.error('⚠️ ADMIN_PASSWORD missing. Set ADMIN_PASSWORD or VITE_ADMIN_PASSWORD on the server runtime environment. Admin endpoints will return an error until configured.');
  }
});

export { app };

app.post('/api/worker/heartbeat', (req, res) => {
  try {
    const hb = req.body || {};
    const id = String(hb.worker_id || '').trim();
    if (!id) return res.status(400).json({ error: 'worker_id required' });
    workerHeartbeats.set(id, { ts: Date.now(), data: hb });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.get('/api/workers', requireAdmin, (_req, res) => {
  const now = Date.now();
  const items: any[] = [];
  for (const [id, rec] of workerHeartbeats) {
    if ((now - rec.ts) <= HEARTBEAT_TTL_MS) items.push({ id, last_seen_ms: now - rec.ts, ...rec.data });
  }
  res.json({ items, count: items.length, ttl_ms: HEARTBEAT_TTL_MS });
});

app.post('/api/worker/event', (req, res) => {
  try {
    const { worker_id, status, data, type } = req.body || {};
    const src = worker_id ? `worker:${worker_id}` : undefined;
    publish({ type: type || 'worker.activity', source: src, status, data });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// Root SPA route
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});
