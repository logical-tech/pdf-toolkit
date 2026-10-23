import { PDFArray, PDFDocument, PDFName, PDFNumber, PDFRawStream } from "@cantoo/pdf-lib";
import type { PDFPageProxy } from "pdfjs-dist";

export type Compression = "medium" | "strong";
const COMPRESSION: Record<Compression, { maxDim: number; quality: number }> = {
  medium: { maxDim: 2000, quality: 0.75 },
  strong: { maxDim: 1400, quality: 0.55 },
};

const toBytes = async (blob: Blob | null) => new Uint8Array(await blob!.arrayBuffer());
const canvasBlob = (c: HTMLCanvasElement, type: string, quality?: number) => new Promise<Blob | null>((r) => c.toBlob(r, type, quality));

export async function pageToPng(page: PDFPageProxy, scale: number): Promise<Uint8Array> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  // "print" intent: the display intent paces itself with requestAnimationFrame, which stalls while the window is hidden.
  await page.render({ canvas, viewport, intent: "print" }).promise;
  return toBytes(await canvasBlob(canvas, "image/png"));
}

// Draw any browser-readable image onto a canvas, downscaled so its longest side is at most maxDim.
async function drawImage(source: Blob, maxDim: number) {
  const bmp = await createImageBitmap(source);
  const k = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; // JPEG has no alpha
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

// Any image becomes a PNG data URL, so overlay images have a single embed path in the export.
export async function imageToPngDataUrl(file: Blob): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1200 / bmp.width);
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL("image/png");
}

// One page per image, A4 width, page height following the image's aspect ratio.
export async function imagesToPdf(files: File[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const f of files) {
    const c = await drawImage(f, 2400);
    const img = await doc.embedJpg(await toBytes(await canvasBlob(c, "image/jpeg", 0.85)));
    const width = 595.28;
    const height = (width * img.height) / img.width;
    doc.addPage([width, height]).drawImage(img, { x: 0, y: 0, width, height });
  }
  return doc.save();
}

// shortcut: only re-encodes JPEG (DCTDecode) images in RGB/gray/ICC colour spaces; Flate, JBIG2 and CMYK images are left alone.
export async function compressJpegs(doc: PDFDocument, level: Compression) {
  const { maxDim, quality } = COMPRESSION[level];
  const N = PDFName.of;
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || obj.dict.get(N("Subtype")) !== N("Image") || obj.dict.get(N("Filter")) !== N("DCTDecode")) continue;
    const cs = obj.dict.get(N("ColorSpace"));
    const csOk = cs === N("DeviceRGB") || cs === N("DeviceGray") || (cs instanceof PDFArray && cs.get(0) === N("ICCBased"));
    if (!csOk || obj.dict.has(N("Decode"))) continue;
    try {
      const canvas = await drawImage(new Blob([obj.contents as BlobPart], { type: "image/jpeg" }), maxDim);
      const bytes = await toBytes(await canvasBlob(canvas, "image/jpeg", quality));
      if (bytes.length >= obj.contents.length) continue;
      const dict = obj.dict.clone(doc.context);
      dict.set(N("Width"), PDFNumber.of(canvas.width));
      dict.set(N("Height"), PDFNumber.of(canvas.height));
      dict.set(N("ColorSpace"), N("DeviceRGB"));
      dict.set(N("BitsPerComponent"), PDFNumber.of(8));
      doc.context.assign(ref, PDFRawStream.of(dict, bytes));
    } catch {
      // undecodable image: keep the original
    }
  }
}

// "1-3, 5, 8-" → [[1,2,3],[5],[8..total]] (1-based); null when the input is malformed.
export function parseRanges(input: string, total: number): number[][] | null {
  const groups: number[][] = [];
  for (const part of input.split(",").map((s) => s.trim()).filter(Boolean)) {
    const m = /^(\d*)\s*(-?)\s*(\d*)$/.exec(part);
    if (!m || (!m[1] && !m[3])) return null;
    const from = m[1] ? +m[1] : 1;
    const to = m[2] ? (m[3] ? +m[3] : total) : from;
    if (from < 1 || to > total || from > to) return null;
    groups.push(Array.from({ length: to - from + 1 }, (_, i) => from + i));
  }
  return groups.length ? groups : null;
}

export function everyN(n: number, total: number): number[][] {
  return Array.from({ length: Math.ceil(total / n) }, (_, g) => Array.from({ length: Math.min(n, total - g * n) }, (_, i) => g * n + i + 1));
}

// ✓ and ✗ are not in Helvetica's WinAnsi set, so they are placed as small images.
export function markDataUrl(kind: "check" | "cross"): string {
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const ctx = c.getContext("2d")!;
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 11;
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.beginPath();
  if (kind === "check") {
    ctx.moveTo(14, 52);
    ctx.lineTo(38, 78);
    ctx.lineTo(84, 18);
  } else {
    ctx.moveTo(18, 18);
    ctx.lineTo(78, 78);
    ctx.moveTo(78, 18);
    ctx.lineTo(18, 78);
  }
  ctx.stroke();
  return c.toDataURL("image/png");
}

// Ready-made rubber stamps ("Approvato", "Copia conforme"...) rendered as images so they place like a signature.
export function stampDataUrl(text: string, color: string): { src: string; ratio: number } {
  const font = "700 44px Helvetica, Arial, sans-serif";
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  ctx.font = font;
  const label = text.toUpperCase();
  const w = Math.ceil(ctx.measureText(label).width) + 56;
  const h = 84;
  c.width = w * 2;
  c.height = h * 2;
  ctx.scale(2, 2);
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(4, 4, w - 8, h - 8, 10);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(11, 11, w - 22, h - 22, 6);
  ctx.stroke();
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, w / 2, h / 2 + 2);
  return { src: c.toDataURL("image/png"), ratio: h / w };
}

// A one-page blank PDF of the given size, for "insert blank page".
export async function blankPdf(width: number, height: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([width, height]);
  return doc.save();
}

// A page counts as blank when almost no pixel at thumbnail size is darker than near-white.
export async function isBlankPage(page: PDFPageProxy): Promise<boolean> {
  const viewport = page.getViewport({ scale: 0.25 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport, intent: "print", background: "#fff" }).promise;
  const d = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
  let ink = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 690) ink++;
  return ink / (d.length / 4) < 0.002;
}
