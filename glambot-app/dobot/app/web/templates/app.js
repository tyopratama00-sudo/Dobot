let streamRetries = 0;
let streamTimer = null;
let currentFsmState = 'IDLE';
let sessionActive = false;
let activeNumberedPreset = null; 
let previousPreset = null;  

// ═══ Session Gate ═══
function applySessionState(active, statusText) {
  sessionActive = !!active;
  const gate = document.getElementById('sessionGate');
  if (gate) gate.classList.toggle('hidden', sessionActive);
  const txt = document.getElementById('sessionStatusText');
  if (txt && statusText) txt.textContent = statusText;
}

// ═══ Webcam stream ═══
function streamOk() {
  streamRetries = 0;
  document.getElementById('vidOverlay')?.classList.add('hidden');
  if (streamTimer) { clearTimeout(streamTimer); streamTimer = null; }
}
function streamErr() {
  document.getElementById('vidOverlay')?.classList.remove('hidden');
  streamRetries++;
  streamTimer = setTimeout(() => {
    const img = document.getElementById('streamImg');
    if (img) img.src = '/video_feed?' + Date.now();
  }, Math.min(1000 * streamRetries, 5000));
}

// ═══ State Machine ═══
const SM_MAP = {
  'IDLE':      'smIdle',
  'MOVING':    'smMoving',
  'TRACKING':  'smReady',
  'CAPTURING': 'smCapture',
  'DONE':      'smIdle',
};
const SM_OVERLAY = {
  'MOVING':    'Moving to next pose…',
  'CAPTURING': 'Hold still — capturing…',
};

function updateSM(state) {
  if (state === currentFsmState) return;
  currentFsmState = state;

  document.querySelectorAll('.sm-step').forEach(e => e.classList.remove('active'));
  const id = SM_MAP[state];
  if (id) document.getElementById(id)?.classList.add('active');

  const ov  = document.getElementById('stateOverlay');
  const txt = SM_OVERLAY[state];
  if (txt) {
    const lbl = document.getElementById('stateOverlayLabel');
    if (lbl) lbl.textContent = txt;
    ov?.classList.remove('hidden');
  } else {
    ov?.classList.add('hidden');
  }
}

// ═══ Progress bars ═══
// Dua bar: kemajuan SELURUH sequence, dan sisa waktu slot pose yang berjalan.
function renderSequenceProgress(seq, fsmState) {
  const clampPercent = value => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.min(100, Math.round(num)));
  };

  const total       = (seq && seq.total)  || 0;
  const index       = (seq && seq.index)  || 0;
  const left        = (seq && seq.seconds_left) || 0;
  const slotSec     = (seq && seq.slot_sec) || 0;
  const overall     = clampPercent(seq && seq.percent);
  const complete    = !!(seq && seq.complete);
  const active      = ['MOVING', 'TRACKING', 'CAPTURING'].includes(fsmState);

  // Sisa waktu slot → persen terpakai. Tanpa slot aktif, bar dikosongkan.
  const slotPercent = active && slotSec > 0
    ? clampPercent(((slotSec - left) / slotSec) * 100)
    : (complete ? 100 : 0);

  const stateColor = s => {
    if (s === 'ready')   return '#3F72AF';
    if (s === 'done')    return '#00c896';
    if (s === 'pending') return '#f5a623';
    return 'rgba(249, 247, 247, 0.5)';
  };
  const fillGradient = s => (s === 'idle' ? 'rgba(249, 247, 247, 0.35)' : '#F9F7F7');

  const seqState  = complete ? 'done' : (active ? 'pending' : 'idle');
  const poseState = fsmState === 'CAPTURING' ? 'done'
                  : fsmState === 'TRACKING'  ? 'pending'
                  : active ? 'ready' : 'idle';

  const seqName  = total ? `Sequence (${index}/${total})` : 'Sequence';
  const poseName = fsmState === 'CAPTURING' ? 'Pose (CAPTURING)'
                 : fsmState === 'TRACKING'  ? `Pose (TRACKING · ${left.toFixed(0)}s)`
                 : fsmState === 'MOVING'    ? 'Pose (MOVING)'
                 : 'Pose';

  const applyStage = (nameId, fillId, valueId, name, percent, st) => {
    const nameEl  = document.getElementById(nameId);
    const fillEl  = document.getElementById(fillId);
    const valueEl = document.getElementById(valueId);
    if (!nameEl || !fillEl || !valueEl) return;
    nameEl.textContent  = name;
    nameEl.style.color  = stateColor(st);
    fillEl.style.width  = percent + '%';
    fillEl.style.background = fillGradient(st);
    valueEl.textContent = percent + '%';
    valueEl.style.color = stateColor(st);
  };

  applyStage('camArmStageName',    'camArmProgFill',    'camArmProg',    seqName,  overall,     seqState);
  applyStage('camPresetStageName', 'camPresetProgFill', 'camPresetProg', poseName, slotPercent, poseState);
}

