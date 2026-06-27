import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDb() {
  const schemaPath = path.join(__dirname, '../../schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const connectionString = process.env.DATABASE_URL || 'postgres://postgres@localhost:5432/postgres';
  const pool = new pg.Pool({ connectionString });

  console.log('📄 Applying schema at', schemaPath);
  console.log('🔌 Connecting to', connectionString);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('✅ Database schema initialized');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Schema init failed:', e instanceof Error ? e.message : String(e));
    console.log('ℹ️  Proceeding to ensure core tables exist (processors, configurations, indexes)');
    try {
      await client.query('BEGIN');
      await client.query(`
        CREATE TABLE IF NOT EXISTS processors (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(100) NOT NULL,
          type VARCHAR(50) NOT NULL,
          config JSONB NOT NULL,
          enabled BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
      await client.query('CREATE INDEX IF NOT EXISTS idx_processors_type ON processors(type);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_processors_enabled ON processors(enabled);');

      await client.query(`
        CREATE TABLE IF NOT EXISTS configurations (
          key VARCHAR(100) PRIMARY KEY,
          value JSONB NOT NULL,
          category VARCHAR(50) NOT NULL DEFAULT 'general',
          description TEXT,
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
      await client.query('CREATE INDEX IF NOT EXISTS idx_configurations_category ON configurations(category);');

      await client.query(`
        CREATE TABLE IF NOT EXISTS sites (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(100) NOT NULL,
          base_url TEXT NOT NULL,
          config JSONB NOT NULL DEFAULT '{}'::jsonb,
          enabled BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
      await client.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS name VARCHAR(100);`);
      await client.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS base_url TEXT;`);
      await client.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb;`);
      await client.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true;`);
      await client.query('CREATE INDEX IF NOT EXISTS idx_sites_enabled ON sites(enabled);');
      await client.query('CREATE INDEX IF NOT EXISTS idx_sites_base_url ON sites(base_url);');
      await client.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS site_id UUID DEFAULT gen_random_uuid();`);
      await client.query(`ALTER TABLE sites ALTER COLUMN site_id DROP NOT NULL;`);
      await client.query(`ALTER TABLE sites ADD COLUMN IF NOT EXISTS domains TEXT[] DEFAULT '{}'::text[];`);
      await client.query(`ALTER TABLE sites ALTER COLUMN domains DROP NOT NULL;`);

      await client.query(`
        CREATE TABLE IF NOT EXISTS workflows (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(100) NOT NULL,
          description TEXT,
          steps JSONB NOT NULL,
          triggers JSONB NOT NULL,
          enabled BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);

      const { rows } = await client.query('SELECT COUNT(*)::int AS cnt FROM processors');
      if ((rows?.[0]?.cnt ?? 0) === 0) {
        await client.query(`
          INSERT INTO processors (name, type, config) VALUES
          ('default_scraper', 'scraper', '{
            "stealth_mode": true,
            "timeout": 30000,
            "retry_attempts": 3,
            "selectors": {
              "title": "h1, .title, .headline",
              "content": ".content, .article-body, .post-content",
              "links": "a[href]"
            },
            "filters": {
              "min_content_length": 100,
              "exclude_patterns": ["ads", "sidebar", "footer"]
            }
          }');
        `);
      }

      const embProc = await client.query('SELECT 1 FROM processors WHERE type = $1', ['embedding']);
      if (embProc.rowCount === 0) {
        await client.query(`
          INSERT INTO processors (name, type, config, enabled)
          VALUES ($1, $2, $3::jsonb, true)
        `, [
          'embedding_maintenance',
          'embedding',
          JSON.stringify({ backfill: { limit: 800, batch_size: 24 }, reindex: { enabled: true } })
        ]);
      }

      const embWf = await client.query('SELECT 1 FROM workflows WHERE name = $1', ['embedding_maintenance']);
      if (embWf.rowCount === 0) {
        const steps = [
          { processor: 'embedding', action: 'backfill', params: { limit: 800, batch_size: 24 } },
          { processor: 'embedding', action: 'reindex', params: {} }
        ];
        const triggers = { type: 'cron', schedule: '*/30 * * * *', enabled: true };
        await client.query(
          `INSERT INTO workflows (name, description, steps, triggers, enabled) VALUES ($1, $2, $3::jsonb, $4::jsonb, true)`,
          ['embedding_maintenance', 'Maintain article embeddings and vector index', JSON.stringify(steps), JSON.stringify(triggers)]
        );
      }

      const cfg = await client.query('SELECT 1 FROM configurations WHERE key = $1', ['page_load']);
      if (cfg.rowCount === 0) {
        await client.query(
          `INSERT INTO configurations (key, value, category, description) VALUES ($1, $2::jsonb, $3, $4)`,
          [
            'page_load',
            JSON.stringify({
              page_load: {
                use_shared_browser: true,
                timeout: 15000,
                protocol_timeout: 20000,
                wait_until: 'domcontentloaded',
                headless: true,
                args: [
                  '--disable-gpu',
                  '--disable-dev-shm-usage',
                  '--no-default-browser-check',
                  '--no-first-run',
                  '--disable-background-networking',
                  '--disable-background-timer-throttling',
                  '--disable-features=NetworkService,Translate,BackForwardCache'
                ]
              },
            }),
            'performance',
            'Global page load settings merged into processor configs',
          ]
        );
      }

      const scfg = await client.query('SELECT 1 FROM configurations WHERE key = $1', ['scraping_defaults']);
      if (scfg.rowCount === 0) {
        await client.query(
          `INSERT INTO configurations (key, value, category, description) VALUES ($1, $2::jsonb, $3, $4)`,
          [
            'scraping_defaults',
            JSON.stringify({
              scraping: {
                block_resources: ['image','stylesheet','font','media'],
                disable_javascript: false,
                selector_wait_timeout_ms: 5000
              }
            }),
            'performance',
            'Global scraping defaults merged into processor configs'
          ]
        );
      }

      const dcfg = await client.query('SELECT 1 FROM configurations WHERE key = $1', ['debug']);
      if (dcfg.rowCount === 0) {
        await client.query(
          `INSERT INTO configurations (key, value, category, description) VALUES ($1, $2::jsonb, $3, $4)`,
          [
            'debug',
            JSON.stringify({ debug: { dump_html: false } }),
            'quality',
            'Debug flags for runtime behaviors'
          ]
        );
      }
      await client.query('COMMIT');
      console.log('✅ Core tables ensured');
    } catch (ensureErr) {
      await client.query('ROLLBACK');
      console.error('❌ Failed to ensure core tables:', ensureErr instanceof Error ? ensureErr.message : String(ensureErr));
      process.exitCode = 1;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

initDb();
