import { useEffect, useLayoutEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

// `target` is a data-tour name; a step without one (or whose element is not on screen) shows centred.
type Step = { target?: string; title: string; body: string };
export type TourName = "home" | "editor";

const TOURS: Record<TourName, Step[]> = {
  home: [
    { title: t("Benvenuto in PDF Toolkit"), body: t("Firma, compila e sistema i tuoi PDF. Tutto resta sul tuo computer: nessun file viene caricato online.") },
    { target: "drop", title: t("Apri o trascina"), body: t("Clicca il foglio o trascina qui PDF e immagini. Se ne trascini più di uno, le pagine finiscono in un unico documento.") },
    { target: "files", title: t("Apri e crea"), body: t("Apri un PDF, scrivi un documento nuovo partendo da un modello oppure crea un PDF da foto e scansioni.") },
    { target: "tasks", title: t("Azioni rapide"), body: t("Scegli cosa vuoi fare: ti chiediamo il file e a destra si apre un pannello che ti guida passo per passo.") },
    { target: "signatures", title: t("Le tue firme"), body: t("Prepara qui le firme una volta sola: le ritrovi pronte ogni volta che firmi un documento.") },
    { target: "menu", title: t("Il menu"), body: t("Recenti, salvataggi, impostazioni e tutti i comandi. Da qui puoi anche rivedere questo tour.") },
  ],
  editor: [
    { target: "tools", title: t("Gli strumenti"), body: t("Testo, data, firma, timbri, penna, forme ed evidenziatore. Scegli uno strumento e clicca sulla pagina.") },
    { target: "view", title: t("Modifica e Pagine"), body: t("In Pagine riordini le pagine trascinandole, le ruoti, le elimini, le estrai o dividi il file.") },
    { target: "actions", title: t("Azioni e aggiunte"), body: t("Firma, comprimi, unisci, rendi ricercabile o confronta; con il pulsante accanto aggiungi altri PDF o immagini.") },
    { target: "save", title: t("Salva"), body: t("Salva sovrascrive il file. Con Salva come (⇧⌘S) scegli anche password, compressione e PDF/A.") },
    { target: "home", title: t("Torna alla home"), body: t("Chiude il file e torna alla schermata iniziale. Se ci sono modifiche non salvate te lo chiediamo prima.") },
  ],
};

const KEY = (name: TourName) => `pdf-toolkit:tour:${name}`;
export const tourSeen = (name: TourName) => {
  try {
    return localStorage.getItem(KEY(name)) === "1";
  } catch {
    return true; // without storage, never pester on every launch
  }
};

const CARD = 320;
const PAD = 6;

// Spotlights one element at a time with a short explanation; Esc or "Salta" ends it.
export function Tour({ name, onDone }: { name: TourName; onDone: () => void }) {
  const steps = TOURS[name];
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[i];

  // Measured before paint, so the card and the spotlight never show different steps.
  useLayoutEffect(() => {
    const measure = () => setRect(step.target ? (document.querySelector(`[data-tour="${step.target}"]`)?.getBoundingClientRect() ?? null) : null);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [step]);

  const finish = () => {
    try {
      localStorage.setItem(KEY(name), "1");
    } catch {}
    onDone();
  };
  const next = () => (i < steps.length - 1 ? setI(i + 1) : finish());
  const back = () => setI((n) => Math.max(0, n - 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  // Below the target, or above it when it sits in the lower part of the window.
  const below = !rect || rect.bottom < window.innerHeight * 0.6;
  const place = rect && {
    left: Math.min(Math.max(12, rect.left + rect.width / 2 - CARD / 2), window.innerWidth - CARD - 12),
    ...(below ? { top: rect.bottom + PAD + 10 } : { bottom: window.innerHeight - rect.top + PAD + 10 }),
  };
  const card = (
    <div key={i} className={cn("float-panel float-enter grid gap-3 rounded-[16px] p-4 text-[13px]", place && "absolute")} style={{ width: CARD, ...place }}>
      <div className="grid gap-1">
        <span className="text-xs text-muted-foreground tabular-nums">{t("{n} di {total}", { n: i + 1, total: steps.length })}</span>
        <h2 className="text-[15px] font-semibold text-balance">{step.title}</h2>
        <p className="text-muted-foreground text-pretty">{step.body}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" className="-ml-2 h-8 rounded-[10px] px-2 text-muted-foreground" onClick={finish}>
          {t("Salta")}
        </Button>
        <span className="flex-1" />
        {i > 0 && (
          <Button variant="secondary" className="h-8 rounded-[10px] px-3" onClick={back}>
            {t("Indietro")}
          </Button>
        )}
        <Button autoFocus className="h-8 rounded-[10px] px-3.5" onClick={next}>
          {i < steps.length - 1 ? t("Avanti") : t("Fine")}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal aria-label={step.title}>
      {rect ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-[16px] shadow-[0_0_0_9999px_oklch(0_0_0/0.55)] ring-2 ring-ink transition-[top,left,width,height] duration-(--duration-fast) ease-(--ease-smooth-out) motion-reduce:transition-none"
            style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
          />
          {card}
        </>
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-black/55">{card}</div>
      )}
    </div>
  );
}
