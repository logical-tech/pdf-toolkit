// MCP tools for the document writer: the AI fills templates and blocks instead of generating layout code.
import { fail, schema, text, type Tool } from "@/lib/mcp-tools";
import type { WriterHandle } from "./api";
import { BLOCKS } from "./blocks";
import { loadCompany } from "./company";
import { newFile, type LptkFile } from "./lptk";
import { TEMPLATES, buildTemplate } from "./templates";

// What App.tsx lends: the mounted writer (null until a document is open) and the app-level actions.
export type WriterMcpContext = {
  handle: () => WriterHandle | null;
  create: (file: LptkFile) => Promise<boolean>;
  save: () => Promise<string>;
  exportPdf: (openInEditor: boolean) => Promise<string>;
};

const party = schema({ label: { type: "string" }, name: { type: "string" }, address: { type: "string" }, vat: { type: "string" }, email: { type: "string" } });
const items = { type: "array", items: schema({ description: { type: "string" }, qty: { type: "number" }, price: { type: "number", description: "Prezzo unitario IVA esclusa, in euro" }, vat: { type: "number", description: "Aliquota IVA %, es. 22" } }, ["description", "qty", "price", "vat"]) };
const data = {
  type: "object",
  description: "Valori per riempire il template o il blocco; quelli assenti restano come segnaposto [tra parentesi quadre].",
  properties: {
    party,
    items,
    number: { type: ["string", "number"], description: "Numero del documento (template) o dell'articolo (clausola)" },
    subject: { type: "string" },
    date: { type: "string", description: "gg/mm/aaaa" },
    place: { type: "string" },
    terms: { type: "string", description: "Condizioni di pagamento" },
    labels: { type: "array", items: { type: "string" }, description: "Didascalie delle righe di firma" },
    title: { type: "string" },
    text: { type: "string" },
    days: { type: "number", description: "Giorni di validità" },
  },
  additionalProperties: false,
};

export function writerTools(ctx: WriterMcpContext): Tool[] {
  const open = () => {
    const h = ctx.handle();
    if (!h?.getFile()) throw new Error("Nessun documento aperto nell'editor di testo: creane uno con document_new.");
    return h;
  };
  const catalog = (list: { id: string; label: string; description: string }[]) => list.map((e) => `- ${e.id}: ${e.label}. ${e.description}`).join("\n");
  return [
    {
      name: "document_catalog",
      title: "Template e blocchi",
      description: "List the writer's templates (quote, courtesy invoice, contract, letter…) and prefab blocks (company header, client, line items with totals, payment, signature…). Company data comes from the user's settings.",
      inputSchema: schema({}),
      annotations: { readOnlyHint: true },
      run: async () => text(`Template:\n${catalog(TEMPLATES)}\n\nBlocchi:\n${catalog(BLOCKS)}`),
    },
    {
      name: "document_new",
      title: "Nuovo documento",
      description: "Create a new text document from a template, prefilled with `data`, and show it in the app's writer. Totals in line-item tables are computed by the app. If the open document has unsaved changes the user is asked first.",
      inputSchema: schema({ template: { type: "string", enum: TEMPLATES.map((t) => t.id) }, data }, ["template"]),
      run: async (a) => {
        const { title, content } = buildTemplate(String(a.template), loadCompany(), (a.data ?? {}) as never);
        return (await ctx.create(newFile(title, content))) ? text(`Creato "${title}".`) : fail("L'utente ha annullato.");
      },
    },
    {
      name: "document_read",
      title: "Leggi il documento",
      description: "The open text document as Markdown (custom blocks rendered as text and tables).",
      inputSchema: schema({}),
      annotations: { readOnlyHint: true },
      run: async () => text(open().getMarkdown() || "(vuoto)"),
    },
    {
      name: "document_write",
      title: "Riscrivi il documento",
      description: "Replace the whole content of the open text document with Markdown (headings, bold/italic, lists, tables, paragraphs). Read it first: custom blocks you omit are removed. Undo restores it.",
      inputSchema: schema({ markdown: { type: "string" } }, ["markdown"]),
      run: async (a) => (open().setContent(String(a.markdown)), text("Contenuto aggiornato.")),
    },
    {
      name: "document_insert_block",
      title: "Inserisci un blocco",
      description: "Insert a prefab block (see document_catalog) at the cursor or at the end of the open text document.",
      inputSchema: schema({ block: { type: "string", enum: BLOCKS.map((b) => b.id) }, data, at: { type: "string", enum: ["cursor", "end"], default: "end" } }, ["block"]),
      run: async (a) => (open().insertBlock(String(a.block), (a.data ?? {}) as never, a.at === "cursor" ? "cursor" : "end"), text("Blocco inserito.")),
    },
    {
      name: "document_save",
      title: "Salva il documento",
      description: "Save the open text document (.lptk) over its file; if it has none yet the user picks where in the system dialog.",
      inputSchema: schema({}),
      run: async () => (open(), text(await ctx.save())),
    },
    {
      name: "document_export_pdf",
      title: "Esporta in PDF",
      description: "Export the open text document as PDF. With open_in_editor the PDF opens in the app's PDF editor (to sign it or use the PDF tools) without asking for a location; otherwise the user picks where to save it.",
      inputSchema: schema({ open_in_editor: { type: "boolean", default: false } }),
      run: async (a) => (open(), text(await ctx.exportPdf(a.open_in_editor === true))),
    },
  ];
}
