import { PDFDocument } from "@cantoo/pdf-lib";
import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import { locale, t } from "./i18n.ts";

// Readable copy of an Italian e-invoice (FatturaPA / B2B XML, schema 1.2.x): the XML stays the legally valid document.

export const isFattura = (bytes: Uint8Array) => /<(\w+:)?FatturaElettronica[\s>]/.test(new TextDecoder().decode(bytes.subarray(0, 4096)));

type Party = { name: string; ids: string[]; address: string; extra: string[] };
type Line = { n: string; desc: string; qty: string; um: string; price: string; vat: string; total: string };
type Body = {
  kind: string;
  number: string;
  date: string;
  currency: string;
  reasons: string[];
  refs: string[];
  lines: Line[];
  summary: { vat: string; taxable: string; tax: string; note: string }[];
  total: string;
  withholding: string;
  stamp: string;
  payments: { method: string; due: string; amount: string; iban: string; bank: string }[];
  attachments: { name: string; format: string; desc: string; bytes: Uint8Array }[];
};
export type Fattura = { seller: Party; buyer: Party; recipient: string; bodies: Body[] };

const KINDS: Record<string, string> = {
  TD01: t("Fattura"),
  TD02: t("Acconto/anticipo su fattura"),
  TD03: t("Acconto/anticipo su parcella"),
  TD04: t("Nota di credito"),
  TD05: t("Nota di debito"),
  TD06: t("Parcella"),
  TD16: t("Integrazione fattura reverse charge interno"),
  TD17: t("Integrazione/autofattura per acquisto servizi dall'estero"),
  TD18: t("Integrazione per acquisto di beni intracomunitari"),
  TD19: t("Integrazione/autofattura per acquisto di beni"),
  TD20: t("Autofattura"),
  TD24: t("Fattura differita"),
  TD25: t("Fattura differita"),
  TD26: t("Cessione di beni ammortizzabili"),
  TD27: t("Fattura per autoconsumo o cessioni gratuite"),
};
const METHODS: Record<string, string> = {
  MP01: t("Contanti"),
  MP02: t("Assegno"),
  MP05: t("Bonifico"),
  MP08: t("Carta di pagamento"),
  MP12: t("RIBA"),
  MP19: t("SEPA Direct Debit"),
  MP23: t("PagoPA"),
};

// Children by local name, so namespace prefixes (p:, ns2:, none) don't matter.
const kids = (el: Element | undefined, name: string) => (el ? [...el.children].filter((c) => c.localName === name) : []);
const at = (el: Element | undefined, path: string) => path.split("/").reduce<Element | undefined>((e, n) => kids(e, n)[0], el);
const txt = (el: Element | undefined, path: string) => at(el, path)?.textContent?.trim() ?? "";
const all = (el: Element | undefined, path: string) => {
  const parts = path.split("/");
  return parts.reduce<Element[]>((els, n) => els.flatMap((e) => kids(e, n)), el ? [el] : []);
};

// "always": Italian otherwise writes 1342,00 without the thousands dot (the TS lib still types it as boolean).
const money = (v: string, currency = "EUR") => (v ? new Intl.NumberFormat(locale, { style: "currency", currency, useGrouping: "always" as unknown as boolean }).format(Number(v)) : "");
const number = (v: string) => (v ? new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(Number(v)) : "");
const date = (v: string) => (v ? new Date(`${v.slice(0, 10)}T12:00:00`).toLocaleDateString(locale) : "");
const bytesOf = (b64: string) => Uint8Array.from(atob(b64.replace(/\s+/g, "")), (c) => c.charCodeAt(0));

