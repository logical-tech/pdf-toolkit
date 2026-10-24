import { useState } from "react";
import { ArrowDownUp, Copy, Crop as CropIcon, Eraser, FileImage, FilePlus2, FileText, Images, MoreHorizontal, RotateCcw, RotateCw, ScanText, Scissors, SquareDashedMousePointer, StickyNote, Trash2, FileOutput } from "lucide-react";
import { TextMorph } from "torph/react";
import { Button } from "@/components/ui/button";
import { BarDivider, FloatBar, ToolButton } from "@/components/Chrome";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageCanvas } from "@/components/PageCanvas";
import { cropOf, pageProxy, viewportOf, visibleSize, type Crop, type PageRef, type Source } from "@/lib/document";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { OptionGroup, OptionRow } from "@/components/Chrome";
import { isBlankPage } from "@/lib/tools";
import { everyN, parseRanges } from "@/lib/tools";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

const THUMB_W = 200;

type Props = {
  sources: Source[];
  pages: PageRef[];
  onPages: (pages: PageRef[]) => void;
  onAddPdf: () => void;
  onAddImages: () => void;
  onExtract: (ids: string[]) => void;
  onSplit: (groups: number[][]) => void;
  onExportImages: (ids: string[]) => void;
  onBlank: (afterId: string | null) => void;
  onDuplicate: (ids: string[]) => void;
  onClean: (ids: string[], opts: CleanOptions) => void;
  onOcr: (ids: string[]) => void;
};

export type CleanOptions = { deskew: boolean; grayscale: boolean; whiten: boolean };
const MM = 72 / 25.4;

