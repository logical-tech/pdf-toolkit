import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanBackground, estimateSkew, grayscale, pixelDiff, type Pixels } from "./scan.ts";

const blank = (width: number, height: number, v = 255): Pixels => ({ data: new Uint8ClampedArray(width * height * 4).fill(v), width, height });

const px = (img: Pixels, x: number, y: number) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3)];

// White page of black text-line bars (with word gaps), rotated clockwise on screen by deg about the centre.
function textPage(deg: number, width = 1200, height = 1500): Pixels {
  const img = blank(width, height);
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const dx = x - width / 2, dy = y - height / 2;
      const ux = dx * c + dy * s + width / 2, uy = -dx * s + dy * c + height / 2;
      const inLine = uy > 150 && uy < height - 150 && (uy - 150) % 40 < 12;
      const inWord = ux > 150 && ux < width - 150 && (ux - 150) % 90 < 75;
      if (inLine && inWord) img.data.fill(0, (y * width + x) * 4, (y * width + x) * 4 + 3);
    }
  return img;
}

test("estimateSkew recovers angle and sign", () => {
  for (const deg of [2, -3, 0]) {
    const got = estimateSkew(textPage(deg));
    assert.ok(Math.abs(got - deg) <= 0.3, `expected ${deg}, got ${got}`);
  }
  assert.equal(estimateSkew(blank(100, 100)), 0);
});

test("grayscale makes r=g=b", () => {
  const img = blank(2, 1);
  img.data.set([200, 50, 10, 255, 0, 120, 255, 255]);
  grayscale(img);
  for (const x of [0, 1]) {
    const [r, g, b] = px(img, x, 0);
    assert.ok(r === g && g === b);
  }
  assert.equal(px(img, 0, 0)[0], Math.round(0.299 * 200 + 0.587 * 50 + 0.114 * 10));
});

test("cleanBackground whitens paper, keeps text dark and hue", () => {
  const img = blank(100, 100, 230);
  for (let y = 40; y < 50; y++) for (let x = 10; x < 90; x++) img.data.fill(30, (y * 100 + x) * 4, (y * 100 + x) * 4 + 3);
  img.data.set([150, 60, 60], (80 * 100 + 5) * 4); // a reddish mark
  cleanBackground(img);
  assert.deepEqual(px(img, 0, 0), [255, 255, 255]);
  assert.ok(px(img, 50, 45)[0] <= 30);
  const [r, g, b] = px(img, 5, 80);
  assert.ok(r > 2 * g && g === b, `hue lost: ${[r, g, b]}`);
});

test("pixelDiff counts a changed square", () => {
  const a = blank(100, 100), b = blank(100, 100);
  for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) b.data[(y * 100 + x) * 4 + 1] = 200;
  b.data[0] = 240; // under threshold
  const { mask, changed } = pixelDiff(a, b);
  assert.equal(changed, 0.01);
  assert.equal(mask[15 * 100 + 15], 1);
  assert.equal(mask[0], 0);
  assert.throws(() => pixelDiff(a, blank(10, 10)));
});
