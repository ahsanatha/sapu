// ACQ v3 Ultra-Simple Database Interface
// Simple CRUD operations for entities
// Target: 100 lines total

import crypto from 'node:crypto';

import { pipeline, type Tensor } from '@huggingface/transformers';
import pg from 'pg';
import type { Pool } from 'pg';

import type { SiteConfig } from './types.js';
import { listSites as fileListSites, getSite as fileGetSite } from './sites.js';

interface Configuration {
  key: string;
  value: any; // JSONB in database, represented as JS object
  category: string;
  description?: string;
}

interface Processor {
  id: string;
  name: string;
  type: string;
  config: any;
  enabled: boolean;
}

interface Workflow {
  id: string;
  name: string;
  description?: string;
  steps: any;
  triggers: any;
  enabled: boolean;
}

interface Site {
  id: string;
  name: string;
  base_url: string;
  config: SiteConfig;
  enabled: boolean;
}

interface Article {
  id: string;
  site_id: string;
  url: string;
  title?: string;
  title_hash?: string;
  content?: string;
  content_hash?: string;
  metadata?: any;
}


class Database {
  private pool: Pool;
  private readonly VECTOR_DIM = 768;
  private embedder: any | null = null;

  constructor() {
    this.pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/acq_v3'
    });
  }

  async connect(): Promise<void> {
    await this.pool.connect();
    console.log('📊 Database connected');
  }

  async close(): Promise<void> {
    try {
      await this.pool.end();
      console.log('📊 Database disconnected');
    } catch {}
  }

  // Configuration operations
  async getConfiguration(key: string): Promise<Configuration | null> {
    const result = await this.pool.query('SELECT * FROM configurations WHERE key = $1', [key]);
    return result.rows[0] || null;
  }

  async getConfigurations(category?: string): Promise<Configuration[]> {
    const query = category 
      ? 'SELECT * FROM configurations WHERE category = $1 ORDER BY key'
      : 'SELECT * FROM configurations ORDER BY key';
    const params = category ? [category] : [];
    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async setConfiguration(key: string, value: any, category: string, description?: string): Promise<void> {
    // Serialize configuration value for JSONB column
    const valueJson = typeof value === 'string' ? value : JSON.stringify(value ?? null);
    await this.pool.query(`
      INSERT INTO configurations (key, value, category, description)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        category = EXCLUDED.category,
        description = EXCLUDED.description
    `, [key, valueJson, category, description]);
  }

  async deleteConfiguration(key: string): Promise<void> {
    await this.pool.query('DELETE FROM configurations WHERE key = $1', [key]);
  }

  // Processor operations
  async getProcessors(type?: string, enabled?: boolean): Promise<Processor[]> {
    let query = 'SELECT * FROM processors WHERE 1=1';
    const params: any[] = [];
    
    if (type) {
      params.push(type);
      query += ` AND type = $${params.length}`;
    }
    
    if (enabled !== undefined) {
      params.push(enabled);
      query += ` AND enabled = $${params.length}`;
    }
    
    query += ' ORDER BY name';
    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async getProcessor(id: string): Promise<Processor | null> {
    const result = await this.pool.query('SELECT * FROM processors WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async saveProcessor(processor: Omit<Processor, 'id'> | Processor): Promise<string> {
    // Serialize JSON config for PostgreSQL json/jsonb column
    const configJson = typeof (processor as any).config === 'string'
      ? (processor as any).config
      : JSON.stringify((processor as any).config ?? {});
    if ('id' in processor && processor.id) {
      // Update existing
      await this.pool.query(`
        UPDATE processors SET name = $1, type = $2, config = $3, enabled = $4
        WHERE id = $5
      `, [processor.name, processor.type, configJson, processor.enabled, processor.id]);
      return processor.id;
    } else {
      // Create new
      const result = await this.pool.query(`
        INSERT INTO processors (name, type, config, enabled)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [processor.name, processor.type, configJson, processor.enabled]);
      return result.rows[0].id;
    }
  }

  async deleteProcessor(id: string): Promise<void> {
    await this.pool.query('DELETE FROM processors WHERE id = $1', [id]);
  }

  // Workflow operations
  async getWorkflows(enabled?: boolean): Promise<Workflow[]> {
    const query = enabled 
      ? 'SELECT * FROM workflows WHERE enabled = true ORDER BY name'
      : 'SELECT * FROM workflows ORDER BY name';
    const result = await this.pool.query(query);
    return result.rows;
  }

  async getWorkflow(id: string): Promise<Workflow | null> {
    const result = await this.pool.query('SELECT * FROM workflows WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async saveWorkflow(workflow: Omit<Workflow, 'id'> | Workflow): Promise<string> {
    // Ensure JSON fields are serialized properly for PostgreSQL json/jsonb columns
    const stepsJson = typeof (workflow as any).steps === 'string'
      ? (workflow as any).steps
      : JSON.stringify((workflow as any).steps ?? []);
    const triggersJson = typeof (workflow as any).triggers === 'string'
      ? (workflow as any).triggers
      : JSON.stringify((workflow as any).triggers ?? {});

    if ('id' in workflow && workflow.id) {
      // Update existing
      await this.pool.query(`
        UPDATE workflows SET name = $1, description = $2, steps = $3, triggers = $4, enabled = $5
        WHERE id = $6
      `, [workflow.name, workflow.description, stepsJson, triggersJson, workflow.enabled, workflow.id]);
      return workflow.id;
    } else {
      // Create new
      const result = await this.pool.query(`
        INSERT INTO workflows (name, description, steps, triggers, enabled)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [workflow.name, workflow.description, stepsJson, triggersJson, workflow.enabled]);
      return result.rows[0].id;
    }
  }

  async deleteWorkflow(id: string): Promise<void> {
    await this.pool.query('DELETE FROM workflows WHERE id = $1', [id]);
  }

  // Site operations
  async getSites(enabled?: boolean): Promise<Site[]> {
    const sites = await fileListSites(enabled);
    return sites as any;
  }

  async getSite(idOrKey: string): Promise<Site | null> {
    const site = await fileGetSite(idOrKey);
    return site as any;
  }

  async saveSite(site: Omit<Site, 'id'> | Site): Promise<string> {
    // Serialize JSON config for PostgreSQL json/jsonb column
    const configJson = typeof site.config === 'string'
      ? site.config
      : JSON.stringify(site.config ?? {});
    if ('id' in site && site.id) {
      // Update existing
      await this.pool.query(`
        UPDATE sites SET name = $1, base_url = $2, config = $3, enabled = $4
        WHERE id = $5
      `, [site.name, site.base_url, configJson, site.enabled, site.id]);
      return site.id;
    } else {
      // Create new
      const result = await this.pool.query(`
        INSERT INTO sites (name, base_url, config, enabled)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [site.name, site.base_url, configJson, site.enabled]);
      return result.rows[0].id;
    }
  }

  async deleteSite(id: string): Promise<void> {
    await this.pool.query('DELETE FROM sites WHERE id = $1', [id]);
  }

  // Article operations
  async saveArticle(article: Omit<Article, 'id'>): Promise<string> {
    // Serialize metadata if provided; allow NULL when metadata is undefined
    const metadataJson = article.metadata === undefined
      ? null
      : (typeof article.metadata === 'string' ? article.metadata : JSON.stringify(article.metadata));
    const synthesizeUuid = (key: string): string => {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return key;
      const h = crypto.createHash('sha1').update(String(key)).digest('hex');
      // Format as UUID v5-like (not real namespace UUID, but stable)
      const uuid = `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
      return uuid;
    };
    const siteIdUuid = synthesizeUuid(String(article.site_id || 'site'));
    const result = await this.pool.query(`
      INSERT INTO articles (site_id, url, title, title_hash, content, content_hash, metadata)
      VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (url) DO NOTHING
      RETURNING id
    `, [
      siteIdUuid,
      article.url,
      article.title,
      article.title_hash,
      article.content,
      article.content_hash,
      metadataJson
    ]);
    
    return result.rows[0]?.id;
  }

  async articleExists(url: string): Promise<boolean> {
    const result = await this.pool.query('SELECT 1 FROM articles WHERE url = $1', [url]);
    return result.rows.length > 0;
  }

  async findDuplicateArticles(url?: string, title?: string): Promise<Article[]> {
    // Fast path if neither url nor title provided
    if (!url && !title) return [];

    const queries: string[] = [];
    const params: any[] = [];

    // Prefer indexed URL check; title check uses direct equality
    if (url) {
      params.push(url);
      queries.push(`SELECT * FROM articles WHERE url = $${params.length}`);
    }
    if (title) {
      params.push(title);
      queries.push(`SELECT * FROM articles WHERE title = $${params.length}`);
    }

    const sql = queries.join(' UNION ALL ');
    const result = await this.pool.query(sql, params);
    const seen = new Set<string>();
    const deduped: Article[] = [];
    for (const row of result.rows) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        deduped.push(row);
      }
    }
    return deduped;
  }

  // Scheduled index (DB-backed dedup) operations
  async ensureScheduledIndexTables(): Promise<void> {
    // Create table and index if they don't exist; lightweight and safe to run at startup
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS scheduled_index (
        key TEXT PRIMARY KEY,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await this.pool.query('CREATE INDEX IF NOT EXISTS idx_scheduled_index_expires ON scheduled_index(expires_at);');
  }

  private async getEmbedder(): Promise<any> {
    if (this.embedder) return this.embedder;
    this.embedder = await pipeline('feature-extraction', 'Xenova/multilingual-e5-base');
    return this.embedder;
  }

  async ensureVectorSupport(): Promise<void> {
    await this.pool.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    await this.pool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='articles' AND column_name='embedding') THEN ALTER TABLE articles ADD COLUMN embedding vector(${this.VECTOR_DIM}); END IF; END $$;`);
    try {
      await this.pool.query(`ALTER TABLE articles ALTER COLUMN embedding TYPE vector(${this.VECTOR_DIM})`);
    } catch (e: any) {
      try {
        await this.pool.query(`UPDATE articles SET embedding = NULL`);
        await this.pool.query(`ALTER TABLE articles ALTER COLUMN embedding TYPE vector(${this.VECTOR_DIM})`);
      } catch {}
    }
    await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_articles_embedding ON articles USING ivfflat (embedding) WITH (lists = 100)`);
  }

  private vectorLiteral(vec: number[]): string {
    return `[${vec.map((n) => Number(n).toFixed(6)).join(',')}]`;
  }

  async ensureArticleEmbeddingById(id: string, text: string): Promise<void> {
    const res = await this.pool.query('SELECT embedding FROM articles WHERE id = $1', [id]);
    const has = res.rows[0]?.embedding != null;
    if (has) return;
    let vec: number[] | null = null;
    try {
      const embedder = await this.getEmbedder();
      const input = `passage: ${String(text || '')}`;
      const out: Tensor = await embedder(input, { pooling: 'mean', normalize: true });
      const arr = (typeof (out as any).tolist === 'function') ? (out as any).tolist() : null;
      vec = Array.isArray(arr) ? arr : null;
    } catch {
      vec = null;
    }
    if (!vec) return;
    const lit = this.vectorLiteral(vec);
    await this.pool.query('UPDATE articles SET embedding = $2::vector WHERE id = $1', [id, lit]);
  }

  async getStoryClusters(count: number, perStory: number): Promise<Array<{ id: string; title: string; articles: any[] }>> {
    let vectorOk = true;
    try {
      await this.ensureVectorSupport();
    } catch {
      vectorOk = false;
    }
    const anchors = await this.pool.query('SELECT id, site_id, url, title, created_at FROM articles ORDER BY created_at DESC LIMIT $1', [Math.max(5, count * perStory)]);
    const anchorIndexById: Record<string, number> = {};
    for (let i = 0; i < anchors.rows.length; i++) anchorIndexById[anchors.rows[i].id] = i;
    if (vectorOk) {
      for (const a of anchors.rows) {
        const text = String(a.title || a.url || a.id);
        await this.ensureArticleEmbeddingById(a.id, text);
      }
    }
    const sites = await this.getSites(true);
    const siteUuidMap: Record<string, string> = {};
    for (const s of sites) {
      const h = crypto.createHash('sha1').update(String(s.id)).digest('hex');
      const uuid = `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
      siteUuidMap[uuid] = s.name;
    }
    const used = new Set<string>();
    const stories: Array<{ id: string; title: string; articles: any[] }> = [];
    let candidateRows: any[] = [];
    let candidateVecs: number[][] = [];
    let anchorVecs: number[][] = [];
    if (!vectorOk) {
      const anchorTexts = anchors.rows.map((a: any) => `passage: ${String(a.title || a.url || a.id)}`);
      anchorVecs = await this.embedTextsBatch(anchorTexts);
      const cand = await this.pool.query('SELECT id, site_id, url, title, created_at FROM articles ORDER BY created_at DESC LIMIT $1', [Math.max(20, perStory * 10)]);
      candidateRows = cand.rows;
      const candidateTexts = candidateRows.map((n: any) => `passage: ${String(n.title || n.url || n.id)}`);
      candidateVecs = await this.embedTextsBatch(candidateTexts);
    }
    for (const a of anchors.rows) {
      if (used.has(a.id)) continue;
      if (vectorOk) {
        const base = await this.pool.query('SELECT embedding FROM articles WHERE id = $1', [a.id]);
        const queryVec = base.rows[0]?.embedding;
        if (!queryVec) continue;
        const neighbors = await this.pool.query(`SELECT id, site_id, url, title, created_at FROM articles WHERE embedding IS NOT NULL ORDER BY embedding <-> $1::vector LIMIT $2`, [queryVec, Math.max(3, perStory)]);
        const cluster: any[] = [];
        for (const n of neighbors.rows) {
          if (used.has(n.id)) continue;
          used.add(n.id);
          cluster.push({ id: n.id, url: n.url, title: n.title || n.url, site: siteUuidMap[String(n.site_id)] || 'Unknown', created_at: n.created_at });
        }
        if (cluster.length >= Math.max(3, perStory)) {
          stories.push({ id: `story-${a.id}`, title: a.title || a.url, articles: cluster });
          if (stories.length >= count) break;
        }
      } else {
        const ai = anchorIndexById[a.id] ?? 0;
        const anchorVec = anchorVecs[ai];
        if (!anchorVec) continue;
        const scored: Array<{ id: string; score: number; row: any }> = [];
        for (let ci = 0; ci < candidateRows.length; ci++) {
          const n = candidateRows[ci];
          if (n.id === a.id || used.has(n.id)) continue;
          const vec = candidateVecs[ci];
          if (!vec) continue;
          const sim = this.cosSim(anchorVec, vec);
          scored.push({ id: n.id, score: sim, row: n });
        }
        scored.sort((a, b) => b.score - a.score);
        const clusterRows = scored.slice(0, Math.max(3, perStory)).map(s => s.row);
        const cluster: any[] = [];
        for (const n of clusterRows) {
          used.add(n.id);
          cluster.push({ id: n.id, url: n.url, title: n.title || n.url, site: siteUuidMap[String(n.site_id)] || 'Unknown', created_at: n.created_at });
        }
        if (cluster.length >= Math.max(3, perStory)) {
          stories.push({ id: `story-${a.id}`, title: a.title || a.url, articles: cluster });
          if (stories.length >= count) break;
        }
      }
    }
    return stories;
  }

  private cosSim(a: number[], b: number[]): number {
    if (!a.length || !b.length || a.length !== b.length) return 0;
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < a.length; i++) {
      const x = Number(a[i]) || 0;
      const y = Number(b[i]) || 0;
      dot += x * y;
      na += x * x;
      nb += y * y;
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb) || 1;
    return dot / denom;
  }

  async embedTextsBatch(texts: string[]): Promise<number[][]> {
    const embedder = await this.getEmbedder();
    try {
      const out: Tensor = await embedder(texts, { pooling: 'mean', normalize: true });
      const arr = (typeof (out as any).tolist === 'function') ? (out as any).tolist() : null;
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  async backfillArticleEmbeddings(opts?: { limit?: number; batch_size?: number }): Promise<number> {
    const limit = Math.max(1, Number(opts?.limit ?? 500));
    const batch = Math.max(1, Number(opts?.batch_size ?? 16));
    await this.ensureVectorSupport();
    const toFill = await this.pool.query('SELECT id, url, title FROM articles WHERE embedding IS NULL ORDER BY created_at DESC LIMIT $1', [limit]);
    if (!toFill.rows.length) return 0;
    const embedder = await this.getEmbedder();
    let updated = 0;
    for (let i = 0; i < toFill.rows.length; i += batch) {
      const slice = toFill.rows.slice(i, i + batch);
      const texts = slice.map((r: any) => `passage: ${String(r.title || r.url || r.id)}`);
      let vectors: number[][] = [];
      try {
        const out: Tensor = await embedder(texts, { pooling: 'mean', normalize: true });
        const arr = (typeof (out as any).tolist === 'function') ? (out as any).tolist() : null;
        vectors = Array.isArray(arr) ? arr : [];
      } catch {
        vectors = [];
      }
      for (let j = 0; j < slice.length; j++) {
        const r = slice[j];
        const vec = vectors[j];
        if (!vec) continue;
        const lit = this.vectorLiteral(vec);
        try {
          await this.pool.query('UPDATE articles SET embedding = $2::vector WHERE id = $1', [r.id, lit]);
          updated++;
        } catch {}
      }
    }
    return updated;
  }

  async reindexVectorIndex(): Promise<void> {
    await this.ensureVectorSupport();
    try {
      await this.pool.query('REINDEX INDEX idx_articles_embedding');
    } catch {}
  }

  async tryScheduleIndex(key: string, ttlMinutes: number): Promise<boolean> {
    // Insert a key with TTL; return true if this call won the race to schedule
    const minutes = Math.max(1, Number(ttlMinutes) || 1);
    const result = await this.pool.query(
      `INSERT INTO scheduled_index (key, expires_at)
       VALUES ($1, NOW() + ($2::int * INTERVAL '1 minute'))
       ON CONFLICT (key) DO NOTHING`,
      [key, minutes]
    );
    return result.rowCount === 1;
  }

  async sweepScheduledIndex(): Promise<number> {
    const result = await this.pool.query('DELETE FROM scheduled_index WHERE expires_at < NOW()');
    return result.rowCount || 0;
  }

  async getArticles(params: { q?: string; site_id?: string; limit?: number; offset?: number }): Promise<any[]> {
    const { q, site_id, limit = 50, offset = 0 } = params || {};
    let query = 'SELECT id, site_id, url, title, metadata, created_at FROM articles WHERE 1=1';
    const values: any[] = [];

    if (site_id) {
      let sid = site_id;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sid)) {
        const h = crypto.createHash('sha1').update(String(sid)).digest('hex');
        sid = `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
      }
      values.push(sid);
      query += ` AND site_id = $${values.length}::uuid`;
    }

    if (q && q.trim().length) {
      values.push(`%${q.trim()}%`);
      const likeParam = `$${values.length}`;
      // Search by title or URL
      query += ` AND (title ILIKE ${likeParam} OR url ILIKE ${likeParam})`;
    }

    // Order newest first for relevance
    query += ' ORDER BY created_at DESC';
    // Pagination
    values.push(Number(limit));
    query += ` LIMIT $${values.length}`;
    values.push(Number(offset));
    query += ` OFFSET $${values.length}`;

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  async getArticle(id: string): Promise<any | null> {
    const result = await this.pool.query(
      'SELECT id, site_id, url, title, content, metadata, created_at FROM articles WHERE id = $1::uuid',
      [id]
    );
    return result.rows[0] || null;
  }

  // Event operations removed

  // Generic query method for custom operations
  async query(text: string, params?: any[]): Promise<any> {
    return this.pool.query(text, params);
  }
}

// Export singleton instance
export const db = new Database();
