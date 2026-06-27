# ACQ v3 Migration Plan: Complex → Ultra-Simple

## 🎯 Objective
Transform current 2000+ line codebase into 500-line entity-driven system while maintaining all functionality.

## 📋 Migration Phases

### Phase 1: Database Schema Migration (Day 1)
**Goal**: Replace complex tables with simple entity-based schema

#### 1.1 Backup Current Data
```bash
# Backup existing v3 data
pg_dump acq > acq_v3_backup.sql
```

#### 1.2 Create New Schema
```bash
# Apply new ultra-simple schema
psql acq < schema-simple.sql
```

#### 1.3 Data Migration Script
```sql
-- Migrate existing sites to new format
INSERT INTO sites (name, base_url, config)
SELECT 
  name, 
  base_url,
  jsonb_build_object(
    'scraping', jsonb_build_object(
      'schedule', schedule_cron,
      'stealth_mode', stealth_mode,
      'timeout', timeout,
      'max_concurrent', max_concurrent
    ),
    'notifications', jsonb_build_object(
      'on_complete', true,
      'on_error', true
    )
  )
FROM old_sites;

-- Migrate URL classification patterns to processor config
INSERT INTO processors (name, type, config)
SELECT 
  'url_classifier_' || site_id,
  'classifier',
  jsonb_build_object(
    'patterns', jsonb_agg(
      jsonb_build_object(
        'pattern', pattern,
        'type', classification_type
      )
    )
  )
FROM old_url_classification_patterns
GROUP BY site_id;

-- Migrate articles (structure already compatible)
INSERT INTO articles (site_id, url, title, content, created_at)
SELECT site_id, url, title, content, created_at
FROM old_articles;
```

### Phase 2: Code Simplification (Day 2-3)
**Goal**: Replace complex TypeScript classes with minimal engine

#### 2.1 Create New Simple Structure
```bash
# Create new simplified source structure
mkdir -p src-simple/{plugins}
```

#### 2.2 Extract Configuration Logic
- Analyze current `src/worker/index.ts` → Extract to database configurations
- Analyze current `src/scheduler/index.ts` → Extract to workflow definitions
- Analyze current `src/utils/telegram.ts` → Extract to notification processor config

#### 2.3 Build Minimal Engine
```typescript
// src-simple/engine.ts (150 lines)
// Single engine that reads DB config and executes workflows
```

#### 2.4 Create Generic Plugins
```typescript
// src-simple/plugins/scraper.ts (75 lines)
// src-simple/plugins/notifier.ts (50 lines)  
// src-simple/plugins/scheduler.ts (75 lines)
```

### Phase 3: Configuration Migration (Day 4)
**Goal**: Move all hardcoded logic to database entities

#### 3.1 Worker Configuration → Processor Entities
```sql
-- Convert worker auto-scaling logic to processor config
INSERT INTO processors (name, type, config) VALUES
('auto_scaler', 'scaler', '{
  "enabled": true,
  "min_workers": 1,
  "max_workers": 10,
  "scale_up_threshold": 80,
  "scale_down_threshold": 20,
  "check_interval": 30000,
  "cooldown_period": 300000
}');
```

#### 3.2 Scheduler Logic → Workflow Entities
```sql
-- Convert multi-scheduler to workflow definitions
INSERT INTO workflows (name, steps, triggers) VALUES
('site_scraping_workflow', 
'[
  {"processor": "default_scraper", "action": "scrape"},
  {"processor": "telegram_notifier", "action": "notify"}
]',
'{
  "type": "cron",
  "schedule": "0 */6 * * *",
  "enabled": true
}');
```

