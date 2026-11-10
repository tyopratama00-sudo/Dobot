import { useState, type ReactNode } from 'react';
import { del, dt, get, post, qs, rp, type Page } from '../api';
import { Pager, statusChip, useAction, usePoll } from '../ui';

interface Sess {
  id: string;
  package: string;
  price: number;
  discount: number;
  final_price: number;
  print_count: number;
  status: string;
  frame: string;
  photos: number;
  drive_url: string;
  created_at: string;
  completed_at?: string;
  registration_name: string;
  registration_email: string;
  registered_at: string | null;
}
/** Registrasi melekat pada sesi (ADR 0001); null bila belum registrasi. */
interface Registration {
  name: string;
  email: string;
  registered_at: string;
}
interface Detail {
  session: Sess;
  photos: { id: string; type: 'raw' | 'framed'; url: string; selected: boolean }[];
  transactions: { id: string; midtrans_order_id: string; amount: number; status: string; created_at: string }[];
  registration: Registration | null;
  email_foto: EmailFoto | null;
}
/** Catatan pengiriman Email Foto sesi; null bila sesi tidak pernah registrasi. */
interface EmailFoto {
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  recipient: string;
  content: '' | 'link_strip' | 'strip' | 'link';
  attempts: number;
  reason: string;
  sent_at: string | null;
  next_attempt_at: string | null;
}

const EMAIL_FOTO_STATUS: Record<EmailFoto['status'], [label: string, chip: string]> = {
  pending: ['Menunggu', 'warn'],
  sent: ['Terkirim', 'ok'],
  failed: ['Gagal', 'err'],
  skipped: ['Tidak dikirim', 'mu'],
};
const EMAIL_FOTO_CONTENT: Record<EmailFoto['content'], string> = {
  '': '—',
  link_strip: 'Link folder + strip',
  strip: 'Strip saja',
  link: 'Link folder saja',
};

const STATUS: [string, string][] = [
  ['', 'Semua status'],
  ['completed', 'Selesai'],
  ['shooting', 'Foto'],
  ['paid', 'Dibayar'],
  ['pending_payment', 'Menunggu bayar'],
  ['expired', 'Kedaluwarsa'],
];

/** Riwayat sesi; route #/sesi/<id> buka detail. */
export function Sessions({ id }: { id?: string }) {
  return id ? <SessionDetail id={id} /> : <SessionList />;
}

