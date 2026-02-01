/**
 * Biome Engine v7.0 - Master Cumulative Ecology
 * --------------------------------------------
 * Features:
 * - 4 Unique Biological Structures (Worms, Hairy Blobs, Pulsers, Centipedes)
 * - 4-Way Predation Loop & Chemotaxis (Food seeking)
 * - Metabolic Scaling (Hunger affects swimming speed)
 * - Lifecycle: Baby Growth -> Adult Maturity -> Death Dissolution
 * - Visible Diet: Nutrients swirl inside the translucent bodies
 * - Gaussian Bokeh Rendering: Procedural Z-Blur focal plane
 * - Rotifer AI: Parasites hunt and latch to drive audio channels
 */

(() => {
  "use strict";
  // These are inside the function, so they won't conflict with main.js
  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a = 0, b = 1) => a + Math.random() * (b - a);

  function hash01(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function rotate2(x, y, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [x * c - y * s, x * s + y * c];
  }

  /**
   * Safe Gaussian Splatting
   * Simulates depth-of-field blur without using expensive hardware filters.
   */
  function drawGaussianSplat(ctx, x, y, r, rgb, alpha, softness) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r) || r <= 0.1) return;
    try {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const stop = clamp(0.9 - softness * 0.7, 0.1, 0.9);
      const ri = rgb[0] | 0, gi = rgb[1] | 0, bi = rgb[2] | 0;
      g.addColorStop(0, `rgba(${ri},${gi},${bi},${alpha})`);
      g.addColorStop(stop, `rgba(${ri},${gi},${bi},${alpha * 0.3})`);
      g.addColorStop(1, `rgba(${ri},${gi},${bi}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    } catch (e) {}
  }

  const NUTRIENTS = {
    sugar:  { id: "sugar",  tint: [245, 198, 92], type: "metaball" },
    salt:   { id: "salt",   tint: [138, 188, 255], type: "solid" },
    iron:   { id: "iron",   tint: [236, 103, 92],  type: "solid" },
    water:  { id: "water",  tint: [118, 232, 216], type: "drop" },
    sulfur: { id: "sulfur", tint: [169, 108, 255], type: "drop" },
    carbon: { id: "carbon", tint: [220, 220, 220], type: "metaball" },
  };

  const PREY_MAP = {
    bacteria: "archaea",    // Breathers eat Pulsers
    archaea: "flagellate",  // Pulsers eat Ticklers
    flagellate: "lattice",  // Ticklers eat Compressors
    lattice: "bacteria"     // Compressors eat Breathers
  };

  const SPECIES = {
    bacteria: {
      name: "Breathers", speed: 0.00006, turn: 0.015, wander: 0.02, drag: 0.96,
      coreRadius: 0.015, prefs: ["sugar", "water"], reproduction: "mitosis",
      makeNodes(a, t) {
        // HAIRY BLOB: Core nucleus + reaching/grasping cilia
        const ns = [{ x: a.x, y: a.y, z: a.z, r: a.r, rgb: a.currRgb, a: a.currAlpha, s: 0.2 }];
        if (a.state === "alive") {
          for (let i = 0; i < 10; i++) {
            const ang = (i / 10) * TAU + Math.sin(t * 5 + i);
            const reach = 0.8 + Math.cos(ang - a.heading) * 0.6;
            const ext = 0.9 + 0.1 * Math.sin(t * 8 + i);
            const [dx, dy] = rotate2(a.r * reach * ext, 0, ang);
            ns.push({ x: a.x + dx, y: a.y + dy, z: a.z, r: a.r * 0.2, rgb: a.currRgb, a: a.currAlpha * 0.3, s: 0.6 });
          }
        }
        return ns;
      }
    },
    archaea: {
      name: "Pulsers", speed: 0.0001, turn: 0.03, wander: 0.015, drag: 0.94,
      coreRadius: 0.013, prefs: ["iron", "salt"], reproduction: "spores",
      makeNodes(a, t) {
        // SPIKY STAR: Dense core + jittering defense rays
        const ns = [{ x: a.x, y: a.y, z: a.z, r: a.r, rgb: a.currRgb, a: a.currAlpha, s: 0.1 }];
        if (a.state === "alive") {
          for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * TAU + Math.sin(t * 15) * 0.05;
            const [dx, dy] = rotate2(a.r * 1.5, 0, ang);
            ns.push({ x: a.x + dx, y: a.y + dy, z: a.z, r: a.r * 0.2, rgb: [255, 255, 255], a: a.currAlpha * 0.4, s: 0.4 });
          }
        }
        return ns;
      }
    },
    flagellate: {
      name: "Ticklers", speed: 0.00015, turn: 0.04, wander: 0.05, drag: 0.9,
      coreRadius: 0.01, prefs: ["sulfur", "sugar"], reproduction: "mitosis",
      makeNodes(a, t) {
        // PURPLE WORM: 9-segment sinusoidal undulating chain
        const ns = []; const segs = 9;
        const hv = Math.hypot(a.vx, a.vy) + 1e-9;
        const hx = a.state === "alive" ? a.vx / hv : Math.cos(a.heading);
        const hy = a.state === "alive" ? a.vy / hv : Math.sin(a.heading);
        for (let i = 0; i < segs; i++) {
          const u = i / (segs - 1);
          const wig = (a.state === "alive" ? Math.sin(t * 12 + a.seed - i * 0.8) : 0) * (0.3 * a.r);
          ns.push({ 
            x: a.x - hx * i * a.r * 0.8 + (-hy) * wig, 
            y: a.y - hy * i * a.r * 0.8 + hx * wig, 
            z: a.z, r: a.r * (1.1 - u * 0.6), a: a.currAlpha, rgb: [205, 140, 235], s: 0.2 
          });
        }
        return ns;
      }
    },
    lattice: {
      name: "Compressors", speed: 0.00005, turn: 0.01, wander: 0.005, drag: 0.97,
      coreRadius: 0.016, prefs: ["carbon", "salt"], reproduction: "mitosis",
      makeNodes(a, t) {
        // CENTIPEDE TUBE: Segmented body with metachronal wave-driven fins
        const ns = [{ x: a.x, y: a.y, z: a.z, r: a.r, rgb: a.currRgb, a: a.currAlpha, s: 0.2 }];
        if (a.state === "alive") {
          for (let i = 0; i < 5; i++) {
            const cx = a.x - Math.cos(a.heading) * i * a.r * 1.2;
            const cy = a.y - Math.sin(a.heading) * i * a.r * 1.2;
            for (let side = -1; side <= 1; side += 2) {
              const wave = Math.sin(t * 8 - i * 1.2) * 0.5;
              const [fx, fy] = rotate2(a.r * 1.2, side * a.r * (0.8 + wave), a.heading);
              ns.push({ x: cx + fx, y: cy + fy, z: a.z, r: a.r * 0.2, rgb: [255, 255, 255], a: a.currAlpha * 0.3, s: 0.5 });
            }
          }
        }
        return ns;
      }
    }
  };

  class NutrientBlob {
    constructor(id, nId, x, y, amount) {
      this.id = id; this.nutrientId = nId;
      this.profile = NUTRIENTS[nId] || NUTRIENTS.sugar;
      this.x = x; this.y = y; this.z = rand(-0.3, 0.3);
      this.mass = amount; this.dead = false;
      this.parts = Array.from({length: 3}, () => ({ox: rand(-0.02, 0.02), oy: rand(-0.02, 0.02), p: rand(0, TAU)}));
    }
    consume(u) { this.mass -= u; if (this.mass <= 0.01) this.dead = true; return u; }
    step(dt) { this.mass *= (1 - dt * 0.01); if (this.mass <= 0.01) this.dead = true; }
    getNodes(t) {
      const r = 0.02 * (0.4 + 0.6 * this.mass);
      return this.parts.map(p => ({ 
        x: this.x + p.ox + Math.sin(t + p.p) * 0.005, 
        y: this.y + p.oy + Math.cos(t + p.p) * 0.005, 
        z: this.z, r, rgb: this.profile.tint, a: 0.3, s: 0.6 
      }));
    }
  }

  class Spore {
    constructor(x, y, sid, nid) {
      this.x = x; this.y = y; this.z = -0.4;
      this.sid = sid; this.nid = nid; this.age = 0; this.dead = false;
    }
    step(dt, world) {
      this.age += dt;
      for (const b of world.blobs) {
        if (b.nutrientId === this.nid && Math.hypot(b.x - this.x, b.y - this.y) < 0.06) {
          world.agents.push(new Agent(this.sid, this.x, this.y, true));
          this.dead = true; break;
        }
      }
      if (this.age > 40) this.dead = true;
    }
    node() { return { x: this.x, y: this.y, z: this.z, r: 0.008, rgb: [255, 255, 255], a: 0.2, s: 0.8 }; }
  }

  
  // ---------------------------------------------------------------------------
  // FAMILY SOUND LIBRARIES (monophonic; identity via register + gating + texture)
  // ---------------------------------------------------------------------------
  const SOUND_LIB = {
    bacteria: {
      identity: "breath shimmer",
      regMul: 0.85, minMul: 0.45, maxMul: 2.6,
      ratios: [1, 6/5, 4/3, 3/2, 5/3, 2],
      hopHz: [0.4, 1.0, 2.0],
      vibratoHz: [0.12, 0.35], vibratoAmt: [0.004, 0.015],
      gate: "breath",
      talkiness: 0.35,
      grit: 0.06,
      echo: { taps: [0.08, 0.16, 0.28], gains: [0.35, 0.20, 0.12] },
      phaseReset: false
    },
    archaea: {
      identity: "staccato star",
      regMul: 1.75, minMul: 0.90, maxMul: 4.5,
      ratios: [1, 9/8, 5/4, 4/3, 3/2, 7/4, 2],
      hopHz: [1.0, 3.5, 6.0],
      vibratoHz: [0.0, 0.25], vibratoAmt: [0.0, 0.01],
      gate: "staccato",
      talkiness: 0.22,
      grit: 0.16,
      echo: { taps: [0.05, 0.11, 0.18], gains: [0.25, 0.15, 0.08] },
      phaseReset: true
    },
    flagellate: {
      identity: "talky worms",
      regMul: 1.15, minMul: 0.70, maxMul: 3.8,
      ratios: [1, 9/8, 6/5, 5/4, 4/3, 3/2, 2],
      hopHz: [0.9, 2.8, 5.0],
      vibratoHz: [0.25, 1.1], vibratoAmt: [0.006, 0.03],
      gate: "talk",
      talkiness: 0.55,
      grit: 0.12,
      echo: { taps: [0.09, 0.18, 0.32], gains: [0.32, 0.18, 0.10] },
      phaseReset: false
    },
    lattice: {
      identity: "low swells",
      regMul: 0.55, minMul: 0.30, maxMul: 1.8,
      ratios: [1, 4/3, 3/2, 2, 8/5, 5/3],
      hopHz: [0.25, 0.7, 1.4],
      vibratoHz: [0.05, 0.2], vibratoAmt: [0.002, 0.008],
      gate: "swell",
      talkiness: 0.12,
      grit: 0.08,
      echo: { taps: [0.14, 0.28, 0.46], gains: [0.25, 0.16, 0.10] },
      phaseReset: false
    }
  };

  function gateFor(lib, t, speedN, seed) {
    switch (lib.gate) {
      case "breath": {
        const a = 0.6 + 0.4 * Math.sin(t * 0.9 + seed);
        const sigh = Math.sin(t * 0.7 + seed) > 0.96 ? 1.25 : 1.0;
        return a * sigh;
      }
      case "staccato": {
        const r = 2.2 + 3.0 * speedN;
        return ((t * r) % 1.0) < 0.14 ? 1.3 : 0.05;
      }
      case "talk": {
        const r = 1.2 + 3.2 * speedN;
        const ph = (t * r + seed * 0.17) % 1.0;
        return ph < 0.10 ? 1.25 : (ph < 0.22 ? 0.55 : 0.12);
      }
      case "swell": {
        const a = 0.65 + 0.35 * Math.sin(t * 0.75 + seed);
        return a * a;
      }
      default:
        return 1.0;
    }
  }
class Parasite {
    constructor(id) {
      this.id = id; this.x = rand(0.3, 0.7); this.y = rand(0.3, 0.7); this.z = 0;
      this.heading = rand(0, TAU); this.state = "hunting"; this.host = null; this.satiety = 0;
      this.rgb = [[70, 170, 255], [255, 90, 90], [80, 240, 140], [255, 210, 90]][id % 4];

      // Audio state (monophonic, but expressive)
      this.phase = rand(0, TAU);
      this.noteHz = 0;
      this.targetHz = 0;
      this.hopT = rand(0.12, 0.5);
      this.talkT = rand(0.7, 2.2);
      this.echoEnv = []; // {ttl, age, decay, gain}
      this.lastClick = 0;
      this.lastPhrase = { amp: 0, hz: 0, t: 0 };
      // Forever parasite: never despawn. Opportunistic re-homing.
      this.rehomeCooldown = rand(0.5, 1.5);
      this.commitLeft = 0;

    }

    _scoreHost(a, world) {
      if (!a || a.state !== "alive") return -1e9;

      const dx = a.x - this.x, dy = a.y - this.y;
      const d = Math.hypot(dx, dy);

      // Closer is much better
      const distScore = 1.0 / (0.02 + d);

      // Prefer energetic / feeding hosts (more expressive)
      const energy = clamp(a.energy ?? 0.8, 0, 2.0);
      const feedBonus = (a.mode === "feed") ? 0.55 : 0.0;

      // Diversity bonus: prefer families not already represented by other latched parasites
      let famCount = 0;
      const fam = a.speciesId;
      for (const p of world.parasites) {
        if (p === this) continue;
        if (p.state === "latched" && p.host && p.host.state === "alive" && p.host.speciesId === fam) famCount++;
      }
      const diversityBonus = (famCount === 0) ? 0.35 : (famCount === 1 ? 0.12 : -0.10);

      // Tiny noise to prevent perfect determinism
      const noise = (Math.random() - 0.5) * 0.05;

      return distScore * 1.15 + energy * 0.25 + feedBonus + diversityBonus + noise;
    }


    step(dt, world) {
      // Parasites live forever (never despawn). They may re-home opportunistically.

      // Cooldowns to prevent thrashing
      this.rehomeCooldown = Math.max(0, this.rehomeCooldown - dt);
      this.commitLeft = Math.max(0, this.commitLeft - dt);
      const canConsiderSwitch = (this.rehomeCooldown <= 0 && this.commitLeft <= 0);

      if (this.state === "latched") {
        // Host died -> detach and hunt again
        if (!this.host || this.host.state !== "alive") {
          this.detach();
          this.rehomeCooldown = rand(0.2, 0.6);
          return;
        }

        // Stick to host
        this.x = lerp(this.x, this.host.x, 0.12);
        this.y = lerp(this.y, this.host.y, 0.12);

        // Consider a better host nearby
        if (canConsiderSwitch) {
          const currentScore = this._scoreHost(this.host, world);

          let best = null;
          let bestScore = currentScore;

          const R = 0.18; // local search radius
          for (const a of world.agents) {
            if (!a || a.state !== "alive") continue;
            if (a.isOccupied && a !== this.host) continue;

            const d = Math.hypot(a.x - this.x, a.y - this.y);
            if (d > R) continue;

            const s = this._scoreHost(a, world);
            if (s > bestScore) { bestScore = s; best = a; }
          }

          // Hysteresis threshold avoids constant swapping
          if (best && bestScore > currentScore + 0.65) {
            // Switch hosts
            this.host.isOccupied = false;
            this.host = best;
            best.isOccupied = true;
            this.commitLeft = rand(0.8, 2.0);
            this.rehomeCooldown = rand(0.6, 1.6);
          } else {
            // Don't rescore every frame
            this.rehomeCooldown = rand(0.25, 0.6);
          }
        }

        // No satiety-based forced detach anymore
        this.satiety = 0;
        return;
      }

      // Hunting state
      this.state = "hunting";
      this.host = null;
      this.satiety = 0;

      // Find best host candidate in a wider radius
      let best = null;
      let bestScore = -1e9;
      const R = 0.35;
      for (const a of world.agents) {
        if (!a || a.state !== "alive") continue;
        if (a.isOccupied) continue;

        const d = Math.hypot(a.x - this.x, a.y - this.y);
        if (d > R) continue;

        const s = this._scoreHost(a, world);
        if (s > bestScore) { bestScore = s; best = a; }
      }

      if (best) {
        const ang = Math.atan2(best.y - this.y, best.x - this.x);
        this.heading = lerp(this.heading, ang, 0.05);
        this.x += Math.cos(this.heading) * 0.003;
        this.y += Math.sin(this.heading) * 0.003;

        if (Math.hypot(best.x - this.x, best.y - this.y) < 0.025) {
          this.state = "latched";
          this.host = best;
          best.isOccupied = true;
          this.commitLeft = rand(0.8, 2.0);
          this.rehomeCooldown = rand(0.4, 1.0);
        }
      } else {
        // wander
        this.x += (Math.random() - 0.5) * 0.001;
        this.y += (Math.random() - 0.5) * 0.001;
      }
    }

    detach() {
      if (this.host) this.host.isOccupied = false;
      this.state = "hunting"; 
      this.host = null; 
      this.satiety = 0;
      this.echoEnv = []; // Fix: Immediately kill audio echo tails on detach
    }

    step(dt, world) {
      // Parasites live forever (never despawn). They may re-home opportunistically.
      // Cooldowns to prevent thrashing
      this.rehomeCooldown = Math.max(0, this.rehomeCooldown - dt);
      this.commitLeft = Math.max(0, this.commitLeft - dt);
      const canConsiderSwitch = (this.rehomeCooldown <= 0 && this.commitLeft <= 0);

      if (this.state === "latched") {
        if (!this.host || this.host.state !== "alive") {
          this.detach();
          this.rehomeCooldown = rand(0.2, 0.6);
          return;
        }
        this.x = lerp(this.x, this.host.x, 0.12);
        this.y = lerp(this.y, this.host.y, 0.12);

        if (canConsiderSwitch) {
          const currentScore = this._scoreHost(this.host, world);
          let best = null;
          let bestScore = currentScore;
          const R = 0.18; 
          for (const a of world.agents) {
            if (!a || a.state !== "alive") continue;
            if (a.isOccupied && a !== this.host) continue;
            const d = Math.hypot(a.x - this.x, a.y - this.y);
            if (d > R) continue;
            const s = this._scoreHost(a, world);
            if (s > bestScore) { bestScore = s; best = a; }
          }
          if (best && bestScore > currentScore + 0.65) {
            this.host.isOccupied = false;
            this.host = best;
            best.isOccupied = true;
            this.commitLeft = rand(0.8, 2.0);
            this.rehomeCooldown = rand(0.6, 1.6);
          } else {
            this.rehomeCooldown = rand(0.25, 0.6);
          }
        }
        return;
      }

      this.state = "hunting";
      this.host = null;
      let best = null;
      let bestScore = -1e9;
      const R = 0.35;
      for (const a of world.agents) {
        if (!a || a.state !== "alive" || a.isOccupied) continue;
        const d = Math.hypot(a.x - this.x, a.y - this.y);
        if (d > R) continue;
        const s = this._scoreHost(a, world);
        if (s > bestScore) { bestScore = s; best = a; }
      }

      if (best) {
        const ang = Math.atan2(best.y - this.y, best.x - this.x);
        this.heading = lerp(this.heading, ang, 0.05);
        this.x += Math.cos(this.heading) * 0.003;
        this.y += Math.sin(this.heading) * 0.003;
        if (Math.hypot(best.x - this.x, best.y - this.y) < 0.025) {
          this.state = "latched";
          this.host = best;
          best.isOccupied = true;
          this.commitLeft = rand(0.8, 2.0);
          this.rehomeCooldown = rand(0.4, 1.0);
        }
      } else {
        this.x += (Math.random() - 0.5) * 0.001;
        this.y += (Math.random() - 0.5) * 0.001;
      }
    }

    getNodes(t) {
      const ns = [];
      for (let i = 0; i < 3; i++) {
        const [dx, dy] = rotate2(0.012, 0, t * 15 + (i / 3) * TAU);
        ns.push({ x: this.x + dx, y: this.y + dy, z: this.z, r: 0.005, rgb: this.rgb, a: 0.5, s: 0.5 });
      }
      ns.push({ x: this.x, y: this.y, z: this.z, r: 0.01, rgb: this.rgb, a: 1.0, s: 0.1 });
      const t1 = rotate2(-0.015, 0.005, this.heading);
      const t2 = rotate2(-0.015, -0.005, this.heading);
      ns.push({ x: this.x + t1[0], y: this.y + t1[1], z: this.z, r: 0.004, rgb: this.rgb, a: 0.7, s: 0.3 });
      ns.push({ x: this.x + t2[0], y: this.y + t2[1], z: this.z, r: 0.004, rgb: this.rgb, a: 0.7, s: 0.3 });
      return ns;
    }

    _triggerEcho(t, lib, amp) {
      const e = lib.echo;
      if (!e || !e.taps || !e.gains) return;
      for (let i = 0; i < e.taps.length; i++) {
        const tap = e.taps[i];
        const gain = e.gains[i] * amp;
        this.echoEnv.push({ ttl: tap, age: 0, decay: Math.max(0.03, tap * 0.7), gain });
      }
    }

    _applyEcho(dt) {
      let add = 0;
      for (const env of this.echoEnv) {
        env.ttl -= dt;
        env.age += dt;
        if (env.ttl > 0) add += env.gain * Math.exp(-env.age / env.decay);
      }
      this.echoEnv = this.echoEnv.filter(e => e.ttl > 0);
      return add;
    }

    _callAndResponse(t, dt, world, lib, fBase) {
      // Speak only when latched
      if (this.state !== "latched") return null;
      this.talkT -= dt;
      if (this.talkT > 0) return null;
      this.talkT = rand(0.7, 2.5) / Math.max(0.15, lib.talkiness || 0.2);

      if (!this.host) return null;
      let best = null;
      let bd = 999;
      for (const p of world.parasites) {
        if (p === this) continue;
        if (p.state !== "latched" || !p.host) continue;
        const d = Math.hypot(p.host.x - this.host.x, p.host.y - this.host.y);
        if (d < bd) { bd = d; best = p; }
      }
      if (!best || bd > 0.18) return null;

      const ph = best.lastPhrase;
      if (!ph || ph.amp <= 0.02 || ph.hz <= 0) return null;

      const ratios = lib.ratios || [1, 4/3, 3/2, 2];
      const s01 = hash01(this.id * 17.13 + t * 0.23 + this.host.seed);
      const r = ratios[Math.floor(clamp(s01, 0, 0.999999) * ratios.length)];
      const target = clamp(ph.hz * r, fBase * lib.minMul, fBase * lib.maxMul);
      return { hz: target, amp: clamp(ph.amp * rand(0.45, 0.85), 0, 1) };
    }

    audio(t, dt, baseHz, chMult, world) {
      const fBase = baseHz * (chMult?.[this.id] || (this.id + 1));

      // STRICT AUDIO GATE: Absolute silence if not fully latched to an alive host
      if (this.state !== "latched" || !this.host || this.host.state !== "alive") {
        this.phase = (this.phase + TAU * fBase * dt) % TAU;
        this.echoEnv = []; // Safety purge
        return { amp: 0, freq: fBase, phase: this.phase };
      }

      const fam = this.host.speciesId;
      const lib = SOUND_LIB[fam] || SOUND_LIB.flagellate;
      const speed = Math.hypot(this.host.vx || 0, this.host.vy || 0);
      const speedN = clamp(speed / 0.00022, 0, 1);
      const energy = clamp(this.host.energy || 0, 0, 2.0);

      const whisper = 0.04 + 0.18 * clamp(energy, 0, 1);
      const yell = 0.35 + 0.75 * (0.35 * speedN + 0.65 * clamp(energy, 0, 1));
      const dyn = lerp(whisper, yell, clamp(energy, 0, 1));

      this.hopT -= dt;
      if (this.hopT <= 0) {
        const hopRate = lerp(lib.hopHz[0], lib.hopHz[2], 0.25 + 0.75 * speedN);
        this.hopT = rand(0.12, 0.55) / Math.max(0.25, hopRate);
        const ratios = lib.ratios || [1, 4/3, 3/2, 2];
        const s01 = hash01((this.host.seed || 0) * 19.7 + t * 0.35 + this.id * 3.1);
        const r = ratios[Math.floor(clamp(s01, 0, 0.999999) * ratios.length)];
        this.targetHz = clamp(fBase * r * lib.regMul, fBase * lib.minMul, fBase * lib.maxMul);
        if (Math.random() < 0.45) this._triggerEcho(t, lib, clamp(dyn, 0, 1));
      }

      const resp = this._callAndResponse(t, dt, world, lib, fBase);
      if (resp) {
        this.targetHz = lerp(this.targetHz || fBase, resp.hz, 0.65);
        this._triggerEcho(t, lib, resp.amp);
      }

      if (!this.noteHz || !Number.isFinite(this.noteHz)) this.noteHz = this.targetHz || fBase;
      this.noteHz = lerp(this.noteHz, this.targetHz || fBase, 0.06 + 0.16 * speedN);

      const vibHz = lerp(lib.vibratoHz[0], lib.vibratoHz[1], 0.25 + 0.75 * speedN);
      const vibAmt = lerp(lib.vibratoAmt[0], lib.vibratoAmt[1], 0.15 + 0.85 * clamp(energy, 0, 1));
      const vib = 1 + Math.sin(t * TAU * vibHz + (this.host.seed || 0)) * vibAmt;

      const gate = gateFor(lib, t, speedN, (this.host.seed || 0) + this.id * 11.7);
      let amp = dyn * gate * clamp(energy, 0, 1.5);
      amp = clamp(amp + this._applyEcho(dt), 0, 1.25);

      const jitter = (Math.random() - 0.5) * (lib.grit || 0) * (0.35 + 0.65 * speedN);
      if (lib.phaseReset && gate > 1.0 && (t - this.lastClick) > 0.06) {
        this.lastClick = t;
        this.phase = rand(0, TAU);
      }

      const freq = this.noteHz * vib;
      this.phase = (this.phase + TAU * freq * dt + jitter) % TAU;
      this.lastPhrase = { amp, hz: freq, t };

      return { amp: amp * clamp(this.host.energy, 0, 2.0), freq, phase: this.phase };
    }
  }

  class Agent {
    constructor(sid, x, y, isBaby = true) {
      this.id = Math.random(); this.speciesId = sid; this.profile = SPECIES[sid];
      this.x = x; this.y = y; this.z = rand(-0.2, 0.2);
      this.vx = 0; this.vy = 0; this.heading = rand(0, TAU);
      this.seed = rand(0, 100); this.state = "alive"; this.isOccupied = false;
      this.maturity = isBaby ? 0.2 : 1.0;
      this.energy = 1.0; this.health = 1.0; this.age = 0;
      this.baseRgb = sid === "flagellate" ? [205, 140, 235] : (sid === "bacteria" ? [80, 215, 225] : (sid === "archaea" ? [235, 170, 85] : [145, 225, 175]));
      this.currRgb = [...this.baseRgb];
      this.currAlpha = 0; this.r = 0; this.stomach = [];
    }
    absorb(rgb, amt) {
      if (this.stomach.length > 8) this.stomach.shift();
      this.stomach.push({ ox: rand(-0.01, 0.01), oy: rand(-0.01, 0.01), rgb: [...rgb], a: 0.6, p: rand(0, TAU) });
      this.energy = clamp(this.energy + amt * 0.6, 0, 2.0);
    }
    step(dt, world) {
      this.age += dt;
      if (this.state === "dying") {
        this.vx *= 0.85; this.vy *= 0.85; this.z = lerp(this.z, -1.0, dt * 0.4);
        this.currAlpha = lerp(this.currAlpha, 0, dt * 0.2);
        this.currRgb = this.currRgb.map(c => lerp(c, 40, dt * 0.4));
        if (this.currAlpha < 0.01) this.state = "dead"; return;
      }
      this.maturity = clamp(this.maturity + dt * 0.015, 0.2, 1.0);
      this.r = this.profile.coreRadius * this.maturity;
      this.currAlpha = lerp(this.currAlpha, 0.85, dt);
      let targetHeading = this.heading;
      const preyFamily = PREY_MAP[this.speciesId];
      let closestInterest = null; let minDist = 0.3;
      if (this.energy < 0.4 && this.maturity > 0.6) {
        for (const a of world.agents) {
          if (a.speciesId === preyFamily && a.state === "alive") {
            const d = Math.hypot(a.x - this.x, a.y - this.y);
            if (d < minDist) { minDist = d; closestInterest = a; }
          }
        }
      }
      if (!closestInterest) {
        for (const b of world.blobs) {
          if (this.profile.prefs.includes(b.nutrientId)) {
            const d = Math.hypot(b.x - this.x, b.y - this.y);
            if (d < minDist) { minDist = d; closestInterest = b; }
          }
        }
      }
      if (closestInterest) {
        targetHeading = Math.atan2(closestInterest.y - this.y, closestInterest.x - this.x);
        if (minDist < this.r + 0.015) {
          if (closestInterest instanceof NutrientBlob) this.absorb(closestInterest.profile.tint, closestInterest.consume(dt * 0.2));
          else { this.absorb(closestInterest.currRgb, 0.5); closestInterest.health = 0; }
        }
      } else { this.heading += (Math.random() - 0.5) * this.profile.wander; }
      if (this.energy > 1.8 && this.maturity > 0.9 && world.agents.length < 60) {
        this.energy = 0.7; world.agents.push(new Agent(this.speciesId, this.x + rand(-0.01, 0.01), this.y + rand(-0.01, 0.01), true));
      }
      let hDiff = targetHeading - this.heading;
      while (hDiff < -Math.PI) hDiff += TAU; while (hDiff > Math.PI) hDiff -= TAU;
      this.heading += hDiff * this.profile.turn;
      const metabolicMult = 0.25 + (this.energy * 0.75);
      this.vx += Math.cos(this.heading) * this.profile.speed * metabolicMult;
      this.vy += Math.sin(this.heading) * this.profile.speed * metabolicMult;
      this.vx *= this.profile.drag; this.vy *= this.profile.drag;
      this.x = clamp(this.x + this.vx, 0.02, 0.98); this.y = clamp(this.y + this.vy, 0.02, 0.98);
      if (Math.hypot(this.x - 0.5, this.y - 0.5) > 0.43) this.heading = lerp(this.heading, Math.atan2(0.5 - this.y, 0.5 - this.x), 0.1);
      this.stomach.forEach(m => { m.p += dt * 4; m.ox = Math.sin(m.p) * this.r * 0.5; m.oy = Math.cos(m.p) * this.r * 0.5; });
      this.energy -= dt * 0.007; this.health -= dt * 0.002;
      if (this.energy <= 0.05 || this.health <= 0 || this.age > 180) this.state = "dying";
      this.z = lerp(this.z, Math.sin(world.t * 0.3 + this.id) * 0.5, 0.02);
    }
  }

class World {
    constructor() {
      this.agents = []; 
      this.blobs = []; 
      this.spores = [];
      this.parasites = [new Parasite(0), new Parasite(1), new Parasite(2), new Parasite(3)];
      this.t = 0; 
      this.enabled = false;
      this.audioOut = { amp: [0, 0, 0, 0], freq: [200, 200, 200, 200], phase: [0, 0, 0, 0] };
      this.off = document.createElement("canvas"); 
      this.offCtx = this.off.getContext("2d");
      this.off.width = this.off.height = 400;
      this.caretaker = { id: "gardener", enabled: true, influence: 1.0, t: 0 };
    }

    /**
     * Patched Init: Ensures agents exist and parasites are reset 
     * before the engine starts ticking to prevent the "frozen" bug.
     */
    init(canvas, getParamsFn) {
      this.canvas = canvas; 
      this.ctx = canvas.getContext("2d"); 
      this.getParams = getParamsFn;
      
      this.agents = []; 
      this.blobs = []; 
      this.spores = [];
      
      // 1. Populate agents first so parasites have valid targets immediately
      const keys = Object.keys(SPECIES);
      for (let i = 0; i < 36; i++) {
        this.agents.push(new Agent(keys[i % keys.length], rand(0.2, 0.8), rand(0.2, 0.8), false));
      }
      
      // 2. Explicitly reset Parasites so they start fresh hunting logic on frame 1
      this.parasites.forEach(p => {
        p.detach(); // Clears host and resets state to "hunting"
        p.x = rand(0.3, 0.7);
        p.y = rand(0.3, 0.7);
      });

      this.enabled = true;
      this.t = 0; // Reset internal clock

      // 3. Inject CSS to hide standard control cursors while in Biome mode
      const styleId = "biome-ui-fix";
      if (!document.getElementById(styleId)) {
        const s = document.createElement('style'); s.id = styleId;
        s.textContent = `body[data-mode="biome"] #visCursorFreq, body[data-mode="biome"] #visCursorAmp, body[data-mode="biome"] .vis-cursor, body[data-mode="biome"] .vis-crosshair { display: none !important; opacity: 0 !important; pointer-events: none !important; }`;
        document.head.appendChild(s);
      }
    }

    step(dt) {
      if (!this.enabled) return;
      const safeDt = clamp(dt, 0.001, 0.05); 
      this.t += safeDt;
      this.caretaker.t += safeDt;

      // Caretaker spawning logic
      if (this.caretaker.enabled && this.caretaker.t > (4.5 / this.caretaker.influence)) {
        this.caretaker.t = 0; 
        this.spawnNutrientByRecipe();
      }

      // Update world objects
      this.blobs.forEach(b => b.step(safeDt)); 
      this.blobs = this.blobs.filter(b => !b.dead);
      
      this.spores.forEach(s => s.step(safeDt, this)); 
      this.spores = this.spores.filter(s => !s.dead);
      
      this.agents.forEach(a => a.step(safeDt, this)); 
      this.agents = this.agents.filter(a => a.state !== "dead");
      
      this.parasites.forEach(p => p.step(safeDt, this));

      // Population maintenance
      if (this.agents.length < 24) {
        this.agents.push(new Agent(Object.keys(SPECIES)[Math.floor(rand(0, 4))], rand(0.4, 0.6), rand(0.4, 0.6), true));
      }

      // Bridge to Audio Output
      const pD = this.getParams();
      this.parasites.forEach((p, i) => {
        const mod = p.audio(this.t, safeDt, pD.baseHz, pD.chMult, this);
        this.audioOut.amp[i] = mod.amp; 
        this.audioOut.freq[i] = mod.freq; 
        this.audioOut.phase[i] = mod.phase;
      });
    }

    spawnNutrientByRecipe() {
      const recipes = { 
        gardener: ["sugar", "water", "carbon"], 
        bloom: ["sugar", "sugar", "water"], 
        ballast: ["salt", "carbon", "carbon"], 
        ironbeat: ["iron", "iron", "water"], 
        sulfuric: ["sulfur", "iron", "sugar"], 
        drifter: ["water", "carbon", "water"] 
      };
      const list = recipes[this.caretaker.id] || recipes.gardener;
      this.blobs.push(new NutrientBlob(Math.random(), list[Math.floor(rand(0, list.length))], rand(0.3, 0.7), rand(0.3, 0.7), 1.2));
    }

    render() {
      if (!this.ctx || !this.canvas || !this.enabled) return;
      const { offCtx, off, ctx, canvas } = this; 
      const ow = off.width;

      // Draw background
      offCtx.globalCompositeOperation = "source-over"; 
      offCtx.fillStyle = "rgb(19, 29, 41)"; 
      offCtx.fillRect(0, 0, ow, ow);

      // Collect all visible nodes
      const allNodes = [];
      this.blobs.forEach(b => allNodes.push(...b.getNodes(this.t)));
      this.agents.forEach(a => {
        const res = a.profile.makeNodes(a, this.t); 
        allNodes.push(...(Array.isArray(res) ? res : res.nodes));
        a.stomach.forEach(m => {
          allNodes.push({ x: a.x + m.ox, y: a.y + m.oy, z: a.z, r: a.r * 0.35, rgb: m.rgb, a: m.a, s: 0.8 });
        });
      });
      this.parasites.forEach(p => allNodes.push(...p.getNodes(this.t)));

      // Render nodes with depth sorting (Z-Index)
      offCtx.globalCompositeOperation = "lighter";
      allNodes.sort((a, b) => a.z - b.z).forEach(n => {
        const df = Math.abs(n.z); 
        const r = clamp(n.r * ow * (1 + df * 3.5), 0.5, 150);
        const softness = clamp((n.s || 0.2) + df * 0.9, 0, 1); 
        const alpha = n.a * (1 - df * 0.65);
        drawGaussianSplat(offCtx, n.x * ow, n.y * ow, r, n.rgb, alpha, softness);
      });

      // Composite to main canvas
      const cw = canvas.width; 
      ctx.setTransform(1, 0, 0, 1, 0, 0); 
      ctx.fillStyle = "black"; 
      ctx.fillRect(0, 0, cw, cw);
      
      ctx.save(); 
      ctx.beginPath(); 
      ctx.arc(cw / 2, cw / 2, cw * 0.485, 0, TAU); 
      ctx.clip();
      
      ctx.imageSmoothingEnabled = true; 
      ctx.drawImage(off, 0, 0, ow, ow, 0, 0, cw, cw);

      // Draw Parasite HUD indicators
      this.parasites.forEach(p => {
        const px = p.x * cw, py = p.y * cw; 
        ctx.beginPath(); 
        ctx.strokeStyle = `rgb(${p.rgb.join(',')})`; 
        ctx.lineWidth = 3;
        const pulse = p.state === "latched" ? Math.sin(this.t * 12) * 3 : 0;
        ctx.arc(px, py, 14 + pulse, 0, TAU); 
        ctx.stroke();
        
        ctx.beginPath(); 
        ctx.fillStyle = "white"; 
        ctx.arc(px, py, 3, 0, TAU); 
        ctx.fill();
      });

      // Vignette effect
      const vg = ctx.createRadialGradient(cw/2, cw/2, cw*0.2, cw/2, cw/2, cw*0.5);
      vg.addColorStop(0, "transparent"); 
      vg.addColorStop(1, "rgba(0,0,0,0.85)");
      ctx.fillStyle = vg; 
      ctx.fillRect(0, 0, cw, cw); 
      ctx.restore();
    }
  }

  const engine = new World();

  /**
   * Global Biome API
   */
  window.BiomeEngine = {
    init: (c, g) => engine.init(c, g),
    setEnabled: (v) => engine.enabled = v,
    isEnabled: () => engine.enabled,
    step: (dt) => engine.step(dt),
    render: () => engine.render(),
    getAudioOutputs: () => engine.audioOut,
    feed: (id) => {
      engine.blobs.push(new NutrientBlob(Math.random(), id, rand(0.3, 0.7), rand(0.3, 0.7), 1.2));
    },
    setCaretaker: (id, en, inf) => { 
      engine.caretaker.id = id; 
      engine.caretaker.enabled = en; 
      engine.caretaker.influence = clamp(inf, 0.1, 5.0); 
    },
    setCaretakerEnabled: (v) => engine.caretaker.enabled = v,
    setCaretakerIntensity: (v) => {
      engine.caretaker.influence = clamp(v / 100, 0.1, 5.0);
    }
  };
})();