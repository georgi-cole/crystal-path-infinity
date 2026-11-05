import { writeFileSync } from 'node:fs';

// Original deterministic synthesized cues. No external recordings or source samples.
const rate = 22050;
function wav(name, duration, sample) {
  const count = Math.round(duration * rate);
  const file = Buffer.alloc(44 + count * 2);
  file.write('RIFF', 0);
  file.writeUInt32LE(file.length - 8, 4);
  file.write('WAVEfmt ', 8);
  file.writeUInt32LE(16, 16);
  file.writeUInt16LE(1, 20);
  file.writeUInt16LE(1, 22);
  file.writeUInt32LE(rate, 24);
  file.writeUInt32LE(rate * 2, 28);
  file.writeUInt16LE(2, 32);
  file.writeUInt16LE(16, 34);
  file.write('data', 36);
  file.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++)
    file.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, sample(i / rate, i))) * 26000),
      44 + i * 2,
    );
  writeFileSync(new URL('../public/assets/sounds/' + name, import.meta.url), file);
}
let seed = 61983;
const noise = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2147483648 - 1;
};
wav('crystal-glass-fall.wav', 0.95, (t) => {
  const impact = noise() * Math.exp(-t * 24) * 0.55;
  const glass = [3181, 4277, 5693, 6863].reduce(
    (sum, f, i) =>
      sum + Math.sin(t * Math.PI * 2 * f + Math.sin(t * 173)) * Math.exp(-t * (7 + i * 2)) * 0.07,
    0,
  );
  const scatter = Math.max(0, Math.sin(t * 81)) ** 18 * noise() * Math.exp(-t * 4) * 0.38;
  return impact + glass + scatter;
});
wav('crystal-emergency.wav', 2.4, (t) => {
  if (t > 1.65) return 0;
  const envelope = Math.sin((Math.PI * t) / 1.65) ** 2;
  const phase = Math.PI * 2 * (220 * t + 17 * (1 - Math.cos((t * Math.PI * 2) / 1.65)));
  return (
    (Math.sin(phase) * 0.32 + Math.sin(phase * 2.007) * 0.08 + Math.sin(phase * 0.5) * 0.11) *
    envelope
  );
});
