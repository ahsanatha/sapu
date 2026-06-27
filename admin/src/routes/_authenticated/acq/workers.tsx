import { createFileRoute } from '@tanstack/react-router'
import { hmacSha256Hex } from '@/lib/acq'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export const Route = createFileRoute('/_authenticated/acq/workers')({
  component: WorkersPage,
})

function WorkersPage() {
  const [status, setStatus] = useState<any>(null)
  const [events, setEvents] = useState<any[]>([])
  const [connected, setConnected] = useState(false)
  const [filterType, setFilterType] = useState<string>('all')
  const [maxEvents, setMaxEvents] = useState('100')
  const esRef = useRef<EventSource | null>(null)
  useEffect(() => {
    const connect = async (secret: string, opts?: { intervalMs?: number; silent?: boolean }) => {
      try { esRef.current?.close() } catch {}
      const originEnv = (import.meta.env.VITE_API_ORIGIN as string | undefined) || ''
      const base = originEnv || (typeof window !== 'undefined' ? window.location.origin : '')
      const path = '/api/events/stream'
      const ts = Date.now().toString()
      const msg = `${ts}:GET:${path}`
      const sig = await hmacSha256Hex(secret, msg)
      const params = new URLSearchParams({ ts, sig })
      if (opts?.intervalMs) params.set('interval_ms', String(opts.intervalMs))
      if (opts?.silent) params.set('silent', 'true')
      const url = `${base}${path}?${params.toString()}`
      const es = new EventSource(url)
      esRef.current = es
      es.addEventListener('open', () => setConnected(true))
      es.addEventListener('status', (ev: any) => {
        try { setStatus(JSON.parse(ev.data)) } catch {}
      })
      es.addEventListener('event', (ev: any) => {
        try {
          const data = JSON.parse(ev.data)
          setEvents((prev) => [data, ...prev].slice(0, Number(maxEvents) || 100))
        } catch {}
      })
      es.addEventListener('error', async () => {
        setConnected(false)
        try { esRef.current?.close() } catch {}
        const secret2 = (import.meta.env.VITE_ADMIN_PASSWORD as string | undefined) || (import.meta.env.ADMIN_PASSWORD as string | undefined) || ''
        setTimeout(() => { void connect(secret2, { intervalMs: 2000 }) }, 2000)
      })
    }
    const secret = (import.meta.env.VITE_ADMIN_PASSWORD as string | undefined) || (import.meta.env.ADMIN_PASSWORD as string | undefined) || ''
    void connect(secret, { intervalMs: 2000 })
    return () => { try { esRef.current?.close() } catch {} }
  }, [maxEvents])

  const filteredEvents = useMemo(() => {
    if (filterType === 'all') return events
    return events.filter((e: any) => String(e?.type || '') === filterType)
  }, [events, filterType])

  const reconnect = async () => {
    const secret = (import.meta.env.VITE_ADMIN_PASSWORD as string | undefined) || (import.meta.env.ADMIN_PASSWORD as string | undefined) || ''
    const originEnv = (import.meta.env.VITE_API_ORIGIN as string | undefined) || ''
    const base = originEnv || (typeof window !== 'undefined' ? window.location.origin : '')
    const path = '/api/events/stream'
    const ts = Date.now().toString()
    const msg = `${ts}:GET:${path}`
    const sig = await hmacSha256Hex(secret, msg)
    const url = `${base}${path}?ts=${encodeURIComponent(ts)}&sig=${encodeURIComponent(sig)}&interval_ms=2000`
    try { esRef.current?.close() } catch {}
    const es = new EventSource(url)
    esRef.current = es
    es.addEventListener('open', () => setConnected(true))
    es.addEventListener('status', (ev: any) => { try { setStatus(JSON.parse(ev.data)) } catch {} })
    es.addEventListener('event', (ev: any) => { try { const d = JSON.parse(ev.data); setEvents((prev) => [d, ...prev].slice(0, Number(maxEvents) || 100)) } catch {} })
    es.addEventListener('error', () => setConnected(false))
  }
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Workers</h1>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={connected ? 'default' : 'outline'}>{connected ? 'Connected' : 'Disconnected'}</Badge>
          <Button variant="outline" size="sm" onClick={reconnect}>Reconnect</Button>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Filter type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="status">status</SelectItem>
              <SelectItem value="event">event</SelectItem>
            </SelectContent>
          </Select>
          <Input className="w-[120px]" value={maxEvents} onChange={(e) => setMaxEvents(e.target.value)} placeholder="Max events" />
          <Button variant="outline" size="sm" onClick={() => setEvents([])}>Clear</Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader><CardTitle>Current</CardTitle></CardHeader>
            <CardContent className="text-3xl font-semibold">{status?.workers?.current ?? 0}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Target</CardTitle></CardHeader>
            <CardContent className="text-3xl font-semibold">{status?.workers?.target ?? 0}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Backlog</CardTitle></CardHeader>
            <CardContent className="text-3xl font-semibold">{status?.workers?.backlog ?? 0}</CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle>Queues</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">scraping</div>
                  <div className="text-2xl">{status?.workers?.queues?.scraping?.messageCount ?? 0}</div>
                  <div className="text-xs">consumers: {status?.workers?.queues?.scraping?.consumerCount ?? 0}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">url_collection</div>
                  <div className="text-2xl">{status?.workers?.queues?.url_collection?.messageCount ?? 0}</div>
                  <div className="text-xs">consumers: {status?.workers?.queues?.url_collection?.consumerCount ?? 0}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Active Worker IDs</CardTitle>
                <Badge variant="outline">{Number(status?.workers?.current ?? 0)}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-60 overflow-auto rounded border p-2 text-sm">
                {(() => {
                  const current = Number(status?.workers?.current ?? 0)
                  const ids = (status?.workers?.active_ids || []) as string[]
                  const trimmed = ids.slice(0, current)
                  const placeholders = Array(Math.max(0, current - trimmed.length)).fill('—')
                  const display = [...trimmed, ...placeholders]
                  return display.map((id, idx) => (
                    <div key={`${id}-${idx}`} className="font-mono">{id}</div>
                  ))
                })()}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Events</CardTitle></CardHeader>
          <CardContent>
            <div className="max-h-[28rem] overflow-auto space-y-2">
              {filteredEvents.map((e, idx) => (
                <div key={idx} className="rounded border p-2 text-sm">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="capitalize">{String(e?.type || 'event')}</Badge>
                    <span className="text-xs text-muted-foreground">{String(e?.time || '')}</span>
                  </div>
                  <pre className="mt-2 bg-muted p-2 rounded text-xs overflow-auto">{JSON.stringify(e, null, 2)}</pre>
                </div>
              ))}
              {filteredEvents.length === 0 && (
                <div className="text-sm text-muted-foreground">No events.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
