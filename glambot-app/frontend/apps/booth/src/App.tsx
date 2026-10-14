import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { UNPAID_STATES, type BoothScreen } from '@photobooth/shared';
import { currentScreen, get, set, useBooth, type BoothState } from './store';
import { boot, onIdleTimeout } from './flow';
import { robot } from './robot/floating';
import { Welcome } from './screens/Welcome';
import { Pay } from './screens/Pay';
import { Ready, Session, sessionPose } from './screens/Capture';
import { Lightbox, Review } from './screens/Review';
import { Pick, Tpl } from './screens/Select';
import { Edit } from './screens/Edit';
import { Final, Print, Qr, Thanks } from './screens/Output';
import { DevBar, ErrorScreen, Maintenance, Notice, ReconnectOverlay } from './screens/System';
import { Robot } from './components/basics';
import { hush, voice, voiceOnScreen } from './voice';
import { api } from './api/client';

const SCREEN_VOICE: Partial<Record<BoothScreen | 'maintenance', string[]>> = {
  maintenance: ['welcome_maint'],
  pay: ['pay_qty', 'pay_show'],
  ready: ['countdown'],
  review: ['review_show'],
  tpl: ['tpl_type'],
  pick: ['pick_show'],
  edit: ['edit_show'],
  final: ['final_show'],
  print: ['print_wait'],
  qr: ['qr_show'],
  thanks: ['thanks'],
  error: ['err_general'],
};

/** "Get ready, I'll count" cues played between the pose tip and 3-2-1. */
const HOLDS = ['hold_1', 'hold_2', 'hold_4'];

/** Voice cue on screen change, plus the few status changes inside one screen. */
function useScreenVoice(screen: BoothScreen | 'maintenance') {
  const status = useBooth((s) => s.session?.status);
  const expired = useBooth((s) => s.session?.payment?.status === 'EXPIRED');
  const online = useBooth((s) => s.online);
  const idle = useBooth((s) => s.timer?.mode === 'limit' && s.timer.left <= (s.config?.timeouts.warningSeconds ?? 15));
  const last = useRef('');
  useEffect(() => {
    const changed = screen !== last.current;
    last.current = screen;
    if (status === 'PAYMENT_SUCCESS') voice('pay_ok');
    else if (status === 'PAYMENT_FAILED') voice(expired ? 'pay_qr_expired' : 'pay_retry');
    else if (status === 'PRINT_SUCCESS') voice('print_done');
    // Countdown audio must start with the on-screen digits, so it cuts pay_ok.
    else if (changed && screen === 'ready') voice('countdown');
    else if (changed && SCREEN_VOICE[screen]) voiceOnScreen(SCREEN_VOICE[screen]!);
  }, [screen, status, expired]);
  // Session: announce the next angle while the robot moves, then the pose tip.
  const c = useBooth((s) => s.capture);
  const angles = useBooth((s) => s.session?.plan.angles ?? 0);
  const seed = useBooth((s) => s.session?.id ?? '');
  const spa = useBooth((s) => s.session?.plan.shotsPerAngle ?? 2);
  const said = useRef(new Set<string>());
  useEffect(() => {
    // Polling can flip move/prep back and forth: speak each cue once per angle/shot.
    const key = `${seed}-${c.phase}-${c.angle}-${c.shot}`;
    if (screen !== 'session') return void said.current.clear(); // retake = fresh cues
    // Countdown cue is timed to the shutter in flow.ts runCapture.
    if (said.current.has(key)) return;
    said.current.add(key);
    const pose = sessionPose('prep', c.angle, c.shot, spa, seed);
    // Angle 1 stays silent so the ready countdown finishes cleanly.
    if (c.phase === 'move') {
      if (c.angle > 0) voice(c.angle === angles - 1 ? 'ready_last' : 'ready_next');
    }
    // Prep lasts as long as the audio: tip + "get ready" cue queue behind the angle
    // announcement, then end the dobot prep window so 3-2-1 starts right after.
    // SEQUENCE_PREP_SEC (dobot/.env) is only the fallback cap.
    else if (c.phase === 'prep') {
      const hold = HOLDS[Math.floor(Math.random() * HOLDS.length)];
      voice(['pose_' + pose, hold], true, undefined, () => setTimeout(() => void api.robotPrepDone(), 300));
    }
  }, [screen, c.phase, c.angle, c.shot]);
  // Welcome invite repeats every 15s, only while the welcome page is up.
  useEffect(() => {
    if (screen !== 'welcome') return;
    const say = () => currentScreen(get()) === 'welcome' && !get().entering && voice('welcome_idle');
    say();
    const t = setInterval(say, 15000);
    return () => {
      clearInterval(t);
      hush('welcome_idle');
    };
  }, [screen]);
  useEffect(() => {
    if (!online) voice('err_reconnect');
  }, [online]);
  useEffect(() => {
    if (idle && screen === 'pay') voice('pay_wait');
    else if (idle && screen === 'edit') voice('edit_warn');
    else if (idle && ['review', 'tpl', 'pick', 'final'].includes(screen)) voice('idle_warn');
  }, [idle, screen]);
}

/** prototype fit2(): scale the 1920×1080 stage to the viewport (letterboxed). */
function useStageScale() {
  const calc = () => Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  const [k, setK] = useState(calc);
  useEffect(() => {
    const on = () => setK(calc());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return k;
}

function FloatingRobotHost() {
  const rob = useRef<HTMLDivElement>(null);
  const rbi = useRef<HTMLDivElement>(null);
  const rbb = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const stage = document.getElementById('st')!;
    robot.attach(rob.current!, rbi.current!, rbb.current!, stage);
    return () => robot.detach();
  }, []);
  return (
    <div id="rob" ref={rob}>
      <div id="rbb" ref={rbb} />
      <div id="rbi" ref={rbi} />
    </div>
  );
}

