import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { readFile } from "@tauri-apps/plugin-fs";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getDocument } from "pdfjs-dist";
import type { OpenedFile } from "@/lib/io";
import { pageToPng } from "@/lib/tools";

const baseName = (path: string) => path.split(/[\\/]/).pop()!;

// Files that reach the app by path (Finder, recents, a drop) are outside the fs scope until the backend allows them.
export async function readPath(path: string): Promise<OpenedFile> {
  await invoke("allow_file", { path });
  return { name: baseName(path), bytes: await readFile(path), path };
}

// PDFs opened from Finder / "Apri con", including the ones that arrived before the page was ready.
// The backend queues every path; draining the queue on each event (and once at start) handles each file exactly once.
export function onOpenedFiles(handle: (paths: string[]) => void): () => void {
  if (!isTauri()) return () => {};
  const drain = () => invoke<string[]>("take_opened_files").then((paths) => paths.length && handle(paths));
  const off = listen("open-files", drain);
  off.then(drain);
  return () => void off.then((f) => f());
}

export const openExternal = (url: string) => (isTauri() ? openUrl(url) : Promise.resolve(void window.open(url, "_blank", "noopener")));

export const ghostscriptPath = () => (isTauri() ? invoke<string | null>("ghostscript_path") : Promise.resolve(null));
export const convertPdfa = async (bytes: Uint8Array) => new Uint8Array(await invoke<number[]>("convert_pdfa", { bytes: Array.from(bytes) }));

// Prints a finished PDF: its pages are rendered into a sheet that is the only thing visible while printing.
export async function printPdf(bytes: Uint8Array) {
  document.getElementById("print-sheet")?.remove();
  const pdf = await getDocument({ data: bytes }).promise;
  const sheet = document.createElement("div");
  sheet.id = "print-sheet";
  for (let i = 1; i <= pdf.numPages; i++) {
    const img = new Image();
    img.src = URL.createObjectURL(new Blob([(await pageToPng(await pdf.getPage(i), 2)) as BlobPart], { type: "image/png" }));
    await img.decode();
    sheet.append(img);
  }
  await pdf.loadingTask.destroy();
  document.body.append(sheet);
  const done = () => {
    sheet.querySelectorAll("img").forEach((img) => URL.revokeObjectURL(img.src));
    sheet.remove();
  };
  // The macOS print sheet is non-blocking and draws pages from the live DOM, so the sheet stays until printing ends
  // (or until the next print replaces it).
  window.addEventListener("afterprint", done, { once: true });
  if (isTauri()) await invoke("print_page");
  else window.print();
}

const RECENT_KEY = "pdf-toolkit:recent";
export type Recent = { path: string; name: string };

export function loadRecent(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function pushRecent(path: string): Recent[] {
  const next = [{ path, name: baseName(path) }, ...loadRecent().filter((r) => r.path !== path)].slice(0, 10);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export function clearRecent(): Recent[] {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {}
  return [];
}
