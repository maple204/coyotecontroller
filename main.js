// --- Global Helpers ---
const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const TAU = Math.PI * 2;

// --- Biome Caretaker UI: live value label ---
function updateCaretakerIntensityLabel(){
  const sl = $("caretakerIntensity");
  const labA = $("caretakerIntensityValInline");
  if (!sl || !labA) return;
  labA.textContent = `${parseInt(sl.value || "100", 10)}%`;
}

(() => {
  "use strict";

  // --- Internal Utilities ---
  const wrapDeg = (d) => (((d % 360) + 360) % 360);
  const lerp = (a, b, t) => a + (b - a) * t;

  function expSlew(current, target, dt, tauSec) {
    if (!isFinite(current)) current = target;
    if (!isFinite(target)) return current;
    const tau = Math.max(1e-4, tauSec);
    const k = 1 - Math.exp(-dt / tau);
    return current + (target - current) * k;
  }

  function pct01(x) { return `${Math.round(clamp(x, 0, 1) * 100)}%`; }

  // -------- Constants --------
  const FMIN = 20, FMAX = 1500;
  const STORAGE_KEY = "coyoteController.v8";
  let APP_MODE = "control";
  const PHASE_UI_DISABLED = true;

  // -------- DOM Elements (Defined ONLY ONCE) --------
  const overlay = $("debugOverlay");
  const setOverlay = (msg) => { if (overlay) { overlay.textContent = String(msg ?? ""); overlay.classList.add("show"); } };
  window.addEventListener("error", (e) => setOverlay("JS Error: " + (e?.message || e)));
  window.addEventListener("unhandledrejection", (e) => setOverlay("Promise Rejection: " + (e?.reason || e)));

  const baseFreqSlider = $("baseFreqSlider");
  const baseFreqInput = $("baseFreq");
  const baseFreqVal = $("baseFreqVal");

  const masterVol = $("masterVol");
  const masterVolVal = $("masterVolVal");

  const ampSl = [$("amp1"), $("amp2"), $("amp3"), $("amp4")];
  const ampVal = [$("amp1Val"), $("amp2Val"), $("amp3Val"), $("amp4Val")];
  const multSl = [$("freqMultiplier1"), $("freqMultiplier2"), $("freqMultiplier3"), $("freqMultiplier4")];
  const multVal = [$("mult1Val"), $("mult2Val"), $("mult3Val"), $("mult4Val")];
  const phaseSl = [$("phase1"), $("phase2"), $("phase3"), $("phase4")];
  const phaseVal = [$("phase1Val"), $("phase2Val"), $("phase3Val"), $("phase4Val")];
  const cycleSl = [$("phaseCycle1"), $("phaseCycle2"), $("phaseCycle3"), $("phaseCycle4")];
  const cycleVal = [$("cycle1Val"), $("cycle2Val"), $("cycle3Val"), $("cycle4Val")];

  const snapMultBtn = [$("snap_mult1"), $("snap_mult2"), $("snap_mult3"), $("snap_mult4")];
  const snapPhaseBtn = [$("snap_phase1"), $("snap_phase2"), $("snap_phase3"), $("snap_phase4")];
  const snapCycleBtn = [$("snap_cycle1"), $("snap_cycle2"), $("snap_cycle3"), $("snap_cycle4")];

  const snapState = { mult: [true, true, true, true], phase: [true, true, true, true], cycle: [true, true, true, true] };

  const scopeCanvas = $("oscilloscope");
  const scopeCtx = scopeCanvas?.getContext("2d") || null;
  const fieldCanvas = $("fieldCanvas");
  const fieldCtx = fieldCanvas?.getContext("2d") || null;

  const visPad = $("visPad");
  const visCursorFreq = $("visCursorFreq");
  const visCursorAmp = $("visCursorAmp");

  const touchPhaseNeg = $("touchPhaseNeg");
  const touchPhasePos = $("touchPhasePos");
  const touchPhaseNegVal = $("touchPhaseNegVal");
  const touchPhasePosVal = $("touchPhasePosVal");

  const touchFreqNeg = $("touchFreqNeg");
  const touchFreqPos = $("touchFreqPos");
  const touchFreqNegVal = $("touchFreqNegVal");
  const touchFreqPosVal = $("touchFreqPosVal");
  const touchFreqInvert = $("touchFreqInvert");

  const touchAmpLow = $("touchAmpLow");
  const touchAmpHigh = $("touchAmpHigh");
  const touchAmpLowVal = $("touchAmpLowVal");
  const touchAmpHighVal = $("touchAmpHighVal");
  const touchAmpInvert = $("touchAmpInvert");

  const scriptSelect = $("scriptSelect");
  const scriptToggleBtn = $("scriptToggleBtn");
  const scriptIntensity = $("scriptIntensity");
  const scriptIntensityVal = $("scriptIntensityVal");

  const stopBtn = $("stopBtn"); 
  const monitorBtn = $("monitorBtn");
  const connectPrimaryBtn = $("connectPrimaryBtn");
  const connectSecondaryBtn = $("connectSecondaryBtn");
  const disconnectBtn = $("disconnectBtn");

  const maxDialog = $("maxDialog");
  const maxSlider = $("maxSlider");
  const maxValEl = $("maxVal");
  const maxOk = $("maxOk");
  const maxCancel = $("maxCancel");
  const maxDialogLabel = $("maxDialogLabel");
  const maxPills = [$("max_amp1"), $("max_amp2"), $("max_amp3"), $("max_amp4")];
  let maxEditingIndex = 0;

  const maxCap = [0, 0, 0, 0];

  const routeConfig = { ch1: "off", ch2: "off", ch3: "off", ch4: "off" };

  // -------- Logic Functions --------

  function setAppMode(mode) {
    APP_MODE = (mode === "biome") ? "biome" : "control";
    document.body.setAttribute("data-mode", APP_MODE);
    const modeBtn = $("modeBtn");
    if (modeBtn) modeBtn.textContent = (APP_MODE === "biome") ? "Mode: Biome" : "Mode: Control";

    if (APP_MODE === "biome") {
      if (window.BiomeEngine) {
        window.BiomeEngine.init(fieldCanvas, () => ({
          baseHz: applied.baseHz,
          chMult: multSl.map(s => parseFloat(s.value)),
          t: performance.now() / 1000
        }));
        window.BiomeEngine.setEnabled(true);
      }
    } else {
      if (window.BiomeEngine) window.BiomeEngine.setEnabled(false);
    }
  }

  stopBtn?.addEventListener("click", () => {
    if (masterVol) masterVol.value = "0";
    motion.active = false;
    if (typeof releaseCursor === 'function') releaseCursor();
    if (typeof updateScriptToggleUI === 'function') updateScriptToggleUI();
    if (typeof updateValueTexts === 'function') updateValueTexts();
    saveSettings();
    console.log("Emergency Stop Triggered");
  });

  scriptSelect?.addEventListener("change", () => {
    if (motion.active) {
      motion.scriptId = scriptSelect.value;
      motion.startSec = performance.now() / 1000;
    }
  });

  function getChannelRootFromBadge(badgeId){
    const badge = $(badgeId);
    if (!badge) return null;
    let el = badge;
    for (let i=0; i<8 && el; i++){
      if (el.classList && (el.classList.contains("channel") || el.classList.contains("panel"))) return el;
      el = el.parentElement;
    }
    return badge.closest("div") || null;
  }

function setChannelRoutedUI(chNum, routedTo) {
  const root = $("ch"+chNum+"Box") || document.querySelector(`.ch${chNum}`) || getChannelRootFromBadge("devBadge"+chNum);
  const isRouted = routedTo && routedTo !== "off";
  const unmapBtn = $("unmapCh"+chNum);
  if (unmapBtn) unmapBtn.style.display = isRouted ? "inline-block" : "none";

  if (root) {
    root.classList.toggle("channel-routed", isRouted);
    let note = root.querySelector(".routed-note");
    if (isRouted) {
      if (!note) { 
        note = document.createElement("span"); 
        note.className = "routed-note"; 
        root.querySelector("h3,h2,.chan-title")?.appendChild(note) || root.appendChild(note); 
      }
      // Fixed: Setting this to empty removes the "(Routed to...)" text
      note.textContent = ""; 
    } else {
      if (note) note.remove();
    }
  }

  // Disable common per-channel controls by id
  const ids = ["freq","amp","max","phase","phaseCycle","mute","solo"];
  for (const k of ids) {
    const el = $(k + chNum);
    if (el) el.disabled = isRouted;
  }
}

  function applyRoutingToLogical(applied){
    // applied: { freqHz[4], ampEff[4], ampReq[4], phaseRad[4] }
    // Returns {freqHz, amp, phase} logical arrays after aliasing routed channels.
    const freq = applied.freqHz.slice();
    const amp  = applied.ampEff.slice();
    const ph   = applied.phaseRad ? applied.phaseRad.slice() : [0,0,0,0];

    const pOnly = !!BT.primaryChar && !BT.secondaryChar;
    const sOnly = !!BT.secondaryChar && !BT.primaryChar;

    // Helper: alias logical dst to logical src (inherit values)
    const alias = (dst, src) => { freq[dst] = freq[src]; amp[dst] = amp[src]; ph[dst] = ph[src]; };

    if (pOnly) {
      // CH3/CH4 can be routed to CH1 or CH2 (inherit)
      if (routeConfig.ch3 === "ch1") alias(2,0);
      else if (routeConfig.ch3 === "ch2") alias(2,1);

      if (routeConfig.ch4 === "ch1") alias(3,0);
      else if (routeConfig.ch4 === "ch2") alias(3,1);
    } else if (sOnly) {
      // CH1/CH2 can be routed to CH3 or CH4 (inherit)
      if (routeConfig.ch1 === "ch3") alias(0,2);
      else if (routeConfig.ch1 === "ch4") alias(0,3);

      if (routeConfig.ch2 === "ch3") alias(1,2);
      else if (routeConfig.ch2 === "ch4") alias(1,3);
    }

    return { freq, amp, ph, pOnly, sOnly };
  }

  function mixForPhysical(logical){
    // logical: {freq[4], amp[4], ph[4], pOnly, sOnly}
    // Returns physical pairs for sending: primary=(A,B), secondary=(C,D)
    // Mixing rule: if multiple logical channels target the same physical output via routing,
    // we SUM amplitudes (clamped). Frequencies/phases are inherited (so safe to keep).
    const f = logical.freq, a = logical.amp, ph = logical.ph;

    // Determine which physical output each logical channel maps to (default identity).
    // When only one device is connected, routed channels still map to their original logical output
    // BUT we want them to play THROUGH the routed-to physical output.
    // We encode that by mapping each logical channel to a physical index 0..3.
    let map = [0,1,2,3];

    if (logical.pOnly) {
      // CH3/CH4 route to CH1/CH2 => map 2/3 onto 0/1 accordingly
      if (routeConfig.ch3 === "ch1") map[2]=0;
      else if (routeConfig.ch3 === "ch2") map[2]=1;
      if (routeConfig.ch4 === "ch1") map[3]=0;
      else if (routeConfig.ch4 === "ch2") map[3]=1;
    } else if (logical.sOnly) {
      // CH1/CH2 route to CH3/CH4 => map 0/1 onto 2/3 accordingly
      if (routeConfig.ch1 === "ch3") map[0]=2;
      else if (routeConfig.ch1 === "ch4") map[0]=3;
      if (routeConfig.ch2 === "ch3") map[1]=2;
      else if (routeConfig.ch2 === "ch4") map[1]=3;
    }

    // Initialize physical slots with their base logical channel (if any)
    const outA = { amp: 0, freq: f[0], phase: ph[0] };
    const outB = { amp: 0, freq: f[1], phase: ph[1] };
    const outC = { amp: 0, freq: f[2], phase: ph[2] };
    const outD = { amp: 0, freq: f[3], phase: ph[3] };

    const phys = [outA,outB,outC,outD];

    for (let li=0; li<4; li++){
      const pi = map[li];
      // set freq/phase to inherited one (already aliased), keep first assignment
      if (phys[pi].amp === 0) {
        phys[pi].freq = f[li];
        phys[pi].phase = ph[li];
      }
      phys[pi].amp = clamp(phys[pi].amp + a[li], 0, 1.0);
    }

    return phys;
  }

function cycleRouteValue(v, options){
    const i = options.indexOf(v);
    return options[(i + 1) % options.length];
  }


  function updateMaxPills() {
    for (let i = 0; i < 4; i++) {
      if (maxPills[i]) maxPills[i].textContent = `Max ${Math.round(maxCap[i] * 100)}%`;
    }
  }


  function setSnapPill(btn, on) {
    if (!btn) return;
    btn.classList.toggle("on", !!on);
    btn.textContent = "Snap";
  }

  function initSnapButtons() {
    for (let i = 0; i < 4; i++) {
      setSnapPill(snapMultBtn[i], snapState.mult[i]);
      setSnapPill(snapPhaseBtn[i], snapState.phase[i]);
      setSnapPill(snapCycleBtn[i], snapState.cycle[i]);

      snapMultBtn[i]?.addEventListener("click", () => {
        snapState.mult[i] = !snapState.mult[i];
        setSnapPill(snapMultBtn[i], snapState.mult[i]);
        // quantize immediately if turning on
        if (snapState.mult[i]) {
          const v = Math.round(parseFloat(multSl[i]?.value || "1"));
          if (multSl[i]) multSl[i].value = String(v);
          updateValueTexts(); saveSettings();
        }
      });

      snapPhaseBtn[i]?.addEventListener("click", () => {
        snapState.phase[i] = !snapState.phase[i];
        setSnapPill(snapPhaseBtn[i], snapState.phase[i]);
        if (snapState.phase[i]) {
          const v = Math.round(parseFloat(phaseSl[i]?.value || "0") / 45) * 45;
          if (phaseSl[i]) phaseSl[i].value = String(clamp(v, 0, 360));
          updateValueTexts(); saveSettings();
        }
      });

      snapCycleBtn[i]?.addEventListener("click", () => {
        snapState.cycle[i] = !snapState.cycle[i];
        setSnapPill(snapCycleBtn[i], snapState.cycle[i]);
        if (snapState.cycle[i]) {
          const v = Math.round(parseFloat(cycleSl[i]?.value || "0") / 45) * 45;
          if (cycleSl[i]) cycleSl[i].value = String(clamp(v, -360, 360));
          updateValueTexts(); saveSettings();
        }
      });
    }
  }

  function openMaxDialog(i) {
    maxEditingIndex = i;
    if (maxDialogLabel) maxDialogLabel.textContent = `Max for CH${i + 1}`;
    if (maxSlider) maxSlider.value = String(Math.round(maxCap[i] * 100));
    if (maxValEl) maxValEl.textContent = `${Math.round(maxCap[i] * 100)}%`;
    maxDialog?.showModal();
  }

  maxPills.forEach((pill, i) => pill?.addEventListener("click", (e) => { e.preventDefault(); openMaxDialog(i); }));

  maxSlider?.addEventListener("input", () => {
    const v = clamp(parseFloat(maxSlider.value || "0"), 0, 100);
    if (maxValEl) maxValEl.textContent = `${Math.round(v)}%`;
  });

  maxOk?.addEventListener("click", () => {
    const v = clamp(parseFloat(maxSlider?.value || "0"), 0, 100) / 100;
    maxCap[maxEditingIndex] = v;
    updateMaxPills();
    saveSettings();
    try { maxDialog?.close(); } catch { }
  });

  maxCancel?.addEventListener("click", () => { try { maxDialog?.close(); } catch { } });

  // -------- Base frequency mapping (log) --------
  function setBaseHz(hz) {
    const f = clamp(hz, FMIN, FMAX);
    if (baseFreqInput) baseFreqInput.value = String(Math.round(f));
    if (baseFreqVal) baseFreqVal.textContent = String(Math.round(f));
    const t = (Math.log(f) - Math.log(FMIN)) / (Math.log(FMAX) - Math.log(FMIN));
    if (baseFreqSlider) baseFreqSlider.value = String(Math.round(t * 1000));
  }

  baseFreqSlider?.addEventListener("input", () => {
    const t = clamp(parseFloat(baseFreqSlider.value || "0") / 1000, 0, 1);
    const f = Math.exp(Math.log(FMIN) + t * (Math.log(FMAX) - Math.log(FMIN)));
    setBaseHz(f);
    saveSettings();
  });

  baseFreqInput?.addEventListener("input", () => {
    setBaseHz(parseFloat(baseFreqInput.value || "200"));
    saveSettings();
  });

  masterVol?.addEventListener("input", () => {
    if (masterVolVal) masterVolVal.textContent = pct01(parseFloat(masterVol.value || "0"));
    saveSettings();
  });

  function sliderToCycleRateDegPerSec(v) { return clamp(v, -360, 360); }

  function updateValueTexts() {
    if (masterVolVal) masterVolVal.textContent = pct01(parseFloat(masterVol?.value || "0"));
    for (let i = 0; i < 4; i++) {
      if (ampVal[i]) ampVal[i].textContent = pct01(parseFloat(ampSl[i]?.value || "0"));
      if (multVal[i]) {
        const raw = parseFloat(multSl[i]?.value || "1");
        multVal[i].textContent = snapState.mult[i] ? `${Math.round(raw)}x` : `${raw.toFixed(2)}x`;
      }
      if (phaseVal[i]) phaseVal[i].textContent = `${Math.round(parseFloat(phaseSl[i]?.value || "0"))}°`;
      const rate = sliderToCycleRateDegPerSec(parseFloat(cycleSl[i]?.value || "0"));
      if (cycleVal[i]) cycleVal[i].textContent = `${Math.round(rate)}°/s`;
    }

    if (touchPhaseNegVal) touchPhaseNegVal.textContent = `${Math.round(parseFloat(touchPhaseNeg?.value || "0"))}°`;
    if (touchPhasePosVal) touchPhasePosVal.textContent = `${Math.round(parseFloat(touchPhasePos?.value || "0"))}°`;

    if (touchFreqNegVal) touchFreqNegVal.textContent = `${parseFloat(touchFreqNeg?.value || "0").toFixed(2)}x`;
    if (touchFreqPosVal) touchFreqPosVal.textContent = `${parseFloat(touchFreqPos?.value || "0").toFixed(2)}x`;

    if (touchAmpLowVal) {
      const raw = clamp(parseFloat(touchAmpLow?.value || "100"), 0, 100);
      const eff = 100 - raw;
      touchAmpLowVal.textContent = `${Math.round(eff)}%`;
    }
    if (touchAmpHighVal) touchAmpHighVal.textContent = `${Math.round(parseFloat(touchAmpHigh?.value || "100"))}%`;
  }

  // Alias used by nudge/gamepad helpers (older builds referenced this name)
  function updateUIFromTargets() { updateValueTexts(); }


  
  // -------- Click-to-reset labels (range sliders) --------
  function initClickResetLabels() {
    const labels = document.querySelectorAll('label[for]');
    labels.forEach((lab) => {
      const id = lab.getAttribute('for');
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      if (el.tagName !== 'INPUT') return;
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (type !== 'range') return;

      // Only attach once
      if (lab.dataset.resetBound === '1') return;
      lab.dataset.resetBound = '1';

      lab.classList.add('click-reset');
      lab.addEventListener('click', (ev) => {
        // If user is selecting text or interacting with nested controls, ignore
        if (ev.target && ev.target.tagName === 'INPUT') return;
        // Reset to defaultValue (HTML attribute value)
        const def = el.defaultValue;
        if (def == null) return;
        el.value = String(def);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
  }

// Persist on any input (excluding snapped sliders; those are handled with a unified handler below)
  const persistOnInput = (el) => el?.addEventListener("input", () => {
    queueMicrotask(() => { updateValueTexts(); saveSettings(); });
  });
  [
    masterVol, ...ampSl,
    touchPhaseNeg, touchPhasePos, touchFreqNeg, touchFreqPos,
    touchFreqInvert, touchAmpLow, touchAmpHigh, touchAmpInvert
  ].forEach(persistOnInput);

  // Unified handlers for sliders that may snap: quantize FIRST, then update/save so output reflects the snapped value.
  for (let i = 0; i < 4; i++) {
    multSl[i]?.addEventListener("input", () => {
      let v = parseFloat(multSl[i].value || "1");
      if (snapState.mult[i]) v = Math.round(v);
      v = clamp(v, 1, 6);
      multSl[i].value = String(v);
      queueMicrotask(() => { updateValueTexts(); saveSettings(); });
    });

    phaseSl[i]?.addEventListener("input", () => {
      let v = parseFloat(phaseSl[i].value || "0");
      // Allow reaching the right edge reliably (some browsers report 359-ish at the end).
      if (v >= 359) v = 360;

      if (snapState.phase[i]) {
        v = Math.round(v / 45) * 45;
        v = clamp(v, 0, 360);
      } else {
        v = clamp(v, 0, 360);
      }
      phaseSl[i].value = String(v);
      queueMicrotask(() => { updateValueTexts(); saveSettings(); });
    });

    cycleSl[i]?.addEventListener("input", () => {
      let v = parseFloat(cycleSl[i].value || "0");
      if (snapState.cycle[i]) v = Math.round(v / 45) * 45;
      v = clamp(v, -360, 360);
      cycleSl[i].value = String(v);
      queueMicrotask(() => { updateValueTexts(); saveSettings(); });
    });
  }

  // -------- Storage --------
  function loadSettings() {
    try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return null; return JSON.parse(raw); } catch { return null; }
  }
  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(collectSettings())); } catch { }
  }

  function applySettings(s) {
    if (!s) return;
    setBaseHz(s.baseHz ?? 200);
    if (masterVol) masterVol.value = "0"; // safety
    if (Array.isArray(s.ampTrim)) s.ampTrim.forEach((v, i) => { if (ampSl[i]) ampSl[i].value = String(v ?? 0); });
    if (Array.isArray(s.mult)) s.mult.forEach((v, i) => { if (multSl[i]) multSl[i].value = String(v ?? 1); });
    if (Array.isArray(s.phaseDeg)) s.phaseDeg.forEach((v, i) => { if (phaseSl[i]) phaseSl[i].value = String(v ?? 0); });
    if (Array.isArray(s.cycleSlider)) s.cycleSlider.forEach((v, i) => { if (cycleSl[i]) cycleSl[i].value = String(v ?? 0); });
    if (Array.isArray(s.maxCap)) s.maxCap.forEach((v, i) => { maxCap[i] = clamp(parseFloat(v ?? 0), 0, 1); });

    if (touchPhaseNeg) touchPhaseNeg.value = String(clamp(parseFloat(s.touchPhaseNeg ?? 0), 0, 360));
    if (touchPhasePos) touchPhasePos.value = String(clamp(parseFloat(s.touchPhasePos ?? 0), 0, 360));
    if (touchFreqNeg) touchFreqNeg.value = String(clamp(parseFloat(s.touchFreqNeg ?? 0), 0, 4));
    if (touchFreqPos) touchFreqPos.value = String(clamp(parseFloat(s.touchFreqPos ?? 0), 0, 4));
    if (touchFreqInvert) touchFreqInvert.checked = !!s.touchFreqInvert;
    if (touchAmpLow) touchAmpLow.value = String(clamp(parseFloat(s.touchAmpLow ?? 100), 0, 100));
    if (touchAmpHigh) touchAmpHigh.value = String(clamp(parseFloat(s.touchAmpHigh ?? 100), 100, 200));
    if (touchAmpInvert) touchAmpInvert.checked = !!s.touchAmpInvert;

    // routing
    routeConfig.ch1 = (s.routeCh1 || "off");
    routeConfig.ch2 = (s.routeCh2 || "off");
    routeConfig.ch3 = (s.routeCh3 || "off");
    routeConfig.ch4 = (s.routeCh4 || "off");

    updateMaxPills();
    updateValueTexts();
  }

  function collectSettings() {
    return {
      baseHz: clamp(parseFloat(baseFreqInput?.value || "200"), FMIN, FMAX),
      master: 0, // always start 0 on load
      ampTrim: ampSl.map(s => clamp(parseFloat(s?.value || "0"), 0, 1)),
      maxCap: [...maxCap],
      mult: multSl.map(s => clamp(parseFloat(s?.value || "1"), 1, 6)),
      phaseDeg: phaseSl.map(s => wrapDeg(parseFloat(s?.value || "0"))),
      cycleSlider: cycleSl.map(s => clamp(parseFloat(s?.value || "0"), -360, 360)),

      touchPhaseNeg: clamp(parseFloat(touchPhaseNeg?.value || "0"), 0, 360),
      touchPhasePos: clamp(parseFloat(touchPhasePos?.value || "0"), 0, 360),
      touchFreqNeg: clamp(parseFloat(touchFreqNeg?.value || "0"), 0, 4),
      touchFreqPos: clamp(parseFloat(touchFreqPos?.value || "0"), 0, 4),
      touchFreqInvert: !!touchFreqInvert?.checked,
      touchAmpLow: clamp(parseFloat(touchAmpLow?.value || "100"), 0, 100),
      touchAmpHigh: clamp(parseFloat(touchAmpHigh?.value || "100"), 100, 200),
      touchAmpInvert: !!touchAmpInvert?.checked,
    };
  }

  // -------- Touch pad control (mouse drives all modifiers) --------
  const controlTargets = {
    x: 0, y: 0,       // freq/phase stick
    ax: 0, ay: 0,     // amp stick
    dragging: false,
  };
  const controlApplied = { x: 0, y: 0, ax: 0, ay: 0 };

  // -------- Gamepad (8BitDo Pro 2 via standard Gamepad API) --------
  // Right stick -> freq/phase stick (x/y). Left stick -> amp stick (ax/ay).
  // Start button -> STOP.
  // L1/R1 nudge master down/up. L2/R2 nudge base frequency down/up.
  // Face buttons select active channel: Y=CH1, X=CH2, B=CH3, A=CH4.
  // D-pad left/right nudge selected channel frequency multiplier.
  // D-pad up/down nudge selected channel amplitude.
  // P2 shifts selected channel phase left, P1 shifts phase right.
  const gamepad = {
    connected: false,
    index: null,
    deadzone: 0.10,
    lastButtons: [],
    activeUntilSec: 0
  };
  let selectedCh = 0;

  const NUDGE_MASTER = 0.01; // 1%
  const NUDGE_BASE_HZ = 5;   // 5 Hz
  const NUDGE_AMP = 0.01;    // 1%
  const NUDGE_PHASE = 5;     // 5 degrees
  const NUDGE_MULT = 0.05;   // 0.05x

  function gpAxis(gp, i) {
    const v = (gp.axes && gp.axes.length > i) ? gp.axes[i] : 0;
    return Math.abs(v) < gamepad.deadzone ? 0 : clamp(v, -1, 1);
  }
  function gpPressed(gp, i) {
    const b = gp.buttons && gp.buttons[i];
    return !!(b && (b.pressed || b.value > 0.5));
  }
  function gpJustPressed(gp, i) {
    const now = gpPressed(gp, i);
    const prev = !!gamepad.lastButtons[i];
    gamepad.lastButtons[i] = now;
    return now && !prev;
  }

  function nudgeMaster(delta) {
    if (!masterVol) return;
    const v = clamp(parseFloat(masterVol.value) + delta, 0, 1);
    masterVol.value = String(v);
    updateUIFromTargets();
    saveSettings();
  }
  function nudgeBaseHz(deltaHz) {
    if (!baseFreqSlider) return;
    const v = clamp(parseFloat(baseFreqSlider.value) + deltaHz, 20, 1500);
    baseFreqSlider.value = String(v);
    if (baseFreqInput) baseFreqInput.value = String(Math.round(v));
    updateUIFromTargets();
    saveSettings();
  }
  function nudgeChAmp(ch, delta) {
    const sl = ampSl[ch];
    if (!sl) return;
    sl.value = String(clamp(parseFloat(sl.value) + delta, 0, 1));
    updateUIFromTargets();
    saveSettings();
  }
  function nudgeChMult(ch, delta) {
    const sl = multSl[ch];
    if (!sl) return;
    sl.value = String(clamp(parseFloat(sl.value) + delta, 1, 6));
    updateUIFromTargets();
    saveSettings();
  }
  function nudgeChPhase(ch, deltaDeg) {
    const sl = phaseSl[ch];
    if (!sl) return;
    sl.value = String(clamp(parseFloat(sl.value) + deltaDeg, 0, 360));
    updateUIFromTargets();
    saveSettings();
  }

  function getPaddleIndices(gp) {
    // Some browsers expose back paddles as extra buttons at the end.
    // Fallback to L3/R3 if paddles aren't present.
    const n = gp.buttons ? gp.buttons.length : 0;
    const p2 = (n >= 18) ? (n - 2) : 10; // P2 (phase left)
    const p1 = (n >= 18) ? (n - 1) : 11; // P1 (phase right)
    return { p2, p1 };
  }

  function pollGamepad(nowSec) {
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = (gamepad.index != null) ? gps[gamepad.index] : (gps && gps[0]);
    if (!gp) return;

    if (!gamepad.connected) {
      gamepad.connected = true;
      gamepad.index = gp.index;
    }

    const lx = gpAxis(gp, 0);
    const ly = gpAxis(gp, 1);
    const rx = gpAxis(gp, 2);
    const ry = gpAxis(gp, 3);

    const anyAxis = (lx || ly || rx || ry);
    if (anyAxis && !controlTargets.dragging) {
      // Right stick: freq/phase (y inverted so up is +)
      controlTargets.x = rx;
      controlTargets.y = -ry;
      // Left stick: amp
      controlTargets.ax = lx;
      controlTargets.ay = -ly;
      gamepad.activeUntilSec = nowSec + 0.25;
    }

    // START => STOP
    if (gpJustPressed(gp, 9)) stopBtn?.click();

    // Master/base nudges
    if (gpPressed(gp, 4)) nudgeMaster(-NUDGE_MASTER); // L1
    if (gpPressed(gp, 5)) nudgeMaster(+NUDGE_MASTER); // R1
    if (gpPressed(gp, 6)) nudgeBaseHz(-NUDGE_BASE_HZ); // L2
    if (gpPressed(gp, 7)) nudgeBaseHz(+NUDGE_BASE_HZ); // R2

    // Select channel with face buttons
    if (gpJustPressed(gp, 3)) selectedCh = 0; // Y
    if (gpJustPressed(gp, 2)) selectedCh = 1; // X
    if (gpJustPressed(gp, 1)) selectedCh = 2; // B
    if (gpJustPressed(gp, 0)) selectedCh = 3; // A

    // D-pad per-channel nudges
    if (gpPressed(gp, 14)) nudgeChMult(selectedCh, -NUDGE_MULT); // left
    if (gpPressed(gp, 15)) nudgeChMult(selectedCh, +NUDGE_MULT); // right
    if (gpPressed(gp, 12)) nudgeChAmp(selectedCh, +NUDGE_AMP);   // up
    if (gpPressed(gp, 13)) nudgeChAmp(selectedCh, -NUDGE_AMP);   // down

    // Paddles: phase left/right (disabled)
    if (!PHASE_UI_DISABLED) {
      const { p2, p1 } = getPaddleIndices(gp);
      if (gpPressed(gp, p2)) nudgeChPhase(selectedCh, -NUDGE_PHASE);
      if (gpPressed(gp, p1)) nudgeChPhase(selectedCh, +NUDGE_PHASE);
    }
  }



  function setCursorTargetFromEvent(ev) {
    if (!visPad) return;
    const r = visPad.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / Math.max(1, r.width));
    const py = ((ev.clientY - r.top) / Math.max(1, r.height));
    // map to [-1, +1] with y up
    const x = px * 2 - 1;
    const y = (1 - py) * 2 - 1;
    // constrain to unit circle for "stick" feel
    const mag = Math.hypot(x, y);
    if (mag > 1) {
      controlTargets.x = x / mag;
      controlTargets.y = y / mag;
    } else {
      controlTargets.x = x;
      controlTargets.y = y;
    }
    // Driving BOTH sticks from one touch
    controlTargets.ax = controlTargets.x;
    controlTargets.ay = controlTargets.y;
  }

  visPad?.addEventListener("pointerdown", (ev) => {
    controlTargets.dragging = true;
    visPad.setPointerCapture(ev.pointerId);
    setCursorTargetFromEvent(ev);
  });
  visPad?.addEventListener("pointermove", (ev) => {
    if (!controlTargets.dragging) return;
    setCursorTargetFromEvent(ev);
  });
  function releaseCursor() {
    controlTargets.dragging = false;
    controlTargets.x = 0;
      controlTargets.y = 0;
      controlTargets.ax = 0;
      controlTargets.ay = 0;
  }
  visPad?.addEventListener("pointerup", () => releaseCursor());
  visPad?.addEventListener("pointercancel", () => releaseCursor());
  visPad?.addEventListener("pointerleave", (ev) => {
    // if pointer leaves while dragging, keep until pointerup (common on trackpads)
    // no-op
  });

  // -------- Channel colors --------
  const chColors = [
    { r: 0, g: 170, b: 255 },
    { r: 255, g: 80, b: 80 },
    { r: 80, g: 255, b: 140 },
    { r: 255, g: 210, b: 80 },
  ];
  const chStroke = ["rgba(0,170,255,0.90)", "rgba(255,80,80,0.90)", "rgba(80,255,140,0.90)", "rgba(255,210,80,0.90)"];

  // -------- Modifier math --------
  const cornerVecs = [
    norm2(-1, +1), // CH1 TL
    norm2(+1, +1), // CH2 TR
    norm2(-1, -1), // CH3 BL
    norm2(+1, -1), // CH4 BR
  ];
  function norm2(x, y) {
    const m = Math.hypot(x, y) || 1;
    return { x: x / m, y: y / m };
  }

  function computeWeights(x, y) {
    // Continuous corner weights (analog-stick friendly).
    // x,y in [-1..1] (already circle-normalized upstream). No hard quadrant boundaries.
    const r = clamp(Math.hypot(x, y), 0, 1);

    // strength shaping for nicer center feel
    const gamma = 1.7;
    const s = Math.pow(r, gamma);

    // Bilinear corner weights over the square, continuous everywhere.
    // TL=CH1, TR=CH2, BL=CH3, BR=CH4
    const xn = clamp(x, -1, 1);
    const yn = clamp(y, -1, 1);

    const wTL = (1 - xn) * (1 + yn) * 0.25;
    const wTR = (1 + xn) * (1 + yn) * 0.25;
    const wBL = (1 - xn) * (1 - yn) * 0.25;
    const wBR = (1 + xn) * (1 - yn) * 0.25;

    const sum = (wTL + wTR + wBL + wBR) || 1;
    const w = [wTL / sum, wTR / sum, wBL / sum, wBR / sum];

    return { r, s, w };
  }

  function cyclesForHz(hz) {
    const f = clamp(hz, FMIN, FMAX);
    const t = (f - FMIN) / (FMAX - FMIN);
    return 2 + 10 * t;
  }

  // Visual-only lambda count for field: 2 @ 20Hz, 12 @ 1500Hz
  function lambdasForHz(hz) {
    // Visual only: keep the field readable.
    // Map 20Hz -> 1 lambda, 1500Hz -> 6 lambdas (log scale), clamped.
    const f = clamp(hz, FMIN, FMAX);
    const t = (Math.log(f) - Math.log(FMIN)) / (Math.log(FMAX) - Math.log(FMIN));
    return 1 + 5 * t; // 1..6
  }

  // -------- Output targets + applied (smoothed) --------
  const applied = {
    master: 0,
    baseHz: 200,

    ampTrim: [0, 0, 0, 0],
    mult: [1, 1, 1, 1],
    phaseDeg: [0, 0, 0, 0],
    cycleDegPerSec: [0, 0, 0, 0],
    cycleAccumDeg: [0, 0, 0, 0],

    // touch ranges
    touchPhaseNeg: 0,
    touchPhasePos: 0,
    touchFreqNeg: 0,
    touchFreqPos: 0,
    touchAmpLow: 1.0,
    touchAmpHigh: 1.0,

    // computed per-channel (smoothed for audio + BT)
    ampReq: [0,0,0,0],
    ampEff: [0,0,0,0],
    freqHz: [200, 200, 200, 200],
    phaseRad: [0, 0, 0, 0],
  };

  function readTargetsFromDOM() {
    return {
      master: clamp(parseFloat(masterVol?.value || "0"), 0, 1),
      baseHz: clamp(parseFloat(baseFreqInput?.value || "200"), FMIN, FMAX),
      ampTrim: ampSl.map(s => clamp(parseFloat(s?.value || "0"), 0, 1)),
      mult: multSl.map(s => clamp(parseFloat(s?.value || "1"), 1, 6)),
      phaseDeg: phaseSl.map(s => wrapDeg(parseFloat(s?.value || "0"))),
      cycleDegPerSec: cycleSl.map(s => sliderToCycleRateDegPerSec(parseFloat(s?.value || "0"))),

      touchPhaseNeg: clamp(parseFloat(touchPhaseNeg?.value || "0"), 0, 360),
      touchPhasePos: clamp(parseFloat(touchPhasePos?.value || "0"), 0, 360),
      touchFreqNeg: clamp(parseFloat(touchFreqNeg?.value || "0"), 0, 4),
      touchFreqPos: clamp(parseFloat(touchFreqPos?.value || "0"), 0, 4),
      touchFreqInvert: !!touchFreqInvert?.checked,

      touchAmpLow: clamp((100 - clamp(parseFloat(touchAmpLow?.value || "100"), 0, 100)) / 100, 0, 1),
      touchAmpHigh: clamp(parseFloat(touchAmpHigh?.value || "100") / 100, 1, 2),
      touchAmpInvert: !!touchAmpInvert?.checked,
    };
  }

  function updateApplied(dt, nowSec) {
    const t = readTargetsFromDOM();

    if (PHASE_UI_DISABLED) {
      // Hard-disable phase in control mode for now.
      t.phaseDeg = [0,0,0,0];
      t.cycleDegPerSec = [0,0,0,0];
      t.touchPhaseNeg = 0;
      t.touchPhasePos = 0;
    }

    // Ease "base" user parameters
    applied.master = expSlew(applied.master, t.master, dt, 0.05);
    applied.baseHz = expSlew(applied.baseHz, t.baseHz, dt, 0.10);

    for (let i = 0; i < 4; i++) {
      applied.ampTrim[i] = expSlew(applied.ampTrim[i], t.ampTrim[i], dt, 0.08);
      applied.mult[i] = expSlew(applied.mult[i], t.mult[i], dt, 0.12);
      applied.phaseDeg[i] = expSlew(applied.phaseDeg[i], t.phaseDeg[i], dt, 0.12);
      applied.cycleDegPerSec[i] = expSlew(applied.cycleDegPerSec[i], t.cycleDegPerSec[i], dt, 0.20);
    }

    // Ease touch depth ranges too (so changes never "snap" mid-session)
    applied.touchPhaseNeg = expSlew(applied.touchPhaseNeg, t.touchPhaseNeg, dt, 0.20);
    applied.touchPhasePos = expSlew(applied.touchPhasePos, t.touchPhasePos, dt, 0.20);
    applied.touchFreqNeg = expSlew(applied.touchFreqNeg, t.touchFreqNeg, dt, 0.25);
    applied.touchFreqPos = expSlew(applied.touchFreqPos, t.touchFreqPos, dt, 0.25);
    applied.touchAmpLow = expSlew(applied.touchAmpLow, t.touchAmpLow, dt, 0.25);
    applied.touchAmpHigh = expSlew(applied.touchAmpHigh, t.touchAmpHigh, dt, 0.25);
    
    // --- Biome audio override ---
    if (APP_MODE === "biome" && window.BiomeEngine && typeof window.BiomeEngine.getAudioOutputs === "function") {
      try {
        if (visCursorFreq) visCursorFreq.style.display = "none";
        if (visCursorAmp) visCursorAmp.style.display = "none";

        const bio = window.BiomeEngine.getAudioOutputs();
        const bioAmp = (bio && bio.amp) ? bio.amp : null;
        const bioFreq = (bio && bio.freq) ? bio.freq : null;
        const bioPhase = (bio && bio.phase) ? bio.phase : null;

        if (bioAmp && bioFreq && bioPhase) {
          for (let i = 0; i < 4; i++) {
            const cap = Math.max(1e-6, maxCap[i] || 1);
            const targetAmp = clamp((bioAmp[i] || 0) * applied.master * applied.ampTrim[i], 0, cap);
            const targetFreq = clamp((bioFreq[i] || (applied.baseHz * (i + 1))), FMIN, FMAX);
            const targetPhase = (bioPhase[i] != null) ? bioPhase[i] : applied.phaseRad[i];

            applied.ampReq[i] = expSlew(applied.ampReq[i], targetAmp, dt, 0.04);
            applied.ampEff[i] = expSlew(applied.ampEff[i], targetAmp, dt, 0.04);
            applied.freqHz[i] = expSlew(applied.freqHz[i], targetFreq, dt, 0.08);
            applied.phaseRad[i] = expSlew(applied.phaseRad[i], targetPhase, dt, 0.06);

            const targetPhaseDeg = (applied.phaseRad[i] * 180 / Math.PI) % 360;
            applied.phaseDeg[i] = expSlew(applied.phaseDeg[i], targetPhaseDeg, dt, 0.10);
          }
          return; 
        }
      } catch (e) {}
    }


    // Smooth cursor (spring back on release)
    const cursorTau = controlTargets.dragging ? 0.03 : 0.10;
    controlApplied.x  = expSlew(controlApplied.x,  controlTargets.x,  dt, cursorTau);
    controlApplied.y  = expSlew(controlApplied.y,  controlTargets.y,  dt, cursorTau);
    controlApplied.ax = expSlew(controlApplied.ax, controlTargets.ax, dt, cursorTau);
    controlApplied.ay = expSlew(controlApplied.ay, controlTargets.ay, dt, cursorTau);

    // Update cursor element positions from APPLIED sticks
    if (visPad) {
      const r = visPad.getBoundingClientRect();
      const setDot = (el, x, y, z) => {
        if (!el) return;
        el.style.display = "block";
        if (z != null) el.style.zIndex = String(z);
        const px = (x + 1) * 0.5;
        const py = 1 - (y + 1) * 0.5;
        el.style.left = `${px * r.width}px`;
        el.style.top  = `${py * r.height}px`;
      };
      setDot(visCursorFreq, controlApplied.x,  controlApplied.y, 5);
      setDot(visCursorAmp,  controlApplied.ax, controlApplied.ay, 6);
    }

    // Compute per-channel modifiers from cursor
    const fp = computeWeights(controlApplied.x, controlApplied.y);
    const ap = computeWeights(controlApplied.ax, controlApplied.ay);
    const s = fp.s;
    const w = fp.w;
    const sa = ap.s;
    const wa = ap.w;
    const eps = 1e-6;
    const freqInvert = !!t.touchFreqInvert;
    const ampInvert = !!t.touchAmpInvert;

    for (let i = 0; i < 4; i++) {
      const p = w[i]; // 0..1
      const signed = (s < 1e-6) ? 0 : (2 * p - 1) * s; // [-s..+s], scaled by strength

      // Phase offset (deg)
      const phaseShiftDeg = signed >= 0
        ? signed * applied.touchPhasePos
        : signed * applied.touchPhaseNeg;

      // Frequency shift (units), optional invert
      let freqUnits = signed >= 0
        ? signed * applied.touchFreqPos
        : signed * applied.touchFreqNeg;
      if (freqInvert) freqUnits = -freqUnits;

      // Amplitude scale (driven by amp stick), optional invert
      const pa = wa[i];
      const signedA = (sa < 1e-6) ? 0 : (2 * pa - 1) * sa;
      let ampScale;
      if (!ampInvert) {
        ampScale = signedA >= 0
          ? lerp(1.0, applied.touchAmpHigh, signedA / (sa + eps))
          : lerp(1.0, applied.touchAmpLow, (-signedA) / (sa + eps));
      } else {
        ampScale = signedA >= 0
          ? lerp(1.0, applied.touchAmpLow, signedA / (sa + eps))
          : lerp(1.0, applied.touchAmpHigh, (-signedA) / (sa + eps));
      }
      ampScale = clamp(ampScale, 0, 2);

      // Compose base freq per channel
      const baseF = applied.baseHz * clamp(applied.mult[i], 1, 6);

      // Exponential ratio shift (octave-like)
      const ratio = Math.pow(2, freqUnits);
      const targetFreq = clamp(baseF * ratio, FMIN, FMAX);

      // Phase: base + touch + cycle
      // Advance phase cycle accumulator (deg) without wrap discontinuities
      applied.cycleAccumDeg[i] += applied.cycleDegPerSec[i] * dt;
      // keep within reasonable range
      if (applied.cycleAccumDeg[i] > 1e6 || applied.cycleAccumDeg[i] < -1e6) applied.cycleAccumDeg[i] = wrapDeg(applied.cycleAccumDeg[i]);
      const targetPhaseDeg = applied.phaseDeg[i] + phaseShiftDeg + applied.cycleAccumDeg[i];

      // Target amplitude (clamped by maxCap)
      const reqAmp = (applied.master * applied.ampTrim[i] * ampScale);
      applied.ampReq[i] = expSlew(applied.ampReq[i], reqAmp, dt, 0.04);
      const targetAmp = clamp(reqAmp, 0, maxCap[i]);

      // Smooth per-channel effective params (audio/BT stability)
      applied.ampEff[i] = expSlew(applied.ampEff[i], targetAmp, dt, 0.04);
      applied.freqHz[i] = expSlew(applied.freqHz[i], targetFreq, dt, 0.08);

      // Phase smoothing (in radians) via slewed degrees
      const targetRad = targetPhaseDeg * Math.PI / 180;
      applied.phaseRad[i] = expSlew(applied.phaseRad[i], targetRad, dt, 0.10);
    }
  }

  // -------- Scope drawing --------
  function drawScope() {
    if (!scopeCanvas || !scopeCtx) return;
    const w = scopeCanvas.clientWidth | 0, h = scopeCanvas.clientHeight | 0;
    if (w <= 0 || h <= 0) return;
    if (scopeCanvas.width !== w) scopeCanvas.width = w;
    if (scopeCanvas.height !== h) scopeCanvas.height = h;

    scopeCtx.fillStyle = "#0d0d0d";
    scopeCtx.fillRect(0, 0, w, h);

    scopeCtx.strokeStyle = "rgba(255,255,255,0.10)";
    scopeCtx.lineWidth = 1;
    scopeCtx.beginPath();
    scopeCtx.moveTo(10, h / 2);
    scopeCtx.lineTo(w - 10, h / 2);
    scopeCtx.stroke();

    const baseHz = applied.baseHz;
    const cycles = cyclesForHz(baseHz);
    const T = cycles / baseHz;
    const N = 800;
    const dt = T / (N - 1);

    for (let ch = 0; ch < 4; ch++) {
      const cap = Math.max(1e-6, maxCap[ch]);
      const amp = clamp(applied.ampReq[ch] / cap, 0, 1);
      const ph = applied.phaseRad[ch];
      const f = applied.freqHz[ch];

      scopeCtx.strokeStyle = chStroke[ch];
      scopeCtx.lineWidth = 2;
      scopeCtx.beginPath();
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * (w - 20) + 10;
        const tt = i * dt;
        const yv = amp * Math.sin(2 * Math.PI * f * tt + ph);
        const y = h / 2 - yv * (h * 0.35);
        if (i === 0) scopeCtx.moveTo(x, y);
        else scopeCtx.lineTo(x, y);
      }
      scopeCtx.stroke();
    }
  }

  // -------- Spectrum drawing (Biome mode) --------
  const _specHist = new Float32Array(64);
  let _specHistIdx = 0;

  function drawSpectrum(dt) {
    if (!scopeCanvas || !scopeCtx) return;
    const w = scopeCanvas.clientWidth | 0, h = scopeCanvas.clientHeight | 0;
    if (w <= 0 || h <= 0) return;
    if (scopeCanvas.width !== w) scopeCanvas.width = w;
    if (scopeCanvas.height !== h) scopeCanvas.height = h;

    scopeCtx.fillStyle = "#0d0d0d";
    scopeCtx.fillRect(0, 0, w, h);

    const fLo = 20, fHi = 1500;
    const logLo = Math.log(fLo), logHi = Math.log(fHi);
    const getX = (f) => 10 + ((Math.log(clamp(f, fLo, fHi)) - logLo) / (logHi - logLo)) * (w - 20);
    const chColors = ["rgba(0,170,255,0.7)", "rgba(255,80,80,0.7)", "rgba(80,255,140,0.7)", "rgba(255,210,80,0.7)"];

    for (let i = 0; i < 4; i++) {
      const amp = applied.ampEff[i];
      if (amp < 0.005) continue;
      const centerX = getX(applied.freqHz[i]);
      const peakH = amp * h * 0.75;
      
      scopeCtx.beginPath();
      scopeCtx.strokeStyle = chColors[i];
      scopeCtx.lineWidth = 3;
      
      const spread = 35 * (1 + amp); 
      const res = 16;
      for (let j = -res; j <= res; j++) {
        const dx = (j / res) * spread;
        const x = centerX + dx;
        const weight = Math.exp(-Math.pow(dx / (spread * 0.5), 2));
        const y = (h - 20) - (weight * peakH);
        if (j === -res) scopeCtx.moveTo(x, h - 20); else scopeCtx.lineTo(x, y);
      }
      scopeCtx.stroke();
      scopeCtx.fillStyle = "white";
      scopeCtx.beginPath(); scopeCtx.arc(centerX, (h - 20) - peakH, 3, 0, TAU); scopeCtx.fill();
    }
    scopeCtx.fillStyle = "rgba(255,255,255,0.2)";
    scopeCtx.font = "10px Arial";
    scopeCtx.fillText("20Hz", 10, h - 5);
    scopeCtx.fillText("1.5kHz", w - 40, h - 5);
    scopeCtx.fillText("Biome Spectrum", 12, 16);
  }

  // -------- Field rendering (v6 source) --------
