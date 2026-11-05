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
for (const theme of ['chaos', 'jelly']) {
  const beat = 60 / (theme === 'chaos' ? 112 : 92);
  const melody =
    theme === 'chaos'
      ? [0, 7, 4, 12, 7, 4, 2, 7, 4, 9, 7, 4, 2, 7, 4, 0]
      : [0, 7, 12, 14, 7, 4, 12, 7, 9, 16, 14, 12, 7, 4, 2, 7];
  const base = theme === 'chaos' ? 261.6256 : 220;
  const notes = [];
  for (let bar = 0; bar < 16; bar++) {
    const chord = [0, -3, -5, -3][bar % 4];
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
      const start = (bar * 4 + step) * beat;
      const tone = melody[(bar * 4 + step) % melody.length] + (bar >= 8 && step === 2 ? 12 : 0);
      if (bar % 4 !== 3 || step < 2)
        notes.push([
          start,
          beat * (theme === 'jelly' ? 1.35 : 0.9),
          base * 2 ** (tone / 12),
          0.13,
          true,
        ]);
      if (step % 2 === 0)
        notes.push([start, beat * 1.2, (base / 4) * 2 ** (chord / 12), 0.11, false]);
      if (theme === 'chaos' && step % 2 === 1)
        notes.push([start + beat * 0.5, 0.08, 940, 0.025, true]);
      if (theme === 'jelly')
        notes.push([start + beat * 0.5, beat * 0.45, base * 2 ** ((tone + 12) / 12), 0.035, true]);
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
}
