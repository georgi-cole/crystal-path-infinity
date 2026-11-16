import { describe, expect, it, vi } from 'vitest';
import { createRun, createPracticeCursor, PRACTICE_RNG } from '@crystal-path-infinity/game-core';
import type { RunState } from '@crystal-path-infinity/game-core';
import { MysteryCadence } from '../src/rewards/mystery-cadence';
import {
  campaignAllowsSponsorship,
  watchMysterySponsor,
} from '../src/rewards/mystery-sponsor-flow';
import { createPracticeRuntime } from '../src/practice-runtime';
import { readPracticeCheckpoint, writePracticeCheckpoint } from '../src/practice-save';
import { CAMPAIGN_MISSIONS } from '../src/campaign-content';
import { campaignTasks } from '../src/campaign-objectives';
import {
  EMPTY_CAMPAIGN_PROGRESS,
  newMissionSnapshot,
  createCampaignRun,
  grantCampaignClear,
} from '../src/campaign-test';

function fixture() {
  const saved = new Map<string, string>();
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => {
      saved.set(key, value);
    },
    removeItem: (key: string) => {
      saved.delete(key);
    },
  };
  return { saved, storage, cadence: new MysteryCadence(() => storage) };
}
const state = () =>
  createRun(
    {
      runId: 'practice-cadence',
      observedAt: 1000,
      routeRng: createPracticeCursor(12),
      mysteryRng: createPracticeCursor(42),
      sponsoredMysteries: true,
    },
    PRACTICE_RNG,
  );

describe('recurring mystery cadence', () => {
  it('offers every fifth box, deduplicates reopen, and survives mode/restart boundaries', () => {
    const f = fixture();
    for (let i = 1; i <= 15; i++) {
      const c = new MysteryCadence(() => f.storage);
      expect(c.eligible()).toBe(i % 5 === 0);
      c.opened('box-' + i);
      c.opened('box-' + i);
    }
  });
  it('enforces active-gameplay cooldown and decline fatigue', () => {
    const f = fixture();
    const c = f.cadence;
    c.observe(state());
    c.adEnded();
    for (let i = 1; i < 5; i++) c.opened(String(i));
    expect(c.eligible()).toBe(false);
    c.observe({ ...state(), activeTimeMs: 90_000 });
    expect(c.eligible()).toBe(true);
    c.decline();
    c.decline();
    expect(c.eligible()).toBe(false);
    c.observe({ ...state(), activeTimeMs: 390_000 });
    expect(c.eligible()).toBe(true);
  });
  it('fails closed for damaged storage', () => {
    const f = fixture();
    f.saved.set('cpi.mystery-sponsor.v1', '{"boxes":5}');
    expect(new MysteryCadence(() => f.storage).eligible()).toBe(false);
  });
});

describe('Campaign compatibility', () => {
  it('excludes every required objective row, failed tasks and final landings across all missions', () => {
    for (const definition of CAMPAIGN_MISSIONS) {
      const mission = newMissionSnapshot(definition.id);
      const tasks = campaignTasks(mission, EMPTY_CAMPAIGN_PROGRESS);
      const display = { targetRow: mission.targetRow, tasks };
      expect(campaignAllowsSponsorship(String(mission.targetRow), display)).toBe(false);
      for (const task of tasks)
        for (const row of task.rows ?? [])
          expect(campaignAllowsSponsorship(String(row.row), display)).toBe(false);
    }
    expect(campaignAllowsSponsorship('5')).toBe(true);
  });
  it('permits a normal clear but prevents assisted Mastery', () => {
    const mission = newMissionSnapshot(CAMPAIGN_MISSIONS[0].id);
    const run = createCampaignRun(mission, 1n);
    const sponsored = { ...run, sponsorship: { version: 1 as const, claimed: 1, offer: null } };
    const progress = grantCampaignClear(EMPTY_CAMPAIGN_PROGRESS, mission, sponsored);
    expect(progress.cleared).toContain(mission.id);
    expect(progress.mastered).not.toContain(mission.id);
  });
});

