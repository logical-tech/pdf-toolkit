export type Pixels = { data: Uint8ClampedArray; width: number; height: number };

// Rec. 601 luma in 8.8 fixed point (77/150/29 ≈ 0.299/0.587/0.114).
const luma = (d: Uint8ClampedArray, i: number) => (77 * d[i] + 150 * d[i + 1] + 29 * d[i + 2]) >> 8;

function lumaPercentile(img: Pixels, p: number) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < img.data.length; i += 4) hist[luma(img.data, i)]++;
  const target = p * img.width * img.height;
  let acc = 0;
  for (let v = 0; v < 256; v++) if ((acc += hist[v]) >= target) return v;
  return 255;
}

export function grayscale(img: Pixels) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = luma(d, i);
}

// Levels on luminance: the paper (>= white point) becomes pure white, the rest is stretched and
// gamma-darkened; channels are scaled by the same factor so colour scans keep their hue.
export function cleanBackground(img: Pixels, strength = 0.5) {
  const d = img.data;
  // The 90th percentile lands on paper for any page that is mostly background; strength pulls it down to catch shadows.
  const white = Math.max(1, lumaPercentile(img, 0.9) * (1 - 0.2 * strength));
  const gamma = 1 + strength;
  for (let i = 0; i < d.length; i += 4) {
    const l = luma(d, i);
    if (l >= white) {
      d[i] = d[i + 1] = d[i + 2] = 255;
    } else if (l > 0) {
      const k = (255 * (l / white) ** gamma) / l;
      d[i] *= k;
      d[i + 1] *= k;
      d[i + 2] *= k;
    }
  }
}

// Returns the angle (degrees) the content is rotated clockwise on screen: positive = text lines go down to the right.
export function estimateSkew(img: Pixels, maxDeg = 5): number {
  const { data, width, height } = img;
  const dark = lumaPercentile(img, 0.9) * 0.6;
  // Downsample to ~600px wide; a cell is ink if any source pixel in it is, so thin strokes survive.
  const k = Math.min(1, 600 / width);
  const w = Math.ceil(width * k), h = Math.ceil(height * k);
  const ink = new Uint8Array(w * h);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) if (luma(data, (y * width + x) * 4) < dark) ink[((y * k) | 0) * w + ((x * k) | 0)] = 1;
  const xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < ink.length; i++) if (ink[i]) xs.push((i % w) - w / 2), ys.push(((i / w) | 0) - h / 2);
  if (!xs.length) return 0;

  const half = Math.ceil(Math.hypot(w, h) / 2) + 1;
  const rows = new Float64Array(2 * half + 1);
  // Row sums sum to the ink count for every angle, so maximizing the sum of squares maximizes the variance.
  const score = (deg: number) => {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    rows.fill(0);
    for (let j = 0; j < xs.length; j++) rows[Math.round(ys[j] * c - xs[j] * s) + half]++;
    let sq = 0;
    for (const r of rows) sq += r * r;
    return sq;
  };
  const search = (from: number, to: number, step: number) => {
    let best = 0, bestScore = -1;
    for (let deg = from; deg <= to + 1e-9; deg += step) {
      const sc = score(deg);
      if (sc > bestScore) (bestScore = sc), (best = deg);
    }
    return best;
  };
  const coarse = search(-maxDeg, maxDeg, 0.25);
  return Math.round(search(coarse - 0.25, coarse + 0.25, 0.05) * 100) / 100;
}

export function pixelDiff(a: Pixels, b: Pixels, threshold = 32): { mask: Uint8Array; changed: number } {
  if (a.width !== b.width || a.height !== b.height) throw new Error("pixelDiff: images differ in size");
  const n = a.width * a.height;
  const mask = new Uint8Array(n);
  let count = 0;
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const diff = Math.max(
      Math.abs(a.data[i] - b.data[i]),
      Math.abs(a.data[i + 1] - b.data[i + 1]),
      Math.abs(a.data[i + 2] - b.data[i + 2]),
      Math.abs(a.data[i + 3] - b.data[i + 3]),
    );
    if (diff > threshold) (mask[p] = 1), count++;
  }
  return { mask, changed: n ? count / n : 0 };
}

// DOM-only (not usable in Node tests). Positive deg = counter-clockwise on screen, so
// rotateCanvas(c, estimateSkew(pixels)) straightens a page. Output keeps the source size, corners filled white.
export function rotateCanvas(src: HTMLCanvasElement, deg: number): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((-deg * Math.PI) / 180); // canvas y points down, so a positive canvas rotation is clockwise
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}
