import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { PDFPageProxy } from "pdfjs-dist";
import { FloatBar, ToolButton } from "@/components/Chrome";
import { pixelDiff } from "@/lib/scan";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

export type ComparePage = { page: PDFPageProxy; rotation: number };
type Row = { a: string | null; b: string | null; diff: string | null; changed: number | null };

const WIDTH = 380;

async function renderAt(p: ComparePage | undefined, width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  if (p) {
    const unit = p.page.getViewport({ scale: 1, rotation: p.rotation });
    const viewport = p.page.getViewport({ scale: width / unit.width, rotation: p.rotation });
    await p.page.render({ canvas: c, viewport, intent: "print", background: "#fff" }).promise;
  }
  return c;
}

// Two versions side by side, page by page; what changed is tinted red on the second.
export function ComparePanel({ leftName, left, rightName, right, onClose }: { leftName: string; left: ComparePage[]; rightName: string; right: ComparePage[]; onClose: () => void }) {
  const total = Math.max(left.length, right.length);
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: total }, () => ({ a: null, b: null, diff: null, changed: null })));

  useEffect(() => {
    let alive = true;
    (async () => {
      for (let i = 0; i < total && alive; i++) {
        const ref = left[i] ?? right[i];
        const unit = ref.page.getViewport({ scale: 1, rotation: ref.rotation });
        const height = Math.round((WIDTH * unit.height) / unit.width);
        const [ca, cb] = [await renderAt(left[i], WIDTH, height), await renderAt(right[i], WIDTH, height)];
        const ia = ca.getContext("2d")!.getImageData(0, 0, WIDTH, height);
        const ib = cb.getContext("2d")!.getImageData(0, 0, WIDTH, height);
        const { mask, changed } = pixelDiff(ia, ib);
        const overlay = document.createElement("canvas");
        overlay.width = WIDTH;
        overlay.height = height;
        const ctx = overlay.getContext("2d")!;
        const out = ctx.createImageData(WIDTH, height);
        for (let k = 0; k < mask.length; k++) if (mask[k]) out.data.set([220, 38, 38, 150], k * 4);
        ctx.putImageData(out, 0, 0);
        if (!alive) return;
        const row = { a: left[i] ? ca.toDataURL() : null, b: right[i] ? cb.toDataURL() : null, diff: changed ? overlay.toDataURL() : null, changed };
        setRows((r) => r.map((x, k) => (k === i ? row : x)));
      }
    })();
    return () => {
      alive = false;
    };
  }, [left, right]);

  const differing = rows.filter((r) => r.changed).length;

  return (
    <div className="fixed inset-0 z-30 overflow-auto bg-canvas">
      <div className="sticky top-0 z-10 flex justify-center pt-2.5">
        <FloatBar className="gap-3 pl-3.5">
          <span className="text-[13px] font-medium">{t("Confronto")}</span>
          <span className="max-w-72 truncate text-xs text-muted-foreground">
            {leftName} → {rightName}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">{rows.every((r) => r.changed !== null) ? (differing ? t("{n} pagine diverse su {total}", { n: differing, total }) : t("Nessuna differenza")) : t("Analisi in corso…")}</span>
          <ToolButton label={t("Chiudi confronto")} shortcut="esc" onClick={onClose}>
            <X />
          </ToolButton>
        </FloatBar>
      </div>
      <div className="mx-auto flex w-fit flex-col gap-10 px-8 pt-8 pb-24">
        {rows.map((r, i) => (
          <div key={i} className="flex items-start gap-6">
            <span className={cn("w-16 pt-2 text-right text-xs tabular-nums", r.changed ? "font-medium text-destructive" : "text-muted-foreground")}>
              {i + 1}
              {r.changed ? <span className="block">{(r.changed * 100).toFixed(1)}%</span> : null}
            </span>
            {[r.a, r.b].map((src, side) => (
              <div key={side} className="paper relative rounded-[2px]" style={{ width: WIDTH, minHeight: 120 }}>
                {src ? <img src={src} alt="" className="block w-full" /> : <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">{r.changed === null ? "" : t("Pagina assente")}</div>}
                {side === 1 && r.diff && <img src={r.diff} alt="" className="pointer-events-none absolute inset-0 w-full mix-blend-multiply" />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
