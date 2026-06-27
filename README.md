# Sapu

Balanced news scraper with key sophisticated features while maintaining simplicity.

## Features

- **🕵️ Stealth Mode**: Puppeteer-extra with stealth plugin for undetected scraping
- **🔍 URL Classification**: Database-backed regex patterns for intelligent URL filtering
- **⏰ Multi-Scheduler**: Per-site cron scheduling with configurable intervals
- **📈 Auto-Scaling**: Dynamic worker scaling based on queue depth and utilization
- **🐰 RabbitMQ**: Robust message queuing for job management
- **⚙️ Site Configs**: Database-driven site configurations with per-site settings
- **🎯 Smart Discovery**: Intelligent URL discovery with classification filtering

## Quick Start

```bash
# Copy environment
cp .env.example .env

# Start with Docker
docker-compose up -d

# Or run locally
pnpm install
pnpm run dev
```

## API Endpoints

### Core Operations
- `GET /health` - Health check with feature status
- `GET /articles?classification=article&limit=50` - List articles with filtering
- `POST /scrape` - Queue single URL with config
- `POST /seed` - Start scraping all configured sites

### URL Classification
- `GET /patterns` - List all URL classification patterns
- `POST /patterns` - Add new classification pattern
- `POST /classify` - Classify a URL

### Monitoring
- `GET /scheduler` - Scheduler status and schedules
- `GET /scaler` - Auto-scaler statistics and status

## Architecture

```
src/
├── app.ts                  # Main entry point with all APIs
├── database.ts             # Direct SQL operations
├── queue.ts                # Enhanced RabbitMQ wrapper
├── scraper.ts              # Smart scraper with classification
├── scheduler/
│   └── index.ts           # Multi-scheduler with cron
├── worker/
│   └── auto-scaler.ts     # Dynamic worker scaling
├── utils/
│   ├── url-classifier.ts  # Regex-based URL classification
│   └── stealth-browser.ts # Stealth browser management
└── sites/                 # Site-specific extractors
    ├── kompas.ts
    ├── cnn.ts
    └── index.ts
```

## Database Schema

### Sites Configuration
```sql
sites (
  id, name, domain, base_url, active,
  stealth_mode, timeout, max_concurrent, schedule_cron
)
```

### URL Classification Patterns
```sql
url_classification_patterns (
  pattern, classification, confidence, priority,
  domain_filter, success_count, total_count
)
```

### Articles with Classification
```sql
articles (
  id, site_id, url, title, content,
  classification, published_at, scraped_at
)
```

### Worker Statistics
```sql
worker_stats (
  worker_id, status, jobs_processed, last_heartbeat
)
```

## Configuration

### Stealth Mode
- **Enabled**: Uses puppeteer-extra with stealth plugin
- **Disabled**: Uses standard Puppeteer
- **Resource Blocking**: Automatically blocks images, CSS, fonts for speed

### URL Classification
- **Article Patterns**: High-priority patterns for article URLs
- **Collection Patterns**: Lower-priority patterns for category/listing pages
- **Domain Filtering**: Patterns can be restricted to specific domains
- **Statistics Tracking**: Success/total counts for pattern effectiveness

### Auto-Scaling
- **Queue-Based**: Scales based on RabbitMQ queue depth
- **Utilization-Based**: Scales based on worker utilization percentage
- **Cooldown Periods**: Prevents rapid scaling oscillations
- **Min/Max Limits**: Configurable worker count boundaries
 - **Per-Queue Prefetch**: Each queue can have distinct prefetch (concurrency)
 - **Config-Driven**: Database processor config is authoritative; `QUEUE_PREFETCH` is initial boot default only

### Multi-Scheduler
- **Per-Site Cron**: Each site can have its own schedule
- **Dynamic Updates**: Schedules can be updated via API
- **Validation**: Cron expressions are validated before activation

## Key Features Retained

- ✅ **Regex Patterns in Database**: Dynamic URL classification
- ✅ **URL Classification Engine**: Smart content filtering
- ✅ **Stealth Mode**: Undetected browser automation
- ✅ **Multiple Schedulers**: Per-site scheduling flexibility
- ✅ **Worker Auto-Scale**: Dynamic resource management
- ✅ **RabbitMQ**: Robust message queuing
- ✅ **Simple Site Config Table**: Database-driven configuration

## Balanced Approach

**Kept Complex Features:**
- URL classification with regex patterns
- Stealth browser automation
- Multi-scheduler system
- Auto-scaling workers
- RabbitMQ integration
- Site configuration management

**Simplified Architecture:**
- Single TypeScript service
- Direct SQL queries
- Minimal abstraction layers
- Essential APIs only
- Container-ready deployment

**Result: 70% complexity reduction while retaining sophisticated features**
