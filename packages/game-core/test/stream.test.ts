import { describe, expect, it } from 'vitest';
import {
  createPracticeCursor,
  createRowStream,
  createRun,
  MAX_BUFFER_ROWS,
  MAX_ROW_BATCH,
  PRACTICE_RNG,
  takeRows,
  transitionRun,
} from '../src/index.ts';
import type {
  BridgeRow,
  RandomCursor,
  RandomSource,
  RowStreamState,
  RunCommand,
  RunState,
} from '../src/index.ts';

function jsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function generate(count: number, batch: number, saveEachBatch: boolean) {
  let stream = createRowStream(createPracticeCursor('123456789'), PRACTICE_RNG);
  const rows: BridgeRow[] = [];
  while (rows.length < count) {
    const next = takeRows(stream, Math.min(batch, count - rows.length), PRACTICE_RNG);
    rows.push(...next.rows);
    stream = saveEachBatch ? jsonRoundTrip(next.stream) : next.stream;
  }
  return { rows, stream };
}

const rng: RandomSource = {
  algorithm: 'test-independent-streams-v1',
  next(cursor) {
    const value = cursor.state === 'rewards' ? 0.2 : Number(BigInt(cursor.draws) % 97n) / 97;
    return { value, cursor: { ...cursor, draws: (BigInt(cursor.draws) + 1n).toString() } };
  },
};

function cursor(domain: string): RandomCursor {
  return { algorithm: rng.algorithm, state: domain, draws: '0' };
}

function fresh(ahead: number, history: number): RunState {
  return createRun(
    {
      runId: 'stream-run',
      routeRng: cursor('route'),
      mysteryRng: cursor('rewards'),
      observedAt: 1_000,
      buffer: { ahead, history },
    },
    rng,
  );
}

function current(state: RunState): BridgeRow {
  const row = state.rows.find((row) => row.index === state.lastClearedRow);
  if (!row) throw new Error('Current row missing from bounded buffer');
  return row;
}

function act(state: RunState, command: RunCommand, time: number) {
  return transitionRun(state, command, { activeTimeMs: time, achievedAt: 1_000 + time, rng });
}

function advance(state: RunState, time: number): RunState {
  const result = act(
    state,
    {
      type: 'choose',
      row: state.currentRow,
      life: state.revivesApplied,
      side: current(state).safeSide,
    },
    time,
  );
  if (!result.accepted) throw new Error(`Unexpected rejection: ${result.reason}`);
  return result.state;
}

