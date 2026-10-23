import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { OptionGroup, OptionRow, Segmented } from "@/components/Chrome";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { Align, EdgeText, ExportOptions, Layout, PageNumberPosition, Stamps } from "@/lib/document";
import type { Compression } from "@/lib/tools";
import { t } from "@/lib/i18n";

export function SaveDialog({
  open,
  onOpenChange,
  options,
  onOptions,
  onSave,
  ghostscript,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  options: ExportOptions;
  onOptions: (o: ExportOptions) => void;
  onSave: () => void;
  ghostscript: boolean;
}) {
  const set = (patch: Partial<ExportOptions>) => onOptions({ ...options, ...patch });
  const [protect, setProtect] = useState(!!options.password);
  useEffect(() => {
    if (open) setProtect(!!options.password);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[480px]" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("Salva come")}</DialogTitle>
          <DialogDescription>{t("Scegli come esportare il PDF, poi dove salvarlo. Il file aperto resta com'è.")}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onOpenChange(false);
            onSave();
          }}
        >
          <OptionGroup>
            <OptionRow label={t("Impaginazione")} hint={t("Su fogli A4: una pagina, 2 o 4 per foglio")}>
              <Segmented<Layout>
                value={options.layout}
                onChange={(layout) => set({ layout })}
                options={[
                  { value: "original", label: t("Originale") },
                  { value: "a4", label: "A4" },
                  { value: "2up", label: "2" },
                  { value: "4up", label: "4" },
                ]}
              />
            </OptionRow>
            <OptionRow label={t("Comprimi immagini")} hint={t("Riduce foto e scansioni JPEG")}>
              <Segmented<"none" | Compression>
                value={options.compress ?? "none"}
                onChange={(v) => set({ compress: v === "none" ? null : v })}
                options={[
                  { value: "none", label: t("No") },
                  { value: "medium", label: t("Media") },
                  { value: "strong", label: t("Forte") },
                ]}
              />
            </OptionRow>
            <OptionRow label={t("Appiattisci moduli")} hint={t("I campi compilati non saranno più modificabili")} htmlFor="flatten">
              <Switch id="flatten" checked={options.flatten} onCheckedChange={(v) => set({ flatten: v })} />
            </OptionRow>
          </OptionGroup>

          <OptionGroup>
            <OptionRow label={t("Proteggi con password")} hint={options.pdfa ? t("Non compatibile con PDF/A") : protect ? t("Servirà per aprire il file") : t("Salva senza protezione, anche se il file ne aveva una")} htmlFor="protect">
              <Switch
                id="protect"
                disabled={options.pdfa}
                checked={protect && !options.pdfa}
                onCheckedChange={(v) => {
                  setProtect(v);
                  if (!v) set({ password: "" });
                }}
              />
            </OptionRow>
            {protect && !options.pdfa && (
              <div className="px-3.5 pb-3">
                <Input type="password" autoFocus autoComplete="new-password" placeholder={t("Password")} aria-label={t("Password")} value={options.password} onChange={(e) => set({ password: e.target.value })} />
              </div>
            )}
            <OptionRow label={t("Limita stampa, copia e modifica")} hint={t("I lettori PDF rispettano i permessi scelti")} htmlFor="restrict">
              <Switch id="restrict" disabled={options.pdfa} checked={!!options.restrict && !options.pdfa} onCheckedChange={(v) => set({ restrict: v ? { print: true, copy: false, modify: false } : null })} />
            </OptionRow>
            {options.restrict && !options.pdfa &&
              (
                [
                  ["print", t("Consenti la stampa")],
                  ["copy", t("Consenti di copiare il testo")],
                  ["modify", t("Consenti modifiche e commenti")],
                ] as const
              ).map(([key, label]) => (
                <OptionRow key={key} label={label} htmlFor={`perm-${key}`}>
                  <Switch id={`perm-${key}`} size="sm" checked={options.restrict![key]} onCheckedChange={(v) => set({ restrict: { ...options.restrict!, [key]: v } })} />
                </OptionRow>
              ))}
          </OptionGroup>

          <OptionGroup>
            <OptionRow label={t("Rimuovi dati nascosti")} hint={t("Metadati, script, allegati e info sull'autore")} htmlFor="sanitize">
              <Switch id="sanitize" checked={options.sanitize} onCheckedChange={(v) => set({ sanitize: v })} />
            </OptionRow>
            <OptionRow label={t("PDF/A per l'archiviazione")} hint={ghostscript ? t("Formato richiesto da PA e conservazione") : t("Richiede Ghostscript: brew install ghostscript")} htmlFor="pdfa">
              <Switch id="pdfa" disabled={!ghostscript} checked={options.pdfa} onCheckedChange={(v) => set({ pdfa: v })} />
            </OptionRow>
          </OptionGroup>

          <OptionGroup>
            <OptionRow label={t("Titolo")} htmlFor="title">
              <Input id="title" className="h-8 max-w-60 text-right" placeholder={t("Nessuno")} value={options.title} onChange={(e) => set({ title: e.target.value })} />
            </OptionRow>
            <OptionRow label={t("Autore")} htmlFor="author">
              <Input id="author" className="h-8 max-w-60 text-right" placeholder={t("Nessuno")} value={options.author} onChange={(e) => set({ author: e.target.value })} />
            </OptionRow>
          </OptionGroup>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" className="h-9 rounded-[10px] px-4" onClick={() => onOpenChange(false)}>
              {t("Annulla")}
            </Button>
            <Button type="submit" className="h-9 rounded-[10px] px-4" disabled={protect && !options.pdfa && !options.password}>
              {t("Scegli dove salvare…")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const POSITIONS: Record<PageNumberPosition, string> = { "bottom-center": t("In basso al centro"), "bottom-right": t("In basso a destra"), "top-right": t("In alto a destra") };

// Side panel rather than a dialog, so the pages stay visible while the stamps preview live.
export function StampsPanel({ stamps, onStamps, onClose }: { stamps: Stamps; onStamps: (s: Stamps) => void; onClose: () => void }) {
  const n = stamps.pageNumbers;
  const w = stamps.watermark;
  return (
    <aside className="float-panel float-enter fixed top-[60px] right-3 z-10 flex max-h-[calc(100%-140px)] w-72 flex-col gap-5 overflow-y-auto rounded-[16px] p-4 text-[13px]">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{t("Timbri su tutte le pagine")}</h2>
        <Button variant="ghost" size="icon-sm" aria-label={t("Chiudi")} onClick={onClose}>
          <X />
        </Button>
      </div>

      <section className="grid gap-3">
        <Label>
          <Checkbox checked={!!n} onCheckedChange={(on) => onStamps({ ...stamps, pageNumbers: on ? { position: "bottom-center", format: "{n} / {total}", size: 10 } : null })} />
          {t("Numeri di pagina")}
        </Label>
        {n && (
          <>
            <NativeSelect className="w-full" value={n.position} onChange={(e) => onStamps({ ...stamps, pageNumbers: { ...n, position: e.target.value as PageNumberPosition } })}>
              {Object.entries(POSITIONS).map(([v, l]) => (
                <NativeSelectOption key={v} value={v}>
                  {l}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <div className="grid grid-cols-[1fr_4rem] gap-2">
              <Input aria-label={t("Formato")} value={n.format} onChange={(e) => onStamps({ ...stamps, pageNumbers: { ...n, format: e.target.value } })} />
              <Input aria-label={t("Dimensione")} type="number" min={6} max={36} value={n.size} onChange={(e) => onStamps({ ...stamps, pageNumbers: { ...n, size: Number(e.target.value) || 10 } })} />
            </div>
            <p className="text-xs text-muted-foreground">{t("{n} = pagina, {total} = totale")}</p>
          </>
        )}
      </section>

      {(
        [
          ["header", t("Intestazione")],
          ["footer", t("Piè di pagina")],
        ] as const
      ).map(([key, label]) => (
        <EdgeTextSection key={key} label={label} value={stamps[key]} onChange={(v) => onStamps({ ...stamps, [key]: v })} />
      ))}

      <section className="grid gap-3">
        <Label>
          <Checkbox checked={!!w} onCheckedChange={(on) => onStamps({ ...stamps, watermark: on ? { text: t("BOZZA"), size: 72, opacity: 0.15, color: "#d12a2a" } : null })} />
          {t("Filigrana")}
        </Label>
        {w && (
          <>
            <Input aria-label={t("Testo filigrana")} value={w.text} onChange={(e) => onStamps({ ...stamps, watermark: { ...w, text: e.target.value } })} />
            <div className="grid grid-cols-[4rem_2rem_1fr] items-center gap-2">
              <Input aria-label={t("Dimensione")} type="number" min={12} max={200} value={w.size} onChange={(e) => onStamps({ ...stamps, watermark: { ...w, size: Number(e.target.value) || 72 } })} />
              <input
                type="color"
                aria-label={t("Colore")}
                className="size-8 cursor-pointer rounded-md border bg-transparent p-1"
                value={w.color}
                onChange={(e) => onStamps({ ...stamps, watermark: { ...w, color: e.target.value } })}
              />
              <input
                type="range"
                aria-label={t("Opacità")}
                min={0.05}
                max={1}
                step={0.05}
                value={w.opacity}
                onChange={(e) => onStamps({ ...stamps, watermark: { ...w, opacity: Number(e.target.value) } })}
              />
            </div>
          </>
        )}
      </section>
    </aside>
  );
}

function EdgeTextSection({ label, value, onChange }: { label: string; value: EdgeText | null; onChange: (v: EdgeText | null) => void }) {
  return (
    <section className="grid gap-3">
      <Label>
        <Checkbox checked={!!value} onCheckedChange={(on) => onChange(on ? { text: "{file} · {data}", align: "center", size: 9 } : null)} />
        {label}
      </Label>
      {value && (
        <>
          <Input aria-label={t("Testo {label}", { label })} value={value.text} onChange={(e) => onChange({ ...value, text: e.target.value })} />
          <div className="grid grid-cols-[1fr_4rem] gap-2">
            <Segmented<Align>
              value={value.align}
              onChange={(align) => onChange({ ...value, align })}
              options={[
                { value: "left", label: t("Sx") },
                { value: "center", label: t("Centro") },
                { value: "right", label: t("Dx") },
              ]}
            />
            <Input aria-label={t("Dimensione")} type="number" min={6} max={36} value={value.size} onChange={(e) => onChange({ ...value, size: Number(e.target.value) || 9 })} />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("{file} nome, {data} oggi, {n} e {total} pagine")}
          </p>
        </>
      )}
    </section>
  );
}

export function PasswordDialog({ request, onAnswer }: { request: string | null; onAnswer: (password: string | null) => void }) {
  const [value, setValue] = useState("");
  useEffect(() => setValue(""), [request]);
  return (
    <Dialog open={request !== null} onOpenChange={(o) => !o && onAnswer(null)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("PDF protetto")}</DialogTitle>
          <DialogDescription>{t("Inserisci la password per aprire «{name}».", { name: request ?? "" })}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onAnswer(value);
          }}
        >
          <Input type="password" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
          <DialogFooter>
            <Button type="submit">{t("Apri")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
