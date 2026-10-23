import { getDocument, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist";
import type { Compression } from "@/lib/tools";

// A loaded PDF file. The first source is the "base": its form fields stay live and its pages keep their objects on export.
export type Source = { id: string; name: string; bytes: Uint8Array; password?: string; pdf: PDFDocumentProxy; pages: PDFPageProxy[] };
// The document is an ordered list of page references; reorder, delete, merge and split only touch this list.
// `crop` trims the page as displayed, in points from each edge.
export type Crop = { top: number; right: number; bottom: number; left: number };
export type PageRef = { id: string; source: string; index: number; rotation: number; crop?: Crop };

// Overlay coordinates are in PDF points from the top-left of the page as displayed (pdf.js viewport at scale 1).
// `rotate` is in degrees counter-clockwise (as in Figma), around the item's centre.
type Placed = { id: string; page: string; x: number; y: number; rotate?: number };
export type TextItem = Placed & { kind: "text"; text: string; size: number; color: string; opacity?: number };
export type ImageItem = Placed & { kind: "image"; w: number; h: number; src: string };
export type RectItem = Placed & { kind: "rect"; w: number; h: number; style: RectStyle };
// Strokes drawn as one SVG path in the item's box; `ink` keeps the path in its own (vw × vh) space and scales uniformly.
export type ShapeKind = "line" | "arrow" | "rect" | "ellipse" | "ink";
export type ShapeItem = Placed & { kind: "shape"; shape: ShapeKind; w: number; h: number; color: string; width: number; d?: string; vw?: number; vh?: number };
// A sticky note: a real PDF comment annotation on export.
export type NoteItem = Placed & { kind: "note"; text: string };
// A new fillable form field created on the page.
export type FieldItem = Placed & { kind: "field"; field: "text" | "checkbox"; name: string; w: number; h: number };
export type Item = TextItem | ImageItem | RectItem | ShapeItem | NoteItem | FieldItem;

export const NOTE_SIZE = 20;

export type RectStyle = "cover" | "highlight" | "redact" | "underline" | "strike";
export const RECT_STYLES: Record<RectStyle, { color: string; opacity: number; multiply: boolean; w: number; h: number }> = {
  cover: { color: "#ffffff", opacity: 1, multiply: false, w: 120, h: 24 },
  highlight: { color: "#ffe14d", opacity: 0.5, multiply: true, w: 120, h: 16 },
  redact: { color: "#000000", opacity: 1, multiply: false, w: 120, h: 20 },
  underline: { color: "#1d3fa8", opacity: 1, multiply: false, w: 120, h: 1.2 },
  strike: { color: "#c62828", opacity: 1, multiply: false, w: 120, h: 1.2 },
};

// The path a shape draws, in its own coordinates (y down).
export function shapePath(it: ShapeItem): string {
  const { w, h } = it;
  switch (it.shape) {
    case "line":
      return `M0 ${h / 2} H${w}`;
    case "arrow": {
      const head = Math.min(14, w / 3);
      return `M0 ${h / 2} H${w} M${w - head} ${h / 2 - head * 0.55} L${w} ${h / 2} L${w - head} ${h / 2 + head * 0.55}`;
    }
    case "rect":
      return `M0 0 H${w} V${h} H0 Z`;
    case "ellipse":
      return `M0 ${h / 2} A${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2} A${w / 2} ${h / 2} 0 1 0 0 ${h / 2} Z`;
    case "ink":
      return it.d ?? "";
  }
}

export type PageNumberPosition = "bottom-center" | "bottom-right" | "top-right";
export type Align = "left" | "center" | "right";
export type EdgeText = { text: string; align: Align; size: number };
export type Stamps = {
  pageNumbers: { position: PageNumberPosition; format: string; size: number } | null;
  watermark: { text: string; size: number; opacity: number; color: string } | null;
  header: EdgeText | null;
  footer: EdgeText | null;
};
export const NO_STAMPS: Stamps = { pageNumbers: null, watermark: null, header: null, footer: null };

export type Bookmark = { id: string; title: string; page: string };
export type Attachment = { name: string; bytes: Uint8Array };
// Recognised words per page, in displayed page points; saved as invisible text so scans become searchable.
export type OcrWords = { text: string; x: number; y: number; w: number; h: number }[];

// Everything the user edits, kept together so undo and redo restore it as one.
export type Work = {
  pages: PageRef[];
  items: Item[];
  edits: Record<string, FieldValue>;
  stamps: Stamps;
  bookmarks: Bookmark[] | null; // null: keep the file's own outline untouched
  attachments: Attachment[];
  ocr: Record<string, OcrWords>;
};

export type FieldValue = string | boolean;
export type Field = {
  name: string;
  page: number; // index in the base source
  rect: number[];
  type: "text" | "checkbox" | "radio" | "choice";
  readOnly: boolean;
  multiLine: boolean;
  exportValue: string;
  options: { value: string; label: string }[];
  maxLength?: number;
  initial: FieldValue;
};

export type Layout = "original" | "a4" | "2up" | "4up";
export type Permissions = { print: boolean; copy: boolean; modify: boolean };
export type ExportOptions = {
  flatten: boolean;
  compress: Compression | null;
  password: string;
  restrict: Permissions | null; // null: no restrictions
  sanitize: boolean;
  layout: Layout;
  pdfa: boolean;
  title: string;
  author: string;
};
export const DEFAULT_OPTIONS: ExportOptions = { flatten: false, compress: null, password: "", restrict: null, sanitize: false, layout: "original", pdfa: false, title: "", author: "" };

// Must match what pdf-lib draws (Helvetica), so the on-screen preview lines up with the saved file.
export const TEXT_FONT = "Helvetica, Arial, sans-serif";
export const LINE_HEIGHT = 1.2;

export const pageProxy = (sources: Source[], ref: PageRef) => sources.find((s) => s.id === ref.source)!.pages[ref.index];
export const viewportOf = (page: PDFPageProxy, ref: PageRef, scale: number) => page.getViewport({ scale, rotation: (page.rotate + ref.rotation) % 360 });
const NO_CROP: Crop = { top: 0, right: 0, bottom: 0, left: 0 };
export const cropOf = (ref: PageRef) => ref.crop ?? NO_CROP;
// The visible page size in points once the crop is applied.
export function visibleSize(page: PDFPageProxy, ref: PageRef) {
  const { width, height } = viewportOf(page, ref, 1);
  const c = cropOf(ref);
  return { width: width - c.left - c.right, height: height - c.top - c.bottom };
}

// Keep an overlay item over the same spot of the page when the page's rotation changes.
export function rotateItem(it: Item, page: PDFPageProxy, from: PageRef, to: PageRef): Item {
  const { w, h } = itemSize(it);
  const [px, py] = viewportOf(page, from, 1).convertToPdfPoint(it.x + w / 2, it.y + h / 2);
  const [cx, cy] = viewportOf(page, to, 1).convertToViewportPoint(px, py);
  // Rectangles cover content, so they turn with it; text and images stay upright.
  const [nw, nh] = it.kind === "rect" && (to.rotation - from.rotation + 360) % 180 === 90 ? [h, w] : [w, h];
  return it.kind === "text" || it.kind === "note" ? { ...it, x: cx - w / 2, y: cy - h / 2 } : { ...it, x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh };
}

export async function loadSource(name: string, bytes: Uint8Array, askPassword: () => Promise<string | null>): Promise<Source | null> {
  let password: string | undefined;
  for (;;) {
    try {
      // pdf.js transfers the buffer to its worker, so give it a copy and keep the original for pdf-lib.
      const pdf = await getDocument({ data: bytes.slice(), password }).promise;
      const pages = await Promise.all(Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1)));
      return { id: crypto.randomUUID(), name, bytes, password, pdf, pages };
    } catch (e) {
      if ((e as Error).name !== "PasswordException") throw e;
      const p = await askPassword();
      if (p === null) return null;
      password = p;
    }
  }
}

