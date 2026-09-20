// type RGB = [number, number, number];

// export type SceneVersion = {
//   sharp: HTMLCanvasElement;
//   blur: HTMLCanvasElement;
// };

// export type WindowScene = {
//   /** width / height of the painted scene (the shader "cover"-fits it to the screen) */
//   aspect: number;
//   night: SceneVersion;
//   dawn: SceneVersion;
// };

// const SCENE_HEIGHT = 1080;

// function rng(seed: number) {
//   let a = seed >>> 0;
//   return () => {
//     a = (a + 0x6d2b79f5) >>> 0;
//     let t = a;
//     t = Math.imul(t ^ (t >>> 15), t | 1);
//     t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
//     return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
//   };
// }

// const mixRgb = (a: RGB, b: RGB, t: number): RGB => [
//   a[0] + (b[0] - a[0]) * t,
//   a[1] + (b[1] - a[1]) * t,
//   a[2] + (b[2] - a[2]) * t,
// ];
// const css = (c: RGB, a = 1) =>
//   `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;

// function glow(
//   ctx: CanvasRenderingContext2D,
//   x: number,
//   y: number,
//   radius: number,
//   color: RGB,
//   alpha: number,
// ) {
//   if (alpha <= 0.001) return;
//   const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
//   g.addColorStop(0, css(color, alpha));
//   g.addColorStop(0.25, css(color, alpha * 0.45));
//   g.addColorStop(0.6, css(color, alpha * 0.1));
//   g.addColorStop(1, css(color, 0));
//   ctx.fillStyle = g;
//   ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
// }

// // A light's reflection on wet road: a soft vertical smear that fades downward.
// function streak(
//   ctx: CanvasRenderingContext2D,
//   x: number,
//   y0: number,
//   y1: number,
//   width: number,
//   color: RGB,
//   alpha: number,
// ) {
//   if (alpha <= 0.001) return;
//   for (let k = 0; k < 3; k++) {
//     const wk = width * (1 + k * 1.1);
//     const g = ctx.createLinearGradient(0, y0, 0, y1);
//     g.addColorStop(0, css(color, alpha / (1 + k * 1.4)));
//     g.addColorStop(1, css(color, 0));
//     ctx.fillStyle = g;
//     ctx.fillRect(x - wk / 2, y0, wk, y1 - y0);
//   }
// }

// function paint(canvas: HTMLCanvasElement, dawn: 0 | 1) {
//   const ctx = canvas.getContext("2d");
//   if (!ctx) return;
//   const w = canvas.width;
//   const h = canvas.height;
//   const u = h / 1080; // "design px" so the scene scales with resolution
//   const night = 1 - dawn;

//   // ---- sky ---------------------------------------------------------------
//   const stops: [number, RGB, RGB][] = [
//     [0.0, [5, 9, 22], [38, 58, 112]],
//     [0.38, [11, 26, 52], [96, 110, 168]],
//     [0.68, [30, 54, 88], [226, 140, 152]],
//     [0.86, [86, 84, 104], [255, 190, 128]],
//     [1.0, [150, 104, 102], [255, 226, 170]],
//   ];
//   const sky = ctx.createLinearGradient(0, 0, 0, h * 0.8);
//   for (const [o, n, d] of stops) sky.addColorStop(o, css(mixRgb(n, d, dawn)));
//   ctx.fillStyle = sky;
//   ctx.fillRect(0, 0, w, h);

//   ctx.globalCompositeOperation = "lighter";

//   // stars + moon (night), sun (dawn)
//   if (night) {
//     const r = rng(11);
//     for (let i = 0; i < 150; i++) {
//       const x = r() * w;
//       const y = r() * h * 0.5;
//       const s = (0.5 + r() * 1.2) * u;
//       ctx.fillStyle = `rgba(220,232,255,${0.25 + r() * 0.6})`;
//       ctx.fillRect(x, y, s, s);
//     }
//     glow(ctx, w * 0.2, h * 0.19, h * 0.18, [170, 200, 240], 0.3);
//     ctx.fillStyle = "rgba(236,242,252,0.92)";
//     ctx.beginPath();
//     ctx.arc(w * 0.2, h * 0.19, h * 0.024, 0, Math.PI * 2);
//     ctx.fill();
//   } else {
//     glow(ctx, w * 0.64, h * 0.62, h * 0.85, [255, 190, 120], 0.5);
//     glow(ctx, w * 0.64, h * 0.62, h * 0.26, [255, 232, 190], 0.85);
//     ctx.fillStyle = "rgba(255,246,220,0.95)";
//     ctx.beginPath();
//     ctx.arc(w * 0.64, h * 0.62, h * 0.04, 0, Math.PI * 2);
//     ctx.fill();
//   }
//   ctx.globalCompositeOperation = "source-over";

