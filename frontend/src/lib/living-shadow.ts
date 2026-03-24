// ============================================================
// The Casting Room — Living Shadow Canvas 2D Renderer
// Procedural silhouette with 6-layer compositing pipeline
// ============================================================

export type ShadowState =
  | "MIRROR"
  | "STIRRING"
  | "MATERIALIZING"
  | "PRESENT"
  | "SPEAKING"
  | "LISTENING"
  | "THINKING"
  | "DEMATERIALIZING";

// --- Inline simplex noise (no npm dependency) ---

const GRAD3 = [
  [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
  [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
  [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1],
];

function buildPermTable(): { perm: number[]; permMod12: number[] } {
  const p: number[] = [];
  for (let i = 0; i < 256; i++) p[i] = Math.floor(Math.random() * 256);
  const perm: number[] = new Array(512);
  const permMod12: number[] = new Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }
  return { perm, permMod12 };
}

const { perm, permMod12 } = buildPermTable();

function simplex2(xin: number, yin: number): number {
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;
  const s = (xin + yin) * F2;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);
  const t = (i + j) * G2;
  const X0 = i - t;
  const Y0 = j - t;
  const x0 = xin - X0;
  const y0 = yin - Y0;
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;
  const ii = i & 255;
  const jj = j & 255;
  const gi0 = permMod12[ii + perm[jj]];
  const gi1 = permMod12[ii + i1 + perm[jj + j1]];
  const gi2 = permMod12[ii + 1 + perm[jj + 1]];
  let n0 = 0, n1 = 0, n2 = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 >= 0) { t0 *= t0; n0 = t0 * t0 * (GRAD3[gi0][0] * x0 + GRAD3[gi0][1] * y0); }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 >= 0) { t1 *= t1; n1 = t1 * t1 * (GRAD3[gi1][0] * x1 + GRAD3[gi1][1] * y1); }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 >= 0) { t2 *= t2; n2 = t2 * t2 * (GRAD3[gi2][0] * x2 + GRAD3[gi2][1] * y2); }
  return 70 * (n0 + n1 + n2);
}

// --- Particle system ---

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  opacity: number;
}

function spawnParticle(w: number, h: number): Particle {
  const cx = w / 2;
  const cy = h * 0.38;
  const angle = Math.random() * Math.PI * 2;
  const dist = 80 + Math.random() * 250;
  return {
    x: cx + Math.cos(angle) * dist,
    y: cy + Math.sin(angle) * dist * 1.3,
    vx: (Math.random() - 0.5) * 0.3,
    vy: -0.2 - Math.random() * 0.5,
    life: 0,
    maxLife: 120 + Math.random() * 180,
    size: 1 + Math.random() * 2,
    opacity: 0,
  };
}

// --- Captain silhouette path (bezier curves) ---
// Full-body Captain Magee: tricorn hat, greatcoat billowing right, boots on waves

