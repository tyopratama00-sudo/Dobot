import { expect, test } from 'vitest';

const played: string[] = [];
class FakeAudio {
  paused = false;
  private on: Record<string, () => void> = {};
  constructor(public src: string) {
    last = this;
  }
  addEventListener(e: string, f: () => void) {
    this.on[e] = f;
  }
  play() {
    played.push(this.src.split('/').pop()!);
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  end() {
    this.on.ended();
  }
  fail() {
    this.on.error();
  }
}
let last: FakeAudio;
(globalThis as any).Audio = FakeAudio;

test('playing clip is never cut; newer chatter replaces waiting chatter, keep cues stay', async () => {
  const { voice } = await import('./voice');
  voice('a');
  const a = last;
  voice('pose', true);
  voice('b');
  voice('c');
  expect(a.paused).toBe(false);
  a.end();
  last.end();
  expect(played).toEqual(['a.mp3', 'pose.mp3', 'c.mp3']);
  last.end();
});

test('hush drops a waiting clip only', async () => {
  const { voice, hush } = await import('./voice');
  played.length = 0;
  voice('welcome_idle');
  const w = last;
  voice('welcome_idle');
  hush('welcome_idle');
  voice('pay_show', true);
  expect(w.paused).toBe(false);
  w.end();
  expect(played).toEqual(['welcome_idle.mp3', 'pay_show.mp3']);
  last.end();
});

test('missing clip plays the fallback from its offset', async () => {
  const { voice } = await import('./voice');
  played.length = 0;
  voice('snap_wave', true, 'countdown@1.96');
  last.fail();
  expect(played).toEqual(['snap_wave.mp3', 'countdown.mp3']);
  expect((last as any).currentTime).toBe(1.96);
});
