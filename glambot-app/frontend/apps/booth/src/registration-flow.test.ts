import { beforeEach, expect, test, vi } from 'vitest';

import { MockApiError as ApiError } from './api-error.mock';

const { api } = vi.hoisted(() => {
  return {
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

vi.mock('./api/client', async () => ({
  api,
  ApiError: (await import('./api-error.mock')).MockApiError,
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
  // Like the booth adapter: REGISTRATION leaves through register (to the package) or cancel.
  api.command.mockImplementation(async (cmd: { type: string; name?: string; email?: string }) => {
    const st = get().session?.status;
    if (st === 'REGISTRATION' && cmd.type === 'register') return snap('SELECT_PRINT', 6);
    if (st === 'REGISTRATION' && cmd.type === 'cancel') return snap('CANCELLED', 6);
    throw new ApiError(409, 'INVALID_TRANSITION', `${cmd.type} not allowed in ${st}`);
  });
  api.getSession.mockImplementation(async () => get().session);
  set({ busy: null, notice: null, screenPreview: null, entering: false, holdPrintUntil: 0, clientError: null, session: snap('REGISTRATION', 5) } as never);
});

test('a session in REGISTRATION shows the registration screen', () => {
  expect(currentScreen(get())).toBe('register');
});

test('Lanjut sends the registration and opens the package screen', async () => {
  submitRegistration('Rina', 'rina@gmail.com', '');

  await vi.waitFor(() => expect(currentScreen(get())).toBe('pay'));
  // No WhatsApp number typed: sent as '' so an earlier number is cleared, not kept.
  expect(api.command).toHaveBeenCalledWith({ type: 'register', name: 'Rina', email: 'rina@gmail.com', whatsapp: '' }, expect.anything());
});

test('Lanjut sends the optional WhatsApp number with the registration', async () => {
  submitRegistration('Rina', 'rina@gmail.com', '0812-3456-7890');

  await vi.waitFor(() => expect(currentScreen(get())).toBe('pay'));
  expect(api.command).toHaveBeenCalledWith({ type: 'register', name: 'Rina', email: 'rina@gmail.com', whatsapp: '0812-3456-7890' }, expect.anything());
});

test('a rejected registration stays on the screen and tells the pelanggan why', async () => {
  api.command.mockRejectedValueOnce(new ApiError(400, 'HTTP_400', 'Alamat email tidak valid', 'Alamat email tidak valid'));

  submitRegistration('Rina', 'rina@x', '');

  await vi.waitFor(() => expect(get().notice).toBe('Alamat email tidak valid'));
  expect(currentScreen(get())).toBe('register');
});

test('registration timeout ends the unpaid visit and returns to welcome', async () => {
  onIdleTimeout();

  await vi.waitFor(() => expect(currentScreen(get())).toBe('welcome'));
  expect(api.command).toHaveBeenCalledWith({ type: 'cancel' }, expect.anything());
  expect(api.command).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'register' }), expect.anything());
});
