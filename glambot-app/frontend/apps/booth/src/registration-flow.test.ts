import { beforeEach, expect, test, vi } from 'vitest';

const { api, ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(public status: number, public code: string, message: string, public userMessage?: string) {
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
vi.mock('./robot/floating', () => ({ robot: { say: vi.fn(), rbNav: (_t: string, _p: string, go: () => void) => go() } }));
vi.mock('./voice', () => ({ clipSeconds: () => 0, loadAudioUploads: vi.fn(), paymentQrCue: () => null, voice: vi.fn() }));

const { onIdleTimeout, submitRegistration } = await import('./flow');
const { currentScreen, get, set } = await import('./store');

const snap = (status: string, version: number, extra = {}) => ({ id: 's1', status, version, quantity: 1, payment: null, templateId: null, slots: [], ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  api.config.mockReturnValue(new Promise(() => undefined));
  api.health.mockReturnValue(new Promise(() => undefined));
  // Like the booth adapter: REGISTRATION only leaves through register or the timeout.
  api.command.mockImplementation(async (cmd: { type: string; name?: string; email?: string }) => {
    const st = get().session?.status;
    if (st === 'REGISTRATION' && cmd.type === 'register') return snap('FRAME_SELECTION', 6, { registration: { name: cmd.name, email: cmd.email } });
    if (st === 'REGISTRATION' && cmd.type === 'registration_timeout') return snap('FRAME_SELECTION', 6);
    throw new ApiError(409, 'INVALID_TRANSITION', `${cmd.type} not allowed in ${st}`);
  });
  api.getSession.mockImplementation(async () => get().session);
  set({ busy: null, notice: null, screenPreview: null, entering: false, holdPrintUntil: 0, clientError: null, session: snap('REGISTRATION', 5) } as never);
});

test('a session in REGISTRATION shows the registration screen', () => {
  expect(currentScreen(get())).toBe('register');
});

test('Lanjut saves the registration and opens frame selection', async () => {
  submitRegistration('Rina', 'rina@gmail.com');

  await vi.waitFor(() => expect(currentScreen(get())).toBe('tpl'));
  expect(api.command).toHaveBeenCalledWith({ type: 'register', name: 'Rina', email: 'rina@gmail.com' }, expect.anything());
  expect(get().session?.registration).toEqual({ name: 'Rina', email: 'rina@gmail.com' });
});

test('a rejected registration stays on the screen and tells the customer why', async () => {
  api.command.mockRejectedValueOnce(new ApiError(400, 'HTTP_400', 'Alamat email tidak valid', 'Alamat email tidak valid'));

  submitRegistration('Rina', 'rina@x');

  await vi.waitFor(() => expect(get().notice).toBe('Alamat email tidak valid'));
  expect(currentScreen(get())).toBe('register');
});

test('registration timeout continues to frame selection without saving', async () => {
  onIdleTimeout();

  await vi.waitFor(() => expect(currentScreen(get())).toBe('tpl'));
  expect(api.command).toHaveBeenCalledWith({ type: 'registration_timeout' }, expect.anything());
  expect(api.command).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'register' }), expect.anything());
  expect(get().session?.registration ?? null).toBeNull();
});