function drawCaptainPath(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, scale: number,
  coatFlutter: number,
) {
  // cy is the vertical anchor — roughly chest height.
  // All Y offsets are relative to cy.
  const s = scale;

  // --- Key Y anchors ---
  const hatTop    = cy - 195 * s;
  const hatBrim   = cy - 150 * s;
  const headCy    = cy - 130 * s;   // centre of head ellipse
  const chinY     = cy - 105 * s;
  const shoulderY = cy - 70 * s;
  const waistY    = cy + 30 * s;
  const coatHemY  = cy + 160 * s;
  const kneeY     = cy + 190 * s;
  const bootTopY  = cy + 210 * s;
  const feetY     = cy + 270 * s;

  // Coat flutter offset (positive = billows right)
  const cf = coatFlutter * s;

  ctx.beginPath();

  // ---- Tricorn hat ----
  // Start at left brim tip
  ctx.moveTo(cx - 58 * s, hatBrim);
  // Left brim up to front peak
  ctx.bezierCurveTo(
    cx - 50 * s, hatBrim - 15 * s,
    cx - 25 * s, hatTop + 8 * s,
    cx, hatTop
  );
  // Front peak to right brim tip
  ctx.bezierCurveTo(
    cx + 25 * s, hatTop + 8 * s,
    cx + 50 * s, hatBrim - 15 * s,
    cx + 62 * s, hatBrim
  );
  // Right brim underside (curves back inward to head)
  ctx.bezierCurveTo(
    cx + 48 * s, hatBrim + 8 * s,
    cx + 32 * s, hatBrim + 5 * s,
    cx + 28 * s, hatBrim + 4 * s
  );

  // ---- Head (right side down to chin) ----
  ctx.bezierCurveTo(
    cx + 30 * s, headCy - 15 * s,
    cx + 30 * s, headCy + 15 * s,
    cx + 16 * s, chinY
  );

  // ---- Right neck to shoulder ----
  ctx.bezierCurveTo(
    cx + 18 * s, chinY + 10 * s,
    cx + 55 * s, shoulderY - 10 * s,
    cx + 80 * s, shoulderY
  );

  // ---- Right arm / coat right side ----
  // Shoulder down to waist (arm at side under coat)
  ctx.bezierCurveTo(
    cx + 90 * s, shoulderY + 20 * s,
    cx + 75 * s, waistY - 30 * s,
    cx + 70 * s, waistY
  );

  // ---- Coat right — billowing flap (wind-blown) ----
  // Waist out to coat flare
  ctx.bezierCurveTo(
    cx + 80 * s + cf * 0.5, waistY + 40 * s,
    cx + 110 * s + cf, coatHemY - 60 * s,
    cx + 130 * s + cf * 1.2, coatHemY - 20 * s
  );
  // Coat tail — the dramatic billowing trailing edge
  ctx.bezierCurveTo(
    cx + 150 * s + cf * 1.5, coatHemY + 10 * s,
    cx + 160 * s + cf * 1.8, coatHemY + 40 * s,
    cx + 140 * s + cf * 1.4, coatHemY + 60 * s
  );
  // Coat tail curls back inward
  ctx.bezierCurveTo(
    cx + 120 * s + cf, coatHemY + 50 * s,
    cx + 80 * s + cf * 0.3, coatHemY + 20 * s,
    cx + 50 * s, coatHemY
  );

  // ---- Right leg (below coat hem) ----
  ctx.bezierCurveTo(
    cx + 45 * s, kneeY,
    cx + 40 * s, bootTopY,
    cx + 38 * s, feetY
  );

  // ---- Right boot ----
  ctx.bezierCurveTo(
    cx + 40 * s, feetY + 8 * s,
    cx + 25 * s, feetY + 12 * s,
    cx + 12 * s, feetY + 10 * s
  );

  // ---- Gap between boots ----
  ctx.lineTo(cx - 12 * s, feetY + 10 * s);

  // ---- Left boot ----
  ctx.bezierCurveTo(
    cx - 25 * s, feetY + 12 * s,
    cx - 40 * s, feetY + 8 * s,
    cx - 38 * s, feetY
  );

  // ---- Left leg up to coat hem ----
  ctx.bezierCurveTo(
    cx - 40 * s, bootTopY,
    cx - 42 * s, kneeY,
    cx - 45 * s, coatHemY
  );

  // ---- Coat left side (straighter, less billowing) ----
  ctx.bezierCurveTo(
    cx - 55 * s, coatHemY - 30 * s,
    cx - 65 * s, waistY + 40 * s,
    cx - 65 * s, waistY
  );

  // ---- Left arm / torso left side ----
  ctx.bezierCurveTo(
    cx - 70 * s, waistY - 30 * s,
    cx - 85 * s, shoulderY + 20 * s,
    cx - 78 * s, shoulderY
  );

  // ---- Left shoulder to neck ----
  ctx.bezierCurveTo(
    cx - 55 * s, shoulderY - 10 * s,
    cx - 18 * s, chinY + 10 * s,
    cx - 16 * s, chinY
  );

  // ---- Head left side up to hat ----
  ctx.bezierCurveTo(
    cx - 30 * s, headCy + 15 * s,
    cx - 30 * s, headCy - 15 * s,
    cx - 28 * s, hatBrim + 4 * s
  );

  // ---- Left brim underside back to start ----
  ctx.bezierCurveTo(
    cx - 32 * s, hatBrim + 5 * s,
    cx - 48 * s, hatBrim + 8 * s,
    cx - 58 * s, hatBrim
  );

  ctx.closePath();
}

// --- Ocean wave path beneath the captain's feet ---

