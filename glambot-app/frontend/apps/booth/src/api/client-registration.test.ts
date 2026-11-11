import { beforeEach, expect, test, vi } from 'vitest';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, error: data }), { status, headers: { 'content-type': 'application/json' } });

/** Go backend + browser storage as the booth adapter sees them. */
function booth({ free = false, registration = true, saved = null as unknown }) {
  const store = new Map<string, string>();
  if (saved) store.set('pb.glambot', JSON.stringify(saved));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  const registrations: { url: string; body: unknown }[] = [];
  const goSession = { id: 'go-1', final_price: free ? 0 : 50000, status: free ? 'paid' : 'pending_payment', expires_at: new Date(Date.now() + 3e5).toISOString() };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (url === '/api/config') return json({ freeMode: free, registrationEnabled: registration });
      if (url === '/api/package') return json([{ id: 2, code: 'vip', price: free ? 0 : 35000, print_unit_price: free ? 0 : 15000, duration_secs: 600, is_popular: true }]);
      if (url === '/api/frames') return json([]);
      if (url === '/api/payment/config') return json({ test_payment_enabled: true });
      if (url === '/api/session/create') return json(goSession);
      if (url === '/api/payment/create')
        return json({ transaction: { midtrans_order_id: 'o-1', status: free ? 'paid' : 'pending', qris_raw_string: free ? '' : 'qr' }, session: goSession });
      if (url.startsWith('/api/payment/status/')) return json({ status: 'paid', paid: true });
      if (method === 'PUT' && url.endsWith('/registration')) {
        const body = JSON.parse(String(init!.body));
        registrations.push({ url, body });
        return json({ session_id: 'go-1', ...body, registered_at: new Date().toISOString() });
      }
      return json({});
    }),
  );
  return { registrations, saved: () => JSON.parse(store.get('pb.glambot') ?? 'null') };
}

/** A fresh adapter, as after a booth page load. */
async function adapter() {
  vi.resetModules();
  return (await import('./client')).api;
}

async function paidSession(free: boolean) {
  const api = await adapter();
  await api.config();
  await api.createSession();
  let s = await api.payment(1);
  if (!free) {
    expect(s.status).toBe('WAITING_PAYMENT');
    await api.mockPay('o-1');
    s = await api.getSession();
  }
  expect(s.status).toBe('PAYMENT_SUCCESS');
  return api;
}

beforeEach(() => vi.unstubAllGlobals());

test('paid session enters registration after the ticket', async () => {
  booth({});
  const api = await paidSession(false);
  expect((await api.command({ type: 'begin' })).status).toBe('REGISTRATION');
});

test('free session enters registration once it is confirmed', async () => {
  booth({ free: true });
  const api = await paidSession(true);
  expect((await api.command({ type: 'begin' })).status).toBe('REGISTRATION');
});

test('registration switched off goes straight to frame selection', async () => {
  booth({ registration: false });
  const api = await paidSession(false);
  expect((await api.command({ type: 'begin' })).status).toBe('FRAME_SELECTION');
});

test('submit saves the registration on the paid backend session and moves to frame selection', async () => {
  const backend = booth({});
  const api = await paidSession(false);
  await api.command({ type: 'begin' });

  const s = await api.command({ type: 'register', name: 'Rina', email: 'rina@gmail.com' });

  expect(s.status).toBe('FRAME_SELECTION');
  expect(s.registration).toEqual({ name: 'Rina', email: 'rina@gmail.com' });
  expect(backend.registrations).toEqual([{ url: '/api/session/go-1/registration', body: { name: 'Rina', email: 'rina@gmail.com' } }]);
});

test('submit sends the WhatsApp number to the backend and keeps the stored form', async () => {
  const backend = booth({});
  const api = await paidSession(false);
  await api.command({ type: 'begin' });
  vi.mocked(fetch).mockImplementationOnce(async (_url, init) => {
    const body = JSON.parse(String(init!.body));
    backend.registrations.push({ url: '/api/session/go-1/registration', body });
    return json({ session_id: 'go-1', ...body, whatsapp: '6281234567890', registered_at: new Date().toISOString() });
  });

  const s = await api.command({ type: 'register', name: 'Rina', email: 'rina@gmail.com', whatsapp: '0812-3456-7890' });

  expect(backend.registrations[0].body).toEqual({ name: 'Rina', email: 'rina@gmail.com', whatsapp: '0812-3456-7890' });
  expect(s.registration).toEqual({ name: 'Rina', email: 'rina@gmail.com', whatsapp: '6281234567890' });
});

test('a rejected registration keeps the customer on the registration screen', async () => {
  booth({});
  const api = await paidSession(false);
  await api.command({ type: 'begin' });
  vi.mocked(fetch).mockImplementationOnce(async () => json('Alamat email tidak valid', 400));

  await expect(api.command({ type: 'register', name: 'Rina', email: 'rina@x.com' })).rejects.toMatchObject({ userMessage: 'Alamat email tidak valid' });
  expect((await api.getSession()).status).toBe('REGISTRATION');
});

test('timeout moves on to frame selection without saving', async () => {
  const backend = booth({});
  const api = await paidSession(false);
  await api.command({ type: 'begin' });

  const s = await api.command({ type: 'registration_timeout' });

  expect(s.status).toBe('FRAME_SELECTION');
  expect(s.registration ?? null).toBeNull();
  expect(backend.registrations).toEqual([]);
});

test('reloading the booth during registration returns to the registration screen', async () => {
  const first = booth({});
  const api = await paidSession(false);
  await api.command({ type: 'begin' });

  const backend = booth({ saved: first.saved() });
  const reloaded = await adapter();
  const { session } = await reloaded.active();
  expect(session?.status).toBe('REGISTRATION');

  await reloaded.command({ type: 'register', name: 'Rina', email: 'rina@gmail.com' });
  expect(backend.registrations[0]?.url).toBe('/api/session/go-1/registration');
});
