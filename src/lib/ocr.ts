import { createWorker, OEM, type Worker } from "tesseract.js";

export type OcrWord = { text: string; x0: number; y0: number; x1: number; y1: number };

let workerPromise: Promise<Worker> | null = null;
// shortcut: one progress sink for the shared worker, so overlapping ocrCanvas calls share it; add a scheduler if pages run in parallel.
let progressSink: ((fraction: number) => void) | undefined;

function getWorker(): Promise<Worker> {
  // Every asset is served from public/ocr (bundled with the app); nothing is fetched from a CDN.
  const base = new URL("ocr/", new URL(import.meta.env.BASE_URL, location.href)).href;
  workerPromise ??= createWorker(["ita", "eng"], OEM.LSTM_ONLY, {
    workerPath: `${base}worker.min.js`,
    corePath: `${base}core`,
    langPath: `${base}lang`,
    workerBlobURL: false,
    cacheMethod: "none",
    logger: (m) => {
      if (m.status === "recognizing text") progressSink?.(m.progress);
    },
  }).catch((err) => {
    workerPromise = null;
    throw err;
  });
  return workerPromise;
}

export async function ocrCanvas(
  canvas: HTMLCanvasElement,
  onProgress?: (fraction: number) => void,
): Promise<OcrWord[]> {
  const worker = await getWorker();
  progressSink = onProgress;
  try {
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    onProgress?.(1);
    return (data.blocks ?? []).flatMap((b) =>
      b.paragraphs.flatMap((p) =>
        p.lines.flatMap((l) => l.words.map((w) => ({ text: w.text, ...w.bbox }))),
      ),
    );
  } finally {
    progressSink = undefined;
  }
}

export async function disposeOcr(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  if (pending) await (await pending).terminate();
}
