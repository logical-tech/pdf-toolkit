import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GlobalWorkerOptions, PermissionFlag, getDocument } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask } from "@tauri-apps/plugin-dialog";
import { TextMorph } from "torph/react";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Check,
  ChevronDown,
  Circle,
  Clock,
  Compass,
  Copy as CopyIcon,
  EyeOff,
  Eraser,
  FileDown,
  FilePen,
  FilePlus2,
  FileText,
  FileUp,
  FormInput,
  GitCompare,
  Highlighter,
  House,
  ImagePlus,
  Images,
  Layers,
  LayoutGrid,
  Loader2,
  MessageSquarePlus,
  Minus,
  MousePointer2,
  PanelLeft,
  PenLine,
  Pencil,
  Plus,
  Printer,
  Redo2,
  Save,
  Search,
  Settings,
  Shapes,
  Signature,
  Sparkles,
  Slash,
  Square,
  SquareCheck,
  SquarePen,
  Stamp,
  Strikethrough,
  TextCursorInput,
  Type,
  Underline,
  Undo2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BarDivider, FloatBar, Segmented, ToolButton, ToolMenu } from "@/components/Chrome";
import { EmptyState } from "@/components/EmptyState";
import { PdfPage, type Tool } from "@/components/PdfPage";
import { findInItems } from "@/components/PageText";
import { PagesView, type CleanOptions } from "@/components/PagesView";
import { SignatureDialog, loadSaved as loadSignatures } from "@/components/SignatureDialog";
import { TASKS, TaskPanel, type Task } from "@/components/TaskPanel";
import { BatchDialog } from "@/components/BatchDialog";
import { Tour, tourSeen, type TourName } from "@/components/Tour";
import { PasswordDialog, SaveDialog, StampsPanel } from "@/components/Dialogs";
import { SettingsDialog } from "@/components/SettingsDialog";
import { SearchBar } from "@/components/SearchBar";
import { SidePanel } from "@/components/SidePanel";
import { ComparePanel } from "@/components/ComparePanel";
import {
  DEFAULT_OPTIONS,
  NO_STAMPS,
  expandStamps,
  loadSource,
  pageProxy,
  readFields,
  rotateItem,
  viewportOf,
  visibleSize,
  type Bookmark,
  type ExportOptions,
  type Field,
  type Item,
  type PageRef,
  type RectStyle,
  type Source,
  type Work,
} from "@/lib/document";
import { exportPdf } from "@/lib/export";
import { useHistory } from "@/lib/history";
import { openPdf, overwritePdf, pickFiles, savePdfAs, saveFiles, type OpenedFile } from "@/lib/io";
import { blankPdf, type Compression, imageToPngDataUrl, imagesToPdf, markDataUrl, pageToPng, stampDataUrl } from "@/lib/tools";
import { cleanBackground, estimateSkew, grayscale, rotateCanvas } from "@/lib/scan";
import { ocrCanvas } from "@/lib/ocr";
import { findRanges, type Pattern } from "@/lib/redact";
import { extractP7m } from "@/lib/p7m";
import { fatturaToPdf, isFattura } from "@/lib/fattura";
import { clearRecent, compressWithGhostscript, convertPdfa, ghostscriptPath, loadRecent, onOpenedFiles, openExternal, printPdf, pushRecent, readPath, type Recent } from "@/lib/desktop";
import { editableFocused, installMenu, type MenuActions } from "@/lib/menu";
import { checkForUpdate, installUpdate } from "@/lib/update";
import { buildTools, runTool, type McpContext } from "@/lib/mcp-tools";
import { serveMcp } from "@/lib/mcp";
import { listen } from "@tauri-apps/api/event";
import { cn } from "@/lib/utils";
import { locale, t } from "@/lib/i18n";
import { WriterView, type WriterHandle } from "@/writer/WriterView";
import { parse as parseLptk, saveLptk, saveLptkAs, type LptkFile } from "@/writer/file";
import { CompanySettings } from "@/writer/company";
import { writerTools } from "@/writer/mcp";

GlobalWorkerOptions.workerSrc = workerUrl;

// `path` is the file "Salva" overwrites; documents built from drops, images or a .p7m have none until "Salva come".
// Sources and the file's own outline never change after opening; everything editable lives in `Work`, with history.
type Doc = { name: string; path?: string; sources: Source[]; fields: Field[]; outline: Bookmark[]; protection: Protection };
// What "Salva" must reproduce when it rewrites `path`: the protection the file had, or the one "Salva come" gave it.
type Protection = Pick<ExportOptions, "password" | "restrict" | "pdfa">;
type View = "editor" | "pages";

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const EMPTY_WORK: Work = { pages: [], items: [], edits: {}, stamps: NO_STAMPS, bookmarks: null, attachments: [], ocr: {} };
// In the macOS window the title bar is transparent, so the top-left capsule clears the traffic lights.
const MAC_WINDOW = isTauri() && /Mac/.test(navigator.userAgent);
const STAMP_PRESETS = [
  { label: t("Approvato"), color: "#1f7a45" },
  { label: t("Respinto"), color: "#c62828" },
  { label: t("Copia conforme"), color: "#1d3fa8" },
  { label: t("Pagato"), color: "#1f7a45" },
  { label: t("Urgente"), color: "#c62828" },
  { label: t("Bozza"), color: "#6b6b6b" },
];

const refsOf = (src: Source): PageRef[] => src.pages.map((_, index) => ({ id: crypto.randomUUID(), source: src.id, index, rotation: 0 }));
const isPdf = (f: File) => f.type === "application/pdf" || /\.(pdf|p7m|xml)$/i.test(f.name);

// The file's own outline, flattened, with each entry pointing at the page it opens.
async function readOutline(src: Source, pages: PageRef[]): Promise<Bookmark[]> {
  const out: Bookmark[] = [];
  const walk = async (nodes: { title: string; dest: unknown; items: unknown[] }[] | null) => {
    for (const n of nodes ?? []) {
      const index = await destIndex(src, n.dest);
      const page = pages.find((p) => p.source === src.id && p.index === index);
      if (page) out.push({ id: crypto.randomUUID(), title: n.title, page: page.id });
      await walk(n.items as never);
    }
  };
  await walk((await src.pdf.getOutline().catch(() => null)) as never);
  return out;
}

async function destIndex(src: Source, dest: unknown): Promise<number | null> {
  try {
    const explicit = typeof dest === "string" ? await src.pdf.getDestination(dest) : (dest as unknown[]);
    const target = explicit?.[0];
    if (typeof target === "number") return target;
    return target ? await src.pdf.getPageIndex(target as never) : null;
  } catch {
    return null;
  }
}