let GRID_N = 101;
let FIELD_OFF_W = 220;
let FIELD_OFF_H = 220;
let FIELD_QUALITY = 0.65; 
let fieldImg = null; 
let fieldImgData = null; 
let fieldFrameMsEMA = 16;
let fieldZ = new Float32Array(GRID_N * GRID_N);
let fieldU = new Float32Array(GRID_N * GRID_N);

function ensureFieldBuffers(viewW, viewH) {
  const dpr = window.devicePixelRatio || 1;
  const targetGrid = clamp(Math.round(Math.min(viewW, viewH) * dpr * FIELD_QUALITY), 180, 420);
  if (targetGrid !== GRID_N) {
    GRID_N = targetGrid;
    fieldZ = new Float32Array(GRID_N * GRID_N);
    fieldU = new Float32Array(GRID_N * GRID_N);
  }
  const targetW = clamp(Math.round(viewW * dpr * FIELD_QUALITY), 240, 900);
  const targetH = clamp(Math.round(viewH * dpr * FIELD_QUALITY), 240, 900);
  if (targetW !== FIELD_OFF_W || targetH !== FIELD_OFF_H) {
    FIELD_OFF_W = targetW; FIELD_OFF_H = targetH;
    offField.width = FIELD_OFF_W; offField.height = FIELD_OFF_H;
    fieldImg = offFieldCtx.createImageData(FIELD_OFF_W, FIELD_OFF_H);
    fieldImgData = fieldImg.data;
  }
}
let uMaxSmooth = 1e-6;
const FIELD_DRIFT_HZ = 0.0625; 
let strobePhase = 0;
const VIS_BRIGHT = 0.05/255; const VIS_CONTRAST = 1.75; const VIS_SAT = 1.65;