const SCREENS: Record<BoothScreen, () => JSX.Element> = {
  welcome: Welcome,
  pay: Pay,
  ready: Ready,
  session: Session,
  review: Review,
  tpl: Tpl,
  pick: Pick,
  edit: Edit,
  final: Final,
  print: Print,
  qr: Qr,
  thanks: Thanks,
  error: ErrorScreen,
};

/** Per-screen inactivity timeouts with a visible warning countdown. */
/** Page timer: counts from when the page opened (touches don't reset it), then runs the page's timeout. */
function useTimer() {
  useEffect(() => {
    let since = Date.now();
    let lastScreen = '';
    const t = setInterval(() => {
      const s = get();
      const cfg = s.config?.timeouts;
      if (!cfg) return;
      const scr = currentScreen(s);
      if (scr !== lastScreen) {
        lastScreen = scr;
        since = Date.now();
      }
      const show = (timer: BoothState['timer']) => (s.timer?.left !== timer?.left || s.timer?.mode !== timer?.mode) && set({ timer });
      if ((scr === 'ready' || scr === 'session') && s.deadline) {
        return show({ left: Math.max(0, Math.ceil((s.deadline - Date.now()) / 1000)), mode: scr === 'ready' ? 'ready' : 'est' });
      }
      const st = s.session?.status;
      const limit =
        scr === 'pay' && st && UNPAID_STATES.has(st)
          ? cfg.paymentSeconds
          : scr === 'tpl'
            ? cfg.frameSeconds
            : scr === 'pick'
            ? cfg.pickSeconds
            : scr === 'review'
            ? cfg.selectionSeconds
            : scr === 'edit'
              ? cfg.editingSeconds
              : scr === 'final'
                ? cfg.finalSeconds
                : scr === 'qr'
                  ? cfg.qrSeconds
                  : scr === 'thanks'
                    ? cfg.thanksSeconds
                    : scr === 'error'
                      ? cfg.errorResetSeconds * 3
                      : 0;
      if (!limit) return show(null);
      const left = Math.ceil(limit - (Date.now() - since) / 1000);
      // Error page keeps its timeout but shows no timer.
      show(scr === 'error' ? null : { left: Math.max(0, left), mode: 'limit' });
      if (left <= 0 && !s.busy) {
        since = Date.now();
        onIdleTimeout();
      }
    }, 250);
    return () => clearInterval(t);
  }, []);
}

const mmss = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;

function Timer() {
  const timer = useBooth((s) => s.timer);
  const warn = useBooth((s) => s.config?.timeouts.warningSeconds ?? 15);
  if (!timer) return null;
  const { left, mode } = timer;
  return (
    <div className={`timer ${mode === 'limit' && left <= warn ? 'warn' : ''}`} data-testid="timer" role="timer" aria-live="off">
      ⏱ {mode === 'est' ? (left > 0 ? `± ${mmss(left)}` : 'sebentar lagi') : mmss(left)}
    </div>
  );
}

export function App() {
  const k = useStageScale();
  const booted = useBooth((s) => s.booted);
  const bootError = useBooth((s) => s.bootError);
  const screen = useBooth((s) => currentScreen(s));
  const holdUntil = useBooth((s) => s.holdPrintUntil);
  const capture = useBooth((s) => s.capture);
  const shotsPerAngle = useBooth((s) => s.session?.plan.shotsPerAngle ?? 2);
  const sessionId = useBooth((s) => s.session?.id ?? '');
  const maintenance = useBooth(
    (s) => !s.session && !s.entering && ((s.health && !s.health.acceptingSessions) || (s.config?.camera.mode === 'browser' && s.cameraState === 'error')),
  );
  const [, force] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    void boot();
  }, []);
  useTimer();
  useScreenVoice(maintenance ? 'maintenance' : screen);

  // Re-evaluate the screen when a "hold" (print failure message) ends.
  useEffect(() => {
    const ms = holdUntil - Date.now();
    if (ms <= 0) return;
    const t = setTimeout(force, ms + 20);
    return () => clearTimeout(t);
  }, [holdUntil]);

  // prototype syncRob(): keep the floating mascot in step with the screen / pose
  useEffect(() => {
    robot.sync(maintenance ? 'welcome' : screen, sessionPose(capture.phase, capture.angle, capture.shot, shotsPerAngle, sessionId));
  }, [screen, capture.phase, capture.angle, capture.shot, shotsPerAngle, sessionId, maintenance]);

  const View = SCREENS[screen];
  return (
    <>
      <div id="st" style={{ transform: `translate(${-960 * k}px,${-540 * k}px) scale(${k})`, left: '50%', top: '50%' }}>
        <div id="ct" style={{ position: 'absolute', inset: 0 }} data-screen={booted ? (maintenance ? 'maintenance' : screen) : 'boot'}>
          {!booted ? (
            <div className="scr" style={{ alignItems: 'center', justifyContent: 'center', gap: 30, textAlign: 'center' }}>
              <Robot m="hi" s={300} />
              <p className="p">{bootError ? 'Menyambungkan ke sistem…' : 'Menyiapkan booth…'}</p>
            </div>
          ) : maintenance ? (
            <Maintenance />
          ) : (
            <View key={screen} />
          )}
        </div>
        <FloatingRobotHost />
        <Lightbox />
        <Notice />
        <Timer />
        <ReconnectOverlay />
      </div>
      <DevBar />
    </>
  );
}
