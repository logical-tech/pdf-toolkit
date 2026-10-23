import { t as tr } from "../lib/i18n.ts";
import { h, p, pAlign, t, today, type CompanyData, type Item, type JSONContent, type PartyAttrs, type SignatureAttrs } from "./model.ts";

export type BlockData = {
  party?: Partial<PartyAttrs>;
  items?: Item[];
  terms?: string;
  labels?: string[];
  place?: string;
  date?: string;
  title?: string;
  text?: string;
  number?: number;
  days?: number;
};

type Ctx = { company: CompanyData; data: BlockData };
type Block = { id: string; label: string; description: string; build: (ctx: Ctx) => JSONContent[] };

export const SAMPLE_PARTY: PartyAttrs = {
  label: tr("Spett.le"),
  name: tr("[Ragione sociale del cliente]"),
  address: tr("[Via e numero, CAP Città (Prov.)]"),
  vat: tr("[P.IVA / Codice fiscale]"),
  email: tr("[email o PEC]"),
};

export const SAMPLE_ITEMS: Item[] = [
  { description: tr("[Analisi iniziale e definizione dei requisiti]"), qty: 1, price: 600, vat: 22 },
  { description: tr("[Realizzazione e configurazione, ore]"), qty: 20, price: 45, vat: 22 },
  { description: tr("[Formazione del personale, ore]"), qty: 4, price: 50, vat: 22 },
];

export const placeOf = (c: Ctx) => c.data.place ?? (c.company.defaultPlace || tr("[Luogo]"));

export const party = (c: Ctx, label = tr("Spett.le")): JSONContent => ({ type: "party", attrs: { ...SAMPLE_PARTY, label, ...c.data.party } });
export const items = (c: Ctx): JSONContent => ({ type: "itemsTable", attrs: { items: c.data.items ?? SAMPLE_ITEMS } });
export const payment = (c: Ctx, terms = tr("Pagamento tramite bonifico bancario a 30 giorni data fattura.")): JSONContent => ({ type: "paymentInfo", attrs: { terms: c.data.terms ?? terms } });
export const signature = (c: Ctx, labels: string[], withPlace = true): JSONContent => ({
  type: "signatureBlock",
  attrs: { labels: c.data.labels ?? labels, place: withPlace ? placeOf(c) : "", date: withPlace ? (c.data.date ?? today()) : "" } satisfies SignatureAttrs,
});
export const clause = (n: number, title: string, ...body: string[]): JSONContent[] => [h(3, tr("Art. {n} – {title}", { n, title })), ...body.map((s) => p(s))];

export const BLOCKS: Block[] = [
  { id: "intestazione", label: tr("Intestazione aziendale"), description: tr("I dati della tua azienda, presi dalle Impostazioni."), build: () => [{ type: "companyHeader" }] },
  { id: "cliente", label: tr("Dati cliente"), description: tr("Destinatario con ragione sociale, indirizzo, P.IVA ed email."), build: (c) => [party(c, c.data.party?.label)] },
  { id: "voci", label: tr("Tabella voci con totali"), description: tr("Righe con quantità, prezzo e IVA; imponibile, IVA e totale calcolati."), build: (c) => [items(c)] },
  { id: "pagamento", label: tr("Condizioni di pagamento"), description: tr("Termini di pagamento e IBAN dalle Impostazioni."), build: (c) => [payment(c)] },
  { id: "firma", label: tr("Firma"), description: tr("Una o due righe per la firma, con luogo e data."), build: (c) => [signature(c, [tr("Il cliente"), tr("Il fornitore")])] },
  { id: "luogo-data", label: tr("Luogo e data"), description: tr("Una riga con luogo e data di oggi."), build: (c) => [pAlign("right", `${placeOf(c)}, ${c.data.date ?? today()}`)] },
  {
    id: "clausola",
    label: tr("Clausola"),
    description: tr("Articolo numerato con titolo e testo."),
    build: (c) => clause(c.data.number ?? 1, c.data.title ?? tr("[Titolo della clausola]"), c.data.text ?? tr("[Testo della clausola.]")),
  },
  { id: "note", label: tr("Note"), description: tr("Un titolo e uno spazio per le note."), build: (c) => [h(3, c.data.title ?? tr("Note")), p(c.data.text ?? tr("[Eventuali note, tempi di consegna, esclusioni.]"))] },
  {
    id: "validita",
    label: tr("Validità dell'offerta"),
    description: tr("Per quanti giorni vale l'offerta."),
    build: (c) => [
      h(3, tr("Validità dell'offerta")),
      p(tr("La presente offerta è valida "), t(tr("{days} giorni", { days: c.data.days ?? 30 }), "bold"), tr(" dalla data di emissione. I prezzi sono espressi in euro, IVA esclusa salvo diversa indicazione.")),
    ],
  },
];

export type BlockId = (typeof BLOCKS)[number]["id"];

export function buildBlock(id: string, company: CompanyData, data: BlockData = {}): JSONContent[] {
  const block = BLOCKS.find((b) => b.id === id);
  if (!block) throw new Error(`Blocco sconosciuto: ${id}. Disponibili: ${BLOCKS.map((b) => b.id).join(", ")}`);
  return block.build({ company, data });
}