function party(el: Element | undefined): Party {
  const a = at(el, "DatiAnagrafici");
  const name = txt(a, "Anagrafica/Denominazione") || [txt(a, "Anagrafica/Titolo"), txt(a, "Anagrafica/Nome"), txt(a, "Anagrafica/Cognome")].filter(Boolean).join(" ");
  const vat = txt(a, "IdFiscaleIVA/IdCodice");
  const s = at(el, "Sede");
  const street = [txt(s, "Indirizzo"), txt(s, "NumeroCivico")].filter(Boolean).join(", ");
  const city = [txt(s, "CAP"), txt(s, "Comune"), txt(s, "Provincia") && `(${txt(s, "Provincia")})`].filter(Boolean).join(" ");
  return {
    name,
    ids: [vat && `${t("P. IVA")} ${txt(a, "IdFiscaleIVA/IdPaese")}${vat}`, txt(a, "CodiceFiscale") && `${t("C.F.")} ${txt(a, "CodiceFiscale")}`].filter(Boolean),
    address: [street, city, txt(s, "Nazione") !== "IT" ? txt(s, "Nazione") : ""].filter(Boolean).join(" · "),
    extra: [txt(el, "Contatti/Email"), txt(el, "Contatti/Telefono"), txt(a, "RegimeFiscale") && `${t("Regime fiscale")} ${txt(a, "RegimeFiscale")}`].filter(Boolean),
  };
}

export function parseFattura(xml: string): Fattura {
  const root = new DOMParser().parseFromString(xml, "application/xml").documentElement;
  if (root.localName !== "FatturaElettronica") throw new Error(t("Il file non è una fattura elettronica."));
  const head = at(root, "FatturaElettronicaHeader");
  const tx = at(head, "DatiTrasmissione");
  const pec = txt(tx, "PECDestinatario");
  const code = txt(tx, "CodiceDestinatario");
  return {
    seller: party(at(head, "CedentePrestatore")),
    buyer: party(at(head, "CessionarioCommittente")),
    recipient: [code && code !== "0000000" ? `${t("Codice destinatario")} ${code}` : "", pec && `PEC ${pec}`].filter(Boolean).join(" · "),
    bodies: kids(root, "FatturaElettronicaBody").map((b): Body => {
      const g = at(b, "DatiGenerali/DatiGeneraliDocumento");
      const currency = txt(g, "Divisa") || "EUR";
      const kind = txt(g, "TipoDocumento");
      return {
        kind: KINDS[kind] ?? kind,
        number: txt(g, "Numero"),
        date: date(txt(g, "Data")),
        currency,
        reasons: kids(g, "Causale").map((c) => c.textContent?.trim() ?? ""),
        refs: ["DatiOrdineAcquisto", "DatiContratto", "DatiConvenzione", "DatiDDT"].flatMap((k) =>
          kids(at(b, "DatiGenerali"), k).map((d) => [txt(d, "IdDocumento") || txt(d, "NumeroDDT"), date(txt(d, "Data") || txt(d, "DataDDT"))].filter(Boolean).join(t(" del "))),
        ),
        lines: all(b, "DatiBeniServizi/DettaglioLinee").map((l) => ({
          n: txt(l, "NumeroLinea"),
          desc: txt(l, "Descrizione"),
          qty: number(txt(l, "Quantita")),
          um: txt(l, "UnitaMisura"),
          price: money(txt(l, "PrezzoUnitario"), currency),
          vat: Number(txt(l, "AliquotaIVA")) ? `${number(txt(l, "AliquotaIVA"))}%` : txt(l, "Natura") || "0%",
          total: money(txt(l, "PrezzoTotale"), currency),
        })),
        summary: all(b, "DatiBeniServizi/DatiRiepilogo").map((r) => ({
          vat: Number(txt(r, "AliquotaIVA")) ? `${number(txt(r, "AliquotaIVA"))}%` : txt(r, "Natura") || "0%",
          taxable: money(txt(r, "ImponibileImporto"), currency),
          tax: money(txt(r, "Imposta"), currency),
          note: [txt(r, "EsigibilitaIVA") === "S" ? t("Scissione dei pagamenti") : "", txt(r, "RiferimentoNormativo")].filter(Boolean).join(" · "),
        })),
        total: money(txt(g, "ImportoTotaleDocumento"), currency),
        withholding: money(txt(g, "DatiRitenuta/ImportoRitenuta"), currency),
        stamp: money(txt(g, "DatiBollo/ImportoBollo"), currency),
        payments: all(b, "DatiPagamento/DettaglioPagamento").map((p) => ({
          method: METHODS[txt(p, "ModalitaPagamento")] ?? txt(p, "ModalitaPagamento"),
          due: date(txt(p, "DataScadenzaPagamento")),
          amount: money(txt(p, "ImportoPagamento"), currency),
          iban: txt(p, "IBAN"),
          bank: txt(p, "IstitutoFinanziario"),
        })),
        attachments: kids(b, "Allegati").flatMap((a) => {
          try {
            return [{ name: txt(a, "NomeAttachment"), format: txt(a, "FormatoAttachment"), desc: txt(a, "DescrizioneAttachment"), bytes: bytesOf(txt(a, "Attachment")) }];
          } catch {
            return [];
          }
        }),
      };
    }),
  };
}

