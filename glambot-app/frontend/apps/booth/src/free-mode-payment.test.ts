import { beforeEach, expect, test, vi } from 'vitest';

const api = vi.hoisted(() => ({
  sessionId: 's1',
  payment: vi.fn(),
  abandonPayment: vi.fn(),
  config: vi.fn(),
}));

vi.mock('./api/client', () => ({
  api,
  ApiError: class extends Error {},
  NetworkError: class extends Error {},
  newRequestId: () => 'req',
  onConnectivity: () => () => undefined,
}));
vi.mock('./camera/service', () => ({ getCamera: vi.fn(), cameraInstance: vi.fn() }));
vi.mock('./robot/floating', () => ({ robot: { say: vi.fn() } }));
vi.mock('./voice', () => ({ clipSeconds: () => 0, loadAudioUploads: vi.fn(), paymentQrCue: () => null, voice: vi.fn() }));

const { selectQrPayment } = await import('./flow');
const { get, set } = await import('./store');

const snap = (status: string, version: number) => ({ id: 's1', status, version, quantity: 1, payment: null });
const paidConfig = { freeMode: false, pricing: { firstPrint: 15000 } };
const freeConfig = { freeMode: true, pricing: { firstPrint: 0 } };

const settle = () => vi.waitFor(() => expect(get().payBusy).toBe(false));

beforeEach(() => {
  vi.clearAllMocks();
  api.config.mockResolvedValue(paidConfig);
  set({ qty: 1, payBusy: false, payError: null, config: freeConfig, session: snap('SELECT_PRINT', 1) } as never);
});

test('free page asked to pay drops the QR, shows an error and picks up the new config', async () => {
  api.payment.mockResolvedValue(snap('WAITING_PAYMENT', 2));
  api.abandonPayment.mockReturnValue(snap('SELECT_PRINT', 3));

  selectQrPayment();
  await settle();

  expect(api.abandonPayment).toHaveBeenCalledOnce();
  expect(get().payError).toBeTruthy();
  expect(get().session?.status).toBe('SELECT_PRINT');
  await vi.waitFor(() => expect(get().config).toMatchObject({ freeMode: false }));
});

test('free session that is paid straight away is not treated as outdated', async () => {
  api.payment.mockResolvedValue(snap('PAYMENT_SUCCESS', 2));

  selectQrPayment();
  await settle();

  expect(api.abandonPayment).not.toHaveBeenCalled();
  expect(get().payError).toBeNull();
  expect(get().session?.status).toBe('PAYMENT_SUCCESS');
});

test('paid booth keeps waiting for its QR payment', async () => {
  set({ config: paidConfig } as never);
  api.payment.mockResolvedValue(snap('WAITING_PAYMENT', 2));

  selectQrPayment();
  await settle();

  expect(api.abandonPayment).not.toHaveBeenCalled();
  expect(get().payError).toBeNull();
  expect(get().session?.status).toBe('WAITING_PAYMENT');
});
