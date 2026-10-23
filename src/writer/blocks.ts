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
  label: "Spett.le",
  name: "[Ragione sociale del cliente]",
  address: "[Via e numero, CAP Città (Prov.)]",
  vat: "[P.IVA / Codice fiscale]",
  email: "[email o PEC]",
};

export const SAMPLE_ITEMS: Item[] = [
  { description: "[Analisi iniziale e definizione dei requisiti]", qty: 1, price: 600, vat: 22 },
  { description: "[Realizzazione e configurazione, ore]", qty: 20, price: 45, vat: 22 },
  { description: "[Formazione del personale, ore]", qty: 4, price: 50, vat: 22 },
];

export const placeOf = (c: Ctx) => c.data.place ?? (c.company.defaultPlace || "[Luogo]");

export const party = (c: Ctx, label = "Spett.le"): JSONContent => ({ type: "party", attrs: { ...SAMPLE_PARTY, label, ...c.data.party } });
export const items = (c: Ctx): JSONContent => ({ type: "itemsTable", attrs: { items: c.data.items ?? SAMPLE_ITEMS } });
export const payment = (c: Ctx, terms = "Pagamento tramite bonifico bancario a 30 giorni data fattura."): JSONContent => ({ type: "paymentInfo", attrs: { terms: c.data.terms ?? terms } });
export const signature = (c: Ctx, labels: string[], withPlace = true): JSONContent => ({
  type: "signatureBlock",
  attrs: { labels: c.data.labels ?? labels, place: withPlace ? placeOf(c) : "", date: withPlace ? (c.data.date ?? today()) : "" } satisfies SignatureAttrs,
});
export const clause = (n: number, title: string, ...body: string[]): JSONContent[] => [h(3, `Art. ${n} – ${title}`), ...body.map((s) => p(s))];

export const BLOCKS: Block[] = [
  { id: "intestazione", label: "Intestazione aziendale", description: "I dati della tua azienda, presi dalle Impostazioni.", build: () => [{ type: "companyHeader" }] },
  { id: "cliente", label: "Dati cliente", description: "Destinatario con ragione sociale, indirizzo, P.IVA ed email.", build: (c) => [party(c, c.data.party?.label)] },
  { id: "voci", label: "Tabella voci con totali", description: "Righe con quantità, prezzo e IVA; imponibile, IVA e totale calcolati.", build: (c) => [items(c)] },
  { id: "pagamento", label: "Condizioni di pagamento", description: "Termini di pagamento e IBAN dalle Impostazioni.", build: (c) => [payment(c)] },
  { id: "firma", label: "Firma", description: "Una o due righe per la firma, con luogo e data.", build: (c) => [signature(c, ["Il cliente", "Il fornitore"])] },
  { id: "luogo-data", label: "Luogo e data", description: "Una riga con luogo e data di oggi.", build: (c) => [pAlign("right", `${placeOf(c)}, ${c.data.date ?? today()}`)] },
  {
    id: "clausola",
    label: "Clausola",
    description: "Articolo numerato con titolo e testo.",
    build: (c) => clause(c.data.number ?? 1, c.data.title ?? "[Titolo della clausola]", c.data.text ?? "[Testo della clausola.]"),
  },
  { id: "note", label: "Note", description: "Un titolo e uno spazio per le note.", build: (c) => [h(3, c.data.title ?? "Note"), p(c.data.text ?? "[Eventuali note, tempi di consegna, esclusioni.]")] },
  {
    id: "validita",
    label: "Validità dell'offerta",
    description: "Per quanti giorni vale l'offerta.",
    build: (c) => [
      h(3, "Validità dell'offerta"),
      p("La presente offerta è valida ", t(`${c.data.days ?? 30} giorni`, "bold"), " dalla data di emissione. I prezzi sono espressi in euro, IVA esclusa salvo diversa indicazione."),
    ],
  },
];

export type BlockId = (typeof BLOCKS)[number]["id"];

export function buildBlock(id: string, company: CompanyData, data: BlockData = {}): JSONContent[] {
  const block = BLOCKS.find((b) => b.id === id);
  if (!block) throw new Error(`Blocco sconosciuto: ${id}. Disponibili: ${BLOCKS.map((b) => b.id).join(", ")}`);
  return block.build({ company, data });
}