function drawWavePath(
  ctx: CanvasRenderingContext2D,
  cx: number, waveTopY: number, scale: number,
  time: number,
) {
  const s = scale;
  // Animated wave roll offsets
  const roll1 = Math.sin(time * 0.8) * 8 * s;
  const roll2 = Math.sin(time * 0.6 + 1.5) * 6 * s;
  const roll3 = Math.sin(time * 1.0 + 3.0) * 5 * s;

  ctx.beginPath();

  // --- Main wave (large curl under the captain) ---
  const wy = waveTopY;
  ctx.moveTo(cx - 160 * s, wy + 20 * s + roll2);
  // Rising swell from left
  ctx.bezierCurveTo(
    cx - 120 * s, wy + 5 * s + roll1,
    cx - 70 * s,  wy - 15 * s + roll1,
    cx - 20 * s,  wy - 20 * s + roll1
  );
  // Wave crest (the curl)
  ctx.bezierCurveTo(
    cx + 15 * s, wy - 22 * s + roll1,
    cx + 50 * s, wy - 18 * s + roll1,
    cx + 80 * s, wy - 5 * s + roll2
  );
  // Descending right side
  ctx.bezierCurveTo(
    cx + 110 * s, wy + 10 * s + roll2,
    cx + 140 * s, wy + 25 * s + roll2,
    cx + 170 * s, wy + 30 * s + roll2
  );

  // --- Second wave (smaller, below and offset) ---
  const wy2 = wy + 40 * s;
  ctx.moveTo(cx - 140 * s, wy2 + 15 * s + roll3);
  ctx.bezierCurveTo(
    cx - 100 * s, wy2 + 5 * s + roll2,
    cx - 50 * s,  wy2 - 8 * s + roll2,
    cx,           wy2 - 10 * s + roll2
  );
  ctx.bezierCurveTo(
    cx + 40 * s, wy2 - 8 * s + roll3,
    cx + 90 * s, wy2 + 5 * s + roll3,
    cx + 150 * s, wy2 + 18 * s + roll3
  );

  // --- Third wave (smallest, suggestion only) ---
  const wy3 = wy + 70 * s;
  ctx.moveTo(cx - 110 * s, wy3 + 10 * s + roll1);
  ctx.bezierCurveTo(
    cx - 60 * s, wy3 + roll3,
    cx + 20 * s, wy3 - 5 * s + roll3,
    cx + 120 * s, wy3 + 12 * s + roll1
  );
}

// --- Main renderer class ---

const MAX_PARTICLES = 150;
const TARGET_FPS = 30;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

