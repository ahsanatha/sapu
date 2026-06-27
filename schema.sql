-- ACQ v3 Ultra-Simple Schema
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

-- Simplified sites (minimal, configuration-driven)
CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  base_url TEXT NOT NULL,
  config JSONB NOT NULL, -- All site-specific settings as JSON
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
('system.max_concurrent_jobs', '5', 'performance', 'Maximum concurrent scraping jobs'),
('system.default_timeout', '30000', 'performance', 'Default timeout in milliseconds'),
('system.retry_attempts', '3', 'reliability', 'Number of retry attempts for failed jobs'),
('database.pool_size', '10', 'infrastructure', 'Database connection pool size'),

-- RabbitMQ Configuration (from v2)
('rabbitmq.url', '"amqp://acq:acq123@localhost:5672/acq"', 'infrastructure', 'RabbitMQ connection URL'),
('rabbitmq.exchange', '"acq.jobs"', 'infrastructure', 'Main exchange for job routing'),
('rabbitmq.queues.scraping', '"acq.jobs.scraping"', 'infrastructure', 'Scraping jobs queue'),
('rabbitmq.queues.url_collection', '"acq.jobs.url_collection"', 'infrastructure', 'URL collection jobs queue'),
('rabbitmq.queues.dlq', '"acq.jobs.dlq"', 'infrastructure', 'Dead letter queue for failed jobs'),
('rabbitmq.message_ttl', '3600000', 'infrastructure', 'Message TTL in milliseconds (1 hour)'),
('rabbitmq.max_priority', '10', 'infrastructure', 'Maximum message priority'),

-- Auto-scaling Configuration (from v2)
('autoscaling.enabled', 'true', 'scaling', 'Enable auto-scaling workers'),
('autoscaling.min_workers', '1', 'scaling', 'Minimum number of workers'),
('autoscaling.max_workers', '10', 'scaling', 'Maximum number of workers'),
('autoscaling.target_jobs_per_worker', '5', 'scaling', 'Target jobs per worker for scaling'),
('autoscaling.scale_up_threshold', '0.8', 'scaling', 'Jobs per worker to trigger scale up'),
('autoscaling.scale_down_threshold', '0.3', 'scaling', 'Jobs per worker to trigger scale down'),
('autoscaling.scale_check_interval', '30000', 'scaling', 'How often to check scaling (ms)'),
('autoscaling.scale_up_cooldown', '60000', 'scaling', 'Cooldown after scaling up (ms)'),
('autoscaling.scale_down_cooldown', '300000', 'scaling', 'Cooldown after scaling down (ms)'),

-- Duplicate Prevention Configuration
('duplicate_prevention.enabled', 'true', 'quality', 'Enable duplicate article prevention'),
('duplicate_prevention.check_url', 'true', 'quality', 'Check for duplicate URLs'),
('duplicate_prevention.check_title_hash', 'true', 'quality', 'Check for duplicate title hashes'),
('duplicate_prevention.check_content_hash', 'false', 'quality', 'Check for duplicate content hashes');

-- Example scraper processor
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

-- Example notification processor
INSERT INTO processors (name, type, config) VALUES
('telegram_notifier', 'notifier', '{
  "provider": "telegram",
  "bot_token": "${TELEGRAM_BOT_TOKEN}",
  "chat_id": "${TELEGRAM_CHAT_ID}",
  "templates": {
    "job_complete": "✅ Job completed: {processed} articles from {site_name}",
    "job_failed": "❌ Job failed: {error_message}",
    "health_report": "📊 System Health: {active_jobs} jobs, {success_rate}% success"
  },
  "rate_limit": {
    "max_per_minute": 20,
    "max_per_second": 5
  }
}');

-- Example scheduler processor
INSERT INTO processors (name, type, config) VALUES
('cron_scheduler', 'scheduler', '{
  "type": "cron",
  "default_schedule": "0 */6 * * *",
  "timezone": "UTC",
  "max_concurrent": 3,
  "health_check_interval": "0 * * * *"
}');

-- Auto-scaling processor (from v2 implementation)
INSERT INTO processors (name, type, config) VALUES
('worker_autoscaler', 'autoscaler', '{
  "enabled": true,
  "min_workers": 1,
  "max_workers": 10,
  "target_jobs_per_worker": 5,
  "scale_up_threshold": 0.8,
  "scale_down_threshold": 0.3,
  "scale_check_interval": 30000,
  "scale_up_cooldown": 60000,
  "scale_down_cooldown": 300000,
  "graceful_shutdown_timeout": 30000,
  "cpu_monitoring": {
    "enabled": true,
    "scale_down_threshold": 0.2,
    "monitoring_samples": 5
  },
  "time_based_scaling": {
    "enabled": true,
    "target_processing_time_minutes": 30,
    "processing_rate_window_minutes": 5
  }
}');

-- URL collection processor (from v2 implementation)
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

-- Global page load configuration (merged into processors)
INSERT INTO configurations (key, value, category, description) VALUES
('page_load', '{
  "page_load": {
    "use_shared_browser": true,
    "timeout": 120000,
    "wait_until": "domcontentloaded",
    "stealth_mode": true
  }
}', 'performance', 'Global page load settings merged into processor configs');

