import type { Editor } from "@tiptap/react";
import { MarkdownManager } from "@tiptap/markdown";
import { t } from "../lib/i18n.ts";
import { BLOCKS, buildBlock, type BlockData } from "./blocks";
import { loadCompany } from "./company";
import { extensions } from "./extensions";
import { newFile, parse, type LptkFile } from "./lptk";
import { doc, type JSONContent } from "./model";
import { TEMPLATES, buildTemplate, type TemplateData } from "./templates";
import { toPdf } from "./toPdf";

export type CatalogEntry = { id: string; label: string; description: string };

/** Imperative handle of <WriterView>, meant to be exposed as MCP tools. Every method works with or without an open document. */
export type WriterHandle = {
  /** The current document as Tiptap JSON, or null when the template gallery is showing. */
  getJSON(): JSONContent | null;
  /** The whole document (title, content, margins), ready for serialize(). */
  getFile(): LptkFile | null;
  /** Readable Markdown of the document; custom blocks become text and tables. */
  getMarkdown(): string;
  /** Replace the content with Markdown (headings, bold/italic, lists, tables, paragraphs) or Tiptap JSON (a doc node or a whole .lptk). */
  setContent(content: string | JSONContent): void;
  /** Insert a prefab block at the cursor, or at the end of the document. */
  insertBlock(blockId: string, data?: BlockData, at?: "cursor" | "end"): void;
  /** Start a new document from a template, prefilled with `data`. */
  applyTemplate(templateId: string, data?: TemplateData): void;
  listTemplates(): CatalogEntry[];
  listBlocks(): CatalogEntry[];
  exportPdf(): Promise<Uint8Array>;
};

type Deps = { editor: () => Editor | null; file: () => LptkFile | null; replace: (file: LptkFile) => void };

let markdown: MarkdownManager | null = null;
const md = () => (markdown ??= new MarkdownManager({ extensions }));

const catalog = (list: CatalogEntry[]) => list.map(({ id, label, description }) => ({ id, label, description }));

// Clauses number themselves after the last "Art. N" heading already in the document.
function nextArticle(content: JSONContent | null) {
  let n = 0;
  const walk = (node: JSONContent) => {
    const m = node.type === "heading" ? /^\D{1,12}?(\d+)\s–/.exec(node.content?.map((c) => c.text ?? "").join("") ?? "") : null;
    if (m) n = Math.max(n, Number(m[1]));
    node.content?.forEach(walk);
  };
  if (content) walk(content);
  return n + 1;
}

function toJSON(content: string | JSONContent): { content: JSONContent; file?: LptkFile } {
  if (typeof content !== "string") {
    if (content.type === "doc") return { content };
    const file = parse(JSON.stringify(content));
    return { content: file.content, file };
  }
  const trimmed = content.trim();
  if (trimmed.startsWith("{")) return toJSON(JSON.parse(trimmed) as JSONContent);
  return { content: md().parse(content) };
}

export function createWriterApi({ editor, file, replace }: Deps): WriterHandle {
  const getJSON = () => editor()?.getJSON() ?? file()?.content ?? null;
  const current = () => {
    const f = file();
    const json = editor()?.getJSON();
    return f && json ? { ...f, content: json } : f;
  };
  return {
    getJSON,
    getFile: current,
    getMarkdown: () => {
      const json = getJSON();
      return json ? md().serialize(json) : "";
    },
    setContent(content) {
      const next = toJSON(content);
      const f = current();
      replace(next.file ?? (f ? { ...f, content: next.content } : newFile(t("Documento senza titolo"), next.content)));
    },
    insertBlock(blockId, data = {}, at = "cursor") {
      const nodes = buildBlock(blockId, loadCompany(), { number: nextArticle(getJSON()), ...data });
      const ed = editor();
      if (ed) {
        const chain = ed.chain().focus();
        (at === "end" ? chain.insertContentAt(ed.state.doc.content.size, nodes) : chain.insertContent(nodes)).run();
        return;
      }
      const f = current();
      replace(f ? { ...f, content: { ...f.content, content: [...(f.content.content ?? []), ...nodes] } } : newFile(t("Documento senza titolo"), doc(nodes)));
    },
    applyTemplate(templateId, data) {
      const { title, content } = buildTemplate(templateId, loadCompany(), data);
      replace(newFile(title, content));
    },
    listTemplates: () => catalog(TEMPLATES),
    listBlocks: () => catalog(BLOCKS),
    exportPdf: () => {
      const f = current();
      return toPdf(getJSON() ?? doc([]), { company: loadCompany(), margins: f?.page.margins, title: f?.title });
    },
  };
}