const offField = document.createElement("canvas");
offField.width = FIELD_OFF_W; offField.height = FIELD_OFF_H;
const offFieldCtx = offField.getContext("2d", { alpha: false });
offFieldCtx.imageSmoothingEnabled = true;

function sampleBilinear(arr, x, y) {
  const fx = clamp(x, 0, 1) * (GRID_N - 1);
  const fy = clamp(y, 0, 1) * (GRID_N - 1);
  const i = Math.floor(fx), j = Math.floor(fy);
  const i2 = Math.min(GRID_N - 1, i + 1);
  const j2 = Math.min(GRID_N - 1, j + 1);
  const tx = fx - i, ty = fy - j;
  const a0 = lerp(arr[j * GRID_N + i], arr[j * GRID_N + i2], tx);
  const a1 = lerp(arr[j2 * GRID_N + i], arr[j2 * GRID_N + i2], tx);
  return lerp(a0, a1, ty);
}

const VIS_K0 = 14; const VIS_FREF = 50; const VIS_K_MIN = 8; const VIS_K_MAX = 120;

function computeField(useStrobe, dt) {
  const k = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const f = clamp(applied.freqHz[c], FMIN, FMAX);
    k[c] = clamp(VIS_K0 * Math.sqrt(f / VIS_FREF), VIS_K_MIN, VIS_K_MAX);
  }
  const ph = applied.phaseRad; const a = applied.ampEff; const s = useStrobe ? (-strobePhase) : 0;
  let umax = 1e-6;
  for (let j = 0; j < GRID_N; j++) {
    const uy = j / (GRID_N - 1);
    for (let i = 0; i < GRID_N; i++) {
      const ux = i / (GRID_N - 1);
      const d1 = Math.hypot(ux - 0, uy - 0); const d2 = Math.hypot(ux - 1, uy - 0);
      const d3 = Math.hypot(ux - 0, uy - 1); const d4 = Math.hypot(ux - 1, uy - 1);
      const z = a[0] * Math.sin(k[0] * d1 + ph[0] + s) + a[1] * Math.sin(k[1] * d2 + ph[1] + s) + a[2] * Math.sin(k[2] * d3 + ph[2] + s) + a[3] * Math.sin(k[3] * d4 + ph[3] + s);
      const idx = j * GRID_N + i; fieldZ[idx] = z; const u = z * z; fieldU[idx] = u; if (u > umax) umax = u;
    }
  }
  uMaxSmooth = expSlew(uMaxSmooth, umax, dt, 0.20);
}

