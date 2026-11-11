import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const { api } = vi.hoisted(() => ({
  api: {
    sessionId: 's1',
    command: vi.fn(),
    getSession: vi.fn(),
    clear: vi.fn(),
    config: vi.fn(),
    health: vi.fn(),
  },
}));

vi.mock('./api/client', () => ({
  api,
  ApiError: class extends Error {},
  NetworkError: class extends Error {},
  newRequestId: () => 'req',
  onConnectivity: () => () => undefined,
}));
vi.mock('./camera/service', () => ({ getCamera: vi.fn(), cameraInstance: vi.fn() }));
vi.mock('./robot/floating', () => ({ robot: { say: vi.fn(), react: vi.fn(), rbNav: (_t: string, _p: string, go: () => void) => go() } }));
vi.mock('./voice', () => ({ clipSeconds: () => 0, loadAudioUploads: vi.fn(), paymentQrCue: () => null, voice: vi.fn() }));

const { applySnapshot, NO_PHOTOS_RESET_MS } = await import('./flow');
const { currentScreen, get, set } = await import('./store');

const photo = { id: 'p1', angle: 0, shot: 1, selected: true, retaken: false, superseded: false, width: null, height: null, thumbUrl: '/p1.jpg', previewUrl: '/p1.jpg', createdAt: '' };
const snap = (status: string, version: number, photos: unknown[] = []) => ({ id: 's1', status, version, quantity: 1, payment: null, templateId: null, slots: [], photos, capture: { angle: 0, shot: 0, phase: '', message: '' }, retakenAngles: [] });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  api.config.mockReturnValue(new Promise(() => undefined));
  api.health.mockReturnValue(new Promise(() => undefined));
  set({ busy: null, notice: null, screenPreview: null, entering: false, holdPrintUntil: 0, clientError: null, session: snap('ROBOT_MOVING', 5) } as never);
});

afterEach(() => vi.useRealTimers());

test('a session that ends capture with no photo shows an apology instead of the review screen', () => {
  applySnapshot(snap('REVIEW', 6) as never);

  expect(currentScreen(get())).toBe('error');
  expect(get().clientError).toMatchObject({ code: 'NO_PHOTOS' });
  expect(get().clientError?.message).toMatch(/gagal diambil/);
});

test('the apology returns the booth to the welcome screen by itself', () => {
  applySnapshot(snap('REVIEW', 6) as never);

  vi.advanceTimersByTime(NO_PHOTOS_RESET_MS + 10);

  expect(get().session).toBeNull();
  expect(get().clientError).toBeNull();
});

test('a session with photos goes to review as usual', () => {
  applySnapshot(snap('REVIEW', 6, [photo]) as never);

  expect(get().clientError).toBeNull();
  expect(currentScreen(get())).not.toBe('error');
});
