import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { buildPlaceholderScene, buildWindowScene, loadPhotoScene } from "../lib/window-scene";
import type { PhotoSources, WindowScene } from "../lib/window-scene";

type Ripple = { x: number; y: number; born: number; power: number };
type Drop = {
  x: number;
  y: number;
  r: number;
  target: number;
  vy: number;
  sliding: boolean;
  stall: number;
  nextStall: number;
};

const MAX_RIPPLES = 6;
const RIPPLE_MS = 1300;
const RIPPLE_REACH = 430;
const MASK_SCALE = 0.5;
const DRAG_THRESHOLD_PX = 4;

const REGROW_TAU = 8; // seconds; larger = fog creeps back more slowly
const DECAY_STEP = 0.2; // decay is applied in steps (8-bit canvas alpha can't do tiny per-frame steps)

const CHARGE_SECONDS = 1.2;

const DROP_MAX = 14;
const DROP_SPAWN_MIN = 0.9;
const DROP_SPAWN_MAX = 2.6;

const DAWN_DISTANCE = 14000;
const PROGRESS_STAGES = [0.25, 0.5, 0.75, 1].map((f) => f * DAWN_DISTANCE);

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 vUv;
uniform sampler2D uMask;
uniform sampler2D uSharpA;   // night, sharp
uniform sampler2D uSharpB;   // dawn, sharp
uniform sampler2D uBlurA;    // night, blurred
uniform sampler2D uBlurB;    // dawn, blurred
uniform vec2 uRes;
uniform vec2 uCover;         // "cover" fit of the scene onto the screen
uniform vec4 uLens;          // x, y (0..1), radius px, hover warmth
uniform float uCharge;
uniform float uDawn;
uniform float uTime;

const vec3 LUMA = vec3(0.299, 0.587, 0.114);
const vec3 VEIL = vec3(0.74, 0.82, 0.88);   // cold milky scatter
const vec3 WARM = vec3(0.90, 0.58, 0.32);   // your hand's warmth
const vec2 LDIR = vec2(-0.55, -0.835);      // light comes from the upper left

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453123);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

vec2 sceneUv(vec2 uv) { return (uv - 0.5) * uCover + 0.5; }

vec3 sharpAt(vec2 uv) {
  vec2 s = sceneUv(uv);
  return mix(texture2D(uSharpA, s).rgb, texture2D(uSharpB, s).rgb, uDawn);
}

vec3 blurTap(vec2 s) {
  return mix(texture2D(uBlurA, s).rgb, texture2D(uBlurB, s).rgb, uDawn);
}
vec3 blurAt(vec2 uv) {
  vec2 s = sceneUv(uv);
  float o = 0.009;
  return 0.25 * (blurTap(s + vec2(o, o)) + blurTap(s + vec2(-o, o)) +
                 blurTap(s + vec2(o, -o)) + blurTap(s + vec2(-o, -o)));
}

// One layer of round beads on a jittered grid. Returns coverage and hands back
// the bead's centre (px), its local normal (-1..1) and a random seed.
float bead(vec2 px, float cell, float rMin, float rMax, out vec2 ctr, out vec2 nrm, out float seed) {
  vec2 q = px / cell;
  vec2 i = floor(q);
  vec2 f = fract(q);
  seed = hash(i);
  vec2 c = vec2(0.3 + 0.4 * hash(i + 7.31), 0.3 + 0.4 * hash(i + 3.77));
  float r = mix(rMin, rMax, hash(i + 13.9));
  vec2 d = f - c;
  float l = length(d);
  ctr = (i + c) * cell;
  nrm = d / max(r, 1e-4);
  return 1.0 - smoothstep(r * 0.86, r, l);
}

float beadHi(vec2 n) {
  float l = length(n);
  return smoothstep(0.30, 0.95, l) * max(dot(n / max(l, 1e-3), LDIR), 0.0);
}
float beadShade(vec2 n) {
  float l = length(n);
  return smoothstep(0.55, 1.0, l) * max(-dot(n / max(l, 1e-3), LDIR), 0.0);
}

// A water bead acts as a tiny wide-angle lens: it shows the street upside
// down, with a bright highlight on the lit side and a dark rim opposite.
vec3 shadeBead(vec3 base, float cov, vec2 ctr, vec2 n) {
  if (cov < 0.001) return base;
  vec2 cUv = ctr / uRes;
  vec2 look = cUv - (vUv - cUv) * 4.0;
  vec3 inside = sharpAt(look);
  vec3 bc = inside * (1.0 - 0.5 * beadShade(n)) * 1.05 + VEIL * beadHi(n) * 0.6;
  return mix(base, bc, cov);
}

