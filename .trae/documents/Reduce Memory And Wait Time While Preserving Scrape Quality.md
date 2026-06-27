## Goals
- Cut memory footprint per worker while keeping scrape correctness
- Reduce average wait time to extract content and publish
- Stay configuration-first: prefer JSON config tuning over code changes

## Current State
- Scraper uses Puppeteer via `getBrowser` with optional shared browser (`page_load.use_shared_browser`)
- Page defaults: `wait_until` from site/global config; selectors enforced strictly; pages closed after job
- Concurrency controlled by RabbitMQ prefetch and site `url_collection.max_concurrency`

## Configuration Tuning
- Page load
  - Set `scraping.page_load.wait_until: 'domcontentloaded'` (faster than `networkidle*`)
  - Set `scraping.page_load.timeout: 15000`, `protocol_timeout: 20000`
  - Keep `page_load.headless: true`, `use_shared_browser: true`
- Browser flags (`page_load.args`)
  - Add `['--disable-gpu','--disable-dev-shm-usage','--no-default-browser-check','--no-first-run','--disable-background-networking','--disable-background-timer-throttling','--disable-features=NetworkService,Translate,BackForwardCache']`
- Concurrency limits
  - Set `url_collection.max_concurrency: 2` for each site initially
  - Tune RabbitMQ prefetch: `scraping: 1–2`, `url_collection: 1–2` (aggregate via autoscaler)
- Dedupe/limits
  - Enable `duplicate_prevention.enabled: true`, `skip_duplicates: true`
  - Tune `max_urls_per_run`, `max_index_pages_per_run`, `max_found_urls` to prevent surges
- Debug/IO
  - Add `debug.dump_html: false` to disable HTML dump during normal runs

## Engine/Queue Strategy
- Preemptive backlog control
  - Use autoscaler `min_workers: 1`, `max_workers: 8`, `scale_up_threshold: 0.8`
  - Lower prefetch if backlog spikes without enough compute
- Short-timeout retry
  - First navigation at 10–15s, second at 30s (already supported by `gotoWithRetry`)

## Browser Optimization (Config-Driven)
- Resource blocking
  - Introduce config `scraping.block_resources: ['image','stylesheet','font','media']`
  - Implementation: intercept requests and abort matching types to reduce bandwidth/memory
- JS execution
  - Introduce `scraping.disable_javascript: true` for static sites; use per-site opt-in
- Page reuse
  - Keep shared browser; optionally add `page_pool_size` for reuse if needed

## Scraping Mode Split (Optional)
- Add `scraping.mode: 'http' | 'browser'`
  - `http`: use HTTP fetch + HTML parser for static sites (crucial for memory/time savings)
  - `browser`: current Puppeteer path for dynamic sites

## URL Collection Controls
- Per-site depth and collection type
  - Keep `collection_type` hints and `max_depth` minimal by default (0–1)
  - Respect robots.txt and disallow patterns to reduce crawling of irrelevant pages

## Monitoring & SLOs
- Track key metrics via `/api/status` + graphs
  - Backlog (messages), workers, scraping/url messages
- Targets
  - p50 scrape < 5s; p95 < 15s on static sites
  - Memory RSS per worker < 300MB (shared browser)

## Rollout Plan
1. Update site/global JSON configs with:
   - `scraping.page_load` timeouts + `wait_until: 'domcontentloaded'`
   - `page_load.args` (flags)
   - `url_collection.max_concurrency: 2`, dedupe settings, run limits
   - `debug.dump_html: false`
2. Implement config-driven resource blocking and optional JS disable in scraper (small code change)
3. (Optional) Implement HTTP-mode scraper for static sites and map sites via config
4. Tune autoscaler prefetch/min/max workers based on monitored backlog
5. Validate with staged sites, watch graphs; adjust per-site configs where dynamic content requires JS

## Expected Impact
- 30–60% memory reduction by resource blocking + shared browser
- 20–50% latency reduction by early `domcontentloaded` and tighter timeouts
- Stable throughput from controlled concurrency and dedupe