const MUTED = "#6b6b6b";
const label = (s: string): Content => ({ text: s.toUpperCase(), fontSize: 7, bold: true, color: MUTED, margin: [0, 0, 0, 3] });
const partyBox = (title: string, p: Party): Content => ({
  stack: [label(title), { text: p.name, bold: true, fontSize: 11 }, ...[...p.ids, p.address, ...p.extra].filter(Boolean).map((s) => ({ text: s, fontSize: 8.5, color: "#333" }))],
});
const head = (cells: string[]): TableCell[] => cells.map((c, i) => ({ text: c, bold: true, fontSize: 8, color: MUTED, alignment: i ? "right" : "left" }));
const lines = { hLineWidth: (i: number) => (i === 1 ? 0.8 : 0.3), vLineWidth: () => 0, hLineColor: () => "#cfcfcf", paddingTop: () => 4, paddingBottom: () => 4 };

export function fatturaDoc(f: Fattura): TDocumentDefinitions {
  const content: Content[] = f.bodies.flatMap((b, i): Content[] => [
    { text: `${b.kind} ${t("n.")} ${b.number}`, fontSize: 18, bold: true, ...(i ? { pageBreak: "before" as const } : {}) },
    { text: [t("del {date}", { date: b.date }), f.recipient && ` · ${f.recipient}`].filter(Boolean).join(""), color: MUTED, fontSize: 9, margin: [0, 2, 0, 16] },
    { columns: [partyBox(t("Cedente / prestatore"), f.seller), partyBox(t("Cessionario / committente"), f.buyer)], columnGap: 24, margin: [0, 0, 0, 16] },
    ...(b.reasons.length ? [label(t("Causale")), { text: b.reasons.join(" "), fontSize: 9, margin: [0, 0, 0, 12] } as Content] : []),
    ...(b.refs.length ? [{ text: `${t("Riferimenti")}: ${b.refs.join("; ")}`, fontSize: 8.5, color: "#333", margin: [0, 0, 0, 12] } as Content] : []),
    {
      table: {
        headerRows: 1,
        widths: ["*", "auto", "auto", "auto", "auto"],
        body: [
          head([t("Descrizione"), t("Quantità"), t("Prezzo"), t("IVA"), t("Importo")]),
          ...b.lines.map((l) => [
            { text: l.desc, fontSize: 9 },
            { text: [l.qty, l.um].filter(Boolean).join(" "), fontSize: 9, alignment: "right" as const },
            { text: l.price, fontSize: 9, alignment: "right" as const },
            { text: l.vat, fontSize: 9, alignment: "right" as const },
            { text: l.total, fontSize: 9, alignment: "right" as const },
          ]),
        ],
      },
      layout: lines,
      margin: [0, 0, 0, 16],
    },
    {
      columns: [
        {
          width: "*",
          stack: [
            label(t("Riepilogo IVA")),
            {
              table: {
                widths: ["auto", "auto", "auto", "*"],
                body: [head([t("Aliquota"), t("Imponibile"), t("Imposta"), ""]), ...b.summary.map((r) => [r.vat, r.taxable, r.tax, r.note].map((s, k) => ({ text: s, fontSize: 8.5, alignment: k && k < 3 ? ("right" as const) : ("left" as const) })))],
              },
              layout: lines,
            },
          ],
        },
        {
          width: 190,
          table: {
            widths: ["*", "auto"],
            body: [
              ...(b.withholding ? [[t("Ritenuta"), `− ${b.withholding}`]] : []),
              ...(b.stamp ? [[t("Bollo"), b.stamp]] : []),
              [{ text: t("Totale documento"), bold: true }, { text: b.total, bold: true, fontSize: 13 }],
            ].map((r) => r.map((c, k) => (typeof c === "string" ? { text: c, fontSize: 9, alignment: k ? ("right" as const) : ("left" as const) } : { ...c, alignment: k ? ("right" as const) : ("left" as const) }))),
          },
          layout: "noBorders",
        },
      ],
      columnGap: 24,
      margin: [0, 0, 0, 16],
    },
    ...(b.payments.length
      ? [
          label(t("Pagamento")),
          ...b.payments.map((p) => ({ text: [p.method, p.amount, p.due && t("scadenza {date}", { date: p.due }), p.iban && `IBAN ${p.iban}`, p.bank].filter(Boolean).join(" · "), fontSize: 9, margin: [0, 0, 0, 2] }) as Content),
        ]
      : []),
    ...(b.attachments.length ? [{ text: `${t("Allegati")}: ${b.attachments.map((a) => a.name).join(", ")}`, fontSize: 8.5, color: "#333", margin: [0, 12, 0, 0] } as Content] : []),
  ]);
  return {
    pageSize: "A4",
    pageMargins: [40, 40, 40, 50],
    defaultStyle: { font: "Roboto", fontSize: 10, lineHeight: 1.2 },
    content,
    footer: (page, pages) => ({
      columns: [
        { text: t("Copia leggibile della fattura elettronica: il documento valido è il file XML, allegato a questo PDF."), fontSize: 7, color: MUTED },
        { text: `${page} / ${pages}`, fontSize: 7, color: MUTED, alignment: "right", width: 40 },
      ],
      margin: [40, 20, 40, 0],
    }),
  };
}