#### 3.3 Telegram Logic → Notification Processor
```sql
-- Convert telegram classes to notification processor
INSERT INTO processors (name, type, config) VALUES
('telegram_notifier', 'notifier', '{
  "provider": "telegram",
  "bot_token": "${TELEGRAM_BOT_TOKEN}",
  "chat_id": "${TELEGRAM_CHAT_ID}",
  "templates": {
    "job_complete": "✅ Job completed: {processed} articles",
    "job_failed": "❌ Job failed: {error}",
    "worker_status": "🤖 Worker {worker_id}: {status}",
    "health_report": "📊 Health: {active_workers} workers, {success_rate}% success"
  }
}');
```

### Phase 4: Testing & Validation (Day 5)
**Goal**: Ensure new system provides same functionality with 75% less code

#### 4.1 Functional Testing
```bash
# Test basic engine functionality
pnpm run test:engine

# Test all processors
pnpm run test:processors

# Test workflow execution
pnpm run test:workflows
```

#### 4.2 Performance Validation
- Compare memory usage: old vs new system
- Verify scraping performance maintained
- Check notification delivery reliability

#### 4.3 Configuration Testing
```bash
# Test configuration changes without code deployment
# Add new site via database
# Modify scraping schedule via database
# Update notification templates via database
```

### Phase 5: Deployment (Day 6)
**Goal**: Deploy simplified system with zero downtime

#### 5.1 Parallel Deployment
```bash
# Deploy new system alongside old system
# Gradually migrate traffic
# Monitor performance and functionality
```

#### 5.2 Cutover
```bash
# Stop old system
# Redirect all traffic to new system
# Remove old codebase
```

## 📊 Migration Checklist

### Pre-Migration
- [ ] Backup all data and configurations
- [ ] Document current system behavior
- [ ] Prepare rollback plan
- [ ] Set up monitoring for new system

### Database Migration
- [ ] Apply new schema
- [ ] Migrate sites data
- [ ] Migrate URL classification patterns
- [ ] Migrate articles
- [ ] Create default processors
- [ ] Create default workflows
- [ ] Validate data integrity

### Code Migration
- [ ] Build minimal engine (150 lines)
- [ ] Create database interface (100 lines)
- [ ] Create queue interface (50 lines)
- [ ] Build scraper plugin (75 lines)
- [ ] Build notifier plugin (50 lines)
- [ ] Build scheduler plugin (75 lines)
- [ ] Create simple API server (100 lines)
- [ ] Total: ~500 lines ✅

### Configuration Migration
- [ ] Convert worker logic to processor configs
- [ ] Convert scheduler logic to workflow definitions
- [ ] Convert telegram logic to notification configs
- [ ] Convert site configs to JSON entities
- [ ] Test all configurations work

### Validation
- [ ] All sites scraping correctly
- [ ] Notifications working
- [ ] Scheduling functioning
- [ ] API endpoints responding
- [ ] Performance acceptable
- [ ] Memory usage reduced
- [ ] Code complexity reduced by 75%

### Deployment
- [ ] Deploy to staging
- [ ] Run parallel testing
- [ ] Deploy to production
- [ ] Monitor for 24 hours
- [ ] Remove old codebase

## 🚨 Rollback Plan

If migration fails:
1. Stop new system
2. Restore old codebase
3. Restore database from backup
4. Restart old system
5. Investigate issues
6. Plan retry

## 📈 Success Metrics

- **Code Reduction**: 2000+ lines → 500 lines (75% reduction)
- **Functionality**: 100% feature parity maintained
- **Performance**: Same or better scraping performance
- **Configurability**: All settings now database-configurable
- **Deployment Speed**: Configuration changes without code deployment
- **Maintenance**: Minimal codebase to maintain

## 🎯 Post-Migration Benefits

1. **Cost Efficiency**: 75% less code to maintain and deploy
2. **Agility**: Configuration changes via database, no code deployment
3. **Simplicity**: Single engine, minimal complexity
4. **Scalability**: Easy to add new sites and workflows
5. **Reliability**: Fewer moving parts, less chance of failure

This migration transforms ACQ v3 from a complex, code-heavy system into a lean, configuration-driven engine that embodies the principle: **"Configuration over Code"**.