//   // long thin clouds
//   {
//     const r = rng(23);
//     const cloud = mixRgb([34, 54, 86], [255, 168, 150], dawn);
//     for (let i = 0; i < 7; i++) {
//       const cx = r() * w;
//       const cy = h * (0.16 + r() * 0.4);
//       const rx = w * (0.12 + r() * 0.26);
//       for (let k = 0; k < 3; k++) {
//         ctx.fillStyle = css(cloud, (0.10 + dawn * 0.10) * (1 - k * 0.25));
//         ctx.beginPath();
//         ctx.ellipse(cx, cy, rx * (1 - k * 0.26), rx * 0.05 * (1 - k * 0.2), 0, 0, Math.PI * 2);
//         ctx.fill();
//       }
//     }
//   }

//   // ---- skyline (three depth layers) -------------------------------------
//   const roadTop = h * 0.83;

//   const layer = (o: {
//     seed: number;
//     base: number;
//     hMin: number;
//     hMax: number;
//     wMin: number;
//     wMax: number;
//     night: RGB;
//     day: RGB;
//     cell: number;
//     win: number;
//     lit: number;
//   }) => {
//     const r = rng(o.seed);
//     const body = css(mixRgb(o.night, o.day, dawn));
//     const cs = o.cell * u;
//     const ws = o.win * u;
//     let x = -r() * o.wMax * u;
//     while (x < w) {
//       const bw = (o.wMin + r() * (o.wMax - o.wMin)) * u;
//       const bh = (o.hMin + r() * (o.hMax - o.hMin)) * h;
//       const roof = r();
//       const roofSize = r();
//       const top = o.base * h - bh;

//       ctx.fillStyle = body;
//       ctx.fillRect(x, top, bw + 1, h - top);
//       if (roof < 0.22) {
//         ctx.fillRect(x + bw * 0.5, top - (20 + roofSize * 50) * u, 2.2 * u, (20 + roofSize * 50) * u);
//       } else if (roof < 0.45) {
//         ctx.fillRect(x + bw * 0.12, top - (8 + roofSize * 14) * u, bw * 0.42, (8 + roofSize * 14) * u);
//       }

//       const cols = Math.floor((bw - cs * 0.6) / cs);
//       const rows = Math.floor((bh - cs * 0.8) / cs);
//       const litProb = o.lit * (1 - 0.82 * dawn);
//       for (let cy = 0; cy < rows; cy++) {
//         for (let cx = 0; cx < cols; cx++) {
//           const a = r();
//           const b = r();
//           const wx = x + cs * 0.3 + cx * cs;
//           const wy = top + cs * 0.5 + cy * cs;
//           if (a < litProb) {
//             const c: RGB = b < 0.66 ? [255, 206, 122] : b < 0.9 ? [176, 214, 255] : [255, 140, 190];
//             ctx.fillStyle = css(c, 0.55 + 0.4 * b);
//           } else {
//             // dark glass: catches a little sky at dawn
//             ctx.fillStyle = dawn ? "rgba(255,196,160,0.13)" : "rgba(120,150,190,0.05)";
//           }
//           ctx.fillRect(wx, wy, ws, ws * 1.25);
//         }
//       }
//       x += bw + r() * 6 * u;
//     }
//   };

//   layer({ seed: 101, base: 0.72, hMin: 0.1, hMax: 0.3, wMin: 34, wMax: 72, night: [22, 36, 62], day: [150, 110, 140], cell: 11, win: 4, lit: 0.36 });
//   layer({ seed: 202, base: 0.78, hMin: 0.16, hMax: 0.4, wMin: 60, wMax: 120, night: [11, 20, 38], day: [96, 72, 104], cell: 15, win: 6, lit: 0.42 });
//   layer({ seed: 303, base: 0.86, hMin: 0.1, hMax: 0.32, wMin: 110, wMax: 230, night: [6, 10, 20], day: [42, 30, 58], cell: 26, win: 11, lit: 0.34 });