const scrollToPage = (id: string) => document.querySelector(`[data-page-id="${id}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });

export default function App() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const history = useHistory<Work>(EMPTY_WORK);
  const work = history.state;
  const setWork = history.set;
  const [savedWork, setSavedWork] = useState<Work>(EMPTY_WORK);
  const [view, setView] = useState<View>("editor");
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_OPTIONS);
  const [tool, setTool] = useState<Tool>({ kind: "select" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [scale, setScale] = useState(1.25);
  const [sigOpen, setSigOpen] = useState(false);
  const [sigsOpen, setSigsOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [tour, setTour] = useState<TourName | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [stampsOpen, setStampsOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [task, setTask] = useState<Task | null>(null);
  const [search, setSearch] = useState<{ query: string; index: number } | null>(null);
  const [hits, setHits] = useState<{ page: string; k: number }[]>([]);
  const [textSel, setTextSel] = useState<{ rects: { page: string; x: number; y: number; w: number; h: number }[]; left: number; top: number; text: string } | null>(null);
  const [compare, setCompare] = useState<Source | null>(null);
  const [recent, setRecent] = useState<Recent[]>(loadRecent);
  const [ghostscript, setGhostscript] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const [pwRequest, setPwRequest] = useState<{ name: string; resolve: (p: string | null) => void } | null>(null);
  // The text document lives next to the PDF; `mode` says which one is on screen. `file` null = template gallery.
  const [writer, setWriter] = useState<{ file: LptkFile | null; path?: string; name: string; saved: LptkFile | null } | null>(null);
  const [mode, setMode] = useState<"pdf" | "writer">("pdf");
  const writerRef = useRef<WriterHandle>(null);
  const inWriter = mode === "writer" && !!writer;

  const marks = useMemo(() => ({ check: markDataUrl("check"), cross: markDataUrl("cross") }), []);
  const baseName = doc ? doc.name.replace(/\.pdf$/i, "") : "";
  const stampItems = useMemo(() => (doc ? expandStamps(work.stamps, work.pages, doc.sources, doc.name) : []), [doc, work.stamps, work.pages]);
  const bookmarks = work.bookmarks ?? doc?.outline ?? [];
  const dirty = !!doc && work !== savedWork;
  const writerDirty = !!writer?.file && writer.file !== writer.saved;

  const askPassword = (name: string) => new Promise<string | null>((resolve) => setPwRequest({ name, resolve }));

  const confirmDiscard = async (unsaved = dirty) => {
    if (!unsaved) return true;
    const message = t("Le modifiche non salvate andranno perse. Continuare?");
    return isTauri() ? ask(message, { title: t("Modifiche non salvate"), kind: "warning", okLabel: t("Continua"), cancelLabel: t("Annulla") }) : window.confirm(message);
  };

  // A signed .p7m opens as the PDF it wraps; it cannot be saved back in place.
  const unwrap = (f: OpenedFile): OpenedFile => {
    if (!/\.p7m$/i.test(f.name)) return f;
    toast(t("Documento estratto dal file firmato (firma non verificata)"));
    return { name: f.name.replace(/\.p7m$/i, ""), bytes: extractP7m(f.bytes) };
  };

  // Turn opened PDFs and images into sources; images become one generated PDF.
  const toSources = async (files: OpenedFile[], images: File[] = []): Promise<Source[]> => {
    const out: Source[] = [];
    for (const raw of files) {
      try {
        const f = unwrap(raw);
        // An e-invoice (plain .xml or inside a .p7m) opens as a readable PDF, followed by its PDF attachments.
        if (isFattura(f.bytes)) {
          const name = f.name.replace(/\.xml$/i, "");
          const { pdf, pdfs } = await fatturaToPdf(f.bytes, f.name);
          out.push((await loadSource(`${name}.pdf`, pdf, async () => null))!);
          for (const a of pdfs) {
            const s = await loadSource(a.name, a.bytes, () => askPassword(a.name)).catch(() => null);
            if (s) out.push(s);
          }
          continue;
        }
        const s = await loadSource(f.name, f.bytes, () => askPassword(f.name));
        if (s) out.push(s);
      } catch (e) {
        toast.error(t("Impossibile aprire {name}: {error}", { name: raw.name, error: (e as Error).message }));
      }
    }
    if (images.length) out.push((await loadSource(t("Immagini.pdf"), await imagesToPdf(images), async () => null))!);
    return out;
  };

  const openSources = async (srcs: Source[], file?: OpenedFile) => {
    if (!srcs.length) return;
    const [base] = srcs;
    const { info } = (await base.pdf.getMetadata().catch(() => ({ info: {} }))) as { info: Record<string, string> };
    const pages = srcs.flatMap(refsOf);
    const path = file && !/\.(p7m|xml)$/i.test(file.name) ? file.path : undefined;
    doc?.sources.forEach((s) => s.pdf.loadingTask.destroy());
    const perms = await base.pdf.getPermissions().catch(() => null);
    const restrict = perms ? { print: perms.has(PermissionFlag.PRINT), copy: perms.has(PermissionFlag.COPY), modify: perms.has(PermissionFlag.MODIFY_CONTENTS) } : null;
    setDoc({ name: base.name, path, sources: srcs, fields: await readFields(base), outline: await readOutline(base, pages), protection: { password: base.password ?? "", restrict, pdfa: false } });
    const fresh = { ...EMPTY_WORK, pages };
    history.reset(fresh);
    setSavedWork(fresh);
    setOptions({ ...DEFAULT_OPTIONS, title: info.Title ?? "", author: info.Author ?? "" });
    setSelectedId(null);
    setTool({ kind: "select" });
    setSearch(null);
    if (path) setRecent(pushRecent(path));
  };

  const appendSources = (srcs: Source[]) => {
    if (!srcs.length) return;
    setDoc((d) => d && { ...d, sources: [...d.sources, ...srcs] });
    setWork((w) => ({ ...w, pages: [...w.pages, ...srcs.flatMap(refsOf)] }), "pages");
    toast.success(t("{n} pagine aggiunte", { n: srcs.reduce((n, s) => n + s.pages.length, 0) }));
  };

  const ingest = async (files: File[]) => {
    const lptk = files.find((f) => /\.lptk$/i.test(f.name));
    if (lptk) return void openFile({ name: lptk.name, bytes: new Uint8Array(await lptk.arrayBuffer()) }).catch((e) => toast.error((e as Error).message));
    const pdfs = await Promise.all(files.filter(isPdf).map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
    const srcs = await toSources(pdfs, files.filter((f) => f.type.startsWith("image/")));
    doc ? appendSources(srcs) : openSources(srcs);
  };

  const openWriter = async (next: { file: LptkFile | null; path?: string; name: string; saved: LptkFile | null }) => {
    if (!(await confirmDiscard(writerDirty))) return false;
    setWriter(next);
    setMode("writer");
    if (next.path) setRecent(pushRecent(next.path));
    return true;
  };
  // Back to the last save; a document never saved goes away entirely.
  const discardWriter = async () => {
    if (!(await confirmDiscard(true))) return;
    if (writer?.saved) setWriter((w) => w && { ...w, file: w.saved });
    else (setWriter(null), setMode("pdf"));
  };
  // Closes what is on screen; with nothing else open, the home shows again.
  const closeDocument = async () => {
    if (inWriter) {
      if (!(await confirmDiscard(writerDirty))) return;
      setWriter(null);
      setMode("pdf");
      return;
    }
    if (!doc || !(await confirmDiscard())) return;
    doc.sources.forEach((s) => s.pdf.loadingTask.destroy());
    setDoc(null);
    history.reset(EMPTY_WORK);
    setSavedWork(EMPTY_WORK);
    setView("editor");
    setTask(null);
    setCompare(null);
    setSearch(null);
    setSelectedId(null);
    setTool({ kind: "select" });
    setPanelOpen(false);
    setStampsOpen(false);
    if (writer) setMode("writer");
  };
  const newDocument = () => openWriter({ file: null, name: t("Documento senza titolo"), saved: null });
  const openFile = async (file: OpenedFile | null) => {
    if (file && /\.lptk$/i.test(file.name)) {
      const parsed = parseLptk(file.bytes);
      return openWriter({ file: parsed, path: file.path, name: file.name.replace(/\.lptk$/i, ""), saved: parsed });
    }
    if (!file || !(await confirmDiscard())) return false;
    setMode("pdf");
    const srcs = await toSources([file]);
    await openSources(srcs, file);
    return srcs.length > 0;
  };
  const open = async () => {
    const file = await openPdf(true).catch((e) => (toast.error(String(e)), null));
    if (file) await openFile(file).catch((e) => toast.error(String((e as Error).message ?? e)));
  };
  const openPath = (path: string) =>
    readPath(path)
      .then(openFile)
      .catch((e) => toast.error(String(e)));
  const addPdf = async () => {
    const file = await openPdf().catch((e) => (toast.error(String(e)), null));
    if (file) appendSources(await toSources([file]));
  };
  const addImages = async () => {
    const images = await pickFiles("image/*", true);
    if (!images.length) return;
    const srcs = await toSources([], images);
    doc ? appendSources(srcs) : openSources(srcs);
  };

  // Every output goes through exportPdf so edits, stamps and options are applied the same way.
  const busyRef = useRef(false);
  const run = async (label: string, job: (d: Doc) => Promise<boolean>) => {
    // A ref, not state: two shortcuts in the same tick must not start two writes to the same file.
    if (!doc || busyRef.current) return;
    busyRef.current = true;
    (document.activeElement as HTMLElement | null)?.blur(); // commit any text being edited
    setBusy(true);
    try {
      if (await job(doc)) toast.success(label);
    } catch (e) {
      toast.error(t("Operazione non riuscita: {error}", { error: (e as Error).message }));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const build = (d: Doc, pages: PageRef[], opts: Partial<ExportOptions> = options) =>
    exportPdf(d.sources, { ...work, pages, bookmarks: work.bookmarks, items: [...work.items, ...expandStamps(work.stamps, pages, d.sources, d.name)] }, opts);
  const refsById = (ids: string[]) => work.pages.filter((p) => ids.includes(p.id));

  const flashSaved = () => {
    setSaved(true);
    setSavedWork(work);
    setTimeout(() => setSaved(false), 2000);
  };
  // "Salva" rewrites the open file as it is, keeping its open password; the export options belong to "Salva come".
  const save = () => {
    if (!doc?.path) return setSaveOpen(true);
    const path = doc.path;
    run(t("PDF salvato"), async (d) => {
      let bytes = await build(d, work.pages, d.protection);
      if (d.protection.pdfa) bytes = await convertPdfa(bytes);
      await overwritePdf(path, bytes);
      flashSaved();
      return true;
    });
  };
  const saveAs = () =>
    run(t("PDF salvato"), async (d) => {
      let bytes = await build(d, work.pages, options.pdfa ? { ...options, password: "", restrict: null } : options);
      if (options.pdfa) bytes = await convertPdfa(bytes);
      const out = await savePdfAs(d.path ? d.name : t("{name}-modificato.pdf", { name: baseName }), bytes);
      if (!out) return false;
      if (out.path) {
        const protection = options.pdfa ? { password: "", restrict: null, pdfa: true } : { password: options.password, restrict: options.restrict, pdfa: false };
        setDoc((cur) => cur && { ...cur, name: out.name, path: out.path, protection });
        setRecent(pushRecent(out.path));
      }
      flashSaved();
      return true;
    });
  // The writer's file is saved as it is in state (kept current by onChange), so edits made during the write stay dirty.
  const saveWriter = async (as = false) => {
    const file = writer?.file;
    if (!writer || !file) return null;
    try {
      const out = as || !writer.path ? await saveLptkAs(writer.name, file) : await saveLptk(writer.name, file, writer.path);
      if (!out) return null;
      setWriter((w) => w && { ...w, path: out.path || w.path, name: out.name.replace(/\.lptk$/i, ""), saved: file });
      if (out.path) setRecent(pushRecent(out.path));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return out.path || out.name;
    } catch (e) {
      toast.error(t("Salvataggio non riuscito: {error}", { error: String((e as Error).message ?? e) }));
      return null;
    }
  };
  const openPdfBytes = (name: string, bytes: Uint8Array, path?: string) => openFile({ name, bytes, path }).catch((e) => (toast.error(String(e)), false));
  const exportWriterPdf = async (bytes: Uint8Array, name: string) => {
    const out = await savePdfAs(name, bytes).catch((e) => (toast.error(String(e)), null));
    if (out) toast.success(t("PDF esportato"), { action: { label: t("Apri per firmare"), onClick: () => void openPdfBytes(out.name, bytes, out.path || undefined) } });
  };
  const print = () => run(t("Inviato alla stampa"), async (d) => (await printPdf(await build(d, work.pages, { ...options, password: "", restrict: null, pdfa: false })), true));
  const extract = (ids: string[]) => run(t("Pagine estratte"), async (d) => !!(await savePdfAs(t("{name}-estratto.pdf", { name: baseName }), await build(d, refsById(ids)))));
  const split = (groups: number[][]) =>
    run(t("Creati {n} file", { n: groups.length }), async (d) => {
      const files = [];
      for (const [i, g] of groups.entries()) files.push({ name: `${baseName}-${i + 1}.pdf`, bytes: await build(d, g.map((n) => work.pages[n - 1])) });
      return saveFiles(files);
    });
  const exportImages = (ids: string[]) =>
    run(t("Immagini salvate"), async (d) => {
      const refs = refsById(ids);
      const pdf = await getDocument({ data: await build(d, refs, { ...options, password: "", restrict: null }) }).promise;
      const files = [];
      for (const [i, ref] of refs.entries()) files.push({ name: `${baseName}-p${work.pages.indexOf(ref) + 1}.png`, bytes: await pageToPng(await pdf.getPage(i + 1), 2) });
      await pdf.loadingTask.destroy();
      return saveFiles(files);
    });

  const update = useCallback((id: string, patch: Partial<Item>) => setWork((w) => ({ ...w, items: w.items.map((i) => (i.id === id ? ({ ...i, ...patch } as Item) : i)) }), `item:${id}`), [setWork]);
  const remove = useCallback(
    (id: string) => {
      setWork((w) => ({ ...w, items: w.items.filter((i) => i.id !== id) }), "remove");
      setSelectedId((s) => (s === id ? null : s));
    },
    [setWork],
  );
  // Leaving edit mode drops a text box that was left empty, however the edit ended.
  const endEdit = (id: string | null) => {
    if (id === null && editingId) setWork((w) => ({ ...w, items: w.items.filter((i) => !(i.id === editingId && i.kind === "text" && !i.text.trim())) }), null);
    setEditingId(id);
  };
  const add = (item: Item) => {
    setWork((w) => ({ ...w, items: [...w.items, item] }), `add:${item.id}`);
    setSelectedId(item.id);
    if (tool.kind !== "pen") setTool({ kind: "select" });
  };

  // Initials on every sheet: copies an item to the same spot on every other page, kept inside smaller pages.
  const repeatOnAllPages = (id: string) => {
    const item = work.items.find((i) => i.id === id);
    if (!doc || !item || !("w" in item)) return;
    const copies = work.pages
      .filter((p) => p.id !== item.page)
      .map((p) => {
        const size = viewportOf(pageProxy(doc.sources, p), p, 1);
        return { ...item, id: crypto.randomUUID(), page: p.id, x: Math.max(0, Math.min(item.x, size.width - item.w)), y: Math.max(0, Math.min(item.y, size.height - item.h)) };
      });
    setWork((w) => ({ ...w, items: [...w.items, ...copies] }), `repeat:${id}`);
    toast.success(t("Copiata su altre {n} pagine", { n: copies.length }));
  };

  // Black boxes over every match of `query` and of the chosen patterns, in the text layer and in OCR words.
  // shortcut: where a match starts inside a text run is measured with the run's CSS font family, not the embedded font; reviewed by eye.
  const redactMatches = async (query: string, patterns: Pattern[]) => {
    if (!doc) return { found: 0, pages: 0 };
    const made: Item[] = [];
    const ctx = document.createElement("canvas").getContext("2d")!;
    const box = (page: string, x: number, y: number, w: number, h: number): Item => ({ id: crypto.randomUUID(), page, kind: "rect", style: "redact", x: x - 1, y: y - 1, w: w + 2, h: h + 2 });
    for (const ref of work.pages) {
      const page = pageProxy(doc.sources, ref);
      const vp = viewportOf(page, ref, 1);
      const content = await page.getTextContent();
      for (const it of content.items) {
        if (!("str" in it) || !it.str) continue;
        ctx.font = `100px ${content.styles[it.fontName]?.fontFamily ?? "sans-serif"}`;
        const full = ctx.measureText(it.str).width || 1;
        const at = (n: number) => (it.width * ctx.measureText(it.str.slice(0, n)).width) / full;
        const [a, b, c, d, e, f] = it.transform as number[];
        const along = Math.hypot(a, b) || 1;
        for (const [from, to] of findRanges(it.str, query, patterns)) {
          const [w0, w1] = [at(from), at(to)];
          // Corners in user space along the baseline, from a little below it to the top of the glyphs.
          const corners = [w0, w1].flatMap((w) =>
            [-0.25, 0.95].map((k) => vp.convertToViewportPoint(e + (a / along) * w + c * k, f + (b / along) * w + d * k)),
          );
          const xs = corners.map((p) => p[0]);
          const ys = corners.map((p) => p[1]);
          made.push(box(ref.id, Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)));
        }
      }
      for (const w of work.ocr[ref.id] ?? []) {
        for (const [from, to] of findRanges(w.text, query, patterns)) made.push(box(ref.id, w.x + (w.w * from) / w.text.length, w.y, (w.w * (to - from)) / w.text.length, w.h));
      }
    }
    if (made.length) setWork((w) => ({ ...w, items: [...w.items, ...made] }), `redact:${made[0].id}`);
    return { found: made.length, pages: new Set(made.map((m) => m.page)).size };
  };

  const placeImage = async (src: string, width: number, hint: string) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    setTool({ kind: "image", src, ratio: img.naturalHeight / img.naturalWidth, width });
    toast(hint);
  };
  const pickImage = async () => {
    const [file] = await pickFiles("image/*");
    if (file) placeImage(await imageToPngDataUrl(file), 200, t("Clicca sulla pagina dove vuoi l'immagine"));
  };
  const nextFieldName = () => {
    const taken = new Set([...(doc?.fields.map((f) => f.name) ?? []), ...work.items.flatMap((i) => (i.kind === "field" ? [i.name] : []))]);
    let n = 1;
    while (taken.has(`campo${n}`)) n++;
    return `campo${n}`;
  };

  const setPages = (next: PageRef[]) => {
    if (!doc) return;
    setWork((w) => {
      const before = new Map(w.pages.map((p) => [p.id, p]));
      const after = new Map(next.map((p) => [p.id, p]));
      const items = w.items.map((it) => {
        const [a, b] = [before.get(it.page), after.get(it.page)];
        return a && b && a.rotation !== b.rotation ? rotateItem(it, pageProxy(doc.sources, a), a, b) : it;
      });
      // Recognised words were placed for the old orientation: drop them rather than ship misplaced text.
      const ocr = { ...w.ocr };
      let dropped = 0;
      for (const id of Object.keys(ocr)) if (before.get(id)?.rotation !== after.get(id)?.rotation && after.has(id)) (delete ocr[id], dropped++);
      if (dropped) setTimeout(() => toast(t("Pagina ruotata: riesegui l'OCR su quella pagina")));
      return { ...w, pages: next, items, ocr };
    }, "pages");
  };

  const insertBlank = async (afterId: string | null) => {
    if (!doc) return;
    const at = afterId ? work.pages.findIndex((p) => p.id === afterId) : work.pages.length - 1;
    const near = work.pages[at] ?? work.pages[0];
    const size = near ? visibleSize(pageProxy(doc.sources, near), near) : { width: 595.28, height: 841.89 };
    const src = (await loadSource(t("Pagina bianca.pdf"), await blankPdf(size.width, size.height), async () => null))!;
    setDoc((d) => d && { ...d, sources: [...d.sources, src] });
    setWork((w) => ({ ...w, pages: [...w.pages.slice(0, at + 1), ...refsOf(src), ...w.pages.slice(at + 1)] }), "pages");
  };
  const duplicate = (ids: string[]) =>
    setWork((w) => ({ ...w, pages: w.pages.flatMap((p) => (ids.includes(p.id) ? [p, { ...p, id: crypto.randomUUID() }] : [p])) }), "pages");

  // Render a page as shown (rotation included, crop ignored) onto a canvas at `scale`.
  const renderPage = async (ref: PageRef, k: number) => {
    const page = pageProxy(doc!.sources, ref);
    const viewport = viewportOf(page, ref, k);
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport, intent: "print", background: "#fff" }).promise;
    return canvas;
  };

  const cleanScans = (ids: string[], o: CleanOptions) =>
    run(t("Scansioni pulite"), async (d) => {
      const refs = refsById(ids);
      const { PDFDocument } = await import("@cantoo/pdf-lib");
      const out = await PDFDocument.create();
      for (const ref of refs) {
        let canvas = await renderPage(ref, 2);
        const ctx = canvas.getContext("2d")!;
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const angle = o.deskew ? estimateSkew(img) : 0;
        if (o.grayscale) grayscale(img);
        if (o.whiten) cleanBackground(img);
        ctx.putImageData(img, 0, 0);
        if (Math.abs(angle) >= 0.1) canvas = rotateCanvas(canvas, angle);
        const jpg = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
        const embedded = await out.embedJpg(new Uint8Array(await jpg!.arrayBuffer()));
        const { width, height } = viewportOf(pageProxy(d.sources, ref), ref, 1);
        out.addPage([width, height]).drawImage(embedded, { x: 0, y: 0, width, height });
      }
      const src = (await loadSource(t("Scansione pulita.pdf"), await out.save(), async () => null))!;
      setDoc((cur) => cur && { ...cur, sources: [...cur.sources, src] });
      setWork((w) => {
        const ocr = { ...w.ocr };
        ids.forEach((id) => delete ocr[id]);
        return { ...w, ocr, pages: w.pages.map((p) => (ids.includes(p.id) ? { ...p, source: src.id, index: refs.findIndex((r) => r.id === p.id), rotation: 0 } : p)) };
      }, "pages");
      return true;
    });

  const ocrPages = async (ids: string[]) => {
    const refs = refsById(ids);
    const found: Work["ocr"] = {};
    let words = 0;
    const tid = toast.loading(t("Riconoscimento del testo…"));
    try {
      for (const [i, ref] of refs.entries()) {
        toast.loading(t("Riconoscimento del testo: pagina {page} di {total}", { page: i + 1, total: refs.length }), { id: tid });
        const canvas = await renderPage(ref, 2);
        const list = await ocrCanvas(canvas);
        found[ref.id] = list.map((w) => ({ text: w.text, x: w.x0 / 2, y: w.y0 / 2, w: (w.x1 - w.x0) / 2, h: (w.y1 - w.y0) / 2 }));
        words += list.length;
      }
    } finally {
      toast.dismiss(tid);
    }
    setWork((w) => ({ ...w, ocr: { ...w.ocr, ...found } }), "ocr");
    return words;
  };
  const recognise = (ids: string[]) =>
    run(t("Testo riconosciuto"), async () => {
      const words = await ocrPages(ids);
      toast(t("{n} parole riconosciute: dopo il salvataggio il testo sarà ricercabile e copiabile", { n: words }));
      return true;
    });

  // An action from the home or the menus: it works on the open PDF, or first asks for one (several, to merge).
  const startTask = async (next: Task) => {
    if (inWriter) setMode("pdf");
    if (!doc || inWriter) {
      if (next === "merge") {
        const files = await pickFiles("application/pdf,.pdf,.p7m", true);
        if (!files.length || !(await confirmDiscard())) return;
        const srcs = await toSources(await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))));
        if (!srcs.length) return;
        await openSources(srcs);
        if (srcs.length > 1) setDoc((d) => d && { ...d, name: t("PDF unito.pdf") });
      } else {
        const file = await openPdf().catch((e) => (toast.error(String(e)), null));
        if (!file || !(await openFile(file).catch((e) => (toast.error(String((e as Error).message ?? e)), false)))) return;
      }
    }
    setView(next === "merge" ? "pages" : "editor");
    setStampsOpen(false);
    setTask(next);
    if (next === "sign" && !loadSignatures().length) setSigOpen(true);
  };
  const compressAndSave = async (level: Compression) => {
    let size: number | null = null;
    await run(t("PDF compresso salvato"), async (d) => {
      let bytes = await build(d, work.pages, { ...options, compress: level });
      // Ghostscript also shrinks fonts and non-JPEG images; it cannot keep a password, so protected output skips it.
      if (ghostscript && !options.password && !options.restrict) {
        const gs = await compressWithGhostscript(bytes, level === "strong").catch(() => null);
        if (gs && gs.length < bytes.length) bytes = gs;
      }
      if (!(await savePdfAs(t("{name}-compresso.pdf", { name: baseName }), bytes))) return false;
      size = bytes.length;
      return true;
    });
    return size;
  };

  // The MCP tools act through this object, rebuilt every render so they always see the current state.
  const mcpCtx = useRef<McpContext>(null!);
  mcpCtx.current = {
    doc: () => doc,
    work: () => work,
    update: (f, group) => setWork(f, group),
    addSource: (s) => setDoc((d) => d && { ...d, sources: [...d.sources, s] }),
    loadBytes: async (name, bytes) => (await loadSource(name, bytes, async () => null))!,
    build: (pages) => build(doc!, pages, { ...options, password: "", restrict: null, pdfa: false, layout: "original" }),
    open: async (path) => {
      try {
        return await openFile(await readPath(path));
      } catch (e) {
        throw new Error(String(e));
      }
    },
    save: async () => {
      if (!doc) throw new Error("Nessun documento aperto.");
      if (!doc.path) {
        setSaveOpen(true);
        return "Il documento non ha ancora un file: ho aperto la finestra Salva come, l'utente sceglie dove salvarlo.";
      }
      let bytes = await build(doc, work.pages, doc.protection);
      if (doc.protection.pdfa) bytes = await convertPdfa(bytes);
      await overwritePdf(doc.path, bytes);
      flashSaved();
      return `Salvato in ${doc.path}.`;
    },
    saveAs: async () => {
      if (!doc) throw new Error("Nessun documento aperto.");
      setSaveOpen(true);
      return "Ho aperto la finestra Salva come nell'app: l'utente sceglie opzioni e posizione.";
    },
    ocr: ocrPages,
    confirm: (message) => (isTauri() ? ask(message, { title: t("Assistente AI"), kind: "warning", okLabel: t("Consenti"), cancelLabel: t("Rifiuta") }) : Promise.resolve(window.confirm(message))),
    extraTools: () =>
      writerTools({
        handle: () => writerRef.current,
        create: (file) => openWriter({ file, name: file.title, saved: null }),
        save: async () => {
          const where = await saveWriter();
          return where ? `Salvato in ${where}.` : "Salvataggio annullato dall'utente.";
        },
        exportPdf: async (openInEditor) => {
          const h = writerRef.current!;
          const name = `${h.getFile()?.title || "Documento"}.pdf`;
          const bytes = await h.exportPdf();
          if (openInEditor) return (await openPdfBytes(name, bytes)) ? `Aperto ${name} nell'editor PDF: ora puoi usare gli strumenti PDF.` : "Apertura annullata.";
          const out = await savePdfAs(name, bytes);
          return out ? `PDF salvato${out.path ? ` in ${out.path}` : ""}.` : "Salvataggio annullato dall'utente.";
        },
      }),
    signatures: () => {
      try {
        return JSON.parse(localStorage.getItem("pdf-toolkit:signatures") ?? "[]");
      } catch {
        return [];
      }
    },
  };
  // Dev builds only: lets the tools be exercised from the browser console without the desktop bridge.
  if (import.meta.env.DEV) (window as unknown as { __mcp: unknown }).__mcp = { tools: () => buildTools(mcpCtx.current), runTool };
  const [aiActive, setAiActive] = useState(false);
  useEffect(() => {
    const off = serveMcp(() => buildTools(mcpCtx.current));
    let timer: ReturnType<typeof setTimeout>;
    const offActivity = isTauri()
      ? listen("mcp-activity", () => {
          setAiActive(true);
          clearTimeout(timer);
          timer = setTimeout(() => setAiActive(false), 2500);
        })
      : Promise.resolve(() => {});
    return () => (off(), void offActivity.then((f) => f()));
  }, []);

  // Stable inputs, so unrelated re-renders don't restart the page-by-page diff.
  const compareSides = useMemo(
    () =>
      doc && compare
        ? {
            left: work.pages.map((r) => {
              const page = pageProxy(doc.sources, r);
              return { page, rotation: (page.rotate + r.rotation) % 360 };
            }),
            right: compare.pages.map((page) => ({ page, rotation: page.rotate })),
          }
        : null,
    [compare],
  );
  const startCompare = async () => {
    const file = await openPdf().catch((e) => (toast.error(String(e)), null));
    if (!file) return;
    const [src] = await toSources([file]);
    if (src) setCompare(src);
  };

  // Search: count matches page by page from the text content, so the counter and the highlights agree.
  const textCache = useRef(new Map<unknown, string[]>());
  useEffect(() => {
    if (!doc || !search?.query) return setHits([]);
    let alive = true;
    const t = setTimeout(async () => {
      const out: { page: string; k: number }[] = [];
      for (const ref of work.pages) {
        const page = pageProxy(doc.sources, ref);
        if (!textCache.current.has(page)) textCache.current.set(page, (await page.getTextContent()).items.map((i) => ("str" in i ? i.str : "")));
        findInItems(textCache.current.get(page)!, search.query).forEach((_, k) => out.push({ page: ref.id, k }));
      }
      if (alive) setHits(out);
    }, 150);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [doc, work.pages, search?.query]);
  const hit = search && hits.length ? hits[Math.min(search.index, hits.length - 1)] : null;
  useEffect(() => {
    if (hit) scrollToPage(hit.page);
  }, [hit?.page, hit?.k]);
  const stepSearch = (dir: 1 | -1) => setSearch((s) => (s && hits.length ? { ...s, index: (s.index + dir + hits.length) % hits.length } : s));

  // Selecting text in a page offers highlight / underline / strike-through along the selected lines.
  useEffect(() => {
    const onUp = () =>
      setTimeout(() => {
        const sel = getSelection();
        const range = sel && !sel.isCollapsed ? sel.getRangeAt(0) : null;
        const inText = range && !!range.startContainer.parentElement?.closest("[data-text-layer]");
        if (!range || !inText) return setTextSel(null);
        const surfaces = [...document.querySelectorAll<HTMLElement>("[data-page-surface]")].map((el) => ({ el, box: el.getBoundingClientRect() }));
        const rects = [...range.getClientRects()]
          .filter((r) => r.width > 1 && r.height > 1)
          .flatMap((r) => {
            const s = surfaces.find(({ box }) => r.left + r.width / 2 >= box.left && r.left + r.width / 2 <= box.right && r.top + r.height / 2 >= box.top && r.top + r.height / 2 <= box.bottom);
            return s ? [{ page: s.el.dataset.pageSurface!, x: (r.left - s.box.left) / scale, y: (r.top - s.box.top) / scale, w: r.width / scale, h: r.height / scale }] : [];
          });
        if (!rects.length) return setTextSel(null);
        const end = range.getBoundingClientRect();
        setTextSel({ rects, left: end.left + end.width / 2, top: end.top, text: sel!.toString() });
      });
    const onChange = () => getSelection()?.isCollapsed && setTextSel(null);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("selectionchange", onChange);
    return () => {
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("selectionchange", onChange);
    };
  }, [scale]);
  const markup = (style: RectStyle) => {
    if (!textSel) return;
    const made: Item[] = textSel.rects.map((r) => {
      const h = style === "highlight" ? r.h : 1.2;
      const y = style === "highlight" ? r.y : style === "underline" ? r.y + r.h - 1.5 : r.y + r.h * 0.55 - 0.6;
      return { id: crypto.randomUUID(), page: r.page, kind: "rect", style, x: r.x, y, w: r.w, h };
    });
    setWork((w) => ({ ...w, items: [...w.items, ...made] }), `markup:${made[0].id}`);
    getSelection()?.removeAllRanges();
    setTextSel(null);
  };

  const followLink = async (l: { url?: string; dest?: unknown }, pageId: string) => {
    if (l.url) return openExternal(l.url);
    const from = work.pages.find((p) => p.id === pageId);
    const src = doc?.sources.find((s) => s.id === from?.source);
    if (!src) return;
    const index = await destIndex(src, l.dest);
    const to = work.pages.find((p) => p.source === src.id && p.index === index);
    if (to) scrollToPage(to.id);
  };

  const currentPage = () => {
    const top = mainRef.current?.getBoundingClientRect().top ?? 0;
    const el = [...document.querySelectorAll<HTMLElement>("[data-page-id]")].find((e) => e.getBoundingClientRect().bottom > top + 120);
    return el?.dataset.pageId ?? null;
  };

  const undo = () => (editableFocused() ? document.execCommand("undo") : (setEditingId(null), history.undo()));
  const redo = () => (editableFocused() ? document.execCommand("redo") : (setEditingId(null), history.redo()));

  // Quiet update check shortly after launch; the toast offers the install, Settings shows the details.
  useEffect(() => {
    const timer = setTimeout(() => {
      checkForUpdate()
        .then((u) => u && toast(t("È disponibile la versione {version}", { version: u.version }), { duration: 10000, action: { label: t("Installa"), onClick: () => installUpdate(u, () => {}).catch((e) => toast.error(String(e))) } }))
        .catch(() => {});
    }, 4000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (saveOpen || task === "compress") ghostscriptPath().then((p) => setGhostscript(!!p));
  }, [saveOpen, task]);

  // First launch shows the home tour, the first opened PDF the editor one; each runs once.
  const showEditor = !!doc && !inWriter;
  useEffect(() => {
    const name: TourName | null = !doc && !inWriter ? "home" : showEditor && !sigOpen ? "editor" : null;
    if (!name || tour || tourSeen(name)) return;
    const timer = setTimeout(() => setTour(name), 600);
    return () => clearTimeout(timer);
  }, [!!doc, inWriter, sigOpen]);
  const startTour = () => setTour(showEditor ? "editor" : "home");

  const zoom = (dir: 1 | -1) =>
    setScale((s) => (dir > 0 ? (ZOOMS.find((z) => z > s + 0.001) ?? s) : ([...ZOOMS].reverse().find((z) => z < s - 0.001) ?? s)));
  const fitWidth = () => {
    if (!doc || !mainRef.current || !work.pages.length) return;
    const first = work.pages[0];
    const width = visibleSize(pageProxy(doc.sources, first), first).width;
    setScale(Math.min(3, Math.max(0.5, (mainRef.current.clientWidth - 160) / width)));
  };

  // Native menu and Finder integration call the newest handlers through this ref.
  const actions = useRef<MenuActions>(null!);
  actions.current = {
    newDocument: () => void newDocument(),
    open,
    openRecent: openPath,
    clearRecent: () => setRecent(clearRecent()),
    close: () => void closeDocument(),
    addPdf,
    addImages,
    compare: startCompare,
    save: () => (inWriter ? void saveWriter() : doc && save()),
    saveAs: () => (inWriter ? void saveWriter(true) : doc && setSaveOpen(true)),
    print: () => doc && print(),
    find: () => doc && setSearch((s) => s ?? { query: "", index: 0 }),
    view: (v) => doc && (setView(v), setSelectedId(null)),
    zoomIn: () => zoom(1),
    zoomOut: () => zoom(-1),
    fit: fitWidth,
    togglePanel: () => doc && setPanelOpen((o) => !o),
    toggleStamps: () => doc && (setTask(null), setStampsOpen((o) => !o)),
    task: (k) => void startTask(k),
    settings: () => setSettingsOpen(true),
    signatures: () => setSigsOpen(true),
    batch: () => setBatchOpen(true),
    tour: startTour,
  };
  useEffect(() => {
    installMenu(() => actions.current, { hasDoc: !!doc && !inWriter, canSave: inWriter ? !!writer?.file : !!doc, recent }).catch(() => {});
  }, [!!doc, inWriter, !!writer?.file, recent]);
  useEffect(() => onOpenedFiles((paths) => actions.current.openRecent(paths[0])), []);
  // Closing the window with unsaved changes asks first.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty || writerDirty;
  useEffect(() => {
    if (!isTauri()) return;
    const off = getCurrentWindow().onCloseRequested(async (e) => {
      if (dirtyRef.current && !(await ask(t("Ci sono modifiche non salvate. Chiudere comunque?"), { title: t("Modifiche non salvate"), kind: "warning", okLabel: t("Chiudi"), cancelLabel: t("Annulla") }))) e.preventDefault();
    });
    return () => void off.then((f) => f());
  }, []);

  const toolKey = (t: Tool) =>
    t.kind === "text"
      ? t.preset
        ? "date"
        : "text"
      : t.kind === "image"
        ? t.src === marks.check
          ? "check"
          : t.src === marks.cross
            ? "cross"
            : "image"
        : t.kind === "rect"
          ? t.style
          : t.kind === "shape"
            ? "shape"
            : t.kind;
  const tools: { key: string; label: string; shortcut: string; icon: React.ReactNode; pick: () => void }[] = [
    { key: "select", label: t("Seleziona"), shortcut: "V", icon: <MousePointer2 />, pick: () => setTool({ kind: "select" }) },
    { key: "text", label: t("Testo"), shortcut: "T", icon: <Type />, pick: () => setTool({ kind: "text" }) },
    { key: "date", label: t("Data di oggi"), shortcut: "D", icon: <CalendarDays />, pick: () => setTool({ kind: "text", preset: new Date().toLocaleDateString(locale) }) },
    { key: "sign", label: t("Firma"), shortcut: "S", icon: <PenLine />, pick: () => setSigOpen(true) },
    { key: "image", label: t("Immagine"), shortcut: "I", icon: <ImagePlus />, pick: pickImage },
    { key: "check", label: t("Spunta"), shortcut: "K", icon: <Check />, pick: () => setTool({ kind: "image", src: marks.check, ratio: 1, width: 14 }) },
    { key: "cross", label: t("Croce"), shortcut: "X", icon: <X />, pick: () => setTool({ kind: "image", src: marks.cross, ratio: 1, width: 14 }) },
    { key: "pen", label: t("Penna"), shortcut: "P", icon: <Pencil />, pick: () => setTool({ kind: "pen", color: "#1d3fa8", width: 1.5 }) },
    { key: "note", label: t("Commento"), shortcut: "C", icon: <MessageSquarePlus />, pick: () => setTool({ kind: "note" }) },
    { key: "highlight", label: t("Evidenzia"), shortcut: "H", icon: <Highlighter />, pick: () => setTool({ kind: "rect", style: "highlight" }) },
    { key: "cover", label: t("Copri con bianco"), shortcut: "E", icon: <Eraser />, pick: () => setTool({ kind: "rect", style: "cover" }) },
    { key: "redact", label: t("Oscura (rimuove il contenuto sotto)"), shortcut: "R", icon: <EyeOff />, pick: () => setTool({ kind: "rect", style: "redact" }) },
  ];
  const toolButton = (key: string) => {
    const t = tools.find((x) => x.key === key)!;
    return (
      <ToolButton key={t.key} label={t.label} shortcut={t.shortcut} side="top" active={toolKey(tool) === t.key} onClick={t.pick}>
        {t.icon}
      </ToolButton>
    );
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = editableFocused();
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      // In the desktop app these come through the native menu; this covers the browser build.
      if (mod && e.shiftKey && k === "s") (e.preventDefault(), actions.current.saveAs());
      else if (mod && k === "s") (e.preventDefault(), actions.current.save());
      else if (mod && e.key === ",") (e.preventDefault(), setSettingsOpen(true));
      else if (mod && k === "o") (e.preventDefault(), open());
      else if (mod && k === "n") (e.preventDefault(), newDocument());
      // The writer has its own undo, shortcuts and tools.
      else if (inWriter) return;
      else if (mod && k === "p") (e.preventDefault(), actions.current.print());
      else if (mod && k === "f") (e.preventDefault(), actions.current.find());
      else if (mod && k === "z" && !typing) (e.preventDefault(), e.shiftKey ? redo() : undo());
      else if (mod && (e.key === "=" || e.key === "+")) (e.preventDefault(), zoom(1));
      else if (mod && e.key === "-") (e.preventDefault(), zoom(-1));
      else if (mod && e.key === "0") (e.preventDefault(), fitWidth());
      else if (typing || view !== "editor" || !doc || mod || e.altKey) return;
      else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) remove(selectedId);
      else if (e.key === "Escape") (setTool({ kind: "select" }), setSelectedId(null), setSearch(null));
      else tools.find((t) => t.shortcut.toLowerCase() === k)?.pick();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <TooltipProvider delay={500}>
      <div
        className="relative h-screen overflow-hidden bg-canvas text-foreground"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length) ingest([...e.dataTransfer.files]);
        }}
      >
        <main ref={mainRef} className="canvas-scroll absolute inset-0 overflow-auto">
          {!doc ? (
            <EmptyState onOpen={open} recent={recent} onRecent={openPath} />
          ) : view === "pages" ? (
            <PagesView
              sources={doc.sources}
              pages={work.pages}
              onPages={setPages}
              onAddPdf={addPdf}
              onAddImages={addImages}
              onExtract={extract}
              onSplit={split}
              onExportImages={exportImages}
              onBlank={insertBlank}
              onDuplicate={duplicate}
              onClean={cleanScans}
              onOcr={recognise}
            />
          ) : (
            <div className="flex min-w-fit flex-col items-center gap-8 px-20 pt-20 pb-32" onPointerDown={(e) => e.target === e.currentTarget && setSelectedId(null)}>
              {work.pages.map((ref, i) => (
                <PdfPage
                  key={ref.id}
                  pageRef={ref}
                  page={pageProxy(doc.sources, ref)}
                  number={i + 1}
                  scale={scale}
                  items={work.items.filter((it) => it.page === ref.id)}
                  stamps={stampItems.filter((s) => s.page === ref.id)}
                  fields={ref.source === doc.sources[0].id ? doc.fields.filter((f) => f.page === ref.index) : []}
                  values={(f) => work.edits[f.name] ?? f.initial}
                  tool={tool}
                  selectedId={selectedId}
                  editingId={editingId}
                  query={search?.query ?? ""}
                  activeMatch={hit?.page === ref.id ? hit.k : null}
                  nextFieldName={nextFieldName}
                  onSelect={setSelectedId}
                  onEdit={endEdit}
                  onAdd={add}
                  onChange={update}
                  onRemove={remove}
                  onField={(name, v) => setWork((w) => ({ ...w, edits: { ...w.edits, [name]: v } }), `field:${name}`)}
                  onLink={(l) => followLink(l, ref.id)}
                />
              ))}
            </div>
          )}
        </main>

        {/* Kept mounted while the PDF is on screen, so switching back keeps the cursor and the undo history. */}
        {writer && (
          <div className={cn("absolute inset-0 bg-canvas", !inWriter && "hidden")}>
            <WriterView ref={writerRef} file={writer.file} onChange={(file) => setWriter((w) => w && { ...w, file })} onExportPdf={exportWriterPdf} />
          </div>
        )}

        {/* The macOS title bar is hidden, so this strip behind the top capsules moves the window; double click zooms it like a native one. */}
        {MAC_WINDOW && (
          <div
            className="absolute inset-x-0 top-0 h-[60px] border-b border-border/60 bg-canvas/80 backdrop-blur-md"
            onMouseDown={(e) => {
              if (e.button !== 0 || e.target !== e.currentTarget) return;
              const win = getCurrentWindow();
              void (e.detail === 2 ? win.toggleMaximize() : win.startDragging());
            }}
          />
        )}

        <div className={cn("pointer-events-none absolute top-2.5 flex items-center gap-2", MAC_WINDOW ? "left-[84px]" : "left-3")}>
          <FloatBar>
            {(doc || inWriter) && (
              <>
                <div data-tour="home" className="flex">
                  <ToolButton label={t("Chiudi e torna alla home")} onClick={closeDocument}>
                    <House />
                  </ToolButton>
                </div>
                <BarDivider />
              </>
            )}
            {doc && !inWriter && (
              <>
                <ToolButton label={t("Indice e allegati")} active={panelOpen} onClick={() => setPanelOpen((o) => !o)}>
                  <PanelLeft />
                </ToolButton>
                <BarDivider />
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button data-tour="menu" className="inline-flex h-8 max-w-56 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium outline-none transition-[background-color] duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:bg-accent" />
                }
              >
                <span className="truncate">{inWriter ? writer.name : doc ? doc.name : "PDF Toolkit"}</span>
                {(inWriter ? writerDirty : dirty) && <span aria-label={t("Modifiche non salvate")} className="size-1.5 shrink-0 rounded-full bg-muted-foreground" />}
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={8} className="min-w-60">
                <DropdownMenuItem onClick={newDocument}>
                  <FilePen /> {t("Nuovo documento")}
                  <DropdownMenuShortcut>⌘N</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={open}>
                  <FileUp /> {t("Apri…")}
                  <DropdownMenuShortcut>⌘O</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger disabled={!recent.length}>
                    <Clock /> {t("Apri recenti")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-56">
                    {recent.map((r) => (
                      <DropdownMenuItem key={r.path} onClick={() => openPath(r.path)} title={r.path}>
                        {r.name}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setRecent(clearRecent())}>{t("Cancella elenco")}</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Zap /> {t("Azioni")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-52">
                    {TASKS.map(({ task: k, title, icon: Icon }) => (
                      <DropdownMenuItem key={k} onClick={() => startTask(k)}>
                        <Icon /> {title}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={!doc || inWriter} onClick={addPdf}>
                  <FilePlus2 /> {t("Aggiungi PDF…")}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={inWriter} onClick={addImages}>
                  <Images /> {doc ? t("Aggiungi immagini…") : t("Crea PDF da immagini…")}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!doc || inWriter} onClick={startCompare}>
                  <GitCompare /> {t("Confronta con…")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={inWriter ? !writer : !doc} onClick={closeDocument}>
                  <House /> {t("Chiudi e torna alla home")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={inWriter ? !writer.file : !doc} onClick={actions.current.save}>
                  <Save /> {t("Salva")}
                  <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem disabled={inWriter ? !writer.file : !doc} onClick={actions.current.saveAs}>
                  <FileDown /> {t("Salva come…")}
                  <DropdownMenuShortcut>⇧⌘S</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!doc || inWriter} onClick={print}>
                  <Printer /> {t("Stampa…")}
                  <DropdownMenuShortcut>⌘P</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSigsOpen(true)}>
                  <Signature /> {t("Le mie firme…")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={startTour}>
                  <Compass /> {t("Tour dell'app")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                  <Settings /> {t("Impostazioni…")}
                  <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {!doc && !inWriter && (
              <>
                <BarDivider />
                <div data-tour="files" className="flex gap-0.5">
                  <ToolButton label={t("Apri…")} shortcut="⌘O" onClick={open}>
                    <FileUp />
                  </ToolButton>
                  <ToolButton label={t("Nuovo documento")} shortcut="⌘N" onClick={newDocument}>
                    <FilePen />
                  </ToolButton>
                  <ToolButton label={t("Crea PDF da immagini…")} onClick={addImages}>
                    <Images />
                  </ToolButton>
                </div>
                <BarDivider />
                <div data-tour="tasks" className="flex gap-0.5">
                {TASKS.map(({ task: k, title, icon: Icon }) => (
                  <button
                    key={k}
                    title={title}
                    aria-label={title}
                    onClick={() => startTask(k)}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium text-foreground/80 outline-none transition-[background-color,color,scale] duration-150 hover:bg-accent hover:text-foreground active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:stroke-[1.75]"
                  >
                    <Icon /> <span className="hidden xl:inline">{title}</span>
                  </button>
                ))}
                </div>
                <BarDivider />
                <ToolButton label={t("Più file insieme…")} onClick={() => setBatchOpen(true)}>
                  <Layers />
                </ToolButton>
              </>
            )}
            {doc && writer && (
              <>
                <BarDivider />
                <Segmented
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: "pdf", label: "PDF", icon: <FileText /> },
                    { value: "writer", label: t("Documento"), icon: <FilePen /> },
                  ]}
                />
              </>
            )}
            {doc && !inWriter && (
              <>
                <BarDivider />
                <div data-tour="view" className="flex">
                <Segmented
                  value={view}
                  onChange={(v) => (setView(v), setSelectedId(null))}
                  options={[
                    { value: "editor", label: t("Modifica"), icon: <SquarePen /> },
                    { value: "pages", label: t("Pagine"), icon: <LayoutGrid /> },
                  ]}
                />
                </div>
                <BarDivider />
                <ToolButton label={t("Annulla")} shortcut="⌘Z" disabled={!history.canUndo} onClick={undo}>
                  <Undo2 />
                </ToolButton>
                <ToolButton label={t("Ripeti")} shortcut="⇧⌘Z" disabled={!history.canRedo} onClick={redo}>
                  <Redo2 />
                </ToolButton>
                <BarDivider />
                <div data-tour="actions" className="flex gap-0.5">
                <ToolMenu
                  label={t("Azioni")}
                  icon={<Zap />}
                  side="bottom"
                  items={[...TASKS.map(({ task: k, title, icon: Icon }) => ({ label: title, icon: <Icon />, onPick: () => void startTask(k) })), { label: t("Confronta con…"), icon: <GitCompare />, onPick: startCompare }, { label: t("Più file insieme…"), icon: <Layers />, onPick: () => setBatchOpen(true) }]}
                />
                <ToolMenu
                  label={t("Aggiungi")}
                  icon={<FilePlus2 />}
                  side="bottom"
                  items={[
                    { label: t("Aggiungi PDF…"), icon: <FilePlus2 />, onPick: addPdf },
                    { label: t("Aggiungi immagini…"), icon: <Images />, onPick: addImages },
                  ]}
                />
                </div>
              </>
            )}
          </FloatBar>
        </div>

        {(inWriter ? !!writer.file : !!doc) && (
          <div className="pointer-events-none absolute top-2.5 right-3 flex items-center gap-2">
            <FloatBar>
              {!inWriter && view === "editor" && (
                <>
                  <ToolButton label={t("Cerca")} shortcut="⌘F" active={!!search} onClick={() => setSearch((s) => (s ? null : { query: "", index: 0 }))}>
                    <Search />
                  </ToolButton>
                  <ToolButton label={t("Timbri, intestazione e piè di pagina")} active={stampsOpen} onClick={actions.current.toggleStamps}>
                    <Stamp />
                  </ToolButton>
                  <BarDivider />
                  <ToolButton label={t("Riduci")} shortcut="⌘−" onClick={() => zoom(-1)}>
                    <Minus />
                  </ToolButton>
                  <button
                    onClick={fitWidth}
                    title={t("Adatta alla larghezza (⌘0)")}
                    className="h-8 min-w-12 rounded-full px-1 text-[13px] font-medium tabular-nums outline-none transition-[background-color] duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <TextMorph>{`${Math.round(scale * 100)}%`}</TextMorph>
                  </button>
                  <ToolButton label={t("Ingrandisci")} shortcut="⌘+" onClick={() => zoom(1)}>
                    <Plus />
                  </ToolButton>
                  <BarDivider />
                </>
              )}
              {!inWriter && (
                <ToolButton label={t("Stampa…")} shortcut="⌘P" disabled={busy} onClick={print}>
                  <Printer />
                </ToolButton>
              )}
              {aiActive && (
                <span className="float-enter flex h-8 items-center gap-1.5 px-2 text-xs font-medium text-ink" role="status">
                  <Sparkles className="size-4 animate-pulse stroke-[1.75]" /> {t("Assistente AI")}
                </span>
              )}
              {inWriter && writerDirty && !busy && (
                <Button variant="ghost" className="h-8 rounded-full px-3" onClick={discardWriter} title={writer.saved ? t("Torna all'ultima versione salvata") : t("Chiudi il documento senza salvarlo")}>
                  {t("Scarta")}
                </Button>
              )}
              <Button
                data-tour="save"
                className="h-8 rounded-full px-3.5"
                onClick={actions.current.save}
                disabled={busy}
                title={(inWriter ? writer.path : doc?.path) ? t("Sovrascrive {name} (⌘S)", { name: inWriter ? `${writer.name}.lptk` : doc!.name }) : t("Scegli dove salvare (⌘S)")}
              >
                {busy ? <Loader2 className="animate-spin" /> : saved && <Check />}
                <TextMorph>{busy ? t("Attendi…") : saved ? t("Salvato") : t("Salva")}</TextMorph>
              </Button>
            </FloatBar>
          </div>
        )}

        {!doc && !inWriter && (
          <div className="pointer-events-none absolute top-2.5 right-3">
            <FloatBar>
              <div data-tour="signatures" className="flex">
                <ToolButton label={t("Le mie firme…")} onClick={() => setSigsOpen(true)}>
                  <Signature />
                </ToolButton>
              </div>
              <ToolButton label={t("Tour dell'app")} onClick={startTour}>
                <Compass />
              </ToolButton>
              <BarDivider />
              <ToolButton label={t("Impostazioni…")} shortcut="⌘," onClick={() => setSettingsOpen(true)}>
                <Settings />
              </ToolButton>
            </FloatBar>
          </div>
        )}

        {!inWriter && doc && view === "editor" && search && (
          <div className="pointer-events-none absolute top-[60px] inset-x-0 flex justify-center">
            <SearchBar query={search.query} onQuery={(query) => setSearch({ query, index: 0 })} total={hits.length} index={Math.min(search.index, Math.max(0, hits.length - 1))} onStep={stepSearch} onClose={() => setSearch(null)} />
          </div>
        )}

        {!inWriter && doc && view === "editor" && (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
            <FloatBar role="toolbar" aria-label={t("Strumenti")} data-tour="tools">
              {["select", "text", "date"].map(toolButton)}
              <BarDivider />
              {toolButton("sign")}
              {toolButton("image")}
              <ToolMenu
                label={t("Timbro")}
                icon={<BadgeCheck />}
                items={[
                  ...STAMP_PRESETS.map((p) => ({ label: p.label, onPick: () => placeImage(stampDataUrl(p.label, p.color).src, 150, t("Clicca sulla pagina dove vuoi il timbro")) })),
                  { label: t("Ricevuto il {date}", { date: new Date().toLocaleDateString(locale) }), onPick: () => placeImage(stampDataUrl(t("Ricevuto il {date}", { date: new Date().toLocaleDateString(locale) }), "#1d3fa8").src, 190, t("Clicca sulla pagina dove vuoi il timbro")) },
                ]}
              />
              {["check", "cross"].map(toolButton)}
              <BarDivider />
              {toolButton("pen")}
              <ToolMenu
                label={t("Forme")}
                icon={<Shapes />}
                active={tool.kind === "shape"}
                items={[
                  { label: t("Linea"), icon: <Slash />, onPick: () => setTool({ kind: "shape", shape: "line" }) },
                  { label: t("Freccia"), icon: <ArrowRight />, onPick: () => setTool({ kind: "shape", shape: "arrow" }) },
                  { label: t("Rettangolo"), icon: <Square />, onPick: () => setTool({ kind: "shape", shape: "rect" }) },
                  { label: t("Ellisse"), icon: <Circle />, onPick: () => setTool({ kind: "shape", shape: "ellipse" }) },
                ]}
              />
              {toolButton("note")}
              <BarDivider />
              {["highlight", "cover", "redact"].map(toolButton)}
              <BarDivider />
              <ToolMenu
                label={t("Campo modulo")}
                icon={<FormInput />}
                active={tool.kind === "field"}
                items={[
                  { label: t("Campo di testo"), icon: <TextCursorInput />, onPick: () => setTool({ kind: "field", field: "text" }) },
                  { label: t("Casella di spunta"), icon: <SquareCheck />, onPick: () => setTool({ kind: "field", field: "checkbox" }) },
                ]}
              />
            </FloatBar>
          </div>
        )}

        {!inWriter && textSel && view === "editor" && (
          <div className="pointer-events-none fixed z-30 -translate-x-1/2" style={{ left: textSel.left, top: Math.max(8, textSel.top - 52) }}>
            <FloatBar onPointerDown={(e) => e.preventDefault()}>
              <ToolButton label={t("Evidenzia")} side="top" onClick={() => markup("highlight")}>
                <Highlighter />
              </ToolButton>
              <ToolButton label={t("Sottolinea")} side="top" onClick={() => markup("underline")}>
                <Underline />
              </ToolButton>
              <ToolButton label={t("Barra")} side="top" onClick={() => markup("strike")}>
                <Strikethrough />
              </ToolButton>
              <BarDivider />
              <ToolButton
                label={t("Copia")}
                shortcut="⌘C"
                side="top"
                onClick={() => {
                  navigator.clipboard.writeText(textSel.text).then(() => toast(t("Testo copiato")));
                  setTextSel(null);
                }}
              >
                <CopyIcon />
              </ToolButton>
            </FloatBar>
          </div>
        )}

        {!inWriter && doc && task && (
          <TaskPanel
            key={task}
            task={task}
            busy={busy}
            ghostscript={ghostscript}
            pages={work.pages.length}
            size={doc.sources.reduce((n, s) => n + s.bytes.length, 0)}
            ocrPages={work.pages.filter((p) => work.ocr[p.id]).length}
            signatures={loadSignatures()}
            onNewSignature={() => setSigOpen(true)}
            onManageSignatures={() => setSigsOpen(true)}
            canRepeat={work.pages.length > 1 && work.items.some((i) => i.id === selectedId && i.kind === "image")}
            onRepeat={() => selectedId && repeatOnAllPages(selectedId)}
            onRedact={redactMatches}
            onPlaceSignature={(src) => placeImage(src, 160, t("Clicca sulla pagina dove vuoi la firma"))}
            onDate={tools.find((x) => x.key === "date")!.pick}
            onText={tools.find((x) => x.key === "text")!.pick}
            onAddPdf={addPdf}
            onOcr={() => recognise(work.pages.map((p) => p.id))}
            onCompress={compressAndSave}
            onSave={() => setSaveOpen(true)}
            onClose={() => setTask(null)}
          />
        )}
        {!inWriter && doc && view === "editor" && stampsOpen && !task && <StampsPanel stamps={work.stamps} onStamps={(s) => setWork((w) => ({ ...w, stamps: s }), "stamps")} onClose={() => setStampsOpen(false)} />}
        {!inWriter && doc && panelOpen && (
          <SidePanel
            base={doc.sources[0]}
            pages={work.pages}
            bookmarks={bookmarks}
            currentPage={currentPage()}
            attachments={work.attachments}
            onBookmarks={(b) => setWork((w) => ({ ...w, bookmarks: b }), "bookmarks")}
            onAttachments={(a) => setWork((w) => ({ ...w, attachments: a }), "attachments")}
            onGo={(id) => (setView("editor"), setTimeout(() => scrollToPage(id)))}
            onClose={() => setPanelOpen(false)}
          />
        )}
        {!inWriter && doc && compare && compareSides && <ComparePanel leftName={doc.name} left={compareSides.left} rightName={compare.name} right={compareSides.right} onClose={() => setCompare(null)} />}

        <SignatureDialog open={sigOpen} onOpenChange={setSigOpen} onPick={(src) => placeImage(src, 160, t("Clicca sulla pagina dove vuoi la firma"))} />
        <SignatureDialog manage open={sigsOpen} onOpenChange={setSigsOpen} />
        <BatchDialog open={batchOpen} onOpenChange={setBatchOpen} />
        {tour && <Tour name={tour} onDone={() => setTour(null)} />}
        <SaveDialog open={saveOpen} onOpenChange={setSaveOpen} options={options} onOptions={setOptions} onSave={saveAs} ghostscript={ghostscript} />
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} company={<CompanySettings />} />
        <PasswordDialog
          request={pwRequest?.name ?? null}
          onAnswer={(p) => {
            pwRequest?.resolve(p);
            setPwRequest(null);
          }}
        />
        <Toaster position="top-center" offset={60} />
      </div>
    </TooltipProvider>
  );
}
