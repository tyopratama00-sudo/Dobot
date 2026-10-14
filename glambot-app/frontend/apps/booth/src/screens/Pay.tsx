import { useEffect, useRef, useState } from 'react';
import { priceFor, rp } from '@photobooth/shared';
import { useBooth } from '../store';
import { Bubble, Icon, QrCode, Robot } from '../components/basics';
import { applyFreeVoucher, backFromPay, retryPayment, selectQrPayment, setQty } from '../flow';
import { puffs } from '../robot/floating';

type PayPhase = 'wait' | 'transitioning' | 'ok';

const KEYS = '1234567890QWERTYUIOPASDFGHJKLZXCVBNM';

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
  const payBusy = useBooth((s) => s.payBusy);
  const payError = useBooth((s) => s.payError);
  const busy = useBooth((s) => s.busy);
  const now = useNow();
  const [phase, setPhase] = useState<PayPhase>('wait');
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherUsed, setVoucherUsed] = useState(false);
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [method, setMethod] = useState<'choose' | 'qris' | 'voucher'>('choose');
  // On-screen keypad: kiosk has no physical keyboard; typing clears the last error.
  const typeVoucher = (f: (c: string) => string) => {
    setVoucherCode((c) => f(c).slice(0, 20));
    setVoucherError(null);
  };
  const qrRef = useRef<HTMLDivElement>(null);
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
  // Keep the QR mounted on the paid render before the effect flips phase (no flicker).
  const inQr = done || pay !== 'fail';

  return (
    <div className="scr en">
      <div className="top">
        <button className={`btn sm ${busy === 'cancel' ? 'wait' : ''}`} onClick={backFromPay} disabled={pay === 'ok'} data-testid="pay-back">
          <Icon n="back" z={30} />
          Kembali
        </button>
        <div className="chip b">Langkah 1 dari 4 · Bayar</div>
      </div>
      <div className="row">
        <div className="card" style={{ flex: 1.15, padding: 56, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative' }}>
          <div>
            <h2>Pilih jumlah cetakanmu</h2>
            <p className="p" style={{ marginTop: 10, maxWidth: 640 }}>
              Cetak pertama {rp(pricing.firstPrint)}, tambahan +{rp(pricing.additionalPrint)} per lembar
            </p>
          </div>
          <div className="qty" style={{ justifyContent: 'center' }}>
            <button className="btn rnd" onClick={() => setQty(-1)} disabled={qty <= 1 || pay === 'ok' || voucherUsed} data-testid="qty-minus">
              −
            </button>
            <b data-testid="qty">{qty}</b>
            <button className="btn rnd" onClick={() => setQty(1)} disabled={qty >= pricing.maxQuantity || pay === 'ok' || voucherUsed} data-testid="qty-plus">
              +
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div className="p">Total</div>
              <div style={{ fontSize: 110, fontWeight: 700, lineHeight: 1, color: 'var(--bl)' }} data-testid="total">
                {rp(voucherUsed ? 0 : payment || pay === 'ok' ? session.amount : priceFor(qty, pricing))}
              </div>
            </div>
          </div>
        </div>
        <div className="card" style={{ flex: 0.85, padding: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', textAlign: 'center', position: 'relative' }}>
          {pay === 'fail' && method === 'qris' ? (
            <>
              <div className="pill f" data-testid="pay-failed"><Icon n="x" z={34} /> Pembayaran gagal</div>
              <Robot m="think" s={260} />
              <Bubble>{payError ?? (expired ? 'Waktu pembayaran habis. Yuk buat kode QR baru.' : 'Oops! Pembayaran belum berhasil. Yuk coba lagi.')}</Bubble>
              <button className={`btn pr ${busy === 'retry-pay' ? 'wait' : ''}`} onClick={retryPayment}>Coba lagi</button>
            </>
          ) : method === 'choose' && pay !== 'ok' ? (
            <div className="pay-methods">
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
            <div className="voucher-panel">
              <div className="voucher-title"><span className="voucher-icon"><Icon n="ticket" z={34} /></span><h2>Masukkan voucher</h2></div>
              <input className="voucher-input" aria-label="Kode voucher" value={voucherCode} readOnly inputMode="none" placeholder="CONTOH: FREE FOTO" disabled={voucherUsed} />
              <div className="voucher-keys" role="group" aria-label="Keyboard voucher">
                {[...KEYS].map((k) => (
                  <button key={k} type="button" onClick={() => typeVoucher((c) => c + k)} disabled={voucherUsed}>{k}</button>
                ))}
                <button type="button" className="wide" onClick={() => typeVoucher((c) => c + ' ')} disabled={voucherUsed}>Spasi</button>
                <button type="button" className="wide" aria-label="Hapus" onClick={() => typeVoucher((c) => c.slice(0, -1))} disabled={voucherUsed}>⌫</button>
              </div>
              <button className="voucher-chip" type="button" onClick={() => { setVoucherCode('FREE FOTO'); setVoucherError(null); }} disabled={voucherUsed}>
                <Icon n="ticket" z={25} /><span><b>FREE FOTO</b><small>Ketuk untuk pakai</small></span><Icon n="next" z={23} />
              </button>
              {voucherError ? <div className="pill f voucher-error" role="alert"><Icon n="x" z={22} />{voucherError}</div> : null}
              <button className={`btn pr voucher-submit ${busy === 'voucher' ? 'wait' : ''}`} onClick={() => void applyFreeVoucher(voucherCode).then((error) => { setVoucherError(error); if (!error) setVoucherUsed(true); })} disabled={voucherUsed || !voucherCode.trim() || !!busy}>
                <Icon n={voucherUsed ? 'check' : 'ticket'} z={28} />{voucherUsed ? 'Voucher berhasil' : 'Pakai voucher'}
              </button>
              <button className="btn sm voucher-back" onClick={() => { setMethod('choose'); setVoucherError(null); }}><Icon n="back" z={23} /> Ganti metode</button>
            </div>
          ) : pay === 'ok' || inQr ? (
            <>
              {done ? (
                <div className="pill s" data-testid="pay-ok">
                  <Icon n="check" z={34} /> Pembayaran berhasil
                </div>
              ) : (
                <div className="pill w" data-testid="pay-waiting">
                  <Icon n="clock" z={34} /> Menunggu pembayaran
                  {qrReady && left > 0 ? (
                    <span className="tm">
                      · {String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}
                    </span>
                  ) : null}
                </div>
              )}
              <div ref={qrRef} className={`qrbox ${qrReady || done ? '' : 'busy'}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18, border: '6px solid var(--soft)', borderRadius: 32, position: 'relative' }} data-testid="qris">
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
              {done ? (
                <div className="late">
                  <h2>Lunas</h2>
                  <p className="p" style={{ marginTop: 8 }}>
                    Kita mulai sebentar lagi.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
                  <p className="p" style={{ fontSize: 32 }}>
                    Scan dengan e-wallet atau m-banking
                  </p>
                  <button className="btn sm pay-change-method" onClick={() => setMethod('choose')}><Icon n="back" z={23} /> Ganti metode</button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="pill f" data-testid="pay-failed">
                <Icon n="x" z={34} /> Pembayaran gagal
              </div>
              <Robot m="think" s={260} />
              <Bubble>{payError ?? (expired ? 'Waktu pembayaran habis. Yuk buat kode QR baru.' : 'Oops! Pembayaran belum berhasil. Yuk coba lagi.')}</Bubble>
              <button className={`btn pr ${busy === 'retry-pay' ? 'wait' : ''}`} onClick={retryPayment} data-testid="pay-retry">
                Coba lagi
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
