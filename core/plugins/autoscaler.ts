import { queue } from '../queue.js';

export async function autoScale(action: string, params: any, config: any): Promise<any> {
  switch (action) {
    case 'check_and_scale':
      return checkAndScale(params, config);
    default:
      throw new Error(`Unknown autoscaler action: ${action}`);
  }
}

async function checkAndScale(params: any, config: any): Promise<any> {
  if (!config.enabled) {
    console.log('📈 Auto-scaling disabled');
    return { scaled: false, reason: 'disabled' };
  }
  
  console.log(`📈 Auto-scaling check (${params.trigger || 'unknown'})`);
  const defaultQueues = ['scraping', 'url_collection'];
  const queuesCfg: Array<{ name: string; base_prefetch?: number; max_prefetch?: number; scale_step?: number; up_threshold?: number; down_threshold?: number; target_jobs_per_worker?: number }>
    = Array.isArray(config.queues) && config.queues.length
      ? config.queues.map((q: any) => (typeof q === 'string' ? { name: q } : { name: q.name || q.queue || q.id || 'scraping', ...q }))
      : defaultQueues.map((name) => ({ name }));

  const globalBase = Math.max(1, Number(config.prefetch_base ?? 1));
  const globalMax = Math.max(globalBase, Number(config.max_prefetch ?? 16));
  const globalStep = Math.max(1, Number(config.scale_step ?? 2));
  const globalUp = Math.max(1, Number(config.scale_up_threshold ?? 100));
  const globalDown = Math.max(0, Number(config.scale_down_threshold ?? 10));
  const globalTargetJPW = Math.max(1, Number(config.target_jobs_per_worker ?? globalUp));

  const perQueueResults: Array<{ name: string; depth: number; target_prefetch: number }> = [];
  const queueInfos: any[] = [];

  for (const qcfg of queuesCfg) {
    const name = qcfg.name;
    const info = await queue.getQueueInfo(name);
    queueInfos.push({ name, info });
    const depth = (info && typeof info.messageCount === 'number') ? info.messageCount : null;
    if (depth === null) {
      continue;
    }

    const base = Math.max(1, Number(qcfg.base_prefetch ?? globalBase));
    const max = Math.max(base, Number(qcfg.max_prefetch ?? globalMax));
    const step = Math.max(1, Number(qcfg.scale_step ?? globalStep));
    const up = Math.max(1, Number(qcfg.up_threshold ?? globalUp));
    const down = Math.max(0, Number(qcfg.down_threshold ?? globalDown));
    const targetJPW = Math.max(1, Number(qcfg.target_jobs_per_worker ?? globalTargetJPW));

    let target = base;
    if (config.prefetch_base !== undefined || config.max_prefetch !== undefined || qcfg.base_prefetch !== undefined || qcfg.max_prefetch !== undefined) {
      if (depth > up) {
        const increments = Math.ceil(depth / up);
        target = Math.min(max, base + increments * step);
      } else if (depth <= down) {
        target = base;
      }
    } else {
      const minWorkers = Math.max(1, Number(config.min_workers ?? base));
      const maxWorkers = Math.max(minWorkers, Number(config.max_workers ?? max));
      const desiredWorkers = Math.max(minWorkers, Math.min(maxWorkers, Math.ceil(depth / targetJPW)));
      target = desiredWorkers;
    }

    await queue.setPrefetch(target, name);
    perQueueResults.push({ name, depth, target_prefetch: target });
  }

  return {
    scaled: true,
    trigger: params.trigger,
    queues: queueInfos,
    per_queue_targets: perQueueResults,
    defaults: {
      base_prefetch: globalBase,
      max_prefetch: globalMax,
      thresholds: { up: globalUp, down: globalDown, step: globalStep },
      target_jobs_per_worker: globalTargetJPW
    }
  };
}