function SessionList() {
  const [f, setF] = useState({ search: '', status: '', from: '', to: '', page: 1 });
  const [list, , err] = usePoll<Page<Sess>>(() => get(`/api/admin/sessions?${qs({ ...f, limit: 20 })}`), 15_000, [JSON.stringify(f)]);
  const set = (p: Partial<typeof f>) => setF((o) => ({ ...o, page: 1, ...p }));

  return (
    <div className="grid">
      <h1>Sesi</h1>
      <div className="card">
        <div className="form">
          <label className="f">
            Cari ID sesi, nama, atau email
            <input value={f.search} onChange={(e) => set({ search: e.target.value })} />
          </label>
          <label className="f">
            Status
            <select value={f.status} onChange={(e) => set({ status: e.target.value })}>
              {STATUS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="f">
            Dari tanggal
            <input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} />
          </label>
          <label className="f">
            Sampai tanggal
            <input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} />
          </label>
        </div>
      </div>
      <div className="card">
        {err ? <div className="chip err">{err}</div> : null}
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Nama</th>
                <th>Email</th>
                <th>Paket</th>
                <th>Frame</th>
                <th>Foto</th>
                <th>Cetak</th>
                <th>Bayar</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {(list?.data ?? []).map((s) => (
                <tr key={s.id} className="click" onClick={() => (location.hash = `#/sesi/${s.id}`)}>
                  <td className="small">{dt(s.created_at)}</td>
                  <td>{s.registration_name || '—'}</td>
                  <td className="small">{s.registration_email || '—'}</td>
                  <td>{s.package}</td>
                  <td>{s.frame || '—'}</td>
                  <td>{s.photos}</td>
                  <td>{s.print_count}×</td>
                  <td>{rp(s.final_price)}</td>
                  <td>{statusChip(s.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list && !list.data.length ? <p className="mu">Tidak ada sesi.</p> : null}
        <Pager meta={list?.meta} onPage={(page) => setF((o) => ({ ...o, page }))} />
      </div>
    </div>
  );
}

/** Bagian "Registrasi & Email Foto" pada detail sesi: data registrasi, status Email Foto, Kirim ulang, dan Hapus data registrasi. */
function RegistrationSection({
  id,
  registration,
  emailFoto,
  reload,
}: {
  id: string;
  registration: Registration | null;
  emailFoto: EmailFoto | null;
  reload: () => Promise<void>;
}) {
  const [email, setEmail] = useState(registration?.email ?? '');
  const { busy, run } = useAction();
  const path = `/api/admin/sessions/${encodeURIComponent(id)}`;
  // Nama dan email dikosongkan oleh "Hapus data registrasi"; waktu registrasi tetap sebagai riwayat.
  const deleted = !!registration && !registration.name && !registration.email;

  const resend = async () => {
    const to = email.trim() || registration?.email || '';
    if (!confirm(`Kirim ulang Email Foto ke ${to}?`)) return;
    if (await run('resend', () => post(`${path}/email-foto/resend`, { email: email.trim() }), 'Email Foto diantre ulang')) await reload();
  };
  const forget = async () => {
    if (!confirm('Hapus nama dan email pelanggan dari sesi ini? Email Foto yang belum terkirim dibatalkan. Tindakan ini tidak bisa dibatalkan.')) return;
    if (await run('delete', () => del(`${path}/registration`), 'Data registrasi dihapus')) {
      setEmail('');
      await reload();
    }
  };

  if (!registration) {
    return (
      <div className="card">
        <h2>Registrasi &amp; Email Foto</h2>
        <p className="mu">Belum registrasi.</p>
      </div>
    );
  }
  const [label, chip] = emailFoto ? EMAIL_FOTO_STATUS[emailFoto.status] : ['—', ''];
  const rows: [string, ReactNode][] = [
    ['Nama', deleted ? <span className="mu">Data registrasi dihapus</span> : registration.name],
    ['Email', deleted ? '—' : registration.email],
    ['Waktu registrasi', dt(registration.registered_at)],
  ];
  if (emailFoto) {
    rows.push(['Status Email Foto', <span className={`chip ${chip}`}>{label}</span>]);
    if (emailFoto.reason) rows.push([emailFoto.status === 'pending' ? 'Error terakhir' : 'Alasan', emailFoto.reason]);
    rows.push(['Percobaan', emailFoto.attempts]);
    if (emailFoto.status === 'pending' && emailFoto.next_attempt_at) rows.push(['Coba lagi', dt(emailFoto.next_attempt_at)]);
    if (emailFoto.status === 'sent') {
      rows.push(['Terkirim', dt(emailFoto.sent_at)]);
      rows.push(['Isi', EMAIL_FOTO_CONTENT[emailFoto.content]]);
    }
  }

  return (
    <div className="card">
      <h2>Registrasi &amp; Email Foto</h2>
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th style={{ width: 130 }}>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {deleted ? null : (
        <div className="row" style={{ marginTop: 12, alignItems: 'flex-end' }}>
          <label className="f" style={{ minWidth: 240 }}>
            Kirim ke email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={registration.email} />
          </label>
          <button className="btn pr" disabled={busy !== null} onClick={() => void resend()}>
            {busy === 'resend' ? 'Mengantre…' : 'Kirim ulang'}
          </button>
          <span className="spacer" />
          <button className="btn er" disabled={busy !== null} onClick={() => void forget()}>
            {busy === 'delete' ? 'Menghapus…' : 'Hapus data registrasi'}
          </button>
        </div>
      )}
    </div>
  );
}

function SessionDetail({ id }: { id: string }) {
  const [d, reload, err] = usePoll<Detail>(() => get(`/api/admin/sessions/${encodeURIComponent(id)}`), 0, [id]);
  const [copies, setCopies] = useState(1);
  const { busy, run } = useAction();
  if (err) return <div className="chip err">{err}</div>;
  if (!d) return <p className="mu">Memuat…</p>;
  const s = d.session;
  const framed = d.photos.filter((p) => p.type === 'framed');
  const raw = d.photos.filter((p) => p.type === 'raw');

  return (
    <div className="grid">
      <div className="row">
        <a href="#/sesi">← Sesi</a>
        <h1 style={{ margin: 0 }}>Detail sesi</h1>
        {statusChip(s.status)}
      </div>
      <div className="grid g2">
        <div className="card">
          <table>
            <tbody>
              {(
                [
                  ['ID', <span className="mono">{s.id}</span>],
                  ['Paket', s.package],
                  ['Frame', s.frame || '—'],
                  ['Harga', rp(s.price)],
                  ['Diskon', rp(s.discount)],
                  ['Dibayar', rp(s.final_price)],
                  ['Jumlah cetak', s.print_count],
                  ['Mulai', dt(s.created_at)],
                  ['Selesai', dt(s.completed_at)],
                  ['Google Drive', s.drive_url ? <a href={s.drive_url} target="_blank" rel="noreferrer">Buka folder ↗</a> : '—'],
                ] as const
              ).map(([k, v]) => (
                <tr key={k}>
                  <th style={{ width: 130 }}>{k}</th>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Cetak ulang</h2>
          {framed.length ? (
            <>
              <img src={framed[0].url} alt="Strip terakhir" style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 12 }} />
              <div className="row" style={{ marginTop: 12 }}>
                <label className="f" style={{ width: 120 }}>
                  Jumlah lembar
                  <input type="number" min={1} max={10} value={copies} onChange={(e) => setCopies(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} />
                </label>
                <button
                  className="btn pr"
                  disabled={busy !== null}
                  onClick={() => confirm(`Cetak ulang ${copies} lembar?`) && void run('print', () => post(`/api/admin/sessions/${encodeURIComponent(id)}/reprint`, { copies }), 'Dikirim ke printer')}
                >
                  {busy ? 'Mengirim…' : 'Cetak ulang'}
                </button>
              </div>
            </>
          ) : (
            <p className="mu">Belum ada strip (sesi belum selesai compose).</p>
          )}
          <h2 style={{ marginTop: 18 }}>Transaksi</h2>
          {d.transactions.map((t) => (
            <div key={t.id} className="status-row">
              <span className="mono">{t.midtrans_order_id}</span>
              <span>{rp(t.amount)}</span>
              {statusChip(t.status)}
            </div>
          ))}
          {d.transactions.length ? null : <p className="mu small">Tidak ada transaksi.</p>}
        </div>
      </div>
      <RegistrationSection key={d.registration?.email ?? ''} id={id} registration={d.registration} emailFoto={d.email_foto} reload={reload} />
      <div className="card">
        <h2>Foto ({raw.length})</h2>
        <div className="photos">
          {raw.map((p, i) => (
            <figure key={p.id}>
              <a href={p.url} target="_blank" rel="noreferrer">
                <img src={p.url} alt={`Foto ${i + 1}`} loading="lazy" />
              </a>
              <figcaption>
                <span>#{i + 1}</span>
                {p.selected ? <span className="chip ok">dipilih</span> : null}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
