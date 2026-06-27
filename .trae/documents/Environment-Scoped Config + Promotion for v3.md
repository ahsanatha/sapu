## Objectives
- Reduce v3 code size and duplication while preserving the config-driven model.
- Introduce clean staging/production configuration management with seamless sync/promotion.
- Prefer minimal code changes and safe isolation.

## Codebase Simplifications (v3)
- Centralize config resolution:
  - Move pagination helpers and client context tweaks from the URL collector into a single `config` module (similar to existing import usage in `v3/src/plugins/scraper.ts:11` and `v3/src/plugins/url-collector.ts:9`).
  - Ensure scraper and URL collector consume the same resolvers to avoid drift.
- Remove unused fallbacks:
  - Delete `DEFAULT_SELECTORS` and `FALLBACK_SELECTORS` in `v3/src/plugins/scraper.ts:531-555` since selectors are required per site; keeps code strict and smaller.
- Unify HTML dump/debug logic:
  - Factor common HTML dump utility used by `/api/html` (`v3/src/server.ts:475-511`) and scraper debug block (`v3/src/plugins/scraper.ts:205-220`) into a shared helper.
- Dedupe consolidation:
  - Rely primarily on DB-backed `scheduled_index` (`v3/src/database.ts:315-343`), keep in-memory cache only as a short TTL optimization; document precedence.
- Logging consistency:
  - Normalize logging format and levels across engine/queue/plugins; reduce verbose logs where redundant.
- Strict typing and DTOs:
  - Define minimal interfaces for job payloads and processor params; enforce at plugin boundaries to catch config errors early.

## Environment Separation Options
- Option A (recommended): PostgreSQL schemas per env (`staging`, `production`).
  - Pros: Strong isolation, minimal code change (set `search_path`), no query rewrites.
  - Cons: Need initial DDL duplication and promotion routines.
- Option B: Single schema with `env` column on each table.
  - Pros: One set of tables and indexes.
  - Cons: Every query must filter by `env`; higher risk of mistakes; larger code changes.
- Option C: Separate databases (local vs remote) with export/import bundles.
  - Pros: Maximum isolation.
  - Cons: Heavier infra and sync flow.

## Recommended Design
- Use Option A: schemas `staging` and `production` with identical tables: `configurations`, `processors`, `workflows`, `sites`, `articles`, `scheduled_index`.
- Engine/API selection:
  - Add `DB_SCHEMA` env var. After connecting in `v3/src/database.ts:69-72`, issue `SET search_path TO <schema>, public` so all existing queries operate in the chosen env.
- RabbitMQ isolation:
  - Prefer distinct vhosts or prefixes via `RABBITMQ_URL` per env to avoid cross-environment job mixing.

## Sync & Promotion Flows
- Intra-DB (schema→schema): transactional upserts per table.
  - `configurations`: upsert by `key`.
  - `processors`, `workflows`, `sites`: upsert by `id`.
  - Exclude `articles` from promotion (runtime data).
- Cross-DB: export/import JSON bundle (configurations/processors/workflows/sites) with idempotent upsert apply.

## Minimal v3 Additions
- API endpoints:
  - `GET /api/config-bundle?env=staging|production` → export JSON `{ configurations, processors, workflows, sites }`.
  - `POST /api/config-bundle?env=staging|production` → apply bundle with validation and upsert.
  - `POST /api/promote` → body `{ from: "staging", to: "production", tables?: ["configurations","processors","workflows","sites"] }` executes intra-DB promotion.
- UI toggles:
  - Environment switch in `/config` and `/monitoring`; a "Promote to Production" action calling `/api/promote`.

## Dedicated Config Manager (Standalone Project)
- Scope: manage env schemas, export/import bundles, promotion, diffs, validation; small Express API + CLI.
- API:
  - `GET /envs` → list schemas.
  - `GET /bundle?env=staging` → export.
  - `POST /bundle/apply?env=production` → apply with upsert and validation.
  - `POST /promote` → schema-to-schema copy with transactional upserts.
  - `POST /diff` → `{ from, to }` diffs for selective promotion.
- CLI:
  - `acq-config export --env staging --out bundle.json`
  - `acq-config apply --env production --file bundle.json`
  - `acq-config promote --from staging --to production [--only processors,workflows,sites]`
  - `acq-config diff --from staging --to production`
- Security: token-based auth for write endpoints; audit table `public.config_audit` recording actor, action, counts, diffs.
- DB adapter: sets `search_path` per request; supports dual connections for cross-DB promotion.

## Verification Plan
- Local: run with `DB_SCHEMA=staging`, change configs, export bundle, promote to `production` schema, confirm via `GET /api/configurations` using `DB_SCHEMA=production`.
- Cross-DB: export local staging bundle, apply to remote prod, verify processors/workflows/sites match.
- Engine: restart with `DB_SCHEMA=production` and check `/api/status` uses correct env; monitor via `/api/events/stream`.

## Rollout Steps
1. Create `staging`/`production` schemas and mirror DDL.
2. Set `DB_SCHEMA` in `.env` and runtime envs.
3. Implement minimal endpoints or deploy the dedicated Config Manager.
4. Document promotion procedures and protect prod with auth.

## Outcome
- Smaller, cleaner v3 codebase and a safe, low-touch configuration workflow with staging→production promotion and bundle-based sync.