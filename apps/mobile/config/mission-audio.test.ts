import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAMPAIGN_MUSIC_START_SECONDS, createMissionAudio } from '../src/mission-audio';

const enabled = { soundEffects: true, music: true, reducedMotion: false };
function fakeMedia() {
  return Object.assign(new EventTarget(), {
    loop: false,
    volume: 1,
    currentTime: 0,
    readyState: 1,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
  });
}
function fixture() {
  const tracks = new Map<string, ReturnType<typeof fakeMedia>>();
  const complete = vi.fn();
  const audio = createMissionAudio(
    (url) => {
      const media = fakeMedia();
      tracks.set(url, media);
      return media;
    },
    { landing: 'landing', failed: 'failed', music: 'music' },
    complete,
  );
  return { audio, tracks, complete };
}
describe('Campaign mission audio lifecycle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('plays the complete cue once, waits for its end, then carries music from 0:03 through vortex and summary', () => {
    const { audio, tracks, complete } = fixture();
    audio.update('landing', enabled);
    audio.update('landing', enabled);
    expect(tracks.get('landing')!.play).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1250);
    expect(complete).not.toHaveBeenCalled();
    expect(tracks.get('music')!.play).not.toHaveBeenCalled();
    tracks.get('landing')!.dispatchEvent(new Event('ended'));
    expect(complete).toHaveBeenCalledTimes(1);
    tracks.get('landing')!.dispatchEvent(new Event('ended'));
    expect(complete).toHaveBeenCalledTimes(1);
    audio.update('transition', enabled);
    expect(tracks.get('music')!.currentTime).toBe(CAMPAIGN_MUSIC_START_SECONDS);
    tracks.get('music')!.currentTime = 14;
    audio.update('celebration', enabled);
    audio.update('result', enabled);
    expect(tracks.get('music')!.play).toHaveBeenCalledTimes(1);
    expect(tracks.get('music')!.currentTime).toBe(14);
    audio.update(null, enabled);
    expect(tracks.get('music')!.pause).toHaveBeenCalled();
    expect(tracks.get('music')!.currentTime).toBe(0);
    audio.dispose();
  });
  it('plays failure once without starting success music, and resets for a fresh attempt', () => {
    const { audio, tracks, complete } = fixture();
    audio.update('failed', enabled);
    audio.update('failed', enabled);
    tracks.get('failed')!.dispatchEvent(new Event('ended'));
    audio.update('failed', enabled);
    expect(tracks.get('failed')!.play).toHaveBeenCalledTimes(1);
    expect(tracks.get('failed')!.loop).toBe(false);
    expect(tracks.get('music')!.play).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    audio.update(null, enabled);
    audio.update('failed', enabled);
    expect(tracks.get('failed')!.play).toHaveBeenCalledTimes(2);
    audio.dispose();
  });
  it('uses the short landing beat when effects are muted, without muting enabled campaign music', () => {
    const { audio, tracks, complete } = fixture();
    audio.update('landing', { ...enabled, soundEffects: false });
    vi.advanceTimersByTime(899);
    expect(complete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(tracks.get('landing')!.play).not.toHaveBeenCalled();
    audio.update('transition', { ...enabled, soundEffects: false });
    expect(tracks.get('music')!.play).toHaveBeenCalledTimes(1);
    audio.update('result', { ...enabled, music: false });
    audio.update('result', enabled);
    expect(tracks.get('music')!.play).toHaveBeenCalledTimes(2);
    audio.dispose();
  });
  it('keeps the complete sound intact with reduced motion and handles muting it mid-cue', () => {
    const { audio, tracks, complete } = fixture();
    audio.update('landing', { ...enabled, reducedMotion: true });
    vi.advanceTimersByTime(200);
    expect(complete).not.toHaveBeenCalled();
    audio.update('landing', { ...enabled, soundEffects: false, reducedMotion: true });
    expect(complete).toHaveBeenCalledTimes(1);
    audio.update('landing', enabled);
    expect(tracks.get('landing')!.play).toHaveBeenCalledTimes(1);
    audio.dispose();
  });
  it('pauses music in the background and resumes at its position without replaying either cue', () => {
    const { audio, tracks } = fixture();
    audio.update('landing', enabled);
    audio.setForeground(false);
    audio.setForeground(true);
    expect(tracks.get('landing')!.play).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(900);
    audio.update('celebration', enabled);
    tracks.get('music')!.currentTime = 23;
    audio.setForeground(false);
    audio.setForeground(true);
    expect(tracks.get('music')!.play).toHaveBeenCalledTimes(2);
    expect(tracks.get('music')!.currentTime).toBe(23);
    audio.dispose();
  });
  it('waits for metadata before seeking to 0:03 and repeats from there if the summary remains open', () => {
    const { audio, tracks } = fixture();
    const music = tracks.get('music')!;
    music.readyState = 0;
    audio.update('celebration', enabled);
    expect(music.play).not.toHaveBeenCalled();
    music.readyState = 1;
    music.dispatchEvent(new Event('loadedmetadata'));
    expect(music.currentTime).toBe(3);
    music.currentTime = 168;
    music.dispatchEvent(new Event('ended'));
    expect(music.currentTime).toBe(3);
    expect(music.play).toHaveBeenCalledTimes(2);
    audio.dispose();
  });
  it('allows missing, unsupported, rejected and stalled completion audio without blocking the result', async () => {
    const emptyComplete = vi.fn();
    const empty = createMissionAudio(
      () => {
        throw Error('No media expected');
      },
      {},
      emptyComplete,
    );
    empty.update('landing', enabled);
    vi.advanceTimersByTime(900);
    expect(emptyComplete).toHaveBeenCalledTimes(1);
    empty.dispose();
    const { audio, tracks, complete } = fixture();
    tracks.get('landing')!.play.mockRejectedValueOnce(Error('autoplay'));
    audio.update('landing', enabled);
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(900);
    expect(complete).toHaveBeenCalledTimes(1);
    audio.update(null, enabled);
    audio.update('landing', enabled);
    vi.advanceTimersByTime(6000);
    expect(complete).toHaveBeenCalledTimes(2);
    audio.dispose();
  });
  it('cancels stale completion events and timers when leaving, retrying, or disposing', () => {
    const { audio, tracks, complete } = fixture();
    audio.update('landing', enabled);
    audio.update(null, enabled);
    tracks.get('landing')!.dispatchEvent(new Event('ended'));
    vi.advanceTimersByTime(6000);
    expect(complete).not.toHaveBeenCalled();
    audio.update('landing', enabled);
    expect(tracks.get('landing')!.play).toHaveBeenCalledTimes(2);
    audio.dispose();
    tracks.get('landing')!.dispatchEvent(new Event('ended'));
    vi.advanceTimersByTime(6000);
    expect(complete).not.toHaveBeenCalled();
  });
  it('stops on Continue before an interstitial and cannot resume under the ad', () => {
    const { audio, tracks } = fixture();
    audio.update('result', enabled);
    audio.dismiss();
    audio.setForeground(false);
    audio.setForeground(true);
    audio.update('result', enabled);
    audio.activate();
    expect(tracks.get('music')!.play).toHaveBeenCalledTimes(1);
    expect(tracks.get('music')!.currentTime).toBe(0);
    audio.update(null, enabled);
    audio.update('celebration', enabled);
    expect(tracks.get('music')!.play).toHaveBeenCalledTimes(2);
    expect(tracks.get('music')!.currentTime).toBe(3);
    audio.dispose();
  });

  it('stops delayed music playback after disposal and retries blocked music on a later gesture', async () => {
    const { audio, tracks } = fixture();
    const music = tracks.get('music')!;
    music.play.mockRejectedValueOnce(Error('autoplay'));
    audio.update('transition', enabled);
    await Promise.resolve();
    await Promise.resolve();
    audio.activate();
    expect(music.play).toHaveBeenCalledTimes(2);
    await Promise.resolve();
    let finish!: () => void;
    audio.setForeground(false);
    music.play.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    audio.setForeground(true);
    audio.dispose();
    const count = music.pause.mock.calls.length;
    finish();
    await Promise.resolve();
    expect(music.pause).toHaveBeenCalledTimes(count + 1);
    audio.setForeground(true);
    audio.update('celebration', enabled);
    expect(music.play).toHaveBeenCalledTimes(3);
  });
});