describe('bounded resumable row stream', () => {
  it.each([1, 7, 64, MAX_ROW_BATCH])(
    'keeps the exact route and cursors for batches of %s, including serialized checkpoints',
    (batch) => {
      const expected = generate(1_024, MAX_ROW_BATCH, false);
      expect(generate(1_024, batch, true)).toEqual(expected);
    },
  );

  it('preserves the source first-mystery convention and 3–6 gaps beyond row350', () => {
    const rows = generate(1_024, 7, true).rows;
    const indices = rows.filter((row) => row.hasMystery).map((row) => BigInt(row.index));
    expect(indices[0]).toBeGreaterThanOrEqual(3n);
    expect(indices[0]).toBeLessThanOrEqual(6n);
    for (let index = 1; index < indices.length; index += 1) {
      expect(indices[index] - indices[index - 1]).toBeGreaterThanOrEqual(3n);
      expect(indices[index] - indices[index - 1]).toBeLessThanOrEqual(6n);
    }
    expect(indices.some((index) => index > 350n && index < 357n)).toBe(true);
    expect(indices.some((index) => index > 1_000n)).toBe(true);
    expect(rows[349]?.index).toBe('349');
    expect(rows[350]?.index).toBe('350');
  });

  it('does not mutate stream inputs and zero allocation does not consume RNG', () => {
    const stream = createRowStream(createPracticeCursor(0), PRACTICE_RNG);
    Object.freeze(stream.rng);
    Object.freeze(stream);
    const saved = JSON.stringify(stream);
    expect(takeRows(stream, 0, PRACTICE_RNG)).toEqual({ rows: [], stream });
    takeRows(stream, 8, PRACTICE_RNG);
    expect(JSON.stringify(stream)).toBe(saved);
  });

  it.each([-1, 0.5, NaN, Infinity, MAX_ROW_BATCH + 1])(
    'rejects an invalid or unbounded batch %s',
    (batch) => {
      const stream = createRowStream(createPracticeCursor(0), PRACTICE_RNG);
      expect(() => takeRows(stream, batch, PRACTICE_RNG)).toThrow();
    },
  );

  it('keeps exact absolute indices and RNG draw counts above 32-bit and safe-number boundaries', () => {
    for (const start of [
      4_294_967_295n,
      9_007_199_254_740_990n,
      123_456_789_012_345_678_901_234n,
    ]) {
      const initial = createRowStream(createPracticeCursor(5), PRACTICE_RNG);
      const anchored: RowStreamState = {
        ...initial,
        nextIndex: start.toString(),
        nextMysteryIndex: (start + 1n).toString(),
        rng: { ...initial.rng, draws: start.toString() },
      };
      const result = takeRows(jsonRoundTrip(anchored), 4, PRACTICE_RNG);
      expect(result.rows.map((row) => row.index)).toEqual(
        [0n, 1n, 2n, 3n].map((delta) => (start + delta).toString()),
      );
      expect(result.rows[1]?.hasMystery).toBe(true);
      expect(result.stream.nextIndex).toBe((start + 4n).toString());
      expect(result.stream.rng.draws).toBe((start + 5n).toString());
      expect(jsonRoundTrip(result)).toEqual(result);
    }
  });

  it('rejects invalid RNG output, cursor mismatch, non-advancing cursors and a lost mystery cursor', () => {
    const valid = createPracticeCursor(0);
    expect(() => createRowStream({ ...valid, algorithm: 'wrong' }, PRACTICE_RNG)).toThrow();
    for (const value of [NaN, Infinity, -0.1, 1]) {
      const invalid: RandomSource = {
        algorithm: valid.algorithm,
        next: (c) => ({ value, cursor: { ...c, draws: '1' } }),
      };
      expect(() => createRowStream(valid, invalid)).toThrow();
    }
    const stuck: RandomSource = {
      algorithm: valid.algorithm,
      next: (c) => ({ value: 0, cursor: c }),
    };
    expect(() => createRowStream(valid, stuck)).toThrow();
    const stream = createRowStream(valid, PRACTICE_RNG);
    expect(() =>
      takeRows({ ...stream, nextIndex: '12', nextMysteryIndex: '11' }, 1, PRACTICE_RNG),
    ).toThrow();
    for (const invalid of ['01', '-1', '1e5', '2.5', '']) {
      expect(() => takeRows({ ...stream, nextIndex: invalid }, 1, PRACTICE_RNG)).toThrow();
    }
  });
});

