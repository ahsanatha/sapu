import axios from 'axios'

const clean = (s?: string) => String(s || '').trim().replace(/^['"`]+|['"`]+$/g, '')

const originEnvRaw = (import.meta.env.VITE_API_ORIGIN as string | undefined) || ''
const originEnv = clean(originEnvRaw)
const isDev = typeof window !== 'undefined' && window.location.port === '5173'
const fallbackOrigin = isDev ? 'http://localhost:3000' : (typeof window !== 'undefined' ? window.location.origin : '')
const baseURL = originEnv || fallbackOrigin

export const acq = axios.create({ baseURL })

const adminPwEnv = clean(
  (import.meta.env.VITE_ADMIN_PASSWORD as string | undefined) ||
  (import.meta.env.ADMIN_PASSWORD as string | undefined) ||
  ''
)

export async function hmacSha256Hex(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(msg))
  const bytes = new Uint8Array(sig)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

acq.interceptors.request.use(async (config) => {
  try {
    const ts = Date.now().toString()
    const method = (config.method || 'GET').toUpperCase()
    const url = typeof config.url === 'string' ? config.url : ''
    const path = url.startsWith('http') ? new URL(url).pathname : url
    const msg = `${ts}:${method}:${path}`
    const sig = await hmacSha256Hex(adminPwEnv, msg)
    const headers: Record<string, any> = (config.headers as any) || {}
    headers['x-admin-auth'] = sig
    headers['x-admin-ts'] = ts
    config.headers = headers as any
  } catch {}
  return config
})

acq.interceptors.response.use(
  (r) => r,
  (error) => {
    // No modal prompts; rely on env-based header.
    return Promise.reject(error)
  }
)

export function setAdminPassword(_pw: string) {
  // No-op: password is now used to derive per-request HMAC; env-based only.
}

export async function getHealth() {
  const { data } = await acq.get('/health')
  return data
}

export async function getSites() {
  const { data } = await acq.get('/api/sites')
  return Array.isArray(data) ? data : []
}

export async function getWorkers() {
  const { data } = await acq.get('/api/workers')
  return Array.isArray(data) ? data : []
}

export async function getConfigurations() {
  const { data } = await acq.get('/api/configurations')
  return Array.isArray(data) ? data : []
}

export async function getProcessors(params?: { type?: string; enabled?: boolean }) {
  const { data } = await acq.get('/api/processors', { params })
  return Array.isArray(data) ? data : []
}

export async function updateProcessor(id: string, payload: any) {
  const { data } = await acq.put(`/api/processors/${id}`, payload)
  return data
}

export async function getWorkflows(params?: { enabled?: boolean }) {
  const { data } = await acq.get('/api/workflows', { params })
  return Array.isArray(data) ? data : []
}

export async function updateWorkflow(id: string, payload: any) {
  const { data } = await acq.put(`/api/workflows/${id}`, payload)
  return data
}

export async function triggerWorkflow(id: string) {
  const { data } = await acq.post(`/api/workflows/${id}/trigger`)
  return data
}

export async function createConfiguration(payload: { key: string; value: any; category?: string; description?: string }) {
  const { data } = await acq.post('/api/configurations', payload)
  return data
}

export async function updateConfiguration(key: string, payload: { value: any; category?: string; description?: string }) {
  const { data } = await acq.put(`/api/configurations/${key}`, payload)
  return data
}

export async function deleteConfiguration(key: string) {
  const { data } = await acq.delete(`/api/configurations/${key}`)
  return data
}

export async function maintenanceBackfillEmbeddings(params: { limit?: number; batch_size?: number }) {
  const { data } = await acq.post('/api/maintenance/embeddings/backfill', params)
  return data
}

export async function maintenanceReindexEmbeddings() {
  const { data } = await acq.post('/api/maintenance/embeddings/reindex', {})
  return data
}

export async function scrapeUrl(params: { url: string; site_id?: string }) {
  const { data } = await acq.get('/api/scrape', { params })
  return data
}

export async function getHtml(params: { url: string; site_id?: string; dump?: boolean }) {
  const u = /^(https?:\/\/)/.test(params.url) ? params.url : `https://${params.url}`
  const { data } = await acq.get('/api/html', { params: { ...params, url: u, dump: params.dump ? 'true' : 'false' } })
  return data
}

export async function getArticles(params?: { q?: string; site_id?: string; limit?: number; offset?: number }) {
  const { data } = await acq.get('/api/articles', { params })
  return data
}

export async function getArticle(id: string) {
  const { data } = await acq.get(`/api/articles/${id}`)
  return data
}

export async function checkArticleExists(url: string) {
  const { data } = await acq.get(`/api/articles/check/${encodeURIComponent(url)}`)
  return data
}

export async function createArticle(payload: any) {
  const { data } = await acq.post('/api/articles', payload)
  return data
}
