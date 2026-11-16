import type { RunState } from '@crystal-path-infinity/game-core';
import { practiceStorage } from '../app-profile';
import type { PracticeStorage } from '../practice-save';

const key = 'cpi.mystery-sponsor.v1';
interface Cadence {
  boxes: number;
  active: number;
  lastAd: number | null;
  declines: number;
  quietUntil: number;
  lastBox: string;
  lastOfferBox: number;
  lastOffer: string;
}
export class MysteryCadence {
  private value: Cadence = {
    boxes: 0,
    active: 0,
    lastAd: null,
    declines: 0,
    quietUntil: 0,
    lastBox: '',
    lastOfferBox: 0,
    lastOffer: '',
  };
  private anchor: { run: string; active: number } | null = null;
  private available = true;
  constructor(private readonly storage: () => PracticeStorage) {
    try {
      const raw = storage().getItem(key);
      if (raw) {
        const data = JSON.parse(raw) as Cadence;
        if (
          ![data.boxes, data.active, data.declines, data.quietUntil].every(
            (v) => Number.isSafeInteger(v) && v >= 0,
          ) ||
          (data.lastAd !== null &&
            (!Number.isSafeInteger(data.lastAd) || data.lastAd < 0 || data.lastAd > data.active)) ||
          typeof data.lastBox !== 'string'
        )
          throw Error('Invalid cadence');
        const lastOfferBox = data.lastOfferBox ?? data.boxes;
        const lastOffer = data.lastOffer ?? '';
        if (
          !Number.isSafeInteger(lastOfferBox) ||
          lastOfferBox < 0 ||
          lastOfferBox > data.boxes ||
          typeof lastOffer !== 'string'
        )
          throw Error('Invalid offer cadence');
        this.value = { ...data, lastOfferBox, lastOffer };
      }
    } catch {
      this.available = false;
    }
  }
  observe(state: RunState) {
    if (this.anchor?.run === state.runId)
      this.value.active += Math.max(0, state.activeTimeMs - this.anchor.active);
    this.anchor = { run: state.runId, active: state.activeTimeMs };
  }
  eligible(): boolean {
    return (
      this.available &&
      this.value.boxes + 1 - this.value.lastOfferBox >= 4 &&
      this.value.active >= this.value.quietUntil &&
      this.cooledDown(60_000)
    );
  }
  cooledDown(minimum = 90_000): boolean {
    return this.value.lastAd === null || this.value.active - this.value.lastAd >= minimum;
  }
  opened(id: string) {
    if (id === this.value.lastBox) return;
    this.value.lastBox = id;
    this.value.boxes++;
    this.save();
  }
  adEnded() {
    this.value.lastAd = this.value.active;
    this.value.declines = 0;
    this.save();
  }
  offered(id: string) {
    if (id === this.value.lastOffer) return;
    this.value.lastOffer = id;
    this.value.lastOfferBox = this.value.boxes;
    this.save();
  }
  decline() {
    this.value.declines++;
    if (this.value.declines >= 2) {
      this.value.quietUntil = this.value.active + 300_000;
      this.value.declines = 0;
    }
    this.save();
  }
  save() {
    try {
      if (this.available) this.storage().setItem(key, JSON.stringify(this.value));
    } catch {
      this.available = false;
    }
  }
}
let shared: MysteryCadence | undefined;
export const mysteryCadence = () => (shared ??= new MysteryCadence(() => practiceStorage()));
