import { db } from '../database.js'

async function main() {
  const sites = await db.getSites(true)
  console.log(JSON.stringify({ count: sites.length, sample: sites.slice(0, 5).map(s => s.name) }, null, 2))
}

main().catch(e => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1) })
