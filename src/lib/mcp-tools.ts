// MCP tools: what an AI client connected to the app can do with the document open in the window.
// Coordinates are PDF points from the top-left of the page as displayed (rotation applied, crop ignored), pages are 1-based.
// Every change goes through the app's history, one undo step per tool call.
import type { PDFPageProxy } from "pdfjs-dist";
import { getDocument } from "pdfjs-dist";
import {
  NO_STAMPS,
  NOTE_SIZE,
  RECT_STYLES,
  expandStamps,
  pageProxy,
  viewportOf,
  type Field,
  type FieldValue,
  type Item,
  type PageRef,
  type RectStyle,
  type Source,
  type Stamps,
  type Work,
} from "@/lib/document";
import { blankPdf, pageToPng, stampDataUrl } from "@/lib/tools";

export type ToolResult = { content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[]; isError?: boolean; structuredContent?: unknown };
export type ToolDef = { name: string; title?: string; description: string; inputSchema: Record<string, unknown>; annotations?: Record<string, unknown> };
export type Tool = ToolDef & { run: (args: Record<string, unknown>) => Promise<ToolResult> };

export type PdfDocState = { name: string; path?: string; sources: Source[]; fields: Field[] };
// What the app lends the tools; implemented in App.tsx over its own state and actions.
export type McpContext = {
  doc: () => PdfDocState | null;
  work: () => Work;
  update: (f: (w: Work) => Work, group: string) => void;
  addSource: (s: Source) => void;
  loadBytes: (name: string, bytes: Uint8Array) => Promise<Source>;
  build: (pages: PageRef[]) => Promise<Uint8Array>;
  open: (path: string) => Promise<boolean>;
  save: () => Promise<string>;
  saveAs: () => Promise<string>;
  ocr: (pageIds: string[]) => Promise<number>;
  confirm: (message: string) => Promise<boolean>;
  signatures: () => string[];
  extraTools?: () => Tool[];
};

export const text = (t: string, structured?: unknown): ToolResult => ({ content: [{ type: "text", text: t }], ...(structured !== undefined && { structuredContent: structured }) });
export const fail = (t: string): ToolResult => ({ content: [{ type: "text", text: t }], isError: true });
class ToolError extends Error {}

const num = { type: "number" } as const;
const pageArg = { type: "integer", minimum: 1, description: "Numero di pagina (1 = prima)" } as const;
const pagesArg = { type: "array", items: { type: "integer", minimum: 1 }, description: "Numeri di pagina (1 = prima)" } as const;
export const schema = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });

const pngBase64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const measure = document.createElement("canvas").getContext("2d")!;
measure.font = "100px Helvetica, Arial, sans-serif";
const fraction = (str: string, chars: number) => measure.measureText(str.slice(0, chars)).width / (measure.measureText(str).width || 1);
const textOf = async (page: PDFPageProxy) => (await page.getTextContent()).items.flatMap((i) => ("str" in i ? [i] : []));

