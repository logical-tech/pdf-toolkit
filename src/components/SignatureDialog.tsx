import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pickFiles } from "@/lib/io";
import { imageToPngDataUrl } from "@/lib/tools";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

const STORE_KEY = "pdf-toolkit:signatures";
const INKS = ["#111111", "#1d3fa8"];

export const loadSaved = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? "[]");
  } catch {
    return [];
  }
};
const storeSaved = (list: string[]) => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {}
};

// Crop a canvas to its non-transparent pixels and return a PNG data URL (null if empty).
function trimCanvas(canvas: HTMLCanvasElement): string | null {
  const { width, height } = canvas;
  const data = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
  let [minX, minY, maxX, maxY] = [width, height, -1, -1];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3]) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
  if (maxX < 0) return null;
  const out = document.createElement("canvas");
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext("2d")!.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

// `manage`: only add and remove saved signatures, without placing one on the page.
export function SignatureDialog({ open, onOpenChange, onPick, manage }: { open: boolean; onOpenChange: (o: boolean) => void; onPick?: (src: string) => void; manage?: boolean }) {
  const [saved, setSaved] = useState(loadSaved);
  const [ink, setInk] = useState(INKS[0]);
  const padRef = useRef<SignaturePad | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Two instances (place and manage) share the store, so each reloads it when it opens.
  useEffect(() => {
    if (open) setSaved(loadSaved());
  }, [open]);

  const pick = (src: string, remember: boolean) => {
    if (remember && !saved.includes(src)) {
      const next = [src, ...saved].slice(0, 8);
      setSaved(next);
      storeSaved(next);
    }
    if (manage) return void padRef.current?.clear();
    onPick?.(src);
    onOpenChange(false);
  };

  const forget = (src: string) => {
    const next = saved.filter((s) => s !== src);
    setSaved(next);
    storeSaved(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{manage ? t("Le mie firme") : t("Firma")}</DialogTitle>
        </DialogHeader>

        {manage && !saved.length && <p className="text-[13px] text-muted-foreground">{t("Nessuna firma salvata. Disegnane una o carica un'immagine: la ritroverai pronta quando firmi.")}</p>}
        {saved.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {saved.map((s) => (
              <div key={s} className="group relative">
                <button className={cn("flex h-16 w-full items-center justify-center rounded-md border bg-white p-1.5", !manage && "hover:border-foreground/40")} disabled={manage} onClick={() => pick(s, false)}>
                  <img src={s} alt={t("Firma salvata")} className="max-h-full max-w-full" />
                </button>
                <button
                  aria-label={t("Rimuovi firma salvata")}
                  className={cn("absolute -top-1.5 -right-1.5 size-5 items-center justify-center rounded-full border bg-background", manage ? "flex" : "hidden group-hover:flex")}
                  onClick={() => forget(s)}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <Tabs defaultValue="draw">
          <TabsList>
            <TabsTrigger value="draw">{t("Disegna")}</TabsTrigger>
            <TabsTrigger value="upload">{t("Carica immagine")}</TabsTrigger>
          </TabsList>
          <TabsContent value="draw" className="space-y-3">
            <DrawPad ink={ink} padRef={padRef} canvasRef={canvasRef} />
            <div className="flex items-center gap-2">
              {INKS.map((c) => (
                <button
                  key={c}
                  aria-label={t("Inchiostro {color}", { color: c })}
                  className={cn("size-6 rounded-full ring-1 ring-border ring-offset-2 ring-offset-background", ink === c && "ring-2 ring-foreground/60")}
                  style={{ background: c }}
                  onClick={() => setInk(c)}
                />
              ))}
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => padRef.current?.clear()}>
                <Trash2 /> {t("Cancella")}
              </Button>
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  const canvas = canvasRef.current;
                  const src = canvas && trimCanvas(canvas);
                  if (src) pick(src, true);
                }}
              >
                {manage ? t("Salva firma") : t("Usa firma")}
              </Button>
            </DialogFooter>
          </TabsContent>
          <TabsContent value="upload">
            <button
              className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-muted/50"
              onClick={async () => {
                const [file] = await pickFiles("image/*");
                if (file) pick(await imageToPngDataUrl(file), true);
              }}
            >
              <Upload className="size-5" />
              {t("Scegli un'immagine (PNG con sfondo trasparente consigliato)")}
            </button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function DrawPad({ ink, padRef, canvasRef }: { ink: string; padRef: React.RefObject<SignaturePad | null>; canvasRef: React.RefObject<HTMLCanvasElement | null> }) {

  useEffect(() => {
    const canvas = canvasRef.current!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    canvas.getContext("2d")!.scale(dpr, dpr);
    const pad = new SignaturePad(canvas, { minWidth: 0.8, maxWidth: 2.6 });
    padRef.current = pad;
    return () => pad.off();
  }, []);

  useEffect(() => {
    if (padRef.current) padRef.current.penColor = ink;
  }, [ink]);

  return <canvas ref={canvasRef} className="h-48 w-full touch-none rounded-lg border bg-white" />;
}
