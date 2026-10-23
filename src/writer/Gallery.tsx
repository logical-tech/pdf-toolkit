import { useMemo } from "react";
import { FilePlus2 } from "lucide-react";
import { useCompany } from "./company";
import { DEFAULT_MARGINS, A4_MM } from "./model";
import { MM_TO_PX, Sheet } from "./Sheet";
import { TEMPLATES, buildTemplate } from "./templates";

const THUMB_W = 184;
const SCALE = THUMB_W / (A4_MM.width * MM_TO_PX);

/** Start a document: a blank sheet or one of the templates, each previewed live with the real editor. */
export function Gallery({ onPick }: { onPick: (templateId: string) => void }) {
  const company = useCompany();
  const previews = useMemo(() => TEMPLATES.map((t) => ({ ...t, content: buildTemplate(t.id, company).content })), [company]);

  return (
    <div className="flex min-h-full flex-col items-center gap-10 px-10 pt-24 pb-32">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-[22px] font-semibold tracking-[-0.01em] text-balance">Nuovo documento</h1>
        <p className="text-[13px] text-pretty text-muted-foreground">
          {company.name ? "Scegli un modello: ogni parte si può modificare." : "Scegli un modello. Aggiungi i dati della tua azienda nelle Impostazioni per vederli nelle intestazioni."}
        </p>
      </div>
      <div className="grid w-full max-w-[1100px] grid-cols-[repeat(auto-fill,minmax(184px,1fr))] justify-items-center gap-x-8 gap-y-10">
        {previews.map((t) => (
          <button
            key={t.id}
            onClick={() => onPick(t.id)}
            className="group flex w-[184px] flex-col gap-3 rounded-[6px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-8 focus-visible:ring-offset-canvas"
          >
            <div
              className="paper relative overflow-hidden rounded-[2px] transition-[translate,box-shadow] duration-(--duration-fast) ease-(--ease-smooth-out) group-hover:-translate-y-0.5 group-active:scale-[0.98] motion-reduce:transition-none"
              style={{ width: THUMB_W, height: THUMB_W * (A4_MM.height / A4_MM.width) }}
              aria-hidden
            >
              {t.id === "vuoto" ? (
                <div className="flex h-full items-center justify-center text-black/25">
                  <FilePlus2 className="size-8 stroke-[1.25]" />
                </div>
              ) : (
                <div className="pointer-events-none absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${SCALE})` }} inert>
                  <Sheet content={t.content} margins={DEFAULT_MARGINS} editable={false} className="shadow-none filter-none" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-0.5 px-0.5">
              <span className="text-[13px] font-medium">{t.label}</span>
              <span className="text-xs text-pretty text-muted-foreground">{t.description}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
