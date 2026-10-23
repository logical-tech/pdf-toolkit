// Tiptap JSON -> pdfmake document -> PDF bytes. Pure data mapping, no DOM, so it runs in the browser and in Node tests.
import type { Column, Content, ContextPageSize, CustomTableLayout, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import { t } from "../lib/i18n.ts";
import { A4_MM, DEFAULT_MARGINS, eur, lineTotal, num, totals, type CompanyData, type Item, type JSONContent, type Margins, type PartyAttrs, type SignatureAttrs } from "./model.ts";

const PT_PER_MM = 72 / 25.4;
const TEXT = "#1c1c1e";
const MUTED = "#6b6b70";
const RULE = "#cfcfd4";
const SIZES = { body: 10.5, small: 8.5, h1: 18, h2: 14, h3: 11.5 };

type Ctx = { company: CompanyData; width: number };

const hairline: CustomTableLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => RULE,
  vLineColor: () => RULE,
  paddingLeft: () => 5,
  paddingRight: () => 5,
  paddingTop: () => 4,
  paddingBottom: () => 4,
};

function inlines(nodes: JSONContent[] = []): Content[] {
  return nodes.flatMap((n): Content[] => {
    if (n.type === "hardBreak") return [{ text: "\n" }];
    if (n.type !== "text" || !n.text) return [];
    const marks = new Set((n.marks ?? []).map((m) => m.type));
    const link = n.marks?.find((m) => m.type === "link")?.attrs?.href as string | undefined;
    const decoration = [marks.has("underline") || link ? "underline" : null, marks.has("strike") ? "lineThrough" : null].filter(Boolean) as ("underline" | "lineThrough")[];
    return [{ text: n.text, bold: marks.has("bold") || undefined, italics: marks.has("italic") || undefined, decoration: decoration.length ? decoration : undefined, link, color: link ? "#2a4fd6" : undefined }];
  });
}

const align = (n: JSONContent) => (n.attrs?.textAlign as "left" | "center" | "right" | "justify" | undefined) ?? undefined;

function paragraph(n: JSONContent): Content {
  const text = inlines(n.content);
  return { text: text.length ? text : " ", alignment: align(n), margin: [0, 0, 0, 6] };
}

const blocks = (nodes: JSONContent[] = [], ctx: Ctx): Content[] => nodes.flatMap((n) => block(n, ctx));

function table(n: JSONContent, ctx: Ctx): Content {
  const rows = n.content ?? [];
  const grid: TableCell[][] = rows.map(() => []);
  rows.forEach((row, r) => {
    let c = 0;
    for (const cell of row.content ?? []) {
      while (grid[r][c] !== undefined) c++;
      const cs = (cell.attrs?.colspan as number) || 1;
      const rs = Math.min((cell.attrs?.rowspan as number) || 1, rows.length - r);
      grid[r][c] = { stack: blocks(cell.content, ctx), colSpan: cs > 1 ? cs : undefined, rowSpan: rs > 1 ? rs : undefined, bold: cell.type === "tableHeader" || undefined, fillColor: cell.type === "tableHeader" ? "#f3f3f5" : undefined };
      for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) if (i || j) grid[r + i][c + j] = {};
      c += cs;
    }
  });
  const cols = Math.max(1, ...grid.map((r) => r.length));
  const body = grid.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? { text: "" }));
  return { table: { widths: Array(cols).fill("*"), body, headerRows: rows[0]?.content?.every((c) => c.type === "tableHeader") ? 1 : 0 }, layout: hairline, margin: [0, 2, 0, 10] };
}

function companyHeader(ctx: Ctx): Content {
  const c = ctx.company;
  const ids = [c.vat && t("P.IVA {vat}", { vat: c.vat }), c.taxCode && c.taxCode !== c.vat && t("C.F. {taxCode}", { taxCode: c.taxCode })].filter(Boolean).join("  ·  ");
  const contacts = [c.email, c.phone].filter(Boolean).join("  ·  ");
  const details: Column = {
    width: "*",
    stack: [
      { text: c.name || t("[Ragione sociale]"), bold: true, fontSize: 13, margin: [0, 0, 0, 3] },
      { text: c.address || t("[Indirizzo]"), color: MUTED, fontSize: 9 },
      ids ? { text: ids, color: MUTED, fontSize: 9 } : "",
      contacts ? { text: contacts, color: MUTED, fontSize: 9 } : "",
    ],
  };
  return {
    stack: [
      { columns: c.logo ? [details, { width: "auto", stack: [{ image: c.logo, fit: [130, 48] }] }] : [details], columnGap: 16 },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: ctx.width, y2: 0, lineWidth: 0.5, lineColor: RULE }], margin: [0, 10, 0, 0] },
    ],
    margin: [0, 0, 0, 18],
    unbreakable: true,
  };
}

