import type { RankedClient } from './ranked-client';

/** Play opens a confirmed run or starts one. Taking over another device stays explicit. */
export async function enterRankedPlay(client: RankedClient, isCurrent: () => boolean) {
  const current = client.snapshot();
  if (!isCurrent() || !current.online) return;
  if (current.run && current.run.status !== 'finished') {
    if (current.phase === 'recovery') await client.recover(current.run.runId);
    else if (current.phase === 'ready' && current.run.paused && current.run.status === 'playing')
      await client.command({ type: 'resume' });
    return;
  }
  if (!['idle', 'recovery', 'finished'].includes(current.phase)) return;
  const saved = await client.lookupActive();
  if (!isCurrent()) return;
  if (saved) await client.recover(saved);
  else if (['idle', 'finished'].includes(client.snapshot().phase)) await client.start();
}
