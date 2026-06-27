// ACQ v3 Ultra-Simple Engine
// Single main process that reads DB config and executes workflows
// Target: 150 lines total

import os from 'os';

import 'dotenv/config';
import cron, { type ScheduledTask } from 'node-cron';

import { executeProcessor } from './plugins/index.js';
import { db } from './database.js';
import { getSite as getSiteFromFiles } from './sites.js';
import { queue, getPrefetchMap, isQueueConnected } from './queue.js';

interface Workflow {
  id: string;
  name: string;
  steps: Array<{
    processor: string;
    action: string;
    params?: any;
  }>;
  triggers: {
    type: 'cron' | 'event' | 'manual';
    schedule?: string;
    enabled: boolean;
    conditions?: any;
  };
}



class Engine {
  private running = false;
  private scheduledJobs = new Map<string, { task: ScheduledTask; schedule: string }>();
  private autoscaleInterval: NodeJS.Timeout | null = null;
  private workflowWatchInterval: NodeJS.Timeout | null = null;
  private maintenanceTasks: ScheduledTask[] = [];
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private stopping = false;
  private stopped = false;

  async start(): Promise<void> {
    console.log('🚀 Starting ACQ v3 Ultra-Simple Engine...');
    
    // Connect to infrastructure
    await db.connect();
    try {
      await queue.connect();
    } catch (e) {
      const requireQueue = !(['false','0','no'].includes(String(process.env.REQUIRE_QUEUE || '').toLowerCase()));
      if (requireQueue) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('Queue connect failed; exiting worker:', msg);
        throw e;
      } else {
        console.warn('Queue connect failed; continuing without consumers');
      }
    }
    // Ensure DB-backed dedup tables exist
    try { await db.ensureScheduledIndexTables(); } catch (e) { console.warn('Failed to ensure scheduled_index tables:', e instanceof Error ? e.message : String(e)); }
    await this.setupConsumers();
    await this.setupAutoscaler();
    // Maintenance: sweep expired scheduled_index entries every 5 minutes
    try {
      const sweepTask = cron.schedule('*/5 * * * *', async () => {
        try {
          const removed = await db.sweepScheduledIndex();
          if (removed) {
            console.log(`🧹 scheduled_index sweep removed ${removed} rows`);
          }
        } catch (e) {
          console.warn('scheduled_index sweep failed:', e instanceof Error ? e.message : String(e));
        }
      });
      this.maintenanceTasks.push(sweepTask);
      console.log('🧹 scheduled_index TTL sweep scheduled every 5 minutes');
    } catch {}
    
    // Load and start workflows
    await this.loadWorkflows();
    await this.setupWorkflowWatcher();
    await this.setupHeartbeat();
    
    this.running = true;
    