function renderFieldRich(dt) {
  if (!fieldCanvas || !fieldCtx) return;
  const w = fieldCanvas.clientWidth | 0, h = fieldCanvas.clientHeight | 0;
  if (w <= 0 || h <= 0) return;
  const dpr = window.devicePixelRatio || 1;
  const cw = Math.max(1, Math.round(w * dpr));
  const ch = Math.max(1, Math.round(h * dpr));
  if (fieldCanvas.width !== cw) fieldCanvas.width = cw;
  if (fieldCanvas.height !== ch) fieldCanvas.height = ch;
  fieldCtx.setTransform(1, 0, 0, 1, 0, 0); fieldCtx.scale(dpr, dpr); ensureFieldBuffers(w, h);
  const img = fieldImg; const data = fieldImgData;
  const colors01 = [ [0/255, 170/255, 255/255], [255/255, 80/255, 80/255], [80/255, 255/255, 140/255], [255/255, 210/255, 80/255] ];
  const nodeWidth = 0.050; const nodeStrength = 0.78; const baseLift = 0.05;

  for (let y = 0; y < FIELD_OFF_H; y++) {
    const uy = y / (FIELD_OFF_H - 1);
    for (let x = 0; x < FIELD_OFF_W; x++) {
      const ux = x / (FIELD_OFF_W - 1);
      const z = sampleBilinear(fieldZ, ux, uy);
      const wTL = 1 / (0.08 + Math.hypot(ux - 0, uy - 0)); const wTR = 1 / (0.08 + Math.hypot(ux - 1, uy - 0));
      const wBL = 1 / (0.08 + Math.hypot(ux - 0, uy - 1)); const wBR = 1 / (0.08 + Math.hypot(ux - 1, uy - 1));
      const a = applied.ampEff;
      let c1 = Math.abs(wTL * a[0]); let c2 = Math.abs(wTR * a[1]); let c3 = Math.abs(wBL * a[2]); let c4 = Math.abs(wBR * a[3]);
      const sum = Math.max(1e-6, c1 + c2 + c3 + c4); c1 /= sum; c2 /= sum; c3 /= sum; c4 /= sum;
      let r = c1 * colors01[0][0] + c2 * colors01[1][0] + c3 * colors01[2][0] + c4 * colors01[3][0];
      let g = c1 * colors01[0][1] + c2 * colors01[1][1] + c3 * colors01[2][1] + c4 * colors01[3][1];
      let b = c1 * colors01[0][2] + c2 * colors01[1][2] + c3 * colors01[2][2] + c4 * colors01[3][2];
      const mag = clamp(Math.abs(z), 0, 1); const bright = baseLift + (1 - baseLift) * (0.18 + 0.82 * mag);
      r *= bright; g *= bright; b *= bright;
      const node = Math.exp(-Math.pow((Math.abs(z) / Math.max(1e-6, nodeWidth)), 2));
      r = lerp(r, 1.0, node * nodeStrength); g = lerp(g, 1.0, node * nodeStrength); b = lerp(b, 1.0, node * nodeStrength);
      {
        const l = 0.2126*r + 0.7152*g + 0.0722*b;
        r = l + (r - l) * VIS_SAT; g = l + (g - l) * VIS_SAT; b = l + (b - l) * VIS_SAT;
        r = (r - 0.5) * VIS_CONTRAST + 0.5; g = (g - 0.5) * VIS_CONTRAST + 0.5; b = (b - 0.5) * VIS_CONTRAST + 0.5;
        r += VIS_BRIGHT; g += VIS_BRIGHT; b += VIS_BRIGHT; r = clamp(r, 0, 1); g = clamp(g, 0, 1); b = clamp(b, 0, 1);
      }
      const p = (y * FIELD_OFF_W + x) * 4;
      fieldImgData[p] = clamp(Math.floor(r * 255), 0, 255); fieldImgData[p + 1] = clamp(Math.floor(g * 255), 0, 255); fieldImgData[p + 2] = clamp(Math.floor(b * 255), 0, 255); fieldImgData[p + 3] = 255;
    }
  }
  offFieldCtx.putImageData(img, 0, 0); fieldCtx.imageSmoothingEnabled = true; fieldCtx.drawImage(offField, 0, 0, FIELD_OFF_W, FIELD_OFF_H, 0, 0, w, h);
}

  // -------- Audio monitor (AudioWorklet) --------
  let envIntensity = [0,0,0,0];
  let envSlew = [0,0,0,0];
  let audio = { enabled: false, ctx: null, node: null, gain: null, lastSend: 0 };

  async function ensureAudio() {
    if (audio.ctx) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
    const workletCode = `
      class CoyoteSynth extends AudioWorkletProcessor {
        constructor() {
          super();
          this.sr = sampleRate; this.phase = [0,0,0,0]; this.amp = [0,0,0,0]; this.freq = [200,200,200,200]; this.phOff = [0,0,0,0];
          this.tAmp = [0,0,0,0]; this.tFreq = [200,200,200,200]; this.tPhOff = [0,0,0,0];
          this.port.onmessage = (e) => {
            const p = e.data;
            if (!p || !p.type) return;
            if (p.type === 'params') { this.tAmp = p.amp || this.tAmp; this.tFreq = p.freq || this.tFreq; this.tPhOff = p.phase || this.tPhOff; }
          };
        }
        slew(cur, tgt, dt, tau) { tau = Math.max(1e-4, tau); const k = 1 - Math.exp(-dt / tau); return cur + (tgt - cur) * k; }
        process(inputs, outputs) {
          const outL = outputs[0][0]; const outR = outputs[0][1]; const n = outL.length; const dt = n / this.sr;
          for (let i=0;i<4;i++){
            this.amp[i] = this.slew(this.amp[i], this.tAmp[i] || 0, dt, 0.04);
            this.freq[i] = this.slew(this.freq[i], this.tFreq[i] || 0, dt, 0.08);
            this.phOff[i] = this.slew(this.phOff[i], this.tPhOff[i] || 0, dt, 0.10);
          }
          let env = [0,0,0,0];
          for (let s=0;s<n;s++){
            let l = 0, r = 0;
            for (let ch=0; ch<4; ch++){
              const f = this.freq[ch]; const inc = 2*Math.PI*f/this.sr; this.phase[ch] += inc;
              if (this.phase[ch] > 1e6) this.phase[ch] %= (2*Math.PI);
              const v = (this.amp[ch] || 0) * Math.sin(this.phase[ch] + (this.phOff[ch]||0));
              env[ch] += Math.abs(v);
              if (ch===0 || ch===2) l += v; else r += v;
            }
            outL[s] = l * 0.35; outR[s] = r * 0.35;
          }
          try { this.port.postMessage({type:'env', env: [env[0]/n, env[1]/n, env[2]/n, env[3]/n]}); } catch {}
          return true;
        }
      }
      registerProcessor('coyote-synth', CoyoteSynth);
    `;
    const blob = new Blob([workletCode], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    await ctx.audioWorklet.addModule(url); URL.revokeObjectURL(url);
    const node = new AudioWorkletNode(ctx, "coyote-synth", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    const gain = ctx.createGain(); gain.gain.value = 0.0;
    node.connect(gain).connect(ctx.destination);
    audio.ctx = ctx; audio.node = node; audio.gain = gain;
    try { node.port.onmessage = (e) => { const d = e.data; if (d && d.type === 'env' && Array.isArray(d.env)) { for (let i=0;i<4;i++) envIntensity[i] = clamp(d.env[i]||0, 0, 1); } }; } catch {}
  }

  async function setMonitorEnabled(on) {
    audio.enabled = !!on; await ensureAudio(); if (!audio.ctx) return;
    if (audio.ctx.state !== "running") { try { await audio.ctx.resume(); } catch { } }
    audio.gain.gain.setTargetAtTime(on ? 1.0 : 0.0, audio.ctx.currentTime, 0.03);
    if (monitorBtn) monitorBtn.textContent = `Monitor: ${on ? "On" : "Off"}`;
  }

  function buildAudioParamMessage() {
    return { type: 'params', amp: [applied.ampEff[0], applied.ampEff[1], applied.ampEff[2], applied.ampEff[3]], freq: [applied.freqHz[0], applied.freqHz[1], applied.freqHz[2], applied.freqHz[3]], phase: [applied.phaseRad[0], applied.phaseRad[1], applied.phaseRad[2], applied.phaseRad[3]] };
  }

// -------- Bluetooth transport (Restored v2 + v3 Support) --------
  const BT = {
    primary: { device: null, protocol: null, charV3: null, charV2AB2: null, charV2A34: null, charV2B34: null, lastOkMs: 0 },
    secondary: { device: null, protocol: null, charV3: null, charV2AB2: null, charV2A34: null, charV2B34: null, lastOkMs: 0 },
    lastSendMs: 0,
  };

  const UUID_V3_WRITE = "0000150a-0000-1000-8000-00805f9b34fb";
  const UUID_V3_SVC_MAIN = "0000180c-0000-1000-8000-00805f9b34fb";
  const UUID_V3_SVC_LEGACY = "00001500-0000-1000-8000-00805f9b34fb";

  const V2_BASE_TAIL = "-0fe2-f5aa-a094-84b8d4f3e8ad";
  const uuidV2 = (short4) => `955a${String(short4).toLowerCase()}${V2_BASE_TAIL}`;
  const UUID_V2_SVC_180B = uuidV2("180b");
  const UUID_V2_AB2 = uuidV2("1504"); // strength A/B packed
  const UUID_V2_A34 = uuidV2("1506"); // Channel A waveform XYZ
  const UUID_V2_B34 = uuidV2("1505"); // Channel B waveform XYZ

  function getSlot(which) { return which === "primary" ? BT.primary : BT.secondary; }
  
  function clearSlot(slot) {
    slot.device = null; slot.protocol = null;
    slot.charV3 = null; slot.charV2AB2 = null;
    slot.charV2A34 = null; slot.charV2B34 = null;
    slot.lastOkMs = 0;
  }

  function updateBtStatus() {
    const now = performance.now();
    const pOk = !!BT.primary.protocol && (now - (BT.primary.lastOkMs || 0) < 3000);
    const sOk = !!BT.secondary.protocol && (now - (BT.secondary.lastOkMs || 0) < 3000);

    const set = (id, state) => {
      const el = $(id); if (!el) return;
      el.classList.remove("routeable","routeon");
      el.textContent = state;
      el.classList.toggle("connected", state === "Connected");
    };

    const pState = pOk ? "Connected" : "Disconnected";
    const sState = sOk ? "Connected" : "Disconnected";

    set("devBadge1", pState); set("devBadge2", pState);
    set("devBadge3", sState); set("devBadge4", sState);

    // Routing Logic for single-device connection
    const pOnly = pOk && !sOk;
    const sOnly = sOk && !pOk;

    if (pOnly) {
      const b3 = $("devBadge3"); const b4 = $("devBadge4");
      if (b3) { b3.textContent = "Merge with CH1"; b3.classList.add("routeable"); b3.classList.toggle("routeon", routeConfig.ch3 === "ch1"); }
      if (b4) { b4.textContent = "Merge with CH2"; b4.classList.add("routeable"); b4.classList.toggle("routeon", routeConfig.ch4 === "ch2"); }
    } else if (sOnly) {
      const b1 = $("devBadge1"); const b2 = $("devBadge2");
      const fmt = (v) => (v === "off" ? "Disconnected" : ("Route → " + String(v).toUpperCase()));
      if (b1) { b1.textContent = fmt(routeConfig.ch1); b1.classList.add("routeable"); b1.classList.toggle("routeon", routeConfig.ch1 !== "off"); }
      if (b2) { b2.textContent = fmt(routeConfig.ch2); b2.classList.add("routeable"); b2.classList.toggle("routeon", routeConfig.ch2 !== "off"); }
    }
    
    [1,2,3,4].forEach(n => setChannelRoutedUI(n, routeConfig["ch"+n]));
  }

  async function btConnect(which) {
    if (!navigator.bluetooth) { setOverlay("Web Bluetooth not available."); return; }
    const slot = getSlot(which);

    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { namePrefix: "47L" }, { namePrefix: "D-LAB" }, { namePrefix: "DG-LAB" },
          { namePrefix: "COYOTE" }, { namePrefix: "Coyote" }
        ],
        optionalServices: [
          UUID_V3_SVC_MAIN, UUID_V3_SVC_LEGACY, UUID_V2_SVC_180B,
          "0000180f-0000-1000-8000-00805f9b34fb" // battery
        ]
      });

      device.addEventListener("gattserverdisconnected", () => {
        clearSlot(slot);
        updateBtStatus();
      });

      const server = await device.gatt.connect();

      // Try V3 Discovery
      let v3Char = null;
      try {
        const svc3 = await server.getPrimaryService(UUID_V3_SVC_MAIN);
        v3Char = await svc3.getCharacteristic(UUID_V3_WRITE);
      } catch {}
      if (!v3Char) {
        try {
          const svcLegacy = await server.getPrimaryService(UUID_V3_SVC_LEGACY);
          v3Char = await svcLegacy.getCharacteristic(UUID_V3_WRITE);
        } catch {}
      }

      if (v3Char) {
        slot.device = device; 
        slot.protocol = "v3"; 
        slot.charV3 = v3Char;
      } else {
        // Try V2 Discovery
        try {
          const svc2 = await server.getPrimaryService(UUID_V2_SVC_180B);
          slot.charV2AB2 = await svc2.getCharacteristic(UUID_V2_AB2);
          slot.charV2A34 = await svc2.getCharacteristic(UUID_V2_A34);
          slot.charV2B34 = await svc2.getCharacteristic(UUID_V2_B34);
          slot.device = device; 
          slot.protocol = "v2";
        } catch (e) {
          setOverlay("Connected, but no Coyote v2/v3 services found.");
          return;
        }
      }

      slot.lastOkMs = performance.now();
      setOverlay("");
      updateBtStatus();
    } catch (e) {
      console.error(e);
      setOverlay("BT connect failed.");
    }
  }

  async function btDisconnectAll() {
    try { BT.primary.device?.gatt?.disconnect(); } catch { } 
    try { BT.secondary.device?.gatt?.disconnect(); } catch { }
    clearSlot(BT.primary); 
    clearSlot(BT.secondary); 
    updateBtStatus();
  }

  function bindUnmapButtons(){
    const ids = [1,2,3,4];
    for (const n of ids){
      const btn = $("unmapCh"+n);
      if (!btn) continue;
      btn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        routeConfig["ch"+n] = "off";
        saveSettings();
        updateBtStatus();
      });
    }
  }

  function bindRoutingBadges(){
    const b1 = $("devBadge1"), b2 = $("devBadge2"), b3 = $("devBadge3"), b4 = $("devBadge4");
    const onClick = (which) => {
      const p = !!BT.primary.protocol; const s = !!BT.secondary.protocol;
      if (p && !s) {
        if (which === "ch3") routeConfig.ch3 = (routeConfig.ch3 === "ch1") ? "off" : "ch1";
        if (which === "ch4") routeConfig.ch4 = (routeConfig.ch4 === "ch2") ? "off" : "ch2";
      } else if (!p && s) {
        const opts = ["off","ch3","ch4"];
        if (which === "ch1") routeConfig.ch1 = cycleRouteValue(routeConfig.ch1, opts);
        if (which === "ch2") routeConfig.ch2 = cycleRouteValue(routeConfig.ch2, opts);
      } else { return; }
      saveSettings();
      updateBtStatus();
    };
    b1?.addEventListener("click", () => onClick("ch1"));
    b2?.addEventListener("click", () => onClick("ch2"));
    b3?.addEventListener("click", () => onClick("ch3"));
    b4?.addEventListener("click", () => onClick("ch4"));
  }

  connectPrimaryBtn?.addEventListener("click", () => btConnect("primary"));
  connectSecondaryBtn?.addEventListener("click", () => btConnect("secondary"));
  disconnectBtn?.addEventListener("click", () => btDisconnectAll());
  monitorBtn?.addEventListener("click", () => setMonitorEnabled(!audio.enabled));

  // --- V3 Encoding Helpers ---
  function compressFreqHzToByte(freqHz) {
    if (freqHz <= 0) return 0;
    const t = 1000.0 / freqHz;
    let c = (t < 5) ? 5 : (t < 100) ? t : (t < 600) ? (t - 100) / 5 + 100 : (t - 600) / 10 + 200;
    return clamp(Math.round(c), 0, 255);
  }

  function mapFreqToDeviceHz(f) {
    const t = (Math.log(clamp(f, FMIN, FMAX)) - Math.log(FMIN)) / (Math.log(FMAX) - Math.log(FMIN));
    return clamp(Math.exp(Math.log(1) + t * (Math.log(200) - Math.log(1))), 1, 200);
  }

  function buildB0Packet(chA, chB) {
    const buf = new Uint8Array(20); buf[0] = 0xB0; buf[1] = 0x0F; buf[2] = 100; buf[3] = 100;
    const af = compressFreqHzToByte(mapFreqToDeviceHz(chA.freq));
    const bf = compressFreqHzToByte(mapFreqToDeviceHz(chB.freq));
    const ai = clamp(Math.round(chA.amp * 100), 0, 100);
    const bi = clamp(Math.round(chB.amp * 100), 0, 100);
    for (let i=0; i<4; i++){ buf[4+i]=af; buf[8+i]=ai; buf[12+i]=bf; buf[16+i]=bi; }
    return buf;
  }

  // --- V2 Encoding Helpers ---
  function v2PackStrength(a01, b01) {
    const a = clamp(Math.round(a01 * 2047), 0, 2047), b = clamp(Math.round(b01 * 2047), 0, 2047);
    const p = ((a & 0x7FF) << 11) | (b & 0x7FF);
    return new Uint8Array([p & 0xFF, (p >> 8) & 0xFF, (p >> 16) & 0xFF]);
  }

  function v2PackXYZ(freqHz, amp01) {
    const devHz = mapFreqToDeviceHz(freqHz);
    const ms = clamp(Math.round(1000 / devHz), 10, 1000);
    const x = clamp(Math.round(Math.sqrt(ms / 1000) * 15), 1, 31);
    const y = clamp(ms - x, 0, 1023), z = clamp(Math.round(amp01 * 20), 0, 20);
    const v = ((z & 0x1F) << 15) | ((y & 0x3FF) << 5) | (x & 0x1F);
    return new Uint8Array([v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF]);
  }

  async function btWrite(char, data) {
    if (!char) return;
    try { 
      await char.writeValueWithoutResponse(data); 
    } catch { 
      try { await char.writeValue(data); } catch {} 
    }
  }

  async function btSendIfNeeded(nowMs) {
    if (nowMs - BT.lastSendMs < 100) return;
    BT.lastSendMs = nowMs;

    const logical = applyRoutingToLogical(applied);
    const phys = mixForPhysical(logical);

    const sendSlot = async (slot, a, b) => {
      if (!slot.protocol || !slot.device?.gatt?.connected) return;
      if (slot.protocol === "v3" && slot.charV3) {
        await btWrite(slot.charV3, buildB0Packet(a, b));
        slot.lastOkMs = performance.now();
      } else if (slot.protocol === "v2" && slot.charV2AB2) {
        await btWrite(slot.charV2AB2, v2PackStrength(a.amp, b.amp));
        await btWrite(slot.charV2A34, v2PackXYZ(a.freq, a.amp));
        await btWrite(slot.charV2B34, v2PackXYZ(b.freq, b.amp));
        slot.lastOkMs = performance.now();
      }
    };

    try {
      await sendSlot(BT.primary, phys[0], phys[1]);
      await sendSlot(BT.secondary, phys[2], phys[3]);
      updateBtStatus();
    } catch (e) { }
  }

  function btTick(nowSec) { void btSendIfNeeded(performance.now()); }

  // -------- Motion Scripts --------
  const SCRIPT_INTENSITY_GAIN = 5.0; 
  const motion = { scripts: [], byId: new Map(), active: false, scriptId: null, startSec: 0, intensityTarget: 1, intensity: 1 };
  
  
  // Keep the Scripts Start/Stop button in sync with whether a script is currently playing.
  function updateScriptToggleUI() {
    if (!scriptToggleBtn) return;
    const running = !!motion.active;
    scriptToggleBtn.classList.toggle("running", running);
    scriptToggleBtn.classList.toggle("start-btn", !running);
    scriptToggleBtn.classList.toggle("stop-btn2", running);
    scriptToggleBtn.textContent = running ? "Stop" : "Start";
  }

