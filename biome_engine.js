/**
 * Biome Engine v10.0 - Deep-Sea Menagerie
 * ----------------------------------------
 * Features:
 * - 10 Unique Biological Structures (Jellyfish, Radiolarians, Siphonophores, Polychaetes,
 *   Nudibranchs, Glass Squids, Ctenophores, Mantis Shrimp, Pyrosomes, Sea Angels)
 * - 10-Way Predation Loop & Chemotaxis (Food seeking)
 * - 10 Gate Patterns: wave, heartbeat, stroke, thrust, swell, buzz, ripple, gallop, tease, flutter
 * - ADSR Drift: each creature slowly evolves its own envelope timing for individual variation
 * - Weighted Caretaker Diets (Signature feeding with background variety)
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

  // 10-way predation cycle
  const PREY_MAP = {
    bacteria:     "archaea",      // Jellyfish eat Radiolarians
    archaea:      "flagellate",   // Radiolarians eat Siphonophores
    flagellate:   "lattice",      // Siphonophores eat Polychaetes
    lattice:      "mycelium",     // Polychaetes eat Nudibranchs
    mycelium:     "scintillator", // Nudibranchs eat Glass Squids
    scintillator: "ctenophore",   // Glass Squids eat Ctenophores
    ctenophore:   "mantis",       // Ctenophores eat Mantis Shrimp
    mantis:       "pyrosome",     // Mantis Shrimp eat Pyrosomes
    pyrosome:     "seaangel",     // Pyrosomes eat Sea Angels
    seaangel:     "bacteria"      // Sea Angels eat Jellyfish
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

    // ── JELLYFISH ──────────────────────────────────────────────────────────────
    // Pulsing bell + trailing tentacles. Animation syncs with "wave" gate.
    bacteria: {
      name: "Jellyfish", speed: 0.00005, turn: 0.012, wander: 0.015, drag: 0.97,
      coreRadius: 0.019, prefs: ["sugar", "water"], reproduction: "mitosis",
      makeNodes(a, t) {
        const ns = [];
        const lt = t * a.timeScale;
        // Bell pulse mirrors wave gate (~0.10 Hz)
        const bellPulse = 0.75 + 0.25 * Math.sin(lt * TAU * 0.10 + a.seed);
        const bellR = a.r * bellPulse;

        // Outer translucent glow
        ns.push({ x: a.x, y: a.y, z: a.z, r: bellR * 1.5, rgb: a.currRgb, a: a.currAlpha * 0.12, s: 0.92 });
        // Bell rim (8 nodes)
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * TAU;
          const [dx, dy] = rotate2(bellR, 0, ang);
          ns.push({ x: a.x + dx, y: a.y + dy, z: a.z, r: a.r * 0.22, rgb: a.currRgb, a: a.currAlpha * 0.55, s: 0.45 });
        }
        // Inner nucleus
        ns.push({ x: a.x, y: a.y, z: a.z, r: a.r * 0.45, rgb: [255, 255, 255], a: a.currAlpha * 0.85, s: 0.14 });

        if (a.state === "alive") {
          // 5 trailing tentacles with sinusoidal undulation
          for (let i = 0; i < 5; i++) {
            const spreadAng = ((i - 2) / 2) * 0.55;
            const tentAng = a.heading + Math.PI + spreadAng;
            const tentLen = a.r * (3.8 + 1.4 * Math.sin(lt * 0.7 + i * 1.9 + a.seed));
            for (let j = 1; j <= 9; j++) {
              const u = j / 9;
              const wave = Math.sin(lt * 2.8 - j * 0.85 + i * 1.4 + a.seed) * a.r * (0.28 + u * 0.18);
              const [dx, dy] = rotate2(tentLen * u, wave, tentAng);
              ns.push({ x: a.x + dx, y: a.y + dy, z: a.z,
                        r: a.r * (0.13 - u * 0.09), rgb: a.currRgb,
                        a: a.currAlpha * (1 - u * 0.68), s: 0.32 });
            }
          }
          // 3 shorter frilly oral arms
          for (let i = 0; i < 3; i++) {
            const armAng = a.heading + Math.PI + ((i - 1) / 1) * 0.25;
            for (let j = 1; j <= 5; j++) {
              const u = j / 5;
              const ruffle = Math.sin(lt * 5 - j * 1.1 + i * 2.3 + a.seed) * a.r * 0.4;
              const [dx, dy] = rotate2(a.r * 2.0 * u, ruffle, armAng);
              ns.push({ x: a.x + dx, y: a.y + dy, z: a.z,
                        r: a.r * 0.16 * (1 - u * 0.5), rgb: [200, 240, 255],
                        a: a.currAlpha * (1 - u * 0.6), s: 0.35 });
            }
          }
        }
        return ns;
      }
    },

    // ── RADIOLARIAN ────────────────────────────────────────────────────────────
    // Geometric spined star. Spines pulse outward on heartbeat rhythm.
    archaea: {
      name: "Radiolarians", speed: 0.00009, turn: 0.025, wander: 0.012, drag: 0.95,
      coreRadius: 0.015, prefs: ["iron", "salt"], reproduction: "spores",
      makeNodes(a, t) {
        const ns = [];
        const lt = t * a.timeScale;
        // Heartbeat phase (~63 BPM, mirrors heartbeat gate)
        const ph = ((lt / 0.95) + a.seed * 0.11) % 1.0;
        const beat = ph < 0.07 ? 1 + ph * 9
                   : ph < 0.15 ? 1.63 - (ph - 0.07) * 12
                   : ph < 0.22 ? 0.67 + (ph - 0.15) * 5
                   : ph < 0.28 ? 1.02 - (ph - 0.22) * 14
                   : 0.18;
        const pulse = clamp(beat, 0.18, 1.8);

        // Core silica shell
        ns.push({ x: a.x, y: a.y, z: a.z, r: a.r * 0.52, rgb: [255, 255, 255], a: a.currAlpha, s: 0.07 });
        ns.push({ x: a.x, y: a.y, z: a.z, r: a.r * pulse * 0.85, rgb: a.currRgb, a: a.currAlpha * 0.32, s: 0.65 });

        if (a.state === "alive") {
          // 16 radial spines that pulse with the heartbeat
          for (let i = 0; i < 16; i++) {
            const ang = (i / 16) * TAU + a.seed * 0.08;
            const len = a.r * pulse * (1.7 + 0.28 * Math.sin(lt * 0.6 + i * 0.45));
            const [dx, dy] = rotate2(len, 0, ang);
            ns.push({ x: a.x + dx, y: a.y + dy, z: a.z, r: a.r * 0.08, rgb: [255, 215, 155], a: a.currAlpha * 0.75, s: 0.07 });
            // Spine midpoint bead
            const [mx, my] = rotate2(len * 0.52, 0, ang);
            ns.push({ x: a.x + mx, y: a.y + my, z: a.z, r: a.r * 0.055, rgb: a.currRgb, a: a.currAlpha * 0.45, s: 0.07 });
          }
          // 8 secondary short spines between main ones
          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * TAU + (1 / 16) * TAU + a.seed * 0.08;
            const len = a.r * pulse * 0.9;
            const [dx, dy] = rotate2(len, 0, ang);
            ns.push({ x: a.x + dx, y: a.y + dy, z: a.z, r: a.r * 0.05, rgb: [230, 200, 120], a: a.currAlpha * 0.5, s: 0.07 });
          }
        }
        return ns;
      }
    },

    // ── SIPHONOPHORE ──────────────────────────────────────────────────────────
    // Chain of iridescent zooids with beating comb rows. Smooth stroking feel.
    flagellate: {
      name: "Siphonophores", speed: 0.00013, turn: 0.035, wander: 0.04, drag: 0.91,
      coreRadius: 0.014, prefs: ["sulfur", "sugar"], reproduction: "mitosis",
      makeNodes(a, t) {
        const ns = [];
        const lt = t * a.timeScale;
        const hv = Math.hypot(a.vx, a.vy) + 1e-9;
        const ang = Math.atan2(a.vy / hv, a.vx / hv);

        // Chain of 14 zooids (gas floats + swimming bells)
        for (let i = 0; i < 14; i++) {
          const u = i / 13;
          const wave = Math.sin(lt * 2.2 - i * 0.5 + a.seed) * a.r * 0.72;
          const [sx, sy] = rotate2(-i * a.r * 0.65, wave, ang);
          const zooidR = a.r * (0.55 + 0.28 * Math.sin(lt * 3.5 - i * 0.8 + a.seed)) * (1 - u * 0.42);

          // Iridescent hue shifting along chain
          const hue = (i / 14) * 180 + lt * 8;
          const ri = Math.round(100 + 100 * Math.sin(hue * Math.PI / 180));
          const gi = Math.round(190 + 65 * Math.sin((hue + 100) * Math.PI / 180));
          const bi = Math.round(230 + 25 * Math.sin((hue + 220) * Math.PI / 180));
          ns.push({ x: a.x + sx, y: a.y + sy, z: a.z, r: zooidR,
                    rgb: [ri, gi, bi], a: a.currAlpha * (1 - u * 0.38), s: 0.30 });

          // Comb rows (iridescent beating cilia on each side, every other zooid)
          if (a.state === "alive" && i % 2 === 0) {
            for (let side = -1; side <= 1; side += 2) {
              const combPhase = Math.sin(lt * 9 + i * 0.9 + a.seed) * 0.35;
              const combAng = ang + side * (Math.PI * 0.5 + combPhase);
              for (let c = 0; c < 3; c++) {
                const [cx, cy] = rotate2(zooidR * (0.8 + c * 0.35), 0, combAng);
                ns.push({ x: a.x + sx + cx, y: a.y + sy + cy, z: a.z,
                          r: a.r * (0.08 - c * 0.02), rgb: [210, 255, 230],
                          a: a.currAlpha * (0.65 - c * 0.18), s: 0.07 });
              }
            }
          }
        }
        return ns;
      }
    },

    // ── POLYCHAETE ────────────────────────────────────────────────────────────
    // Armoured bristle worm. Deep rhythmic thrust. Dense parapodial bristle fans.
    lattice: {
      name: "Polychaetes", speed: 0.00006, turn: 0.012, wander: 0.006, drag: 0.97,
      coreRadius: 0.014, prefs: ["carbon", "salt"], reproduction: "mitosis",
      makeNodes(a, t) {
        const ns = [];
        const lt = t * a.timeScale;
        // Thrust phase for visual sync (~0.35 Hz, mirrors thrust gate)
        const thrustPh = (lt * 0.35 + a.seed * 0.4) % 1.0;
        const thrustPow = thrustPh < 0.68
          ? Math.pow(thrustPh / 0.68, 2)
          : Math.pow(1 - (thrustPh - 0.68) / 0.32, 0.45);

        const nSegs = 9;
        for (let i = 0; i < nSegs; i++) {
          const u = i / (nSegs - 1);
          const wig = Math.sin(lt * 4.5 - i * 1.0 + a.seed) * a.r * (0.28 + thrustPow * 0.55);
          const cx = a.x - Math.cos(a.heading) * i * a.r * 1.05;
          const cy = a.y - Math.sin(a.heading) * i * a.r * 1.05;
          const [wx, wy] = rotate2(0, wig, a.heading);
          // Segment body — hardened ring
          ns.push({ x: cx + wx, y: cy + wy, z: a.z,
                    r: a.r * (0.88 - u * 0.28), rgb: a.currRgb, a: a.currAlpha, s: 0.13 });

          if (a.state === "alive") {
            // Parapodia with bristle fans (5 bristles per side)
            for (let side = -1; side <= 1; side += 2) {
              const parapodWave = Math.sin(lt * 4.5 - i * 1.0 + a.seed) * 0.38;
              for (let b = 0; b < 5; b++) {
                const bristleAng = a.heading + side * (Math.PI * 0.52 + (b - 2) * 0.19) + side * parapodWave;
                const bLen = a.r * (0.95 + 0.28 * Math.sin(lt * 5.5 - i - b + a.seed));
                const [bdx, bdy] = rotate2(bLen, 0, bristleAng);
                ns.push({ x: cx + wx + bdx, y: cy + wy + bdy, z: a.z,
                          r: a.r * 0.062, rgb: [255, 195, 75],
                          a: a.currAlpha * 0.60, s: 0.07 });
              }
            }
          }
        }
        return ns;
      }
    },

    // ── NUDIBRANCH ────────────────────────────────────────────────────────────
    // Smooth segmented body with colourful cerata plumes along the back.
    mycelium: {
      name: "Nudibranchs", speed: 0.00013, turn: 0.035, wander: 0.045, drag: 0.91,
      coreRadius: 0.014, prefs: ["sulfur", "sugar"], reproduction: "mitosis",
      makeNodes(a, t) {
        const ns = [];
        const lt = t * a.timeScale;
        const hv = Math.hypot(a.vx, a.vy) + 1e-9;
        const hx = a.state === "alive" ? a.vx / hv : Math.cos(a.heading);
        const hy = a.state === "alive" ? a.vy / hv : Math.sin(a.heading);
        const bodyAng = Math.atan2(hy, hx);
        const segs = 11;

        for (let i = 0; i < segs; i++) {
          const u = i / (segs - 1);
          const wig = Math.sin(lt * 7 + a.seed - i * 0.75) * (0.22 * a.r);
          const bx = a.x - hx * i * a.r * 0.72 + (-hy) * wig;
          const by = a.y - hy * i * a.r * 0.72 + hx * wig;
          const segR = a.r * (0.92 - u * 0.38);
          // Body (deep purple-magenta)
          ns.push({ x: bx, y: by, z: a.z, r: segR, rgb: [195, 95, 235], a: a.currAlpha, s: 0.17 });

          if (a.state === "alive" && i > 0 && i < segs - 1) {
            // Two rows of cerata (dorsal plumes), alternating orange and magenta tips
            for (let side = -1; side <= 1; side += 2) {
              const cerataBaseAng = bodyAng + side * Math.PI * 0.42;
              const sway = Math.sin(lt * 2.8 + i * 0.62 + side * 1.1 + a.seed) * 0.55;
              const cerataLen = a.r * (1.25 - u * 0.55) * (0.85 + sway * 0.25);
              for (let j = 1; j <= 4; j++) {
                const ju = j / 4;
                const branchAng = cerataBaseAng + sway * ju * 0.38;
                const [cdx, cdy] = rotate2(cerataLen * ju, 0, branchAng);
                const cerataRgb = side > 0 ? [255, 105, 45] : [255, 55, 210];
                ns.push({ x: bx + cdx, y: by + cdy, z: a.z,
                          r: a.r * (0.19 - ju * 0.12), rgb: cerataRgb,
                          a: a.currAlpha * (1 - ju * 0.42), s: 0.17 });
              }
            }
          }
        }
        return ns;
      }
    },

    // ── GLASS SQUID ───────────────────────────────────────────────────────────
    // Transparent mantle + lateral fins + 8 arms with bioluminescent flash.
    scintillator: {
      name: "Glass Squids", speed: 0.00022, turn: 0.10, wander: 0.09, drag: 0.92,
      coreRadius: 0.014, prefs: ["iron", "water"], reproduction: "mitosis",
      makeNodes(a, t) {
        const ns = [];
        const lt = t * a.timeScale;
        const spd = Math.hypot(a.vx, a.vy);
        const speedN = clamp(spd / 0.00022, 0, 1);

        // Bioluminescent flash (mirrors buzz gate ~12 Hz)
        const flashPh = (lt * 12 + a.seed * 2.7) % 1.0;
        const flash = flashPh < 0.07;
        const flashBright = flash ? 1.55 : 0;

        // Mantle (elongated teardrop)
        const mantleLen = a.r * (1.7 + speedN * 0.55);
        ns.push({ x: a.x, y: a.y, z: a.z, r: a.r * 0.82,
                  rgb: flash ? [255, 255, 255] : [155, 220, 255], a: a.currAlpha, s: 0.09 });
        for (let j = 1; j <= 4; j++) {
          const [bx, by] = rotate2(-mantleLen * (j / 4), 0, a.heading);
          ns.push({ x: a.x + bx, y: a.y + by, z: a.z,
                    r: a.r * (0.72 - j * 0.14), rgb: [145, 205, 255],
                    a: a.currAlpha * 0.65, s: 0.11 });
        }

        // Lateral fins (triangular, near tail)
        if (a.state === "alive") {
          for (let side = -1; side <= 1; side += 2) {
            for (let j = 0; j < 5; j++) {
              const [fdx, fdy] = rotate2(-a.r * (0.55 + j * 0.38), side * a.r * (0.52 + j * 0.13), a.heading);
              ns.push({ x: a.x + fdx, y: a.y + fdy, z: a.z,
                        r: a.r * (0.17 - j * 0.025), rgb: [120, 200, 255],
                        a: a.currAlpha * 0.42, s: 0.22 });
            }
          }

          // 8 trailing arms with sinusoidal motion and flash tips
          for (let i = 0; i < 8; i++) {
            const spread = ((i - 3.5) / 3.5) * 0.68;
            const armAng = a.heading + Math.PI + spread;
            for (let j = 1; j <= 7; j++) {
              const u = j / 7;
              const armWave = Math.sin(lt * 6.5 + j * 0.9 + i * 0.85 + a.seed) * a.r * 0.23;
              const [adx, ady] = rotate2(a.r * j * 0.44, armWave, armAng);
              const armRgb = (u > 0.72 && flash) ? [255, 255, 200] : [95 + i * 14, 178, 255];
              ns.push({ x: a.x + adx, y: a.y + ady, z: a.z,
                        r: a.r * (0.10 - u * 0.055), rgb: armRgb,
                        a: a.currAlpha * (1 - u * 0.48) * (u > 0.72 ? 1 + flashBright : 1), s: 0.20 });
            }
          }
        }
        return ns;
      }
    },

    // ── CTENOPHORE ────────────────────────────────────────────────────────────
    // Oval transparent body with 8 iridescent comb-plate rows + 2 branching tentacles.
    // Comb rows beat in succession creating a rainbow rippling shimmer.
    ctenophore: {
      name: "Ctenophores", speed: 0.00007, turn: 0.018, wander: 0.020, drag: 0.96,
      coreRadius: 0.017, prefs: ["water", "sugar"], reproduction: "mitosis",
      makeNodes(a, t) {
        const ns = [];
        const lt = t * a.timeScale;
        const bodyA = a.r * 1.3;  // semi-major axis (length)
        const bodyB = a.r * 0.72; // semi-minor axis (width)

        // Outer translucent glow
        ns.push({ x: a.x, y: a.y, z: a.z, r: bodyA * 1.15, rgb: a.currRgb, a: a.currAlpha * 0.10, s: 0.90 });
        // Inner bright core
        ns.push({ x: a.x, y: a.y, z: a.z, r: bodyA * 0.48, rgb: [255, 255, 255], a: a.currAlpha * 0.38, s: 0.07 });

        if (a.state === "alive") {
          // 8 comb-plate rows running along body length, iridescent beating
          for (let i = 0; i < 8; i++) {
            const rowAng = a.heading + (i / 8) * TAU + a.seed * 0.05;
            for (let j = 0; j < 7; j++) {
              const u = (j / 6) - 0.5; // -0.5 to +0.5 along body
              const bx = a.x + Math.cos(a.heading) * u * bodyA * 1.8;
              const by = a.y + Math.sin(a.heading) * u * bodyA * 1.8;
              // Beat ripples down each row at different phase (metachronal rhythm)
              const combPhase = lt * 3.5 - j * 0.65 + i * (TAU / 8) + a.seed;
              const bulge = 0.25 + 0.25 * Math.sin(combPhase);
              const [cdx, cdy] = rotate2(bodyB * bulge, 0, rowAng + Math.PI * 0.5);
              // Rainbow iridescence traveling along comb rows
              const hue = ((i / 8) * 300 + lt * 22 + j * 18) % 360;
              const ri = Math.round(155 + 100 * Math.sin(hue * Math.PI / 180));
              const gi = Math.round(205 + 50 * Math.sin((hue + 120) * Math.PI / 180));
              const bi = Math.round(215 + 40 * Math.sin((hue + 240) * Math.PI / 180));
              ns.push({ x: bx + cdx, y: by + cdy, z: a.z,
                        r: a.r * (0.085 - Math.abs(u) * 0.038), rgb: [ri, gi, bi],
                        a: a.currAlpha * (0.68 - Math.abs(u) * 0.24), s: 0.11 });
            }
          }
          // 2 long trailing tentacles with branches at midpoint
          for (let arm = 0; arm < 2; arm++) {
            const tentAng = a.heading + Math.PI + (arm === 0 ? 0.10 : -0.10);
            const tentLen = a.r * (4.5 + 1.5 * Math.sin(lt * 0.4 + arm * 2.1 + a.seed));
            for (let j = 1; j <= 10; j++) {
              const u = j / 10;
              const wave = Math.sin(lt * 1.8 - j * 0.7 + arm * 3.1 + a.seed) * a.r * (0.30 + u * 0.5);
              const [dx, dy] = rotate2(tentLen * u, wave, tentAng);
              ns.push({ x: a.x + dx, y: a.y + dy, z: a.z,
                        r: a.r * (0.085 - u * 0.062), rgb: [180, 255, 242],
                        a: a.currAlpha * (1 - u * 0.70), s: 0.28 });
              // Branch at tentacle midpoint
              if (j === 5) {
                const branchAng = tentAng + (arm === 0 ? 0.65 : -0.65);
                for (let k = 1; k <= 4; k++) {
                  const bu = k / 4;
                  const bwave = Math.sin(lt * 2.5 + k * 0.9 + a.seed) * a.r * 0.22;
                  const [bdx, bdy] = rotate2(a.r * 1.4 * bu, bwave, branchAng);
                  ns.push({ x: a.x + dx + bdx, y: a.y + dy + bdy, z: a.z,
                            r: a.r * 0.052 * (1 - bu * 0.5), rgb: [155, 240, 225],
                            a: a.currAlpha * (0.50 - bu * 0.32), s: 0.32 });
                }
              }
            }
          }
        }
        return ns;
      }
    },

    // ── MANTIS SHRIMP ─────────────────────────────────────────────────────────
    // Armoured, rainbow-striped body + raptorial punching claws + fan tail.
    // Claws extend on the STRONG beat of the gallop gate.
    mantis: {
      name: "Mantis Shrimp", speed: 0.00015, turn: 0.08, wander: 0.06, drag: 0.88,
      coreRadius: 0.016, prefs: ["iron", "carbon"], reproduction: "mitosis",
      makeNodes(a, t) {
        const ns = [];
        const lt = t * a.timeScale;
        // Gallop phase visual sync (matches gallop gate: quick-quick-STRONG)
        const gallRate = 1.5;
        const ph = ((lt * gallRate) + a.seed * 0.3) % 1.0;
        const clawPunch = ph < 0.36 ? 0
          : ph < 0.65 ? Math.pow((ph - 0.36) / 0.29, 1.6)
          : ph < 0.80 ? Math.pow(1 - (ph - 0.65) / 0.15, 0.55)
          : 0;

        // 7 armoured body segments, iridescent rainbow stripes
        for (let i = 0; i < 7; i++) {
          const u = i / 6;
          const segX = a.x - Math.cos(a.heading) * i * a.r * 0.68;
          const segY = a.y - Math.sin(a.heading) * i * a.r * 0.68;
          const wig = Math.sin(lt * 6 - i * 0.9 + a.seed) * a.r * 0.12;
          const [wx, wy] = rotate2(0, wig, a.heading);
          const hue = (i / 7) * 280 + lt * 5;
          const ri = Math.round(175 + 80 * Math.sin(hue * Math.PI / 180));
          const gi = Math.round(185 + 70 * Math.sin((hue + 110) * Math.PI / 180));
          const bi = Math.round(200 + 55 * Math.sin((hue + 230) * Math.PI / 180));
          ns.push({ x: segX + wx, y: segY + wy, z: a.z,
                    r: a.r * (0.85 - u * 0.35), rgb: [ri, gi, bi], a: a.currAlpha, s: 0.10 });

          if (a.state === "alive" && i > 1 && i < 6) {
            // Pleopods (swimming legs) per side
            for (let side = -1; side <= 1; side += 2) {
              const legAng = a.heading + side * (Math.PI * 0.5 + Math.sin(lt * 6 - i + a.seed) * 0.35);
              const [ldx, ldy] = rotate2(a.r * 0.8, 0, legAng);
              ns.push({ x: segX + wx + ldx, y: segY + wy + ldy, z: a.z,
                        r: a.r * 0.068, rgb: [ri, gi, bi], a: a.currAlpha * 0.52, s: 0.16 });
            }
          }
        }

        if (a.state === "alive") {
          // Raptorial claws — extend forward on STRONG beat
          for (let side = -1; side <= 1; side += 2) {
            const clawAng = a.heading + side * 0.35;
            const extension = a.r * (1.5 + clawPunch * 1.9);
            const [cx, cy] = rotate2(extension, side * a.r * 0.28, clawAng);
            ns.push({ x: a.x + cx, y: a.y + cy, z: a.z,
                      r: a.r * (0.28 + clawPunch * 0.14),
                      rgb: [255, Math.round(175 - clawPunch * 80), Math.round(55 + clawPunch * 100)],
                      a: a.currAlpha * (0.85 + clawPunch * 0.15), s: 0.12 });
            // Club head (the hammer)
            const [chx, chy] = rotate2(extension * 1.22, side * a.r * 0.18, clawAng);
            ns.push({ x: a.x + chx, y: a.y + chy, z: a.z,
                      r: a.r * (0.22 + clawPunch * 0.18),
                      rgb: [255, Math.round(120 - clawPunch * 60), 30],
                      a: a.currAlpha * (0.95 + clawPunch * 0.05), s: 0.09 });
          }
          // Fan tail — 5 uropods
          for (let i = -2; i <= 2; i++) {
            const tailAng = a.heading + Math.PI + (i / 2) * 0.60;
            const tailLen = a.r * (2.2 + 0.5 * clawPunch);
            const [tdx, tdy] = rotate2(tailLen, 0, tailAng);
            ns.push({ x: a.x + tdx, y: a.y + tdy, z: a.z,
                      r: a.r * (0.18 - Math.abs(i) * 0.04), rgb: [205, 232, 255],
                      a: a.currAlpha * (0.62 - Math.abs(i) * 0.08), s: 0.18 });
          }
        }
        return ns;
      }
    },

    // ── PYROSOME ──────────────────────────────────────────────────────────────
    // Transparent cylindrical colony (12 zooids) with traveling bioluminescent wave.
    // The wave slowly creeps from tip to tip, glowing cyan-green.
    pyrosome: {
      name: "Pyrosomes", speed: 0.00004, turn: 0.008, wander: 0.008, drag: 0.98,
      coreRadius: 0.013, prefs: ["water", "carbon"], reproduction: "spores",
      makeNodes(a, t) {
        const ns = [];
        const lt = t * a.timeScale;
        const numZooids = 12;
        const bodyLen = a.r * 4.5;

        // Outer colony silhouette glow
        ns.push({ x: a.x, y: a.y, z: a.z, r: bodyLen * 0.80, rgb: a.currRgb, a: a.currAlpha * 0.06, s: 0.92 });

        for (let i = 0; i < numZooids; i++) {
          const u = i / (numZooids - 1);
          const bx = a.x + Math.cos(a.heading) * (u - 0.5) * bodyLen;
          const by = a.y + Math.sin(a.heading) * (u - 0.5) * bodyLen;
          const gentle = Math.sin(lt * 0.18 + a.seed + i * 0.3) * a.r * 0.07;
          const [gx, gy] = rotate2(0, gentle, a.heading);

          // Traveling bioluminescent wave (mirrors tease gate slow pace)
          const wavePh = ((lt * 0.55 - u * 2.8 + a.seed) % 1.0 + 1.0) % 1.0;
          const glow = Math.max(0, Math.sin(wavePh * Math.PI));
          const glowRgb = glow > 0.7 ? [185, 255, 145] : glow > 0.3 ? [100, 210, 255] : a.currRgb;

          ns.push({ x: bx + gx, y: by + gy, z: a.z,
                    r: a.r * (0.36 + 0.12 * glow * glow), rgb: glowRgb,
                    a: a.currAlpha * (0.42 + 0.55 * glow), s: 0.18 });

          // Bright canal glow at wave peak
          if (glow > 0.45) {
            ns.push({ x: bx + gx, y: by + gy, z: a.z,
                      r: a.r * 0.17, rgb: [215, 255, 195],
                      a: a.currAlpha * glow * 0.82, s: 0.05 });
          }
        }
        return ns;
      }
    },

    // ── SEA ANGEL (Clione) ────────────────────────────────────────────────────
    // Tiny transparent body with visible internal organs + two flapping parapodia.
    // Wings beat in paired pulses (flutter gate rhythm).
    seaangel: {
      name: "Sea Angels", speed: 0.00010, turn: 0.040, wander: 0.030, drag: 0.93,
      coreRadius: 0.013, prefs: ["sulfur", "salt"], reproduction: "mitosis",
      makeNodes(a, t) {
        const ns = [];
        const lt = t * a.timeScale;
        // Wing beat phase syncs with flutter gate (~4 Hz, paired)
        const flutRate = 4.0;
        const flutPh = ((lt * flutRate) + a.seed * 0.5) % 1.0;
        const pairDuty = 0.22;
        let wingBeat = 0;
        if (flutPh < pairDuty * 0.45) {
          wingBeat = Math.sin((flutPh / (pairDuty * 0.45)) * Math.PI);
        } else if (flutPh < pairDuty) {
          wingBeat = Math.sin(((flutPh - pairDuty * 0.45) / (pairDuty * 0.55)) * Math.PI) * 0.70;
        }
        const wf = clamp(wingBeat, 0, 1);

        const bodyLen = a.r * 1.6;
        // Head (slightly luminous)
        const [hx, hy] = rotate2(bodyLen * 0.3, 0, a.heading);
        ns.push({ x: a.x + hx, y: a.y + hy, z: a.z,
                  r: a.r * 0.52, rgb: [255, 242, 255], a: a.currAlpha * 0.75, s: 0.09 });
        // Body segments (4)
        for (let i = 0; i < 4; i++) {
          const u = i / 3;
          const [bx, by] = rotate2(-u * bodyLen * 0.7, 0, a.heading);
          ns.push({ x: a.x + bx, y: a.y + by, z: a.z,
                    r: a.r * (0.42 - u * 0.12), rgb: [232, 212, 255],
                    a: a.currAlpha * 0.70, s: 0.12 });
        }
        // Visible viscera — bright warm internal glow
        ns.push({ x: a.x, y: a.y, z: a.z, r: a.r * 0.21,
                  rgb: [255, 118, 82], a: a.currAlpha * 0.88, s: 0.05 });

        if (a.state === "alive") {
          // Two parapodia wings — 5-node fan, flapping up on each beat
          for (let side = -1; side <= 1; side += 2) {
            const wingBaseAng = a.heading + side * (Math.PI * 0.5 + wf * 0.9);
            const wingLen = a.r * (2.2 + wf * 1.4);
            for (let j = 0; j < 5; j++) {
              const fanAng = wingBaseAng + side * (j - 2) * 0.22;
              const [wdx, wdy] = rotate2(wingLen * (0.70 + j * 0.06), 0, fanAng);
              ns.push({ x: a.x + wdx, y: a.y + wdy, z: a.z,
                        r: a.r * (0.13 - j * 0.018), rgb: [200, 178, 255],
                        a: a.currAlpha * (0.58 + wf * 0.35 - j * 0.08), s: 0.22 });
            }
            // Tip glow during beat
            if (wf > 0.30) {
              const [wtx, wty] = rotate2(wingLen * 1.1, 0, wingBaseAng);
              ns.push({ x: a.x + wtx, y: a.y + wty, z: a.z,
                        r: a.r * 0.17 * wf, rgb: [238, 212, 255],
                        a: a.currAlpha * wf * 0.88, s: 0.15 });
            }
          }
          // Trailing foot
          const [tdx, tdy] = rotate2(-bodyLen * 1.1, 0, a.heading);
          ns.push({ x: a.x + tdx, y: a.y + tdy, z: a.z,
                    r: a.r * 0.17, rgb: [218, 198, 255], a: a.currAlpha * 0.42, s: 0.32 });
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
  // FAMILY SOUND LIBRARIES — each species has a radically different sensation
  // identity. Gate types: wave, heartbeat, stroke, thrust, swell, buzz.
  // ---------------------------------------------------------------------------
  const SOUND_LIB = {
    bacteria: { // Jellyfish — long breathing ocean swells
      identity: "slow ocean breath",
      regMul: 0.8, minMul: 0.5, maxMul: 1.4,
      ratios: [1, 1.25, 1.5],
      hopHz: [0.08, 0.15, 0.25],      // very slow hops
      glide: 0.03,
      vibratoHz: [0.3, 0.7], vibratoAmt: [0.02, 0.04],
      gate: "wave", talkiness: 0.15, grit: 0.005,
      echo: { taps: [1.2, 2.4], gains: [0.22, 0.10] }
    },
    archaea: { // Radiolarians — heartbeat double-pulse (lub-dub)
      identity: "heartbeat",
      regMul: 1.4, minMul: 0.8, maxMul: 2.2,
      ratios: [1, 1.5, 2],
      hopHz: [0.5, 1.0, 1.5],
      glide: 0.08,
      vibratoHz: [0.8, 2.0], vibratoAmt: [0.015, 0.03],
      gate: "heartbeat", talkiness: 0.3, grit: 0.02,
      echo: { taps: [0.12, 0.42], gains: [0.38, 0.18] }
    },
    flagellate: { // Siphonophores — smooth silky stroking
      identity: "silk stroke",
      regMul: 1.1, minMul: 0.7, maxMul: 1.8,
      ratios: [1, 1.2, 1.33, 1.5],
      hopHz: [0.3, 0.8, 1.5],
      glide: 0.06,
      vibratoHz: [3, 6], vibratoAmt: [0.02, 0.05],
      gate: "stroke", talkiness: 0.4, grit: 0.01,
      echo: { taps: [0.15, 0.30], gains: [0.20, 0.10] }
    },
    lattice: { // Polychaetes — deep rhythmic thrusting power
      identity: "deep thrust",
      regMul: 0.35, minMul: 0.20, maxMul: 0.55,
      ratios: [1, 1.1, 1.2],
      hopHz: [0.15, 0.3, 0.5],
      glide: 0.04,
      vibratoHz: [0.1, 0.4], vibratoAmt: [0.008, 0.015],
      gate: "thrust", talkiness: 0.08, grit: 0.005,
      echo: { taps: [0.65, 1.30], gains: [0.40, 0.20] }
    },
    mycelium: { // Nudibranchs — liquid flowing swell
      identity: "liquid eel",
      regMul: 0.75, minMul: 0.5, maxMul: 1.6,
      ratios: [1, 1.2, 1.4, 1.6],
      hopHz: [0.3, 0.7, 1.5],
      glide: 0.05,
      vibratoHz: [2, 4], vibratoAmt: [0.04, 0.08],
      gate: "swell", talkiness: 0.25, grit: 0.06,
      echo: { taps: [0.25, 0.50], gains: [0.28, 0.14] }
    },
    scintillator: { // Glass Squids — rapid electric buzz with AM envelope
      identity: "electric buzz",
      regMul: 2.2, minMul: 1.2, maxMul: 5.0,
      ratios: [1, 1.5, 2, 2.5, 3],
      hopHz: [4.0, 8.0, 16.0],
      glide: 0.85,
      vibratoHz: [12, 20], vibratoAmt: [0.08, 0.18],
      gate: "buzz", talkiness: 0.85, grit: 0.35,
      echo: { taps: [0.03, 0.07, 0.13], gains: [0.50, 0.28, 0.12] }
    },
    ctenophore: { // Ctenophores — expanding concentric ring pulses
      identity: "ripple tide",
      regMul: 0.9, minMul: 0.55, maxMul: 1.6,
      ratios: [1, 1.2, 1.4, 1.6],
      hopHz: [0.2, 0.5, 0.9],
      glide: 0.04,
      vibratoHz: [1.5, 3.5], vibratoAmt: [0.025, 0.05],
      gate: "ripple", talkiness: 0.20, grit: 0.008,
      echo: { taps: [0.35, 0.70], gains: [0.28, 0.12] }
    },
    mantis: { // Mantis Shrimp — quick-quick-STRONG gallop punch
      identity: "gallop punch",
      regMul: 1.6, minMul: 0.9, maxMul: 3.0,
      ratios: [1, 1.25, 1.5, 2],
      hopHz: [0.8, 1.5, 2.5],
      glide: 0.12,
      vibratoHz: [0.5, 1.5], vibratoAmt: [0.01, 0.025],
      gate: "gallop", talkiness: 0.35, grit: 0.04,
      echo: { taps: [0.08, 0.24, 0.48], gains: [0.45, 0.22, 0.10] }
    },
    pyrosome: { // Pyrosomes — slow teasing climb that never resolves
      identity: "tease wave",
      regMul: 0.65, minMul: 0.4, maxMul: 1.2,
      ratios: [1, 1.15, 1.3],
      hopHz: [0.06, 0.12, 0.22],
      glide: 0.025,
      vibratoHz: [0.2, 0.6], vibratoAmt: [0.04, 0.09],
      gate: "tease", talkiness: 0.10, grit: 0.012,
      echo: { taps: [1.8, 3.6], gains: [0.18, 0.08] }
    },
    seaangel: { // Sea Angels — delicate paired wing-beat flutter
      identity: "angel flutter",
      regMul: 1.05, minMul: 0.65, maxMul: 1.9,
      ratios: [1, 1.33, 1.5, 2],
      hopHz: [1.0, 2.5, 4.5],
      glide: 0.07,
      vibratoHz: [3, 6], vibratoAmt: [0.03, 0.065],
      gate: "flutter", talkiness: 0.30, grit: 0.015,
      echo: { taps: [0.12, 0.24], gains: [0.32, 0.14] }
    }
  };

  // gateFor — shapes the amplitude envelope for each species' sensation.
  // adsr: optional per-creature drift object { rateMul, ampMul, dutyMul }
  //   rateMul → stretches/compresses cycle tempo (0.6–1.5)
  //   ampMul  → scales peak amplitude (0.78–1.22)
  //   dutyMul → stretches on/off ratio for pulse-style gates (0.65–1.45)
  function gateFor(lib, t, speedN, seed, adsr) {
    const rd = (adsr && adsr.rateMul) ? adsr.rateMul : 1.0;
    const ad = (adsr && adsr.ampMul)  ? adsr.ampMul  : 1.0;
    const dd = (adsr && adsr.dutyMul) ? adsr.dutyMul : 1.0;

    switch (lib.gate) {

      // WAVE — long rolling ocean swells; creature feels like breathing in and out
      case "wave": {
        const rate = (0.08 + 0.12 * speedN) * rd; // 0.08–0.20 Hz, drifts per creature
        const a = Math.sin(t * rate * TAU + seed) * 0.5 + 0.5;
        return Math.pow(a, 0.55) * 1.15 * ad;
      }

      // HEARTBEAT — lub-dub double-pulse with long diastole rest
      case "heartbeat": {
        const bpm = (52 + 28 * speedN) * rd; // BPM drifts per creature
        const period = 60 / bpm;
        const ph = ((t / period) + seed * 0.11) % 1.0;
        if (ph < 0.07)  return 1.60 * ad;
        if (ph < 0.14)  return (0.10 + (ph - 0.07) * 7) * ad;
        if (ph < 0.21)  return 1.25 * ad;
        if (ph < 0.28)  return (1.25 - (ph - 0.21) * 16) * ad;
        return 0.04;
      }

      // STROKE — smooth continuous sensation with a gentle 1 Hz ripple
      case "stroke": {
        const base = 0.55 + 0.45 * Math.sin(t * 0.85 * rd + seed);
        const ripple = 1 + 0.22 * Math.sin(t * TAU * (1.0 + speedN * 0.6) * rd + seed * 5.1);
        return clamp(base * ripple * ad, 0.05, 1.35);
      }

      // THRUST — slow power build to a peak, then sharp release
      case "thrust": {
        const rate = (0.22 + 0.38 * speedN) * rd;
        const ph = (t * rate + seed * 0.4) % 1.0;
        if (ph < 0.68) return (0.04 + Math.pow(ph / 0.68, 1.9) * 1.45) * ad;
        return (1.49 * Math.pow(1 - (ph - 0.68) / 0.32, 0.45)) * ad;
      }

      // SWELL — smooth double-harmonic rise and fall
      case "swell": {
        const a = 0.55 + 0.45 * Math.sin(t * 0.65 * rd + seed);
        const b = 0.50 + 0.50 * Math.sin(t * 1.25 * rd + seed * 2.1);
        return Math.pow(a * 0.70 + b * 0.30, 1.2) * ad;
      }

      // BUZZ — rapid machine-gun stutter with slow AM envelope
      case "buzz": {
        const burstRate = (7 + 11 * speedN) * rd;
        const ph = (t * burstRate + seed * 2.7) % 1.0;
        const dutyOn = (0.06 + 0.07 * speedN) * dd;
        const on = ph < dutyOn;
        const env = 0.60 + 0.40 * Math.sin(t * 0.42 + seed);
        return on ? (1.0 + env * 0.38) * ad : 0.04;
      }

      // RIPPLE — expanding concentric-ring pulses, 0.5–1.5 Hz
      // Like dropping stones in still water; each pulse fades as the next begins.
      case "ripple": {
        const rate = (0.5 + 1.0 * speedN) * rd;
        const ph  = (t * rate + seed * 0.3) % 1.0;
        const ring  = ph < 0.15 ? ph / 0.15 : Math.exp(-(ph - 0.15) * 4.5);
        const ph2 = (t * rate + seed * 0.3 + 0.5) % 1.0;
        const ring2 = (ph2 < 0.15 ? ph2 / 0.15 : Math.exp(-(ph2 - 0.15) * 4.5)) * 0.5;
        return clamp((ring + ring2) * ad, 0.04, 1.45);
      }

      // GALLOP — 3-beat quick-quick-STRONG rhythm, 1–2 Hz
      // Short-short-long: like a canter stride or a racing heartbeat with emphasis.
      case "gallop": {
        const rate = (1.0 + 1.0 * speedN) * rd;
        const ph = (t * rate + seed * 0.25) % 1.0;
        if (ph < 0.10)  return (ph / 0.10) * 1.15 * ad;
        if (ph < 0.18)  return (1.15 - (ph - 0.10) / 0.08 * 1.05) * ad;
        if (ph < 0.28)  return ((ph - 0.18) / 0.10) * 1.05 * ad;
        if (ph < 0.36)  return (1.05 - (ph - 0.28) / 0.08 * 0.95) * ad;
        if (ph < 0.65)  return (0.08 + Math.pow((ph - 0.36) / 0.29, 1.6) * 1.45) * ad;
        if (ph < 0.80)  return (1.53 * Math.pow(1 - (ph - 0.65) / 0.15, 0.55)) * ad;
        return 0.04;
      }

      // TEASE — very slow climb that approaches peak but always backs off before release
      // Tantalizing: always building, never quite arriving.
      case "tease": {
        const rate = (0.12 + 0.08 * speedN) * rd;
        const ph = (t * rate + seed * 0.15) % 1.0;
        const rise = ph < 0.70
          ? Math.pow(ph / 0.70, 0.65) * 0.88
          : 0.88 - Math.pow((ph - 0.70) / 0.30, 0.5) * 0.52;
        const tremor = 1 + 0.08 * Math.sin(t * 4.5 * rd + seed * 3.1);
        return clamp(Math.max(0.04, rise) * tremor * ad, 0.04, 1.0);
      }

      // FLUTTER — paired wing-beats at 3–5 Hz with a pronounced rest between pairs
      // Two quick pulses, then silence; like butterfly wings or a hummingbird hovering.
      case "flutter": {
        const rate = (3.0 + 2.0 * speedN) * rd;
        const ph = (t * rate + seed * 0.5) % 1.0;
        const pairDuty = 0.22 * dd;
        if (ph < pairDuty * 0.45) {
          const bp = ph / (pairDuty * 0.45);
          return (Math.sin(bp * Math.PI) * 1.10 + 0.05) * ad;
        }
        if (ph < pairDuty) {
          const bp = (ph - pairDuty * 0.45) / (pairDuty * 0.55);
          return (Math.sin(bp * Math.PI) * 0.78 + 0.05) * ad;
        }
        return 0.04; // rest — wings folded
      }

      // Legacy patterns kept for compatibility
      case "breath": {
        const a = 0.6 + 0.4 * Math.sin(t * 0.9 + seed);
        const sigh = Math.sin(t * 0.7 + seed) > 0.96 ? 1.25 : 1.0;
        return a * sigh;
      }
      case "staccato": {
        const r = 2.2 + 3.0 * speedN;
        return ((t * r) % 1.0) < 0.14 ? 1.3 : 0.05;
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
      // Pass per-host ADSR drift so each creature has its own slowly-evolving timing
      const gate = gateFor(lib, localT, speedN, (this.host.seed || 0) + this.id * 11.7, this.host.adsrDrift);
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

      // Individualized tempo scale (heartbeats never sync up between creatures)
      this.timeScale = rand(0.7, 1.3);

      // Smooth wander bias (Ornstein-Uhlenbeck): slowly-drifting heading bias.
      // Replaces raw frame-by-frame noise so creatures sweep in lazy organic arcs.
      this.wanderBias = rand(-0.4, 0.4);

      // ADSR Drift — slowly evolving envelope variation per individual
      // Each creature independently drifts its gate timing and amplitude over time.
      this.adsrDrift = {
        rateMul: rand(0.88, 1.12), // gate tempo multiplier
        ampMul:  rand(0.92, 1.08), // peak amplitude multiplier
        dutyMul: rand(0.85, 1.15)  // on/off duty cycle multiplier (for pulse gates)
      };
      this.adsrDriftTimer = rand(12, 28); // seconds until next random nudge

      const colors = {
        bacteria:     [165, 235, 255], // Jellyfish       — cool aqua
        archaea:      [255, 200, 130], // Radiolarian     — warm amber
        flagellate:   [140, 255, 210], // Siphonophore    — iridescent teal
        lattice:      [145, 255, 168], // Polychaete      — green-gold
        mycelium:     [195,  95, 235], // Nudibranch      — deep purple-magenta
        scintillator: [155, 220, 255], // Glass Squid     — ice blue
        ctenophore:   [175, 255, 238], // Ctenophore      — iridescent cyan-mint
        mantis:       [255, 205, 100], // Mantis Shrimp   — warm golden-orange
        pyrosome:     [162, 255, 182], // Pyrosome        — bioluminescent pale green
        seaangel:     [215, 185, 255], // Sea Angel       — pale lavender
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

      // ADSR drift: random-walk envelope parameters every ~15-25 seconds
      // Keeps each creature's sensation subtly different from others of the same species.
      this.adsrDriftTimer -= dt;
      if (this.adsrDriftTimer <= 0) {
        this.adsrDriftTimer = rand(12, 28);
        const nudge = (v, lo, hi, step) => clamp(v + (Math.random() - 0.5) * step, lo, hi);
        this.adsrDrift.rateMul = nudge(this.adsrDrift.rateMul, 0.62, 1.48, 0.10);
        this.adsrDrift.ampMul  = nudge(this.adsrDrift.ampMul,  0.78, 1.22, 0.07);
        this.adsrDrift.dutyMul = nudge(this.adsrDrift.dutyMul, 0.65, 1.42, 0.12);
      }

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

      // ── SMOOTH WANDER (Ornstein-Uhlenbeck) ─────────────────────────────────
      // wanderBias is a slowly-drifting heading offset. It accumulates small
      // nudges each frame then exponentially decays back toward zero, producing
      // lazy sweeping arcs instead of jittery frame-by-frame noise.
      const wanderAmt = (this.profile?.wander || 0.02);
      this.wanderBias += (Math.random() - 0.5) * wanderAmt * dt * 22;
      this.wanderBias *= 1 - dt * 1.8;                    // mean-reversion rate
      this.wanderBias = clamp(this.wanderBias, -1.3, 1.3); // prevent full-spin drift

      if (closestInterest) {
        // Pursuit: steer toward interest; let wanderBias keep drifting (invisible)
        targetHeading = Math.atan2(closestInterest.y - this.y, closestInterest.x - this.x);
        if (minDist < this.r + 0.015) {
          if (closestInterest instanceof NutrientBlob) {
            this.absorb(closestInterest.profile.tint, closestInterest.consume(dt * 0.2));
          } else {
            this.absorb(closestInterest.currRgb, 0.5); closestInterest.health = 0;
          }
        }
      } else {
        // No target: apply wander bias so we drift in smooth arcs
        targetHeading = this.heading + this.wanderBias;
      }

      // ── SOFT CIRCULAR BOUNDARY ──────────────────────────────────────────────
      // Gently bends targetHeading (not heading itself) back toward center.
      // Strength is capped so the turn goes through the normal smooth filter.
      const distFromCenter = Math.hypot(this.x - 0.5, this.y - 0.5);
      if (distFromCenter > 0.42) {
        const angleToCenter = Math.atan2(0.5 - this.y, 0.5 - this.x);
        const strength = clamp((distFromCenter - 0.42) * 3.5, 0, 0.72);
        let bd = angleToCenter - targetHeading;
        while (bd < -Math.PI) bd += TAU; while (bd > Math.PI) bd -= TAU;
        targetHeading += bd * strength;
        // Dampen velocity proportionally (dt-scaled)
        const velDamp = 1 - clamp((distFromCenter - 0.42) * 2.5, 0, 0.18) * dt * 30;
        this.vx *= velDamp; this.vy *= velDamp;
      }

      if (this.energy > 1.8 && this.maturity > 0.9 && world.agents.length < 60) {
        this.energy = 0.7;
        world.agents.push(new Agent(this.speciesId, this.x + rand(-0.01, 0.01), this.y + rand(-0.01, 0.01), true));
      }

      // ── DT-SCALED HEADING TURN ──────────────────────────────────────────────
      // Turn rate is scaled by dt so behaviour is framerate-independent.
      // Capped at 0.20 rad/step to prevent snapping on large dt spikes.
      let hDiff = targetHeading - this.heading;
      while (hDiff < -Math.PI) hDiff += TAU; while (hDiff > Math.PI) hDiff -= TAU;
      const turnRate = clamp((this.profile?.turn || 0.01) * dt * 30, 0, 0.20);
      this.heading += hDiff * turnRate;

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
    },
    getCaretakerId: () => engine.caretaker.id,
    getCaretakerIds: () => Object.keys(CARETAKER_DIETS)
  };

  // All 6 species are now fully defined in the SPECIES object above.
  // (Legacy SPECIES.mycelium / SPECIES.scintillator overrides removed in v9.0)

})();