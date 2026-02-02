/**
 * Biome Engine v8.0 - Master Cumulative Ecology
 * --------------------------------------------
 * Features:
 * - 6 Unique Biological Structures (Worms, Pulsers, Centipedes, Breathers, Hairy Blobs, Abyssal Pulsars)
 * - 6-Way Predation Loop & Chemotaxis (Food seeking)
 * - Weighted Caretaker Diets (Signature feeding with background variety)
 * - Metabolic Scaling (Hunger affects swimming speed)
 * - Lifecycle: Baby Growth -> Adult Maturity -> Death Dissolution
 * - Visible Diet: Nutrients swirl inside the translucent bodies
 * - Gaussian Bokeh Rendering: Procedural Z-Blur focal plane
 * - Rotifer AI: Parasites hunt and latch to drive audio channels (Fixed Drift Bug)
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
    bacteria: "archaea",      // Breathers eat Pulsers
    archaea: "flagellate",    // Pulsers eat Ticklers
    flagellate: "lattice",    // Ticklers eat Compressors
    lattice: "mycelium",      // Compressors eat Hairy Blobs
    mycelium: "scintillator", // Hairy Blobs eat Abyssal Pulsars
    scintillator: "bacteria"  // Abyssal Pulsars eat Breathers
  };

  const CARETAKER_DIETS = {
    gardener: { sugar: 12, water: 12, carbon: 4 }, // Heavy on growth/blend
    bloom:    { sugar: 15, water: 8,  sulfur: 4 },
    ballast:  { salt: 12,  carbon: 10, iron: 4   },
    ironbeat: { iron: 15,  salt: 5,   sugar: 3  },
    sulfuric: { sulfur: 12, iron: 8,   carbon: 4 },
    drifter:  { water: 15, carbon: 5, salt: 3   }
  };

const SPECIES = {
    bacteria: {
      name: "Breathers", speed: 0.00006, turn: 0.015, wander: 0.02, drag: 0.96,
      coreRadius: 0.015, prefs: ["sugar", "water"], reproduction: "mitosis",
      makeNodes(a, t) {
        // RESTORED HAIRY BLOB: Core nucleus + reactive fluid-drifting cilia
        const ns = [{ x: a.x, y: a.y, z: a.z, r: a.r, rgb: a.currRgb, a: a.currAlpha, s: 0.2 }];
        if (a.state === "alive") {
          const localT = t * a.timeScale;
          for (let i = 0; i < 12; i++) {
            const ang = (i / 12) * TAU + Math.sin(localT * 5 + i);
            const reach = 0.8 + Math.cos(ang - a.heading) * 0.6;
            const ext = 0.9 + 0.1 * Math.sin(localT * 8 + i);
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
        // RESTORED SPIKY STAR: Dense core + jittering defense rays
        const ns = [{ x: a.x, y: a.y, z: a.z, r: a.r, rgb: a.currRgb, a: a.currAlpha, s: 0.1 }];
        if (a.state === "alive") {
          const localT = t * a.timeScale;
          for (let i = 0; i < 6; i++) {
            const ang = (i / 6) * TAU + Math.sin(localT * 15) * 0.05;
            const [dx, dy] = rotate2(a.r * 1.5, 0, ang);
            ns.push({ x: a.x + dx, y: a.y + dy, z: a.z, r: a.r * 0.2, rgb: [255, 255, 255], a: a.currAlpha * 0.4, s: 0.4 });
          }
        }
        return ns;
      }
    },
    flagellate: {
      name: "Comb Jellies", speed: 0.00015, turn: 0.04, wander: 0.05, drag: 0.9,
      coreRadius: 0.012, prefs: ["sulfur", "sugar"], reproduction: "mitosis",
      makeNodes(a, t) {
        // RIBBON FILAMENTS: Two long undulating thin lines
        const ns = [];
        const hv = Math.hypot(a.vx, a.vy) + 1e-9;
        const hx = a.vx / hv, hy = a.vy / hv;
        const ang = Math.atan2(hy, hx);
        ns.push({ x: a.x, y: a.y, z: a.z, r: a.r * 0.8, rgb: [255,255,255], a: a.currAlpha, s: 0.2 });
        for (let side = -1; side <= 1; side += 2) {
          if (side === 0) continue;
          for (let j = 0; j < 10; j++) {
            const wave = Math.sin(t * a.timeScale * 10 - j * 0.6 + a.seed) * a.r * 0.8;
            const [fx, fy] = rotate2(-j * a.r * 0.8, side * a.r * 0.4 + wave, ang);
            ns.push({ x: a.x + fx, y: a.y + fy, z: a.z, r: a.r * 0.1, rgb: [100 + (j/9) * 155, 200, 255], a: a.currAlpha * (1 - j/9), s: 0.2 });
          }
        }
        return ns;
      }
    },
    lattice: {
      name: "Centipedes", speed: 0.00005, turn: 0.01, wander: 0.005, drag: 0.97,
      coreRadius: 0.012, prefs: ["carbon", "salt"], reproduction: "mitosis",
      makeNodes(a, t) {
        // RESTORED CENTIPEDE TUBE: Segmented body with metachronal wave-driven fins
        const ns = [{ x: a.x, y: a.y, z: a.z, r: a.r, rgb: a.currRgb, a: a.currAlpha, s: 0.2 }];
        if (a.state === "alive") {
          const localT = t * a.timeScale;
          for (let i = 0; i < 5; i++) {
            const cx = a.x - Math.cos(a.heading) * i * a.r * 1.4;
            const cy = a.y - Math.sin(a.heading) * i * a.r * 1.4;
            for (let side = -1; side <= 1; side += 2) {
              const wave = Math.sin(localT * 8 - i * 1.2) * 0.5;
              const [fx, fy] = rotate2(a.r * 1.2, side * a.r * (0.8 + wave), a.heading);
              ns.push({ x: cx + fx, y: cy + fy, z: a.z, r: a.r * 0.2, rgb: [255, 255, 255], a: a.currAlpha * 0.3, s: 0.5 });
            }
          }
        }
        return ns;
      }
    },
mycelium: {
      name: "Purple Worms", speed: 0.00015, turn: 0.04, wander: 0.05, drag: 0.9,
      coreRadius: 0.012, prefs: ["sulfur", "sugar"], reproduction: "mitosis",
      makeNodes(a, t) {
        // RESTORED PURPLE WORM: 9-segment sinusoidal undulating chain
        const ns = []; 
        const segs = 9;
        const hv = Math.hypot(a.vx, a.vy) + 1e-9;
        const hx = a.state === "alive" ? a.vx / hv : Math.cos(a.heading);
        const hy = a.state === "alive" ? a.vy / hv : Math.sin(a.heading);
        
        // Individualized wiggle speed
        const wiggleSpeed = 12 * a.timeScale;

        for (let i = 0; i < segs; i++) {
          const u = i / (segs - 1);
          // Wave logic: wiggle propagates down the body
          const wig = (a.state === "alive" ? Math.sin(t * wiggleSpeed + a.seed - i * 0.8) : 0) * (0.3 * a.r);
          
          ns.push({ 
            x: a.x - hx * i * a.r * 0.8 + (-hy) * wig, 
            y: a.y - hy * i * a.r * 0.8 + hx * wig, 
            z: a.z, 
            r: a.r * (1.1 - u * 0.6), 
            a: a.currAlpha, 
            rgb: [205, 140, 235], // Classic Purple
            s: 0.2 
          });
        }
        return ns;
      }
    },
    scintillator: {
      name: "Abyssal Pulsars", speed: 0.00025, turn: 0.12, wander: 0.1, drag: 0.9,
      coreRadius: 0.012, prefs: ["iron", "water"], reproduction: "mitosis",
      makeNodes(a, t) {
        // GHOST COMET: Sharp head + undulated fiber-optic tail
        const ns = [{ x: a.x, y: a.y, z: a.z, r: a.r * 1.2, rgb: [255, 255, 255], a: a.currAlpha, s: 0.05 }];
        const speed = Math.hypot(a.vx, a.vy) * 1200;
        for (let i = 0; i < 6; i++) {
          const ang = a.heading + Math.PI + Math.sin(t * a.timeScale * 10 + i) * 0.2;
          for (let j = 1; j <= 5; j++) {
            const [dx, dy] = rotate2(a.r * (1.2 + speed) * j, 0, ang);
            ns.push({ x: a.x + dx, y: a.y + dy, z: a.z, r: a.r * 0.1, rgb: [160, 220, 255], a: a.currAlpha * (0.8 - j/6), s: 0.1 });
          }
        }
        return ns;
      }
    }
  };

class NutrientBlob {
    constructor(id, nId, x, y, amount) {
      this.id = id; 
      this.nutrientId = nId;
      this.profile = NUTRIENTS[nId] || NUTRIENTS.sugar;
      this.x = x; this.y = y; this.z = rand(-0.1, 0.1);
      this.mass = amount; 
      this.dead = false;
      this.rot = rand(0, TAU);

      // CRYSTAL STRUCTURE: Generate 4 unique needle-like shards
      this.shards = Array.from({length: 4}, () => ({
        ang: rand(0, TAU),
        len: rand(0.6, 1.3),
        off: rand(0, TAU)
      }));
    }

    consume(u) { 
      this.mass -= u; 
      if (this.mass <= 0.01) this.dead = true; 
      return u; 
    }

    step(dt) { 
      this.mass *= (1 - dt * 0.01); 
      this.rot += dt * 0.4; // Slowly rotate the shard structure
      if (this.mass <= 0.01) this.dead = true; 
    }

    getNodes(t) {
      const rBase = 0.005 * (0.5 + 0.5 * this.mass);
      const ns = [];
      
      // 1. Core Spark: Sharp, bright center point
      ns.push({ 
        x: this.x, y: this.y, z: this.z, 
        r: rBase * 1.6, rgb: [255, 255, 255], a: 0.7, s: 0.05 
      });
      
      // 2. Crystalline Shards: Needle lines radiating from center
      // Softness (s) is set very low (0.05) to ensure they are sharp lines, not blurry rings
      this.shards.forEach(s => {
        const drift = Math.sin(t * 1.2 + s.off) * 0.001;
        const [dx, dy] = rotate2(0.014 * s.len * this.mass, 0, s.ang + this.rot);
        ns.push({ 
          x: this.x + dx + drift, y: this.y + dy + drift, z: this.z, 
          r: rBase, rgb: this.profile.tint, a: 0.5, s: 0.05 
        });
      });
      
      return ns;
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
    bacteria: { // Diatoms
      identity: "crystalline click",
      regMul: 2.5, minMul: 2.0, maxMul: 3.0, // High and narrow
      ratios: [1, 1.1, 1.2],
      hopHz: [2.0, 5.0, 8.0],
      glide: 0.5, // Snap to notes
      vibratoHz: [8, 12], vibratoAmt: [0.01, 0.02],
      gate: "staccato", talkiness: 0.4, grit: 0.1,
      echo: { taps: [0.05], gains: [0.3] }
    },
    archaea: { // Radiolars
      identity: "needle sweep",
      regMul: 1.2, minMul: 0.5, maxMul: 4.0, // Wide sweep range
      ratios: [1, 1.5, 2, 0.75],
      hopHz: [0.2, 0.5, 0.8],
      glide: 0.02, // Very slow slides
      vibratoHz: [0.5, 2], vibratoAmt: [0.02, 0.05],
      gate: "swell", talkiness: 0.2, grit: 0.02,
      echo: { taps: [0.4, 0.8], gains: [0.2, 0.1] }
    },
    flagellate: { // Comb Jellies
      identity: "rainbow shimmer",
      regMul: 1.0, minMul: 0.8, maxMul: 1.5,
      ratios: [1, 1.25, 1.33, 1.5, 1.66],
      hopHz: [0.5, 1.5, 3.0],
      glide: 0.15,
      vibratoHz: [4, 7], vibratoAmt: [0.03, 0.08],
      gate: "talk", talkiness: 0.6, grit: 0.05,
      echo: { taps: [0.1, 0.2, 0.3], gains: [0.3, 0.2, 0.1] }
    },
    lattice: { // Rib-Cages
      identity: "deep vertebral thump",
      regMul: 0.4, minMul: 0.3, maxMul: 0.6, // Very low
      ratios: [1, 1.1],
      hopHz: [0.1, 0.3],
      glide: 0.05,
      vibratoHz: [0.1, 0.5], vibratoAmt: [0.01, 0.02],
      gate: "breath", talkiness: 0.1, grit: 0.01,
      echo: { taps: [0.5], gains: [0.4] }
    },
    mycelium: { // Phantom Worms
      identity: "liquid eel",
      regMul: 0.8, minMul: 0.5, maxMul: 2.0,
      ratios: [1, 1.2, 1.4, 1.6],
      hopHz: [0.4, 1.0, 2.0],
      glide: 0.04, // Liquid slides
      vibratoHz: [2, 5], vibratoAmt: [0.05, 0.1],
      gate: "swell", talkiness: 0.3, grit: 0.08,
      echo: { taps: [0.2, 0.4], gains: [0.3, 0.2] }
    },
    scintillator: { // Abyssal Pulsars
      identity: "glitch pulsar",
      regMul: 1.8, minMul: 1.0, maxMul: 5.0,
      ratios: [1, 1.5, 2, 2.5, 3, 4],
      hopHz: [3.0, 6.0, 12.0], // Fast hops
      glide: 0.8, // Immediate snaps
      vibratoHz: [10, 20], vibratoAmt: [0.1, 0.2],
      gate: "staccato", talkiness: 0.9, grit: 0.4,
      echo: { taps: [0.02, 0.05, 0.08], gains: [0.5, 0.3, 0.1] }
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

      const distScore = 1.0 / (0.02 + d);
      const energy = clamp(a.energy ?? 0.8, 0, 2.0);
      const feedBonus = (a.mode === "feed") ? 0.55 : 0.0;

      let famCount = 0;
      const fam = a.speciesId;
      for (const p of world.parasites) {
        if (p === this) continue;
        if (p.state === "latched" && p.host && p.host.state === "alive" && p.host.speciesId === fam) famCount++;
      }
      const diversityBonus = (famCount === 0) ? 0.35 : (famCount === 1 ? 0.12 : -0.10);
      const noise = (Math.random() - 0.5) * 0.05;

      return distScore * 1.15 + energy * 0.25 + feedBonus + diversityBonus + noise;
    }

    detach() {
      if (this.host) this.host.isOccupied = false;
      this.state = "hunting"; 
      this.host = null; 
      this.satiety = 0;
      this.echoEnv = []; 
    }

    step(dt, world) {
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
      } else {
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
          this.x += (Math.random() - 0.5) * 0.002;
          this.y += (Math.random() - 0.5) * 0.002;
        }
      }

      // FIX: Boundary clamping to prevent disappearing
      this.x = clamp(this.x, 0.05, 0.95);
      this.y = clamp(this.y, 0.05, 0.95);
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
      // 1. PRIMARY CONTROL ANCHOR (Fix for CH1/CH3 responsiveness)
      // We check for undefined so that ID 0 (CH1) is correctly recognized
      const multiplier = (chMult && chMult[this.id] !== undefined) ? chMult[this.id] : (this.id + 1);
      const fBase = baseHz * multiplier;

      // 2. DISCONNECT SAFETY
      if (this.state !== "latched" || !this.host || this.host.state !== "alive") {
        this.phase = (this.phase + TAU * fBase * dt) % TAU;
        this.echoEnv = []; 
        return { amp: 0, freq: fBase, phase: this.phase };
      }

      // 3. PERSONALITY & TEMPORAL NOISE
      const fam = this.host.speciesId;
      const lib = SOUND_LIB[fam] || SOUND_LIB.flagellate;
      
      // localT uses individual timeScale so heartbeats never sync up
      const localT = t * (this.host.timeScale || 1.0);
      const speed = Math.hypot(this.host.vx || 0, this.host.vy || 0);
      const speedN = clamp(speed / 0.00022, 0, 1);
      const energy = clamp(this.host.energy || 0, 0, 2.0);

      // Speed-to-Pitch: Increases register as they move faster
      const speedPitchMod = 1.0 + (speedN * 0.5);

      // 4. PITCH HOPPING (Logic decoupled from User Sliders)
      this.hopT -= dt;
      if (this.hopT <= 0) {
        const hopRate = lerp(lib.hopHz ? lib.hopHz[0] : 0.5, lib.hopHz ? lib.hopHz[2] : 2.0, 0.25 + 0.75 * speedN);
        this.hopT = rand(0.12, 0.55) / Math.max(0.25, hopRate);
        const ratios = lib.ratios || [1, 4/3, 3/2, 2];
        
        // Use localT for hash calculation so hop timing is unique per creature
        const s01 = hash01((this.host.seed || 0) * 19.7 + localT * 0.35 + this.id * 3.1);
        this.currRatio = ratios[Math.floor(clamp(s01, 0, 0.9999) * ratios.length)];

        if (Math.random() < 0.45) this._triggerEcho(t, lib, 0.4 * energy);
      }

      // 5. INSTANT SLIDER RESPONSE
      // We calculate targetHz every frame using the live fBase (User Sliders)
      this.targetHz = fBase * (this.currRatio || 1.0) * (lib.regMul || 1.0) * speedPitchMod;
      this.targetHz = clamp(this.targetHz, 20, 1500);

      const resp = this._callAndResponse(t, dt, world, lib, fBase);
      if (resp) this.targetHz = lerp(this.targetHz, resp.hz, 0.65);

      if (!this.noteHz || !Number.isFinite(this.noteHz)) this.noteHz = this.targetHz;
      this.noteHz = lerp(this.noteHz, this.targetHz, (lib.glide || 0.1) + (speedN * 0.1));

      // 6. VIBRATO & ORGANIC JITTER
      const vibHz = lerp(lib.vibratoHz ? lib.vibratoHz[0] : 1, lib.vibratoHz ? lib.vibratoHz[1] : 5, 0.25 + 0.75 * speedN);
      const vibAmt = lerp(lib.vibratoAmt ? lib.vibratoAmt[0] : 0.01, lib.vibratoAmt ? lib.vibratoAmt[1] : 0.05, 0.15 + 0.85 * clamp(energy, 0, 1));
      const vib = 1 + Math.sin(localT * TAU * vibHz + (this.host.seed || 0)) * vibAmt;

      const freqJitter = (Math.random() - 0.5) * (lib.grit || 0) * speedN * this.noteHz;
      const freq = clamp((this.noteHz * vib) + freqJitter, 20, 1500);

      // 7. AMPLITUDE & SPECTRUM FIX
      const gate = gateFor(lib, localT, speedN, (this.host.seed || 0) + this.id * 11.7);
      const dyn = lerp(0.04 + 0.18 * energy, 0.35 + 0.75 * energy, speedN);
      let amp = dyn * gate * energy;
      amp = clamp(amp + this._applyEcho(dt), 0, 1.25);

      // FIX: Strictly capping visual amplitude at 1.0 for the Chart
      const finalAmp = clamp(amp * clamp(this.host.energy, 0, 2.0), 0, 1.0);

      this.phase = (this.phase + TAU * freq * dt) % TAU;
      this.lastPhrase = { amp: finalAmp, hz: freq, t };

      return { amp: finalAmp, freq, phase: this.phase };
    }
  }

class Agent {
    constructor(sid, x, y, isBaby = true) {
      this.id = Math.random(); 
      this.speciesId = sid; 
      this.profile = SPECIES[sid] || SPECIES.bacteria; 
      
      this.x = x; this.y = y; this.z = rand(-0.2, 0.2);
      this.vx = 0; this.vy = 0; this.heading = rand(0, TAU);
      this.seed = rand(0, 100); this.state = "alive"; this.isOccupied = false;
      this.maturity = isBaby ? 0.2 : 1.0; 
      this.energy = 1.0; this.health = 1.0; this.age = 0;

      // FIX: Individualized Heartbeat
      this.timeScale = rand(0.7, 1.3); 

      const colors = { 
        bacteria: [180, 240, 255], archaea: [255, 150, 100], 
        flagellate: [205, 140, 235], lattice: [145, 255, 175], 
        mycelium: [170, 120, 255], scintillator: [180, 230, 255] 
      };
      this.baseRgb = colors[sid] || [255, 255, 255];
      this.currRgb = [...this.baseRgb]; this.currAlpha = 0; this.r = 0; this.stomach = [];
    }

    absorb(rgb, amt) {
      if (this.stomach.length > 8) this.stomach.shift();
      this.stomach.push({ ox: rand(-0.01, 0.01), oy: rand(-0.01, 0.01), rgb: [...rgb], a: 0.6, p: rand(0, TAU) });
      this.energy = clamp(this.energy + amt * 0.6, 0, 2.0);
    }

    step(dt, world) {
      this.age += dt;
      if (this.state === "dying") {
        this.vx *= 0.85; this.vy *= 0.85; 
        this.z = lerp(this.z, -1.0, dt * 0.4);
        this.currAlpha = lerp(this.currAlpha, 0, dt * 0.2);
        if (this.currAlpha < 0.01) this.state = "dead"; 
        return;
      }

      this.maturity = clamp(this.maturity + dt * 0.015, 0.2, 1.0);
      this.r = (this.profile?.coreRadius || 0.01) * this.maturity;
      this.currAlpha = lerp(this.currAlpha, 0.85, dt);

      let targetHeading = this.heading;
      const preyFamily = PREY_MAP[this.speciesId];
      let closestInterest = null; let minDist = 0.3;

      for (const a of world.agents) {
        if (a.speciesId === preyFamily && a.state === "alive") {
          const d = Math.hypot(a.x - this.x, a.y - this.y);
          if (d < minDist) { minDist = d; closestInterest = a; }
        }
      }

      if (!closestInterest) {
        for (const b of world.blobs) {
          if (this.profile?.prefs.includes(b.nutrientId)) {
            const d = Math.hypot(b.x - this.x, b.y - this.y);
            if (d < minDist) { minDist = d; closestInterest = b; }
          }
        }
      }

      if (closestInterest) {
        targetHeading = Math.atan2(closestInterest.y - this.y, closestInterest.x - this.x);
        if (minDist < this.r + 0.015) {
          if (closestInterest instanceof NutrientBlob) {
            this.absorb(closestInterest.profile.tint, closestInterest.consume(dt * 0.2));
          } else { 
            this.absorb(closestInterest.currRgb, 0.5); closestInterest.health = 0; 
          }
        }
      } else { 
        this.heading += (Math.random() - 0.5) * (this.profile?.wander || 0.02); 
      }
      
      // FIX: STRONG CIRCULAR CONTAINMENT
      const distFromCenter = Math.hypot(this.x - 0.5, this.y - 0.5);
      if (distFromCenter > 0.43) {
        const angleToCenter = Math.atan2(0.5 - this.y, 0.5 - this.x);
        // Forcefully steer back and dampen velocity to prevent "glitching" out
        this.heading = lerp(this.heading, angleToCenter, (distFromCenter - 0.43) * 5.0);
        this.vx *= 0.9; 
        this.vy *= 0.9;
      }
      
      if (this.energy > 1.8 && this.maturity > 0.9 && world.agents.length < 60) {
        this.energy = 0.7; 
        world.agents.push(new Agent(this.speciesId, this.x + rand(-0.01, 0.01), this.y + rand(-0.01, 0.01), true));
      }
      
      let hDiff = targetHeading - this.heading;
      while (hDiff < -Math.PI) hDiff += TAU; while (hDiff > Math.PI) hDiff -= TAU;
      this.heading += hDiff * (this.profile?.turn || 0.01);

      // Movement influenced by individual timeScale
      const metabolicMult = (0.25 + (this.energy * 0.75)) * this.timeScale;
      const speed = this.profile?.speed || 0.0001;
      this.vx += Math.cos(this.heading) * speed * metabolicMult;
      this.vy += Math.sin(this.heading) * speed * metabolicMult;
      this.vx *= (this.profile?.drag || 0.95); 
      this.vy *= (this.profile?.drag || 0.95);

      this.x = clamp(this.x + this.vx, 0.01, 0.99); 
      this.y = clamp(this.y + this.vy, 0.01, 0.99);

      this.stomach.forEach(m => { 
        m.p += dt * 4 * this.timeScale; 
        m.ox = Math.sin(m.p) * this.r * 0.5; 
        m.oy = Math.cos(m.p) * this.r * 0.5; 
      });

      this.energy -= dt * 0.007; this.health -= dt * 0.002;
      if (this.energy <= 0.05 || this.health <= 0 || this.age > 180) this.state = "dying";

      this.z = lerp(this.z, Math.sin(world.t * 0.3 * this.timeScale + this.id) * 0.5, 0.02);
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

    init(canvas, getParamsFn) {
      this.canvas = canvas; 
      this.ctx = canvas.getContext("2d"); 
      this.getParams = getParamsFn;
      
      this.agents = []; 
      this.blobs = []; 
      this.spores = [];
      
      const keys = Object.keys(SPECIES);
      for (let i = 0; i < 36; i++) {
        this.agents.push(new Agent(keys[i % keys.length], rand(0.2, 0.8), rand(0.2, 0.8), false));
      }
      
      this.parasites.forEach(p => {
        p.detach(); 
        p.x = rand(0.3, 0.7);
        p.y = rand(0.3, 0.7);
      });

      this.enabled = true;
      this.t = 0; 

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

      if (this.caretaker.enabled && this.caretaker.t > (4.5 / this.caretaker.influence)) {
        this.caretaker.t = 0; 
        this.spawnNutrientByRecipe();
      }

      this.blobs.forEach(b => b.step(safeDt)); 
      this.blobs = this.blobs.filter(b => !b.dead);
      
      this.spores.forEach(s => s.step(safeDt, this)); 
      this.spores = this.spores.filter(s => !s.dead);
      
      this.agents.forEach(a => a.step(safeDt, this)); 
      this.agents = this.agents.filter(a => a.state !== "dead");
      
      this.parasites.forEach(p => p.step(safeDt, this));

      if (this.agents.length < 32) {
        const keys = Object.keys(SPECIES);
        const randomSpecies = keys[Math.floor(rand(0, keys.length))];
        this.agents.push(new Agent(randomSpecies, rand(0.3, 0.7), rand(0.3, 0.7), true));
      }

      const pD = this.getParams();
      this.parasites.forEach((p, i) => {
        const mod = p.audio(this.t, safeDt, pD.baseHz, pD.chMult, this);
        this.audioOut.amp[i] = mod.amp; 
        this.audioOut.freq[i] = mod.freq; 
        this.audioOut.phase[i] = mod.phase;
      });
    }

    spawnNutrientByRecipe() {
      const cId = this.caretaker.id || "gardener";
      const diet = CARETAKER_DIETS[cId] || CARETAKER_DIETS.gardener;
      const allNutrientKeys = Object.keys(NUTRIENTS);
      
      let pool = [];
      let totalWeight = 0;

      allNutrientKeys.forEach(key => {
        let weight = 1 + (diet[key] || 0);
        pool.push({ id: key, w: weight });
        totalWeight += weight;
      });

      let threshold = Math.random() * totalWeight;
      let selectedId = allNutrientKeys[0];

      for (const item of pool) {
        if (threshold < item.w) {
          selectedId = item.id;
          break;
        }
        threshold -= item.w;
      }

      const x = rand(0.3, 0.7);
      const y = rand(0.3, 0.7);
      this.blobs.push(new NutrientBlob(Math.random(), selectedId, x, y, 1.2));
    }

    render() {
      if (!this.ctx || !this.canvas || !this.enabled) return;
      const { offCtx, off, ctx, canvas } = this; 
      const ow = off.width;

      offCtx.globalCompositeOperation = "source-over"; 
      offCtx.fillStyle = "rgb(19, 29, 41)"; 
      offCtx.fillRect(0, 0, ow, ow);

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

      offCtx.globalCompositeOperation = "lighter";
      allNodes.sort((a, b) => a.z - b.z).forEach(n => {
        const df = Math.abs(n.z); 
        const r = clamp(n.r * ow * (1 + df * 3.5), 0.5, 150);
        const softness = clamp((n.s || 0.2) + df * 0.9, 0, 1); 
        const alpha = n.a * (1 - df * 0.65);
        drawGaussianSplat(offCtx, n.x * ow, n.y * ow, r, n.rgb, alpha, softness);
      });

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

  /** 
   * SPECIES DEFINITIONS (v8.0 EXTENSION) 
   * These were placed here to ensure SPECIES object is fully formed.
   */
  SPECIES.mycelium = {
    name: "Hairy Blobs", speed: 0.00004, turn: 0.01, wander: 0.01, drag: 0.98,
    coreRadius: 0.022, prefs: ["carbon", "sulfur"], reproduction: "spores",
    makeNodes(a, t) {
      const ns = [{ x: a.x, y: a.y, z: a.z, r: a.r, rgb: a.currRgb, a: a.currAlpha, s: 0.3 }];
      if (a.state === "alive") {
        const localT = t * a.timeScale;
        // Reduced node count and softness to prevent the "smear ring"
        for (let i = 0; i < 14; i++) {
          const ang = (i / 14) * TAU + Math.sin(localT * 4 + i);
          // Hairs now vary in length and are anchored to the core
          const hairLen = a.r * (1.1 + Math.sin(localT * 5 + i * 2) * 0.4);
          const [dx, dy] = rotate2(hairLen, 0, ang);
          
          // Draw hairs as two nodes to create a "line" look
          ns.push({ x: a.x + dx * 0.5, y: a.y + dy * 0.5, z: a.z, r: a.r * 0.2, rgb: a.currRgb, a: a.currAlpha * 0.5, s: 0.2 });
          ns.push({ x: a.x + dx, y: a.y + dy, z: a.z, r: a.r * 0.15, rgb: a.currRgb, a: a.currAlpha * 0.3, s: 0.1 });
        }
      }
      return ns;
    }
  };

  SPECIES.scintillator = {
    name: "Abyssal Pulsars", speed: 0.0002, turn: 0.1, wander: 0.08, drag: 0.92,
    coreRadius: 0.012, prefs: ["iron", "water"], reproduction: "mitosis",
    makeNodes(a, t) {
      const ns = [{ x: a.x, y: a.y, z: a.z, r: a.r, rgb: [180, 230, 255], a: a.currAlpha, s: 0.05 }];
      if (a.state === "alive") {
        const pulse = Math.sin(t * 10 + a.seed) * 0.5 + 0.5;
        for (let i = 0; i < 8; i++) {
          const tailAng = a.heading + Math.PI + (i-3.5) * 0.2;
          const [dx, dy] = rotate2(a.r * (1.5 + pulse * 0.5), 0, tailAng);
          ns.push({ x: a.x + dx, y: a.y + dy, z: a.z, r: a.r * 0.4, rgb: a.currRgb, a: a.currAlpha * 0.2, s: 0.6 });
        }
      }
      return ns;
    }
  };

})();