function party(a: PartyAttrs): Content {
  const stack: Content[] = [
    { text: a.label, color: MUTED, fontSize: 9, margin: [0, 0, 0, 2] },
    { text: a.name, bold: true },
    a.address && { text: a.address },
    a.vat && { text: t("P.IVA / C.F. {vat}", { vat: a.vat }) },
    a.email && { text: a.email },
  ].filter(Boolean) as Content[];
  return { columns: [{ width: "*", text: "" }, { width: "*", stack }], margin: [0, 0, 0, 18], unbreakable: true };
}

function itemsTable(list: Item[]): Content {
  const head = [t("Descrizione"), t("Q.tà"), t("Prezzo unit."), t("IVA"), t("Importo")].map((text, i) => ({ text, color: MUTED, fontSize: 9, alignment: i ? ("right" as const) : undefined }));
  const rows = list.map((it) => [
    { text: it.description || " " },
    { text: num(it.qty), alignment: "right" as const },
    { text: eur(it.price), alignment: "right" as const },
    { text: `${it.vat}%`, alignment: "right" as const },
    { text: eur(lineTotal(it)), alignment: "right" as const },
  ]);
  const tot = totals(list);
  const sums: TableCell[][] = [
    [{ text: t("Imponibile"), color: MUTED }, { text: eur(tot.net), alignment: "right" }],
    ...tot.vat.map((v): TableCell[] => [{ text: t("IVA {rate}% su {base}", { rate: v.rate, base: eur(v.base) }), color: MUTED }, { text: eur(v.tax), alignment: "right" }]),
    [{ text: t("Totale"), bold: true, fontSize: 12 }, { text: eur(tot.total), bold: true, fontSize: 12, alignment: "right" }],
  ];
  return {
    stack: [
      { table: { widths: ["*", 40, 72, 34, 76], headerRows: 1, body: [head, ...rows], dontBreakRows: true }, layout: { ...hairline, vLineWidth: () => 0, hLineWidth: (i) => (i === 0 ? 0 : i === 1 ? 0.75 : 0.5) } },
      {
        columns: [{ width: "*", text: "" }, { width: 220, table: { widths: ["*", "auto"], body: sums }, layout: { ...hairline, vLineWidth: () => 0, hLineWidth: (i) => (i === sums.length - 1 ? 0.75 : 0) } }],
        margin: [0, 6, 0, 0],
        unbreakable: true,
      },
    ],
    margin: [0, 4, 0, 14],
  };
}

function paymentInfo(terms: string, ctx: Ctx): Content {
  const c = ctx.company;
  return {
    stack: [
      { text: t("Condizioni di pagamento"), bold: true, fontSize: SIZES.h3, margin: [0, 4, 0, 4] },
      terms ? { text: terms, margin: [0, 0, 0, 3] } : "",
      { text: [{ text: "IBAN  ", color: MUTED }, { text: c.iban || "[IBAN]" }, c.name ? { text: t("  ·  intestato a {name}", { name: c.name }), color: MUTED } : ""] },
    ],
    margin: [0, 0, 0, 12],
    unbreakable: true,
  };
}

function signatureBlock(a: SignatureAttrs): Content {
  const lineWidth = 190;
  const signer = (label: string): Column => ({
    width: lineWidth,
    stack: [
      { text: label, color: MUTED, fontSize: 9, alignment: "center" },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: lineWidth, y2: 0, lineWidth: 0.75, lineColor: "#8e8e93" }], margin: [0, 34, 0, 0] },
    ],
  });
  const labels = a.labels.length ? a.labels : [""];
  const columns: Column[] = labels.length === 1 ? [{ width: "*", text: "" }, signer(labels[0])] : labels.flatMap((l, i) => (i ? [{ width: "*", text: "" }, signer(l)] : [signer(l)]));
  const where = [a.place, a.date].filter(Boolean).join(", ");
  return {
    stack: [where ? { text: [{ text: t("Luogo e data  "), color: MUTED }, where], margin: [0, 0, 0, 14] } : "", { columns }],
    margin: [0, 14, 0, 10],
    unbreakable: true,
  };
}