-- Example workflow: Complete scraping with URL collection and auto-scaling
INSERT INTO workflows (name, description, steps, triggers) VALUES
('complete_scraping_workflow', 'Full workflow with URL collection, scraping, and auto-scaling', 
'[
  {
    "processor": "worker_autoscaler",
    "action": "check_and_scale",
    "params": {"trigger": "pre_job"}
  },
  {
    "processor": "url_collector",
    "action": "collect_urls",
    "params": {"sites": "all_enabled", "extract_links": true}
  },
  {
    "processor": "default_scraper", 
    "action": "scrape",
    "params": {"parallel": true, "check_duplicates": true}
  },
  {
    "processor": "telegram_notifier",
    "action": "notify",
    "params": {"template": "job_complete"}
  },
  {
    "processor": "worker_autoscaler",
    "action": "check_and_scale",
    "params": {"trigger": "post_job"}
  }
]',
'{
  "type": "cron",
  "schedule": "0 */6 * * *",
  "enabled": true,
  "conditions": {
    "min_enabled_sites": 1,
    "autoscaling_enabled": true
  }
}');

-- Simple scraping workflow (without auto-scaling)
INSERT INTO workflows (name, description, steps, triggers) VALUES
('simple_scraping', 'Basic scraping workflow for single worker mode', 
'[
  {
    "processor": "default_scraper", 
    "action": "scrape",
    "params": {"parallel": false, "check_duplicates": true}
  },
  {
    "processor": "telegram_notifier",
    "action": "notify",
    "params": {"template": "job_complete"}
  }
]',
'{
  "type": "cron",
  "schedule": "0 */4 * * *",
  "enabled": true,
  "conditions": {
    "autoscaling_enabled": false
  }
}');

-- Example site configuration with v2 features
INSERT INTO sites (name, base_url, config) VALUES
('Example News', 'https://example.com', '{
  "scraping": {
    "schedule": "0 */4 * * *",
    "stealth_mode": true,
    "max_depth": 2,
    "follow_patterns": ["/news/", "/articles/"],
    "exclude_patterns": ["/ads/", "/login/"],
    "extract_links": true,
    "timeout": 30000,
    "selectors": {
      "title": "h1, .title, .headline",
      "content": ".content, .article-body",
      "links": "a[href]"
    }
  },
  "url_collection": {
    "enabled": true,
    "default_operation": "url_collection",
    "follow_links": true,
    "max_urls_per_run": 100
  },
  "classification": {
    "article_patterns": ["/news/\\d+", "/article/"],
    "list_patterns": ["/category/", "/tag/"]
  },
  "duplicate_prevention": {
    "enabled": true,
    "check_url": true,
    "check_title_hash": true,
    "check_content_hash": false,
    "skip_duplicates": true
  },
  "notifications": {
    "on_complete": true,
    "on_error": true,
    "min_articles": 5
  },
  "autoscaling": {
    "enabled": true,
    "priority": "normal"
  }
}');

-- CNN Indonesia site configuration
INSERT INTO sites (name, base_url, config) VALUES
('CNN Indonesia', 'https://www.cnnindonesia.com', '{
  "url_collection": {
    "enabled": true,
    "collection_type": "indeks",
    "index_patterns": ["indeks"],
    "index_match_type": "path_segment",
    "max_links_on_page": 250,
    "max_urls_per_run": 150,
    "max_depth": 2,
    "respect_robots_txt": true,
    "robots_disallow_patterns": ["/video", "/foto", "/infografis"],
    "follow_patterns": ["/nasional", "/internasional", "/ekonomi", "/olahraga", "/teknologi", "/hiburan"],
    "exclude_patterns": ["/tag/", "/tv/", "/podcast/"],
    "dedupe_ttl_minutes": 60,
    "pagination": {
      "query_param": "page",
      "start_page": 1,
      "max_pages": 5
    },
    "page_load": {
      "timeout": 120000,
      "wait_until": "domcontentloaded"
    }
  },
  "scraping": {
    "stealth_mode": true,
    "follow_patterns": ["/nasional", "/internasional", "/ekonomi", "/olahraga", "/teknologi", "/hiburan"],
    "exclude_patterns": ["/video", "/foto", "/infografis"],
    "selectors": {
      "title": ["h1"],
      "content": [".detail-article", ".article-content", ".content"],
      "publish_time": ["time[datetime]", "meta[property=\"article:published_time\"]", ".date"],
      "links": "a[href]"
    },
    "publish_time": {
      "required": false,
      "raw_fallback": true,
      "enforce_rfc3339": true
    },
    "extract_links": true
  },
  "classification": {
    "article_patterns": ["/[a-z-]+/\\d{8}/", "/[a-z-]+/[a-z0-9-]+"],
    "list_patterns": ["/indeks", "/nasional", "/internasional", "/ekonomi", "/olahraga", "/teknologi", "/hiburan"]
  }
}');
