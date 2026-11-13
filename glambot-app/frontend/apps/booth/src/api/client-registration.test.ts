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

/** MULAI with the switch on, Lanjut on the registration screen, then pay. */
async function registeredAndPaid(free: boolean, whatsapp?: string) {
  const api = await adapter();
  await api.config();
  expect((await api.createSession()).session.status).toBe('REGISTRATION');
  expect((await api.command({ type: 'register', name: 'Rina', email: 'rina@gmail.com', ...(whatsapp === undefined ? {} : { whatsapp }) })).status).toBe('SELECT_PRINT');
  let s = await api.payment(1);
  if (!free) {
    await api.mockPay('o-1');
    s = await api.getSession();
  }
  expect(s.status).toBe('PAYMENT_SUCCESS');
  return api;
}

test('a new session opens on registration, before the package', async () => {
  booth({});
  const api = await adapter();
  await api.config();
  expect((await api.createSession()).session.status).toBe('REGISTRATION');
});

test('registration switched off opens on the package and goes straight to frame selection', async () => {
  booth({ registration: false });
  const api = await adapter();
  await api.config();
  expect((await api.createSession()).session.status).toBe('SELECT_PRINT');
  const paid = await paidSession(false);
  expect((await paid.command({ type: 'begin' })).status).toBe('FRAME_SELECTION');
});

test('Lanjut opens the package screen without sending anything before payment', async () => {
  const backend = booth({});
  const api = await adapter();
  await api.config();
  await api.createSession();

  const s = await api.command({ type: 'register', name: 'Rina', email: 'rina@gmail.com', whatsapp: '' });

  expect(s.status).toBe('SELECT_PRINT');
  expect(backend.registrations).toEqual([]);
});

test('once paid, the registration is saved on the paid backend session before frame selection', async () => {
  const backend = booth({});
  const api = await registeredAndPaid(false, '');
  expect(backend.registrations).toEqual([]);

  const s = await api.command({ type: 'begin' });

  expect(s.status).toBe('FRAME_SELECTION');
  expect(s.registration).toEqual({ name: 'Rina', email: 'rina@gmail.com', whatsapp: '' });
  expect(backend.registrations).toEqual([{ url: '/api/session/go-1/registration', body: { name: 'Rina', email: 'rina@gmail.com', whatsapp: '' } }]);
});

test('a free session saves the registration once it is confirmed', async () => {
  const backend = booth({ free: true });
  const api = await registeredAndPaid(true);

  expect((await api.command({ type: 'begin' })).status).toBe('FRAME_SELECTION');
  expect(backend.registrations.map((r) => r.url)).toEqual(['/api/session/go-1/registration']);
});

test('the WhatsApp number goes to the backend and the stored form comes back', async () => {
  const backend = booth({});
  const api = await registeredAndPaid(false, '0812-3456-7890');
  vi.mocked(fetch).mockImplementationOnce(async (_url, init) => {
    const body = JSON.parse(String(init!.body));
    backend.registrations.push({ url: '/api/session/go-1/registration', body });
    return json({ session_id: 'go-1', ...body, whatsapp: '6281234567890', registered_at: new Date().toISOString() });
  });

  const s = await api.command({ type: 'begin' });

  expect(backend.registrations[0].body).toEqual({ name: 'Rina', email: 'rina@gmail.com', whatsapp: '0812-3456-7890' });
  expect(s.registration).toEqual({ name: 'Rina', email: 'rina@gmail.com', whatsapp: '6281234567890' });
});

test('a registration the backend refuses after payment does not block the paid session', async () => {
  const backend = booth({});
  const api = await registeredAndPaid(false);
  vi.mocked(fetch).mockImplementationOnce(async () => json('Alamat email tidak valid', 400));

  const s = await api.command({ type: 'begin' });

  expect(s.status).toBe('FRAME_SELECTION');
  expect(s.registration ?? null).toBeNull();
  // Dropped: the heartbeat does not send it again.
  await api.heartbeat({ sessionId: 'local' });
  expect(backend.registrations).toEqual([]);
});

test('a registration the backend could not take yet is retried with the heartbeat', async () => {
  const backend = booth({});
  const api = await registeredAndPaid(false);
  vi.mocked(fetch).mockImplementationOnce(async () => json('down', 503));

  expect((await api.command({ type: 'begin' })).status).toBe('FRAME_SELECTION');
  expect(backend.registrations).toEqual([]);

  await api.heartbeat({ sessionId: 'local' });
  expect(backend.registrations.map((r) => r.body)).toEqual([{ name: 'Rina', email: 'rina@gmail.com', whatsapp: '' }]);
  expect((await api.getSession()).registration).toEqual({ name: 'Rina', email: 'rina@gmail.com', whatsapp: '' });
});

test('Kembali or a timeout on registration ends the visit without sending anything', async () => {
  const backend = booth({});
  const api = await adapter();
  await api.config();
  await api.createSession();

  expect((await api.command({ type: 'cancel' })).status).toBe('CANCELLED');
  expect(backend.registrations).toEqual([]);
});

test('reloading the booth during registration returns to the registration screen', async () => {
  const first = booth({});
  const api = await adapter();
  await api.config();
  await api.createSession();

  booth({ saved: first.saved() });
  const reloaded = await adapter();
  const { session } = await reloaded.active();
  expect(session?.status).toBe('REGISTRATION');
});

test('a registration typed before a reload is still saved once the session is paid', async () => {
  const first = booth({});
  const api = await adapter();
  await api.config();
  await api.createSession();
  await api.command({ type: 'register', name: 'Rina', email: 'rina@gmail.com' });

  const backend = booth({ saved: first.saved() });
  const reloaded = await adapter();
  await reloaded.config();
  expect((await reloaded.getSession()).status).toBe('SELECT_PRINT');
  await reloaded.payment(1);
  await reloaded.mockPay('o-1');
  await reloaded.command({ type: 'begin' });

  expect(backend.registrations.map((r) => r.url)).toEqual(['/api/session/go-1/registration']);
});

test('the booth heartbeat tells the backend the paid session is still on screen', async () => {
  booth({});
  const api = await registeredAndPaid(false);
  await api.command({ type: 'begin' });
  vi.mocked(fetch).mockClear();

  await api.heartbeat({ sessionId: 'local' });

  expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/session/go-1/heartbeat', expect.objectContaining({ method: 'POST' }));
});

test('no backend heartbeat before a session is paid', async () => {
  booth({});
  const api = await adapter();
  await api.config();
  await api.createSession();
  vi.mocked(fetch).mockClear();

  await api.heartbeat({ sessionId: 'local' });

  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});

test('a paid session saved in REGISTRATION by the older booth carries on from the paid ticket', async () => {
  const first = booth({});
  await registeredAndPaid(false);
  const old = first.saved();
  // The older booth asked for the registration after payment.
  booth({ saved: { ...old, snap: { ...old.snap, status: 'REGISTRATION' } } });
  const reloaded = await adapter();
  const { session } = await reloaded.active();
  expect(session?.status).toBe('PAYMENT_SUCCESS');
});
