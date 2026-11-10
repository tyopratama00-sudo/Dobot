import { beforeEach, expect, test, vi } from 'vitest';

const { api, ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
    }
  }
  return {
    ApiError,
    api: {
      sessionId: 's1',
      command: vi.fn(),
      getSession: vi.fn(),
      clear: vi.fn(),
      config: vi.fn(),
      health: vi.fn(),
    },
  };
});

vi.mock('./api/client', () => ({
  api,
  ApiError,
  NetworkError: class extends Error {},
  newRequestId: () => 'req',
  onConnectivity: () => () => undefined,
}));
vi.mock('./camera/service', () => ({ getCamera: vi.fn(), cameraInstance: vi.fn() }));
vi.mock('./robot/floating', () => ({ robot: { say: vi.fn() } }));
vi.mock('./voice', () => ({ clipSeconds: () => 0, loadAudioUploads: vi.fn(), paymentQrCue: () => null, voice: vi.fn() }));

const { onIdleTimeout } = await import('./flow');
const { get, set } = await import('./store');

const snap = (status: string, version: number) => ({ id: 's1', status, version, quantity: 1, payment: null });

beforeEach(() => {
  vi.clearAllMocks();
  api.config.mockReturnValue(new Promise(() => undefined));
  api.health.mockReturnValue(new Promise(() => undefined));
  // Like the booth adapter: only `finish` leaves QR_READY; anything else is an invalid transition.
  api.command.mockImplementation(async (cmd: { type: string }) => {
    const st = get().session?.status;
    if (st === 'QR_READY' && cmd.type === 'finish') return snap('FINISHED', 6);
    throw new ApiError(409, 'INVALID_TRANSITION', `${cmd.type} not allowed in ${st}`);
  });
  api.getSession.mockImplementation(async () => get().session);
  set({ busy: null, screenPreview: false, session: snap('QR_READY', 5) } as never);
});

test('QR screen timeout finishes the session and shows the thanks screen', async () => {
  onIdleTimeout();

  await vi.waitFor(() => expect(get().session?.status).toBe('FINISHED'));
  expect(api.command).toHaveBeenCalledWith({ type: 'finish' }, expect.anything());
});

test('thanks screen timeout returns the booth to welcome with no session', () => {
  set({ session: snap('FINISHED', 6) } as never);

  onIdleTimeout();

  expect(get().session).toBeNull();
  expect(api.clear).toHaveBeenCalled();
  expect(api.command).not.toHaveBeenCalled();
});
