import { isTauri } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import { t } from "@/lib/i18n";
import { exists, readFile, writeFile } from "@tauri-apps/plugin-fs";

// `path` is only known in the desktop app; files from the browser or a drop have none.
export type OpenedFile = { name: string; bytes: Uint8Array; path?: string };
export type OutFile = { name: string; bytes: Uint8Array };

const PDF_FILTER = [{ name: "PDF", extensions: ["pdf"] }];
const OPEN_FILTER = [{ name: t("PDF o P7M firmato"), extensions: ["pdf", "p7m"] }];
const OPEN_ANY_FILTER = [{ name: t("PDF, P7M o documento"), extensions: ["pdf", "p7m", "lptk"] }];

// In the browser (vite dev without Tauri) fall back to <input type=file> and downloads.
// `documents` also accepts the writer's .lptk files (the main "Apri").
export async function openPdf(documents = false): Promise<OpenedFile | null> {
  if (isTauri()) {
    const path = await open({ multiple: false, filters: documents ? OPEN_ANY_FILTER : OPEN_FILTER });
    if (!path) return null;
    return { name: baseName(path), bytes: await readFile(path), path };
  }
  const [file] = await pickFiles(documents ? "application/pdf,.p7m,.lptk" : "application/pdf,.p7m");
  return file ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } : null;
}

const baseName = (path: string) => path.split(/[\\/]/).pop()!;

// Ask where to save; returns where it went ("" in the browser, which downloads), or null if cancelled.
export async function savePdfAs(defaultName: string, bytes: Uint8Array): Promise<{ path: string; name: string } | null> {
  if (isTauri()) {
    const path = await save({ defaultPath: defaultName, filters: PDF_FILTER });
    if (!path) return null;
    await writeFile(path, bytes);
    return { path, name: baseName(path) };
  }
  download({ name: defaultName, bytes });
  return { path: "", name: defaultName };
}

export const overwritePdf = (path: string, bytes: Uint8Array) => writeFile(path, bytes);

// Several outputs (split, page images) go into one folder the user picks.
export async function saveFiles(files: OutFile[]): Promise<boolean> {
  if (isTauri()) {
    const dir = await open({ directory: true });
    if (!dir) return false;
    const paths = await Promise.all(files.map((f) => join(dir, f.name)));
    const clashes = (await Promise.all(paths.map((p) => exists(p)))).filter(Boolean).length;
    if (clashes && !(await ask(t("{count} file con lo stesso nome esistono già in questa cartella. Sovrascriverli?", { count: clashes }), { kind: "warning" }))) return false;
    for (const [i, f] of files.entries()) await writeFile(paths[i], f.bytes);
    return true;
  }
  files.forEach(download);
  return true;
}

function download({ name, bytes }: OutFile) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement("input"), { type: "file", accept, multiple });
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.oncancel = () => resolve([]);
    input.click();
  });
}

// Any file, e.g. an attachment pulled out of a PDF.
export async function saveBytesAs(defaultName: string, bytes: Uint8Array): Promise<boolean> {
  if (isTauri()) {
    const path = await save({ defaultPath: defaultName });
    if (!path) return false;
    await writeFile(path, bytes);
    return true;
  }
  download({ name: defaultName, bytes });
  return true;
}