export class LivingShadowRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private state: ShadowState = "MIRROR";
  private amplitude = 0;
  private targetAmplitude = 0;
  private particles: Particle[] = [];
  private time = 0;
  private animFrameId = 0;
  private lastFrameTime = 0;
  private materialiseProgress = 0;
  private destroyed = false;

  // State transition timing
  private stateStartTime = 0;
  private prevState: ShadowState = "MIRROR";

  init(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.resize();
    this.destroyed = false;
    this.lastFrameTime = performance.now();
    this.loop(this.lastFrameTime);
  }

  destroy() {
    this.destroyed = true;
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.canvas = null;
    this.ctx = null;
  }

  setState(state: ShadowState) {
    if (state === this.state) return;
    this.prevState = this.state;
    this.state = state;
    this.stateStartTime = this.time;
    if (state === "MATERIALIZING") this.materialiseProgress = 0;
  }

  setAmplitude(rms: number) {
    this.targetAmplitude = Math.min(1, Math.max(0, rms));
  }

  resize() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx?.scale(dpr, dpr);
  }

  private loop = (now: number) => {
    if (this.destroyed) return;
    this.animFrameId = requestAnimationFrame(this.loop);
    const dt = now - this.lastFrameTime;
    if (dt < FRAME_INTERVAL) return;
    this.lastFrameTime = now - (dt % FRAME_INTERVAL);
    this.time += dt / 1000;
    this.update(dt / 1000);
    this.render();
  };

  private update(dt: number) {
    // Smooth amplitude
    this.amplitude += (this.targetAmplitude - this.amplitude) * 0.3;

    // Materialise progress
    if (this.state === "MATERIALIZING") {
      this.materialiseProgress = Math.min(1, this.materialiseProgress + dt * 0.5); // 2s
      if (this.materialiseProgress >= 1) {
        this.setState("PRESENT");
      }
    } else if (this.state === "DEMATERIALIZING") {
      this.materialiseProgress = Math.max(0, this.materialiseProgress - dt * 0.65); // ~1.5s
    } else if (this.state !== "MIRROR" && this.state !== "STIRRING") {
      this.materialiseProgress = 1;
    }

    // Particles
    const activity = this.getParticleActivity();
    if (this.particles.length < MAX_PARTICLES && Math.random() < activity * 0.3) {
      this.particles.push(spawnParticle(this.displayWidth, this.displayHeight));
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life++;
      p.x += p.vx + Math.sin(this.time * 0.5 + i) * 0.2;
      p.y += p.vy;
      const lifeRatio = p.life / p.maxLife;
      p.opacity = lifeRatio < 0.2 ? lifeRatio / 0.2 : lifeRatio > 0.8 ? (1 - lifeRatio) / 0.2 : 1;
      p.opacity *= activity * 0.85;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
      }
    }
  }

  private get displayWidth() {
    return this.canvas?.getBoundingClientRect().width ?? 800;
  }

  private get displayHeight() {
    return this.canvas?.getBoundingClientRect().height ?? 600;
  }

  private getParticleActivity(): number {
    switch (this.state) {
      case "MIRROR": return 0;
      case "STIRRING": return 0.3;
      case "MATERIALIZING": return 0.4 + this.materialiseProgress * 0.4;
      case "SPEAKING": return 0.6 + this.amplitude * 0.4;
      case "THINKING": return 0.5;
      case "LISTENING": return 0.4;
      case "PRESENT": return 0.4;
      case "DEMATERIALIZING": return this.materialiseProgress * 0.5;
      default: return 0.3;
    }
  }

  private getSilhouetteOpacity(): number {
    switch (this.state) {
      case "MIRROR": return 0;
      case "STIRRING": return 0.05;
      case "MATERIALIZING": return this.materialiseProgress * 0.85;
      case "DEMATERIALIZING": return this.materialiseProgress * 0.85;
      default: return 0.85;
    }
  }

  private render() {
    const ctx = this.ctx;
    if (!ctx) return;
    const w = this.displayWidth;
    const h = this.displayHeight;

    // Layer 1: Black background
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);

    // Layer 2: Fog (Perlin noise driven ellipses)
    this.renderFog(ctx, w, h);

    // Layer 3: Silhouette
    const opacity = this.getSilhouetteOpacity();
    if (opacity > 0.01) {
      this.renderSilhouette(ctx, w, h, opacity);
    }

    // Layer 4: Edge glow
    if (opacity > 0.05) {
      this.renderEdgeGlow(ctx, w, h, opacity);
    }

    // Layer 5: Particles
    this.renderParticles(ctx);

    // Layer 6: Vignette
    this.renderVignette(ctx, w, h);
  }

  private renderFog(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const fogCount = 35;
    const t = this.time * 0.15;
    ctx.save();
    for (let i = 0; i < fogCount; i++) {
      const nx = simplex2(i * 0.7 + t, t * 0.3) * 0.5 + 0.5;
      const ny = simplex2(i * 0.7 + 100, t * 0.2 + 100) * 0.5 + 0.5;
      const rx = 80 + simplex2(i * 0.3, t * 0.1) * 60;
      const ry = 40 + simplex2(i * 0.3 + 50, t * 0.1) * 30;
      const alpha = 0.04 + simplex2(i * 0.5 + 200, t * 0.15) * 0.025;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = "#2a4a6a";
      ctx.beginPath();
      ctx.ellipse(nx * w, ny * h, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private renderSilhouette(ctx: CanvasRenderingContext2D, w: number, h: number, opacity: number) {
    const cx = w / 2;
    const cy = h * 0.40;  // shifted up for full-body figure
    const scale = Math.min(w / 600, h / 800) * 0.85;

    // Body sway from amplitude
    const sway = Math.sin(this.time * 1.5) * this.amplitude * 3;

    // Coat flutter: base wind + amplitude enhancement
    const baseFlutter = Math.sin(this.time * 1.2) * 8 + Math.sin(this.time * 2.3) * 3;
    const ampFlutter = this.amplitude * 15;
    const coatFlutter = baseFlutter + ampFlutter;

    ctx.save();
    ctx.translate(sway, 0);

    // Subtle head tilt (rotate around head centre)
    const headCy = cy - 130 * scale;
    const tilt = Math.sin(this.time * 0.8) * this.amplitude * 0.025;
    ctx.translate(cx, headCy);
    ctx.rotate(tilt);
    ctx.translate(-cx, -headCy);

    // Materialisation blur
    const blurAmount = (1 - this.materialiseProgress) * 15;
    ctx.filter = blurAmount > 0.5 ? `blur(${blurAmount}px)` : "none";
    ctx.globalAlpha = opacity;

    // --- Captain silhouette fill — dark gradient ---
    drawCaptainPath(ctx, cx, cy, scale, coatFlutter);
    const feetY = cy + 270 * scale;
    const grad = ctx.createLinearGradient(cx, cy - 200 * scale, cx, feetY + 80 * scale);
    grad.addColorStop(0, "#1a1a2e");
    grad.addColorStop(0.6, "#10101c");
    grad.addColorStop(0.85, "#0c0c16");
    grad.addColorStop(1, "rgba(10,10,20,0)");
    ctx.fillStyle = grad;
    ctx.fill();

    // --- Ocean waves beneath feet ---
    const waveTopY = feetY + 10 * scale;
    drawWavePath(ctx, cx, waveTopY, scale, this.time);
    ctx.lineWidth = 6 * scale;
    ctx.strokeStyle = "#12121e";
    ctx.stroke();
    // Fill wave area with semi-transparent dark
    drawWavePath(ctx, cx, waveTopY, scale, this.time);
    ctx.lineWidth = 4 * scale;
    const waveGrad = ctx.createLinearGradient(cx, waveTopY - 25 * scale, cx, waveTopY + 80 * scale);
    waveGrad.addColorStop(0, "#14142a");
    waveGrad.addColorStop(1, "rgba(10,10,20,0)");
    ctx.strokeStyle = waveGrad;
    ctx.stroke();

    // --- Mouth (amplitude-driven arc) ---
    if (this.state === "SPEAKING" || this.state === "LISTENING" || this.state === "PRESENT") {
      const mouthY = cy - 115 * scale;  // below head centre, above chin
      const mouthOpen = this.state === "SPEAKING" ? this.amplitude * 7 * scale : 0.8 * scale;
      const mouthWidth = 10 * scale + (this.state === "SPEAKING" ? this.amplitude * 5 * scale : 0);
      ctx.beginPath();
      ctx.ellipse(cx, mouthY, mouthWidth, mouthOpen, 0, 0, Math.PI);
      ctx.fillStyle = `rgba(20, 15, 25, ${0.6 + this.amplitude * 0.3})`;
      ctx.fill();
    }

    ctx.restore();
  }

  private renderEdgeGlow(ctx: CanvasRenderingContext2D, w: number, h: number, opacity: number) {
    const cx = w / 2;
    const cy = h * 0.40;
    const scale = Math.min(w / 600, h / 800) * 0.85;
    const sway = Math.sin(this.time * 1.5) * this.amplitude * 3;

    const baseFlutter = Math.sin(this.time * 1.2) * 8 + Math.sin(this.time * 2.3) * 3;
    const ampFlutter = this.amplitude * 15;
    const coatFlutter = baseFlutter + ampFlutter;

    ctx.save();
    ctx.translate(sway, 0);
    ctx.globalAlpha = opacity * (0.5 + this.amplitude * 0.35);
    ctx.filter = "blur(6px)";

    const pulse = 0.5 + Math.sin(this.time * 2) * 0.15 + this.amplitude * 0.35;
    ctx.strokeStyle = `rgba(130, 170, 220, ${pulse})`;
    ctx.lineWidth = 4;

    // Glow around captain silhouette
    drawCaptainPath(ctx, cx, cy, scale, coatFlutter);
    ctx.stroke();

    // Glow along wave crests
    const feetY = cy + 270 * scale;
    const waveTopY = feetY + 10 * scale;
    ctx.lineWidth = 3;
    ctx.globalAlpha = opacity * (0.3 + this.amplitude * 0.2);
    drawWavePath(ctx, cx, waveTopY, scale, this.time);
    ctx.stroke();

    ctx.restore();
  }

  private renderParticles(ctx: CanvasRenderingContext2D) {
    ctx.save();
    for (const p of this.particles) {
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = "#88aacc";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private renderVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.max(w, h) * 0.7;
    const grad = ctx.createRadialGradient(cx, cy, radius * 0.3, cx, cy, radius);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}
