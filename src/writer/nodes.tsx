import { useEffect, useState, type ReactNode } from "react";
import { Node, mergeAttributes, type Attribute } from "@tiptap/react";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadCompany, useCompany } from "./company";
import { VAT_RATES, eur, lineTotal, num, parseNumber, totals, type CompanyData, type Item, type PartyAttrs, type SignatureAttrs } from "./model";

// Attributes round-trip through HTML (copy and paste) as JSON in data-* attributes.
const attr = (name: string, def: unknown): Attribute => ({
  default: def,
  parseHTML: (el) => {
    const raw = el.getAttribute(`data-${name}`);
    if (raw === null) return def;
    try {
      return JSON.parse(raw);
    } catch {
      return def;
    }
  },
  renderHTML: (a) => ({ [`data-${name}`]: JSON.stringify(a[name]) }),
});

function atom(name: string, attrs: Record<string, Attribute>, view: (p: NodeViewProps) => ReactNode, markdown: (attrs: any) => string) {
  return Node.create({
    name,
    group: "block",
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes: () => attrs,
    parseHTML: () => [{ tag: `div[data-type="${name}"]` }],
    renderHTML: ({ HTMLAttributes }) => ["div", mergeAttributes(HTMLAttributes, { "data-type": name })],
    addNodeView: () => ReactNodeViewRenderer(view),
    renderMarkdown: (node) => markdown(node.attrs ?? {}),
  });
}

/* ---------- plain-text renderings, used by getMarkdown() ---------- */

const companyText = (c: CompanyData) =>
  [`**${c.name || "[Ragione sociale]"}**`, c.address, [c.vat && `P.IVA ${c.vat}`, c.taxCode && c.taxCode !== c.vat && `C.F. ${c.taxCode}`].filter(Boolean).join(" · "), [c.email, c.phone].filter(Boolean).join(" · ")]
    .filter(Boolean)
    .join("  \n");

const partyText = (a: PartyAttrs) => [a.label, `**${a.name}**`, a.address, a.vat && `P.IVA / C.F. ${a.vat}`, a.email].filter(Boolean).join("  \n");

function itemsText(items: Item[]) {
  const t = totals(items);
  const rows = items.map((it) => `| ${it.description.replace(/\|/g, "\\|")} | ${num(it.qty)} | ${eur(it.price)} | ${it.vat}% | ${eur(lineTotal(it))} |`);
  const sums = [`Imponibile: ${eur(t.net)}`, ...t.vat.map((v) => `IVA ${v.rate}% su ${eur(v.base)}: ${eur(v.tax)}`), `**Totale: ${eur(t.total)}**`];
  return ["| Descrizione | Q.tà | Prezzo unit. | IVA | Importo |", "| --- | ---: | ---: | ---: | ---: |", ...rows, "", sums.join("  \n")].join("\n");
}

const paymentText = (terms: string, c: CompanyData) => ["**Condizioni di pagamento**", terms, `IBAN ${c.iban || "[IBAN]"}${c.name ? ` intestato a ${c.name}` : ""}`].filter(Boolean).join("  \n");

const signatureText = (a: SignatureAttrs) => [[a.place, a.date].filter(Boolean).length ? `Luogo e data: ${[a.place, a.date].filter(Boolean).join(", ")}` : "", a.labels.map((l) => `${l}: ____________________`).join("    ")].filter(Boolean).join("\n\n");

/* ---------- on-paper fields ---------- */

// Paper is always white, so on-paper colours are fixed rather than theme tokens. Empty fields keep the form-field tint so they read as "to fill".
const fieldBase =
  "w-full min-w-0 rounded-[2px] bg-transparent px-1 -mx-1 outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-black/35 read-only:pointer-events-none hover:bg-[color-mix(in_oklch,var(--ink)_8%,transparent)] focus:bg-[color-mix(in_oklch,var(--ink)_6%,transparent)] focus:ring-2 focus:ring-ink/60 placeholder-shown:bg-[color-mix(in_oklch,var(--ink)_8%,transparent)]";

