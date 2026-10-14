/**
 * Robot voice clips (public/audio/<name>.mp3), one channel. A new cue cuts
 * whatever is playing or waiting, so the voice always matches the screen.
 * Clips passed together play in order. `after` = filler: queue behind the
 * current clip instead of cutting it. `when` is checked as the cue's turn
 * comes; false = skip it (e.g. no time left).
 */
type Cue = { name: string; when?: () => boolean };
let cur: HTMLAudioElement | null = null;
let queue: Cue[] = [];

function play(cue: Cue) {
  if (cue.when && !cue.when()) return next();
  const a = new Audio(`${import.meta.env.BASE_URL}audio/${cue.name}.mp3`);
  cur = a;
  const done = () => cur === a && next();
  a.addEventListener('ended', done);
  a.addEventListener('error', done);
  // Autoplay blocked: skip silently. Load errors are handled by the 'error' listener.
  a.play().catch((e: Error) => e.name === 'NotAllowedError' && done());
}

function next() {
  cur = null;
  const cue = queue.shift();
  if (cue) play(cue);
}

/** Clip length in seconds (0 if missing or slow to load). */
export function clipSeconds(name: string) {
  return new Promise<number>((done) => {
    const a = new Audio(`${import.meta.env.BASE_URL}audio/${name}.mp3`);
    a.preload = 'metadata';
    a.addEventListener('loadedmetadata', () => done(a.duration || 0), { once: true });
    a.addEventListener('error', () => done(0), { once: true });
    setTimeout(() => done(0), 1500);
  });
}

/** Stop a clip now (playing or waiting) without starting another, e.g. leaving the welcome page. */
export function hush(name: string) {
  queue = queue.filter((c) => c.name !== name);
  if (cur?.src.endsWith(`/${name}.mp3`)) {
    cur.pause();
    next();
  }
}

export function voice(names: string | string[], after = false, when?: () => boolean) {
  const list = (typeof names === 'string' ? [names] : names).map((name) => ({ name, when }));
  if (after) queue.push(...list);
  else {
    cur?.pause();
    cur = null;
    queue = list;
  }
  if (!cur) next();
}