describe('SDK completion and durable local grants', () => {
  async function runtime() {
    const f = fixture();
    const initial = state();
    const run: RunState = {
      ...initial,
      sponsorship: {
        version: 1,
        claimed: 0,
        offer: {
          id: `${initial.runId}:1:0`,
          kind: 'healing',
          amount: 10,
          at: 0,
          status: 'offered',
        },
      },
    };
    const snapshot = {
      pageId: 'test',
      bridgeId: 'test',
      sequence: 0,
      active: true,
      monotonicMs: 0,
      observedAt: 1000,
    };
    const sample = vi.fn(() => Promise.resolve(snapshot));
    const host = createPracticeRuntime({
      state: run,
      rng: PRACTICE_RNG,
      lifecycle: {
        ready: Promise.resolve(snapshot),
        sample,
        getSnapshot: () => snapshot,
        subscribe: () => () => {},
        dispose: () => {},
      },
      schedule: () => () => {},
      onTransition: (result) => writePracticeCheckpoint(f.storage, result.state),
      onError: (error) => {
        throw error;
      },
    });
    await host.ready;
    const hold = await host.hold('ad');
    return { host, hold, f, run, sample };
  }
  it('grants exactly once before fullscreen dismissal and restores the earned checkpoint', async () => {
    const { host, hold, f, run } = await runtime();
    const result = await watchMysterySponsor(
      host,
      {
        showPrivacyOptions: async () => {},
        watch: (_signal, earned) => {
          earned();
          earned();
          return Promise.resolve('closed' as const);
        },
      },
      new AbortController().signal,
    );
    expect(result).toBe('earned');
    expect(host.getState().sp).toBe(run.sp + 10);
    const saved = readPracticeCheckpoint(f.storage);
    expect(saved.status).toBe('ready');
    if (saved.status === 'ready') expect(saved.state.sponsorship?.offer?.status).toBe('earned');
    expect(host.getState().activeTimeMs).toBe(0);
    await hold.release();
    host.dispose();
  });
  it('checkpoints completion while the ad remains fullscreen and ignores abort/late completion', async () => {
    const { host, hold, f } = await runtime();
    let close!: () => void;
    const pending = watchMysterySponsor(
      host,
      {
        showPrivacyOptions: async () => {},
        watch: (_signal, earned) => {
          earned();
          return new Promise((resolve) => {
            close = () => resolve('closed');
          });
        },
      },
      new AbortController().signal,
    );
    await vi.waitFor(() => {
      const saved = readPracticeCheckpoint(f.storage);
      expect(saved.status === 'ready' && saved.state.sponsorship?.offer?.status).toBe('earned');
    });
    close();
    expect(await pending).toBe('earned');
    await hold.release();
    host.dispose();
    const other = await runtime();
    const controller = new AbortController();
    controller.abort();
    const watch = vi.fn(() => Promise.resolve('closed' as const));
    expect(
      await watchMysterySponsor(
        other.host,
        { watch, showPrivacyOptions: async () => {} },
        controller.signal,
      ),
    ).toBe('unavailable');
    expect(watch).not.toHaveBeenCalled();
    await other.hold.release();
    other.host.dispose();
  });
  it('keeps an earned reward when the fullscreen ad makes native sampling unavailable', async () => {
    const { host, hold, f, sample, run } = await runtime();
    const result = await watchMysterySponsor(
      host,
      {
        showPrivacyOptions: async () => {},
        watch: async (_signal, earned) => {
          sample.mockRejectedValue(new Error('Native game view covered'));
          earned();
          await vi.waitFor(() => expect(host.getState().sponsorship?.offer?.status).toBe('earned'));
          return 'closed';
        },
      },
      new AbortController().signal,
    );
    expect(result).toBe('earned');
    expect(host.getState().sp).toBe(run.sp + 10);
    const saved = readPracticeCheckpoint(f.storage);
    expect(saved.status === 'ready' && saved.state.sponsorship?.offer?.status).toBe('earned');
    sample.mockReset();
    sample.mockImplementation(() =>
      Promise.resolve({
        pageId: 'test',
        bridgeId: 'test',
        sequence: 0,
        active: true,
        monotonicMs: 0,
        observedAt: 1000,
      }),
    );
    await hold.release();
    host.dispose();
  });
  it.each(['closed', 'no_fill', 'error'] as const)(
    'does not grant on %s without an earned callback',
    async (outcome) => {
      const { host, hold, run } = await runtime();
      await watchMysterySponsor(
        host,
        { showPrivacyOptions: async () => {}, watch: () => Promise.resolve(outcome) },
        new AbortController().signal,
      );
      expect(host.getState().sp).toBe(run.sp);
      expect(host.getState().sponsorship?.claimed).toBe(0);
      await hold.release();
      host.dispose();
    },
  );
  it('ignores late callbacks after dismissal', async () => {
    const { host, hold, run } = await runtime();
    let late = () => {};
    await watchMysterySponsor(
      host,
      {
        showPrivacyOptions: async () => {},
        watch: (_s, earned) => {
          late = earned;
          return Promise.resolve('closed' as const);
        },
      },
      new AbortController().signal,
    );
    late();
    expect(host.getState().sp).toBe(run.sp);
    await hold.release();
    host.dispose();
  });
});
