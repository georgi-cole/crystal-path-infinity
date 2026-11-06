import {
  assertRunState,
  MAX_BUFFER_ROWS,
  MAX_REVIVES,
  PRACTICE_RNG,
  RULESET_VERSION,
  PACT_RULESET_VERSION,
  BALANCE_RULESET_VERSION,
  RISK_RULESET_VERSION,
  DIRECTOR_RULESET_VERSION,
  RELIC_RULESET_VERSION,
  DISCOVERY_RULESET_VERSION,
} from '@crystal-path-infinity/game-core';
import type { RunState } from '@crystal-path-infinity/game-core';

/**
 * These keys are practice-only. Neither ranked score writes nor ranked revive
 * counts can use or trust this client storage.
 */
export const PRACTICE_SAVE_KEYS = Object.freeze({
  head: 'cpi.practice.v1.head',
  slots: ['cpi.practice.v1.slot.0', 'cpi.practice.v1.slot.1'] as const,
  settings: 'cpi.practice.v1.settings',
  personalBest: 'cpi.practice.v1.best',
});
export const MAX_CHECKPOINT_CHARS = 80_000;

export interface PracticeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface Head {
  version: 1;
  slot: 0 | 1;
  revision: number;
  digest: string;
}
interface RecordEnvelope {
  payload: string;
  digest: string;
}

export type PracticeLoad =
  | { readonly status: 'empty' }
  | { readonly status: 'ready'; readonly state: RunState; readonly revision: number }
  | { readonly status: 'corrupt'; readonly message: string };

export interface PracticeSettings {
  readonly music: boolean;
  readonly soundEffects: boolean;
  readonly haptics: boolean;
  readonly reducedMotion: boolean;
}
export const DEFAULT_PRACTICE_SETTINGS: PracticeSettings = Object.freeze({
  music: true,
  soundEffects: true,
  haptics: true,
  reducedMotion: false,
});
interface SettingsEnvelope {
  version: 2;
  settings: PracticeSettings;
}

