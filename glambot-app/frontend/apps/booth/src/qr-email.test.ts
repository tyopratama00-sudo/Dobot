import { afterEach, beforeEach, expect, test, vi } from 'vitest';

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
      saveRegistration: vi.fn(),
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

const { onIdleTimeout, openEmailChange, saveEmailChange } = await import('./flow');
const { currentScreen, get, set } = await import('./store');

const registered = { name: 'Rina', email: 'rina@gmial.com' };
const snap = (status: string, version: number, extra = {}) => ({ id: 's1', status, version, quantity: 1, payment: null, templateId: null, slots: [], registration: registered, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-10T10:00:00Z'));
  api.config.mockReturnValue(new Promise(() => undefined));
  api.health.mockReturnValue(new Promise(() => undefined));
  // Like the booth adapter: only `finish` leaves QR_READY.
  api.command.mockImplementation(async (cmd: { type: string }) => {
    const st = get().session?.status;
    if (st === 'QR_READY' && cmd.type === 'finish') return snap('FINISHED', 6);
    throw new ApiError(409, 'INVALID_TRANSITION', `${cmd.type} not allowed in ${st}`);
  });
  api.getSession.mockImplementation(async () => get().session);
  api.saveRegistration.mockImplementation(async (name: string, email: string) => ({ name, email }));
  set({ busy: null, notice: null, screenPreview: null, entering: false, holdPrintUntil: 0, clientError: null, timerFrom: 0, session: snap('QR_READY', 5) } as never);
});

afterEach(() => {
  vi.useRealTimers();
});

test('opening Ubah email restarts the QR screen timer', () => {
  openEmailChange();

  expect(get().timerFrom).toBe(Date.parse('2026-11-10T10:00:00Z'));
});

test('saving a new email from the QR screen updates the registration and restarts the timer', async () => {
  vi.setSystemTime(new Date('2026-11-10T10:00:40Z'));

  const saved = await saveEmailChange('rina@gmail.com');

  expect(saved).toBe(true);
  expect(api.saveRegistration).toHaveBeenCalledWith('Rina', 'rina@gmail.com');
  expect(get().session?.registration).toEqual({ name: 'Rina', email: 'rina@gmail.com' });
  expect(currentScreen(get())).toBe('qr');
  expect(get().timerFrom).toBe(Date.parse('2026-11-10T10:00:40Z'));
});

test('a rejected email change keeps the old email and tells the customer why', async () => {
  api.saveRegistration.mockRejectedValueOnce(new ApiError(400, 'HTTP_400', 'Alamat email tidak valid', 'Alamat email tidak valid'));

  const saved = await saveEmailChange('rina@x');

  expect(saved).toBe(false);
  expect(get().notice).toBe('Alamat email tidak valid');
  expect(get().session?.registration).toEqual(registered);
});

test('an email change after the admin deleted the registration says so and drops the email line', async () => {
  // Backend text for 403 is not shown to the pelanggan as-is; the booth uses its own words.
  api.saveRegistration.mockRejectedValueOnce(new ApiError(403, 'HTTP_403', 'Data registrasi sesi ini sudah dihapus'));

  const saved = await saveEmailChange('rina@gmail.com');

  expect(saved).toBe(false);
  expect(get().notice).toBe('Data registrasimu sudah dihapus petugas, jadi email tidak bisa diubah lagi. Fotomu tetap bisa diambil lewat QR ini, ya.');
  expect(get().session?.registration ?? null).toBeNull();
});

test('the QR timeout still finishes the session after an email change', async () => {
  await saveEmailChange('rina@gmail.com');

  onIdleTimeout();

  await vi.waitFor(() => expect(get().session?.status).toBe('FINISHED'));
});