export function PagesView({ sources, pages, onPages, onAddPdf, onAddImages, onExtract, onSplit, onExportImages, onBlank, onDuplicate, onClean, onOcr }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<number | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [cleanOpen, setCleanOpen] = useState(false);
  const [scanning, setScanning] = useState(false);

  const ids = pages.filter((p) => selected.has(p.id)).map((p) => p.id);

  const click = (e: React.MouseEvent, i: number) => {
    const id = pages[i].id;
    if (e.shiftKey && anchor !== null) {
      const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)];
      setSelected(new Set(pages.slice(a, b + 1).map((p) => p.id)));
      return;
    }
    setAnchor(i);
    setSelected((s) => (e.metaKey || e.ctrlKey ? new Set(s.has(id) ? [...s].filter((x) => x !== id) : [...s, id]) : new Set(s.has(id) && s.size === 1 ? [] : [id])));
  };

  const rotate = (delta: number) => onPages(pages.map((p) => (selected.has(p.id) ? { ...p, rotation: (p.rotation + delta + 360) % 360 } : p)));
  const remove = () => {
    onPages(pages.filter((p) => !selected.has(p.id)));
    setSelected(new Set());
  };

  const drop = () => {
    if (dragId === null || dropAt === null) return;
    const moving = selected.has(dragId) ? pages.filter((p) => selected.has(p.id)) : pages.filter((p) => p.id === dragId);
    const before = pages.slice(0, dropAt).filter((p) => !moving.includes(p));
    const after = pages.slice(dropAt).filter((p) => !moving.includes(p));
    onPages([...before, ...moving, ...after]);
    setDragId(null);
    setDropAt(null);
  };

  // Actions on "the selection" fall back to every page when nothing is selected.
  const targets = ids.length ? ids : pages.map((p) => p.id);
  const applyCrop = (crop: Crop | undefined) => onPages(pages.map((p) => (targets.includes(p.id) ? { ...p, crop } : p)));
  const selectBlank = async () => {
    setScanning(true);
    const blank: string[] = [];
    for (const p of pages) if (await isBlankPage(pageProxy(sources, p))) blank.push(p.id);
    setScanning(false);
    setSelected(new Set(blank));
    return blank.length;
  };

  const all = selected.size === pages.length;
  return (
    <div className="min-h-full px-10 pt-20 pb-32" onClick={(e) => e.target === e.currentTarget && setSelected(new Set())}>
      <div className="grid gap-x-8 gap-y-10" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${THUMB_W + 24}px, 1fr))` }} onClick={(e) => e.target === e.currentTarget && setSelected(new Set())}>
        {pages.map((ref, i) => {
          const page = pageProxy(sources, ref);
          const unit = visibleSize(page, ref);
          const k = THUMB_W / Math.max(unit.width, unit.height);
          const vp = viewportOf(page, ref, k);
          const c = cropOf(ref);
          const isSel = selected.has(ref.id);
          return (
            <div
              key={ref.id}
              draggable
              onDragStart={(e) => {
                setDragId(ref.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                setDropAt(e.clientX < r.left + r.width / 2 ? i : i + 1);
              }}
              onDrop={(e) => {
                if (!dragId) return;
                e.preventDefault();
                e.stopPropagation();
                drop();
              }}
              onDragEnd={() => (setDragId(null), setDropAt(null))}
              onClick={(e) => click(e, i)}
              className="group relative flex cursor-default flex-col items-center gap-2.5 select-none"
            >
              {dropAt === i && <span className="absolute top-0 -left-[18px] h-full w-[3px] rounded-full bg-ink" />}
              {dropAt === i + 1 && i === pages.length - 1 && <span className="absolute top-0 -right-[18px] h-full w-[3px] rounded-full bg-ink" />}
              <div className="flex items-center justify-center" style={{ width: THUMB_W, height: THUMB_W }}>
                <div
                  className={cn(
                    "paper relative overflow-hidden rounded-[2px] outline-offset-4 transition-[outline-color,opacity,translate] duration-150 group-hover:-translate-y-0.5",
                    isSel ? "outline-[2.5px] outline-ink" : "outline-[2.5px] outline-transparent",
                    dragId === ref.id && "opacity-40",
                  )}
                  style={{ width: unit.width * k, height: unit.height * k }}
                >
                  <div className="absolute" style={{ left: -c.left * k, top: -c.top * k, width: vp.width, height: vp.height }}>
                    <PageCanvas page={page} viewport={vp} />
                  </div>
                </div>
              </div>
              <span className={cn("rounded-full px-2 py-0.5 text-xs tabular-nums transition-colors duration-150", isSel ? "bg-ink text-ink-foreground" : "text-muted-foreground")}>{i + 1}</span>
            </div>
          );
        })}
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-4 flex justify-center">
        <FloatBar role="toolbar" aria-label={t("Azioni sulle pagine")}>
          <button
            onClick={() => setSelected(new Set(all ? [] : pages.map((p) => p.id)))}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium outline-none transition-[background-color] duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-[18px] [&_svg]:stroke-[1.75]"
          >
            <SquareDashedMousePointer />
            <TextMorph>{ids.length ? t("{n} di {total}", { n: ids.length, total: pages.length }) : all ? t("Deseleziona") : t("Seleziona tutte")}</TextMorph>
          </button>
          <BarDivider />
          <ToolButton side="top" label={t("Ruota a sinistra")} disabled={!ids.length} onClick={() => rotate(-90)}>
            <RotateCcw />
          </ToolButton>
          <ToolButton side="top" label={t("Ruota a destra")} disabled={!ids.length} onClick={() => rotate(90)}>
            <RotateCw />
          </ToolButton>
          <ToolButton side="top" label={t("Estrai in un nuovo PDF")} disabled={!ids.length} onClick={() => onExtract(ids)}>
            <FileOutput />
          </ToolButton>
          <ToolButton side="top" label={t("Salva come immagini PNG")} disabled={!ids.length} onClick={() => onExportImages(ids)}>
            <FileImage />
          </ToolButton>
          <ToolButton side="top" label={t("Elimina pagine")} disabled={!ids.length || ids.length === pages.length} onClick={remove} className="hover:bg-destructive/10 hover:text-destructive">
            <Trash2 />
          </ToolButton>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  aria-label={t("Altre azioni sulle pagine")}
                  className="inline-flex size-8 items-center justify-center rounded-full text-foreground/80 outline-none transition-[background-color] duration-150 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:bg-accent [&_svg]:size-[18px] [&_svg]:stroke-[1.75]"
                />
              }
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" sideOffset={10} className="min-w-60">
              <DropdownMenuItem onClick={() => onBlank(ids.length ? ids[ids.length - 1] : null)}>
                <StickyNote /> {t("Inserisci pagina bianca")}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!ids.length} onClick={() => onDuplicate(ids)}>
                <Copy /> {t("Duplica")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPages([...pages].reverse())}>
                <ArrowDownUp /> {t("Inverti l'ordine")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCropOpen(true)}>
                <CropIcon /> {t("Ritaglia i margini…")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={scanning} onClick={selectBlank}>
                <FileText /> {t("Seleziona le pagine bianche")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCleanOpen(true)}>
                <Eraser /> {t("Pulisci scansioni…")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onOcr(targets)}>
                <ScanText /> {t("Riconosci il testo (OCR)")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <BarDivider />
          <ToolButton side="top" label={t("Dividi in più file")} onClick={() => setSplitOpen(true)}>
            <Scissors />
          </ToolButton>
          <ToolButton side="top" label={t("Aggiungi PDF")} onClick={onAddPdf}>
            <FilePlus2 />
          </ToolButton>
          <ToolButton side="top" label={t("Aggiungi immagini")} onClick={onAddImages}>
            <Images />
          </ToolButton>
        </FloatBar>
      </div>

      <SplitDialog open={splitOpen} onOpenChange={setSplitOpen} total={pages.length} onSplit={onSplit} />
      <CropDialog
        open={cropOpen}
        onOpenChange={setCropOpen}
        count={targets.length}
        initial={cropOf(pages.find((p) => p.id === targets[0]) ?? pages[0])}
        onApply={applyCrop}
      />
      <CleanDialog open={cleanOpen} onOpenChange={setCleanOpen} count={targets.length} onApply={(o) => onClean(targets, o)} />
    </div>
  );
}

function SplitDialog({ open, onOpenChange, total, onSplit }: { open: boolean; onOpenChange: (o: boolean) => void; total: number; onSplit: (groups: number[][]) => void }) {
  const [mode, setMode] = useState<"every" | "ranges">("every");
  const [n, setN] = useState(1);
  const [ranges, setRanges] = useState("");
  const groups = mode === "every" ? everyN(Math.max(1, n), total) : parseRanges(ranges, total);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Dividi PDF")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={mode === "every"} onChange={() => setMode("every")} />
            {t("Un file ogni")}
            <Input type="number" min={1} max={total} className="h-8 w-16" value={n} onChange={(e) => setN(Number(e.target.value) || 1)} onFocus={() => setMode("every")} />
            {t("pagine")}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={mode === "ranges"} onChange={() => setMode("ranges")} />
            {t("Intervalli")}
            <Input className="h-8 flex-1" placeholder={t("es. 1-3, 4, 5-")} value={ranges} onChange={(e) => setRanges(e.target.value)} onFocus={() => setMode("ranges")} />
          </label>
          <Label className={cn("font-normal", groups ? "text-muted-foreground" : "text-destructive")}>
            {groups ? t("Verranno creati {n} file.", { n: groups.length }) : t("Intervalli non validi (pagine da 1 a {total}).", { total })}
          </Label>
        </div>
        <DialogFooter>
          <Button disabled={!groups} onClick={() => (onSplit(groups!), onOpenChange(false))}>
            {t("Dividi")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CropDialog({ open, onOpenChange, count, initial, onApply }: { open: boolean; onOpenChange: (o: boolean) => void; count: number; initial: Crop; onApply: (c: Crop | undefined) => void }) {
  const toMm = (c: Crop) => ({ top: Math.round(c.top / MM), right: Math.round(c.right / MM), bottom: Math.round(c.bottom / MM), left: Math.round(c.left / MM) });
  const [mm, setMm] = useState(toMm(initial));
  const sides = [
    ["top", t("Sopra")],
    ["bottom", t("Sotto")],
    ["left", t("Sinistra")],
    ["right", t("Destra")],
  ] as const;
  return (
    <Dialog open={open} onOpenChange={(o) => (o && setMm(toMm(initial)), onOpenChange(o))}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("Ritaglia i margini")}</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-[13px] text-muted-foreground">{count === 1 ? t("Si applica alla pagina selezionata.") : t("Si applica a {n} pagine.", { n: count })}</p>
        <OptionGroup>
          {sides.map(([key, label]) => (
            <OptionRow key={key} label={label} htmlFor={`crop-${key}`}>
              <label className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <Input id={`crop-${key}`} type="number" min={0} className="h-8 w-20 text-right tabular-nums" value={mm[key]} onChange={(e) => setMm({ ...mm, [key]: Math.max(0, Number(e.target.value) || 0) })} />
                mm
              </label>
            </OptionRow>
          ))}
        </OptionGroup>
        <DialogFooter>
          <Button variant="ghost" className="h-9 rounded-full px-4" onClick={() => (onApply(undefined), onOpenChange(false))}>
            {t("Togli il ritaglio")}
          </Button>
          <Button className="h-9 rounded-full px-4" onClick={() => (onApply({ top: mm.top * MM, right: mm.right * MM, bottom: mm.bottom * MM, left: mm.left * MM }), onOpenChange(false))}>
            {t("Ritaglia")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CleanDialog({ open, onOpenChange, count, onApply }: { open: boolean; onOpenChange: (o: boolean) => void; count: number; onApply: (o: CleanOptions) => void }) {
  const [o, setO] = useState<CleanOptions>({ deskew: true, grayscale: false, whiten: true });
  const rows = [
    ["deskew", t("Raddrizza"), t("Corregge le pagine scansionate storte")],
    ["whiten", t("Sbianca lo sfondo"), t("Carta grigia o ingiallita diventa bianca")],
    ["grayscale", t("Scala di grigi"), t("Toglie il colore")],
  ] as const;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Pulisci scansioni")}</DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-[13px] text-muted-foreground text-pretty">
          {count === 1
            ? t("La pagina selezionata diventa un'immagine ripulita: il testo non sarà più selezionabile finché non usi l'OCR.")
            : t("{n} pagine diventano immagini ripulite: il testo non sarà più selezionabile finché non usi l'OCR.", { n: count })}
        </p>
        <OptionGroup>
          {rows.map(([key, label, hint]) => (
            <OptionRow key={key} label={label} hint={hint} htmlFor={`clean-${key}`}>
              <Switch id={`clean-${key}`} checked={o[key]} onCheckedChange={(v) => setO({ ...o, [key]: v })} />
            </OptionRow>
          ))}
        </OptionGroup>
        <DialogFooter>
          <Button variant="ghost" className="h-9 rounded-full px-4" onClick={() => onOpenChange(false)}>
            {t("Annulla")}
          </Button>
          <Button className="h-9 rounded-full px-4" disabled={!o.deskew && !o.grayscale && !o.whiten} onClick={() => (onApply(o), onOpenChange(false))}>
            {t("Pulisci")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
