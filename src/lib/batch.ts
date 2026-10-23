import { DEFAULT_OPTIONS, loadSource, viewportOf, type PageRef, type Work } from "@/lib/document";
import { exportPdf } from "@/lib/export";
import { compressWithGhostscript, convertPdfa } from "@/lib/desktop";
import { extractP7m } from "@/lib/p7m";
import { ocrCanvas } from "@/lib/ocr";
import type { Compression } from "@/lib/tools";
import { t } from "@/lib/i18n";

export type BatchOp = { kind: "compress"; level: Compression } | { kind: "ocr" } | { kind: "pdfa" };

export const SUFFIX: Record<BatchOp["kind"], string> = { compress: t("compresso"), ocr: t("ricercabile"), pdfa: "pdfa" };

// One file through one operation, with the same export path the editor uses; nothing is kept open afterwards.
export async function runBatch(name: string, input: Uint8Array, op: BatchOp, ghostscript: boolean): Promise<Uint8Array> {
  const bytes = /\.p7m$/i.test(name) ? extractP7m(input) : input;
  const src = await loadSource(name, bytes, async () => null);
  if (!src) throw new Error(t("Il file è protetto da password."));
  try {
    const pages: PageRef[] = src.pages.map((_, index) => ({ id: crypto.randomUUID(), source: src.id, index, rotation: 0 }));
    const work: Pick<Work, "pages" | "items" | "edits" | "bookmarks" | "attachments" | "ocr"> = { pages, items: [], edits: {}, bookmarks: null, attachments: [], ocr: {} };
    if (op.kind === "ocr") {
      for (const ref of pages) {
        const page = src.pages[ref.index];
        const viewport = viewportOf(page, ref, 2);
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport, intent: "print", background: "#fff" }).promise;
        work.ocr[ref.id] = (await ocrCanvas(canvas)).map((w) => ({ text: w.text, x: w.x0 / 2, y: w.y0 / 2, w: (w.x1 - w.x0) / 2, h: (w.y1 - w.y0) / 2 }));
      }
    }
    let out = await exportPdf([src], work, { ...DEFAULT_OPTIONS, compress: op.kind === "compress" ? op.level : null });
    if (op.kind === "compress" && ghostscript) {
      const gs = await compressWithGhostscript(out, op.level === "strong").catch(() => null);
      if (gs && gs.length < out.length) out = gs;
    }
    // Already lean files can grow when rewritten: then the original is the best "compressed" copy.
    if (op.kind === "compress" && out.length >= bytes.length) out = bytes;
    if (op.kind === "pdfa") out = await convertPdfa(out);
    return out;
  } finally {
    await src.pdf.loadingTask.destroy();
  }
}