// The readable PDF, carrying the original XML and the invoice's non-PDF attachments as file attachments;
// PDF attachments come back separately so they can follow the invoice as pages.
export async function fatturaToPdf(xmlBytes: Uint8Array, name: string): Promise<{ pdf: Uint8Array; pdfs: { name: string; bytes: Uint8Array }[] }> {
  const f = parseFattura(new TextDecoder().decode(xmlBytes));
  // Loaded on first use, like the writer's export: pdfmake and its fonts weigh ~3 MB.
  const [{ default: pdfMake }, { default: vfs }] = await Promise.all([import("pdfmake/build/pdfmake.js"), import("pdfmake/build/vfs_fonts.js")]);
  pdfMake.addVirtualFileSystem(vfs);
  const made: Uint8Array = await pdfMake.createPdf(fatturaDoc(f)).getBuffer();
  const doc = await PDFDocument.load(made);
  const b = f.bodies[0];
  doc.setTitle(b ? `${b.kind} ${b.number} – ${f.seller.name}` : name);
  await doc.attach(xmlBytes, name, { mimeType: "application/xml", description: t("Fattura elettronica originale") });
  const all = f.bodies.flatMap((x) => x.attachments);
  const isPdf = (a: (typeof all)[number]) => /pdf/i.test(a.format) || /\.pdf$/i.test(a.name);
  for (const a of all.filter((a) => !isPdf(a))) await doc.attach(a.bytes, a.name || "allegato", { description: a.desc });
  return { pdf: await doc.save(), pdfs: all.filter(isPdf).map((a) => ({ name: a.name || "allegato.pdf", bytes: a.bytes })) };
}
