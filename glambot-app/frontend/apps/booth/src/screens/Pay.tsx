import { useEffect, useRef, useState } from 'react';
import { priceFor, rp } from '@photobooth/shared';
import { useBooth } from '../store';
import { Bubble, Icon, QrCode, Robot, Steps } from '../components/basics';
import { applyFreeVoucher, backFromPay, retryPayment, selectQrPayment, setDigital, setQty } from '../flow';
import { puffs } from '../robot/floating';

type PayPhase = 'wait' | 'transitioning' | 'ok';
type PayStage = 'select' | 'payment';

const KEYS = '1234567890QWERTYUIOPASDFGHJKLZXCVBNM';
const WALLETS = ['GoPay', 'OVO', 'DANA', 'ShopeePay', 'm-Banking'];
const PKGS = [
  { id: 'print', digital: false, popular: true, icon: 'print', title: 'Cetak + Digital', perks: ['Cetak frame premium', 'Semua foto via QR'] },
  { id: 'digital', digital: true, popular: false, icon: 'qr', title: 'Digital saja', perks: ['Semua foto via QR', 'Tanpa antre cetak'] },
] as const;

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** prototype V.pay — quantity, price, real dynamic QRIS, payment states */
export function Pay() {
  const session = useBooth((s) => s.session)!;
  const qty = useBooth((s) => s.qty);
  const pricing = useBooth((s) => s.config!.pricing);
  const voucherChip = useBooth((s) => s.config!.voucherChip !== false);
  const payBusy = useBooth((s) => s.payBusy);
  const payError = useBooth((s) => s.payError);
  const busy = useBooth((s) => s.busy);
  const now = useNow();
  const [phase, setPhase] = useState<PayPhase>('wait');
  // Resume after reload: a live QR or paid session opens straight on the payment stage.
  const [stage, setStage] = useState<PayStage>(() =>
    session.status === 'PAYMENT_SUCCESS' || session.payment?.status === 'PENDING' ? 'payment' : 'select',
  );
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherKeyboardOpen, setVoucherKeyboardOpen] = useState(false);
  const [voucherUsed, setVoucherUsed] = useState(false);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [method, setMethod] = useState<'choose' | 'qris' | 'voucher'>('choose');
  // On-screen keypad: kiosk has no physical keyboard; typing clears the last error.
  const typeVoucher = (f: (c: string) => string) => {
    setVoucherCode((c) => f(c).slice(0, 20));
    setVoucherError(null);
  };
  const asapRef = useRef<HTMLDivElement>(null);
  const st = session.status;
  const pay: 'wait' | 'ok' | 'fail' = st === 'PAYMENT_SUCCESS' ? 'ok' : st === 'PAYMENT_FAILED' || (payError && !payBusy) ? 'fail' : 'wait';
  const payment = session.payment && session.payment.status === 'PENDING' ? session.payment : null;
  const qrReady = !!payment && payment.quantity === qty && !payBusy;
  const left = payment ? Math.max(0, Math.floor((new Date(payment.expiresAt).getTime() - now) / 1000)) : 0;
  const expired = session.payment?.status === 'EXPIRED';

  useEffect(() => {
    if (pay === 'ok' && phase === 'wait') setPhase('transitioning');
  }, [pay, phase]);

  // Robot emerges from smoke inside the QR box: thick puffs cover it at once and
  // thin out, a second wave hugs the bottom so the feet clear last.
  useEffect(() => {
    if (phase !== 'transitioning') return;
    const el = asapRef.current;
    if (el) {
      const w = el.clientWidth;
      const h = el.clientHeight;
      puffs(el, w, h, 11, { size: [w * 0.45, w * 0.7], drift: 0.25, spread: 0, life: 2300, cls: 'puff thick' });
      puffs(el, w, h, 8, { size: [w * 0.35, w * 0.55], y: [0.6, 0.95], drift: 0.3, spread: 0.6, life: 2300, cls: 'puff soft' });
    }
    const t = setTimeout(() => setPhase('ok'), 2400);
    return () => clearTimeout(t);
  }, [phase]);
  const done = phase !== 'wait';
  const digital = qty === 0;
  const locked = pay === 'ok' || voucherUsed;
  // ponytail: digital = package base_price (backend: base + 0 × print_unit_price). Add packages.digital_price if it must differ.
  const digitalPrice = pricing.firstPrint - pricing.additionalPrint;
  const listPrice = digital ? digitalPrice : priceFor(qty, pricing);
  const total = voucherUsed ? 0 : payment || pay === 'ok' ? session.amount : listPrice;
  const urgent = qrReady && left > 0 && left <= 15;
  // Keep the QR mounted on the paid render before the effect flips phase (no flicker).
  const inQr = done || pay !== 'fail';
  const changeMethod = stage === 'payment' && (method === 'qris' || method === 'voucher') && pay !== 'ok';
  const goBack = () => {
    if (changeMethod) {
      setMethod('choose');
      setVoucherKeyboardOpen(false);
      setVoucherError(null);
    } else if (stage === 'payment' && method === 'choose') {
      setStage('select');
    } else backFromPay();
  };
  // Only success forces the payment stage; a re-requested QR (qty change) must not skip "Lanjut".
  useEffect(() => {
    if (pay === 'ok') setStage('payment');
  }, [pay]);

  return (
    <div className={`scr en booth-theme pay-screen ${method === 'voucher' && voucherKeyboardOpen ? 'voucher-open' : ''}`}>
      <i className="pay-blob a" aria-hidden />
      <i className="pay-blob b" aria-hidden />
      <div className="top">
        <button className={`btn sm ${busy === 'cancel' ? 'wait' : ''}`} onClick={goBack} disabled={pay === 'ok' || !!busy} data-testid="pay-back">
          <Icon n="back" z={30} />
          {changeMethod ? 'Ganti metode' : 'Kembali'}
        </button>
        <Steps cur={stage === 'select' ? 0 : 1} />
      </div>
      <div className="row">
        <div className={`card pay-left ${stage === 'select' ? 'select-stage' : 'payment-stage'}`}>
          {stage === 'select' ? <>
          <header className="pay-hero">
            <span className="free-eyebrow"><span>✦</span> SESI FOTO SPESIAL <span>✦</span></span>
            <h1>Mau dicetak <em>berapa?</em></h1>
            <p className="p">Pilih cetakan yang kamu mau. Semua foto tetap bisa diunduh lewat QR.</p>
          </header>
          <div className="pay-pkgs" role="radiogroup" aria-label="Pilih paket">
            {PKGS.map((p) => {
              const on = digital === p.digital;
              return (
                <button key={p.id} role="radio" aria-checked={on} className={`pay-pkg ${p.id} ${on ? 'on' : ''}`} onClick={() => setDigital(p.digital)} disabled={locked} data-testid={`mode-${p.id}`} data-avoid>
                  {p.popular ? <span className="pay-badge">Populer</span> : null}
                  <span className="pay-check">
                    <Icon n="check" z={26} />
                  </span>
                  <span className="pay-pkg-icon">
                    <Icon n={p.icon} z={46} />
                  </span>
                  <b>{p.title}</b>
                  <span className="pay-pkg-price">{p.digital ? rp(digitalPrice) : `Mulai ${rp(pricing.firstPrint)}`}</span>
                  <ul>
                    {p.perks.map((x) => (
                      <li key={x}>
                        <Icon n="check" z={22} />
                        {x}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
          {digital ? (
            <div key="d" className="pay-mid">
              <span className="pay-mid-icon">
                <Icon n="download" z={60} />
              </span>
              <div className="pay-mid-copy">
                <b>Foto digital lewat QR</b>
                <small>Tanpa cetak. Scan QR di akhir sesi untuk unduh semua fotomu.</small>
              </div>
            </div>
          ) : (
            <div key="p" className="pay-mid">
              <div className="pay-stack" aria-hidden>
                {[...Array(Math.min(qty, 5))].map((_, i) => (
                  <i key={i} style={{ transform: `translate(${i * 7}px, ${-i * 7}px) rotate(${(i % 2 ? 1 : -1) * i * 2}deg)` }} />
                ))}
              </div>
              <div className="pay-mid-copy">
                <b>Jumlah cetak</b>
                <small>+{rp(pricing.additionalPrint)} per lembar tambahan</small>
              </div>
              <div className="qty pay-qty">
                <button className="btn rnd" onClick={() => setQty(-1)} disabled={qty <= 1 || locked} data-testid="qty-minus">
                  −
                </button>
                <b data-testid="qty">{qty}</b>
                <button className="btn rnd" onClick={() => setQty(1)} disabled={qty >= pricing.maxQuantity || locked} data-testid="qty-plus">
                  +
                </button>
              </div>
            </div>
          )}
          {stage === 'select' ? <div className="pay-select-footer" data-avoid>
            <div className="pay-select-price">
              <div>{digital ? 'Paket digital' : `${qty} cetak + digital`}</div>
              <small>{digital ? 'Semua foto via QR' : `${rp(pricing.firstPrint)} cetak pertama${qty > 1 ? ` + ${qty - 1} × ${rp(pricing.additionalPrint)}` : ''}`}</small>
            </div>
            <div className="pay-select-total"><small>Total</small><b key={total} data-testid="total">{rp(total)}</b></div>
            <button className="btn pr" onClick={() => { setStage('payment'); setMethod('choose'); }} data-testid="continue-payment" data-avoid>Lanjut ke pembayaran <Icon n="next" z={26} /></button>
          </div> : null}
          </> : null}
        </div>
        <div className={`card pay-right ${stage === 'select' ? 'select-stage' : 'payment-stage'} method-${method}`}>
          {stage === 'payment' ? (
          <>
          <div className="pay-compact-summary" data-avoid><b>{digital ? 'Digital saja' : `${qty} cetak + digital`}</b><span>{rp(total)}</span></div>
          {pay === 'fail' && method === 'qris' ? (
            <>
              <div className="pill f" data-testid="pay-failed"><Icon n="x" z={34} /> Pembayaran gagal</div>
              <Bubble>{payError ?? (expired ? 'Waktu pembayaran habis. Yuk buat kode QR baru.' : 'Oops! Pembayaran belum berhasil. Yuk coba lagi.')}</Bubble>
              <button className={`btn pr ${busy === 'retry-pay' ? 'wait' : ''}`} onClick={retryPayment}>Coba lagi</button>
            </>
          ) : method === 'choose' && pay !== 'ok' ? (
            <div className="pay-methods" data-avoid>
              <div className="pay-heading">
                <h2>Pilih cara bayar</h2>
                <p className="p">Pilih metode yang paling nyaman buatmu</p>
              </div>
              <button className="pay-method qris-method" onClick={() => { setMethod('qris'); selectQrPayment(); }} data-testid="method-qris">
                <span className="pay-method-icon"><Icon n="qr" z={48} /></span>
                <span className="pay-method-copy"><b>Bayar dengan QRIS</b><small>E-wallet atau mobile banking</small></span>
                <Icon n="next" z={30} />
              </button>
              <button className="pay-method voucher-method" onClick={() => setMethod('voucher')} data-testid="method-voucher">
                <span className="pay-method-icon"><Icon n="ticket" z={48} /></span>
                <span className="pay-method-copy"><b>Pakai kode voucher</b><small>Punya kode promo? Gunakan di sini</small></span>
                <Icon n="next" z={30} />
              </button>
              <div className="pay-note"><Icon n="check" z={22} /> Pembayaran aman dan mudah</div>
            </div>
          ) : method === 'voucher' && pay !== 'ok' ? (
            <div className="voucher-layout">
            <div className="voucher-panel">
                <div className="voucher-title" data-avoid>
                  <span className="voucher-icon"><Icon n="ticket" z={34} /></span>
                  <div><h2>Masukkan voucher</h2><p className="voucher-prompt">Ketuk kolom, lalu ketik kodenya</p></div>
                  {voucherKeyboardOpen ? <button className="btn sm voucher-keyboard-close" type="button" onClick={() => setVoucherKeyboardOpen(false)}>Tutup</button> : null}
                </div>
               <div className="voucher-entry">
               <input className="voucher-input" aria-label="Kode voucher" value={voucherCode} readOnly inputMode="none" placeholder="Kode voucher" disabled={voucherUsed} onClick={() => setVoucherKeyboardOpen(true)} aria-haspopup="true" aria-expanded={voucherKeyboardOpen} data-avoid />
               <button className={`btn pr voucher-submit ${busy === 'voucher' ? 'wait' : ''}`} onClick={() => void applyFreeVoucher(voucherCode).then((error) => { setVoucherError(error); if (!error) { setVoucherUsed(true); setVoucherKeyboardOpen(false); } })} disabled={voucherUsed || !voucherCode.trim() || !!busy} data-avoid>
                 <Icon n={voucherUsed ? 'check' : 'ticket'} z={23} />{voucherUsed ? 'Berhasil' : 'Pakai'}
               </button>
               </div>
                {voucherChip && !voucherKeyboardOpen ? (
                <button className="voucher-chip" type="button" onClick={() => { setVoucherCode('FREE FOTO'); setVoucherError(null); }} disabled={voucherUsed}>
                  <Icon n="ticket" z={25} /><span><b>FREE FOTO</b><small>Ketuk untuk pakai</small></span><Icon n="next" z={23} />
                </button>
               ) : null}
               {voucherError ? <div className="pill f voucher-error" role="alert"><Icon n="x" z={22} />{voucherError}</div> : null}
            </div>
            {voucherKeyboardOpen ? <div className="voucher-keys" role="group" aria-label="Keyboard voucher" data-avoid>
              {[...KEYS].map((k) => (
                <button key={k} type="button" onClick={() => typeVoucher((c) => c + k)} disabled={voucherUsed}>{k}</button>
              ))}
              <button type="button" className="wide" onClick={() => typeVoucher((c) => c + ' ')} disabled={voucherUsed}>Spasi</button>
              <button type="button" className="wide" aria-label="Hapus" onClick={() => typeVoucher((c) => c.slice(0, -1))} disabled={voucherUsed}>⌫</button>
            </div> : null}
            </div>
          ) : pay === 'ok' || inQr ? (
            <>
              {done ? (
                <div className="pill s" data-testid="pay-ok">
                  <Icon n="check" z={34} /> Pembayaran berhasil
                </div>
              ) : (
                <div className={`pill w ${urgent ? 'urgent' : ''} pay-wait-pill`} aria-label="Pembayaran menunggu">
                  <Icon n="clock" z={27} />
                  {qrReady && left > 0 ? <span className="tm">{String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}</span> : <span>Siapkan e-wallet kamu</span>}
                </div>
              )}
              <div className="pay-qrwrap" data-testid={!done ? 'pay-waiting' : undefined}>
              <div className="free-halo" aria-hidden><i /><i /><i /></div>
              <div className={`qrbox pay-qr ${qrReady || done ? '' : 'busy'} ${done ? '' : 'spin'}`} data-testid="qris" data-avoid>
                {voucherUsed ? (
                  <div className={`qrin voucher-paid ${done ? 'gone' : ''}`} aria-label="Voucher FREE FOTO">
                    <Icon n="ticket" z={120} />
                    <b>FREE FOTO</b>
                  </div>
                ) : (
                  <>
                    <div className={`qrin ${done ? 'gone' : ''}`}>
                      {payment || done ? <QrCode text={payment?.qrString ?? session.payment?.qrString ?? ''} size={360} level="Q" /> : <div className="qrskel" />}
                    </div>
                    <div className={`qrin ${done ? 'gone' : ''}`} style={{ position: 'absolute', left: '50%', top: '50%', translate: '-50% -50%', background: '#fff', borderRadius: 20, padding: '4px 12px', fontWeight: 700, fontSize: 30 }}>
                      QRIS
                    </div>
                  </>
                )}
                {/* layers: robot < fog < smoke, so the smoke covers the robot */}
                {done ? (
                  <>
                    <div className="emerge">
                      <Robot m="cheer" s={330} />
                    </div>
                    <div className="fog" />
                    <div ref={asapRef} className="asap" />
                  </>
                ) : null}
              </div>
              </div>
              {done ? (
                <div className="late">
                  <h2>Lunas</h2>
                  <p className="p" style={{ marginTop: 8 }}>
                    Kita mulai sebentar lagi.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
                  <p className="p" style={{ fontSize: 30 }}>
                    Scan dengan e-wallet atau m-banking
                  </p>
                  <div className="pay-wallets">
                    {WALLETS.map((w) => (
                      <span key={w}>{w}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="pill f" data-testid="pay-failed">
                <Icon n="x" z={34} /> Pembayaran gagal
              </div>
              <Bubble>{payError ?? (expired ? 'Waktu pembayaran habis. Yuk buat kode QR baru.' : 'Oops! Pembayaran belum berhasil. Yuk coba lagi.')}</Bubble>
              <button className={`btn pr ${busy === 'retry-pay' ? 'wait' : ''}`} onClick={retryPayment} data-testid="pay-retry">
                Coba lagi
              </button>
            </>
          )}
          </>
          ) : null}
        </div>
      </div>
      <footer className="free-footer pay-footer"><span>ROBOT PHOTOBOOTH</span><i /> {digital ? 'SEMUA FILE FOTO' : `${qty} CETAKAN + SEMUA FILE FOTO`}</footer>
    </div>
  );
}
