// synth_engine.js  v1.0
// Synth Mode: per-channel modifier chains + effects chain + slit-scan visualizer

const SynthEngine = (() => {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp  = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerpFn = (a, b, t)   => a + (b - a) * t;
  const NUM_CH = 4;
  const STORAGE_KEY     = 'coyote.synth.v1';
  const ARR_STORAGE_KEY = 'coyote.synth.arrangements.v1';

  // ── Channel colours (match main.js) ────────────────────────────────────────
  const CH_COLORS = [
    { r:   0, g: 170, b: 255 },   // CH1 blue
    { r: 255, g:  80, b:  80 },   // CH2 red
    { r:  80, g: 255, b: 140 },   // CH3 green
    { r: 255, g: 210, b:  80 },   // CH4 yellow
  ];
  const CH_CSS   = ['#0af', '#f50', '#5fa', '#fd0'];
  const CH_NAMES = ['CH1', 'CH2', 'CH3', 'CH4'];

  // ── Modifier definitions ─────────────────────────────────────────────────
  const MODIFIER_DEFS = [
    {
      id: 'pulse', label: '⊕ Pulse', color: '#0af',
      params: { rate: 2.0, depth: 0.9, duty: 0.30, variance: 0 },
      paramDefs: [
        { key: 'rate',     label: 'Rate',     min: 0.1,  max: 10,   step: 0.1  },
        { key: 'depth',    label: 'Depth',    min: 0,    max: 1,    step: 0.01 },
        { key: 'duty',     label: 'Duty',     min: 0.05, max: 0.95, step: 0.01 },
        { key: 'variance', label: 'Variance', min: 0,    max: 1,    step: 0.01 },
      ],
    },
    {
      id: 'breathe', label: '〜 Breathe', color: '#6fa',
      params: { rate: 0.3, depth: 0.8, variance: 0.1 },
      paramDefs: [
        { key: 'rate',     label: 'Rate',     min: 0.05, max: 2, step: 0.05 },
        { key: 'depth',    label: 'Depth',    min: 0,    max: 1, step: 0.01 },
        { key: 'variance', label: 'Variance', min: 0,    max: 1, step: 0.01 },
      ],
    },
    {
      id: 'burst', label: '⋮ Burst', color: '#f80',
      params: { rate: 2.5, depth: 1.0, count: 3, gap: 0.4 },
      paramDefs: [
        { key: 'rate',  label: 'Rate',  min: 0.5, max: 8,   step: 0.1  },
        { key: 'depth', label: 'Depth', min: 0,   max: 1,   step: 0.01 },
        { key: 'count', label: 'Count', min: 1,   max: 8,   step: 1    },
        { key: 'gap',   label: 'Gap',   min: 0,   max: 0.9, step: 0.01 },
      ],
    },
    {
      id: 'stutter', label: '≡ Stutter', color: '#f44',
      params: { rate: 8.0, depth: 0.7, duty: 0.5, variance: 0.2 },
      paramDefs: [
        { key: 'rate',     label: 'Rate',     min: 1,    max: 30,   step: 0.5  },
        { key: 'depth',    label: 'Depth',    min: 0,    max: 1,    step: 0.01 },
        { key: 'duty',     label: 'Duty',     min: 0.05, max: 0.95, step: 0.01 },
        { key: 'variance', label: 'Variance', min: 0,    max: 1,    step: 0.01 },
      ],
    },
    {
      id: 'swell', label: '◠ Swell', color: '#a4f',
      params: { rate: 0.15, depth: 0.9 },
      paramDefs: [
        { key: 'rate',  label: 'Rate',  min: 0.02, max: 1, step: 0.01 },
        { key: 'depth', label: 'Depth', min: 0,    max: 1, step: 0.01 },
      ],
    },
    {
      id: 'groove', label: '♩ Groove', color: '#ff4',
      params: { rate: 1.5, depth: 0.85, swing: 0.6 },
      paramDefs: [
        { key: 'rate',  label: 'Rate',  min: 0.25, max: 6, step: 0.25 },
        { key: 'depth', label: 'Depth', min: 0,    max: 1, step: 0.01 },
        { key: 'swing', label: 'Swing', min: 0,    max: 1, step: 0.01 },
      ],
    },
    {
      id: 'ramp', label: '/ Ramp', color: '#4ff',
      params: { rate: 0.5, depth: 1.0, up: 1 },
      paramDefs: [
        { key: 'rate',  label: 'Rate',      min: 0.05, max: 4, step: 0.05 },
        { key: 'depth', label: 'Depth',     min: 0,    max: 1, step: 0.01 },
        { key: 'up',    label: 'Direction', min: 0,    max: 1, step: 1    }, // 0=down 1=up
      ],
    },
    {
      id: 'chaos', label: '⊛ Chaos', color: '#f4f',
      params: { rate: 1.0, depth: 0.8, variance: 0.5 },
      paramDefs: [
        { key: 'rate',     label: 'Rate',     min: 0.1, max: 10, step: 0.1  },
        { key: 'depth',    label: 'Depth',    min: 0,   max: 1,  step: 0.01 },
        { key: 'variance', label: 'Variance', min: 0,   max: 1,  step: 0.01 },
      ],
    },
    // ── Pitch modifiers (affect frequency, not amplitude) ──────────────────
    {
      id: 'vibrato', label: '≋ Vibrato', color: '#fc6', type: 'pitch',
      params: { rate: 4.0, depth: 3, shape: 0 },
      paramDefs: [
        { key: 'rate',  label: 'Rate (Hz)',        min: 0.1, max: 20, step: 0.1  },
        { key: 'depth', label: 'Depth (semitones)', min: 0,   max: 12, step: 0.25 },
        { key: 'shape', label: 'Shape 0=sin 1=tri', min: 0,   max: 1,  step: 1    },
      ],
    },
    {
      id: 'pitchpulse', label: '⇅ P.Jump', color: '#c9f', type: 'pitch',
      params: { rate: 2.0, jump: 7, duty: 0.50 },
      paramDefs: [
        { key: 'rate', label: 'Rate (Hz)',   min: 0.1,  max: 10,   step: 0.1  },
        { key: 'jump', label: 'Jump (st)',   min: -24,  max: 24,   step: 0.5  },
        { key: 'duty', label: 'Duty',        min: 0.05, max: 0.95, step: 0.01 },
      ],
    },
  ];

  // ── Effect definitions ────────────────────────────────────────────────────
  const EFFECT_DEFS = [
    {
      id: 'echo', label: 'Echo', color: '#08f',
      params: { delay: 0.30, feedback: 0.45, mix: 0.50 },
      paramDefs: [
        { key: 'delay',    label: 'Delay',    min: 0.02, max: 1.5,  step: 0.01 },
        { key: 'feedback', label: 'Feedback', min: 0,    max: 0.95, step: 0.01 },
        { key: 'mix',      label: 'Mix',      min: 0,    max: 1,    step: 0.01 },
      ],
    },
    {
      id: 'phaser', label: 'Phaser', color: '#f80',
      params: { rate: 0.40, depth: 0.60 },
      paramDefs: [
        { key: 'rate',  label: 'Rate',  min: 0.05, max: 5, step: 0.05 },
        { key: 'depth', label: 'Depth', min: 0,    max: 1, step: 0.01 },
      ],
    },
    {
      id: 'flanger', label: 'Flanger', color: '#af0',
      params: { rate: 0.20, depth: 0.50, feedback: 0.30 },
      paramDefs: [
        { key: 'rate',     label: 'Rate',     min: 0.05, max: 4,    step: 0.05 },
        { key: 'depth',    label: 'Depth',    min: 0,    max: 1,    step: 0.01 },
        { key: 'feedback', label: 'Feedback', min: 0,    max: 0.95, step: 0.01 },
      ],
    },
    {
      // Wheel pitch-bend LFO:
      //   center   = static offset in semitones (hub position)
      //   range    = total swing in semitones (wheel radius → left/right travel)
      //   velocity = oscillation rate in Hz (wheel RPM)
      id: 'pitch', label: 'Pitch ±', color: '#f0f',
      params: { center: 0, range: 6, velocity: 0.5 },
      paramDefs: [
        { key: 'center',   label: 'Center (st)',  min: -24, max: 24, step: 1   },
        { key: 'range',    label: 'Range (st)',   min: 0,   max: 48, step: 0.5 },
        { key: 'velocity', label: 'Velocity (Hz)',min: 0,   max: 10, step: 0.1 },
      ],
    },
    {
      id: 'fuzz', label: 'Fuzz', color: '#fa0',
      params: { drive: 2.0, mix: 0.70 },
      paramDefs: [
        { key: 'drive', label: 'Drive', min: 1, max: 10, step: 0.1  },
        { key: 'mix',   label: 'Mix',   min: 0, max: 1,  step: 0.01 },
      ],
    },
    {
      id: 'distort', label: 'Distort', color: '#f44',
      params: { drive: 4.0, mix: 0.50 },
      paramDefs: [
        { key: 'drive', label: 'Drive', min: 1, max: 20, step: 0.5  },
        { key: 'mix',   label: 'Mix',   min: 0, max: 1,  step: 0.01 },
      ],
    },
    {
      id: 'quantize', label: 'Q-Tone', color: '#4ff',
      params: { root: 0, scale: 0 },   // scale: 0=major 1=minor 2=penta 3=blues
      paramDefs: [
        { key: 'root',  label: 'Root',  min: 0, max: 11, step: 1 },
        { key: 'scale', label: 'Scale', min: 0, max: 3,  step: 1 },
      ],
    },
  ];

  // ── Runtime state ────────────────────────────────────────────────────────
  let _enabled = false;
  let _t = 0;

  const _chains = Array.from({ length: NUM_CH }, () => ({
    modifiers: [],
    effects: EFFECT_DEFS.map(d => ({
      defId: d.id,
      params: { ...d.params },
      enabled: false,
      _buf: null, _pos: 0, _ph: 0,
    })),
    fxOpen: false,
  }));

  // Slit-scan: shared circular buffer, one row per channel
  const HIST_LEN = 400;
  const _hist     = Array.from({ length: NUM_CH }, () => new Float32Array(HIST_LEN));
  const _histFreq = Array.from({ length: NUM_CH }, () => new Float32Array(HIST_LEN)); // normalised 0..1 over 20–600 Hz
  let _histPos = 0;

  // Modifiers that affect frequency (return a multiplier applied to freq, not amp)
  const PITCH_MOD_IDS = new Set(['vibrato', 'pitchpulse']);

  // Named arrangements list  [{ name: string, data: arrangement[] }, ...]
  let _arrangements = [];
  let _arrDlg = null;   // floating dialog element when open

  // Drag-drop tracking
  let _dragSrcCh = -1, _dragSrcIdx = -1;

  // ── DSP: modifier gate functions ──────────────────────────────────────────
  function computeModifier(mod, t, dt) {
    const p = mod.params;
    if (mod._phase == null) mod._phase = 0;

    switch (mod.defId) {
      case 'pulse': {
        const rate = Math.max(0.01, p.rate || 2);
        mod._phase = (mod._phase + rate * dt) % 1;
        const duty = clamp(p.duty || 0.3, 0.01, 0.99);
        const ph = mod._phase;
        let env;
        if      (ph < duty * 0.1)              env = ph / (duty * 0.1);
        else if (ph < duty)                    env = 1;
        else if (ph < duty + (1 - duty) * 0.25) env = 1 - (ph - duty) / ((1 - duty) * 0.25);
        else                                   env = 0;
        const vr = (p.variance || 0) > 0 ? (1 + (Math.random() - 0.5) * (p.variance) * 0.3) : 1;
        return clamp((p.depth || 0.9) * env * vr, 0, 1);
      }

      case 'breathe': {
        const rate = Math.max(0.01, p.rate || 0.3);
        const v = 0.5 + 0.5 * Math.sin(t * rate * TAU - Math.PI / 2);
        const vr = (p.variance || 0) > 0 ? (1 + (Math.random() - 0.5) * (p.variance) * 0.05) : 1;
        return clamp((p.depth || 0.8) * v * vr, 0, 1);
      }

      case 'burst': {
        const rate  = Math.max(0.01, p.rate || 2.5);
        const count = Math.max(1, Math.round(p.count || 3));
        const gap   = clamp(p.gap || 0.4, 0, 0.9);
        mod._phase = (mod._phase + rate * dt) % 1;
        const ph       = mod._phase;
        const beatSize = 1.0 / count;
        const beatIdx  = Math.min(count - 1, Math.floor(ph / beatSize));
        const beatLocal = (ph % beatSize) / beatSize;
        if (beatLocal > (1 - gap)) return 0;
        const noteLocal = beatLocal / (1 - gap);
        const env = noteLocal < 0.15 ? noteLocal / 0.15
                  : noteLocal < 0.6  ? 1
                  : 1 - (noteLocal - 0.6) / 0.4;
        return clamp((p.depth || 1) * Math.max(0, env), 0, 1);
      }

      case 'stutter': {
        const rate = Math.max(0.01, p.rate || 8);
        const duty = clamp(p.duty || 0.5, 0.01, 0.99);
        mod._phase = (mod._phase + rate * dt) % 1;
        const on = mod._phase < duty ? 1 : 0;
        const vr = on && (p.variance || 0) > 0 ? (Math.random() > (p.variance) * 0.3 ? 1 : 0) : 1;
        return clamp((p.depth || 0.7) * on * vr, 0, 1);
      }

      case 'swell': {
        const rate = Math.max(0.005, p.rate || 0.15);
        const ph = (t * rate) % 1;
        const v = ph < 0.6 ? Math.pow(ph / 0.6, 0.7)
                            : Math.pow(1 - (ph - 0.6) / 0.4, 0.45);
        return clamp((p.depth || 0.9) * Math.max(0, v), 0, 1);
      }

      case 'groove': {
        const rate   = Math.max(0.01, p.rate || 1.5);
        const swing  = clamp(p.swing || 0.6, 0, 1);
        mod._phase = (mod._phase + rate * dt) % 1;
        const ph   = mod._phase;
        const beat = Math.min(3, Math.floor(ph * 4));
        const bLocal = (ph * 4) % 1;
        const strengths = [1.0, swing * 0.35, swing * 0.65, swing * 0.25];
        const env = bLocal < 0.12 ? bLocal / 0.12 : Math.exp(-(bLocal - 0.12) * 5);
        return clamp((p.depth || 0.85) * strengths[beat] * Math.max(0, env), 0, 1);
      }

      case 'ramp': {
        const rate = Math.max(0.01, p.rate || 0.5);
        const ph = (t * rate) % 1;
        const v = p.up ? ph : 1 - ph;
        return clamp((p.depth || 1) * v, 0, 1);
      }

      case 'chaos': {
        const rate = Math.max(0.01, p.rate || 1);
        const prev = mod._phase;
        mod._phase = (mod._phase + rate * dt) % 1;
        if (!mod._state) mod._state = { a: 0.5, b: Math.random() };
        const st = mod._state;
        if (mod._phase < prev) { st.a = st.b; st.b = Math.random(); }
        const u = mod._phase;                      // 0..1 within current step
        const v = st.a + (st.b - st.a) * (u * u * (3 - 2 * u)); // smoothstep
        return clamp((p.depth || 0.8) * v + (1 - (p.depth || 0.8)) * 0.05, 0, 1);
      }

      // ── Pitch modifiers – return a frequency multiplier (not 0..1 gate) ──
      case 'vibrato': {
        if (mod._phase == null) mod._phase = 0;
        mod._phase += (p.rate || 4) * dt * TAU;
        let lfo;
        if (Math.round(p.shape || 0) === 1) {
          // Triangle: maps 0..TAU → -1..1 as a triangle wave
          const ph = mod._phase % TAU;
          const t2 = ph / Math.PI; // 0..2
          lfo = t2 < 1 ? 2 * t2 - 1 : 3 - 2 * t2;
        } else {
          lfo = Math.sin(mod._phase);
        }
        return Math.pow(2, ((p.depth || 3) * lfo) / 12); // freq multiplier
      }

      case 'pitchpulse': {
        if (mod._phase == null) mod._phase = 0;
        mod._phase = (mod._phase + (p.rate || 2) * dt) % 1;
        const on = mod._phase < clamp(p.duty || 0.5, 0.01, 0.99);
        return Math.pow(2, (on ? (p.jump || 7) : 0) / 12); // freq multiplier
      }

      default: return 1;
    }
  }

  // ── DSP: effect processors ────────────────────────────────────────────────
  const ECHO_RATE = 30;   // approximated control-loop ticks/sec

  function processEffect(eff, ampIn, freqIn, dt) {
    const p = eff.params;

    switch (eff.defId) {
      case 'echo': {
        const bufLen = Math.round(2 * ECHO_RATE);
        if (!eff._buf || eff._buf.length !== bufLen) { eff._buf = new Float32Array(bufLen); eff._pos = 0; }
        const delaySamp = Math.max(1, Math.round((p.delay || 0.3) * ECHO_RATE));
        const readPos   = (eff._pos - delaySamp + bufLen) % bufLen;
        const delayed   = eff._buf[readPos];
        const out = clamp(ampIn + delayed * (p.mix || 0.5), 0, 1);
        eff._buf[eff._pos] = ampIn + delayed * clamp(p.feedback || 0.45, 0, 0.95);
        eff._pos = (eff._pos + 1) % bufLen;
        return { amp: out, freq: freqIn };
      }

      case 'phaser': {
        if (eff._ph == null) eff._ph = 0;
        eff._ph += (p.rate || 0.4) * dt * TAU;
        const mod = (p.depth || 0.6) * (0.5 + 0.5 * Math.sin(eff._ph));
        return { amp: ampIn * (1 - mod * 0.3), freq: freqIn };
      }

      case 'flanger': {
        if (eff._ph == null) eff._ph = 0;
        eff._ph += (p.rate || 0.2) * dt * TAU;
        const bufLen = Math.round(0.5 * ECHO_RATE);
        if (!eff._buf || eff._buf.length !== bufLen) { eff._buf = new Float32Array(bufLen); eff._pos = 0; }
        const mod      = 0.5 + 0.5 * Math.sin(eff._ph);
        const delaySamp = Math.max(1, Math.round(mod * (p.depth || 0.5) * bufLen * 0.8));
        const readPos   = (eff._pos - delaySamp + bufLen) % bufLen;
        const flanged   = eff._buf[readPos];
        const out = clamp(ampIn + flanged * (p.feedback || 0.3) * 0.5, 0, 1);
        eff._buf[eff._pos] = ampIn;
        eff._pos = (eff._pos + 1) % bufLen;
        return { amp: out, freq: freqIn };
      }

      case 'pitch': {
        // Wheel model: eff._ph is the wheel rotation angle
        // velocity (Hz) drives rotation; range/2 is the rim radius → semitone swing
        if (eff._ph == null) eff._ph = 0;
        eff._ph += (p.velocity || 0) * dt * TAU;
        const swing = (p.range || 0) > 0 ? (p.range / 2) * Math.sin(eff._ph) : 0;
        const totalSt = (p.center || 0) + swing;
        return { amp: ampIn, freq: Math.max(20, freqIn * Math.pow(2, totalSt / 12)) };
      }

      case 'fuzz': {
        const drive = Math.max(1, p.drive || 2);
        const mix   = clamp(p.mix || 0.7, 0, 1);
        const driven = Math.tanh(ampIn * drive) / Math.tanh(drive);
        return { amp: lerpFn(ampIn, driven, mix), freq: freqIn };
      }

      case 'distort': {
        const drive = Math.max(1, p.drive || 4);
        const mix   = clamp(p.mix || 0.5, 0, 1);
        const driven = clamp(ampIn * drive, 0, 1);
        return { amp: lerpFn(ampIn, driven, mix), freq: freqIn };
      }

      case 'quantize': {
        const SCALES = [
          [0,2,4,5,7,9,11],   // major
          [0,2,3,5,7,8,10],   // minor
          [0,2,4,7,9],        // pentatonic
          [0,3,5,6,7,10],     // blues
        ];
        const scale  = SCALES[Math.round(clamp(p.scale || 0, 0, 3))];
        const root   = Math.round(clamp(p.root || 0, 0, 11));
        const A4     = 440;
        const semFromA4 = 12 * Math.log2(Math.max(20, freqIn) / A4);
        const midiNote  = 69 + semFromA4;
        const octave    = Math.floor((midiNote - 60 - root) / 12);
        const deg       = ((midiNote - 60 - root) % 12 + 12) % 12;
        let best = scale[0], bestDist = 99;
        for (const s of scale) { const d = Math.abs(s - deg); if (d < bestDist) { bestDist = d; best = s; } }
        const quantMidi = 60 + root + octave * 12 + best;
        const quantFreq = A4 * Math.pow(2, (quantMidi - 69) / 12);
        return { amp: ampIn, freq: Math.max(20, quantFreq) };
      }

      default: return { amp: ampIn, freq: freqIn };
    }
  }

  // ── Step function (called from controlStep) ───────────────────────────────
  function step(dt, t, applied) {
    if (!_enabled) return;
    _t = t;
    _histPos = (_histPos + 1) % HIST_LEN;

    for (let ch = 0; ch < NUM_CH; ch++) {
      const chain   = _chains[ch];
      const baseAmp = applied.ampEff[ch];

      // Hard-gate: when base amplitude is 0, drain delay buffers so residual
      // data (e.g. Echo delay line) can't bleed through into future frames.
      if (baseAmp < 0.002) {
        for (const eff of chain.effects) {
          if (eff._buf) {
            eff._buf[eff._pos] = 0;
            eff._pos = (eff._pos + 1) % eff._buf.length;
          }
        }
        applied.ampEff[ch]      = 0;
        _hist[ch][_histPos]     = 0;
        _histFreq[ch][_histPos] = clamp((applied.freqHz[ch] - 20) / 580, 0, 1);
        continue;
      }

      let amp  = baseAmp;
      let freq = applied.freqHz[ch];

      // Apply modifier chain: amplitude gates + pitch multipliers
      for (const mod of chain.modifiers) {
        if (!mod.enabled) continue;
        const result = computeModifier(mod, t, dt);
        if (PITCH_MOD_IDS.has(mod.defId)) {
          freq *= result; // pitch modifier → frequency multiplier
        } else {
          amp  *= result; // amplitude modifier → gate
        }
      }
      amp = clamp(amp, 0, 1);

      // Apply effects chain
      for (const eff of chain.effects) {
        if (!eff.enabled) continue;
        const out = processEffect(eff, amp, freq, dt);
        amp  = out.amp;
        freq = out.freq;
      }

      applied.ampEff[ch]  = clamp(amp, 0, 1);
      applied.freqHz[ch]  = Math.max(20, freq);

      // Record for scope
      _hist[ch][_histPos]     = applied.ampEff[ch];
      _histFreq[ch][_histPos] = clamp((applied.freqHz[ch] - 20) / 580, 0, 1); // normalised over 20–600 Hz
    }
  }

  // ── Scope renderer ─────────────────────────────────────────────────────────
  // Each channel gets its own row showing:
  //   • Filled amplitude waveform (bottom-anchored, channel colour)
  //   • Bright trace line over the fill with glow
  //   • Thin frequency track near the top of each row
  //   • Live level bar on right edge, channel label top-left
  function renderSlitScan(canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.clientWidth  | 0;
    const h = canvas.clientHeight | 0;
    if (w <= 0 || h <= 0) return;
    if (canvas.width  !== w) canvas.width  = w;
    if (canvas.height !== h) canvas.height = h;

    ctx.fillStyle = '#05050e';
    ctx.fillRect(0, 0, w, h);

    const rowH = Math.floor(h / NUM_CH);
    // Vertical layout within each row:
    //   y0 .. y0+freqH  → frequency strip (top)
    //   y0+freqH .. y0+rowH → amplitude waveform (main body)
    const freqH   = Math.max(12, Math.floor(rowH * 0.18)); // freq strip height
    const ampBody = rowH - freqH - 2;                      // amplitude drawable height
    const PAD     = 3;

    for (let ch = 0; ch < NUM_CH; ch++) {
      const y0 = ch * rowH;
      const cc = CH_COLORS[ch];
      const baseY = y0 + rowH - PAD; // Y at amplitude = 0

      // ── Row background: very faint channel tint ────────────────────────
      ctx.fillStyle = `rgba(${cc.r},${cc.g},${cc.b},0.04)`;
      ctx.fillRect(0, y0, w, rowH);

      // ── Build amplitude trace: collect (x, y) points once ─────────────
      const pts = new Float32Array(HIST_LEN * 2);
      for (let xi = 0; xi < HIST_LEN; xi++) {
        const bufIdx = (_histPos + 1 + xi) % HIST_LEN;
        const amp    = _hist[ch][bufIdx];
        pts[xi * 2]     = (xi / (HIST_LEN - 1)) * w;
        pts[xi * 2 + 1] = baseY - amp * (ampBody - PAD);
      }

      // Filled area below trace
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let xi = 1; xi < HIST_LEN; xi++) ctx.lineTo(pts[xi * 2], pts[xi * 2 + 1]);
      ctx.lineTo(w, baseY);
      ctx.lineTo(0, baseY);
      ctx.closePath();
      const fillGrad = ctx.createLinearGradient(0, y0 + freqH, 0, baseY);
      fillGrad.addColorStop(0,   `rgba(${cc.r},${cc.g},${cc.b},0.60)`);
      fillGrad.addColorStop(0.6, `rgba(${cc.r},${cc.g},${cc.b},0.18)`);
      fillGrad.addColorStop(1,   `rgba(${cc.r},${cc.g},${cc.b},0.04)`);
      ctx.fillStyle = fillGrad;
      ctx.fill();

      // Trace line with glow
      ctx.save();
      ctx.shadowColor = `rgba(${cc.r},${cc.g},${cc.b},0.9)`;
      ctx.shadowBlur  = 5;
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let xi = 1; xi < HIST_LEN; xi++) ctx.lineTo(pts[xi * 2], pts[xi * 2 + 1]);
      ctx.strokeStyle = `rgba(${cc.r},${cc.g},${cc.b},1.0)`;
      ctx.lineWidth   = 1.5;
      ctx.stroke();
      ctx.restore();

      // ── Frequency strip (top of row) ───────────────────────────────────
      const freqTop    = y0 + 2;
      const freqBottom = y0 + freqH - 2;
      const freqRange  = freqBottom - freqTop;

      // Filled area under freq trace
      ctx.beginPath();
      let firstFx = 0, firstFy = 0;
      for (let xi = 0; xi < HIST_LEN; xi++) {
        const bufIdx  = (_histPos + 1 + xi) % HIST_LEN;
        const normF   = _histFreq[ch][bufIdx];
        const fx      = (xi / (HIST_LEN - 1)) * w;
        const fy      = freqBottom - normF * freqRange;
        if (xi === 0) { ctx.moveTo(fx, fy); firstFx = fx; firstFy = fy; }
        else            ctx.lineTo(fx, fy);
      }
      ctx.lineTo(w, freqBottom);
      ctx.lineTo(0, freqBottom);
      ctx.closePath();
      ctx.fillStyle = `rgba(${cc.r},${cc.g},${cc.b},0.12)`;
      ctx.fill();

      // Freq trace line
      ctx.save();
      ctx.shadowColor = `rgba(${cc.r},${cc.g},${cc.b},0.5)`;
      ctx.shadowBlur  = 3;
      ctx.beginPath();
      for (let xi = 0; xi < HIST_LEN; xi++) {
        const bufIdx = (_histPos + 1 + xi) % HIST_LEN;
        const normF  = _histFreq[ch][bufIdx];
        const fx     = (xi / (HIST_LEN - 1)) * w;
        const fy     = freqBottom - normF * freqRange;
        if (xi === 0) ctx.moveTo(fx, fy);
        else          ctx.lineTo(fx, fy);
      }
      ctx.strokeStyle = `rgba(${cc.r},${cc.g},${cc.b},0.55)`;
      ctx.lineWidth   = 1;
      ctx.stroke();
      ctx.restore();

      // Freq strip divider
      ctx.strokeStyle = `rgba(${cc.r},${cc.g},${cc.b},0.12)`;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(0, y0 + freqH);
      ctx.lineTo(w, y0 + freqH);
      ctx.stroke();

      // ── Labels ────────────────────────────────────────────────────────
      ctx.fillStyle = CH_CSS[ch];
      ctx.font      = 'bold 10px Arial';
      ctx.fillText(CH_NAMES[ch], 6, y0 + freqH + 13);

      // Live frequency readout
      const curNormF = _histFreq[ch][_histPos];
      const curFreqHz = Math.round(curNormF * 580 + 20);
      ctx.fillStyle = `rgba(${cc.r},${cc.g},${cc.b},0.50)`;
      ctx.font      = '9px Arial';
      ctx.fillText(`${curFreqHz}Hz`, 30, y0 + freqH + 13);

      // ── Live level bar (right edge) ────────────────────────────────────
      const curAmp = _hist[ch][_histPos];
      const barH   = Math.round((rowH - freqH - PAD * 2) * curAmp);
      ctx.fillStyle = `rgba(${cc.r},${cc.g},${cc.b},0.75)`;
      ctx.fillRect(w - 5, baseY - barH, 4, barH);

      // ── Row separator ─────────────────────────────────────────────────
      if (ch < NUM_CH - 1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(0, y0 + rowH);
        ctx.lineTo(w, y0 + rowH);
        ctx.stroke();
      }
    }

    // Corner legend
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font      = '9px Arial';
    ctx.fillText('amp ↑  —— freq  ←time', 6, h - 4);
  }

  // ── UI: param popup ────────────────────────────────────────────────────────
  let _paramPopup = null;

  function openParamPopup(chIdx, itemIdx, kind, anchorEl) {
    closeParamPopup();
    const chain = _chains[chIdx];
    const item  = kind === 'modifier' ? chain.modifiers[itemIdx] : chain.effects[itemIdx];
    if (!item) return;
    const defs = kind === 'modifier' ? MODIFIER_DEFS : EFFECT_DEFS;
    const def  = defs.find(d => d.id === item.defId);
    if (!def || !def.paramDefs || !def.paramDefs.length) return;

    const popup = document.createElement('div');
    popup.className = 'synth-param-popup';
    _paramPopup = popup;

    const title = document.createElement('div');
    title.className = 'synth-param-title';
    title.textContent = def.label;
    popup.appendChild(title);

    const SCALE_LABELS = ['Major', 'Minor', 'Penta', 'Blues'];
    for (const pd of def.paramDefs) {
      const row = document.createElement('div');
      row.className = 'synth-param-row';

      let val = item.params[pd.key];
      if (typeof val !== 'number') val = pd.min;

      const valSpan = document.createElement('span');
      valSpan.className = 'synth-param-val';

      function formatVal(v) {
        if (pd.key === 'up')    return v ? '↑ Up' : '↓ Down';
        if (pd.key === 'scale') return SCALE_LABELS[Math.round(v)] || String(Math.round(v));
        if (pd.step >= 1)       return String(Math.round(v));
        return v.toFixed(2);
      }
      valSpan.textContent = formatVal(val);

      const lbl = document.createElement('label');
      lbl.textContent = pd.label + ' ';
      lbl.appendChild(valSpan);

      const sl = document.createElement('input');
      sl.type  = 'range';
      sl.min   = pd.min;
      sl.max   = pd.max;
      sl.step  = pd.step;
      sl.value = val;
      sl.className = 'synth-param-slider';

      sl.addEventListener('input', () => {
        const v = parseFloat(sl.value);
        item.params[pd.key] = v;
        valSpan.textContent = formatVal(v);
        saveToStorage();
      });

      row.appendChild(lbl);
      row.appendChild(sl);
      popup.appendChild(row);
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'synth-param-close mode-btn';
    closeBtn.textContent = 'Done';
    closeBtn.addEventListener('click', closeParamPopup);
    popup.appendChild(closeBtn);

    document.body.appendChild(popup);

    // Position near anchor
    const rect = anchorEl.getBoundingClientRect();
    const pW = 240;
    popup.style.visibility = 'hidden';
    popup.style.display = 'block';
    const pH = popup.offsetHeight || 200;
    popup.style.visibility = '';

    let left = rect.left;
    let top  = rect.bottom + 8;
    if (left + pW > window.innerWidth  - 10) left = window.innerWidth  - pW - 10;
    if (top  + pH > window.innerHeight - 10) top  = rect.top - pH - 8;
    popup.style.left = `${Math.max(8, left)}px`;
    popup.style.top  = `${Math.max(8, top)}px`;

    // Close on outside click
    setTimeout(() => {
      const outside = (e) => {
        if (!popup.contains(e.target) && popup.isConnected) {
          closeParamPopup();
          document.removeEventListener('click', outside);
        }
      };
      document.addEventListener('click', outside);
    }, 10);
  }

  function closeParamPopup() {
    if (_paramPopup) { try { _paramPopup.remove(); } catch {} _paramPopup = null; }
  }

  // ── UI: modifier palette ──────────────────────────────────────────────────
  let _palette   = null;
  let _paletteCh = -1;

  function buildModifierPalette() {
    if (_palette) { try { _palette.remove(); } catch {} }
    _palette = document.createElement('div');
    _palette.className = 'synth-palette';
    _palette.style.display = 'none';

    for (const def of MODIFIER_DEFS) {
      const chip = document.createElement('button');
      chip.className = 'synth-palette-chip';
      chip.textContent = def.label;
      chip.style.borderColor = def.color;
      chip.style.color = def.color;
      chip.addEventListener('click', () => {
        if (_paletteCh < 0) return;
        _chains[_paletteCh].modifiers.push({
          defId: def.id,
          params: { ...def.params },
          enabled: true,
          _phase: 0,
          _state: null,
        });
        rebuildLane(_paletteCh);
        closePalette();
        saveToStorage();
      });
      _palette.appendChild(chip);
    }
    document.body.appendChild(_palette);
  }

  function openModifierPalette(chIdx, anchor) {
    _paletteCh = chIdx;
    _palette.style.display = 'flex';
    const rect = anchor.getBoundingClientRect();
    const pW = 280;
    let left = rect.left;
    let top  = rect.bottom + 4;
    if (left + pW > window.innerWidth - 10) left = window.innerWidth - pW - 10;
    _palette.style.left = `${Math.max(8, left)}px`;
    _palette.style.top  = `${top}px`;

    setTimeout(() => {
      const outside = (e) => {
        if (!_palette.contains(e.target)) { closePalette(); document.removeEventListener('click', outside); }
      };
      document.addEventListener('click', outside);
    }, 10);
  }

  function closePalette() {
    if (_palette) _palette.style.display = 'none';
    _paletteCh = -1;
  }

  // ── UI: lane building ──────────────────────────────────────────────────────
  let _uiContainer = null;

  function makeModifierBlock(chIdx, modIdx, mod) {
    const def = MODIFIER_DEFS.find(d => d.id === mod.defId) || MODIFIER_DEFS[0];

    const block = document.createElement('div');
    block.className = 'synth-mod-block';
    block.draggable  = true;
    block.dataset.ch  = chIdx;
    block.dataset.mod = modIdx;
    block.style.setProperty('--mod-color', def.color);

    // Status dot
    const dot = document.createElement('span');
    dot.className = 'synth-mod-dot' + (mod.enabled ? ' active' : '');
    dot.title = mod.enabled ? 'Enabled – click to disable' : 'Disabled – click to enable';
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      mod.enabled = !mod.enabled;
      dot.classList.toggle('active', mod.enabled);
      dot.title = mod.enabled ? 'Enabled – click to disable' : 'Disabled – click to enable';
      saveToStorage();
    });

    const label = document.createElement('span');
    label.className   = 'synth-mod-label';
    label.textContent = def.label;

    const removeBtn = document.createElement('button');
    removeBtn.className   = 'synth-mod-remove';
    removeBtn.textContent = '×';
    removeBtn.title       = 'Remove';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      _chains[chIdx].modifiers.splice(modIdx, 1);
      rebuildLane(chIdx);
      saveToStorage();
    });

    block.appendChild(dot);
    block.appendChild(label);
    block.appendChild(removeBtn);

    // Click to edit params
    block.addEventListener('click', (e) => {
      if (e.target === removeBtn || e.target === dot) return;
      openParamPopup(chIdx, modIdx, 'modifier', block);
    });

    // Drag-and-drop
    block.addEventListener('dragstart', (e) => {
      _dragSrcCh  = chIdx;
      _dragSrcIdx = modIdx;
      block.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    block.addEventListener('dragend', () => block.classList.remove('dragging'));

    return block;
  }

  function rebuildLane(chIdx) {
    if (!_uiContainer) return;
    const lane = _uiContainer.querySelector(`.synth-lane-mods[data-ch="${chIdx}"]`);
    if (!lane) return;
    lane.innerHTML = '';

    const chain = _chains[chIdx];
    chain.modifiers.forEach((mod, mi) => lane.appendChild(makeModifierBlock(chIdx, mi, mod)));

    const hint = document.createElement('div');
    hint.className   = 'synth-drop-hint';
    hint.textContent = '+ drop here';
    lane.appendChild(hint);
  }

  function rebuildAllLanes() {
    for (let ch = 0; ch < NUM_CH; ch++) rebuildLane(ch);
  }

  function buildSynthUI(container) {
    _uiContainer = container;
    container.innerHTML = '';

    // ── Toolbar ────────────────────────────────────────────────────────────
    const toolbar = document.createElement('div');
    toolbar.className = 'synth-toolbar';

    const arrBtn = document.createElement('button');
    arrBtn.className   = 'mode-btn synth-tool-btn';
    arrBtn.textContent = '🎼 Arrangements';
    arrBtn.title       = 'Save / load named arrangements';
    arrBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (_arrDlg) { closeArrDlg(); } else { openArrDlg(arrBtn); }
    });

    const clearBtn = document.createElement('button');
    clearBtn.className   = 'mode-btn synth-tool-btn';
    clearBtn.textContent = '🗑 Clear All';
    clearBtn.title       = 'Remove all modifiers and disable all effects';
    clearBtn.addEventListener('click', () => {
      for (let ch = 0; ch < NUM_CH; ch++) {
        _chains[ch].modifiers = [];
        _chains[ch].effects.forEach(e => { e.enabled = false; });
      }
      rebuildAllLanes();
      // Refresh effect chips
      _uiContainer.querySelectorAll('.synth-fx-chip').forEach(chip => {
        chip.classList.remove('active');
        const btn = chip.querySelector('.synth-fx-toggle');
        if (btn) btn.textContent = 'OFF';
      });
      saveToStorage();
    });

    toolbar.appendChild(arrBtn);
    toolbar.appendChild(clearBtn);
    container.appendChild(toolbar);

    // ── Channel lanes ──────────────────────────────────────────────────────
    const lanesEl = document.createElement('div');
    lanesEl.className = 'synth-lanes';
    container.appendChild(lanesEl);

    for (let ch = 0; ch < NUM_CH; ch++) {
      const cc    = CH_CSS[ch];
      const chain = _chains[ch];

      const lane = document.createElement('div');
      lane.className  = 'synth-lane';
      lane.dataset.ch = ch;

      // Header row
      const header = document.createElement('div');
      header.className = 'synth-lane-header';

      const chLabel = document.createElement('span');
      chLabel.className   = 'synth-lane-ch';
      chLabel.textContent = CH_NAMES[ch];
      chLabel.style.color = cc;

      const addBtn = document.createElement('button');
      addBtn.className   = 'synth-add-btn mode-btn';
      addBtn.textContent = '+ Mod';
      addBtn.title       = 'Add a modifier to this channel';
      const capturedCh = ch;
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openModifierPalette(capturedCh, addBtn);
      });

      const fxBtn = document.createElement('button');
      fxBtn.className   = 'synth-fx-btn mode-btn' + (chain.fxOpen ? ' active' : '');
      fxBtn.textContent = 'FX';
      fxBtn.title       = 'Show / hide effects rack';
      fxBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        chain.fxOpen = !chain.fxOpen;
        fxBtn.classList.toggle('active', chain.fxOpen);
        const rack = lane.querySelector('.synth-fx-rack');
        if (rack) rack.style.display = chain.fxOpen ? 'flex' : 'none';
      });

      header.appendChild(chLabel);
      header.appendChild(addBtn);
      header.appendChild(fxBtn);
      lane.appendChild(header);

      // Modifier drop-zone
      const modsRow = document.createElement('div');
      modsRow.className  = 'synth-lane-mods';
      modsRow.dataset.ch = ch;

      modsRow.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        modsRow.classList.add('drag-over');
      });
      modsRow.addEventListener('dragleave', () => modsRow.classList.remove('drag-over'));
      modsRow.addEventListener('drop', (e) => {
        e.preventDefault();
        modsRow.classList.remove('drag-over');
        if (_dragSrcCh < 0) return;
        const srcMod = _chains[_dragSrcCh].modifiers.splice(_dragSrcIdx, 1)[0];
        _chains[ch].modifiers.push(srcMod);
        rebuildLane(_dragSrcCh);
        rebuildLane(ch);
        _dragSrcCh = -1; _dragSrcIdx = -1;
        saveToStorage();
      });
      lane.appendChild(modsRow);

      // Effects rack
      const fxRack = document.createElement('div');
      fxRack.className    = 'synth-fx-rack';
      fxRack.style.display = chain.fxOpen ? 'flex' : 'none';

      chain.effects.forEach((eff, ei) => {
        const effDef  = EFFECT_DEFS[ei];
        const effChip = document.createElement('div');
        effChip.className     = 'synth-fx-chip' + (eff.enabled ? ' active' : '');
        effChip.dataset.ch    = ch;
        effChip.dataset.ei    = ei;
        effChip.style.setProperty('--fx-color', effDef.color);

        const effLabel = document.createElement('span');
        effLabel.textContent = effDef.label;

        const effToggle = document.createElement('button');
        effToggle.className   = 'synth-fx-toggle';
        effToggle.textContent = eff.enabled ? 'ON' : 'OFF';
        effToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          eff.enabled = !eff.enabled;
          effChip.classList.toggle('active', eff.enabled);
          effToggle.textContent = eff.enabled ? 'ON' : 'OFF';
          saveToStorage();
        });

        effChip.appendChild(effLabel);
        effChip.appendChild(effToggle);

        const capturedEi = ei;
        effChip.addEventListener('click', (e) => {
          if (e.target === effToggle) return;
          openParamPopup(ch, capturedEi, 'effect', effChip);
        });

        fxRack.appendChild(effChip);
      });

      lane.appendChild(fxRack);
      lanesEl.appendChild(lane);
    }

    // Populate modifier blocks
    rebuildAllLanes();

    // Build palette
    buildModifierPalette();
  }

  // ── Flash helper ────────────────────────────────────────────────────────
  function synthFlash(btn, msg) {
    const orig = btn.textContent;
    btn.textContent = msg;
    setTimeout(() => { btn.textContent = orig; }, 1400);
  }

  // ── Named arrangements dialog ──────────────────────────────────────────────
  function saveNamedArr(name) {
    name = name.trim();
    if (!name) return false;
    const data = getArrangement();
    const existing = _arrangements.findIndex(a => a.name === name);
    if (existing >= 0) {
      _arrangements[existing].data = data;
    } else {
      _arrangements.push({ name, data });
    }
    saveArrsToStorage();
    return true;
  }

  function loadNamedArr(idx) {
    const entry = _arrangements[idx];
    if (!entry) return;
    loadArrangement(entry.data);
    rebuildAllLanes();
  }

  function deleteNamedArr(idx) {
    _arrangements.splice(idx, 1);
    saveArrsToStorage();
  }

  function saveArrsToStorage() {
    try { localStorage.setItem(ARR_STORAGE_KEY, JSON.stringify(_arrangements)); } catch {}
  }

  function loadArrsFromStorage() {
    try {
      const raw = localStorage.getItem(ARR_STORAGE_KEY);
      if (raw) _arrangements = JSON.parse(raw) || [];
    } catch {}
  }

  function closeArrDlg() {
    if (_arrDlg) { _arrDlg.remove(); _arrDlg = null; }
    document.removeEventListener('click', _arrDlgOutsideClick, true);
  }

  function _arrDlgOutsideClick(e) {
    if (_arrDlg && !_arrDlg.contains(e.target)) closeArrDlg();
  }

  function openArrDlg(anchorEl) {
    closeArrDlg(); // ensure clean slate

    const dlg = document.createElement('div');
    dlg.className = 'synth-arr-dlg';
    dlg.addEventListener('click', e => e.stopPropagation());

    function renderList() {
      list.innerHTML = '';
      if (_arrangements.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'synth-arr-empty';
        empty.textContent = 'No saved arrangements yet.';
        list.appendChild(empty);
        return;
      }
      _arrangements.forEach((entry, i) => {
        const row = document.createElement('div');
        row.className = 'synth-arr-row';

        const nameSpan = document.createElement('span');
        nameSpan.className   = 'synth-arr-name';
        nameSpan.textContent = entry.name;

        const loadBtn = document.createElement('button');
        loadBtn.className   = 'synth-arr-act-btn synth-arr-load';
        loadBtn.textContent = '▶ Load';
        loadBtn.title       = 'Load this arrangement';
        loadBtn.addEventListener('click', () => {
          loadNamedArr(i);
          closeArrDlg();
        });

        const delBtn = document.createElement('button');
        delBtn.className   = 'synth-arr-act-btn synth-arr-del';
        delBtn.textContent = '🗑';
        delBtn.title       = 'Delete this arrangement';
        delBtn.addEventListener('click', () => {
          deleteNamedArr(i);
          renderList();
        });

        row.appendChild(nameSpan);
        row.appendChild(loadBtn);
        row.appendChild(delBtn);
        list.appendChild(row);
      });
    }

    // Title bar
    const title = document.createElement('div');
    title.className   = 'synth-arr-title';
    title.textContent = '🎼 Arrangements';

    const closeX = document.createElement('button');
    closeX.className   = 'synth-arr-close';
    closeX.textContent = '✕';
    closeX.addEventListener('click', closeArrDlg);
    title.appendChild(closeX);

    // List area
    const list = document.createElement('div');
    list.className = 'synth-arr-list';
    renderList();

    // Save footer
    const footer = document.createElement('div');
    footer.className = 'synth-arr-footer';

    const nameInput = document.createElement('input');
    nameInput.type        = 'text';
    nameInput.placeholder = 'Name this arrangement…';
    nameInput.className   = 'synth-arr-input';
    nameInput.maxLength   = 40;

    const saveBtn = document.createElement('button');
    saveBtn.className   = 'synth-arr-act-btn synth-arr-save';
    saveBtn.textContent = '💾 Save Current';
    saveBtn.addEventListener('click', () => {
      if (saveNamedArr(nameInput.value)) {
        nameInput.value = '';
        renderList();
        synthFlash(saveBtn, '✓ Saved');
      } else {
        nameInput.focus();
        nameInput.style.outline = '2px solid #f55';
        setTimeout(() => { nameInput.style.outline = ''; }, 900);
      }
    });
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') saveBtn.click(); });

    footer.appendChild(nameInput);
    footer.appendChild(saveBtn);

    dlg.appendChild(title);
    dlg.appendChild(list);
    dlg.appendChild(footer);
    document.body.appendChild(dlg);
    _arrDlg = dlg;

    // Position near anchor
    const rect = anchorEl.getBoundingClientRect();
    const dw   = dlg.offsetWidth  || 320;
    const dh   = dlg.offsetHeight || 260;
    let left   = rect.left;
    let top    = rect.bottom + 6;
    if (left + dw > window.innerWidth  - 8) left = window.innerWidth  - dw - 8;
    if (top  + dh > window.innerHeight - 8) top  = rect.top - dh - 6;
    if (left < 8) left = 8;
    if (top  < 8) top  = 8;
    dlg.style.left = left + 'px';
    dlg.style.top  = top  + 'px';

    setTimeout(() => document.addEventListener('click', _arrDlgOutsideClick, true), 0);
  }

  // ── Storage ────────────────────────────────────────────────────────────────
  function getArrangement() {
    return _chains.map(ch => ({
      modifiers: ch.modifiers.map(m => ({ defId: m.defId, params: { ...m.params }, enabled: m.enabled })),
      effects:   ch.effects.map(e => ({ defId: e.defId, params: { ...e.params }, enabled: e.enabled })),
      fxOpen:    ch.fxOpen,
    }));
  }

  function loadArrangement(arr) {
    if (!arr || arr.length !== NUM_CH) return;
    for (let ch = 0; ch < NUM_CH; ch++) {
      const src = arr[ch];
      if (!src) continue;
      _chains[ch].modifiers = (src.modifiers || []).map(m => ({
        defId: m.defId,
        params: { ...m.params },
        enabled: m.enabled !== false,
        _phase: 0,
        _state: null,
      }));
      for (const saved of (src.effects || [])) {
        const eff = _chains[ch].effects.find(e => e.defId === saved.defId);
        if (eff) { eff.params = { ...saved.params }; eff.enabled = !!saved.enabled; }
      }
      _chains[ch].fxOpen = !!src.fxOpen;
    }
  }

  function saveToStorage() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(getArrangement())); } catch {}
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) loadArrangement(JSON.parse(raw));
    } catch {}
    loadArrsFromStorage();
  }

  // ── Public API ────────────────────────────────────────────────────────────
  return {
    setEnabled(v) { _enabled = !!v; },
    step,
    renderSlitScan,
    buildSynthUI,
    loadFromStorage,
    saveToStorage,
    getArrangement,
    // Named arrangements (exposed for external tooling if needed)
    saveNamedArrangement: saveNamedArr,
    loadNamedArrangement: loadNamedArr,
    deleteNamedArrangement: deleteNamedArr,
    MODIFIER_DEFS,
    EFFECT_DEFS,

    // Returns a map of { effectId: params } for effects that are currently ON for a channel.
    // Used by the visualizer to modulate particle behaviour.
    getChannelEffects(ch) {
      if (ch < 0 || ch >= NUM_CH) return {};
      const out = {};
      for (const eff of _chains[ch].effects) {
        if (eff.enabled) out[eff.defId] = eff.params;
      }
      return out;
    },

    // Returns per-channel smoothed amplitude history (last written value, 0..1).
    getChannelAmp(ch) {
      return _hist[ch][_histPos] || 0;
    },
  };

})();

window.SynthEngine = SynthEngine;