// ═══ Poll Detection ═══
function poll() {
  fetch('/detection').then(r => r.json()).then(d => {
    const robotConnected = d.robot && d.robot.connected;
    const gateText = robotConnected
      ? 'Waiting for activation…'
      : 'Robot offline — control panel unreachable';
    applySessionState(d.session_active, gateText);

    const seq  = d.sequence || {};
    const face = !!d.face_detected;

    // Kartu deteksi: nomor pose, status wajah, confidence, backend deteksi.
    const gNumEl  = document.getElementById('gNum');
    const gNameEl = document.getElementById('gName');
    const gConfEl = document.getElementById('gConf');
    const gMethEl = document.getElementById('gMethod');
    if (gNumEl)  {
      gNumEl.textContent = seq.index ? seq.index + '/' + seq.total : '—';
      gNumEl.classList.toggle('cyan', !!seq.index);
    }
    if (gNameEl) {
      gNameEl.textContent = face
        ? (d.tracking_active ? 'Face locked — tracking' : 'Face detected')
        : 'Searching…';
    }
    if (gConfEl) gConfEl.textContent = face ? Math.round((d.confidence || 0) * 100) + '%' : '—';
    if (gMethEl) gMethEl.textContent = d.method || '—';

    const fsm = d.fsm_state || 'IDLE';

    // Overlay "paused" saat lengan berpindah / dibekukan untuk jepretan.
    const cp = document.getElementById('camProgress');
    if (cp) cp.classList.toggle('paused', ['MOVING', 'CAPTURING'].includes(fsm));

    renderSequenceProgress(seq, fsm);

    // Pose yang sedang dituju + pose terakhir yang selesai.
    const preset = seq.preset;
    let pLabel = '—', pSub = 'No pose active';
    if (preset) {
      pLabel = 'Preset ' + preset + (seq.preset_name ? ' (' + seq.preset_name + ')' : '');
      pSub   = fsm === 'CAPTURING' ? 'Capturing' : fsm === 'MOVING' ? 'Moving to pose' : 'Holding pose';
    }
    const gPresetEl     = document.getElementById('gPreset');
    const gPresetNameEl = document.getElementById('gPresetName');
    if (gPresetEl)     gPresetEl.textContent     = pLabel;
    if (gPresetNameEl) gPresetNameEl.textContent = pSub;

    if (preset) {
      activeNumberedPreset = preset;
    } else if (activeNumberedPreset !== null) {
      previousPreset = activeNumberedPreset;
      activeNumberedPreset = null;
    }
    const gPrevEl     = document.getElementById('gPrevPreset');
    const gPrevNameEl = document.getElementById('gPrevPresetName');
    if (gPrevEl)     gPrevEl.textContent     = previousPreset ? 'Preset ' + previousPreset : '—';
    if (gPrevNameEl) gPrevNameEl.textContent = previousPreset ? 'Last completed pose' : 'No history yet';

    updateSM(fsm);
  }).catch(() => {});
}

// ═══ Start ═══
setInterval(poll, 150);
