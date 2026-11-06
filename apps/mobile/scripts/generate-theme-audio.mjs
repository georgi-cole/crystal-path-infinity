import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Original deterministic synth compositions; no sampled recordings or third-party music.
const root = fileURLToPath(new URL('../public/assets/themes/', import.meta.url));
mkdirSync(root, { recursive: true });
const rate = 22050;
function wave(name, duration, notes) {
  const pcm = new Float32Array(Math.ceil(rate * duration));
  for (const [start, length, frequency, amplitude, kind] of notes) {
    for (let j = 0; j < length * rate && Math.round(start * rate) + j < pcm.length; j++) {
      const time = j / rate;
      const voice = typeof kind === 'string' ? kind : kind ? 'bell' : 'bass';
      const pad = voice === 'pad';
      const envelope =
        Math.min(1, time / (pad ? 0.35 : 0.012)) *
        Math.max(0, Math.min(1, (length - time) / (pad ? 0.6 : 0.045))) *
        Math.exp(-time * (pad ? 0.13 : voice === 'bell' ? 4 : 2));
      const phase = 2 * Math.PI * frequency * time;
      pcm[Math.round(start * rate) + j] +=
        amplitude *
        envelope *
        (Math.sin(phase) +
          (pad
            ? 0.3 * Math.sin(phase * 1.003) + 0.15 * Math.sin(phase * 2)
            : voice === 'bell'
              ? 0.22 * Math.sin(phase * 2.01)
              : voice === 'pluck'
                ? 0.25 * Math.sin(phase * 2) + 0.08 * Math.sin(phase * 4)
                : voice === 'reed'
                  ? 0.3 * Math.sin(phase * 3) + 0.08 * Math.sin(phase * 5)
                  : 0.12 * Math.sin(phase * 3)));
    }
  }
  const output = Buffer.alloc(44 + pcm.length * 2);
  output.write('RIFF', 0);
  output.writeUInt32LE(output.length - 8, 4);
  output.write('WAVEfmt ', 8);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(rate, 24);
  output.writeUInt32LE(rate * 2, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36);
  output.writeUInt32LE(pcm.length * 2, 40);
  let peak = 0;
  for (const sample of pcm) peak = Math.max(peak, Math.abs(sample));
  const gain = Math.min(1, 0.82 / Math.max(peak, 0.001));
  pcm.forEach((sample, i) => {
    const edge = Math.min(1, i / (rate * 0.025), (pcm.length - 1 - i) / (rate * 0.04));
    output.writeInt16LE(Math.round(sample * gain * edge * 32767), 44 + i * 2);
  });
  writeFileSync(root + name + '.wav', output);
}
const compositions = {
  chaos: {
    bpm: 112,
    root: 261.6256,
    voice: 'bell',
    chords: [0, -3, -5, -3],
    melody: [0, 7, 4, 12, 7, 4, 2, 7, 4, 9, 7, 4, 2, 7, 4, 0],
  },
  jelly: {
    bpm: 92,
    root: 220,
    voice: 'bell',
    chords: [0, -3, -5, -3],
    melody: [0, 7, 12, 14, 7, 4, 12, 7, 9, 16, 14, 12, 7, 4, 2, 7],
  },
  wilds: {
    bpm: 96,
    root: 293.6648,
    voice: 'reed',
    chords: [0, -2, 5, -2],
    melody: [0, 3, 7, 10, 7, 2, 5, 3, 0, 7, 5, 12, 10, 5, 3, 2],
  },
  league: {
    bpm: 120,
    root: 246.9417,
    voice: 'pluck',
    chords: [0, 5, -2, 7],
    melody: [0, 0, 7, 12, 10, 7, 5, 7, 2, 7, 14, 12, 7, 5, 2, 10],
  },
  puppy: {
    bpm: 104,
    root: 195.9977,
    voice: 'pluck',
    chords: [0, 4, -3, 2],
    melody: [0, 4, 7, 9, 7, 4, 2, 4, 7, 12, 9, 7, 4, 2, 7, 4],
  },
  kitten: {
    bpm: 90,
    root: 207.6523,
    voice: 'bell',
    chords: [0, -2, -5, 3],
    melody: [0, 7, 10, 14, 12, 7, 3, 5, 7, 10, 15, 14, 10, 7, 5, 3],
  },
};
for (const [theme, composition] of Object.entries(compositions)) {
  const beat = 60 / composition.bpm;
  const { melody, root: base, voice } = composition;
  const notes = [];
  for (let bar = 0; bar < 16; bar++) {
    const chord = composition.chords[bar % 4];
    if (bar % 2 === 0) {
      for (const interval of [0, 7, 12]) {
        notes.push([
          bar * 4 * beat,
          beat * 8,
          (base / 2) * 2 ** ((chord + interval) / 12),
          0.035,
          'pad',
        ]);
      }
    }
    for (let step = 0; step < 4; step++) {
      const start = (bar * 4 + step + (theme === 'puppy' && step % 2 ? 0.12 : 0)) * beat;
      const tone = melody[(bar * 4 + step) % melody.length] + (bar >= 8 && step === 2 ? 12 : 0);
      if ((bar % 4 !== 3 || step < 2) && (theme !== 'kitten' || step % 2 === 0))
        notes.push([
          start,
          beat * (theme === 'jelly' ? 1.35 : 0.9),
          base * 2 ** (tone / 12),
          0.13,
          voice,
        ]);
      if (step % 2 === 0)
        notes.push([start, beat * 1.2, (base / 4) * 2 ** (chord / 12), 0.11, false]);
      if (theme === 'chaos' && step % 2 === 1)
        notes.push([start + beat * 0.5, 0.08, 940, 0.025, true]);
      if (theme === 'jelly')
        notes.push([start + beat * 0.5, beat * 0.45, base * 2 ** ((tone + 12) / 12), 0.035, true]);
      if (theme === 'league') {
        notes.push([
          start + beat * 0.75,
          beat * 0.18,
          base * 2 ** ((tone + 7) / 12),
          0.055,
          'pluck',
        ]);
        notes.push([start, 0.09, step % 2 === 0 ? 65 : 760, 0.065, 'bass']);
      }
      if (theme === 'wilds' && step === 3)
        notes.push([start + beat * 0.3, beat * 0.6, base * 2 ** ((tone + 19) / 12), 0.04, 'bell']);
      if (theme === 'puppy' && step % 2 === 1)
        notes.push([start + beat * 0.4, 0.07, 1170, 0.025, 'pluck']);
      if (theme === 'kitten' && step === 3)
        notes.push([start + beat * 0.5, beat * 0.7, base * 2 ** ((tone + 12) / 12), 0.045, 'bell']);
    }
  }
  wave(theme + '-loop', beat * 64, notes);
  wave(theme + '-step', 0.32, [
    [0, 0.24, base * 2, 0.3, true],
    [0.045, 0.24, base * 3, 0.12, true],
  ]);
  wave(
    theme + '-record',
    1.5,
    [0, 4, 7, 12].map((tone, i) => [i * 0.18, 0.8, base * 2 ** (tone / 12), 0.2, true]),
  );
  wave(
    theme + '-ended',
    2.1,
    [12, 7, 4, 0].map((tone, i) => [i * 0.32, 1, base * 2 ** (tone / 12), 0.17, true]),
  );
  // A gentle ascending safety cue replaces the original fatal sound for paid worlds.
  wave(theme + '-rescue', 1.35, [
    [0, 0.65, base, 0.15, voice],
    [0.16, 0.7, base * 1.5, 0.14, voice],
    [0.38, 0.8, base * 2, 0.12, 'bell'],
  ]);
}