//   // ---- road ----------------------------------------------------------------
//   const road = ctx.createLinearGradient(0, roadTop, 0, h);
//   road.addColorStop(0, css(mixRgb([20, 27, 42], [104, 78, 100], dawn)));
//   road.addColorStop(1, css(mixRgb([7, 10, 18], [40, 31, 52], dawn)));
//   ctx.fillStyle = road;
//   ctx.fillRect(0, roadTop, w, h - roadTop);
//   ctx.fillStyle = css(mixRgb([44, 58, 82], [190, 140, 140], dawn), 0.7);
//   ctx.fillRect(0, roadTop, w, 3 * u);

//   // wet sheen: the sky reflected in the tarmac
//   ctx.globalCompositeOperation = "lighter";
//   {
//     const g = ctx.createLinearGradient(0, roadTop, 0, roadTop + h * 0.09);
//     const c = mixRgb([120, 90, 96], [255, 190, 130], dawn);
//     g.addColorStop(0, css(c, 0.16 + dawn * 0.12));
//     g.addColorStop(1, css(c, 0));
//     ctx.fillStyle = g;
//     ctx.fillRect(0, roadTop, w, h * 0.09);
//   }
//   ctx.globalCompositeOperation = "source-over";

//   // ---- street lamps --------------------------------------------------------
//   const lamps: [number, number, number][] = [
//     [0.07, 0.6, 1.25],
//     [0.245, 0.655, 0.95],
//     [0.43, 0.685, 0.78],
//     [0.6, 0.66, 0.9],
//     [0.775, 0.62, 1.1],
//     [0.94, 0.58, 1.3],
//   ];
//   for (const [lx, ly, s] of lamps) {
//     ctx.fillStyle = css(mixRgb([4, 6, 12], [28, 20, 38], dawn));
//     ctx.fillRect(w * lx - 2.2 * u * s, h * ly, 4.4 * u * s, roadTop + h * 0.03 - h * ly);
//     ctx.fillRect(w * lx - 2.2 * u * s, h * ly - 2 * u * s, 22 * u * s, 4 * u * s);
//   }
//   ctx.globalCompositeOperation = "lighter";
//   const lampPower = night * 1 + dawn * 0.22;
//   for (const [lx, ly, s] of lamps) {
//     const x = w * lx + 20 * u * s;
//     const y = h * ly;
//     glow(ctx, x, y, 78 * u * s, [255, 180, 96], 0.85 * lampPower);
//     glow(ctx, x, y, 16 * u * s, [255, 240, 205], 0.95 * lampPower);
//     streak(ctx, x, roadTop + 4 * u, h, 12 * u * s, [255, 176, 96], 0.42 * lampPower);
//   }

//   // ---- traffic light (red at night, green by dawn) -------------------------
//   {
//     const x = w * 0.365;
//     const y = h * 0.6;
//     ctx.globalCompositeOperation = "source-over";
//     ctx.fillStyle = css(mixRgb([4, 6, 12], [28, 20, 38], dawn));
//     ctx.fillRect(x - 2 * u, y, 4 * u, roadTop + h * 0.02 - y);
//     ctx.fillRect(x - 8 * u, y - 44 * u, 16 * u, 44 * u);
//     ctx.globalCompositeOperation = "lighter";
//     const c: RGB = night ? [255, 50, 44] : [90, 255, 150];
//     const cy = night ? y - 34 * u : y - 10 * u;
//     glow(ctx, x, cy, 60 * u, c, 0.85);
//     glow(ctx, x, cy, 9 * u, [255, 245, 240], 0.9);
//     streak(ctx, x, roadTop + 4 * u, h * 0.98, 9 * u, c, 0.3);
//   }

//   // ---- cars ----------------------------------------------------------------
//   {
//     const r = rng(404);
//     for (let i = 0; i < 7; i++) {
//       const cx = w * (0.06 + 0.88 * r());
//       const depth = r();
//       const cy = roadTop + (0.045 + 0.1 * depth) * h;
//       const s = 0.65 + depth * 0.95;
//       const toward = r() < 0.5;
//       const spread = 27 * u * s;

//       ctx.globalCompositeOperation = "source-over";
//       ctx.fillStyle = css(mixRgb([3, 5, 10], [22, 16, 30], dawn), 0.92);
//       ctx.beginPath();
//       ctx.roundRect(cx - spread * 1.5, cy - 20 * u * s, spread * 3, 32 * u * s, 8 * u * s);
//       ctx.fill();