    console.log('✅ Engine started successfully');
  }

  async stop(): Promise<void> {
    if (this.stopping || this.stopped) {
      return;
    }
    this.stopping = true;
    console.log('🛑 Stopping engine...');
    this.running = false;
    
    // Clear scheduled jobs
    for (const [, job] of this.scheduledJobs) {
      try {
        job.task.stop();
        // Destroy to free resources; safe no-op if not supported
        // @ts-ignore
        job.task.destroy?.();
      } catch (e) {
        console.warn('Failed to stop scheduled task:', e instanceof Error ? e.message : String(e));
      }
    }
    this.scheduledJobs.clear();
    if (this.autoscaleInterval) {
      clearInterval(this.autoscaleInterval);
      this.autoscaleInterval = null;
    }
    if (this.workflowWatchInterval) {
      clearInterval(this.workflowWatchInterval);
      this.workflowWatchInterval = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    // Stop maintenance tasks
    for (const t of this.maintenanceTasks) {
      try {
        t.stop();
        // @ts-ignore
        t.destroy?.();
      } catch {}
    }
    this.maintenanceTasks = [];

    await queue.close();
    await db.close();
    this.stopped = true;
    this.stopping = false;
    console.log('✅ Engine stopped');
  }

  private async loadWorkflows(): Promise<void> {
    const workflows = await db.getWorkflows(true); // enabled only
    
    for (const workflow of workflows) {
      if (workflow.triggers.type === 'cron' && workflow.triggers.schedule) {
        await this.scheduleCronWorkflow(workflow);
      }
    }
    
    console.log(`📋 Loaded ${workflows.length} workflows`);
  }

  private async setupConsumers(): Promise<void> {
    // Consumer for scraping jobs
    await queue.consume('scraping', async (job: any) => {
      try {
        const site = await getSiteFromFiles(job.site_id);
        if (!site) {
          console.warn(`Site not found for scraping job: ${job.site_id}`);
          return;
        }
        // Explicitly treat this consumer as handling ARTICLE scraping jobs.
        // Future kinds (e.g., 'price') should be routed via a different processor or consumer.
        const kind = job.config?.kind ?? 'article';
        if (kind !== 'article') {
          console.warn(`Scraping job kind '${kind}' not supported by article consumer; ignoring`, {
            job_id: job.id,
            url: job.url,
            site_id: job.site_id
          });
          return;
        }

        await executeProcessor('default_scraper', 'scrape', {
          url: job.url,
          site,
          check_duplicates: job.config?.check_duplicates ?? true,
          kind
        });
      } catch (err) {
        console.error('Error handling scraping job:', err);
        throw err;
      }
    });

    // Consumer for URL collection jobs
    await queue.consume('url_collection', async (job: any) => {
      try {
        const site = await getSiteFromFiles(job.site_id);
        if (!site) {
          console.warn(`Site not found for url_collection job: ${job.site_id}`);
          return;
        }
        const params: any = {
          site,
          url: job.url,
          // Honor job-specified collection_type, default to 'general' when missing
          collection_type: job.config?.collection_type ?? 'general'
        };
        const rec = job.config?.recursion;
        if (rec?.depth !== undefined) params.depth = rec.depth;
        if (rec?.visited) params.visited = rec.visited;
        await executeProcessor('url_collector', 'collect_urls', params);
      } catch (err) {
        console.error('Error handling url_collection job:', err);
        throw err;
      }
    });

    // Consumer for workflow trigger jobs
    await queue.consume('workflow', async (job: any) => {
      try {
        const id = String(job.workflow_id || job.id || '').trim();
        if (!id) {
          console.warn('Workflow job missing id');
          return;
        }
        const wf = await db.getWorkflow(id);
        if (!wf) {
          console.warn(`Workflow not found for job: ${id}`);
          return;
        }
        await this.executeWorkflow(wf);
      } catch (err) {
        console.error('Error handling workflow job:', err);
        throw err;
      }
    });
  }

  private async setupAutoscaler(): Promise<void> {
    try {
      const autoscalers = await db.getProcessors('autoscaler', true);
      if (!autoscalers.length) {
        console.log('📈 Autoscaler not enabled');
        return;
      }
      const cfg = autoscalers[0]?.config || {};
      const intervalMs = Math.max(1000, Number(cfg.interval_ms ?? cfg.scale_check_interval ?? 15000));
      if (this.autoscaleInterval) clearInterval(this.autoscaleInterval);
      this.autoscaleInterval = setInterval(async () => {
        try {
          await executeProcessor('autoscaler', 'check_and_scale', { trigger: 'interval' });
        } catch (e) {
          console.warn('Autoscaler run failed:', e instanceof Error ? e.message : String(e));
        }
      }, intervalMs);
      console.log(`📈 Autoscaler running every ${intervalMs}ms`);
    } catch (e) {
      console.warn('Failed to setup autoscaler:', e instanceof Error ? e.message : String(e));
    }
  }

  private async scheduleCronWorkflow(workflow: Workflow): Promise<void> {
    // Always clear any existing scheduled task for this workflow first
    const existing = this.scheduledJobs.get(workflow.id);
    if (existing) {
      try {
        existing.task.stop();
        // @ts-ignore
        existing.task.destroy?.();
      } catch {}
      this.scheduledJobs.delete(workflow.id);
    }

    const spec = String(workflow.triggers.schedule || '').trim();
    const triggerEnabled = workflow.triggers?.enabled !== false;
    if (!triggerEnabled) {
      console.log(`⏭️  Trigger disabled for workflow: ${workflow.name}`);
      return;
    }

    if (!spec || !cron.validate(spec)) {
      console.warn(`⚠️ Invalid or missing cron spec for workflow '${workflow.name}': '${spec}'`);
      return;
    }

    // Determine timezone from scheduler processor config, or default
    let timezone: string | undefined = process.env.CRON_TZ || process.env.TZ || undefined;
    try {
      const schedulers = await db.getProcessors('scheduler', true);
      const tz = schedulers[0]?.config?.timezone;
      if (typeof tz === 'string' && tz.trim().length) {
        timezone = tz.trim();
      }
    } catch {
      // ignore DB lookup failures, fallback to env/default
    }

    const task = cron.schedule(
      spec,
      async () => {
        try {
          if (!this.running) return;
          await this.executeWorkflow(workflow);
        } catch (e) {
          console.error(`❌ Scheduled run failed for workflow '${workflow.name}':`, e);
        }
      },
      { timezone }
    );

    this.scheduledJobs.set(workflow.id, { task, schedule: spec });
    console.log(`⏰ Scheduled workflow: ${workflow.name} (${spec}${timezone ? `, TZ=${timezone}` : ''})`);
  }

  async executeWorkflow(workflow: Workflow): Promise<void> {
    console.log(`🔄 Executing workflow: ${workflow.name}`);
    
    try {
      // Check workflow conditions
      if (workflow.triggers.conditions && !await this.checkConditions(workflow.triggers.conditions)) {
        console.log(`⏭️  Skipping workflow ${workflow.name} - conditions not met`);
        return;
      }
      
      try {
        await executeProcessor('telegram_notifier', 'notify', {
          text: `🚀 Workflow started: ${workflow.name}`,
          workflow_name: workflow.name,
          workflow_id: workflow.id,
          host: os.hostname(),
          started_at: new Date().toISOString(),
        });
      } catch {}
      
      // Execute workflow steps sequentially
      for (const [index, step] of workflow.steps.entries()) {
        console.log(`  📝 Step ${index + 1}: ${step.processor}.${step.action}`);
        
        try {
          const params = { ...(step.params || {}) };
          if (step.processor === 'url_collector' && step.action === 'collect_urls') {
            if (!params.collection_type) params.collection_type = 'general';
            if (!params.site && !params.sites) params.sites = 'all_enabled';
          }
          await executeProcessor(step.processor, step.action, params);
        } catch (error) {
          console.error(`❌ Step ${index + 1} failed:`, error);
          throw error;
        }
      }
      
      console.log(`✅ Workflow completed: ${workflow.name}`);
      
    } catch (error) {
      console.error(`❌ Workflow failed: ${workflow.name}`, error);
    }
  }

  // Expose a public method to reschedule a single workflow immediately
  async rescheduleWorkflow(workflowId: string): Promise<void> {
    try {
      const workflow = await db.getWorkflow(workflowId);
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }
      if (workflow.triggers?.type === 'cron') {
        await this.scheduleCronWorkflow(workflow);
      } else {
        // Non-cron workflows: just ensure any existing schedule is cleared
        const existing = this.scheduledJobs.get(workflow.id);
        if (existing) {
          try {
            existing.task.stop();
            // @ts-ignore
            existing.task.destroy?.();
          } catch {}
          this.scheduledJobs.delete(workflow.id);
        }
      }
      console.log(`🔁 Rescheduled workflow: ${workflow.name}`);
    } catch (e) {
      console.warn('Failed to reschedule workflow:', e instanceof Error ? e.message : String(e));
    }
  }

  private async checkConditions(conditions: any): Promise<boolean> {
    // Simple condition checking - can be extended
    if (conditions.min_enabled_sites) {
      const sites = await db.getSites(true);
      if (sites.length < conditions.min_enabled_sites) {
        try {
          console.debug('workflow:conditions:not_met', {
            reason: 'min_enabled_sites',
            min_enabled_sites_required: conditions.min_enabled_sites,
            enabled_sites: sites.length
          });
        } catch {}
        return false;
      }
    }
    
    if (conditions.autoscaling_enabled !== undefined) {
      const config = await db.getConfiguration('autoscaling.enabled');
      const raw = (config as any)?.value;
      const asStr = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
      const norm = String(asStr || '').trim().replace(/^"|"$/g, '').toLowerCase();
      const enabled = ['true','1','yes','y','on','enabled'].includes(norm);
      if (enabled !== conditions.autoscaling_enabled) {
        try {
          console.debug('workflow:conditions:not_met', {
            reason: 'autoscaling_enabled_mismatch',
            expected: conditions.autoscaling_enabled,
            actual: enabled
          });
        } catch {}
        return false;
      }
    }
    
    return true;
  }



  async triggerWorkflow(workflowId: string): Promise<void> {
    const workflows = await db.getWorkflows();
    const workflow = workflows.find(w => w.id === workflowId);
    
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }
    
    await this.executeWorkflow(workflow);
  }

  // Poll for workflow changes and keep schedules in sync without restart
  private async setupWorkflowWatcher(): Promise<void> {
    try {
      const intervalMs = 5000; // lightweight, 5s poll
      if (this.workflowWatchInterval) clearInterval(this.workflowWatchInterval);
      this.workflowWatchInterval = setInterval(async () => {
        if (!this.running) return;
        try {
          const enabledWorkflows = await db.getWorkflows(true);
          const enabledIds = new Set(enabledWorkflows.map(w => w.id));

          // Stop any scheduled job whose workflow is no longer enabled
          for (const [wfId, job] of this.scheduledJobs) {
            if (!enabledIds.has(wfId)) {
              try {
                job.task.stop();
                // @ts-ignore
                job.task.destroy?.();
              } catch {}
              this.scheduledJobs.delete(wfId);
            }
          }

          // Ensure each enabled cron workflow is scheduled with the current spec
          for (const wf of enabledWorkflows) {
            const spec = String(wf.triggers?.schedule || '').trim();
            const isCron = wf.triggers?.type === 'cron' && !!spec;
            const existing = this.scheduledJobs.get(wf.id);
            if (!isCron) {
              // Not a cron or missing spec: ensure it's not scheduled
              if (existing) {
                try {
                  existing.task.stop();
                  // @ts-ignore
                  existing.task.destroy?.();
                } catch {}
                this.scheduledJobs.delete(wf.id);
              }
              continue;
            }

            // Cron workflow: reschedule if spec changed or missing
            if (!existing || existing.schedule !== spec) {
              await this.scheduleCronWorkflow(wf);
            }
          }
        } catch (e) {
          // Best-effort: swallow errors and continue
        }
      }, intervalMs);
      console.log(`👀 Workflow watcher running every ${intervalMs}ms`);
    } catch (e) {
      console.warn('Failed to setup workflow watcher:', e instanceof Error ? e.message : String(e));
    }
  }

  private async setupHeartbeat(): Promise<void> {
    try {
      let monitorUrl = String(process.env.MONITOR_URL || process.env.MONITOR_ORIGIN || '').trim();
      if (!monitorUrl) {
        try {
          const cfg = (await db.getConfiguration('monitor.origin')) || (await db.getConfiguration('monitor_url')) || (await db.getConfiguration('monitoring.origin'));
          monitorUrl = String(cfg?.value || '').trim();
        } catch {}
      }
      if (!monitorUrl) {
        console.log('💓 Worker heartbeat disabled (MONITOR_URL not set)');
        return;
      }
      const workerId = String(process.env.WORKER_ID || `${os.hostname()}:${process.pid}`).trim();
      const intervalMs = Math.max(1000, Number(process.env.HEARTBEAT_INTERVAL_MS ?? 2000));
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = setInterval(async () => {
        try {
          const payload = {
            worker_id: workerId,
            timestamp: new Date().toISOString(),
            queue_connected: isQueueConnected(),
            prefetch: getPrefetchMap(),
          };
          // @ts-ignore
          await fetch(`${monitorUrl}/api/worker/heartbeat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).catch(() => {});
        } catch {}
      }, intervalMs);
      console.log(`💓 Worker heartbeat to ${monitorUrl} every ${intervalMs}ms (id=${workerId})`);
    } catch (e) {
      console.warn('Failed to setup heartbeat:', e instanceof Error ? e.message : String(e));
    }
  }
}

// Export singleton instance
export const engine = new Engine();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  await engine.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  await engine.stop();
  process.exit(0);
});
