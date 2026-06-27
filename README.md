# Sapu

> **Sapu** — sweep articles off the web. Stealth Puppeteer scraper with URL classification, multi-site scheduling, and RabbitMQ workers.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)
![Status: production](https://img.shields.io/badge/Status-production-brightgreen?style=flat-square)
![TypeScript](https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white&style=flat-square)
![Node.js](https://img.shields.io/badge/-Node.js-339933?logo=nodedotjs&logoColor=white&style=flat-square)
![pnpm](https://img.shields.io/badge/-pnpm-F69220?logo=pnpm&logoColor=white&style=flat-square)
![Postgres](https://img.shields.io/badge/-Postgres-4169E1?logo=postgresql&logoColor=white&style=flat-square)
![RabbitMQ](https://img.shields.io/badge/-RabbitMQ-FF6600?logo=rabbitmq&logoColor=white&style=flat-square)
![Docker](https://img.shields.io/badge/-Docker-2496ED?logo=docker&logoColor=white&style=flat-square)

A configuration-driven news scraper. The complex stuff lives in the database as JSON; the codebase stays small.

---

## Why Sapu

Most scrapers accumulate abstractions: workers, queues, classifiers, schedulers, each their own service. Sapu collapses that. One TypeScript service, one Postgres database, one RabbitMQ exchange, and a small Vite admin panel.

Three things drove the design:

1. **Configuration over code** — site rules, processor definitions, URL patterns live in the database as JSON. Add a new site by inserting a row, not by shipping a commit.
2. **Stealth by default** — puppeteer-extra with the stealth plugin, automatic resource blocking (images, CSS, fonts), and per-site timeouts.
3. **Schedule-aware** — every site gets its own cron. The scheduler re-reads its own config at runtime.

## Quick start

### Docker (recommended)

```bash
git clone https://github.com/ahsanatha/sapu.git
cd sapu
cp .env.example .env
docker compose up -d
```

The API comes up on `:3000`, the admin panel on `:4321`. Bring Postgres and RabbitMQ up via the included `docker-compose.yml`.

### Local development

```bash
pnpm install
pnpm db:init          # create schema + seed reference data
pnpm dev              # API server (tsx watch)
pnpm worker           # scraper worker process
pnpm web:dev          # admin panel (Vite + React)
```

Requires Node 22+, pnpm 10+, Postgres 15+, RabbitMQ 3.13+.

## Architecture

```
┌─────────────────────┐
│  Scheduler (cron)   │   per-site cron, re-reads config at runtime
└──────────┬──────────┘
           ↓ publishes to sapu.jobs
┌─────────────────────┐
│  RabbitMQ exchange  │   routing keys: scraping, url_collection
└──────────┬──────────┘
           ↓
┌─────────────────────┐         ┌──────────────────┐
│  Worker pool        │  ←────  │  Auto-scaler     │  queue-depth aware
│  (stealth puppeteer)│         └──────────────────┘
└──────────┬──────────┘
           ↓
┌─────────────────────┐         ┌──────────────────┐
│  Postgres           │  ←────  │  Admin panel     │  Next.js + TanStack
│  - sites            │         │  (port 4321)     │
│  - processors       │         └──────────────────┘
│  - url_patterns     │
│  - articles         │
└─────────────────────┘
```

## Features

| | |
|---|---|
| 🕵️ **Stealth mode** | puppeteer-extra + stealth plugin; auto-blocks images/CSS/fonts |
| 🔍 **URL classification** | regex patterns in DB with confidence + domain filters |
| ⏰ **Multi-scheduler** | per-site cron, hot-reloadable, validated |
| 📈 **Auto-scaling workers** | queue-depth + utilization based, cooldown-bounded |
| 🐰 **RabbitMQ** | durable exchange, per-queue prefetch, DLQ |
| ⚙️ **Site configs** | JSON in DB; add sites by inserting rows |
| 🎯 **Smart discovery** | classification-filtered URL discovery |
| 🔔 **Telegram notifications** | per-event fanout (optional) |

## API

### Core

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Health check + feature status |
| `GET` | `/articles` | List articles with classification filter |
| `POST` | `/scrape` | Queue a single URL |
| `POST` | `/seed` | Queue all configured sites |

### URL classification

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/patterns` | List all classification patterns |
| `POST` | `/patterns` | Add a new pattern |
| `POST` | `/classify` | Classify a URL |

### Operations

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/scheduler` | Scheduler status + schedules |
| `GET` | `/scaler` | Auto-scaler stats |

## Database schema

The schema (`schema.sql`) is configuration-as-data:

| Table | Role |
|---|---|
| `configurations` | Generic key/value JSON (env-driven config) |
| `processors` | Worker, scheduler, telegram definitions |
| `sites` | Per-site scrape config (cron, timeout, concurrency) |
| `url_classification_patterns` | Regex → classification, with confidence |
| `articles` | Scraped articles with classification + scoring |
| `worker_stats` | Heartbeat + throughput per worker |

Run `pnpm db:init` to apply schema and seed reference data.

## Configuration

All runtime config via `.env`:

```bash
# Database
DATABASE_URL=postgresql://postgres@localhost:5432/sapu
RABBITMQ_URL=amqp://sapu:sapu123@localhost:5672/sapu

# Scraping
HEADLESS=true
STEALTH_MODE=true
TIMEOUT=30000
CONCURRENT_JOBS=5

# Scheduler
SCHEDULER_ENABLED=true
DEFAULT_CRON=0 */6 * * *

# Auto-scaling
AUTO_SCALE_ENABLED=true
AUTO_SCALE_MIN_WORKERS=1
AUTO_SCALE_MAX_WORKERS=5

# Admin auth (used as cookie name + bearer token)
ADMIN_PASSWORD=sapu123
ADMIN_ACCESS_TOKEN=change-me-in-env

# Telegram (optional)
TELEGRAM_ENABLED=false
```

## The stack

| Layer | Technology |
|---|---|
| API | Node.js 22, TypeScript 5, Fastify-style HTTP |
| Workers | Node.js 22, puppeteer-extra + stealth, tsx |
| Database | Postgres 15 |
| Queue | RabbitMQ 3.13 |
| Admin | Next.js 15, TanStack Router, TanStack Query |
| Mobile | React Native (Expo) |
| Cache | Postgres (no Redis — single-source-of-truth principle) |
| Deploy | Docker Compose |

## Honest limits

This was built for a specific workload and shaped by it:

- **Single-region, single-process** — fine for hundreds of sites, not designed for thousands.
- **Postgres-only persistence** — no Redis; the queue is the only ephemeral state.
- **Stealth ≠ magic** — puppeteer-extra mitigates, but dedicated anti-bot services can still detect it.

If you need horizontal scaling or stronger anti-detection, swap RabbitMQ for Kafka/NATS and look at `puppeteer-extra` + residential proxy rotation.

## License

MIT — see [LICENSE](LICENSE).