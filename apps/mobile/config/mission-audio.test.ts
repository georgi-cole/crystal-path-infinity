import { describe, expect, it, vi } from 'vitest';
import { createMissionAudio } from '../src/mission-audio';

function fixture() {
  const tracks = new Map<
    string,
    {
      loop: boolean;
      volume: number;
      currentTime: number;
      play: ReturnType<typeof vi.fn<() => Promise<void>>>;
      pause: ReturnType<typeof vi.fn<() => void>>;
    }
  >();
  const create = vi.fn((url: string) => {
    const media = {
      loop: false,
      volume: 1,
      currentTime: 0,
      play: vi.fn(() => Promise.resolve()),
      pause: vi.fn(),
    };
    tracks.set(url, media);
    return media;
  });
  const audio = createMissionAudio(create, {
    landing: 'landing',
    transition: 'transition',
    music: 'music',
  });
  return { audio, tracks };
}
const enabled = { soundEffects: true, music: true };

describe('Campaign mission audio lifecycle', () => {
  it('plays completion and transition once and keeps one music loop through the result card', () => {
    const { audio, tracks } = fixture();
    audio.update('landing', enabled);
    audio.update('landing', enabled);
    expect(tracks.get('landing')!.play).toHaveBeenCalledTimes(1);
    expect(tracks.get('music')!.play).not.toHaveBeenCalled();
    audio.update('transition', enabled);
    expect(tracks.get('transition')!.play).toHaveBeenCalledTimes(1);
    audio.update('celebration', enabled);
    audio.update('result', enabled);
    expect(tracks.get('music')!.play).toHaveBeenCalledTimes(1);
    expect(tracks.get('music')!.loop).toBe(true);
    audio.update(null, enabled);
    expect(tracks.get('music')!.pause).toHaveBeenCalled();
    expect(tracks.get('music')!.currentTime).toBe(0);
  });
  it('honors separate sound and music preferences and foreground changes without replaying the cue', () => {
    const { audio, tracks } = fixture();
    audio.update('landing', { soundEffects: false, music: true });
    expect(tracks.get('landing')!.play).not.toHaveBeenCalled();
    audio.update('celebration', enabled);
    audio.setForeground(false);
    expect(tracks.get('music')!.pause).toHaveBeenCalled();
    audio.setForeground(true);
    expect(tracks.get('music')!.play).toHaveBeenCalledTimes(2);
    audio.update('result', { soundEffects: true, music: false });
    audio.update('result', enabled);
    expect(tracks.get('music')!.play).toHaveBeenCalledTimes(3);
    expect(tracks.get('landing')!.play).not.toHaveBeenCalled();
  });
  it('stops a delayed native playback after leaving and never restarts after disposal', async () => {
    const { audio, tracks } = fixture();
    let finish!: () => void;
    vi.mocked(tracks.get('music')!.play).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    audio.update('celebration', enabled);
    audio.dispose();
    const count = vi.mocked(tracks.get('music')!.pause).mock.calls.length;
    finish();
    await Promise.resolve();
    expect(tracks.get('music')!.pause).toHaveBeenCalledTimes(count + 1);
    audio.setForeground(true);
    audio.update('celebration', enabled);
    expect(tracks.get('music')!.play).toHaveBeenCalledTimes(1);
  });
  it('allows absent, rejected or unsupported optional files without blocking progress', async () => {
    const empty = createMissionAudio(() => {
      throw new Error('No media expected');
    }, {});
    expect(() => {
      empty.update('landing', enabled);
      empty.update('celebration', enabled);
      empty.dispose();
    }).not.toThrow();
    const { audio, tracks } = fixture();
    vi.mocked(tracks.get('landing')!.play).mockImplementationOnce(() => {
      throw new Error('unsupported');
    });
    vi.mocked(tracks.get('music')!.play).mockRejectedValueOnce(new Error('autoplay'));
    expect(() => audio.update('landing', enabled)).not.toThrow();
    audio.update('celebration', enabled);
    await Promise.resolve();
    await Promise.resolve();
    audio.update('result', enabled);
    expect(tracks.get('music')!.play).toHaveBeenCalledTimes(2);
    audio.dispose();
  });
});
