import { useEffect, useState } from "react";
import { Check, CircleAlert, FilePlus2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Segmented } from "@/components/Chrome";
import { SUFFIX, runBatch, type BatchOp } from "@/lib/batch";
import { ghostscriptPath } from "@/lib/desktop";
import { pickFiles, saveFiles, type OutFile } from "@/lib/io";
import type { Compression } from "@/lib/tools";
import { t } from "@/lib/i18n";

type Row = { file: File; state: "idle" | "running" | "done" | "error"; error?: string };

// The same operation on many files: each is processed on its own and the results go into one folder.
export function BatchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [kind, setKind] = useState<BatchOp["kind"]>("compress");
  const [level, setLevel] = useState<Compression>("medium");
  const [ghostscript, setGhostscript] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (open) ghostscriptPath().then((p) => setGhostscript(!!p));
    else if (!running) setRows([]);
  }, [open]);

  const add = async () => {
    const files = await pickFiles("application/pdf,.pdf,.p7m", true);
    setRows((r) => [...r.filter((x) => x.state === "idle"), ...files.map((file) => ({ file, state: "idle" as const }))]);
  };
  const patch = (i: number, p: Partial<Row>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x)));

  const start = async () => {
    const op: BatchOp = kind === "compress" ? { kind, level } : { kind };
    const out: OutFile[] = [];
    setRunning(true);
    for (const [i, row] of rows.entries()) {
      patch(i, { state: "running", error: undefined });
      try {
        const bytes = await runBatch(row.file.name, new Uint8Array(await row.file.arrayBuffer()), op, ghostscript);
        out.push({ name: `${row.file.name.replace(/\.(pdf|p7m)$/gi, "")}-${SUFFIX[kind]}.pdf`, bytes });
        patch(i, { state: "done" });
      } catch (e) {
        patch(i, { state: "error", error: (e as Error).message });
      }
    }
    setRunning(false);
    if (out.length) await saveFiles(out);
  };

  const done = rows.length > 0 && rows.every((r) => r.state === "done" || r.state === "error");

  return (
    <Dialog open={open} onOpenChange={(o) => !running && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Più file insieme")}</DialogTitle>
          <DialogDescription>{t("Applica la stessa operazione a tutti i file scelti. I risultati vanno in una cartella, gli originali restano come sono.")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: "compress", label: t("Comprimi") },
              { value: "ocr", label: t("Rendi ricercabile") },
              ...(ghostscript ? [{ value: "pdfa" as const, label: "PDF/A" }] : []),
            ]}
          />
          {kind === "compress" && (
            <Segmented
              value={level}
              onChange={setLevel}
              options={[
                { value: "medium", label: t("Media") },
                { value: "strong", label: t("Forte") },
              ]}
            />
          )}
        </div>

        <div className="grid max-h-64 gap-1 overflow-y-auto">
          {rows.map((r, i) => (
            <div key={`${r.file.name}-${i}`} className="flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-[13px] hover:bg-accent">
              <span className="min-w-0 flex-1 truncate" title={r.error ?? r.file.name}>
                {r.file.name}
                {r.error && <span className="block truncate text-xs text-destructive">{r.error}</span>}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">{Math.max(1, Math.round(r.file.size / 1024))} KB</span>
              {r.state === "running" && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              {r.state === "done" && <Check className="size-4 text-ink" />}
              {r.state === "error" && <CircleAlert className="size-4 text-destructive" />}
              {r.state === "idle" && (
                <button aria-label={t("Rimuovi {name}", { name: r.file.name })} className="rounded-[6px] p-0.5 text-muted-foreground hover:text-foreground" onClick={() => setRows(rows.filter((_, k) => k !== i))}>
                  <X className="size-4" />
                </button>
              )}
            </div>
          ))}
          <button disabled={running} className="flex h-16 items-center justify-center gap-2 rounded-[10px] border border-dashed text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-accent disabled:opacity-50" onClick={add}>
            <FilePlus2 className="size-4" /> {rows.length ? t("Aggiungi altri PDF…") : t("Scegli i PDF…")}
          </button>
        </div>

        <DialogFooter>
          {done ? (
            <Button className="rounded-[10px]" onClick={() => onOpenChange(false)}>
              {t("Fine")}
            </Button>
          ) : (
            <Button className="rounded-[10px]" disabled={running || !rows.length} onClick={start}>
              {running && <Loader2 className="animate-spin" />}
              {running ? t("Elaborazione…") : t("Avvia su {n} file", { n: rows.length })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