function checksum(payload: string): string {
  // Accidental-integrity check only, never an authentication or ranked proof.
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    hash = Math.imul(hash ^ payload.charCodeAt(i), 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function readHead(storage: PracticeStorage): Head | null {
  const raw = storage.getItem(PRACTICE_SAVE_KEYS.head);
  if (raw === null) return null;
  if (raw.length > 200) throw new Error('The practice commit marker exceeds its size limit.');
  const candidate: unknown = JSON.parse(raw);
  if (
    !isRecord(candidate) ||
    candidate.version !== 1 ||
    (candidate.slot !== 0 && candidate.slot !== 1) ||
    typeof candidate.digest !== 'string' ||
    !/^[0-9a-f]{8}$/.test(candidate.digest) ||
    !Number.isSafeInteger(candidate.revision) ||
    (candidate.revision as number) < 1
  ) {
    throw new Error('The practice commit marker is incompatible or damaged.');
  }
  return candidate as unknown as Head;
}
function validatePracticeState(state: RunState): void {
  assertRunState(state, PRACTICE_RNG);
  if (
    !state.runId.startsWith('practice-') ||
    ![
      RULESET_VERSION,
      PACT_RULESET_VERSION,
      BALANCE_RULESET_VERSION,
      RISK_RULESET_VERSION,
      DIRECTOR_RULESET_VERSION,
      RELIC_RULESET_VERSION,
      DISCOVERY_RULESET_VERSION,
    ].includes(state.rulesetVersion) ||
    state.rows.length > MAX_BUFFER_ROWS ||
    state.resolutions.length > state.buffer.history ||
    state.reviveReceipts.length > MAX_REVIVES
  ) {
    throw new Error('This is not a supported standalone practice checkpoint.');
  }
}

/** Only the marked slot is committed. A partial write never resurrects old SP/rewards. */
export function readPracticeCheckpoint(storage: PracticeStorage): PracticeLoad {
  try {
    const head = readHead(storage);
    if (!head) return { status: 'empty' };
    const raw = storage.getItem(PRACTICE_SAVE_KEYS.slots[head.slot]);
    if (!raw || raw.length > MAX_CHECKPOINT_CHARS) {
      throw new Error('The committed checkpoint is missing or too large.');
    }
    const envelope: unknown = JSON.parse(raw);
    if (
      !isRecord(envelope) ||
      typeof envelope.payload !== 'string' ||
      typeof envelope.digest !== 'string' ||
      envelope.digest !== head.digest ||
      checksum(envelope.payload) !== head.digest
    ) {
      throw new Error('The committed checkpoint failed integrity validation.');
    }
    const payload: unknown = JSON.parse(envelope.payload);
    if (
      !isRecord(payload) ||
      payload.version !== 1 ||
      payload.revision !== head.revision ||
      !isRecord(payload.state)
    ) {
      throw new Error('This checkpoint schema is unsupported.');
    }
    const state = payload.state as unknown as RunState;
    validatePracticeState(state);
    return { status: 'ready', state, revision: head.revision };
  } catch {
    return {
      status: 'corrupt',
      message:
        'The saved practice cannot be safely restored. Start a new practice to discard it; the previous run will not be replayed.',
    };
  }
}

/**
 * Two-phase synchronous commit: write inactive slot; verify it; change the head
 * last. Browser/WebView termination in either phase restores the last committed
 * checkpoint, never a partially written snapshot.
 */
export function writePracticeCheckpoint(storage: PracticeStorage, state: RunState): number {
  validatePracticeState(state);
  const previous = readPracticeCheckpoint(storage);
  if (previous.status === 'corrupt') {
    throw new Error(previous.message);
  }
  const head = readHead(storage);
  const slot = head?.slot === 0 ? 1 : 0;
  const revision = (head?.revision ?? 0) + 1;
  if (!Number.isSafeInteger(revision)) throw new RangeError('Practice revision overflow.');
  const payload = JSON.stringify({ version: 1, revision, state });
  const digest = checksum(payload);
  const envelope: RecordEnvelope = { payload, digest };
  const serialized = JSON.stringify(envelope);
  if (serialized.length > MAX_CHECKPOINT_CHARS) {
    throw new RangeError('The practice checkpoint exceeds its bounded storage budget.');
  }
  const destination = PRACTICE_SAVE_KEYS.slots[slot];
  storage.setItem(destination, serialized);
  if (storage.getItem(destination) !== serialized) {
    throw new Error('The practice checkpoint was not committed to local storage.');
  }
  const marker: Head = { version: 1, slot, revision, digest };
  storage.setItem(PRACTICE_SAVE_KEYS.head, JSON.stringify(marker));
  return revision;
}

export function clearPracticeCheckpoint(storage: PracticeStorage): void {
  // Head first: a crash during clearing cannot expose an older stored slot.
  storage.removeItem(PRACTICE_SAVE_KEYS.head);
  for (const key of PRACTICE_SAVE_KEYS.slots) storage.removeItem(key);
}

export function readPracticeSettings(storage: PracticeStorage): {
  readonly settings: PracticeSettings;
  readonly warning: string | null;
} {
  try {
    const raw = storage.getItem(PRACTICE_SAVE_KEYS.settings);
    if (raw === null) return { settings: DEFAULT_PRACTICE_SETTINGS, warning: null };
    if (raw.length > 300) throw new Error('Settings are too large.');
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      (value.version !== 1 && value.version !== 2) ||
      !isRecord(value.settings)
    ) {
      throw new Error('Unsupported settings.');
    }
    const settings = value.settings;
    if (
      typeof settings.music !== 'boolean' ||
      typeof settings.soundEffects !== 'boolean' ||
      (value.version === 2 && typeof settings.haptics !== 'boolean') ||
      typeof settings.reducedMotion !== 'boolean'
    ) {
      throw new Error('Invalid settings fields.');
    }
    return {
      settings: {
        music: settings.music,
        soundEffects: settings.soundEffects,
        haptics: value.version === 1 ? true : (settings.haptics as boolean),
        reducedMotion: settings.reducedMotion,
      },
      warning: null,
    };
  } catch {
    return {
      settings: DEFAULT_PRACTICE_SETTINGS,
      warning:
        'Local practice settings were reset to defaults because the saved version was unreadable.',
    };
  }
}
export function writePracticeSettings(storage: PracticeStorage, settings: PracticeSettings): void {
  for (const value of [
    settings.music,
    settings.soundEffects,
    settings.haptics,
    settings.reducedMotion,
  ]) {
    if (typeof value !== 'boolean') throw new TypeError('Invalid practice setting.');
  }
  const record: SettingsEnvelope = { version: 2, settings };
  storage.setItem(PRACTICE_SAVE_KEYS.settings, JSON.stringify(record));
}

/** Strictly local practice best, never an official ranked result or upload token. */
export function recordPracticePersonalBest(
  storage: PracticeStorage,
  score: string,
  rulesetVersion = RULESET_VERSION,
): boolean {
  if (!/^(0|[1-9][0-9]*)$/.test(score) || score.length > 1000) {
    throw new TypeError('Invalid local practice score.');
  }
  const key =
    rulesetVersion === DISCOVERY_RULESET_VERSION
      ? 'cpi.practice.v7-discovery.best'
      : rulesetVersion === RELIC_RULESET_VERSION
        ? 'cpi.practice.v6-relics.best'
        : rulesetVersion === DIRECTOR_RULESET_VERSION
          ? 'cpi.practice.v5-mystery.best'
          : rulesetVersion === RISK_RULESET_VERSION
            ? 'cpi.practice.v4-hidden-risk.best'
            : rulesetVersion === BALANCE_RULESET_VERSION
              ? 'cpi.practice.v3-balance.best'
              : rulesetVersion === PACT_RULESET_VERSION
                ? 'cpi.practice.v2-pacts.best'
                : PRACTICE_SAVE_KEYS.personalBest;
  const stored = storage.getItem(key) ?? '0';
  if (!/^(0|[1-9][0-9]*)$/.test(stored) || stored.length > 1000) {
    throw new Error('The local personal-best record is damaged.');
  }
  if (BigInt(score) <= BigInt(stored)) return false;
  storage.setItem(key, score);
  return true;
}

/** Read a completed local practice record without turning it into official rank. */
export function readPracticePersonalBest(
  storage: PracticeStorage,
  rulesetVersion = RULESET_VERSION,
): string | null {
  try {
    const key =
      rulesetVersion === DISCOVERY_RULESET_VERSION
        ? 'cpi.practice.v7-discovery.best'
        : rulesetVersion === RELIC_RULESET_VERSION
          ? 'cpi.practice.v6-relics.best'
          : rulesetVersion === DIRECTOR_RULESET_VERSION
            ? 'cpi.practice.v5-mystery.best'
            : rulesetVersion === RISK_RULESET_VERSION
              ? 'cpi.practice.v4-hidden-risk.best'
              : rulesetVersion === BALANCE_RULESET_VERSION
                ? 'cpi.practice.v3-balance.best'
                : rulesetVersion === PACT_RULESET_VERSION
                  ? 'cpi.practice.v2-pacts.best'
                  : PRACTICE_SAVE_KEYS.personalBest;
    const value = storage.getItem(key);
    if (value === null || value.length > 1000 || !/^(0|[1-9][0-9]*)$/.test(value)) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}
