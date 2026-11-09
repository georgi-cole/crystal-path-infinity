import type { RankedClient } from './ranked-client';
import { hasUnclaimedAd } from './ranked-leave';

/** Play resumes or starts a crossing. Saved-run recovery and device takeover are explicit. */
export async function enterRankedPlay(
  client: RankedClient,
  isCurrent: () => boolean,
  savedRunId?: string,
) {
  const current = client.snapshot();
  if (!isCurrent() || !current.online) return;
  if (savedRunId) {
    await client.recover(savedRunId);
    return;
  }

  if (!current.run || current.run.status === 'finished') {
    if (!['idle', 'recovery', 'finished'].includes(current.phase)) return;
    const activeRunId = await client.lookupActive();
    if (!isCurrent()) return;
    if (!activeRunId) {
      if (['idle', 'finished'].includes(client.snapshot().phase)) await client.start();
      return;
    }
    await client.recover(activeRunId);
  } else if (current.phase === 'recovery') {
    await client.recover(current.run.runId);
  }

  const { phase, run } = client.snapshot();
  if (!isCurrent() || phase !== 'ready' || !run) return;
  if (hasUnclaimedAd(run)) {
    // Archive keeps the checkpoint and its pending or earned continuation recoverable.
    if ((await client.archivePending(run.runId)) && isCurrent()) await client.start();
  } else if (run.status === 'playing' && run.paused) {
    await client.command({ type: 'resume' });
  }
}