void main() {
  vec2 px = vUv * uRes;

  // ---- how wiped is this pixel? --------------------------------------------
  float m = texture2D(uMask, vUv).a;
  vec2 toL = px - uLens.xy * uRes;
  float warmR = exp(-dot(toL, toL) / max(uLens.z * uLens.z * 1.6, 1.0));
  m += (uCharge * 0.45 + uLens.w) * warmR;

  // An irregular threshold, not a soft falloff: wet edges are crisp and wobbly,
  // and as the mask decays the boundary creeps inward, speckled.
  float nz = vnoise(px / 34.0) * 0.6 + vnoise(px / 9.0) * 0.4;
  float t = m + (nz - 0.5) * 0.22 + (vnoise(px / 2.4) - 0.5) * 0.2;
  float clear = smoothstep(0.37, 0.45, t);
  float rim = clear * (1.0 - clear) * 4.0;
  float zone = smoothstep(0.20, 0.36, t) * (1.0 - smoothstep(0.46, 0.68, t));
  float fogW = 1.0 - clear;

  // ---- fogged glass: the blurred street, veiled -----------------------------
  vec3 bl = blurAt(vUv);
  float lum = dot(bl, LUMA);
  float cloudN = vnoise(px / 170.0 + vec2(uTime * 0.012, -uTime * 0.008));
  float veil = 0.30 + 0.14 * (cloudN - 0.5);
  vec3 fogc = mix(vec3(lum), bl, 0.82) * 1.15;
  fogc = fogc * (1.0 - veil) + VEIL * veil;

  // fine condensation: two layers of micro-beads
  vec2 cA, nA; float sA;
  float bA = bead(px, 5.0, 0.20, 0.30, cA, nA, sA);
  bA *= step(sA, 0.75);
  fogc += VEIL * bA * beadHi(nA) * 0.16;
  fogc *= 1.0 - bA * beadShade(nA) * 0.10;
  vec2 cB, nB; float sB;
  float bB = bead(px + 19.0, 11.0, 0.18, 0.30, cB, nB, sB);
  bB *= step(sB, 0.5);
  fogc += VEIL * bB * beadHi(nB) * 0.22;
  fogc *= 1.0 - bB * beadShade(nB) * 0.14;

  // ---- clear glass: the street, sharp ---------------------------------------
  vec3 clr = sharpAt(vUv);
  clr = clr * 0.96 + VEIL * 0.03;
  float sh = (vUv.x * 0.8 + vUv.y * 0.6 - 0.72) * 5.0;
  clr += VEIL * 0.035 * exp(-sh * sh);   // faint reflection sheen

  vec3 color = mix(fogc, clr, clear);
  color += vec3(0.60, 0.72, 0.82) * rim * 0.09;   // ridge of water along the wipe edge

  // ---- larger beads, gathered along wipe edges -------------------------------
  float pBig = mix(0.03, 0.07, fogW) + 0.55 * zone;
  vec2 c1, n1; float s1;
  float b1 = bead(px, 20.0, 0.14, 0.28, c1, n1, s1);
  b1 *= step(s1, pBig) * (1.0 - smoothstep(0.3, 0.9, clear));
  color = shadeBead(color, b1, c1, n1);

  vec2 c2, n2; float s2;
  float b2 = bead(px + 37.0, 58.0, 0.17, 0.30, c2, n2, s2);
  b2 *= step(s2, 0.03 + 0.14 * zone + 0.03 * fogW) * (1.0 - smoothstep(0.3, 0.9, clear));
  color = shadeBead(color, b2, c2, n2);

  // cold frame edges + warmth of the held hand
  vec2 vc = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  color *= 1.0 - 0.32 * smoothstep(0.45, 1.0, length(vc));
  color += WARM * uCharge * 0.08 * warmR;

  gl_FragColor = vec4(color, 1.0);
}`;

function createProgram(gl: WebGLRenderingContext) {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

function createTexture(gl: WebGLRenderingContext, unit: number) {
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

const smooth01 = (t: number) => t * t * (3 - 2 * t);

export type UseGlassOptions = {
  onDrag?: (level: number) => void;
  onBurst?: (power: number) => void;
  onProgress?: (stage: number) => void;
  
  photo?: PhotoSources;
};

export function useGlass(options: UseGlassOptions = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const target = useRef({ x: 0.5, y: 0.5 });
  const position = useRef({ x: 0.5, y: 0.5 });
  const previous = useRef({ x: 0.5, y: 0.5 });
  const spring = useRef({ x: 0, y: 0 });
  const heading = useRef(0);
  const dragStartClient = useRef({ x: 0, y: 0 });
  const velocity = useRef(0);
  const radius = useRef(72);
  const pressed = useRef(false);
  const dragging = useRef(false);
  const active = useRef(true);
  const lastMove = useRef(0);
  const ripples = useRef<Ripple[]>([]);

  const charge = useRef(0);
  const pendingBurst = useRef<{ x: number; y: number; power: number } | null>(null);
  const dropsReset = useRef(true);
  const fastFade = useRef(0);

  const wipeDistance = useRef(0);
  const progressStage = useRef(0);

  const callbacks = useRef(options);
  callbacks.current = options;

  const reset = useCallback(() => {
    target.current = { x: 0.5, y: 0.5 };
    position.current = { x: 0.5, y: 0.5 };
    previous.current = { x: 0.5, y: 0.5 };
    spring.current = { x: 0, y: 0 };
    heading.current = 0;
    velocity.current = 0;
    radius.current = 0;
    active.current = false;
    pressed.current = false;
    dragging.current = false;
    ripples.current = [];
    charge.current = 0;
    pendingBurst.current = null;
    dropsReset.current = true;
    fastFade.current = 1.4;
  }, []);

  const engage = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    target.current = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
    active.current = true;
    lastMove.current = performance.now();

    if (pressed.current && !dragging.current) {
      const dx = event.clientX - dragStartClient.current.x;
      const dy = event.clientY - dragStartClient.current.y;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) dragging.current = true;
    }
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pressed.current = true;
    dragging.current = false;
    charge.current = 0;
    dragStartClient.current = { x: event.clientX, y: event.clientY };
    engage(event);
  }, [engage]);

  const finishPress = useCallback((event: ReactPointerEvent<HTMLCanvasElement>, asClick: boolean) => {
    if (asClick && pressed.current && !dragging.current) {
      const power = smooth01(Math.min(1, charge.current));
      const { x, y } = target.current;
      ripples.current.push({ x, y, born: performance.now(), power });
      if (ripples.current.length > MAX_RIPPLES) ripples.current.shift();
      if (power > 0.04) pendingBurst.current = { x, y, power };
    }
    charge.current = 0;
    pressed.current = false;
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);
  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => finishPress(event, true), [finishPress]);
  const onPointerCancel = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => finishPress(event, false), [finishPress]);

  useEffect(() => {
    const glCanvas = canvasRef.current;
    const overlay = overlayRef.current;
    const ctx = overlay?.getContext("2d");
    const gl = glCanvas?.getContext("webgl", { antialias: false, alpha: false, powerPreference: "high-performance" });
    if (!glCanvas || !overlay || !ctx || !gl) return;

    const program = createProgram(gl);
    if (!program) return;
    gl.useProgram(program);
    gl.clearColor(0.03, 0.05, 0.07, 1);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const loc = (name: string) => gl.getUniformLocation(program, name);
    const uRes = loc("uRes"), uCover = loc("uCover");
    const uLens = loc("uLens"), uCharge = loc("uCharge"), uDawn = loc("uDawn"), uTime = loc("uTime");
    gl.uniform1i(loc("uMask"), 1);
    gl.uniform1i(loc("uSharpA"), 3);
    gl.uniform1i(loc("uSharpB"), 4);
    gl.uniform1i(loc("uBlurA"), 5);
    gl.uniform1i(loc("uBlurB"), 6);

    const maskTex = createTexture(gl, 1);

    const sceneTextures = [3, 4, 5, 6].map((unit) => createTexture(gl, unit));
    let sceneAspect = 16 / 9;
    let disposed = false;

    const trailLayer = document.createElement("canvas");
    const trailCtx = trailLayer.getContext("2d");
    if (!trailCtx) return;

    let frame = 0;
    let hidden = document.hidden;
    let last = 0;
    let w = 1;
    let h = 1;
    let dpr = 1;
    let ms = MASK_SCALE;
    let chargeVis = 0;
    let decayAcc = 0;
    let dawn = 0;
    let dropTimer = 0.5;
    const drops: Drop[] = [];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
    const rippleDuration = (r: Ripple) => (reduced ? 350 : RIPPLE_MS * (0.8 + 0.9 * r.power));
    const rippleReach = (r: Ripple) => RIPPLE_REACH * (0.55 + 0.75 * r.power);
    const rippleProgress = (r: Ripple, time: number) => (time - r.born) / rippleDuration(r);

    const rebuild = () => {
      const rect = overlay.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      overlay.width = Math.round(w * dpr);
      overlay.height = Math.round(h * dpr);
      const glDpr = Math.min(dpr, 1.5);
      glCanvas.width = Math.round(w * glDpr);
      glCanvas.height = Math.round(h * glDpr);
      gl.viewport(0, 0, glCanvas.width, glCanvas.height);

      trailLayer.width = Math.max(1, Math.round(w * MASK_SCALE));
      trailLayer.height = Math.max(1, Math.round(h * MASK_SCALE));
      ms = trailLayer.width / w;
      trailCtx.setTransform(ms, 0, 0, ms, 0, 0);

      const screenA = w / h;
      const sx = screenA < sceneAspect ? screenA / sceneAspect : 1;
      const sy = screenA > sceneAspect ? sceneAspect / screenA : 1;
      gl.uniform2f(uCover, sx, sy);
      gl.uniform2f(uRes, w, h);
    };

    const observer = new ResizeObserver(rebuild);
    observer.observe(overlay);
    rebuild();

    const setScene = (next: WindowScene) => {
      const sources = [next.night.sharp, next.dawn.sharp, next.night.blur, next.dawn.blur];
      sources.forEach((src, i) => {
        gl.activeTexture(gl.TEXTURE0 + 3 + i);
        gl.bindTexture(gl.TEXTURE_2D, sceneTextures[i]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      });
      sceneAspect = next.aspect;
      rebuild();
    };

    const photo = callbacks.current.photo;
    if (photo) {
      setScene(buildPlaceholderScene());
      loadPhotoScene(photo)
        .then((loaded) => { if (!disposed) setScene(loaded); })
        .catch((err) => {
          console.warn("[FoggyGlass] photo failed to load, using the painted street instead:", err);
          if (!disposed) setScene(buildWindowScene());
        });
    } else {
      setScene(buildWindowScene());
    }

    const stepDrops = (dt: number, brush: { x: number; y: number; r: number } | null) => {
      if (dropsReset.current) {
        dropsReset.current = false;
        drops.length = 0;
        dropTimer = 0.4;
      }
      dropTimer -= dt;
      if (dropTimer <= 0 && drops.length < DROP_MAX) {
        dropTimer = DROP_SPAWN_MIN + Math.random() * (DROP_SPAWN_MAX - DROP_SPAWN_MIN);
        drops.push({
          x: w * (0.06 + 0.88 * Math.random()),
          y: h * (0.05 + 0.6 * Math.random()),
          r: 1.6,
          target: 3.8 + Math.random() * 3.4,
          vy: 0,
          sliding: false,
          stall: 0,
          nextStall: 0.4 + Math.random(),
        });
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        if (brush && Math.hypot(d.x - brush.x, d.y - brush.y) < brush.r * 0.75) {
          drops.splice(i, 1);
          continue;
        }
        if (!d.sliding) {
          d.r += dt * 0.4;
          if (d.r >= d.target) d.sliding = true;
          continue;
        }
        d.nextStall -= dt;
        if (d.stall > 0) {
          d.stall -= dt;
          d.vy *= Math.exp(-dt * 9);
        } else {
          if (d.nextStall <= 0) {
            d.stall = 0.25 + Math.random() * 0.5;
            d.nextStall = 0.5 + Math.random() * 1.3;
          }
          d.vy += (34 + d.r * 11 - d.vy) * (1 - Math.exp(-dt * 2.2));
        }
        const y0 = d.y;
        const x0 = d.x;
        d.y += d.vy * dt;
        d.x += Math.sin(d.y * 0.05 + d.target) * 0.12;
        if (d.vy > 4) d.r -= dt * 0.06;
        if (d.vy > 1) {
          trailCtx.strokeStyle = "rgba(0,0,0,0.95)";
          trailCtx.lineCap = "round";
          trailCtx.lineWidth = d.r * 2.2;
          trailCtx.beginPath();
          trailCtx.moveTo(x0, y0);
          trailCtx.lineTo(d.x, d.y);
          trailCtx.stroke();
        }
        if (d.r < 2 || d.y > h - 4) drops.splice(i, 1);
      }
    };

    const drawDrops = () => {
      for (const d of drops) {
        const rx = d.r * (d.sliding ? 0.86 : 1);
        const ry = d.r * (d.sliding ? 1.22 : 1);
        ctx.globalAlpha = d.sliding ? 1 : clamp((d.r - 1.6) / 1.4 + 0.35, 0, 1);
        const g = ctx.createRadialGradient(d.x - rx * 0.35, d.y - ry * 0.4, rx * 0.08, d.x, d.y, Math.max(rx, ry) * 1.1);
        g.addColorStop(0, "rgba(255,255,255,0.8)");
        g.addColorStop(0.28, "rgba(214,232,244,0.2)");
        g.addColorStop(0.78, "rgba(8,14,22,0.2)");
        g.addColorStop(1, "rgba(8,14,22,0.55)");
        ctx.beginPath();
        ctx.ellipse(d.x, d.y, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(d.x, d.y, rx * 0.82, ry * 0.82, 0, Math.PI * 0.05, Math.PI * 0.55);
        ctx.strokeStyle = "rgba(236,246,255,0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const draw = (time: number) => {
      if (hidden) return;
      const dt = last ? Math.min(0.05, (time - last) / 1000) : 1 / 60;
      last = time;

      const idle = !pressed.current && time - lastMove.current > 2000;
      if (idle && !reduced) {
        const t = time * 0.00016;
        target.current.x = 0.5 + Math.sin(t * 3) * 0.19;
        target.current.y = 0.5 + Math.sin(t * 2 + 1.2) * 0.14;
      }

      const p = position.current;
      const s = spring.current;
      if (reduced) {
        p.x += (target.current.x - p.x) * 0.2;
        p.y += (target.current.y - p.y) * 0.2;
      } else {
        s.x = (s.x + (target.current.x - p.x) * 0.09) * 0.72;
        s.y = (s.y + (target.current.y - p.y) * 0.09) * 0.72;
        p.x += s.x;
        p.y += s.y;
      }

      const prev = previous.current;
      const dx = (p.x - prev.x) * w;
      const dy = (p.y - prev.y) * h;
      const moved = Math.hypot(dx, dy);
      const speed = Math.min(1, moved / 24);
      velocity.current += (speed - velocity.current) * 0.18;
      if (moved > 0.3) {
        const diff = Math.atan2(dy, dx) - heading.current;
        heading.current += Math.atan2(Math.sin(diff), Math.cos(diff)) * 0.2;
      }

      if (pressed.current && !dragging.current) {
        charge.current = Math.min(1, charge.current + dt / (reduced ? 0.6 : CHARGE_SECONDS));
      } else {
        charge.current = Math.max(0, charge.current - dt * (dragging.current ? 4 : 8));
      }
      chargeVis += (smooth01(charge.current) - chargeVis) * 0.25;

      const alive = pressed.current || (active.current && time - lastMove.current < 1250);
      const desired = alive || idle ? 72 + velocity.current * 100 + (dragging.current ? 18 : 0) + chargeVis * 60 : 0;
      radius.current += (desired - radius.current) * (reduced ? 0.2 : 0.08);
      const stretch = reduced ? 1 : 1 + velocity.current * 0.4;
      const squash = reduced ? 1 : 1 - velocity.current * 0.12;
      const px = p.x * w, py = p.y * h, r = Math.max(1, radius.current);

      if (dragging.current && moved > 0.3) {
        wipeDistance.current += moved;
        while (
          progressStage.current < PROGRESS_STAGES.length &&
          wipeDistance.current >= PROGRESS_STAGES[progressStage.current]
        ) {
          progressStage.current += 1;
          callbacks.current.onProgress?.(progressStage.current);
        }
      }
      previous.current = { x: p.x, y: p.y };

      callbacks.current.onDrag?.(dragging.current ? Math.min(1, velocity.current * 1.4) : 0);

      const pending = pendingBurst.current;
      if (pending) {
        pendingBurst.current = null;
        callbacks.current.onBurst?.(pending.power);
      }

      decayAcc += dt;
      if (decayAcc >= DECAY_STEP) {
        const tau = fastFade.current > 0 ? 0.22 : reduced ? 3 : REGROW_TAU;
        const a = 1 - Math.exp(-decayAcc / tau);
        decayAcc = 0;
        trailCtx.setTransform(1, 0, 0, 1, 0, 0);
        trailCtx.globalCompositeOperation = "destination-out";
        trailCtx.fillStyle = `rgba(0,0,0,${a.toFixed(4)})`;
        trailCtx.fillRect(0, 0, trailLayer.width, trailLayer.height);
        trailCtx.globalCompositeOperation = "source-over";
        trailCtx.setTransform(ms, 0, 0, ms, 0, 0);
      }
      if (fastFade.current > 0) {
        fastFade.current -= dt;
        if (fastFade.current <= 0) {
          trailCtx.setTransform(1, 0, 0, 1, 0, 0);
          trailCtx.clearRect(0, 0, trailLayer.width, trailLayer.height);
          trailCtx.setTransform(ms, 0, 0, ms, 0, 0);
        }
      }

      stepDrops(dt, dragging.current && r > 2 ? { x: px, y: py, r } : null);

      if (r > 2) {
        const touch = pressed.current;
        const strength = touch ? 1 : 0.32;
        const rr = touch ? r : r * 0.75;
        const steps = touch ? clamp(Math.ceil(moved / (rr * 0.3)), 1, 24) : 1;
        for (let n = 1; n <= steps; n++) {
          const k = n / steps;
          const sx = (prev.x + (p.x - prev.x) * k) * w;
          const sy = (prev.y + (p.y - prev.y) * k) * h;
          trailCtx.save();
          trailCtx.translate(sx, sy);
          trailCtx.rotate(heading.current);
          trailCtx.scale(stretch, squash);
          const gradient = trailCtx.createRadialGradient(0, 0, rr * 0.05, 0, 0, rr * 1.05);
          gradient.addColorStop(0, `rgba(0,0,0,${0.9 * strength})`);
          gradient.addColorStop(0.45, `rgba(0,0,0,${0.7 * strength})`);
          gradient.addColorStop(0.8, `rgba(0,0,0,${0.28 * strength})`);
          gradient.addColorStop(1, "rgba(0,0,0,0)");
          trailCtx.fillStyle = gradient;
          trailCtx.beginPath(); trailCtx.arc(0, 0, rr, 0, Math.PI * 2); trailCtx.fill();
          trailCtx.restore();
        }
      }

      for (const ripple of ripples.current) {
        const progress = rippleProgress(ripple, time);
        if (progress >= 1) continue;
        const eased = easeOutCubic(progress);
        trailCtx.beginPath();
        trailCtx.arc(ripple.x * w, ripple.y * h, 18 + eased * rippleReach(ripple), 0, Math.PI * 2);
        trailCtx.fillStyle = `rgba(0,0,0,${0.92 * (1 - progress * 0.4)})`;
        trailCtx.fill();
      }
      ripples.current = ripples.current.filter((ripple) => rippleProgress(ripple, time) < 1);

      const dawnTarget = Math.min(1, wipeDistance.current / DAWN_DISTANCE);
      dawn += (dawnTarget - dawn) * (1 - Math.exp(-dt * 0.8));

      gl.uniform4f(uLens, p.x, p.y, r, r > 2 && !pressed.current ? 0.09 : 0);
      gl.uniform1f(uCharge, chargeVis);
      gl.uniform1f(uDawn, smooth01(Math.min(1, dawn)));
      gl.uniform1f(uTime, time * 0.001);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, trailLayer);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawDrops();
      if (active.current && finePointer) {
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.strokeStyle = dragging.current ? "rgba(224,238,244,.6)" : "rgba(224,238,244,.3)";
        ctx.lineWidth = dragging.current ? 1.5 : 1; ctx.stroke();
        if (chargeVis > 0.01) {
          ctx.beginPath();
          ctx.arc(px, py, r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * chargeVis);
          ctx.strokeStyle = "rgba(224,148,84,.95)"; ctx.lineWidth = 2; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(px, py, 1.5, 0, Math.PI * 2); ctx.fillStyle = "rgb(224,238,244)"; ctx.fill();
      }
      frame = requestAnimationFrame(draw);
    };

    const visibility = () => {
      hidden = document.hidden;
      if (!hidden) frame = requestAnimationFrame(draw);
      else cancelAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", visibility);
    frame = requestAnimationFrame(draw);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      gl.deleteTexture(maskTex);
      sceneTextures.forEach((tex) => gl.deleteTexture(tex));
      gl.deleteBuffer(buffer); gl.deleteProgram(program);
    };
  }, []);

  return {
    canvasRef: canvasRef as RefObject<HTMLCanvasElement>,
    overlayRef: overlayRef as RefObject<HTMLCanvasElement>,
    reset,
    handlers: { onPointerMove: engage, onPointerDown, onPointerUp, onPointerCancel },
  };
}