export async function readFields(source: Source): Promise<Field[]> {
  const fields: Field[] = [];
  for (const [page, p] of source.pages.entries()) {
    // pdf.js annotation objects are untyped
    for (const a of (await p.getAnnotations()) as any[]) {
      if (a.subtype !== "Widget" || !a.fieldName || a.hidden) continue;
      const base = { name: a.fieldName, page, rect: a.rect, readOnly: !!a.readOnly, multiLine: !!a.multiLine, exportValue: "", options: [] };
      if (a.fieldType === "Tx") fields.push({ ...base, type: "text", maxLength: a.maxLen || undefined, initial: a.fieldValue ?? "" });
      else if (a.checkBox) fields.push({ ...base, type: "checkbox", exportValue: a.exportValue, initial: !!a.fieldValue && a.fieldValue !== "Off" });
      else if (a.radioButton) fields.push({ ...base, type: "radio", exportValue: a.buttonValue, initial: a.fieldValue ?? "" });
      else if (a.fieldType === "Ch") {
        const opts: { exportValue: string; displayValue: string }[] = a.options ?? [];
        const options = opts.map((o) => ({ value: o.exportValue, label: o.displayValue }));
        fields.push({ ...base, type: "choice", options, initial: [a.fieldValue].flat()[0] ?? "" });
      }
    }
  }
  return fields;
}

