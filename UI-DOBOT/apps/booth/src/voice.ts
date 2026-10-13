/**
 * Robot voice clips (public/audio/<name>.mp3), one channel. A playing clip is
 * never cut: new cues wait until it ends.
 * `keep` cues (session guidance) always play in order; other cues are chatter
 * (button/tap reactions) and a newer one replaces older chatter still waiting.
 * A name may carry a start offset: "countdown@1.96" plays from 1.96s.
 * `fallback` plays instead when the clip is missing (404 / decode error).
 */
type Cue = { name: string; keep: boolean; fallback?: string };
let cur: HTMLAudioElement | null = null;
let queue: Cue[] = [];

function play(cue: Cue) {
  const [name, at] = cue.name.split('@');
  const a = new Audio(`${import.meta.env.BASE_URL}audio/${name}.mp3`);
  cur = a;
  if (+at) {
    a.currentTime = Number(at);
    a.addEventListener('loadedmetadata', () => (a.currentTime = Number(at)), { once: true });
  }
  const done = () => cur === a && next();
  a.addEventListener('ended', done);
  a.addEventListener('error', () => {
    if (cur !== a) return;
    if (cue.fallback) play({ name: cue.fallback, keep: cue.keep });
    else next();
  });
  // Autoplay blocked: skip silently. Load errors are handled by the 'error' listener.
  a.play().catch((e: Error) => e.name === 'NotAllowedError' && cur === a && next());
}

function next() {
  cur = null;
  const cue = queue.shift();
  if (cue) play(cue);
}

/** Drop a clip that has not started yet (a playing one finishes its sentence). */
export function hush(name: string) {
  queue = queue.filter((c) => c.name !== name);
}

export function voice(names: string | string[], keep = false, fallback?: string) {
  const list = (typeof names === 'string' ? [names] : names).map((name) => ({ name, keep, fallback }));
  queue = [...(keep ? queue : queue.filter((c) => c.keep)), ...list];
  if (!cur) next();
}
