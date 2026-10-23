import { FilePen, FileText, FileUp, Images } from "lucide-react";
import type { Recent } from "@/lib/desktop";
import { Button } from "@/components/ui/button";
import { LogicalMark } from "@/components/LogicalMark";
import { t } from "@/lib/i18n";

// A blank sheet with a signature being written on it: the app's one authored motion moment.
export function EmptyState({ onOpen, onImages, onWrite, recent, onRecent }: { onOpen: () => void; onImages: () => void; onWrite: () => void; recent: Recent[]; onRecent: (path: string) => void }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-10 px-6 py-24">
      <button onClick={onOpen} aria-label={t("Apri un PDF")} className="paper group relative h-[340px] w-[264px] -rotate-2 rounded-[3px] outline-none transition-[rotate,scale] duration-(--duration-slow) ease-(--ease-smooth-out) hover:rotate-0 hover:scale-[1.02] focus-visible:ring-4 focus-visible:ring-ring motion-reduce:transition-none">
        <div className="absolute inset-x-7 top-9 space-y-2.5" aria-hidden>
          {[92, 100, 84, 96, 60].map((w, i) => (
            <div key={i} className="h-1.5 rounded-full bg-black/[0.07]" style={{ width: `${w}%` }} />
          ))}
        </div>
        <svg viewBox="0 0 180 70" className="absolute right-6 bottom-10 w-36 overflow-visible" aria-hidden>
          <path
            className="signature-stroke stroke-ink"
            d="M6 46c10-22 22-36 28-30 7 7-12 38-6 40 7 2 15-30 22-30 6 0-4 26 2 26 7 0 9-18 15-18 5 0 1 14 6 14 6 0 9-12 15-12s4 10 10 10c8 0 14-9 22-12 9-3 20-2 30 1"
            fill="none"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M2 62h170" stroke="black" strokeOpacity="0.18" strokeWidth="1" />
        </svg>
      </button>

      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-balance">{t("Trascina qui un PDF o delle immagini")}</h1>
        <p className="text-[13px] text-muted-foreground text-pretty">{t("Firma, compila e sistema i tuoi documenti. Tutto resta sul tuo computer.")}</p>
      </div>

      <div className="flex items-center gap-2">
        <Button className="h-9 rounded-[10px] px-4" onClick={onOpen}>
          <FileUp /> {t("Apri PDF")}
        </Button>
        <Button variant="ghost" className="h-9 rounded-[10px] px-4" onClick={onImages}>
          <Images /> {t("Crea da immagini")}
        </Button>
        <Button variant="ghost" className="h-9 rounded-[10px] px-4" onClick={onWrite}>
          <FilePen /> {t("Scrivi un documento")}
        </Button>
      </div>

      {recent.length > 0 && (
        <div className="flex w-full max-w-sm flex-col gap-1">
          <h2 className="px-2 text-xs font-medium text-muted-foreground">{t("Recenti")}</h2>
          {recent.slice(0, 5).map((r) => (
            <button key={r.path} title={r.path} onClick={() => onRecent(r.path)} className="flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] transition-colors duration-150 hover:bg-accent">
              <FileText className="size-4 shrink-0 stroke-[1.75] text-muted-foreground" />
              <span className="truncate">{r.name}</span>
            </button>
          ))}
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LogicalMark className="size-3.5" /> {t("Realizzato da Logical")}
      </p>
    </div>
  );
}
