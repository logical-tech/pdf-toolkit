import { useMemo } from "react";
import { FilePlus2 } from "lucide-react";
import { Headline } from "@/components/Chrome";
import { t } from "@/lib/i18n";
import { useCompany } from "./company";
import { DEFAULT_MARGINS, A4_MM } from "./model";
import { MM_TO_PX, Sheet } from "./Sheet";
import { TEMPLATES, buildTemplate } from "./templates";

const THUMB_W = 184;
const SCALE = THUMB_W / (A4_MM.width * MM_TO_PX);

/** Start a document: a blank sheet or one of the templates, each previewed live with the real editor. */
export function Gallery({ onPick }: { onPick: (templateId: string) => void }) {
  const company = useCompany();
  const previews = useMemo(() => TEMPLATES.map((tpl) => ({ ...tpl, content: buildTemplate(tpl.id, company).content })), [company]);

  return (
    <div className="flex min-h-full flex-col items-center gap-10 px-10 pt-24 pb-32">
      <div className="flex flex-col items-center gap-2 text-center">
        <Headline text={t("Nuovo documento")} />
        <p className="text-[15px] text-pretty text-muted-foreground">
          {company.name ? t("Scegli un modello: ogni parte si può modificare.") : t("Scegli un modello. Aggiungi i dati della tua azienda nelle Impostazioni per vederli nelle intestazioni.")}
        </p>
      </div>
      <div className="grid w-full max-w-[1100px] grid-cols-[repeat(auto-fill,minmax(184px,1fr))] justify-items-center gap-x-8 gap-y-10">
        {previews.map((tpl) => (
          <button
            key={tpl.id}
            onClick={() => onPick(tpl.id)}
            className="group flex w-[184px] flex-col gap-3 rounded-[6px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-8 focus-visible:ring-offset-canvas"
          >
            <div
              className="paper relative overflow-hidden rounded-[2px] transition-[translate,box-shadow] duration-(--duration-fast) ease-(--ease-smooth-out) group-hover:-translate-y-0.5 group-active:scale-[0.98] motion-reduce:transition-none"
              style={{ width: THUMB_W, height: THUMB_W * (A4_MM.height / A4_MM.width) }}
              aria-hidden
            >
              {tpl.id === "vuoto" ? (
                <div className="flex h-full items-center justify-center text-black/25">
                  <FilePlus2 className="size-8 stroke-[1.25]" />
                </div>
              ) : (
                <div className="pointer-events-none absolute top-0 left-0 origin-top-left" style={{ transform: `scale(${SCALE})` }} inert>
                  <Sheet content={tpl.content} margins={DEFAULT_MARGINS} editable={false} className="shadow-none filter-none" />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-0.5 px-0.5">
              <span className="text-[13px] font-medium">{tpl.label}</span>
              <span className="text-xs text-pretty text-muted-foreground">{tpl.description}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