function image(n: JSONContent, ctx: Ctx): Content {
  const src = n.attrs?.src as string | undefined;
  if (!src || !/^data:image\/(png|jpe?g);/i.test(src)) return { text: t("[immagine non supportata: usa PNG o JPEG]"), color: MUTED, margin: [0, 0, 0, 6] };
  const w = Number(n.attrs?.width);
  return w ? { image: src, width: Math.min(w * 0.75, ctx.width), margin: [0, 2, 0, 8] } : { image: src, fit: [ctx.width, 420], margin: [0, 2, 0, 8] };
}

function block(n: JSONContent, ctx: Ctx): Content | Content[] {
  switch (n.type) {
    case "paragraph":
      return paragraph(n);
    case "heading": {
      const level = (n.attrs?.level as 1 | 2 | 3) ?? 1;
      const size = level === 1 ? SIZES.h1 : level === 2 ? SIZES.h2 : SIZES.h3;
      return { text: inlines(n.content), bold: true, fontSize: size, alignment: align(n), margin: [0, level === 1 ? 6 : 8, 0, level === 1 ? 8 : 4] };
    }
    case "bulletList":
      return { ul: (n.content ?? []).map((li) => ({ stack: blocks(li.content, ctx) })), margin: [0, 0, 0, 4] };
    case "orderedList":
      return { ol: (n.content ?? []).map((li) => ({ stack: blocks(li.content, ctx) })), start: (n.attrs?.start as number) ?? 1, margin: [0, 0, 0, 4] };
    case "blockquote":
      return {
        table: { widths: ["*"], body: [[{ stack: blocks(n.content, ctx), color: "#48484a" }]] },
        layout: { hLineWidth: () => 0, vLineWidth: (i) => (i === 0 ? 2 : 0), vLineColor: () => RULE, paddingLeft: () => 10, paddingTop: () => 2, paddingBottom: () => 0 },
        margin: [0, 2, 0, 8],
      };
    case "table":
      return table(n, ctx);
    case "image":
      return image(n, ctx);
    case "horizontalRule":
      return { canvas: [{ type: "line", x1: 0, y1: 0, x2: ctx.width, y2: 0, lineWidth: 0.5, lineColor: RULE }], margin: [0, 6, 0, 12] };
    case "pageBreak":
      return { text: "", pageBreak: "after" };
    case "companyHeader":
      return companyHeader(ctx);
    case "party":
      return party(n.attrs as PartyAttrs);
    case "itemsTable":
      return itemsTable((n.attrs?.items as Item[]) ?? []);
    case "paymentInfo":
      return paymentInfo((n.attrs?.terms as string) ?? "", ctx);
    case "signatureBlock":
      return signatureBlock(n.attrs as SignatureAttrs);
    default:
      return n.content ? blocks(n.content, ctx) : [];
  }
}

export function toDocDefinition(content: JSONContent, opts: { company: CompanyData; margins?: Margins; title?: string }): TDocumentDefinitions {
  const m = opts.margins ?? DEFAULT_MARGINS;
  const ctx: Ctx = { company: opts.company, width: (A4_MM.width - m.left - m.right) * PT_PER_MM };
  return {
    pageSize: "A4",
    pageMargins: [m.left * PT_PER_MM, m.top * PT_PER_MM, m.right * PT_PER_MM, m.bottom * PT_PER_MM],
    info: { title: opts.title ?? t("Documento"), creator: "PDF Toolkit" },
    defaultStyle: { font: "Roboto", fontSize: SIZES.body, lineHeight: 1.2, color: TEXT },
    content: blocks(content.content, ctx),
    footer: (current: number, total: number, size: ContextPageSize) => ({
      text: `${current} / ${total}`,
      alignment: "center",
      fontSize: SIZES.small,
      color: MUTED,
      margin: [0, (m.bottom * PT_PER_MM) / 2 - 4, 0, 0],
      width: size.width,
    }),
  };
}

export async function toPdf(content: JSONContent, opts: { company: CompanyData; margins?: Margins; title?: string }): Promise<Uint8Array> {
  // Loaded on first export: pdfmake and its Roboto fonts weigh ~3 MB.
  const [{ default: pdfMake }, { default: vfs }] = await Promise.all([import("pdfmake/build/pdfmake.js"), import("pdfmake/build/vfs_fonts.js")]);
  pdfMake.addVirtualFileSystem(vfs);
  const out: Uint8Array = await pdfMake.createPdf(toDocDefinition(content, opts)).getBuffer();
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}
