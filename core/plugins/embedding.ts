import { db } from '../database.js';

export async function embedding(action: string, params: any, config: any): Promise<any> {
  switch (action) {
    case 'backfill':
      return backfill(params, config);
    case 'reindex':
      return reindex(params, config);
    case 'cosim_batch':
      return cosimBatch(params, config);
    default:
      throw new Error(`Unknown embedding action: ${action}`);
  }
}

async function backfill(params: any, config: any): Promise<any> {
  const limit = Math.max(1, Number(params?.limit ?? config?.backfill?.limit ?? 500));
  const batchSize = Math.max(1, Number(params?.batch_size ?? config?.backfill?.batch_size ?? 16));
  const updated = await db.backfillArticleEmbeddings({ limit, batch_size: batchSize });
  return { updated, limit, batch_size: batchSize };
}

async function reindex(params: any, config: any): Promise<any> {
  await db.reindexVectorIndex();
  return { reindexed: true };
}

async function cosimBatch(params: any, _config: any): Promise<any> {
  const anchors: string[] = Array.isArray(params?.anchors) ? params.anchors.map((t: any) => String(t)) : [];
  const candidates: string[] = Array.isArray(params?.candidates) ? params.candidates.map((t: any) => String(t)) : [];
  const topK = Math.max(1, Number(params?.top_k ?? 10));
  if (!anchors.length || !candidates.length) return { anchors: [], candidates: [], top_k: topK };
  const prefixedAnchors = anchors.map((t) => `passage: ${t}`);
  const prefixedCandidates = candidates.map((t) => `passage: ${t}`);
  const A = await db.embedTextsBatch(prefixedAnchors);
  const B = await db.embedTextsBatch(prefixedCandidates);
  const results: Array<{ index: number; top: Array<{ index: number; score: number; text: string }> }> = [];
  for (let i = 0; i < A.length; i++) {
    const a = A[i];
    const scores: Array<{ index: number; score: number }> = [];
    for (let j = 0; j < B.length; j++) {
      const b = B[j];
      let dot = 0;
      for (let k = 0; k < Math.min(a.length, b.length); k++) dot += (Number(a[k]) || 0) * (Number(b[k]) || 0);
      scores.push({ index: j, score: dot });
    }
    scores.sort((x, y) => y.score - x.score);
    const top = scores.slice(0, topK).map((s) => ({ index: s.index, score: s.score, text: candidates[s.index] }));
    results.push({ index: i, top });
  }
  return { anchors, candidates, top_k: topK, results };
}