function compileExpr(expr) { 
    const fn = new Function("t", "pi", "sin", "cos", "abs", "sqrt", "pow", "min", "max", `return (${expr});`); 
    return (t) => { try { return fn(t, Math.PI, Math.sin, Math.cos, Math.abs, Math.sqrt, Math.pow, Math.min, Math.max); } catch { return 0; } }; 
  }
  
  function evalKeyframes(kfs, tNorm, interp) {
    if (!kfs || kfs.length < 2) return { x: 0, y: 0, ax: 0, ay: 0 };
    let a = kfs[0], b = kfs[kfs.length - 1];
    for (let i = 0; i < kfs.length - 1; i++) { 
      if (tNorm >= kfs[i].t && tNorm <= kfs[i + 1].t) { 
        a = kfs[i]; b = kfs[i + 1]; break; 
      } 
    }
    let span = (b.t - a.t) || 1e-6; 
    let u = clamp((tNorm - a.t) / span, 0, 1); 
    if (interp === "smoothstep") u = u * u * (3 - 2 * u);
    
    return { 
      x: lerp(a.x, b.x, u), 
      y: lerp(a.y, b.y, u),
      ax: lerp(a.ax ?? a.x, b.ax ?? b.x, u), // Fallback to x if ax is missing
      ay: lerp(a.ay ?? a.y, b.ay ?? b.y, u)  // Fallback to y if ay is missing
    };
  }

  async function loadMotionScripts() {
    try {
      const res = await fetch("motion_scripts.json", { cache: "no-store" }); 
      if (!res.ok) return; 
      const data = await res.json();
      motion.scripts = data.scripts || [];
      for (const s of motion.scripts) { 
        if (s.type === "parametric") { 
          s._fx = compileExpr(s.params.x); 
          s._fy = compileExpr(s.params.y); 
          // Add these two lines:
          s._fax = s.params.ax ? compileExpr(s.params.ax) : null;
          s._fay = s.params.ay ? compileExpr(s.params.ay) : null;
        } 
        motion.byId.set(s.id, s); 
      }
      refreshScriptSelectForMode(); 
      refreshCaretakerSelect();
    } catch { }
  }

  function refreshScriptSelectForMode() { if (!scriptSelect) return; const wantCaret = (APP_MODE === "biome"); scriptSelect.innerHTML = ""; for (const s of motion.scripts) { if ((s.type === "caretaker") === wantCaret) { const o = document.createElement("option"); o.value = s.id; o.textContent = s.label || s.id; scriptSelect.appendChild(o); } } }
  
  function refreshCaretakerSelect() { const sel = $("caretakerSelect"); if (!sel) return; sel.innerHTML = ""; const list = motion.scripts.filter(s => s.type === "caretaker"); for (const c of list) { const o = document.createElement("option"); o.value = c.id; o.textContent = c.label || c.id; sel.appendChild(o); } }

  function applyScriptToCursor(nowSec, dt) {
    motion.intensity = expSlew(motion.intensity, motion.intensityTarget, dt, 0.12); 
    if (!motion.active || controlTargets.dragging || (gamepad.activeUntilSec && nowSec < gamepad.activeUntilSec)) return;
    
    const s = motion.byId.get(motion.scriptId); 
    if (!s) return;

    const elapsed = nowSec - motion.startSec; 
    const dur = s.duration_s || 10; 
    let tNorm = (elapsed / dur); 
    tNorm = s.loop ? (tNorm % 1.0) : clamp(tNorm, 0, 1);

    let x = 0, y = 0, ax = 0, ay = 0;

    if (s.type === "parametric") {
      x = s._fx(tNorm);
      y = s._fy(tNorm);
      // Use independent math if available, otherwise mirror x/y
      ax = s._fax ? s._fax(tNorm) : x;
      ay = s._fay ? s._fay(tNorm) : y;
    } else {
      const k = evalKeyframes(s.keyframes, tNorm, s.interp);
      x = k.x;
      y = k.y;
      ax = k.ax;
      ay = k.ay;
    }

  // Apply values to first cursor
  controlTargets.x = clamp(x, -1, 1) * motion.intensity;
  controlTargets.y = clamp(y, -1, 1) * motion.intensity;
  let m = Math.hypot(controlTargets.x, controlTargets.y);
  if (m > 1) { controlTargets.x /= m; controlTargets.y /= m; }

  // Apply values to second cursor (Independent!)
  controlTargets.ax = clamp(ax, -1, 1) * motion.intensity;
  controlTargets.ay = clamp(ay, -1, 1) * motion.intensity;
  let ma = Math.hypot(controlTargets.ax, controlTargets.ay);
  if (ma > 1) { controlTargets.ax /= ma; controlTargets.ay /= ma; }
}

  // -------- Loops --------
  let lastControlT = performance.now(); let lastRenderT = performance.now();
  
  function controlStep() {
    const now = performance.now(); const dt = clamp((now - lastControlT) / 1000, 0, 0.05); lastControlT = now; const nowSec = now / 1000;
    pollGamepad(nowSec); applyScriptToCursor(nowSec, dt); updateApplied(dt, nowSec);
    for (let i = 0; i < 4; i++) { envSlew[i] = expSlew(envSlew[i] || 0, applied.ampEff[i] || 0, dt, 0.04); }
    if (APP_MODE === "biome" && window.BiomeEngine) window.BiomeEngine.step(dt);
    if (audio.node && audio.ctx && now - audio.lastSend > 16) { audio.lastSend = now; audio.node.port.postMessage(buildAudioParamMessage()); }
    btTick(nowSec);
  }

  function renderTick() {
    const now = performance.now(); const dt = clamp((now - lastRenderT) / 1000, 0, 0.05); lastRenderT = now;
    if (APP_MODE === "biome") { if (window.BiomeEngine) { window.BiomeEngine.render(dt); drawSpectrum(); } } else { drawScope(); strobePhase = (strobePhase + TAU * FIELD_DRIFT_HZ * dt) % TAU; computeField(true, dt); renderFieldRich(dt); }
    requestAnimationFrame(renderTick);
  }

  // -------- Boot --------
  (async function boot() {
    const saved = loadSettings(); if (saved) applySettings(saved); if (masterVol) masterVol.value = "0";
    updateValueTexts(); updateMaxPills(); initSnapButtons();
    try {
      const ci = $("caretakerIntensity");
      if (ci && !ci.dataset.bound) {
        ci.dataset.bound = "1";
        ci.addEventListener("input", () => { updateCaretakerIntensityLabel(); });
        ci.addEventListener("change", () => { updateCaretakerIntensityLabel(); });
      }
      updateCaretakerIntensityLabel();
    } catch {}

    try {
      for (let i=0;i<4;i++){
        if (snapPhaseBtn[i]) snapPhaseBtn[i].style.display = "none";
        if (snapCycleBtn[i]) snapCycleBtn[i].style.display = "none";
      }
    } catch {}
    initClickResetLabels(); await loadMotionScripts();
    bindRoutingBadges();
    bindUnmapButtons();
    updateBtStatus();
    // Mode toggle (Control <-> Biome)
    const modeBtnEl = $("modeBtn");
    if (modeBtnEl && !modeBtnEl.dataset.bound) {
      modeBtnEl.dataset.bound = "1";
      modeBtnEl.addEventListener("click", () => {
        const next = (APP_MODE === "biome") ? "control" : "biome";
        // When entering Biome mode, stop any motion scripts and release the pad.
        if (next === "biome") {
          motion.active = false;
          try { releaseCursor(); } catch {}
        }
        setAppMode(next);
        try { updateScriptToggleUI(); } catch {}
        saveSettings();
      });
    }


    try { updateScriptToggleUI(); } catch {}
    setInterval(controlStep, 33); requestAnimationFrame(renderTick);
    try { window.caretakerIntensityLabelTimer = window.caretakerIntensityLabelTimer || setInterval(() => { try { updateCaretakerIntensityLabel(); } catch {} }, 250); } catch {}

    scriptSelect?.addEventListener("change", () => {
      if (motion.active) {
        // If a script is currently running, hot-swap to the new one
        motion.scriptId = scriptSelect.value;
        motion.startSec = performance.now() / 1000; 
        // No need to click start/stop; it just carries on with the new pattern
      }
    });
  })();

