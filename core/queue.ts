// Sapu Queue Interface
// Minimal RabbitMQ wrapper with real implementation
// Target: ~100 lines total

import amqp from 'amqplib';

import { publishWorkerEvent } from './events.js';

interface Job {
  id: string;
  type: 'scraping' | 'url_collection' | 'workflow';
  url?: string;
  site_id?: string;
  workflow_id?: string;
  config?: any;
  priority?: number;
  attempts?: number;
}

class Queue {
  private url: string;
  private connection: any = null;
  // Publisher channel (no prefetch needed)
  private channel: any = null;
  // Dedicated consumer channels per queue to allow per-queue prefetch
  private consumerChannels: Record<string, any> = {};
  private isConnected = false;
  // Backward-compatible global prefetch (initial boot value)
  private currentPrefetch = 1;
  // Per-queue prefetch map
  private prefetchByQueue: Record<string, number> = {};
  private lastConnectFailedAt: number | null = null;
  private connectCooldownMs: number = Math.max(0, Number(process.env.QUEUE_CONNECT_COOLDOWN_MS ?? 5000));
  // Throttle publish warnings when broker is unavailable
  private lastPublishWarnAt: number | null = null;
  private publishWarnCooldownMs: number = Math.max(0, Number(process.env.QUEUE_PUBLISH_WARN_COOLDOWN_MS ?? 10000));
  private connecting: boolean = false;
  // Consumer handlers registered for auto-reconnect on connection drop
  private consumerHandlers: Record<string, (job: Job) => Promise<void>> = {};
  // Reconnect state
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private closing = false;

  constructor() {
    const url = process.env.RABBITMQ_URL;
    if (!url) {
      throw new Error('RABBITMQ_URL env var is required (e.g. amqp://user:pass@host:5672/vhost)');
    }
    this.url = url;
    // Log host only, never the credentials
    try {
      const u = new URL(url);
      console.log('🐰 Queue host:', u.host);
    } catch {
      console.log('🐰 Queue URL: <unparseable>');
    }
  }