describe('endless active state', () => {
  it('does not let route prefetch size change mystery outcomes or gameplay after resume', () => {
    let narrow = fresh(1, 0);
    let wide = fresh(64, 8);
    for (let index = 0; index < 1_024; index += 1) {
      expect(current(narrow)).toEqual(current(wide));
      if (current(narrow).hasMystery) {
        const command: RunCommand = { type: 'mystery', row: narrow.currentRow, life: 0 };
        const a = act(narrow, command, index * 500);
        const b = act(wide, command, index * 500);
        expect(a.events).toEqual(b.events);
        narrow = a.state;
        wide = b.state;
      }
      const command: RunCommand = {
        type: 'choose',
        row: narrow.currentRow,
        life: 0,
        side: current(narrow).safeSide,
      };
      const a = act(narrow, command, index * 500);
      const b = act(wide, command, index * 500);
      expect(a.events).toEqual(b.events);
      narrow = a.state;
      wide = index % 31 === 0 ? jsonRoundTrip(b.state) : b.state;
      expect(narrow.sp).toBe(wide.sp);
      expect(narrow.hints).toBe(wide.hints);
      expect(narrow.mysteryRng).toEqual(wide.mysteryRng);
      expect(narrow.lastClearedRow).toBe(wide.lastClearedRow);
      expect(narrow.achievedAt).toBe(wide.achievedAt);
    }
    const a = act(narrow, { type: 'end' }, 512_000);
    const b = act(wide, { type: 'end' }, 512_000);
    expect(a.state.result).toEqual(b.state.result);
  });

  it('releases old rows and resolutions throughout a 10,000-row controlled run', () => {
    let state = fresh(8, 4);
    let maximumRows = 0;
    let maximumResolutions = 0;
    let checkpointBytesAt100 = 0;
    for (let index = 0; index < 10_000; index += 1) {
      state = advance(state, index);
      if (index % 127 === 0) state = jsonRoundTrip(state);
      maximumRows = Math.max(maximumRows, state.rows.length);
      maximumResolutions = Math.max(maximumResolutions, state.resolutions.length);
      expect(state.rows.length).toBeLessThanOrEqual(12);
      expect(state.resolutions.length).toBeLessThanOrEqual(4);
      expect(state.bufferOffset).toBe(state.rows[0]?.index);
      expect(state.rows[0] && BigInt(state.rows[0].index)).toBeGreaterThanOrEqual(
        BigInt(state.lastClearedRow) - 4n,
      );
      if (index === 99) checkpointBytesAt100 = JSON.stringify(state).length;
    }
    expect(state).toMatchObject({
      status: 'playing',
      lastClearedRow: '10000',
      currentRow: '10001',
      sp: 300,
      result: null,
    });
    expect(maximumRows).toBeLessThanOrEqual(12);
    expect(maximumResolutions).toBeLessThanOrEqual(4);
    // Digit growth is expected; retaining 9,900 historical rows is not.
    expect(JSON.stringify(state).length).toBeLessThan(checkpointBytesAt100 + 1_000);
    expect(state.reviveReceipts.length).toBe(0);
    expect(state.effects.length).toBe(0);
  });

  it('advances and finalizes an exact checkpoint beyond Number.MAX_SAFE_INTEGER', () => {
    const origin = 9_007_199_254_740_990n;
    const base = fresh(1, 0);
    const anchor: RowStreamState = {
      ...base.stream,
      nextIndex: origin.toString(),
      nextMysteryIndex: (origin + 3n).toString(),
      rng: { ...base.stream.rng, draws: origin.toString() },
    };
    const generated = takeRows(anchor, 1, rng);
    let state: RunState = jsonRoundTrip({
      ...base,
      lastClearedRow: origin.toString(),
      currentRow: (origin + 1n).toString(),
      achievedAt: 1_000,
      bufferOffset: origin.toString(),
      rows: generated.rows,
      stream: generated.stream,
    });
    for (let index = 0; index < 5; index += 1) state = advance(state, index);
    expect(state.lastClearedRow).toBe('9007199254740995');
    expect(state.currentRow).toBe('9007199254740996');
    expect(state.bufferOffset).toBe('9007199254740995');
    const ended = act(state, { type: 'end' }, 5).state;
    expect(ended.result?.lastClearedRow).toBe('9007199254740995');
    expect(jsonRoundTrip(ended)).toEqual(ended);
  });

  it('rejects a buffer allocation that could turn endless mode into an unbounded array', () => {
    for (const [ahead, history] of [
      [0, 0],
      [1.5, 1],
      [1, -1],
      [MAX_BUFFER_ROWS, 1],
      [Infinity, 0],
    ]) {
      expect(() => fresh(ahead, history)).toThrow();
    }
  });
});