// --- Find the end of your main.js and ensure this logic is present ---

  function setAppMode(mode){
    APP_MODE = (mode === "biome") ? "biome" : "control"; 
    document.body.setAttribute("data-mode", APP_MODE);
    if ($("modeBtn")) $("modeBtn").textContent = (APP_MODE === "biome") ? "Mode: Biome" : "Mode: Control";
    
    if (APP_MODE === "biome") {
      refreshScriptSelectForMode(); 
      refreshCaretakerSelect();
      if (window.BiomeEngine) { 
        window.BiomeEngine.init(fieldCanvas, () => ({ 
            baseHz: applied.baseHz, 
            chMult: multSl.map(s => parseFloat(s.value)), 
            t: performance.now()/1000 
        })); 
        window.BiomeEngine.setEnabled(true);
      }
    } else {
      refreshScriptSelectForMode(); 
      if (window.BiomeEngine) window.BiomeEngine.setEnabled(false);
    }
  }

  // Emergency Stop Logic
  stopBtn?.addEventListener("click", () => {
      if (masterVol) masterVol.value = "0";
      motion.active = false;
      releaseCursor(); 
      if (typeof updateScriptToggleUI === "function") updateScriptToggleUI();
      updateValueTexts();
      saveSettings();
  });

  // Requirement #2: Hot-swap scripts while running
  scriptSelect?.addEventListener("change", () => {
    if (motion.active) {
      motion.scriptId = scriptSelect.value;
      motion.startSec = performance.now() / 1000; 
    }
  });

  scriptToggleBtn?.addEventListener("click", () => {
    if (!motion.active) {
      motion.scriptId = scriptSelect.value;
      motion.active = true;
      motion.startSec = performance.now()/1000;
    } else {
      motion.active = false;
    }
    updateScriptToggleUI();
  });

  scriptIntensity?.addEventListener("input", () => { 
    const v = parseFloat(scriptIntensity.value || "100") / 100; 
    if (scriptIntensityVal) { scriptIntensityVal.textContent = Math.round(v * 100) + "%"; }
    motion.intensityTarget = clamp(Math.pow(v, 0.95) * SCRIPT_INTENSITY_GAIN, 0, 2.0); 
    saveSettings(); 
  });

  // Initial call to set mode on boot
  setAppMode(APP_MODE);

})(); // END OF FILE