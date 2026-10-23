import { buildBlock, clause, items, party, payment, placeOf, signature, type BlockData } from "./blocks.ts";
import { doc, h, p, pAlign, t, today, type CompanyData, type JSONContent } from "./model.ts";

/** Everything a template can prefill; every field is optional and falls back to a bracketed placeholder. */
export type TemplateData = BlockData & { number?: string; subject?: string };

type Template = { id: string; label: string; description: string; build: (c: { company: CompanyData; data: TemplateData }) => JSONContent };

const numberLine = (c: { data: TemplateData }) => p(t("N. ", "bold"), c.data.number ?? "[001/2026]", t("   Data ", "bold"), c.data.date ?? today());

export const TEMPLATES: Template[] = [
  { id: "vuoto", label: "Documento vuoto", description: "Un foglio bianco.", build: () => doc([p()]) },
  {
    id: "preventivo",
    label: "Preventivo",
    description: "Offerta con voci, totali, condizioni e firma per accettazione.",
    build: (c) =>
      doc([
        { type: "companyHeader" },
        party(c),
        h(1, "Preventivo"),
        numberLine(c),
        p(t("Oggetto: ", "bold"), c.data.subject ?? "[Descrizione sintetica della fornitura]"),
        p("Gentile Cliente, a seguito della Sua richiesta Le sottoponiamo la nostra offerta per quanto descritto di seguito."),
        items(c),
        payment(c, "Acconto del 30% all'accettazione dell'offerta, saldo a 30 giorni data fattura, tramite bonifico bancario."),
        ...buildBlock("validita", c.company, c.data),
        ...buildBlock("note", c.company, { text: c.data.text }),
        p("Restiamo a disposizione per qualsiasi chiarimento e porgiamo cordiali saluti."),
        signature(c, ["Il fornitore", "Per accettazione, il cliente"]),
      ]),
  },
  {
    id: "fattura",
    label: "Fattura di cortesia",
    description: "Copia leggibile della fattura elettronica inviata tramite SdI.",
    build: (c) =>
      doc([
        { type: "companyHeader" },
        party(c, "Destinatario"),
        h(1, "Fattura di cortesia"),
        numberLine(c),
        {
          type: "blockquote",
          content: [
            p(
              t("Copia di cortesia, priva di valenza fiscale ai sensi dell'art. 21 del D.P.R. 633/1972. ", "bold"),
              "La fattura valida ai fini fiscali è quella elettronica trasmessa tramite il Sistema di Interscambio (SdI), disponibile nella Sua area riservata del portale dell'Agenzia delle Entrate o all'indirizzo telematico da Lei comunicato.",
            ),
          ],
        },
        items(c),
        payment(c),
        ...buildBlock("note", c.company, { text: c.data.text ?? "[Eventuali riferimenti: ordine, DDT, CIG/CUP.]" }),
      ]),
  },
  {
    id: "contratto",
    label: "Contratto di servizi",
    description: "Accordo generico: parti, oggetto, durata, corrispettivo, recesso, foro.",
    build: (c) => {
      const co = c.company;
      const pt = { ...c.data.party };
      return doc([
        { type: "companyHeader" },
        h(1, "Contratto di prestazione di servizi"),
        p(t("Tra", "bold")),
        p(
          t(co.name || "[Ragione sociale del fornitore]", "bold"),
          `, con sede in ${co.address || "[indirizzo]"}, P.IVA ${co.vat || "[P.IVA]"}, in persona del legale rappresentante [nome e cognome] (di seguito il «Fornitore»)`,
        ),
        p(t("e", "bold")),
        p(
          t(pt.name ?? "[Ragione sociale del cliente]", "bold"),
          `, con sede in ${pt.address ?? "[indirizzo]"}, P.IVA/CF ${pt.vat ?? "[P.IVA / Codice fiscale]"}, in persona di [nome e cognome] (di seguito il «Cliente»),`,
        ),
        p("di seguito congiuntamente le «Parti», si conviene e si stipula quanto segue."),
        ...clause(1, "Oggetto", `Il Fornitore si impegna a prestare in favore del Cliente i seguenti servizi: ${c.data.subject ?? "[descrizione dettagliata dei servizi]"}, secondo le modalità concordate tra le Parti.`),
        ...clause(2, "Durata", "Il presente contratto ha efficacia dalla data di sottoscrizione e durata di [12 mesi]. Alla scadenza potrà essere rinnovato solo per accordo scritto tra le Parti."),
        ...clause(
          3,
          "Corrispettivo e pagamento",
          "Per i servizi di cui all'art. 1 il Cliente corrisponderà al Fornitore l'importo indicato di seguito, oltre IVA di legge, secondo le condizioni di pagamento riportate.",
        ),
        ...(c.data.items ? [items(c)] : []),
        payment(c, "[Importo] € oltre IVA, da corrispondere tramite bonifico bancario entro 30 giorni dal ricevimento della fattura."),
        ...clause(
          4,
          "Obblighi delle Parti",
          "Il Fornitore svolgerà le attività con la diligenza professionale richiesta dalla natura dell'incarico. Il Cliente fornirà tempestivamente le informazioni e la collaborazione necessarie all'esecuzione dei servizi.",
        ),
        ...clause(
          5,
          "Riservatezza",
          "Le Parti si impegnano a mantenere riservate le informazioni di cui vengano a conoscenza nell'esecuzione del contratto e a non divulgarle a terzi, se non nei limiti necessari all'esecuzione stessa o richiesti dalla legge. L'obbligo permane per [2 anni] dalla cessazione del contratto.",
        ),
        ...clause(
          6,
          "Recesso",
          "Ciascuna Parte può recedere dal contratto con preavviso scritto di almeno [30 giorni], da comunicare a mezzo PEC o raccomandata A/R. Restano dovuti i corrispettivi per le attività già svolte alla data di efficacia del recesso.",
        ),
        ...clause(7, "Foro competente", "Per ogni controversia relativa all'interpretazione o all'esecuzione del presente contratto è competente in via esclusiva il Foro di [città]."),
        ...clause(8, "Disposizioni finali", "Qualsiasi modifica al presente contratto dovrà risultare da atto scritto firmato da entrambe le Parti. Per quanto non previsto si rinvia alle norme del Codice civile."),
        signature(c, ["Il Fornitore", "Il Cliente"]),
      ]);
    },
  },
  {
    id: "lettera",
    label: "Lettera",
    description: "Comunicazione su carta intestata, con oggetto e firma.",
    build: (c) =>
      doc([
        { type: "companyHeader" },
        party(c),
        pAlign("right", `${placeOf(c)}, ${c.data.date ?? today()}`),
        p(t("Oggetto: ", "bold"), c.data.subject ?? "[Oggetto della comunicazione]"),
        p(`Gentile ${c.data.party?.name ?? "[nome del destinatario]"},`),
        p(c.data.text ?? "[Con la presente desideriamo informarLa che… Inserisca qui il contenuto principale della comunicazione, in modo chiaro e sintetico.]"),
        p("[Un secondo paragrafo per dettagli, richieste o prossimi passi.]"),
        p("Restando a disposizione per ogni chiarimento, porgiamo cordiali saluti."),
        signature(c, [c.company.name || "[Nome e cognome]"], false),
      ]),
  },
];

export type TemplateId = (typeof TEMPLATES)[number]["id"];

export function buildTemplate(id: string, company: CompanyData, data: TemplateData = {}): { title: string; content: JSONContent } {
  const tpl = TEMPLATES.find((x) => x.id === id);
  if (!tpl) throw new Error(`Modello sconosciuto: ${id}. Disponibili: ${TEMPLATES.map((x) => x.id).join(", ")}`);
  return { title: tpl.id === "vuoto" ? "Documento senza titolo" : tpl.label, content: tpl.build({ company, data }) };
}