//       ctx.globalCompositeOperation = "lighter";
//       const c: RGB = toward ? [255, 236, 200] : [255, 46, 38];
//       const power = toward ? 0.95 : 0.85;
//       for (const sx of [-1, 1]) {
//         const x = cx + sx * spread;
//         glow(ctx, x, cy - 4 * u * s, 44 * u * s, c, power * (0.85 + 0.15 * night));
//         glow(ctx, x, cy - 4 * u * s, 7 * u * s, [255, 250, 240], 0.95);
//         streak(ctx, x, cy + 6 * u * s, Math.min(h, cy + 150 * u * s), 8 * u * s, c, 0.36);
//       }
//     }
//   }

//   // ---- neon signs ----------------------------------------------------------
//   ctx.globalCompositeOperation = "lighter";
//   const neon = (x: number, y: number, sw: number, sh: number, c: RGB, power: number) => {
//     ctx.shadowColor = css(c, 1);
//     ctx.shadowBlur = 26 * u;
//     ctx.strokeStyle = css(c, 0.95 * power);
//     ctx.lineWidth = 3 * u;
//     ctx.beginPath();
//     ctx.roundRect(x, y, sw * u, sh * u, 6 * u);
//     ctx.stroke();
//     ctx.shadowBlur = 0;
//     glow(ctx, x + (sw * u) / 2, y + (sh * u) / 2, 110 * u, c, 0.3 * power);
//   };
//   neon(w * 0.165, h * 0.535, 104, 30, [255, 64, 150], night * 1 + dawn * 0.25);
//   neon(w * 0.715, h * 0.475, 84, 26, [70, 224, 255], night * 1 + dawn * 0.25);
//   ctx.shadowBlur = 0;
//   ctx.globalCompositeOperation = "source-over";
// }

// // Downsample in 2x steps (robust in every browser), then a touch of real
// // blur where ctx.filter exists. Bright lights spread into soft glows, which
// // is exactly what light through fogged glass does.
// function makeBlur(src: HTMLCanvasElement): HTMLCanvasElement {
//   let cur = src;
//   for (let i = 0; i < 4; i++) {
//     const c = document.createElement("canvas");
//     c.width = Math.max(2, Math.round(cur.width / 2));
//     c.height = Math.max(2, Math.round(cur.height / 2));
//     const g = c.getContext("2d");
//     if (!g) return cur;
//     g.imageSmoothingEnabled = true;
//     g.imageSmoothingQuality = "high";
//     g.drawImage(cur, 0, 0, c.width, c.height);
//     cur = c;
//   }
//   const out = document.createElement("canvas");
//   out.width = cur.width;
//   out.height = cur.height;
//   const g = out.getContext("2d");
//   if (!g) return cur;
//   g.drawImage(cur, -3, -3, cur.width + 6, cur.height + 6); // edge padding
//   g.filter = "blur(1.5px)";
//   g.drawImage(cur, 0, 0);
//   return out;
// }

// function buildVersion(width: number, height: number, dawn: 0 | 1): SceneVersion {
//   const sharp = document.createElement("canvas");
//   sharp.width = width;
//   sharp.height = height;
//   paint(sharp, dawn);
//   return { sharp, blur: makeBlur(sharp) };
// }

// export function buildWindowScene(): WindowScene {
//   const screenAspect = window.innerWidth / Math.max(1, window.innerHeight);
//   const aspect = Math.min(2.4, Math.max(0.6, screenAspect));
//   const width = Math.round(SCENE_HEIGHT * aspect);
//   return {
//     aspect: width / SCENE_HEIGHT,
//     night: buildVersion(width, SCENE_HEIGHT, 0),
//     dawn: buildVersion(width, SCENE_HEIGHT, 1),
//   };
// }

// window-scene.ts
//
// The world outside the window. Painted once with the 2D canvas API (no image
// files, no network), in two versions that share exactly the same layout:
//
//   night — sodium street lamps, lit apartment windows, neon, wet road
//   dawn  — same street, lamps and windows going out, sky turning peach
//
// For each version we also build a *blurred* copy. That's the trick behind the
// whole effect: real fog doesn't add smoke on top of the world, it scatters
// light, so the world is still there, just smeared into soft colour and glow.
// The fog shader shows the blurred copy where the glass is fogged and the sharp
// copy where you've wiped it.
//
// Both versions use seeded random numbers, so night and dawn line up
// building-for-building and only the lighting changes between them.

