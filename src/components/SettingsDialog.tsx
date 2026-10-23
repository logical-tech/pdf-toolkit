import { useEffect, useState, type ReactNode } from "react";
import { McpSettings } from "@/components/McpSettings";
import { TextMorph } from "torph/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OptionGroup, OptionRow, Segmented } from "@/components/Chrome";
import { applyTheme, loadTheme, type Theme } from "@/lib/theme";
import { appVersion, checkForUpdate, installUpdate, type Update } from "@/lib/update";
import { openExternal } from "@/lib/desktop";

type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "latest" }
  | { kind: "available"; update: Update }
  | { kind: "installing"; progress: number | null }
  | { kind: "error"; message: string };

export function SettingsDialog({ open, onOpenChange, company }: { open: boolean; onOpenChange: (o: boolean) => void; company?: ReactNode }) {
  const [tab, setTab] = useState<"general" | "company" | "ai">("general");
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [version, setVersion] = useState("");
  const [state, setState] = useState<UpdateState>({ kind: "idle" });

  useEffect(() => {
    appVersion().then(setVersion);
  }, []);

  const check = async () => {
    setState({ kind: "checking" });
    try {
      const update = await checkForUpdate();
      setState(update ? { kind: "available", update } : { kind: "latest" });
    } catch (e) {
      setState({ kind: "error", message: String(e) });
    }
  };

  const install = async (update: Update) => {
    setState({ kind: "installing", progress: null });
    try {
      await installUpdate(update, (progress) => setState({ kind: "installing", progress }));
    } catch (e) {
      setState({ kind: "error", message: String(e) });
    }
  };

  const status =
    state.kind === "checking"
      ? "Controllo in corso…"
      : state.kind === "latest"
        ? "Hai l'ultima versione"
        : state.kind === "available"
          ? `Disponibile la ${state.update.version}`
          : state.kind === "installing"
            ? state.progress === null
              ? "Download in corso…"
              : `Download ${Math.round(state.progress * 100)}%`
            : state.kind === "error"
              ? "Controllo non riuscito"
              : "Controlla se c'è una versione nuova";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Impostazioni</DialogTitle>
        </DialogHeader>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "general", label: "Generale" },
            ...(company ? [{ value: "company" as const, label: "Azienda" }] : []),
            { value: "ai", label: "Assistenti AI" },
          ]}
        />
        {tab === "ai" && <McpSettings />}
        {tab === "company" && company}
        {tab === "general" && (
        <>
        <OptionGroup>
          <OptionRow label="Aspetto">
            <Segmented<Theme>
              value={theme}
              onChange={(t) => {
                setTheme(t);
                applyTheme(t);
              }}
              options={[
                { value: "system", label: "Sistema" },
                { value: "light", label: "Chiaro" },
                { value: "dark", label: "Scuro" },
              ]}
            />
          </OptionRow>
        </OptionGroup>
        <OptionGroup>
          <OptionRow label="Versione">
            <span className="text-[13px] text-muted-foreground tabular-nums">{version}</span>
          </OptionRow>
          <OptionRow label="Licenze" hint="CC BY-NC-SA 4.0; Ghostscript è AGPL-3.0">
            <Button variant="secondary" className="h-8 rounded-[10px] px-3" onClick={() => openExternal("https://github.com/logical-tech/pdf-toolkit/blob/main/THIRD_PARTY_NOTICES.md")}>
              Mostra
            </Button>
          </OptionRow>
          <div className="flex min-h-12 items-center justify-between gap-4 px-3.5 py-2.5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] font-medium">Aggiornamenti</span>
              <span className="text-xs text-muted-foreground tabular-nums" title={state.kind === "error" ? state.message : undefined}>
                <TextMorph>{status}</TextMorph>
              </span>
            </div>
            {state.kind === "available" ? (
              <Button className="h-8 rounded-[10px] px-3" onClick={() => install(state.update)}>
                Installa e riavvia
              </Button>
            ) : (
              <Button variant="secondary" className="h-8 rounded-[10px] px-3" disabled={state.kind === "checking" || state.kind === "installing" || version === "dev"} onClick={check}>
                {(state.kind === "checking" || state.kind === "installing") && <Loader2 className="animate-spin" />}
                Controlla
              </Button>
            )}
          </div>
        </OptionGroup>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
