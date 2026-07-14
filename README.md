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

1. **Configuration over code** — site rules, processor definitions, URL patterns live in the database as JSON. Add a new site by adding a JSON file to `config/sites/`.
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
│  Postgres           │  ←────  │  Admin panel     │  React + Vite
│  - articles         │         │  (port 4321)     │
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
| ⚙️ **Site configs** | JSON files in `config/sites/`; add sites by dropping a file |
| 🎯 **Smart discovery** | classification-filtered URL discovery |
| 🔔 **Telegram notifications** | per-event fanout (optional) |

## API

### x402-ready stateless extraction

Public endpoints that can be placed behind x402 middleware and priced per route:

| Method | Path | Purpose | Suggested x402 price |
|---|---|---|---:|
| `GET` | `/x402/health` | Public product/route metadata | free |
| `GET` | `/x402/cost/estimate` | Unit economics estimate | free |
| `POST` | `/x402/classify-url` | CPU-only URL classification | `$0.001` |
| `POST` | `/x402/fetch/http` | Bounded HTTP fetch | `$0.003` |
| `POST` | `/x402/extract/links` | Extract links from fetched HTML | `$0.003` |
| `POST` | `/x402/extract/article` | HTTP-only title/text/link extraction | `$0.005` |
| `POST` | `/x402/extract/article/browser` | Browser-rendered article extraction | `$0.018` |
| `POST` | `/x402/fetch/browser` | Browser-rendered fetch | `$0.015+` |

Example:

```bash
curl -s http://localhost:3000/x402/health

curl -s http://localhost:3000/x402/classify-url \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/news/article"}'

curl -s http://localhost:3000/x402/extract/article \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com","includeText":true}'

curl -s http://localhost:3000/x402/extract/article/browser \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com","includeText":true}'

curl -s 'http://localhost:3000/x402/cost/estimate?endpoint=fetch-browser&seconds=10'
```

Operational guardrail: cheap HTTP extraction routes must not launch browser
rendering. Browser rendering is exposed as separate higher-priced routes.

### x402 payment gate

The server includes x402 v2 Express middleware. It is disabled by default for
local development and turns on only when both conditions are true:

```bash
X402_ENABLED=true
X402_PAY_TO=0xYourSellerWalletAddress
```

Default seller config:

```bash
X402_NETWORK=eip155:84532
X402_FACILITATOR_URL=https://x402.org/facilitator
X402_RESOURCE_BASE_URL=https://sapu.rekursa.id
```

`GET /x402/health` and `GET /x402/cost/estimate` stay free. The paid routes
return x402 v2 payment requirements and expect the `PAYMENT-SIGNATURE` header.
Successful paid responses include the x402 `PAYMENT-RESPONSE` header.

### Core

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Health check + feature status |
| `GET` | `/api/articles` | List articles with classification filter |
| `GET` | `/api/scrape` | Queue a single URL |
| `GET` | `/api/stories` | Story clusters via pgvector KNN |

### URL classification

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/patterns` | List all classification patterns |
| `POST` | `/patterns` | Add a new pattern |
| `POST` | `/classify` | Classify a URL |

### Operations

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/status` | System status + queue depth |
| `GET` | `/api/events/stream` | Real-time SSE monitoring |

## Database schema

The schema (`schema.sql`) is configuration-as-data:

| Table | Role |
|---|---|
| `configurations` | Generic key/value JSON (env-driven config) |
| `processors` | Worker, notifier definitions |
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

# Embeddings (via OpenRouter)
OPENROUTER_API_KEY=sk-or-v1-your-key-here
OPENROUTER_EMBEDDING_MODEL=openai/text-embedding-3-large

# Admin auth (HMAC signature)
ADMIN_PASSWORD=sapu123

# Telegram (optional)
TELEGRAM_ENABLED=false
```

## The stack

| Layer | Technology |
|---|---|
| API | Node.js 22, TypeScript 5, Express 4 |
| Workers | Node.js 22, puppeteer-extra + stealth, tsx |
| Database | Postgres 15, pgvector |
| Queue | RabbitMQ 3.13 |
| Admin | React 19, Vite 5, Tailwind CSS |
| Cache | Postgres (no Redis — single-source-of-truth principle) |
| Deploy | Docker Compose (split-VM: control plane + workers) |

## Honest limits

This was built for a specific workload and shaped by it:

- **Single-region, single-process** — fine for hundreds of sites, not designed for thousands.
- **Postgres-only persistence** — no Redis; the queue is the only ephemeral state.
- **Stealth ≠ magic** — puppeteer-extra mitigates, but dedicated anti-bot services can still detect it.

If you need horizontal scaling or stronger anti-detection, swap RabbitMQ for Kafka/NATS and look at `puppeteer-extra` + residential proxy rotation.

## License

MIT — see [LICENSE](LICENSE).
