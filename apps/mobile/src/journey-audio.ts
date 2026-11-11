import type { Season, Weather } from '@crystal-path-infinity/game-core';

// Low bed underneath the existing World music and tile feedback.
const MIX = {
  spring: [650, 0.7, 0.024],
  summer: [1180, 1.1, 0.016],
  winter: [280, 0.85, 0.022],
  autumn: [440, 0.9, 0.027],
  rain: [1520, 0.65, 0.079],
  shower: [1950, 0.8, 0.064],
  squall: [780, 0.68, 0.105],
  rainbow: [1820, 2.4, 0.028],
  heat: [980, 2.2, 0.026],
  snow: [355, 1.5, 0.036],
  thaw: [540, 1.2, 0.023],
  gust: [560, 1.2, 0.076],
} as const satisfies Record<Season | Weather, readonly [number, number, number]>;

export function createJourneyAudio(createContext: () => AudioContext) {
  let context: AudioContext | undefined;
  let gain: GainNode | undefined;
  let filter: BiquadFilterNode | undefined;
  let lastMix: Season | Weather | null = null;
  let disposed = false;

  return {
    unlock() {
      if (disposed) return;
      try {
        if (!context) {
          const opened = createContext();
          context = opened;
          const length = opened.sampleRate * 3;
          const buffer = opened.createBuffer(1, length, opened.sampleRate);
          const channel = buffer.getChannelData(0);
          for (let i = 0; i < length; i += 1) {
            const edge = Math.min(1, i / 128, (length - 1 - i) / 128);
            channel[i] = (Math.random() * 2 - 1) * edge;
          }
          const air = opened.createBufferSource();
          air.buffer = buffer;
          air.loop = true;
          filter = opened.createBiquadFilter();
          filter.type = 'bandpass';
          gain = opened.createGain();
          gain.gain.value = 0;
          air.connect(filter).connect(gain).connect(opened.destination);
          air.start();
        }
        void context.resume().catch(() => {});
      } catch {
        // Web Audio availability never gates a crossing.
      }
    },
    setMix(mix: Season | Weather | null) {
      if (!context || !gain || !filter || disposed || mix === lastMix) return;
      lastMix = mix;
      const now = context.currentTime;
      gain.gain.cancelScheduledValues(now);
      if (mix === null) {
        gain.gain.setValueAtTime(0, now);
        return;
      }
      const [frequency, resonance, level] = MIX[mix];
      filter.frequency.setTargetAtTime(frequency, now, 0.18);
      filter.Q.setTargetAtTime(resonance, now, 0.18);
      gain.gain.setTargetAtTime(level, now, 0.24);
    },
    dispose() {
      disposed = true;
      if (context) void context.close().catch(() => {});
    },
  };
}
