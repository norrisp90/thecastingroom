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
  const cy = h * 0.35;
  const angle = Math.random() * Math.PI * 2;
  const dist = 60 + Math.random() * 200;
  return {
    x: cx + Math.cos(angle) * dist,
    y: cy + Math.sin(angle) * dist,
    vx: (Math.random() - 0.5) * 0.3,
    vy: -0.2 - Math.random() * 0.5,
    life: 0,
    maxLife: 120 + Math.random() * 180,
    size: 1 + Math.random() * 2,
    opacity: 0,
  };
}

// --- Silhouette path (bezier curves) ---

function drawSilhouettePath(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number) {
  ctx.beginPath();
  // Head (ellipse)
  const headRx = 38 * scale;
  const headRy = 45 * scale;
  const headCy = cy - 120 * scale;
  ctx.ellipse(cx, headCy, headRx, headRy, 0, 0, Math.PI * 2);

  // Neck + shoulders + torso
  ctx.moveTo(cx - 18 * scale, headCy + headRy - 5 * scale);
  // Left neck to shoulder
  ctx.bezierCurveTo(
    cx - 20 * scale, headCy + headRy + 15 * scale,
    cx - 70 * scale, headCy + headRy + 25 * scale,
    cx - 130 * scale, headCy + headRy + 45 * scale
  );
  // Left shoulder down to torso
  ctx.bezierCurveTo(
    cx - 145 * scale, headCy + headRy + 55 * scale,
    cx - 120 * scale, headCy + headRy + 130 * scale,
    cx - 90 * scale, headCy + headRy + 250 * scale
  );
  // Bottom (fade into mist)
  ctx.bezierCurveTo(
    cx - 60 * scale, headCy + headRy + 320 * scale,
    cx + 60 * scale, headCy + headRy + 320 * scale,
    cx + 90 * scale, headCy + headRy + 250 * scale
  );
  // Right torso up to shoulder
  ctx.bezierCurveTo(
    cx + 120 * scale, headCy + headRy + 130 * scale,
    cx + 145 * scale, headCy + headRy + 55 * scale,
    cx + 130 * scale, headCy + headRy + 45 * scale
  );
  // Right shoulder to neck
  ctx.bezierCurveTo(
    cx + 70 * scale, headCy + headRy + 25 * scale,
    cx + 20 * scale, headCy + headRy + 15 * scale,
    cx + 18 * scale, headCy + headRy - 5 * scale
  );
  ctx.closePath();
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
      p.opacity *= activity * 0.6;
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
      const alpha = 0.015 + simplex2(i * 0.5 + 200, t * 0.15) * 0.01;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = "#1a2a3a";
      ctx.beginPath();
      ctx.ellipse(nx * w, ny * h, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private renderSilhouette(ctx: CanvasRenderingContext2D, w: number, h: number, opacity: number) {
    const cx = w / 2;
    const cy = h * 0.45;
    const scale = Math.min(w / 500, h / 700) * 0.9;

    // Body sway from amplitude
    const sway = Math.sin(this.time * 1.5) * this.amplitude * 3;

    ctx.save();
    ctx.translate(sway, 0);

    // Head tilt
    const tilt = Math.sin(this.time * 0.8) * this.amplitude * 0.03;
    ctx.translate(cx, cy - 120 * scale);
    ctx.rotate(tilt);
    ctx.translate(-cx, -(cy - 120 * scale));

    // Materialisation blur
    const blurAmount = (1 - this.materialiseProgress) * 15;
    ctx.filter = blurAmount > 0.5 ? `blur(${blurAmount}px)` : "none";
    ctx.globalAlpha = opacity;

    // Silhouette fill — dark gradient
    drawSilhouettePath(ctx, cx, cy, scale);
    const grad = ctx.createLinearGradient(cx, cy - 180 * scale, cx, cy + 200 * scale);
    grad.addColorStop(0, "#0a0a12");
    grad.addColorStop(0.5, "#05050a");
    grad.addColorStop(1, "rgba(5,5,10,0)");
    ctx.fillStyle = grad;
    ctx.fill();

    // Mouth (amplitude-driven arc)
    if (this.state === "SPEAKING" || this.state === "LISTENING" || this.state === "PRESENT") {
      const headCy = cy - 120 * scale;
      const mouthOpen = this.state === "SPEAKING" ? this.amplitude * 8 * scale : 1 * scale;
      const mouthWidth = 12 * scale + (this.state === "SPEAKING" ? this.amplitude * 6 * scale : 0);
      ctx.beginPath();
      ctx.ellipse(cx, headCy + 18 * scale, mouthWidth, mouthOpen, 0, 0, Math.PI);
      ctx.fillStyle = `rgba(20, 15, 25, ${0.6 + this.amplitude * 0.3})`;
      ctx.fill();
    }

    ctx.restore();
  }

  private renderEdgeGlow(ctx: CanvasRenderingContext2D, w: number, h: number, opacity: number) {
    const cx = w / 2;
    const cy = h * 0.45;
    const scale = Math.min(w / 500, h / 700) * 0.9;
    const sway = Math.sin(this.time * 1.5) * this.amplitude * 3;

    ctx.save();
    ctx.translate(sway, 0);
    ctx.globalAlpha = opacity * (0.25 + this.amplitude * 0.25);
    ctx.filter = "blur(8px)";

    drawSilhouettePath(ctx, cx, cy, scale);
    const pulse = 0.3 + Math.sin(this.time * 2) * 0.1 + this.amplitude * 0.3;
    ctx.strokeStyle = `rgba(100, 140, 180, ${pulse})`;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();
  }

  private renderParticles(ctx: CanvasRenderingContext2D) {
    ctx.save();
    for (const p of this.particles) {
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = "#6688aa";
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
    grad.addColorStop(1, "rgba(0,0,0,0.8)");
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}
