-- Sapu Schema
-- Philosophy: Configuration over Code
-- All business logic lives in database as JSON configurations

-- Required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- Core system configurations (replaces environment variables and hardcoded settings)
CREATE TABLE configurations (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  description TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Generic processors (replaces Worker, Scheduler, Telegram classes)
CREATE TABLE processors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'scraper', 'notifier', 'scheduler', 'classifier'
  config JSONB NOT NULL, -- All processor configuration as JSON
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Workflow definitions (replaces hardcoded business logic)
CREATE TABLE workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  steps JSONB NOT NULL, -- Array of processor IDs and parameters
  triggers JSONB NOT NULL, -- When/how to execute (cron, events, etc.)
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Event table removed: switching to in-memory publisher for realtime monitoring

-- Simplified sites table (legacy; sites are now file-driven via config/sites/)
-- Kept for backward compatibility but no active code reads from it
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  base_url TEXT NOT NULL,
  config JSONB NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Simple articles storage with duplicate prevention (from v2)
CREATE TABLE articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id),
  url TEXT NOT NULL UNIQUE, -- Prevent duplicate URLs
  title TEXT,
  title_hash TEXT, -- For duplicate title detection
  content TEXT,
  content_hash TEXT, -- For duplicate content detection (optional)
  metadata JSONB, -- Any additional data as JSON
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_configurations_category ON configurations(category);
CREATE INDEX idx_processors_type ON processors(type);
CREATE INDEX idx_processors_enabled ON processors(enabled);
CREATE INDEX idx_workflows_enabled ON workflows(enabled);
CREATE INDEX idx_sites_enabled ON sites(enabled);
CREATE INDEX idx_articles_site_id ON articles(site_id);
CREATE INDEX idx_articles_created_at ON articles(created_at);
CREATE INDEX IF NOT EXISTS idx_articles_title_hash ON articles(title_hash); -- For duplicate detection
CREATE INDEX IF NOT EXISTS idx_articles_content_hash ON articles(content_hash); -- For duplicate detection

-- Default system configurations
INSERT INTO configurations (key, value, category, description) VALUES
('page_load', '{
  "page_load": {
    "use_shared_browser": true,
    "timeout": 120000,
    "wait_until": "domcontentloaded",
    "stealth_mode": true
  }
}', 'performance', 'Global page load settings merged into processor configs');

-- Default scraper processor
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

-- URL collection processor
INSERT INTO processors (name, type, config) VALUES
('url_collector', 'url_collector', '{
  "enabled": true,
  "page_load": {
    "use_shared_browser": true,
    "timeout": 120000,
    "wait_until": "domcontentloaded",
    "stealth_mode": true
  },
  "extract_links": true,
  "follow_patterns": ["/news/", "/article/", "/category/"],
  "exclude_patterns": ["/ads/", "/login/", "/register/"],
  "max_depth": 2,
  "respect_robots_txt": true,
  "delay_between_requests": 1000,
  "duplicate_prevention": {
    "check_existing_jobs": true,
    "check_existing_articles": true,
    "skip_duplicates": true
  },
  "job_spawning": {
    "create_scrape_jobs": true,
    "create_collection_jobs": true,
    "max_jobs_per_run": 100
  }
}');
