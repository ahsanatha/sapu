import { db } from '../database.js'
import { collectUrls } from '../plugins/url-collector.js'
import { scrape } from '../plugins/scraper.js'
import { getBrowser } from '../plugins/browser.js'

async function run() {
  await db.connect()
  await getBrowser({ page_load: { use_shared_browser: true } })
  try {
    const sites = await db.getSites(true)
    const summary: any = { total_sites: sites.length, successes: 0, skips: 0, failures: 0, results: [] }
    if (!sites || !sites.length) {
      console.debug('no enabled sites')
      return
    }
  for (const site of sites) {
      console.debug('site:start', { site: site.name })
      try {
        const runtimeConfig: any = {
          page_load: { timeout: 30000, protocol_timeout: 30000, wait_until: 'domcontentloaded', use_shared_browser: true },
          job_spawning: { create_scrape_jobs: false, create_collection_jobs: false },
          duplicate_prevention: { enabled: true, check_existing_articles: true },
          accept_language: 'id-ID',
          navigator_language: 'id-ID',
          navigator_languages: ['id-ID','id']
        }
        console.debug('url-collection:start', { site: site.name })
        const tColStart = Date.now()
        const colRes = await collectUrls('collect_urls', { site, collection_type: 'general' }, runtimeConfig, true)
        const tColMs = Date.now() - tColStart
        const tColSec = Number((tColMs / 1000).toFixed(2))
        const perSite = Array.isArray(colRes?.results) ? colRes.results[0] : colRes
        let first = Array.isArray(perSite?.collected_urls) && perSite.collected_urls.length ? perSite.collected_urls[0] : null
        if (!first) {
          const found = Array.isArray(perSite?.found_urls) ? perSite.found_urls : []
          const pats = Array.isArray((site as any)?.config?.classification?.article_patterns) ? (site as any).config.classification.article_patterns as string[] : []
          const match = (u: string, p: string) => {
            if (!p || !u) return false
            if (p.startsWith('regex:')) {
              try { return new RegExp(p.slice('regex:'.length)).test(u) } catch { return false }
            }
            return u.includes(p)
          }
          const filtered = found.filter((u: string) => pats.length ? pats.some((p) => match(u, p)) : true)
          first = filtered.length ? filtered[0] : null
        }
        console.debug('url-collection:result', { site: site.name, urls_found: perSite?.urls_found, urls_collected: perSite?.urls_collected, duplicates_skipped: perSite?.duplicates_skipped, first })
        if (!first) {
          const sampleFound = Array.isArray(perSite?.found_urls) ? perSite.found_urls.slice(0, 10) : []
          console.debug('url-collection:sample_found', { site: site.name, sampleFound })
        }
        console.debug('url-collection:time_s', { site: site.name, s: tColSec })
        
        if (!first) {
          summary.skips++
          summary.results.push({ site: site.name, status: 'no_article_candidate', urls_found: colRes?.urls_found, urls_collected: colRes?.urls_collected })
          continue
        }
        console.debug('scrape:start', { site: site.name, url: first })
        const tScrapeStart = Date.now()
        const sres = await scrape('scrape', { site, url: first, check_duplicates: true }, runtimeConfig)
        const tScrapeMs = Date.now() - tScrapeStart
        const tScrapeSec = Number((tScrapeMs / 1000).toFixed(2))
        const siteResult = Array.isArray(sres?.results) ? sres.results[0] : sres
        const ok = Boolean(siteResult?.success && siteResult?.article_id)
        const effectiveCollected = ok ? 1 : 0
        console.debug('scrape:result', { site: site.name, success: ok, title: siteResult?.title, content_length: siteResult?.content_length, skipped: siteResult?.skipped, reason: siteResult?.reason, effective_collected: effectiveCollected })
        console.debug('scrape:meta', { site: site.name, metadata: siteResult?.metadata })
        console.debug('scrape:time_s', { site: site.name, s: tScrapeSec })
        if (ok) {
          summary.successes++
          summary.results.push({ site: site.name, status: 'success', article_id: siteResult?.article_id, url: siteResult?.url, title: siteResult?.title, content_length: siteResult?.content_length, effective_collected: effectiveCollected })
        } else {
          summary.skips++
          summary.results.push({ site: site.name, status: siteResult?.skipped ? siteResult?.reason || 'skipped' : 'failed', url: siteResult?.url, reason: siteResult?.reason, effective_collected: effectiveCollected })
        }
      } catch (e: any) {
        console.debug('site:error', { site: site.name, error: e?.message || String(e) })
        summary.failures++
        summary.results.push({ site: site.name, status: 'error', error: e?.message || String(e) })
      }
    }
    console.log(JSON.stringify(summary, null, 2))
  } catch (e: any) {
    console.debug('program:error', { error: e?.message || String(e) })
  }
  console.debug('program:cleanup_start')
  let s = 0
  const iv = setInterval(() => {
    s += 1
    console.debug('program:alive_s', { s })
  }, 1000)
  console.debug('program:db_close_start')
  const dbClose = db.close()
    .then(() => { console.debug('program:db_close_done') })
    .catch((e: any) => { console.debug('program:db_close_error', { error: e?.message || String(e) }) })
  await Promise.race([dbClose, new Promise<void>((resolve) => setTimeout(resolve, 2000))])
  setTimeout(() => {
    try { clearInterval(iv) } catch {}
    console.debug('program:cleanup_exit')
    try { process.exit(0) } catch {}
  }, 10000)
}

run().catch(err => { console.error(err); process.exitCode = 1 })
process.on('beforeExit', () => { console.debug('program:beforeExit') })
process.on('exit', (code) => { console.debug('program:exit', { code }) })