// `fit` sizes the field to its text, for fields that sit inline in a sentence.
function Field({ value, onChange, placeholder, className, readOnly, fit }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; readOnly?: boolean; fit?: boolean }) {
  return (
    <input
      size={fit ? Math.max(value.length, placeholder?.length ?? 1, 1) : undefined}
      className={cn(fieldBase, fit && "mx-0 w-auto [field-sizing:content]", className)}
      value={value}
      placeholder={placeholder}
      readOnly={readOnly}
      spellCheck={!readOnly}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// Keeps the typed text while editing so "1," does not snap to "1"; commits only valid numbers.
function NumberField({ value, onChange, readOnly, money }: { value: number; onChange: (n: number) => void; readOnly?: boolean; money?: boolean }) {
  const shown = money ? eur(value) : num(value);
  const [draft, setDraft] = useState<string | null>(null);
  const invalid = draft !== null && parseNumber(draft) === null;
  return (
    <input
      inputMode="decimal"
      className={cn(fieldBase, "text-right tabular-nums", invalid && "ring-2 ring-destructive/60")}
      value={draft ?? shown}
      readOnly={readOnly}
      onFocus={() => setDraft(money ? String(value).replace(".", ",") : num(value))}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseNumber(e.target.value);
        if (n !== null) onChange(n);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

function Block({ selected, children, className, label }: { selected: boolean; children: ReactNode; className?: string; label: string }) {
  return (
    <NodeViewWrapper aria-label={label} className={cn("writer-block relative my-[6pt] rounded-[3px] outline-offset-4 transition-[outline-color] duration-150", selected ? "outline-[1.5px] outline-ink outline" : "outline outline-transparent", className)}>
      {children}
    </NodeViewWrapper>
  );
}

// Chrome on the paper (add row, remove) only exists while editing; read-only previews show the printed result.
function PaperButton({ onClick, label, children, className }: { onClick: () => void; label: string; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-[6px] px-1.5 font-sans text-[12px] text-black/55 transition-[background-color,color,scale] duration-150 hover:bg-black/[0.06] hover:text-black/85 active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-ink/60 outline-none [&_svg]:size-3.5 [&_svg]:stroke-[1.75]",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ---------- views ---------- */

function CompanyHeaderView({ selected, editor }: NodeViewProps) {
  const c = useCompany();
  const ids = [c.vat && `P.IVA ${c.vat}`, c.taxCode && c.taxCode !== c.vat && `C.F. ${c.taxCode}`].filter(Boolean).join("  ·  ");
  const contacts = [c.email, c.phone].filter(Boolean).join("  ·  ");
  return (
    <Block selected={selected && editor.isEditable} label="Intestazione aziendale" className="mb-[18pt]">
      <div className="flex items-start justify-between gap-6 border-b-[0.5pt] border-[#cfcfd4] pb-[10pt]">
        <div className="min-w-0">
          <div className="text-[13pt] font-bold">{c.name || <span className="text-black/35">[Ragione sociale]</span>}</div>
          <div className="mt-[3pt] text-[9pt] leading-[1.35] text-[#6b6b70]">
            <div>{c.address || "[Indirizzo]"}</div>
            {ids && <div>{ids}</div>}
            {contacts && <div>{contacts}</div>}
          </div>
          {!c.name && <div className="mt-1 font-sans text-[12px] text-[oklch(0.46_0.2_266)]">Completa i dati aziendali nelle Impostazioni.</div>}
        </div>
        {c.logo && <img src={c.logo} alt="" className="max-h-[48pt] max-w-[130pt] object-contain" />}
      </div>
    </Block>
  );
}

function PartyView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const a = node.attrs as PartyAttrs;
  const ro = !editor.isEditable;
  const set = (k: keyof PartyAttrs) => (v: string) => updateAttributes({ [k]: v });
  return (
    <Block selected={selected && editor.isEditable} label="Dati cliente" className="mb-[18pt] ml-[50%]">
      <Field value={a.label} onChange={set("label")} placeholder="Spett.le" readOnly={ro} className="text-[9pt] text-[#6b6b70]" />
      <Field value={a.name} onChange={set("name")} placeholder="Ragione sociale" readOnly={ro} className="font-bold" />
      <Field value={a.address} onChange={set("address")} placeholder="Indirizzo" readOnly={ro} />
      <div className="flex items-baseline">
        <span className="shrink-0 pr-1.5">P.IVA / C.F.</span>
        <Field value={a.vat} onChange={set("vat")} placeholder="IT01234567890" readOnly={ro} />
      </div>
      <Field value={a.email} onChange={set("email")} placeholder="email o PEC" readOnly={ro} />
    </Block>
  );
}

function ItemsTableView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const items = node.attrs.items as Item[];
  const ro = !editor.isEditable;
  const t = totals(items);
  const setItem = (i: number, patch: Partial<Item>) => updateAttributes({ items: items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const head = "pb-[4pt] text-[9pt] font-normal text-[#6b6b70]";
  return (
    <Block selected={selected && editor.isEditable} label="Tabella voci" className="mb-[14pt]">
      <table className="w-full table-fixed border-collapse tabular-nums">
        <colgroup>
          <col />
          <col className="w-[40pt]" />
          <col className="w-[72pt]" />
          <col className="w-[40pt]" />
          <col className="w-[76pt]" />
        </colgroup>
        <thead>
          <tr className="border-b-[0.75pt] border-[#cfcfd4]">
            <th className={cn(head, "text-left")}>Descrizione</th>
            <th className={cn(head, "text-right")}>Q.tà</th>
            <th className={cn(head, "text-right")}>Prezzo unit.</th>
            <th className={cn(head, "text-right")}>IVA</th>
            <th className={cn(head, "text-right")}>Importo</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="group/row border-b-[0.5pt] border-[#cfcfd4]">
              <td className="relative py-[4pt] pr-[6pt]">
                <Field value={it.description} onChange={(description) => setItem(i, { description })} placeholder="Descrizione" readOnly={ro} />
              </td>
              <td className="py-[4pt] pl-[6pt]">
                <NumberField value={it.qty} onChange={(qty) => setItem(i, { qty })} readOnly={ro} />
              </td>
              <td className="py-[4pt] pl-[6pt]">
                <NumberField value={it.price} onChange={(price) => setItem(i, { price })} readOnly={ro} money />
              </td>
              <td className="py-[4pt] pl-[6pt] text-right">
                {ro ? (
                  `${it.vat}%`
                ) : (
                  <select
                    aria-label="Aliquota IVA"
                    value={it.vat}
                    onChange={(e) => setItem(i, { vat: Number(e.target.value) })}
                    className={cn(fieldBase, "cursor-pointer appearance-none text-right")}
                  >
                    {[...new Set([...VAT_RATES, it.vat])].map((r) => (
                      <option key={r} value={r}>
                        {r}%
                      </option>
                    ))}
                  </select>
                )}
              </td>
              <td className="relative py-[4pt] pl-[6pt] text-right">
                {eur(lineTotal(it))}
                {!ro && (
                  <PaperButton
                    label="Rimuovi voce"
                    onClick={() => updateAttributes({ items: items.filter((_, j) => j !== i) })}
                    className="absolute top-1/2 -right-8 size-6 -translate-y-1/2 justify-center px-0 opacity-0 transition-[opacity,background-color,color,scale] group-hover/row:opacity-100 focus-visible:opacity-100"
                  >
                    <X />
                  </PaperButton>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-[6pt] flex items-start justify-between gap-6">
        <div>
          {!ro && (
            <PaperButton label="Aggiungi voce" onClick={() => updateAttributes({ items: [...items, { description: "", qty: 1, price: 0, vat: items.at(-1)?.vat ?? 22 }] })}>
              <Plus /> Aggiungi voce
            </PaperButton>
          )}
        </div>
        <dl className="w-[220pt] tabular-nums">
          <div className="flex justify-between py-[3pt]">
            <dt className="text-[#6b6b70]">Imponibile</dt>
            <dd>{eur(t.net)}</dd>
          </div>
          {t.vat.map((v) => (
            <div key={v.rate} className="flex justify-between py-[3pt]">
              <dt className="text-[#6b6b70]">
                IVA {v.rate}% su {eur(v.base)}
              </dt>
              <dd>{eur(v.tax)}</dd>
            </div>
          ))}
          <div className="mt-[2pt] flex justify-between border-t-[0.75pt] border-[#cfcfd4] pt-[4pt] text-[12pt] font-bold">
            <dt>Totale</dt>
            <dd>{eur(t.total)}</dd>
          </div>
        </dl>
      </div>
    </Block>
  );
}

function PaymentInfoView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const c = useCompany();
  return (
    <Block selected={selected && editor.isEditable} label="Condizioni di pagamento" className="mb-[12pt]">
      <div className="mt-[4pt] mb-[4pt] text-[11.5pt] font-bold">Condizioni di pagamento</div>
      <AutoTextarea value={node.attrs.terms as string} onChange={(terms) => updateAttributes({ terms })} readOnly={!editor.isEditable} placeholder="Termini di pagamento" />
      <div className="mt-[3pt] tabular-nums">
        <span className="text-[#6b6b70]">IBAN&nbsp;&nbsp;</span>
        {c.iban || <span className="text-black/35">[IBAN]</span>}
        {c.name && <span className="text-[#6b6b70]">&nbsp;&nbsp;·&nbsp;&nbsp;intestato a {c.name}</span>}
      </div>
    </Block>
  );
}

function AutoTextarea({ value, onChange, readOnly, placeholder }: { value: string; onChange: (v: string) => void; readOnly?: boolean; placeholder?: string }) {
  const [el, setEl] = useState<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [el, value]);
  return <textarea ref={setEl} rows={1} className={cn(fieldBase, "block resize-none overflow-hidden")} value={value} readOnly={readOnly} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

function SignatureView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const a = node.attrs as SignatureAttrs;
  const ro = !editor.isEditable;
  const labels = a.labels.length ? a.labels : [""];
  const setLabel = (i: number, v: string) => updateAttributes({ labels: labels.map((l, j) => (j === i ? v : l)) });
  const hasWhere = Boolean(a.place || a.date);
  return (
    <Block selected={selected && editor.isEditable} label="Firma" className="group/sig mt-[14pt] mb-[10pt]">
      {(hasWhere || !ro) && (
        // Empty place and date stay out of the way (letters date themselves at the top) until hovered or focused.
        <div className={cn("mb-[14pt] flex items-baseline", !hasWhere && "opacity-0 transition-opacity duration-150 group-hover/sig:opacity-100 focus-within:opacity-100")}>
          <span className="shrink-0 pr-[6pt] text-[#6b6b70]">Luogo e data</span>
          <Field fit value={a.place} onChange={(place) => updateAttributes({ place })} placeholder="Luogo" readOnly={ro} />
          <span>,&nbsp;</span>
          <Field fit value={a.date} onChange={(date) => updateAttributes({ date })} placeholder="gg/mm/aaaa" readOnly={ro} className="tabular-nums" />
        </div>
      )}
      <div className={cn("flex", labels.length === 1 ? "justify-end" : "justify-between")}>
        {labels.map((l, i) => (
          <div key={i} className="relative w-[190pt]">
            <Field value={l} onChange={(v) => setLabel(i, v)} placeholder="Firmatario" readOnly={ro} className="text-center text-[9pt] text-[#6b6b70]" />
            <div className="mt-[34pt] border-b-[0.75pt] border-[#8e8e93]" />
            {!ro && labels.length === 2 && (
              <PaperButton label="Rimuovi firma" onClick={() => updateAttributes({ labels: labels.filter((_, j) => j !== i) })} className="absolute -top-0.5 -right-7 size-6 justify-center px-0 opacity-0 group-hover/sig:opacity-100 focus-visible:opacity-100">
                <X />
              </PaperButton>
            )}
          </div>
        ))}
      </div>
      {!ro && labels.length === 1 && (
        <PaperButton label="Aggiungi firma" onClick={() => updateAttributes({ labels: ["Il cliente", ...labels] })} className="absolute bottom-0 left-0 opacity-0 group-hover/sig:opacity-100 focus-visible:opacity-100">
          <Plus /> Aggiungi firma
        </PaperButton>
      )}
    </Block>
  );
}

/* ---------- nodes ---------- */

export const CompanyHeader = atom("companyHeader", {}, CompanyHeaderView, () => companyText(loadCompany()));

export const Party = atom(
  "party",
  { label: attr("label", "Spett.le"), name: attr("name", ""), address: attr("address", ""), vat: attr("vat", ""), email: attr("email", "") },
  PartyView,
  (a) => partyText(a as unknown as PartyAttrs),
);

export const ItemsTable = atom("itemsTable", { items: attr("items", []) }, ItemsTableView, (a) => itemsText(a.items));

export const PaymentInfo = atom("paymentInfo", { terms: attr("terms", "") }, PaymentInfoView, (a) => paymentText(a.terms, loadCompany()));

export const SignatureBlock = atom("signatureBlock", { labels: attr("labels", ["Il cliente", "Il fornitore"]), place: attr("place", ""), date: attr("date", "") }, SignatureView, (a) =>
  signatureText(a as unknown as SignatureAttrs),
);

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: 'div[data-type="pageBreak"]' }],
  renderHTML: () => ["div", { "data-type": "pageBreak", class: "writer-page-break" }],
  renderMarkdown: () => "<!-- interruzione di pagina -->",
  addKeyboardShortcuts() {
    // Word and Pages: Cmd/Ctrl+Enter breaks the page.
    return { "Mod-Enter": () => this.editor.chain().insertContent({ type: "pageBreak" }).run() };
  },
});

export const CUSTOM_NODES = [CompanyHeader, Party, ItemsTable, PaymentInfo, SignatureBlock, PageBreak];
