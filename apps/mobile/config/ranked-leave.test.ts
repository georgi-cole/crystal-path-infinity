import { describe, it, expect, vi } from 'vitest';
import type { RankedClient, RankedCommand, RankedRun } from '../src/ranked/ranked-client';
import { leaveVerifiedRun, canUseCreditFromReward } from '../src/ranked/ranked-leave';
const runId = 'ac000000-0000-4000-8000-000000000001';
function fixture(pending = false, acknowledge = true) {
  let status: RankedRun['status'] = 'dead';
  const command = vi.fn<(command: RankedCommand) => Promise<void>>((command) => {
    if (command.type === 'end' && acknowledge) status = 'finished';
    return Promise.resolve();
  });
  const archive = vi.fn(() => Promise.resolve(true));
  const client = {
    snapshot: () => ({
      phase: 'ready',
      online: true,
      run: { runId, status, rewardPending: pending, revivesGranted: 0, revivesApplied: 0 },
    }),
    command,
    archivePending: archive,
  } as unknown as RankedClient;
  return { client, command, archive };
}
describe('return to menu from a verified death', () => {
  it('ends an unclaimed death and waits for the server acknowledgement', async () => {
    const f = fixture();
    expect(
      await leaveVerifiedRun(f.client, runId, () => ({
        phase: 'offer',
        fullscreen: false,
        waiting: false,
      })),
    ).toBe(true);
    expect(f.command).toHaveBeenCalledWith({ type: 'end' });
    expect(f.archive).not.toHaveBeenCalled();
    const lost = fixture(false, false);
    expect(await leaveVerifiedRun(lost.client, runId, () => null)).toBe(false);
  });
  it('archives an earned pending reward even while background verification is polling', async () => {
    const f = fixture(true);
    expect(
      await leaveVerifiedRun(f.client, runId, () => ({
        phase: 'earned_pending',
        fullscreen: false,
        waiting: true,
      })),
    ).toBe(true);
    expect(f.archive).toHaveBeenCalledWith(runId);
    expect(f.command).not.toHaveBeenCalled();
  });
  it('keeps credit continues available for an offer or ad limit, without racing a native ad', () => {
    expect(canUseCreditFromReward({ phase: 'offer', fullscreen: false, waiting: false })).toBe(
      true,
    );
    expect(canUseCreditFromReward({ phase: 'limit', fullscreen: false, waiting: false })).toBe(
      true,
    );
    expect(canUseCreditFromReward({ phase: 'loading', fullscreen: false, waiting: false })).toBe(
      false,
    );
    expect(canUseCreditFromReward({ phase: 'granted', fullscreen: false, waiting: false })).toBe(
      false,
    );
    expect(canUseCreditFromReward({ phase: 'offer', fullscreen: true, waiting: false })).toBe(
      false,
    );
  });
});
