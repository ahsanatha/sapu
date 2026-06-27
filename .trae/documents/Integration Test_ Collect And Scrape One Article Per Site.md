## Goal
Create a runnable integration script that:
1. Loads all enabled site configs.
2. For each site: run URL collection, limit to exactly one article candidate.
3. Scrape that single article.
4. Emit clear debug logs for each step.

## Key Approach
- Implement as a TypeScript integration script executed via `tsx` (no test framework required in this repo).
- Call plugin entry points directly (`collectUrls`, `scrape`) to control runtime config without touching DB-configured processors.
- Temporarily override runtime limits on the in-memory `site.config` to enforce "process only 1 article" without persisting changes.
- Add `console.debug` logs in the script around each process; rely on existing plugin logs for internal steps.

## File & Script
- Add file: `v3/src/tests/int-collect-and-scrape.ts`.
- Add npm script: `"test:int:collect-scrape": "tsx src/tests/int-collect-and-scrape.ts"`.

## Implementation Outline
1. Bootstrap
   - Import `db`, `collectUrls`, `scrape`, and `type Site` using `.js` import suffixes to match current ESM style.
   - `await db.connect()` at start; `await db.close()` in `finally`.

2. Load Sites
   - `const sites = await db.getSites(true)`.
   - If none, log and exit.

3. Per-Site Run
   - For each `site`:
     - Deep-clone `site.config` and override limits: `url_collection.max_urls_per_run = 1`, ensure `max_links_on_page` is a sane value (e.g., 50).
     - Build `runtimeConfig`:
       - `page_load`: `{ timeout: 60000, protocol_timeout: 60000, wait_until: 'domcontentloaded', use_shared_browser: true }`.
       - `job_spawning`: `{ create_scrape_jobs: false, create_collection_jobs: false }` to avoid queue side effects.
       - `duplicate_prevention`: `{ enabled: true, check_existing_articles: true }`.
     - Log start: `console.debug('[site] starting url collection', { site: site.name })`.
     - Call `collectUrls('collect_urls', { site: siteOverride, collection_type: 'general' }, runtimeConfig)`.
     - From the result, pick first `collected_urls[0]` if available; if empty, log and continue to next site.
     - Log chosen URL.
     - Call `scrape('scrape', { site: siteOverride, url: chosenUrl, check_duplicates: true }, runtimeConfig)`.
     - Log scrape summary (success/skipped, title length, content length, publish_time presence).

4. Error Handling & Debugging
   - Wrap per-site run in try/catch; on error log `console.debug({ site: site.name, error })` and continue.
   - Existing plugin logs already include detailed debug info (navigation retries, selector details, redirect and HTTP status warnings).

5. Output
   - Aggregate per-site results and print a compact JSON summary at the end: `{ total_sites, successes, skips, failures }`.

## Verification
- Run locally: `npm run test:int-collect-scrape`.
- Expect:
  - Visible logs: "Starting URL collection", per-site debug, chosen URL, "Starting scraping", selector debug, final per-site result.
  - At most one article scraped per site.
  - No queue jobs published (disabled via `job_spawning`).

## Notes
- Uses the repo’s ESM pattern with `.js` import suffixes.
- Honors ACQ v3 configuration-over-code by not persisting overrides; only runtime control for the test.
- If any site is missing required `url_collection` fields, the test logs and skips it without failing the whole run.