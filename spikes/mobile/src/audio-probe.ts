/** A diagnostic tone, not the production soundtrack or the source app's global audio manager. */
export class AudioProbe {
  private context: AudioContext | null = null;
  private active = new Set<OscillatorNode>();
  private enabled = false;
  private blocked = true;
  private disposed = false;
  async enable(): Promise<void> {
    if (this.disposed) return;
    this.context ??= new AudioContext();
    await this.context.resume();
    if (this.disposed) return;
    this.enabled = true;
    if (this.blocked) await this.context.suspend();
  }
  mute() { this.enabled = false; this.stop(); void this.context?.suspend(); }
  setBlocked(blocked: boolean) {
    this.blocked = blocked;
    if (blocked) { this.stop(); void this.context?.suspend(); }
    else if (this.enabled && !this.disposed) void this.context?.resume().catch(() => undefined);
  }
  play(kind: 'step' | 'death' | 'revive') {
    if (!this.enabled || this.blocked || this.disposed || this.context?.state !== 'running' || this.active.size >= 3) return;
    const ctx = this.context, tone = ctx.createOscillator(), gain = ctx.createGain();
    tone.type = 'sine'; tone.frequency.value = kind === 'step' ? 660 : kind === 'revive' ? 880 : 110;
    gain.gain.setValueAtTime(0.035, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
    tone.connect(gain); gain.connect(ctx.destination); this.active.add(tone);
    tone.onended = () => { this.active.delete(tone); tone.disconnect(); gain.disconnect(); };
    tone.start(); tone.stop(ctx.currentTime + 0.18);
  }
  private stop() { for (const tone of this.active) { try { tone.stop(); } catch { /* Already stopped. */ } } this.active.clear(); }
  dispose() { this.disposed = true; this.stop(); void this.context?.close(); this.context = null; }
}
