// Ultra-simple in-memory event bus for realtime worker activity
// Avoids database writes; publishes to SSE subscribers in server

type EventPayload = {
  type: string;
  source?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed' | string;
  data?: any;
  created_at?: string;
};

type Listener = (ev: EventPayload) => void;

const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publish(ev: EventPayload): void {
  const payload = {
    ...ev,
    created_at: ev.created_at || new Date().toISOString(),
  };
  for (const l of Array.from(listeners)) {
    try { l(payload); } catch {}
  }
}

// Convenience helpers for worker lifecycle events
export function publishWorkerEvent(workerId: string, status: 'processing' | 'completed' | 'failed' | 'pending', data: any): void {
  publish({
    type: 'worker.activity',
    source: `worker:${workerId}`,
    status,
    data,
  });
}

export type { EventPayload };
