import { isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { pickFiles } from "@/lib/io";
import { parse, serialize, type LptkFile } from "./lptk";

export { newFile, parse, serialize, type LptkFile } from "./lptk";

const FILTER = [{ name: "Documento PDF Toolkit", extensions: ["lptk"] }];

/** Where a document lives: `path` is "" in the browser (downloads), so "Salva" there always behaves like "Salva come". */
export type Saved = { path: string; name: string };

const baseName = (path: string) => path.split(/[\\/]/).pop()!;
const withExt = (name: string) => (/\.lptk$/i.test(name) ? name : `${name.replace(/\.[^./\\]+$/, "")}.lptk`);
const bytesOf = (file: LptkFile) => new TextEncoder().encode(serialize(file));

/** "Salva": overwrite `path` when the document already has one, otherwise ask like "Salva come". */
export async function saveLptk(defaultName: string, file: LptkFile, path?: string): Promise<Saved | null> {
  if (path && isTauri()) {
    await writeFile(path, bytesOf(file));
    return { path, name: baseName(path) };
  }
  return saveLptkAs(defaultName, file);
}

/** "Salva come": always asks where. Returns null if cancelled. */
export async function saveLptkAs(defaultName: string, file: LptkFile): Promise<Saved | null> {
  const name = withExt(defaultName);
  if (isTauri()) {
    const path = await save({ defaultPath: name, filters: FILTER });
    if (!path) return null;
    await writeFile(path, bytesOf(file));
    return { path, name: baseName(path) };
  }
  const url = URL.createObjectURL(new Blob([bytesOf(file) as BlobPart], { type: "application/json" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { path: "", name };
}

/** Throws an Italian error when the file is not a valid .lptk. */
export async function openLptk(): Promise<{ file: LptkFile; path?: string; name: string } | null> {
  if (isTauri()) {
    const path = await open({ multiple: false, filters: FILTER });
    if (!path) return null;
    return { file: parse(await readFile(path)), path, name: baseName(path) };
  }
  const [f] = await pickFiles(".lptk,application/json");
  return f ? { file: parse(new Uint8Array(await f.arrayBuffer())), name: f.name } : null;
}

/** For files that arrive by drag and drop or from "Recenti". */
export const readLptk = async (path: string) => parse(await readFile(path));
