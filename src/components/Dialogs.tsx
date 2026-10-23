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
          <DialogTitle>Salva come</DialogTitle>
          <DialogDescription>Scegli come esportare il PDF, poi dove salvarlo. Il file aperto resta com'è.</DialogDescription>
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
            <OptionRow label="Impaginazione" hint="Su fogli A4: una pagina, 2 o 4 per foglio">
              <Segmented<Layout>
                value={options.layout}
                onChange={(layout) => set({ layout })}
                options={[
                  { value: "original", label: "Originale" },
                  { value: "a4", label: "A4" },
                  { value: "2up", label: "2" },
                  { value: "4up", label: "4" },
                ]}
              />
            </OptionRow>
            <OptionRow label="Comprimi immagini" hint="Riduce foto e scansioni JPEG">
              <Segmented<"none" | Compression>
                value={options.compress ?? "none"}
                onChange={(v) => set({ compress: v === "none" ? null : v })}
                options={[
                  { value: "none", label: "No" },
                  { value: "medium", label: "Media" },
                  { value: "strong", label: "Forte" },
                ]}
              />
            </OptionRow>
            <OptionRow label="Appiattisci moduli" hint="I campi compilati non saranno più modificabili" htmlFor="flatten">
              <Switch id="flatten" checked={options.flatten} onCheckedChange={(v) => set({ flatten: v })} />
            </OptionRow>
          </OptionGroup>

          <OptionGroup>
            <OptionRow label="Proteggi con password" hint={options.pdfa ? "Non compatibile con PDF/A" : protect ? "Servirà per aprire il file" : "Salva senza protezione, anche se il file ne aveva una"} htmlFor="protect">
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
                <Input type="password" autoFocus autoComplete="new-password" placeholder="Password" aria-label="Password" value={options.password} onChange={(e) => set({ password: e.target.value })} />
              </div>
            )}
            <OptionRow label="Limita stampa, copia e modifica" hint="I lettori PDF rispettano i permessi scelti" htmlFor="restrict">
              <Switch id="restrict" disabled={options.pdfa} checked={!!options.restrict && !options.pdfa} onCheckedChange={(v) => set({ restrict: v ? { print: true, copy: false, modify: false } : null })} />
            </OptionRow>
            {options.restrict && !options.pdfa &&
              (
                [
                  ["print", "Consenti la stampa"],
                  ["copy", "Consenti di copiare il testo"],
                  ["modify", "Consenti modifiche e commenti"],
                ] as const
              ).map(([key, label]) => (
                <OptionRow key={key} label={label} htmlFor={`perm-${key}`}>
                  <Switch id={`perm-${key}`} size="sm" checked={options.restrict![key]} onCheckedChange={(v) => set({ restrict: { ...options.restrict!, [key]: v } })} />
                </OptionRow>
              ))}
          </OptionGroup>

          <OptionGroup>
            <OptionRow label="Rimuovi dati nascosti" hint="Metadati, script, allegati e info sull'autore" htmlFor="sanitize">
              <Switch id="sanitize" checked={options.sanitize} onCheckedChange={(v) => set({ sanitize: v })} />
            </OptionRow>
            <OptionRow label="PDF/A per l'archiviazione" hint={ghostscript ? "Formato richiesto da PA e conservazione" : "Richiede Ghostscript: brew install ghostscript"} htmlFor="pdfa">
              <Switch id="pdfa" disabled={!ghostscript} checked={options.pdfa} onCheckedChange={(v) => set({ pdfa: v })} />
            </OptionRow>
          </OptionGroup>

          <OptionGroup>
            <OptionRow label="Titolo" htmlFor="title">
              <Input id="title" className="h-8 max-w-60 text-right" placeholder="Nessuno" value={options.title} onChange={(e) => set({ title: e.target.value })} />
            </OptionRow>
            <OptionRow label="Autore" htmlFor="author">
              <Input id="author" className="h-8 max-w-60 text-right" placeholder="Nessuno" value={options.author} onChange={(e) => set({ author: e.target.value })} />
            </OptionRow>
          </OptionGroup>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" className="h-9 rounded-[10px] px-4" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" className="h-9 rounded-[10px] px-4" disabled={protect && !options.pdfa && !options.password}>
              Scegli dove salvare…
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const POSITIONS: Record<PageNumberPosition, string> = { "bottom-center": "In basso al centro", "bottom-right": "In basso a destra", "top-right": "In alto a destra" };