const measureCtx = () => document.createElement("canvas").getContext("2d")!;

export function textMetrics(size: number) {
  const ctx = measureCtx();
  ctx.font = `${size}px ${TEXT_FONT}`;
  const m = ctx.measureText("Hg");
  return { ascent: m.fontBoundingBoxAscent, descent: m.fontBoundingBoxDescent };
}

// The on-page box of an item, so rotation can pivot around its centre.
export function itemSize(it: Item): { w: number; h: number } {
  if (it.kind === "note") return { w: NOTE_SIZE, h: NOTE_SIZE };
  if (it.kind !== "text") return { w: it.w, h: it.h };
  const lines = it.text.split("\n");
  return { w: Math.max(...lines.map((l) => textWidth(l, it.size))), h: lines.length * it.size * LINE_HEIGHT };
}

// Where a point given relative to the item's unrotated top-left lands once the item is rotated around its centre (y down).
export function rotatedPoint(it: Item, ox: number, oy: number): [number, number] {
  const { w, h } = itemSize(it);
  const rad = ((it.rotate ?? 0) * Math.PI) / 180;
  const [dx, dy] = [ox - w / 2, oy - h / 2];
  return [it.x + w / 2 + dx * Math.cos(rad) + dy * Math.sin(rad), it.y + h / 2 - dx * Math.sin(rad) + dy * Math.cos(rad)];
}

export function textWidth(text: string, size: number) {
  const ctx = measureCtx();
  ctx.font = `${size}px ${TEXT_FONT}`;
  return ctx.measureText(text).width;
}

// Stamps compile to plain text items per page, so the editor preview and the export share one drawing path.
export function expandStamps(stamps: Stamps, pages: PageRef[], sources: Source[], fileName = ""): TextItem[] {
  const out: TextItem[] = [];
  const today = new Date().toLocaleDateString("it-IT");
  pages.forEach((ref, i) => {
    const { width: W, height: H } = viewportOf(pageProxy(sources, ref), ref, 1);
    const c = cropOf(ref);
    const fill = (t: string) => t.replaceAll("{n}", String(i + 1)).replaceAll("{total}", String(pages.length)).replaceAll("{data}", today).replaceAll("{file}", fileName);
    for (const [key, edge] of [["header", stamps.header], ["footer", stamps.footer]] as const) {
      if (!edge?.text.trim()) continue;
      const text = fill(edge.text);
      const w = textWidth(text, edge.size);
      const margin = 28;
      const x = edge.align === "left" ? c.left + margin : edge.align === "right" ? W - c.right - margin - w : c.left + (W - c.left - c.right - w) / 2;
      const y = key === "header" ? c.top + margin - edge.size * 0.2 : H - c.bottom - margin - edge.size * LINE_HEIGHT * 0.8;
      out.push({ id: `stamp-${key}-${ref.id}`, page: ref.id, kind: "text", x, y, text, size: edge.size, color: "#000000" });
    }
    const n = stamps.pageNumbers;
    if (n) {
      const text = n.format.replace("{n}", String(i + 1)).replace("{total}", String(pages.length));
      const w = textWidth(text, n.size);
      const margin = 28;
      const x = n.position === "bottom-center" ? c.left + (W - c.left - c.right - w) / 2 : W - c.right - margin - w;
      const y = n.position === "top-right" ? c.top + margin - n.size * 0.2 : H - c.bottom - margin - n.size * LINE_HEIGHT * 0.8;
      out.push({ id: `stamp-n-${ref.id}`, page: ref.id, kind: "text", x, y, text, size: n.size, color: "#000000" });
    }
    const wm = stamps.watermark;
    if (wm?.text.trim()) {
      const angle = (Math.atan2(H - c.top - c.bottom, W - c.left - c.right) * 180) / Math.PI; // along the visible diagonal
      const w = textWidth(wm.text, wm.size);
      const h = wm.size * LINE_HEIGHT;
      const [cx, cy] = [c.left + (W - c.left - c.right) / 2, c.top + (H - c.top - c.bottom) / 2];
      out.push({ id: `stamp-w-${ref.id}`, page: ref.id, kind: "text", x: cx - w / 2, y: cy - h / 2, text: wm.text, size: wm.size, color: wm.color, opacity: wm.opacity, rotate: angle });
    }
  });
  return out;
}