type RGB = [number, number, number];

export type SceneVersion = {
  sharp: HTMLCanvasElement;
  blur: HTMLCanvasElement;
};

export type WindowScene = {
  /** width / height of the painted scene (the shader "cover"-fits it to the screen) */
  aspect: number;
  night: SceneVersion;
  dawn: SceneVersion;
};

const SCENE_HEIGHT = 1080;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mixRgb = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const css = (c: RGB, a = 1) =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;

function glow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: RGB,
  alpha: number,
) {
  if (alpha <= 0.001) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, css(color, alpha));
  g.addColorStop(0.25, css(color, alpha * 0.45));
  g.addColorStop(0.6, css(color, alpha * 0.1));
  g.addColorStop(1, css(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

// A light's reflection on wet road: a soft vertical smear that fades downward.
function streak(
  ctx: CanvasRenderingContext2D,
  x: number,
  y0: number,
  y1: number,
  width: number,
  color: RGB,
  alpha: number,
) {
  if (alpha <= 0.001) return;
  for (let k = 0; k < 3; k++) {
    const wk = width * (1 + k * 1.1);
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, css(color, alpha / (1 + k * 1.4)));
    g.addColorStop(1, css(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - wk / 2, y0, wk, y1 - y0);
  }
}

function paint(canvas: HTMLCanvasElement, dawn: 0 | 1) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const u = h / 1080; // "design px" so the scene scales with resolution
  const night = 1 - dawn;

  // ---- sky ---------------------------------------------------------------
  const stops: [number, RGB, RGB][] = [
    [0.0, [5, 9, 22], [38, 58, 112]],
    [0.38, [11, 26, 52], [96, 110, 168]],
    [0.68, [30, 54, 88], [226, 140, 152]],
    [0.86, [86, 84, 104], [255, 190, 128]],
    [1.0, [150, 104, 102], [255, 226, 170]],
  ];
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.8);
  for (const [o, n, d] of stops) sky.addColorStop(o, css(mixRgb(n, d, dawn)));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = "lighter";

  // stars + moon (night), sun (dawn)
  if (night) {
    const r = rng(11);
    for (let i = 0; i < 150; i++) {
      const x = r() * w;
      const y = r() * h * 0.5;
      const s = (0.5 + r() * 1.2) * u;
      ctx.fillStyle = `rgba(220,232,255,${0.25 + r() * 0.6})`;
      ctx.fillRect(x, y, s, s);
    }
    glow(ctx, w * 0.2, h * 0.19, h * 0.18, [170, 200, 240], 0.3);
    ctx.fillStyle = "rgba(236,242,252,0.92)";
    ctx.beginPath();
    ctx.arc(w * 0.2, h * 0.19, h * 0.024, 0, Math.PI * 2);
    ctx.fill();
  } else {
    glow(ctx, w * 0.64, h * 0.62, h * 0.85, [255, 190, 120], 0.5);
    glow(ctx, w * 0.64, h * 0.62, h * 0.26, [255, 232, 190], 0.85);
    ctx.fillStyle = "rgba(255,246,220,0.95)";
    ctx.beginPath();
    ctx.arc(w * 0.64, h * 0.62, h * 0.04, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";

  // long thin clouds
  {
    const r = rng(23);
    const cloud = mixRgb([34, 54, 86], [255, 168, 150], dawn);
    for (let i = 0; i < 7; i++) {
      const cx = r() * w;
      const cy = h * (0.16 + r() * 0.4);
      const rx = w * (0.12 + r() * 0.26);
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = css(cloud, (0.10 + dawn * 0.10) * (1 - k * 0.25));
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx * (1 - k * 0.26), rx * 0.05 * (1 - k * 0.2), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ---- skyline (three depth layers) -------------------------------------
  const roadTop = h * 0.83;

  const layer = (o: {
    seed: number;
    base: number;
    hMin: number;
    hMax: number;
    wMin: number;
    wMax: number;
    night: RGB;
    day: RGB;
    cell: number;
    win: number;
    lit: number;
  }) => {
    const r = rng(o.seed);
    const body = css(mixRgb(o.night, o.day, dawn));
    const cs = o.cell * u;
    const ws = o.win * u;
    let x = -r() * o.wMax * u;
    while (x < w) {
      const bw = (o.wMin + r() * (o.wMax - o.wMin)) * u;
      const bh = (o.hMin + r() * (o.hMax - o.hMin)) * h;
      const roof = r();
      const roofSize = r();
      const top = o.base * h - bh;

      ctx.fillStyle = body;
      ctx.fillRect(x, top, bw + 1, h - top);
      if (roof < 0.22) {
        ctx.fillRect(x + bw * 0.5, top - (20 + roofSize * 50) * u, 2.2 * u, (20 + roofSize * 50) * u);
      } else if (roof < 0.45) {
        ctx.fillRect(x + bw * 0.12, top - (8 + roofSize * 14) * u, bw * 0.42, (8 + roofSize * 14) * u);
      }

      const cols = Math.floor((bw - cs * 0.6) / cs);
      const rows = Math.floor((bh - cs * 0.8) / cs);
      const litProb = o.lit * (1 - 0.82 * dawn);
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const a = r();
          const b = r();
          const wx = x + cs * 0.3 + cx * cs;
          const wy = top + cs * 0.5 + cy * cs;
          if (a < litProb) {
            const c: RGB = b < 0.66 ? [255, 206, 122] : b < 0.9 ? [176, 214, 255] : [255, 140, 190];
            ctx.fillStyle = css(c, 0.55 + 0.4 * b);
          } else {
            // dark glass: catches a little sky at dawn
            ctx.fillStyle = dawn ? "rgba(255,196,160,0.13)" : "rgba(120,150,190,0.05)";
          }
          ctx.fillRect(wx, wy, ws, ws * 1.25);
        }
      }
      x += bw + r() * 6 * u;
    }
  };

  layer({ seed: 101, base: 0.72, hMin: 0.1, hMax: 0.3, wMin: 34, wMax: 72, night: [22, 36, 62], day: [150, 110, 140], cell: 11, win: 4, lit: 0.36 });
  layer({ seed: 202, base: 0.78, hMin: 0.16, hMax: 0.4, wMin: 60, wMax: 120, night: [11, 20, 38], day: [96, 72, 104], cell: 15, win: 6, lit: 0.42 });
  layer({ seed: 303, base: 0.86, hMin: 0.1, hMax: 0.32, wMin: 110, wMax: 230, night: [6, 10, 20], day: [42, 30, 58], cell: 26, win: 11, lit: 0.34 });

  // ---- road ----------------------------------------------------------------
  const road = ctx.createLinearGradient(0, roadTop, 0, h);
  road.addColorStop(0, css(mixRgb([20, 27, 42], [104, 78, 100], dawn)));
  road.addColorStop(1, css(mixRgb([7, 10, 18], [40, 31, 52], dawn)));
  ctx.fillStyle = road;
  ctx.fillRect(0, roadTop, w, h - roadTop);
  ctx.fillStyle = css(mixRgb([44, 58, 82], [190, 140, 140], dawn), 0.7);
  ctx.fillRect(0, roadTop, w, 3 * u);

  // wet sheen: the sky reflected in the tarmac
  ctx.globalCompositeOperation = "lighter";
  {
    const g = ctx.createLinearGradient(0, roadTop, 0, roadTop + h * 0.09);
    const c = mixRgb([120, 90, 96], [255, 190, 130], dawn);
    g.addColorStop(0, css(c, 0.16 + dawn * 0.12));
    g.addColorStop(1, css(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, roadTop, w, h * 0.09);
  }
  ctx.globalCompositeOperation = "source-over";

  // ---- street lamps --------------------------------------------------------
  const lamps: [number, number, number][] = [
    [0.07, 0.6, 1.25],
    [0.245, 0.655, 0.95],
    [0.43, 0.685, 0.78],
    [0.6, 0.66, 0.9],
    [0.775, 0.62, 1.1],
    [0.94, 0.58, 1.3],
  ];
  for (const [lx, ly, s] of lamps) {
    ctx.fillStyle = css(mixRgb([4, 6, 12], [28, 20, 38], dawn));
    ctx.fillRect(w * lx - 2.2 * u * s, h * ly, 4.4 * u * s, roadTop + h * 0.03 - h * ly);
    ctx.fillRect(w * lx - 2.2 * u * s, h * ly - 2 * u * s, 22 * u * s, 4 * u * s);
  }
  ctx.globalCompositeOperation = "lighter";
  const lampPower = night * 1 + dawn * 0.22;
  for (const [lx, ly, s] of lamps) {
    const x = w * lx + 20 * u * s;
    const y = h * ly;
    glow(ctx, x, y, 78 * u * s, [255, 180, 96], 0.85 * lampPower);
    glow(ctx, x, y, 16 * u * s, [255, 240, 205], 0.95 * lampPower);
    streak(ctx, x, roadTop + 4 * u, h, 12 * u * s, [255, 176, 96], 0.42 * lampPower);
  }

  // ---- traffic light (red at night, green by dawn) -------------------------
  {
    const x = w * 0.365;
    const y = h * 0.6;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = css(mixRgb([4, 6, 12], [28, 20, 38], dawn));
    ctx.fillRect(x - 2 * u, y, 4 * u, roadTop + h * 0.02 - y);
    ctx.fillRect(x - 8 * u, y - 44 * u, 16 * u, 44 * u);
    ctx.globalCompositeOperation = "lighter";
    const c: RGB = night ? [255, 50, 44] : [90, 255, 150];
    const cy = night ? y - 34 * u : y - 10 * u;
    glow(ctx, x, cy, 60 * u, c, 0.85);
    glow(ctx, x, cy, 9 * u, [255, 245, 240], 0.9);
    streak(ctx, x, roadTop + 4 * u, h * 0.98, 9 * u, c, 0.3);
  }

  // ---- cars ----------------------------------------------------------------
  {
    const r = rng(404);
    for (let i = 0; i < 7; i++) {
      const cx = w * (0.06 + 0.88 * r());
      const depth = r();
      const cy = roadTop + (0.045 + 0.1 * depth) * h;
      const s = 0.65 + depth * 0.95;
      const toward = r() < 0.5;
      const spread = 27 * u * s;

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = css(mixRgb([3, 5, 10], [22, 16, 30], dawn), 0.92);
      ctx.beginPath();
      ctx.roundRect(cx - spread * 1.5, cy - 20 * u * s, spread * 3, 32 * u * s, 8 * u * s);
      ctx.fill();

      ctx.globalCompositeOperation = "lighter";
      const c: RGB = toward ? [255, 236, 200] : [255, 46, 38];
      const power = toward ? 0.95 : 0.85;
      for (const sx of [-1, 1]) {
        const x = cx + sx * spread;
        glow(ctx, x, cy - 4 * u * s, 44 * u * s, c, power * (0.85 + 0.15 * night));
        glow(ctx, x, cy - 4 * u * s, 7 * u * s, [255, 250, 240], 0.95);
        streak(ctx, x, cy + 6 * u * s, Math.min(h, cy + 150 * u * s), 8 * u * s, c, 0.36);
      }
    }
  }

  // ---- neon signs ----------------------------------------------------------
  ctx.globalCompositeOperation = "lighter";
  const neon = (x: number, y: number, sw: number, sh: number, c: RGB, power: number) => {
    ctx.shadowColor = css(c, 1);
    ctx.shadowBlur = 26 * u;
    ctx.strokeStyle = css(c, 0.95 * power);
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.roundRect(x, y, sw * u, sh * u, 6 * u);
    ctx.stroke();
    ctx.shadowBlur = 0;
    glow(ctx, x + (sw * u) / 2, y + (sh * u) / 2, 110 * u, c, 0.3 * power);
  };
  neon(w * 0.165, h * 0.535, 104, 30, [255, 64, 150], night * 1 + dawn * 0.25);
  neon(w * 0.715, h * 0.475, 84, 26, [70, 224, 255], night * 1 + dawn * 0.25);
  ctx.shadowBlur = 0;
  ctx.globalCompositeOperation = "source-over";
}

// Downsample in 2x steps (robust in every browser), then a touch of real
// blur where ctx.filter exists. Bright lights spread into soft glows, which
// is exactly what light through fogged glass does.
function makeBlur(src: HTMLCanvasElement): HTMLCanvasElement {
  let cur = src;
  for (let i = 0; i < 4; i++) {
    const c = document.createElement("canvas");
    c.width = Math.max(2, Math.round(cur.width / 2));
    c.height = Math.max(2, Math.round(cur.height / 2));
    const g = c.getContext("2d");
    if (!g) return cur;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(cur, 0, 0, c.width, c.height);
    cur = c;
  }
  const out = document.createElement("canvas");
  out.width = cur.width;
  out.height = cur.height;
  const g = out.getContext("2d");
  if (!g) return cur;
  g.drawImage(cur, -3, -3, cur.width + 6, cur.height + 6); // edge padding
  g.filter = "blur(1.5px)";
  g.drawImage(cur, 0, 0);
  return out;
}

function buildVersion(width: number, height: number, dawn: 0 | 1): SceneVersion {
  const sharp = document.createElement("canvas");
  sharp.width = width;
  sharp.height = height;
  paint(sharp, dawn);
  return { sharp, blur: makeBlur(sharp) };
}

export function buildWindowScene(): WindowScene {
  const screenAspect = window.innerWidth / Math.max(1, window.innerHeight);
  const aspect = Math.min(2.4, Math.max(0.6, screenAspect));
  const width = Math.round(SCENE_HEIGHT * aspect);
  return {
    aspect: width / SCENE_HEIGHT,
    night: buildVersion(width, SCENE_HEIGHT, 0),
    dawn: buildVersion(width, SCENE_HEIGHT, 1),
  };
}

// ---------------------------------------------------------------------------
// Real photographs
// ---------------------------------------------------------------------------
// Drop a photo in /public and point FoggyGlass at it. The fog doesn't care what
// the world is, it only needs "sharp" and "blurred" copies, which we derive
// here. If you only give a night photo, the dawn version is that same photo
// warmed and lifted (so the night -> dawn arc still works). Give a second
// photo of the same view at dawn and it is used as-is.

export type PhotoSources = { night: string; dawn?: string };

const MAX_PHOTO_W = 2560;
const MAX_PHOTO_H = 1440;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image: ${url}`));
    img.src = url;
  });
}

// Draw `img` to fill (width x height), cropping the overflow ("object-fit: cover").
function drawCover(img: HTMLImageElement, width: number, height: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const g = c.getContext("2d");
  if (!g) return c;
  g.imageSmoothingQuality = "high";
  const s = Math.max(width / img.naturalWidth, height / img.naturalHeight);
  const dw = img.naturalWidth * s;
  const dh = img.naturalHeight * s;
  g.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
  return c;
}

// Night photo -> plausible first light: cool sky warms, shadows lift.
function gradeDawn(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext("2d");
  if (!g) return src;
  g.drawImage(src, 0, 0);
  const wash = g.createLinearGradient(0, 0, 0, c.height);
  wash.addColorStop(0, "rgba(96,120,200,0.16)");
  wash.addColorStop(0.55, "rgba(255,150,140,0.30)");
  wash.addColorStop(1, "rgba(255,200,130,0.36)");
  g.globalCompositeOperation = "screen";
  g.fillStyle = wash;
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = "soft-light";
  g.fillStyle = "rgba(255,190,140,0.55)";
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = "lighter";
  g.fillStyle = "rgb(22,17,14)";
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = "source-over";
  return c;
}

export async function loadPhotoScene(sources: PhotoSources): Promise<WindowScene> {
  const [nightImg, dawnImg] = await Promise.all([
    loadImage(sources.night),
    sources.dawn ? loadImage(sources.dawn) : Promise.resolve(null),
  ]);
  const k = Math.min(1, MAX_PHOTO_W / nightImg.naturalWidth, MAX_PHOTO_H / nightImg.naturalHeight);
  const width = Math.max(2, Math.round(nightImg.naturalWidth * k));
  const height = Math.max(2, Math.round(nightImg.naturalHeight * k));

  const nightSharp = drawCover(nightImg, width, height);
  const dawnSharp = dawnImg ? drawCover(dawnImg, width, height) : gradeDawn(nightSharp);
  return {
    aspect: width / height,
    night: { sharp: nightSharp, blur: makeBlur(nightSharp) },
    dawn: { sharp: dawnSharp, blur: makeBlur(dawnSharp) },
  };
}

// A dark stand-in shown for the instant before a photo has loaded.
export function buildPlaceholderScene(): WindowScene {
  const make = (): SceneVersion => {
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 2;
    const g = c.getContext("2d");
    if (g) {
      g.fillStyle = "#0b1018";
      g.fillRect(0, 0, 2, 2);
    }
    return { sharp: c, blur: c };
  };
  return { aspect: 16 / 9, night: make(), dawn: make() };
}