// Side panel rather than a dialog, so the pages stay visible while the stamps preview live.
export function StampsPanel({ stamps, onStamps, onClose }: { stamps: Stamps; onStamps: (s: Stamps) => void; onClose: () => void }) {
  const n = stamps.pageNumbers;
  const w = stamps.watermark;
  return (
    <aside className="float-panel float-enter fixed top-[60px] right-3 z-10 flex max-h-[calc(100%-140px)] w-72 flex-col gap-5 overflow-y-auto rounded-[16px] p-4 text-[13px]">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Timbri su tutte le pagine</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Chiudi" onClick={onClose}>
          <X />
        </Button>
      </div>

      <section className="grid gap-3">
        <Label>
          <Checkbox checked={!!n} onCheckedChange={(on) => onStamps({ ...stamps, pageNumbers: on ? { position: "bottom-center", format: "{n} / {total}", size: 10 } : null })} />
          Numeri di pagina
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
              <Input aria-label="Formato" value={n.format} onChange={(e) => onStamps({ ...stamps, pageNumbers: { ...n, format: e.target.value } })} />
              <Input aria-label="Dimensione" type="number" min={6} max={36} value={n.size} onChange={(e) => onStamps({ ...stamps, pageNumbers: { ...n, size: Number(e.target.value) || 10 } })} />
            </div>
            <p className="text-xs text-muted-foreground">{"{n}"} = pagina, {"{total}"} = totale</p>
          </>
        )}
      </section>

      {(
        [
          ["header", "Intestazione"],
          ["footer", "Piè di pagina"],
        ] as const
      ).map(([key, label]) => (
        <EdgeTextSection key={key} label={label} value={stamps[key]} onChange={(v) => onStamps({ ...stamps, [key]: v })} />
      ))}

      <section className="grid gap-3">
        <Label>
          <Checkbox checked={!!w} onCheckedChange={(on) => onStamps({ ...stamps, watermark: on ? { text: "BOZZA", size: 72, opacity: 0.15, color: "#d12a2a" } : null })} />
          Filigrana
        </Label>
        {w && (
          <>
            <Input aria-label="Testo filigrana" value={w.text} onChange={(e) => onStamps({ ...stamps, watermark: { ...w, text: e.target.value } })} />
            <div className="grid grid-cols-[4rem_2rem_1fr] items-center gap-2">
              <Input aria-label="Dimensione" type="number" min={12} max={200} value={w.size} onChange={(e) => onStamps({ ...stamps, watermark: { ...w, size: Number(e.target.value) || 72 } })} />
              <input
                type="color"
                aria-label="Colore"
                className="size-8 cursor-pointer rounded-md border bg-transparent p-1"
                value={w.color}
                onChange={(e) => onStamps({ ...stamps, watermark: { ...w, color: e.target.value } })}
              />
              <input
                type="range"
                aria-label="Opacità"
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
          <Input aria-label={`Testo ${label}`} value={value.text} onChange={(e) => onChange({ ...value, text: e.target.value })} />
          <div className="grid grid-cols-[1fr_4rem] gap-2">
            <Segmented<Align>
              value={value.align}
              onChange={(align) => onChange({ ...value, align })}
              options={[
                { value: "left", label: "Sx" },
                { value: "center", label: "Centro" },
                { value: "right", label: "Dx" },
              ]}
            />
            <Input aria-label="Dimensione" type="number" min={6} max={36} value={value.size} onChange={(e) => onChange({ ...value, size: Number(e.target.value) || 9 })} />
          </div>
          <p className="text-xs text-muted-foreground">
            {"{file}"} nome, {"{data}"} oggi, {"{n}"} e {"{total}"} pagine
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
          <DialogTitle>PDF protetto</DialogTitle>
          <DialogDescription>Inserisci la password per aprire «{request}».</DialogDescription>
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
            <Button type="submit">Apri</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
