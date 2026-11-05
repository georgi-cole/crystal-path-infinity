import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Original deterministic synth compositions; no sampled recordings or third-party music.
const root = fileURLToPath(new URL('../public/assets/themes/', import.meta.url));
mkdirSync(root, { recursive: true });
const rate = 22050;
function wave(name, duration, notes) {
  const pcm = new Float32Array(Math.ceil(rate * duration));
  for (const [start, length, frequency, amplitude, bell] of notes) {
    for (let j = 0; j < length * rate && Math.round(start * rate) + j < pcm.length; j++) {
      const time = j / rate;
      const envelope =
        Math.min(1, time / 0.012) *
        Math.min(1, (length - time) / 0.045) *
        Math.exp(-time * (bell ? 5 : 2));
      const phase = 2 * Math.PI * frequency * time;
      pcm[Math.round(start * rate) + j] +=
        amplitude *
        envelope *
        (Math.sin(phase) + (bell ? 0.22 * Math.sin(phase * 2.01) : 0.12 * Math.sin(phase * 3)));
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
  pcm.forEach((sample, i) =>
    output.writeInt16LE(Math.round(Math.max(-0.95, Math.min(0.95, sample)) * 32767), 44 + i * 2),
  );
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
  for (let bar = 0; bar < 8; bar++) {
    const chord = [0, -3, -5, -3][bar % 4];
    for (let step = 0; step < 4; step++) {
      const start = (bar * 4 + step) * beat;
      const tone = melody[(bar * 4 + step) % melody.length];
      notes.push([start, beat * 0.9, base * 2 ** (tone / 12), 0.16, true]);
      notes.push([start, beat * 0.8, (base / 2) * 2 ** (chord / 12), 0.13, false]);
      if (theme === 'chaos' && step % 2 === 1)
        notes.push([start + beat * 0.5, 0.08, 940, 0.025, true]);
      if (theme === 'jelly')
        notes.push([start + beat * 0.5, beat * 0.45, base * 2 ** ((tone + 12) / 12), 0.035, true]);
    }
  }
  wave(theme + '-loop', beat * 32, notes);
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
