import { useEffect, useRef } from "react";

// Esfera de dígitos que converge periódicamente en el logo de SYS HIGEA (con
// sus colores reales), se sostiene, se funde un instante a la imagen nítida
// real y vuelve a dispersarse. Pensado para el panel izquierdo del login:
// llena el contenedor que lo envuelve (no la ventana completa).
const LOGO_SAMPLE_URL = "/branding/particle-logo-sample.png";
const LOGO_OVERLAY_URL = "/branding/particle-logo-overlay.png";

export function ParticleLogo({ className = "" }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    let cancelled = false;
    let rafId = 0;

    const ctx = canvas.getContext("2d");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let W, H, DPR;
    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = container.clientWidth || 1;
      H = container.clientHeight || 1;
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    // Fibonacci sphere: N puntos ~uniformes sobre una esfera unitaria, sin
    // que se agrupen en los polos.
    const COUNT = 16000; // bajado a propósito: fillText x40k por frame es pesado en equipos modestos
    const pts = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < COUNT; i++) {
      const y = 1 - (i / (COUNT - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = golden * i;
      pts.push({
        x: Math.cos(theta) * r,
        y,
        z: Math.sin(theta) * r,
        digitSeed: Math.random(),
        sizeSeed: 0.5 + Math.random() * 0.5,
      });
    }

    // --- Logo morph: el enjambre converge periódicamente en el logo (con
    // sus colores) y se deshace de nuevo en la esfera caótica. El logo lo
    // forman SOLO los dígitos: la imagen fuente nunca se dibuja en pantalla
    // durante esa fase, se usa únicamente para muestrear las posiciones y
    // colores objetivo de cada partícula.
    const LOGO_SAMPLE = 1100; // resolución del muestreo (cuadrada)
    const LOGO_ASPECT = 1168 / 1155; // ancho/alto del PNG del logo (se respeta, no se estira)
    const LOGO_GLYPH_K = 1.3;

    // Imagen nítida (la misma fuente, sin pasar por dígitos) que se muestra
    // SOLO un instante al final, cuando el logo ya está completamente armado
    // y sostenido: el enjambre se funde a la versión perfecta y vuelve a
    // dígitos antes de dispersarse -- nunca se ve "pegada" de entrada, se
    // gana con la convergencia real de los números.
    const logoImgEl = new Image();
    let logoImgReady = false;
    logoImgEl.onload = () => { logoImgReady = true; };
    logoImgEl.src = LOGO_OVERLAY_URL;

    let logoReady = false;
    let logoStep = 0.01;
    const logoTX = new Float32Array(COUNT);
    const logoTY = new Float32Array(COUNT);
    const logoR = new Uint8Array(COUNT);
    const logoG = new Uint8Array(COUNT);
    const logoB = new Uint8Array(COUNT);
    const logoA = new Float32Array(COUNT);
    logoA.fill(1);
    const logoScale = new Float32Array(COUNT);
    logoScale.fill(1);

    (function loadLogo() {
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        const S = LOGO_SAMPLE;
        const off = document.createElement("canvas");
        off.width = S;
        off.height = S;
        const octx = off.getContext("2d");
        const dw = Math.round(S * LOGO_ASPECT);
        octx.drawImage(img, Math.floor((S - dw) / 2), 0, dw, S);
        let data;
        try {
          data = octx.getImageData(0, 0, S, S).data;
        } catch (e) {
          return;
        }
        const N = S * S;
        const solid = new Uint8Array(N);
        const cr = new Uint8Array(N), cg = new Uint8Array(N), cb = new Uint8Array(N);
        for (let i = 0; i < N; i++) {
          if (data[i * 4 + 3] < 110) continue;
          solid[i] = 1;
          cr[i] = data[i * 4];
          cg[i] = data[i * 4 + 1];
          cb[i] = data[i * 4 + 2];
        }
        // Halo blanco: la imagen trae un contorno casi blanco alrededor de
        // cada figura; esos píxeles toman el color "más puro" de su
        // vecindario 5x5, o se descartan como fondo si no hay ninguno.
        const minC = (i) => Math.min(cr[i], cg[i], cb[i]);
        const fixes = [];
        for (let i = 0; i < N; i++) {
          if (!solid[i] || minC(i) <= 120) continue;
          const x = i % S, y = (i / S) | 0;
          let best = -1;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const nx = x + dx, ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
              const j = ny * S + nx;
              if (solid[j] && (best < 0 || minC(j) < minC(best))) best = j;
            }
          }
          fixes.push(i, best);
        }
        const fixed = [];
        for (let k = 0; k < fixes.length; k += 2) {
          const b = fixes[k + 1];
          fixed.push(fixes[k], cr[b], cg[b], cb[b]);
        }
        for (let k = 0; k < fixed.length; k += 4) {
          const i = fixed[k];
          if (Math.min(fixed[k + 1], fixed[k + 2], fixed[k + 3]) > 120) {
            solid[i] = 0;
          } else {
            cr[i] = fixed[k + 1];
            cg[i] = fixed[k + 2];
            cb[i] = fixed[k + 3];
          }
        }
        // Fondo exterior: relleno por inundación desde el borde del lienzo.
        const ext = new Uint8Array(N);
        const queue = new Int32Array(N);
        let qh = 0, qt = 0;
        const pushExt = (i) => { if (!solid[i] && !ext[i]) { ext[i] = 1; queue[qt++] = i; } };
        for (let k = 0; k < S; k++) {
          pushExt(k); pushExt((S - 1) * S + k); pushExt(k * S); pushExt(k * S + S - 1);
        }
        while (qh < qt) {
          const i = queue[qh++], x = i % S, y = (i / S) | 0;
          if (x > 0) pushExt(i - 1);
          if (x < S - 1) pushExt(i + 1);
          if (y > 0) pushExt(i - S);
          if (y < S - 1) pushExt(i + S);
        }
        // Huecos interiores (transparentes pero encerrados por el logo):
        // TODOS -- el corazón, el hueco del aro, el espacio entre los dedos
        // de la mano -- se rellenan de blanco, como en el logo original.
        // Solo las costuras diminutas entre capas toman el color vecino.
        const seen = new Uint8Array(N);
        const seams = [];
        const TINY = N * 0.00006;
        for (let s0 = 0; s0 < N; s0++) {
          if (solid[s0] || ext[s0] || seen[s0]) continue;
          const comp = [s0];
          seen[s0] = 1;
          for (let k = 0; k < comp.length; k++) {
            const i = comp[k], x = i % S, y = (i / S) | 0;
            const nb = [x > 0 ? i - 1 : -1, x < S - 1 ? i + 1 : -1, y > 0 ? i - S : -1, y < S - 1 ? i + S : -1];
            for (const j of nb) {
              if (j >= 0 && !solid[j] && !ext[j] && !seen[j]) { seen[j] = 1; comp.push(j); }
            }
          }
          if (comp.length < TINY) {
            for (const i of comp) seams.push(i);
          } else {
            for (const i of comp) { solid[i] = 1; cr[i] = 251; cg[i] = 255; cb[i] = 251; }
          }
        }
        let pending = seams;
        while (pending.length) {
          const fill = [], rest = [];
          for (const i of pending) {
            const x = i % S, y = (i / S) | 0;
            const nb = [x < S - 1 ? i + 1 : -1, x > 0 ? i - 1 : -1, y < S - 1 ? i + S : -1, y > 0 ? i - S : -1];
            let src = -1;
            for (const j of nb) if (j >= 0 && solid[j]) { src = j; break; }
            if (src >= 0) fill.push(i, src); else rest.push(i);
          }
          if (!fill.length) break;
          for (let k = 0; k < fill.length; k += 2) {
            const i = fill[k], j = fill[k + 1];
            cr[i] = cr[j]; cg[i] = cg[j]; cb[i] = cb[j];
          }
          for (let k = 0; k < fill.length; k += 2) solid[fill[k]] = 1;
          pending = rest;
        }

        // Mapa de borde: distancia (en píxeles de muestreo) de cada píxel al
        // contorno más cercano (silueta). Solo silueta, nunca diferencia de
        // color: el logo tiene bandas internas de degradado que no son
        // borde real.
        const trueEdge = new Uint8Array(N);
        for (let i = 0; i < N; i++) {
          if (!solid[i]) continue;
          const x = i % S, y = (i / S) | 0;
          let edge = x === 0 || y === 0 || x === S - 1 || y === S - 1;
          if (!edge) {
            const nb = [i - 1, i + 1, i - S, i + S];
            for (const j of nb) {
              if (!solid[j]) { edge = true; break; }
            }
          }
          if (edge) trueEdge[i] = 1;
        }
        const EDGE_BAND = Math.max(3, Math.round(S * 0.012));
        const distToEdge = new Uint8Array(N).fill(255);
        {
          const q = new Int32Array(N);
          let qh2 = 0, qt2 = 0;
          for (let i = 0; i < N; i++) if (trueEdge[i]) { distToEdge[i] = 0; q[qt2++] = i; }
          while (qh2 < qt2) {
            const i = q[qh2++], d = distToEdge[i], x = i % S, y = (i / S) | 0;
            if (d >= EDGE_BAND) continue;
            const nb = [x > 0 ? i - 1 : -1, x < S - 1 ? i + 1 : -1, y > 0 ? i - S : -1, y < S - 1 ? i + S : -1];
            for (const j of nb) {
              if (j >= 0 && solid[j] && distToEdge[j] > d + 1) { distToEdge[j] = d + 1; q[qt2++] = j; }
            }
          }
        }

        // Objetivos en rejilla hexagonal uniforme (no píxeles al azar): así
        // cada dígito queda a la misma distancia de sus vecinos y no se
        // forman grumos ni huecos.
        function grid(step, out) {
          let n = 0;
          const rowH = step * 0.866;
          for (let row = 0, yy = -1 + rowH * 0.5; yy < 1; row++, yy += rowH) {
            const sy = Math.floor((1 - yy) / 2 * S);
            if (sy < 0 || sy >= S) continue;
            for (let xx = -1 + (row % 2) * step * 0.5 + step * 0.5; xx < 1; xx += step) {
              const sx = Math.floor((xx + 1) / 2 * S);
              if (sx < 0 || sx >= S) continue;
              const i = sy * S + sx;
              if (!solid[i]) continue;
              if (out) out.push({ x: xx, y: yy, r: cr[i], g: cg[i], b: cb[i] });
              n++;
            }
          }
          return n;
        }
        let lo = 0.0004, hi = 0.2;
        for (let k = 0; k < 30; k++) {
          const mid = (lo + hi) / 2;
          if (grid(mid) > COUNT) lo = mid; else hi = mid;
        }
        logoStep = hi;
        const candidates = [];
        grid(logoStep, candidates);
        if (!candidates.length) return;
        // Baraja determinística (Fisher-Yates con hash1 como RNG): cada
        // punto de la esfera viaja a un objetivo arbitrario del logo.
        for (let i = candidates.length - 1; i > 0; i--) {
          const j = Math.floor(hash1(i * 17.23 + 3.1) * (i + 1));
          const tmp = candidates[i];
          candidates[i] = candidates[j];
          candidates[j] = tmp;
        }
        for (let i = 0; i < COUNT; i++) {
          const c = candidates[i % candidates.length];
          const extra = i >= candidates.length ? 0.5 * logoStep : 0;
          logoTX[i] = c.x + extra;
          logoTY[i] = c.y;
          logoR[i] = c.r;
          logoG[i] = c.g;
          logoB[i] = c.b;
        }

        // Antialiasing de borde: solo los dígitos en la banda de silueta
        // promedian una ventanita de la máscara `solid` ya corregida.
        const AA_R = 2;
        for (let i = 0; i < COUNT; i++) {
          const sx = Math.floor((logoTX[i] + 1) / 2 * S);
          const sy = Math.floor((1 - logoTY[i]) / 2 * S);
          const idx = Math.min(N - 1, Math.max(0, sy * S + sx));
          if (distToEdge[idx] > EDGE_BAND) { logoA[i] = 1; continue; }
          let hit = 0, total = 0;
          for (let dy = -AA_R; dy <= AA_R; dy++) {
            const ny = sy + dy;
            if (ny < 0 || ny >= S) continue;
            for (let dx = -AA_R; dx <= AA_R; dx++) {
              const nx = sx + dx;
              if (nx < 0 || nx >= S) continue;
              total++;
              if (solid[ny * S + nx]) hit++;
            }
          }
          logoA[i] = total ? Math.max(0.45, hit / total) : 1;
        }
        logoReady = true;
      };
      img.src = LOGO_SAMPLE_URL;
    })();

    // Luz fija viniendo de abajo-a-la-derecha (en espacio de la esfera,
    // antes de rotar).
    const LIGHT = normalize([0.55, -0.6, 0.6]);

    function normalize(v) {
      const l = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / l, v[1] / l, v[2] / l];
    }
    function smoothstep(lo, hi, x) {
      const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
      return t * t * (3 - 2 * t);
    }
    // Ruido 1D suave (value noise): no se repite con período fijo, así que
    // la cámara y el giro se sienten impredecibles, no mecánicos.
    function hash1(n) {
      const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
      return s - Math.floor(s);
    }
    function noise1D(t) {
      const i = Math.floor(t);
      const f = t - i;
      const u = f * f * (3 - 2 * f);
      return hash1(i) * (1 - u) + hash1(i + 1) * u;
    }
    function drift(t, speed, seed) {
      return noise1D(t * speed + seed) * 2 - 1;
    }
    function rotateY(p, a) {
      const c = Math.cos(a), s = Math.sin(a);
      return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
    }

    let angle = 0.6;
    let t0 = performance.now();
    let tAccum = 0;

    const projected = pts.map(() => ({ sx: 0, sy: 0, z: 0, alpha: 0, size: 0, digit: 1, r: 0, g: 0, b: 0 }));
    const order = projected.slice();
    const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
    const fontCache = new Map();
    function fontFor(size) {
      const q = Math.round(size * 5) / 5;
      let f = fontCache.get(q);
      if (!f) {
        f = `${q > 4 ? 600 : 400} ${q.toFixed(1)}px 'JetBrains Mono', monospace`;
        fontCache.set(q, f);
      }
      return f;
    }

    function frame(now) {
      if (cancelled) return;
      const dt = Math.min((now - t0) / 1000, 0.05);
      t0 = now;
      if (!reduceMotion) {
        const speed = 0.62 + 0.35 * drift(tAccum, 0.08, 4.1);
        angle += dt * speed;
        tAccum += dt;
      }

      const bg = ctx.createRadialGradient(W * 0.78, H * 0.82, H * 0.08, W * 0.5, H * 0.5, H * 0.95);
      bg.addColorStop(0, "#123a33");
      bg.addColorStop(0.45, "#0a211c");
      bg.addColorStop(1, "#030b09");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      const cx = W * (0.5 + 0.1 * drift(tAccum, 0.09, 12.4));
      const cy = H * (0.46 + 0.07 * drift(tAccum, 0.11, 58.9));
      const breathe = 1 + drift(tAccum, 0.1, 27.2) * 0.08;
      const scale = Math.min(W, H) * 0.44 * breathe;

      const wobble = drift(tAccum, 0.13, 91.6) * 0.22;
      const lightAngle = tAccum * 0.12;
      const light = rotateY({ x: LIGHT[0], y: LIGHT[1], z: LIGHT[2] }, lightAngle);
      const nt = tAccum * 0.55;
      const CYCLE = 22;
      const cyclePos = reduceMotion ? 0 : (tAccum % CYCLE) / CYCLE;
      let logoAmountRaw;
      if (cyclePos < 0.28) logoAmountRaw = 0;
      else if (cyclePos < 0.44) logoAmountRaw = smoothstep(0.28, 0.44, cyclePos);
      else if (cyclePos < 0.78) logoAmountRaw = 1;
      else if (cyclePos < 0.92) logoAmountRaw = 1 - smoothstep(0.78, 0.92, cyclePos);
      else logoAmountRaw = 0;
      const logoAmount = logoReady ? logoAmountRaw : 0;
      let imageReveal = 0;
      if (logoImgReady) {
        if (cyclePos > 0.52 && cyclePos < 0.6) imageReveal = smoothstep(0.52, 0.6, cyclePos);
        else if (cyclePos >= 0.6 && cyclePos <= 0.68) imageReveal = 1;
        else if (cyclePos > 0.68 && cyclePos < 0.76) imageReveal = 1 - smoothstep(0.68, 0.76, cyclePos);
      }
      const logoGlyph = logoStep * scale * 0.92 * LOGO_GLYPH_K;

      const cosA = Math.cos(angle), sinA = Math.sin(angle);
      const cosW = Math.cos(wobble), sinW = Math.sin(wobble);
      for (let i = 0; i < COUNT; i++) {
        const p = pts[i];
        const ph = p.digitSeed * 6.283;
        const noise =
          (Math.sin(p.x * 3.1 + nt + ph) * Math.cos(p.y * 2.3 - nt * 0.8) +
            Math.sin(p.z * 2.7 + nt * 1.3 + ph) * Math.cos(p.x * 1.9 + nt * 0.6)) *
          0.5;
        const seedR = (i * 0.73205) % 1000;
        const radialJitter = reduceMotion ? 0 : drift(tAccum, 1.7, seedR) * 0.16;
        const bulge = 1 + Math.max(-0.6, Math.min(0.6, noise)) * 0.035 + radialJitter;
        const bx = p.x * bulge, by = p.y * bulge, bz = p.z * bulge;
        const ry0x = bx * cosA + bz * sinA;
        const ry0z = -bx * sinA + bz * cosA;
        const r = { x: ry0x, y: by * cosW - ry0z * sinW, z: by * sinW + ry0z * cosW };
        const lightDotRaw = r.x * light.x + r.y * light.y + r.z * light.z;
        const lightDot = smoothstep(-0.15, 0.35, lightDotRaw);
        const depth = (r.z + 1) / 2;
        const twinkle = reduceMotion ? 1 : 0.85 + 0.15 * Math.sin(tAccum * 2.1 + (i * 12.9898) % 6.283);

        const flowRaw =
          Math.sin(r.x * 5.2 + r.y * 2.1 - nt * 2.2) +
          Math.sin(r.y * 4.4 - r.z * 3.6 + nt * 1.7) +
          Math.sin(r.z * 3.8 + r.x * 3.1 + nt * 2.6);
        const flow = (flowRaw / 3 + 1) / 2;

        const brightness = Math.min(1, (lightDot * 0.62 + flow * 0.26 + depth * 0.12 + 0.05) * twinkle);

        const seedX = (i * 0.6180339887) % 1000;
        const seedY = (i * 0.3819660113 + 500) % 1000;
        const jitterFalloff = 1 - logoAmount;
        const jx = reduceMotion ? 0 : drift(tAccum, 2.6, seedX) * 10 * jitterFalloff;
        const jy = reduceMotion ? 0 : drift(tAccum, 2.9, seedY) * 10 * jitterFalloff;

        const sphereSx = cx + r.x * scale + jx;
        const sphereSy = cy - r.y * scale + jy;
        let sx = sphereSx;
        let sy = sphereSy;
        if (logoAmount > 0) {
          const lsx = cx + logoTX[i] * scale * 0.92;
          const lsy = cy - logoTY[i] * scale * 0.92;
          const e = smoothstep(0, 1, logoAmount);
          sx = sphereSx + (lsx - sphereSx) * e;
          sy = sphereSy + (lsy - sphereSy) * e;
        }

        const digitJitter = reduceMotion ? 0 : drift(tAccum, 3.1, (i * 0.419) % 1000) * 1.6 * jitterFalloff;
        const digit = logoAmount > 0.995
          ? 1 + Math.floor(p.digitSeed * 9)
          : 1 + Math.min(8, Math.max(0, Math.round(brightness * 8.2 + p.digitSeed * 1.4 + digitJitter)));

        const sphereSize = (1.9 + brightness * 3.6) * (0.75 + p.sizeSeed * 0.5);
        const logoSize = logoGlyph * (0.9 + (p.sizeSeed - 0.5) * 0.4) * logoScale[i];
        const size = sphereSize + (logoSize - sphereSize) * logoAmount;

        const sphereAlpha = Math.min(1, brightness * 1.15 + 0.04);
        const alpha = Math.max(sphereAlpha * (1 - logoAmount), logoAmount * logoA[i]) * (1 - imageReveal);

        const ir = logoReady ? logoR[i] : 47;
        const ig = logoReady ? logoG[i] : 217;
        const ib = logoReady ? logoB[i] : 196;
        let shr, shg, shb;
        if (brightness < 0.45) {
          const t = brightness / 0.45;
          shr = ir * 0.14 + (ir - ir * 0.14) * t;
          shg = ig * 0.16 + (ig - ig * 0.16) * t;
          shb = ib * 0.18 + (ib - ib * 0.18) * t;
        } else {
          const t = ((brightness - 0.45) / 0.55) * 0.6;
          shr = ir + (255 - ir) * t;
          shg = ig + (255 - ig) * t;
          shb = ib + (255 - ib) * t;
        }

        const o = projected[i];
        o.sx = sx; o.sy = sy; o.z = r.z; o.alpha = alpha; o.size = size; o.digit = digit;
        o.r = shr + (ir - shr) * logoAmount;
        o.g = shg + (ig - shg) * logoAmount;
        o.b = shb + (ib - shb) * logoAmount;
      }
      order.sort((a, b) => a.z - b.z);

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      let lastFont = "";
      let lastFill = "";
      for (let k = 0; k < COUNT; k++) {
        const p = order[k];
        if (p.alpha < 0.02) continue;
        const font = fontFor(p.size);
        if (font !== lastFont) { ctx.font = font; lastFont = font; }
        const fill = `rgba(${p.r | 0},${p.g | 0},${p.b | 0},${p.alpha.toFixed(2)})`;
        if (fill !== lastFill) { ctx.fillStyle = fill; lastFill = fill; }
        ctx.fillText(DIGITS[p.digit], p.sx, p.sy);
      }

      if (imageReveal > 0.01 && logoImgReady) {
        const ih = scale * 0.92 * 2;
        const iw = ih * LOGO_ASPECT;
        ctx.save();
        ctx.globalAlpha = imageReveal;
        ctx.drawImage(logoImgEl, cx - iw / 2, cy - ih / 2, iw, ih);
        ctx.restore();
      }

      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className={`relative h-full w-full overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
