# ACQ v3 Ultra-Simple Architecture

## 🎯 Goal: 500 Lines of Code Total (Down from 2000+)

### Current Complex Structure → New Simple Structure

```
BEFORE (2000+ lines):                    AFTER (500 lines):
├── src/                                 ├── src/
│   ├── app.ts (200 lines)              │   ├── engine.ts (150 lines)    # Main engine
│   ├── worker/index.ts (300 lines)     │   ├── database.ts (100 lines)  # DB interface
│   ├── scheduler/index.ts (250 lines)  │   ├── queue.ts (50 lines)      # Queue interface
│   ├── scraper.ts (200 lines)          │   ├── plugins/                 # Generic plugins
│   ├── database.ts (150 lines)         │   │   ├── scraper.ts (75 lines)
│   ├── queue.ts (100 lines)            │   │   ├── notifier.ts (50 lines)
│   ├── utils/telegram.ts (250 lines)   │   │   └── scheduler.ts (75 lines)
│   ├── sites/ (300 lines)              │   └── server.ts (100 lines)    # Simple API
│   └── utils/ (500+ lines)             └── Total: ~500 lines
└── Total: 2000+ lines
```

## 🏗️ Core Components

### 1. Engine (150 lines) - `src/engine.ts`
**Single main process that orchestrates everything**

```typescript
// Pseudo-code structure:
class Engine {
  async start() {
    // Load configurations from database
    // Initialize processors based on DB config
    // Start event loop
    // Process workflows based on triggers
  }
  
  async processWorkflow(workflow) {
    // Execute workflow steps sequentially
    // Use generic processors with JSON config
    // Log events to database
  }
  
  async handleEvent(event) {
    // Process events from queue or database
    // Trigger appropriate workflows
    // Update event status
  }
}
```

### 2. Database Interface (100 lines) - `src/database.ts`
**Simple CRUD operations for entities**

```typescript
// Pseudo-code structure:
export const db = {
  getConfigurations: () => Promise<Config[]>,
  getProcessors: (type?: string) => Promise<Processor[]>,
  getWorkflows: (enabled?: boolean) => Promise<Workflow[]>,
  getSites: (enabled?: boolean) => Promise<Site[]>,
  saveArticle: (article: Article) => Promise<void>,
  logEvent: (event: Event) => Promise<void>,
  updateEventStatus: (id: string, status: string) => Promise<void>
}
```

### 3. Queue Interface (50 lines) - `src/queue.ts`
**Minimal RabbitMQ wrapper**

```typescript
// Pseudo-code structure:
export const queue = {
  connect: () => Promise<void>,
  publish: (data: any) => Promise<void>,
  consume: (handler: Function) => Promise<void>,
  close: () => Promise<void>
}
```

### 4. Generic Plugins (200 lines total)

#### Scraper Plugin (75 lines) - `src/plugins/scraper.ts`
```typescript
// Reads scraping config from database
// Generic scraper that adapts based on JSON config
// No hardcoded business logic
export async function scrape(config: ScrapingConfig, url: string) {
  // Use config.selectors, config.filters, etc.
  // Return standardized result
}
```

#### Notifier Plugin (50 lines) - `src/plugins/notifier.ts`
```typescript
// Generic notifier supporting multiple providers
// Configuration-driven templates and rate limiting
export async function notify(config: NotificationConfig, message: any) {
  // Use config.provider, config.templates, etc.
  // Send notification via configured provider
}
```

#### Scheduler Plugin (75 lines) - `src/plugins/scheduler.ts`
```typescript
// Generic scheduler reading cron configs from database
// No hardcoded scheduling logic
export function schedule(config: SchedulerConfig, workflows: Workflow[]) {
  // Use config.default_schedule, config.timezone, etc.
  // Schedule workflows based on their triggers
}
```

### 5. Simple API Server (100 lines) - `src/server.ts`
**Minimal REST API for configuration management**

```typescript
// Basic CRUD endpoints for database entities
// No complex business logic
app.get('/api/sites', () => db.getSites())
app.post('/api/sites', (req, res) => db.createSite(req.body))
app.get('/api/processors', () => db.getProcessors())
app.post('/api/workflows/trigger/:id', (req, res) => engine.triggerWorkflow(req.params.id))
```

## 🔄 How It Works

### 1. Configuration-Driven Execution
- Engine reads all configuration from database on startup
- No hardcoded business rules or complex classes
- Everything is JSON-configurable

### 2. Event-Driven Processing
- Workflows trigger based on database-defined conditions
- Events logged to database for monitoring
- Simple state machine: pending → processing → completed/failed

### 3. Generic Plugin System
- Plugins read behavior from JSON configuration
- No plugin-specific business logic
- Easily extensible through database configuration

### 4. Database as Brain
- All intelligence lives in database entities
- Code is purely execution engine
- Changes require no code deployment, only database updates

## 📊 Complexity Reduction

| Component | Before | After | Reduction |
|-----------|--------|-------|-----------|
| Worker Logic | 300 lines | 0 lines | 100% |
| Scheduler Classes | 250 lines | 75 lines | 70% |
| Telegram Integration | 250 lines | 50 lines | 80% |
| Site Management | 300 lines | 0 lines | 100% |
| Business Logic | 500+ lines | 0 lines | 100% |
| **Total** | **2000+ lines** | **500 lines** | **75%** |

## 🚀 Benefits

1. **Cost Efficiency**: 75% less code to maintain and deploy
2. **Flexibility**: All behavior configurable through database
3. **Simplicity**: Single engine, generic plugins, no complex classes
4. **Scalability**: Add new sites/workflows without code changes
5. **Maintainability**: Minimal codebase, maximum configurability

## 🔧 Configuration Examples

### Scraping Configuration
```json
{
  "stealth_mode": true,
  "timeout": 30000,
  "selectors": {
    "title": "h1, .title",
    "content": ".article-body"
  },
  "filters": {
    "min_content_length": 100
  }
}
```

### Notification Configuration
```json
{
  "provider": "telegram",
  "templates": {
    "job_complete": "✅ Scraped {count} articles from {site}"
  },
  "rate_limit": {
    "max_per_minute": 20
  }
}
```

### Workflow Configuration
```json
{
  "steps": [
    {"processor": "scraper", "action": "scrape"},
    {"processor": "notifier", "action": "notify"}
  ],
  "triggers": {
    "type": "cron",
    "schedule": "0 */6 * * *"
  }
}
```

This architecture follows Facebook's engineering principles: **move fast with stable infrastructure**. The database becomes our stable infrastructure, while the minimal code allows for rapid iteration and deployment.