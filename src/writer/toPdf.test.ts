import { test } from "node:test";
import assert from "node:assert/strict";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { toPdf } from "./toPdf.ts";
import { TEMPLATES, buildTemplate } from "./templates.ts";
import { totals, eur, parseNumber, doc, EMPTY_COMPANY, type CompanyData } from "./model.ts";
import { parse, serialize, newFile } from "./lptk.ts";

const company: CompanyData = { ...EMPTY_COMPANY, name: "Rossi Studio S.r.l.", address: "Via Roma 1, 20121 Milano (MI)", vat: "IT01234567890", taxCode: "01234567890", email: "info@rossi.it", phone: "+39 02 1234567", iban: "IT60X0542811101000000123456", defaultPlace: "Milano" };

async function pdfText(bytes: Uint8Array) {
  const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: false, verbosity: 0 }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    pages.push(tc.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  return { pages: pdf.numPages, text: pages.join("\n").replace(/\s+/g, " ") };
}

const normalize = (s: string) => s.replace(/\s+/g, " ");

test("totals group VAT by rate and round in cents", () => {
  const t = totals([
    { description: "a", qty: 3, price: 0.1, vat: 22 },
    { description: "b", qty: 2, price: 100, vat: 22 },
    { description: "c", qty: 1, price: 50, vat: 10 },
    { description: "d", qty: 1, price: 19.99, vat: 0 },
  ]);
  assert.equal(t.net, 270.29);
  assert.deepEqual(t.vat, [
    { rate: 22, base: 200.3, tax: 44.07 },
    { rate: 10, base: 50, tax: 5 },
    { rate: 0, base: 19.99, tax: 0 },
  ]);
  assert.equal(t.total, 319.36);
  assert.equal(normalize(eur(1234.5)), "1.234,50 €");
  assert.equal(parseNumber("1.234,5"), 1234.5);
  assert.equal(parseNumber("12.5"), 12.5);
  assert.equal(parseNumber("abc"), null);
});

for (const tpl of TEMPLATES) {
  test(`template ${tpl.id} renders to a valid PDF`, async () => {
    const { title, content } = buildTemplate(tpl.id, company);
    const bytes = await toPdf(content, { company, title });
    assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
    const { text, pages } = await pdfText(bytes);
    assert.ok(text.includes(`1 / ${pages}`), "page number footer");
    if (tpl.id !== "vuoto") assert.ok(text.includes("Rossi Studio S.r.l."), "company header");
    if (tpl.id === "fattura") assert.ok(text.includes("Fattura di cortesia") && text.includes("Sistema di Interscambio"), "courtesy invoice note");
    if (tpl.id === "contratto") for (const s of ["Oggetto", "Durata", "Riservatezza", "Recesso", "Foro competente", "Il Fornitore", "Il Cliente"]) assert.ok(text.includes(s), s);
    if (tpl.id === "preventivo" || tpl.id === "fattura") {
      // SAMPLE_ITEMS: 600 + 20*45 + 4*50 = 1700 net, 374 VAT, 2074 total
      for (const s of ["Imponibile", eur(1700), "IVA 22%", eur(374), "Totale", eur(2074), "IT60X0542811101000000123456"]) assert.ok(text.includes(normalize(s)), s);
    }
  });
}

test("prefilled items, unicode, tables, lists and page breaks reach the PDF", async () => {
  const { content } = buildTemplate("preventivo", company, {
    party: { name: "Café Ünïcode — “Ζήτω” Srl" },
    items: [
      { description: "Sito web", qty: 1, price: 1500, vat: 22 },
      { description: "Libri", qty: 2, price: 10, vat: 4 },
    ],
  });
  content.content!.push(
    { type: "pageBreak" },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Primo punto" }] }] }] },
    {
      type: "table",
      content: [
        { type: "tableRow", content: [{ type: "tableHeader", attrs: { colspan: 2 }, content: [{ type: "paragraph", content: [{ type: "text", text: "Intestazione larga" }] }] }] },
        { type: "tableRow", content: ["A1", "B1"].map((s) => ({ type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: s }] }] })) },
      ],
    },
  );
  const { text, pages } = await pdfText(await toPdf(content, { company }));
  assert.ok(pages >= 2, "page break adds a page");
  for (const s of ["Café Ünïcode — “Ζήτω” Srl", "Primo punto", "Intestazione larga", "B1", "IVA 22% su", eur(330), "IVA 4% su", eur(0.8), eur(1850.8)]) assert.ok(text.includes(normalize(s)), s);
});

test(".lptk round-trips and rejects foreign files", () => {
  const file = newFile("Prova", doc([]));
  assert.deepEqual(parse(serialize(file)), file);
  assert.throws(() => parse("{}"), /non è un documento/);
  assert.throws(() => parse("not json"), /non è leggibile/);
  assert.throws(() => parse(JSON.stringify({ ...file, version: 9 })), /versione/);
});
