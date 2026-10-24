import { useState } from "react";
import { CalendarDays, Combine, Copy, EyeOff, FileDown, FilePlus2, Loader2, PenLine, Plus, ScanText, Shrink, Type, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PATTERNS, type Pattern } from "@/lib/redact";
import { Segmented } from "@/components/Chrome";
import type { Compression } from "@/lib/tools";
import { t } from "@/lib/i18n";
import barOcean from "@/assets/dither-bar-ocean.png";
import barLime from "@/assets/dither-bar-lime.png";

// A finished job shows a strip of the brand dither instead of a plain check.
const DoneBar = ({ src }: { src: string }) => <img src={src} alt="" aria-hidden className="h-[29px] w-full [image-rendering:pixelated]" />;

export type Task = "sign" | "compress" | "merge" | "ocr" | "redact";

export const TASKS: { task: Task; title: string; icon: LucideIcon }[] = [
  { task: "sign", title: t("Firma PDF"), icon: PenLine },
  { task: "compress", title: t("Comprimi PDF"), icon: Shrink },
  { task: "merge", title: t("Unisci PDF"), icon: Combine },
  { task: "ocr", title: t("Rendi ricercabile"), icon: ScanText },
  { task: "redact", title: t("Oscura dati"), icon: EyeOff },
];