export function buildTools(ctx: McpContext): Tool[] {
  const need = () => {
    const d = ctx.doc();
    if (!d) throw new ToolError("Nessun PDF aperto nell'app. Usa open_file oppure chiedi all'utente di aprirne uno.");
    return d;
  };
  const refAt = (n: unknown) => {
    const pages = ctx.work().pages;
    const ref = pages[Number(n) - 1];
    if (!ref) throw new ToolError(`Pagina ${n} inesistente: il documento ha ${pages.length} pagine.`);
    return ref;
  };
  const refsAt = (list: unknown) => ((list as number[] | undefined) ?? []).map(refAt);
  const id = () => crypto.randomUUID();
  const addItems = (items: Item[], group: string) => ctx.update((w) => ({ ...w, items: [...w.items, ...items] }), group);
  const pageSize = (ref: PageRef) => {
    const vp = viewportOf(pageProxy(need().sources, ref), ref, 1);
    return { width: Math.round(vp.width), height: Math.round(vp.height) };
  };

  const tools: Tool[] = [
    {
      name: "get_document",
      title: "Stato del documento",
      description: "Describe the PDF open in PDF Toolkit: file name, pages with sizes in points, form fields with current values, and the overlay items added so far (ids can be passed to remove_items). Call this first.",
      inputSchema: schema({}),
      annotations: { readOnlyHint: true },
      run: async () => {
        const d = ctx.doc();
        if (!d) return text("Nessun PDF aperto.", { open: false });
        const w = ctx.work();
        const info = {
          open: true,
          name: d.name,
          path: d.path ?? null,
          pages: w.pages.map((ref, i) => ({ page: i + 1, ...pageSize(ref), rotation: ref.rotation, ocr: !!w.ocr[ref.id] })),
          fields: d.fields.map((f) => ({ name: f.name, type: f.type, page: w.pages.findIndex((p) => p.source === d.sources[0].id && p.index === f.page) + 1, value: w.edits[f.name] ?? f.initial, ...(f.options.length && { options: f.options.map((o) => o.value) }) })),
          items: w.items.map((it) => ({ id: it.id, kind: it.kind, page: w.pages.findIndex((p) => p.id === it.page) + 1, ...("text" in it && { text: it.text }), ...("style" in it && { style: it.style }) })),
          stamps: w.stamps,
        };
        return text(JSON.stringify(info, null, 2), info);
      },
    },
    {
      name: "read_text",
      title: "Leggi il testo",
      description: "Return the text of the given pages (all pages if omitted), including text recognised by OCR and text boxes added in the app.",
      inputSchema: schema({ pages: pagesArg }),
      annotations: { readOnlyHint: true },
      run: async (a) => {
        const d = need();
        const w = ctx.work();
        const refs = a.pages ? refsAt(a.pages) : w.pages;
        const out: string[] = [];
        for (const ref of refs) {
          const n = w.pages.indexOf(ref) + 1;
          const own = (await textOf(pageProxy(d.sources, ref))).map((i) => i.str + (i.hasEOL ? "\n" : "")).join("");
          const ocr = (w.ocr[ref.id] ?? []).map((x) => x.text).join(" ");
          const added = w.items.filter((it) => it.page === ref.id && it.kind === "text").map((it) => (it as { text: string }).text);
          out.push(`--- Pagina ${n} ---\n${[own, ocr, ...added].filter((s) => s.trim()).join("\n") || "(nessun testo: forse è una scansione, prova ocr_pages)"}`);
        }
        return text(out.join("\n\n"));
      },
    },
    {
      name: "find_text",
      title: "Cerca nel testo",
      description: "Find a phrase in the PDF text and return each match with its page and bounding box {x, y, w, h} in page points, ready for add_markup (highlight, underline, strike, cover, redact).",
      inputSchema: schema({ query: { type: "string", minLength: 1 } }, ["query"]),
      annotations: { readOnlyHint: true },
      run: async (a) => {
        const d = need();
        const q = String(a.query).toLocaleLowerCase();
        const matches: { page: number; x: number; y: number; w: number; h: number; text: string }[] = [];
        for (const [i, ref] of ctx.work().pages.entries()) {
          const page = pageProxy(d.sources, ref);
          const vp = viewportOf(page, ref, 1);
          for (const it of await textOf(page)) {
            const s = it.str.toLocaleLowerCase();
            for (let k = s.indexOf(q); k !== -1; k = s.indexOf(q, k + q.length)) {
              const [e, f] = [it.transform[4], it.transform[5]];
              const fontH = Math.hypot(it.transform[2], it.transform[3]) || it.height;
              // pdf.js gives the run's width, not per-glyph widths: split it by measured text width.
              const x0 = e + it.width * fraction(it.str, k);
              const x1 = e + it.width * fraction(it.str, k + q.length);
              const [ax, ay] = vp.convertToViewportPoint(x0, f - fontH * 0.22);
              const [bx, by] = vp.convertToViewportPoint(x1, f + fontH * 0.88);
              matches.push({ page: i + 1, x: +Math.min(ax, bx).toFixed(1), y: +Math.min(ay, by).toFixed(1), w: +Math.abs(bx - ax).toFixed(1), h: +Math.abs(by - ay).toFixed(1), text: it.str.slice(k, k + q.length) });
            }
          }
        }
        return text(matches.length ? JSON.stringify(matches) : "Nessuna corrispondenza.", { matches });
      },
    },
    {
      name: "render_page",
      title: "Guarda una pagina",
      description: "Render one page as a PNG image exactly as it would be saved (overlays, stamps and form values included). scale 1 = 72 dpi; use 1–2.",
      inputSchema: schema({ page: pageArg, scale: { type: "number", minimum: 0.25, maximum: 3, default: 1 } }, ["page"]),
      annotations: { readOnlyHint: true },
      run: async (a) => {
        need();
        const ref = refAt(a.page);
        const pdf = await getDocument({ data: await ctx.build([ref]) }).promise;
        try {
          const png = await pageToPng(await pdf.getPage(1), Number(a.scale ?? 1));
          return { content: [{ type: "image", data: pngBase64(png), mimeType: "image/png" }] };
        } finally {
          await pdf.loadingTask.destroy();
        }
      },
    },
    {
      name: "fill_fields",
      title: "Compila i campi",
      description: "Fill AcroForm fields of the open PDF by name. Text fields take strings, checkboxes true/false, radio groups and dropdowns one of their option values.",
      inputSchema: schema({ values: { type: "object", additionalProperties: { type: ["string", "boolean"] } } }, ["values"]),
      run: async (a) => {
        const d = need();
        const values = a.values as Record<string, FieldValue>;
        const unknown = Object.keys(values).filter((n) => !d.fields.some((f) => f.name === n));
        if (unknown.length) return fail(`Campi inesistenti: ${unknown.join(", ")}. Usa get_document per l'elenco.`);
        ctx.update((w) => ({ ...w, edits: { ...w.edits, ...values } }), `mcp:${id()}`);
        return text(`Compilati ${Object.keys(values).length} campi.`);
      },
    },
    {
      name: "add_text",
      title: "Aggiungi testo",
      description: "Place a text box on a page. (x, y) is the top-left of the box in points from the page's top-left. Multi-line text with \\n. Only Latin characters supported by Helvetica will save.",
      inputSchema: schema({ page: pageArg, x: num, y: num, text: { type: "string", minLength: 1 }, size: { type: "number", default: 12 }, color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$", default: "#000000" }, rotate: { type: "number", description: "Gradi, antiorario" } }, ["page", "x", "y", "text"]),
      run: async (a) => {
        const ref = refAt(a.page);
        const item: Item = { id: id(), page: ref.id, kind: "text", x: Number(a.x), y: Number(a.y), text: String(a.text), size: Number(a.size ?? 12), color: String(a.color ?? "#000000"), rotate: a.rotate ? Number(a.rotate) : undefined };
        addItems([item], `mcp:${item.id}`);
        return text(`Testo aggiunto (id ${item.id}).`, { id: item.id });
      },
    },
    {
      name: "add_markup",
      title: "Evidenzia, sottolinea, copri o oscura",
      description: "Add rectangles on a page: highlight, underline, strike (drawn along the rect's bottom/middle), cover (white box) or redact (black box; on save the page is rasterised so the text underneath is really removed). Get rects from find_text.",
      inputSchema: schema({ page: pageArg, style: { type: "string", enum: ["highlight", "underline", "strike", "cover", "redact"] }, rects: { type: "array", minItems: 1, items: schema({ x: num, y: num, w: num, h: num }, ["x", "y", "w", "h"]) } }, ["page", "style", "rects"]),
      run: async (a) => {
        const ref = refAt(a.page);
        const style = a.style as RectStyle;
        const items = (a.rects as { x: number; y: number; w: number; h: number }[]).map((r): Item => {
          const thin = style === "underline" || style === "strike";
          const y = style === "underline" ? r.y + r.h - 1.5 : style === "strike" ? r.y + r.h * 0.55 - 0.6 : r.y;
          return { id: id(), page: ref.id, kind: "rect", style, x: r.x, y, w: r.w, h: thin ? RECT_STYLES[style].h : r.h };
        });
        addItems(items, `mcp:${items[0].id}`);
        return text(`${items.length} ${style} aggiunti.`, { ids: items.map((i) => i.id) });
      },
    },
    {
      name: "add_stamp",
      title: "Timbro",
      description: "Place a rubber stamp (e.g. APPROVATO, PAGATO, COPIA CONFORME) centred at (x, y).",
      inputSchema: schema({ page: pageArg, x: num, y: num, label: { type: "string", minLength: 1 }, color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$", default: "#1f7a45" }, width: { type: "number", default: 150 } }, ["page", "x", "y", "label"]),
      run: async (a) => {
        const ref = refAt(a.page);
        const { src, ratio } = stampDataUrl(String(a.label), String(a.color ?? "#1f7a45"));
        const w = Number(a.width ?? 150);
        const item: Item = { id: id(), page: ref.id, kind: "image", src, x: Number(a.x) - w / 2, y: Number(a.y) - (w * ratio) / 2, w, h: w * ratio };
        addItems([item], `mcp:${item.id}`);
        return text(`Timbro aggiunto (id ${item.id}).`, { id: item.id });
      },
    },
    {
      name: "add_signature",
      title: "Firma",
      description: "Place one of the user's saved signatures, centred at (x, y). The user is asked to confirm in the app every time.",
      inputSchema: schema({ page: pageArg, x: num, y: num, width: { type: "number", default: 160 }, signature: { type: "integer", minimum: 1, default: 1, description: "Quale firma salvata (1 = la più recente)" } }, ["page", "x", "y"]),
      run: async (a) => {
        const ref = refAt(a.page);
        const saved = ctx.signatures();
        const src = saved[Number(a.signature ?? 1) - 1];
        if (!src) return fail("Nessuna firma salvata nell'app: l'utente deve prima crearne una con lo strumento Firma.");
        if (!(await ctx.confirm(`Un assistente AI vuole inserire la tua firma a pagina ${a.page}. Consentire?`))) return fail("L'utente non ha autorizzato la firma.");
        const img = new Image();
        img.src = src;
        await img.decode();
        const w = Number(a.width ?? 160);
        const h = (w * img.naturalHeight) / img.naturalWidth;
        const item: Item = { id: id(), page: ref.id, kind: "image", src, x: Number(a.x) - w / 2, y: Number(a.y) - h / 2, w, h };
        addItems([item], `mcp:${item.id}`);
        return text(`Firma inserita (id ${item.id}).`, { id: item.id });
      },
    },
    {
      name: "add_note",
      title: "Commento",
      description: "Add a sticky-note comment at (x, y); it is saved as a real PDF comment annotation.",
      inputSchema: schema({ page: pageArg, x: num, y: num, text: { type: "string", minLength: 1 } }, ["page", "x", "y", "text"]),
      run: async (a) => {
        const ref = refAt(a.page);
        const item: Item = { id: id(), page: ref.id, kind: "note", x: Number(a.x) - NOTE_SIZE / 2, y: Number(a.y) - NOTE_SIZE / 2, text: String(a.text) };
        addItems([item], `mcp:${item.id}`);
        return text(`Commento aggiunto (id ${item.id}).`, { id: item.id });
      },
    },
    {
      name: "remove_items",
      title: "Rimuovi elementi",
      description: "Remove overlay items (text, stamps, markup, notes...) by id, as listed by get_document.",
      inputSchema: schema({ ids: { type: "array", items: { type: "string" }, minItems: 1 } }, ["ids"]),
      annotations: { destructiveHint: true },
      run: async (a) => {
        const ids = new Set(a.ids as string[]);
        ctx.update((w) => ({ ...w, items: w.items.filter((i) => !ids.has(i.id)) }), `mcp:${id()}`);
        return text(`Rimossi ${ids.size} elementi.`);
      },
    },
    {
      name: "edit_pages",
      title: "Pagine",
      description: "Rearrange pages: rotate (degrees ±90/180), delete, duplicate, move to a position, or insert a blank page after a page (0 = at the start). Page numbers refer to the order before this call.",
      inputSchema: schema(
        {
          action: { type: "string", enum: ["rotate", "delete", "duplicate", "move", "insert_blank"] },
          pages: pagesArg,
          degrees: { type: "integer", enum: [90, -90, 180] },
          to: { type: "integer", minimum: 1, description: "move: nuova posizione della prima pagina spostata" },
          after: { type: "integer", minimum: 0, description: "insert_blank: dopo quale pagina" },
        },
        ["action"],
      ),
      run: async (a) => {
        const d = need();
        const g = `mcp:${id()}`;
        const pages = ctx.work().pages;
        if (a.action === "insert_blank") {
          const after = Number(a.after ?? pages.length);
          const near = pages[Math.max(0, after - 1)];
          const size = near ? pageSize(near) : { width: 595, height: 842 };
          const src = await ctx.loadBytes("Pagina bianca.pdf", await blankPdf(size.width, size.height));
          ctx.addSource(src);
          ctx.update((w) => ({ ...w, pages: [...w.pages.slice(0, after), { id: id(), source: src.id, index: 0, rotation: 0 }, ...w.pages.slice(after)] }), g);
          return text(`Pagina bianca inserita dopo la ${after}.`);
        }
        const targets = refsAt(a.pages);
        if (!targets.length) return fail("Indica le pagine.");
        const ids = new Set(targets.map((r) => r.id));
        if (a.action === "rotate") {
          const deg = Number(a.degrees ?? 90);
          ctx.update((w) => ({ ...w, pages: w.pages.map((p) => (ids.has(p.id) ? { ...p, rotation: (((p.rotation + deg) % 360) + 360) % 360 } : p)) }), g);
        } else if (a.action === "delete") {
          if (ids.size >= pages.length) return fail("Non posso eliminare tutte le pagine.");
          ctx.update((w) => ({ ...w, pages: w.pages.filter((p) => !ids.has(p.id)), items: w.items.filter((i) => !ids.has(i.page)) }), g);
        } else if (a.action === "duplicate") {
          ctx.update((w) => ({ ...w, pages: w.pages.flatMap((p) => (ids.has(p.id) ? [p, { ...p, id: id() }] : [p])) }), g);
        } else if (a.action === "move") {
          const to = Math.max(1, Math.min(Number(a.to ?? 1), pages.length - targets.length + 1));
          ctx.update((w) => {
            const rest = w.pages.filter((p) => !ids.has(p.id));
            return { ...w, pages: [...rest.slice(0, to - 1), ...w.pages.filter((p) => ids.has(p.id)), ...rest.slice(to - 1)] };
          }, g);
        }
        void d;
        const total = pages.length + (a.action === "delete" ? -targets.length : a.action === "duplicate" ? targets.length : 0);
        return text(`Fatto: ${a.action} su ${targets.length} pagine. Ora il documento ha ${total} pagine.`);
      },
    },
    {
      name: "set_stamps",
      title: "Numeri di pagina, intestazione, filigrana",
      description: "Set or clear the stamps applied to every page: page numbers ({n}, {total}), header/footer text ({file}, {data}, {n}, {total}) and a diagonal watermark. Pass null to remove one; omitted keys stay as they are.",
      inputSchema: schema({
        page_numbers: { type: ["object", "null"], properties: { position: { type: "string", enum: ["bottom-center", "bottom-right", "top-right"] }, format: { type: "string" }, size: num } },
        header: { type: ["object", "null"], properties: { text: { type: "string" }, align: { type: "string", enum: ["left", "center", "right"] }, size: num } },
        footer: { type: ["object", "null"], properties: { text: { type: "string" }, align: { type: "string", enum: ["left", "center", "right"] }, size: num } },
        watermark: { type: ["object", "null"], properties: { text: { type: "string" }, size: num, opacity: num, color: { type: "string" } } },
      }),
      run: async (a) => {
        need();
        const cur = ctx.work().stamps;
        const pick = <K extends keyof Stamps>(k: K, arg: string, defaults: NonNullable<Stamps[K]>): Stamps[K] =>
          arg in a ? (a[arg] === null ? null : ({ ...defaults, ...(cur[k] ?? {}), ...(a[arg] as object) } as Stamps[K])) : cur[k];
        const next: Stamps = {
          pageNumbers: pick("pageNumbers", "page_numbers", { position: "bottom-center", format: "{n} / {total}", size: 10 }),
          header: pick("header", "header", { text: "", align: "center", size: 9 }),
          footer: pick("footer", "footer", { text: "", align: "center", size: 9 }),
          watermark: pick("watermark", "watermark", { text: "BOZZA", size: 72, opacity: 0.15, color: "#d12a2a" }),
        };
        ctx.update((w) => ({ ...w, stamps: next }), `mcp:${id()}`);
        return text("Timbri aggiornati.", next);
      },
    },
    {
      name: "ocr_pages",
      title: "Riconosci il testo",
      description: "Run offline OCR (Italian + English) on scanned pages so their text becomes readable with read_text and searchable once saved.",
      inputSchema: schema({ pages: pagesArg }, ["pages"]),
      run: async (a) => {
        need();
        const refs = refsAt(a.pages);
        const words = await ctx.ocr(refs.map((r) => r.id));
        return text(`${words} parole riconosciute su ${refs.length} pagine.`);
      },
    },
    {
      name: "open_file",
      title: "Apri un file",
      description: "Open a PDF, .p7m or .lptk file from disk in the app (absolute path). If the current document has unsaved changes the user is asked first.",
      inputSchema: schema({ path: { type: "string", minLength: 1 } }, ["path"]),
      run: async (a) => ((await ctx.open(String(a.path))) ? text(`Aperto ${a.path}.`) : fail("Apertura annullata o non riuscita.")),
    },
    {
      name: "save",
      title: "Salva",
      description: "Save the open document over its own file (keeps its password/permissions). If it has no file yet, the user is shown the Save dialog.",
      inputSchema: schema({}),
      run: async () => text(await ctx.save()),
    },
    {
      name: "save_as",
      title: "Salva come",
      description: "Open the app's Save As flow: the user picks the location in the system dialog (the AI never writes to arbitrary paths).",
      inputSchema: schema({}),
      run: async () => text(await ctx.saveAs()),
    },
  ];
  return [...tools, ...(ctx.extraTools?.() ?? [])];
}

// Run one call, turning thrown errors into MCP tool errors the model can read and recover from.
export async function runTool(tools: Tool[], name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) return fail(`Strumento sconosciuto: ${name}`);
  try {
    return await tool.run(args ?? {});
  } catch (e) {
    return fail(e instanceof ToolError ? e.message : `Errore: ${(e as Error).message}`);
  }
}

export const toolDefs = (tools: Tool[]): ToolDef[] => tools.map(({ run: _run, ...def }) => def);
export { NO_STAMPS, expandStamps };