  async connect(): Promise<void> {
    if (this.closing) throw new Error('Queue is closing');
    if (this.isConnected) return;
    if (this.connecting) return;

    this.connecting = true;
    console.log(`🐰 Connecting to RabbitMQ (attempt ${this.reconnectAttempt + 1})...`);
    try {
      this.connection = await amqp.connect(this.url);
      this.channel = await this.connection.createChannel();

      // Assert queues for different job types
      await this.channel.assertQueue('scraping', {
        durable: true,
        arguments: { 'x-max-priority': 10, 'x-max-length': 100000, 'x-overflow': 'reject-publish' }
      });
      await this.channel.assertQueue('url_collection', {
        durable: true,
        arguments: { 'x-max-priority': 10, 'x-max-length': 100000, 'x-overflow': 'reject-publish' }
      });
      await this.channel.assertQueue('workflow', {
        durable: true,
        arguments: { 'x-max-priority': 10, 'x-max-length': 100000, 'x-overflow': 'reject-publish' }
      });
      // Dead-letter queues: bounded + TTL so they don't grow forever
      const DLQ_ARGS = { 'x-message-ttl': 7 * 24 * 3600 * 1000, 'x-max-length': 10000 };
      await this.channel.assertQueue('scraping_dead', { durable: true, arguments: DLQ_ARGS });
      await this.channel.assertQueue('url_collection_dead', { durable: true, arguments: DLQ_ARGS });
      await this.channel.assertQueue('workflow_dead', { durable: true, arguments: DLQ_ARGS });

      // Set initial global prefetch from env (fallback 1). This is only the boot default;
      // runtime scaling is driven by DB config via autoscaler.
      this.currentPrefetch = Math.max(1, Number(process.env.QUEUE_PREFETCH ?? 1));
      this.prefetchByQueue['scraping'] = this.currentPrefetch;
      this.prefetchByQueue['url_collection'] = this.currentPrefetch;

      this.isConnected = true;
      this.lastConnectFailedAt = null;
      this.reconnectAttempt = 0;
      console.log('🐰 Queue connected successfully');

      // Re-register any consumers that were attached before the disconnect
      const consumerNames = Object.keys(this.consumerHandlers);
      if (consumerNames.length) {
        console.log(`🐰 Re-registering ${consumerNames.length} consumer(s)...`);
        for (const name of consumerNames) {
          try { await this.consume(name, this.consumerHandlers[name]); } catch (e) {
            console.error(`Failed to re-register consumer ${name}:`, e instanceof Error ? e.message : String(e));
          }
        }
      }

      // Handle connection errors and drops
      this.connection.on('error', (err: any) => {
        console.error('RabbitMQ connection error:', err instanceof Error ? err.message : String(err));
        this.isConnected = false;
      });
      this.connection.on('close', () => {
        if (this.closing) return;
        console.warn('⚠️  RabbitMQ connection closed; will reconnect with backoff');
        this.isConnected = false;
        // Tear down stale consumer channels
        for (const q of Object.keys(this.consumerChannels)) {
          try { this.consumerChannels[q].close(); } catch {}
          delete this.consumerChannels[q];
        }
        this.scheduleReconnect();
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Failed to connect to RabbitMQ:', msg);
      this.lastConnectFailedAt = Date.now();
      throw error;
    } finally {
      this.connecting = false;
    }
  }

  private scheduleReconnect(): void {
    if (this.closing || this.reconnectTimer) return;
    this.reconnectAttempt += 1;
    // Exponential backoff: 1s, 2s, 4s, 8s, ... capped at 60s
    const delay = Math.min(60000, 1000 * Math.pow(2, Math.min(6, this.reconnectAttempt - 1)));
    console.log(`🐰 Reconnect scheduled in ${delay}ms (attempt ${this.reconnectAttempt})`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }

  async publish(job: Job): Promise<void> {
    try {
      // Ensure connection; if broker unavailable or cooldown active, skip publish gracefully
      if (!this.channel || !this.isConnected) {
        try { await this.connect(); } catch {}
        if (!this.channel || !this.isConnected) {
          const now = Date.now();
          if (!this.lastPublishWarnAt || (now - this.lastPublishWarnAt) > this.publishWarnCooldownMs) {
            console.warn(`⚠️  Queue unavailable; dropping job (${job.type}) for ${job.url}`);
            this.lastPublishWarnAt = now;
          }
          return;
        }
      }

      const queueName = job.type;
      const message = Buffer.from(JSON.stringify({ ...job, attempts: job.attempts ?? 0 }));

      const published = this.channel.sendToQueue(queueName, message, {
        persistent: true,
        priority: job.priority || 0
      });

      if (!published) {
        throw new Error('Failed to publish message - queue buffer full');
      }

      const target = job.url || job.workflow_id || job.site_id || job.id;
      console.log(`📤 Published job: ${job.type} - ${target} (priority: ${job.priority || 0})`);
    } catch (error) {
      // Reduce severity and avoid throwing to keep producers functional even if broker hiccups
      const msg = error instanceof Error ? error.message : String(error);
      console.warn('Queue publish failed:', msg);
    }
  }

  async consume(queueName: string, handler: (job: Job) => Promise<void>): Promise<void> {
    // Remember the handler so we can re-register on reconnect
    this.consumerHandlers[queueName] = handler;
    try {
      if (!this.channel || !this.isConnected) {
        try { await this.connect(); } catch {}
        if (!this.channel || !this.isConnected) {
          console.warn(`⚠️  Queue unavailable; skipping consumer init for: ${queueName}`);
          return;
        }
      }

      console.log(`📥 Starting consumer for queue: ${queueName}`);
      
      const MAX_RETRIES = Number(process.env.QUEUE_MAX_RETRIES ?? 3);
      // Create or reuse a dedicated consumer channel for this queue
      let ch = this.consumerChannels[queueName];
      if (!ch) {
        ch = await this.connection.createChannel();
        // Ensure queue exists (idempotent assert)
        await ch.assertQueue(queueName, { durable: true, arguments: { 'x-max-priority': 10 } });
        // Apply per-queue prefetch
        const initialPrefetch = Math.max(1, Number(this.prefetchByQueue[queueName] ?? this.currentPrefetch));
        await ch.prefetch(initialPrefetch);
        this.consumerChannels[queueName] = ch;
      }

      await ch.consume(queueName, async (msg: any) => {
        if (!msg) return;

        try {
          const job: Job = JSON.parse(msg.content.toString());
          const target = job.url || job.workflow_id || job.site_id || job.id;
          console.log(`🔄 Processing job: ${job.type} - ${target} (attempt ${job.attempts ?? 0})`);

          // Derive a pseudo worker slot from deliveryTag and per-queue prefetch
          const deliveryTag = msg.fields?.deliveryTag ?? 1;
          const pf = Math.max(1, Number(this.prefetchByQueue[queueName] ?? this.currentPrefetch));
          const slot = ((Number(deliveryTag) - 1) % pf) + 1;
          const workerId = `${queueName}:${slot}`;

          // Publish worker started processing
          publishWorkerEvent(workerId, 'processing', { queue: queueName, job });

          await handler(job);

          // Acknowledge successful processing
          ch.ack(msg);
          console.log(`✅ Job completed: ${job.id}`);

          // Publish worker completed
          publishWorkerEvent(workerId, 'completed', { queue: queueName, job });

        } catch (error) {
          const job: Job = JSON.parse(msg.content.toString());
          const prevAttempts = job.attempts ?? 0;
          const nextAttempts = prevAttempts + 1;
          console.error(`Job processing failed (attempt ${nextAttempts}):`, error instanceof Error ? error.message : String(error));

          const deliveryTag = msg.fields?.deliveryTag ?? 1;
          const pf = Math.max(1, Number(this.prefetchByQueue[queueName] ?? this.currentPrefetch));
          const slot = ((Number(deliveryTag) - 1) % pf) + 1;
          const workerId = `${queueName}:${slot}`;

          // Publish worker failed
          publishWorkerEvent(workerId, 'failed', { queue: queueName, job, error: error instanceof Error ? error.message : String(error) });

          if (nextAttempts >= MAX_RETRIES) {
            // Move to dead-letter queue
            const deadQueue = `${queueName}_dead`;
            const deadMsg = Buffer.from(JSON.stringify({
              ...job,
              attempts: nextAttempts,
              error: error instanceof Error ? error.message : String(error),
              failed_at: new Date().toISOString()
            }));
            this.channel.sendToQueue(deadQueue, deadMsg, { persistent: true, priority: job.priority || 0 });
            ch.ack(msg);
            console.warn(`☠️  Job moved to DLQ: ${deadQueue} (id: ${job.id}, url: ${job.url})`);

            // Publish worker DLQ move
            publishWorkerEvent(workerId, 'failed', { queue: deadQueue, job, error: error instanceof Error ? error.message : String(error), dlq: true });

            // Notify DLQ via Telegram (best-effort)
            try {
              const { notify } = await import('./plugins/notifier.js');
              await notify('notify', {
                template: 'job_failed',
                text: `☠️ ${queueName} job moved to DLQ\nID: ${job.id}\nURL: ${job.url || ''}\nAttempts: ${nextAttempts}\nError: ${error instanceof Error ? error.message : String(error)}`
              }, { enabled: true, provider: 'telegram' });
            } catch {}
          } else {
            // Republish with incremented attempt counter
            const republish = Buffer.from(JSON.stringify({ ...job, attempts: nextAttempts }));
            this.channel.sendToQueue(queueName, republish, { persistent: true, priority: job.priority || 0 });
            ch.ack(msg);
            console.warn(`🔁 Requeued job with attempt ${nextAttempts}: ${job.id}`);

            // Publish worker requeue (pending)
            publishWorkerEvent(workerId, 'pending', { queue: queueName, job, attempts: nextAttempts });

            // Notify requeue (optional, noisy) - send only on final retry minus 1
            if (nextAttempts === (MAX_RETRIES - 1)) {
              try {
                const { notify } = await import('./plugins/notifier.js');
                await notify('notify', {
                  template: 'job_retrying',
                  text: `🔁 ${queueName} job requeued (attempt ${nextAttempts})\nID: ${job.id}\nURL: ${job.url || ''}`
                }, { enabled: true, provider: 'telegram' });
              } catch {}
            }
          }
        }
      });

    } catch (error) {
      console.error(`Failed to start consumer for ${queueName}:`, error);
      throw error;
    }
  }

  // Dynamically adjust prefetch (concurrency). When queueName is provided,
  // only that queue's consumer channel is affected. Otherwise apply to all.
  async setPrefetch(n: number, queueName?: string): Promise<void> {
    const target = Math.max(1, Number(n) || 1);
    if (!this.connection || !this.isConnected) {
      await this.connect();
      if (!this.connection || !this.isConnected) {
        console.warn(`⚠️  Queue unavailable; prefetch update skipped${queueName ? ` for '${queueName}'` : ''}`);
        return;
      }
    }
    if (queueName) {
      // Update specific queue
      let ch = this.consumerChannels[queueName];
      if (!ch) {
        ch = await this.connection.createChannel();
        await ch.assertQueue(queueName, { durable: true, arguments: { 'x-max-priority': 10 } });
        this.consumerChannels[queueName] = ch;
      }
      await ch.prefetch(target);
      this.prefetchByQueue[queueName] = target;
      console.log(`⚙️  Prefetch for '${queueName}' set to ${target}`);
    } else {
      // Apply to all known consumer channels
      const queues = Object.keys(this.consumerChannels);
      if (queues.length === 0) {
        // No consumers yet; update defaults
        this.currentPrefetch = target;
        this.prefetchByQueue['scraping'] = target;
        this.prefetchByQueue['url_collection'] = target;
        console.log(`⚙️  Default prefetch set to ${target}`);
        return;
      }
      for (const q of queues) {
        const ch = this.consumerChannels[q];
        try { await ch.prefetch(target); } catch {}
        this.prefetchByQueue[q] = target;
      }
      this.currentPrefetch = target;
      console.log(`⚙️  Prefetch for all consumers set to ${target}`);
    }
  }

  // Get queue depth and consumers from broker
  async getQueueInfo(queueName: string): Promise<{ messageCount: number; consumerCount: number } | null> {
    try {
      if (!this.channel || !this.isConnected) {
        await this.connect();
        if (!this.channel || !this.isConnected) {
          // Broker unavailable or cooldown active; report null without warnings
          return null;
        }
      }
      const info = await this.channel.checkQueue(queueName);
      return { messageCount: info.messageCount ?? 0, consumerCount: info.consumerCount ?? 0 };
    } catch (e) {
      console.warn(`Unable to get queue info for ${queueName}:`, e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  async close(): Promise<void> {
    this.closing = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      // Close consumer channels
      for (const [q, ch] of Object.entries(this.consumerChannels)) {
        try { await ch.close(); } catch {}
        delete this.consumerChannels[q];
      }
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }

      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }

      this.isConnected = false;
      console.log('🐰 Queue disconnected');
    } catch (error) {
      console.error('Error closing queue connection:', error);
    }
  }
}

// Export singleton instance
export const queue = new Queue();

// Helper getter for current prefetch (worker capacity)
export function getCurrentPrefetch(): number {
  // Access through instance; maintained in Queue
  // This function exposes the current prefetch for status reporting without breaking encapsulation
  // @ts-ignore
  return (queue as any).currentPrefetch ?? 1;
}

// Helper to expose per-queue prefetch map for monitoring
export function getPrefetchMap(): Record<string, number> {
  // @ts-ignore
  const q: any = queue as any;
  const map = { ...(q.prefetchByQueue || {}) };
  // Ensure keys exist with defaults
  if (!('scraping' in map)) map['scraping'] = q.currentPrefetch ?? 1;
  if (!('url_collection' in map)) map['url_collection'] = q.currentPrefetch ?? 1;
  return map;
}

// Helper to expose connection state for status endpoints
export function isQueueConnected(): boolean {
  // @ts-ignore
  return (queue as any).isConnected === true;
}