const mb = (bytes: number) => (bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`);

type Props = {
  task: Task;
  busy: boolean;
  ghostscript: boolean;
  pages: number;
  size: number; // bytes of the opened file(s)
  ocrPages: number;
  signatures: string[];
  onNewSignature: () => void;
  onManageSignatures: () => void;
  canRepeat: boolean;
  onRepeat: () => void;
  onRedact: (query: string, patterns: Pattern[]) => Promise<{ found: number; pages: number }>;
  onPlaceSignature: (src: string) => void;
  onDate: () => void;
  onText: () => void;
  onAddPdf: () => void;
  onOcr: () => void;
  onCompress: (level: Compression) => Promise<number | null>;
  onSave: () => void;
  onClose: () => void;
};

// Floating right panel that walks through one action on the open document; closing it leaves the full editor.
export function TaskPanel(p: Props) {
  const [level, setLevel] = useState<Compression>("medium");
  const [compressed, setCompressed] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [redacted, setRedacted] = useState<{ found: number; pages: number } | null>(null);
  const title = TASKS.find((x) => x.task === p.task)!.title;
  const save = (
    <Button className="h-9 w-full rounded-full" disabled={p.busy} onClick={p.onSave}>
      {p.busy ? <Loader2 className="animate-spin" /> : <FileDown />} {t("Salva PDF…")}
    </Button>
  );

  return (
    <aside className="float-panel float-enter fixed top-[60px] right-3 z-10 flex max-h-[calc(100%-140px)] w-72 flex-col gap-5 overflow-y-auto rounded-[14px] p-4 text-[13px]">
      <div className="flex items-center justify-between">
        <h2 className="title-serif">{title}</h2>
        <Button variant="ghost" size="icon-sm" aria-label={t("Chiudi")} title={t("Torna all'editor completo")} onClick={p.onClose}>
          <X />
        </Button>
      </div>

      {p.task === "sign" && (
        <>
          <section className="grid gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-muted-foreground">{t("Scegli una firma, poi clicca sulla pagina dove vuoi metterla.")}</p>
              <button className="shrink-0 text-xs font-medium text-ink outline-none hover:underline focus-visible:underline" onClick={p.onManageSignatures}>
                {t("Gestisci")}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {p.signatures.map((s) => (
                <button key={s} className="flex h-16 items-center justify-center rounded-[10px] border bg-white p-1.5 transition-colors duration-150 hover:border-foreground/40" onClick={() => p.onPlaceSignature(s)}>
                  <img src={s} alt={t("Firma salvata")} className="max-h-full max-w-full" />
                </button>
              ))}
              <button className="flex h-16 flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed text-xs text-muted-foreground transition-colors duration-150 hover:bg-accent" onClick={p.onNewSignature}>
                <Plus className="size-4" /> {t("Nuova firma")}
              </button>
            </div>
          </section>
          <section className="grid gap-2">
            <p className="text-muted-foreground">{t("Per siglare ogni foglio: metti la sigla su una pagina, selezionala e ripetila sulle altre.")}</p>
            <Button variant="secondary" className="rounded-full" disabled={!p.canRepeat} onClick={p.onRepeat}>
              <Copy /> {t("Ripeti su tutte le pagine")}
            </Button>
          </section>
          <section className="grid grid-cols-2 gap-2">
            <Button variant="secondary" className="rounded-full" onClick={p.onDate}>
              <CalendarDays /> {t("Data")}
            </Button>
            <Button variant="secondary" className="rounded-full" onClick={p.onText}>
              <Type /> {t("Testo")}
            </Button>
          </section>
          {save}
        </>
      )}

      {p.task === "compress" && (
        <>
          <section className="grid gap-3">
            <Segmented
              value={level}
              onChange={(l) => (setLevel(l), setCompressed(null))}
              options={[
                { value: "medium", label: t("Media") },
                { value: "strong", label: t("Forte") },
              ]}
            />
            <p className="text-muted-foreground">{level === "medium" ? t("Buona qualità, adatta alla stampa.") : t("File più leggero, immagini meno nitide.")}</p>
            {!p.ghostscript && <p className="text-xs text-muted-foreground">{t("Installa Ghostscript per comprimere anche caratteri e immagini non JPEG.")}</p>}
            <dl className="grid grid-cols-[1fr_auto] gap-y-1 tabular-nums">
              <dt className="text-muted-foreground">{t("Dimensione attuale")}</dt>
              <dd>{mb(p.size)}</dd>
              {compressed !== null && (
                <>
                  <dt className="text-muted-foreground">{t("Dopo la compressione")}</dt>
                  <dd className="font-medium">
                    {mb(compressed)} <span className="text-muted-foreground">(−{Math.max(0, Math.round((1 - compressed / p.size) * 100))}%)</span>
                  </dd>
                </>
              )}
            </dl>
          </section>
          <Button className="h-9 w-full rounded-full" disabled={p.busy} onClick={async () => setCompressed(await p.onCompress(level))}>
            {p.busy ? <Loader2 className="animate-spin" /> : <FileDown />} {t("Comprimi e salva…")}
          </Button>
        </>
      )}

      {p.task === "merge" && (
        <>
          <section className="grid gap-2">
            <p className="text-muted-foreground">{t("Trascina le pagine per cambiare l'ordine. Pagine in totale: {n}.", { n: p.pages })}</p>
            <Button variant="secondary" className="rounded-full" onClick={p.onAddPdf}>
              <FilePlus2 /> {t("Aggiungi PDF…")}
            </Button>
          </section>
          {save}
        </>
      )}

      {p.task === "redact" && (
        <>
          <section className="grid gap-3">
            <p className="text-muted-foreground">{t("Copre in nero ogni occorrenza in tutte le pagine. Al salvataggio il contenuto sotto viene eliminato davvero.")}</p>
            <Input placeholder={t("Testo da cercare, es. un nome")} value={query} onChange={(e) => (setQuery(e.target.value), setRedacted(null))} />
            <div className="grid gap-2">
              {(Object.keys(PATTERNS) as Pattern[]).map((k) => (
                <Label key={k}>
                  <Checkbox checked={patterns.includes(k)} onCheckedChange={(on) => (setPatterns(on ? [...patterns, k] : patterns.filter((x) => x !== k)), setRedacted(null))} />
                  {PATTERNS[k].label}
                </Label>
              ))}
            </div>
            {redacted && (
              <p className={redacted.found ? "font-medium" : "text-muted-foreground"}>
                {redacted.found ? t("Oscurate {n} occorrenze in {pages} pagine. Controllale: ⌘Z annulla.", { n: redacted.found, pages: redacted.pages }) : t("Nessuna occorrenza trovata. Le pagine scansionate vanno prima rese ricercabili.")}
              </p>
            )}
            {!!redacted?.found && <DoneBar src={barLime} />}
          </section>
          <Button className="h-9 w-full rounded-full" variant={redacted?.found ? "secondary" : "default"} disabled={p.busy || (!query.trim() && !patterns.length)} onClick={async () => setRedacted(await p.onRedact(query, patterns))}>
            <EyeOff /> {t("Trova e oscura")}
          </Button>
          {!!redacted?.found && save}
        </>
      )}

      {p.task === "ocr" && (
        <>
          <section className="grid gap-2">
            <p className="text-muted-foreground">{t("Riconosce il testo nelle pagine scansionate, così il PDF salvato si può cercare e copiare. Tutto avviene sul tuo computer.")}</p>
            {p.ocrPages > 0 && <p className="font-medium">{t("Pagine con testo riconosciuto: {n} di {total}.", { n: p.ocrPages, total: p.pages })}</p>}
            {p.ocrPages > 0 && p.ocrPages >= p.pages && <DoneBar src={barOcean} />}
          </section>
          {p.ocrPages < p.pages ? (
            <Button className="h-9 w-full rounded-full" disabled={p.busy} onClick={p.onOcr}>
              {p.busy ? <Loader2 className="animate-spin" /> : <ScanText />} {t("Riconosci il testo")}
            </Button>
          ) : (
            save
          )}
        </>
      )}
    </aside>
  );
}
