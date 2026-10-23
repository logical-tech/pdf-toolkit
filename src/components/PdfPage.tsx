import { useEffect, useRef, useState } from "react";
import type { PageViewport, PDFPageProxy } from "pdfjs-dist";
import { Minus, MessageSquareText, Palette, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  cropOf,
  itemSize,
  LINE_HEIGHT,
  NOTE_SIZE,
  RECT_STYLES,
  shapePath,
  TEXT_FONT,
  viewportOf,
  type Field,
  type FieldValue,
  type Item,
  type PageRef,
  type RectStyle,
  type ShapeKind,
  type TextItem,
} from "@/lib/document";
import { PageCanvas } from "@/components/PageCanvas";
import { PageLinks, PageText } from "@/components/PageText";
import { BarDivider, FloatBar, ToolButton } from "@/components/Chrome";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

export type Tool =
  | { kind: "select" }
  | { kind: "text"; preset?: string }
  | { kind: "image"; src: string; ratio: number; width: number }
  | { kind: "rect"; style: RectStyle }
  | { kind: "pen"; color: string; width: number }
  | { kind: "shape"; shape: Exclude<ShapeKind, "ink"> }
  | { kind: "note" }
  | { kind: "field"; field: "text" | "checkbox" };

type Props = {
  pageRef: PageRef;
  page: PDFPageProxy;
  number: number;
  scale: number;
  items: Item[];
  stamps: TextItem[];
  fields: Field[];
  values: (f: Field) => FieldValue;
  tool: Tool;
  selectedId: string | null;
  editingId: string | null;
  query: string;
  activeMatch: number | null;
  nextFieldName: () => string;
  onSelect: (id: string | null) => void;
  onEdit: (id: string | null) => void;
  onAdd: (item: Item) => void;
  onChange: (id: string, patch: Partial<Item>) => void;
  onRemove: (id: string) => void;
  onField: (name: string, value: FieldValue) => void;
  onLink: (l: { url?: string; dest?: unknown }) => void;
};

const SHAPE_SIZE: Record<Exclude<ShapeKind, "ink">, [number, number]> = { line: [120, 12], arrow: [120, 16], rect: [120, 80], ellipse: [120, 80] };

export function PdfPage(props: Props) {
  const { pageRef, page, number, scale, items, stamps, fields, values, tool, selectedId, editingId, query, activeMatch, nextFieldName, onSelect, onEdit, onAdd, onChange, onRemove, onField, onLink } = props;
  const vp = viewportOf(page, pageRef, scale);
  const crop = cropOf(pageRef);
  const selected = items.find((it) => it.id === selectedId);
  const [stroke, setStroke] = useState<[number, number][] | null>(null);

  const pointIn = (e: React.PointerEvent, el: Element) => {
    const r = el.getBoundingClientRect();
    return [(e.clientX - r.left) / scale, (e.clientY - r.top) / scale] as [number, number];
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).closest("[data-text-layer]")) return;
    const [x, y] = pointIn(e, e.currentTarget);
    const base = { id: crypto.randomUUID(), page: pageRef.id };
    if (tool.kind === "text") {
      e.preventDefault(); // keep focus on the new text box
      onAdd({ ...base, kind: "text", x, y: y - 8, text: tool.preset ?? "", size: 14, color: "#000000" });
      if (!tool.preset) onEdit(base.id);
    } else if (tool.kind === "image") {
      const h = tool.width * tool.ratio;
      onAdd({ ...base, kind: "image", x: x - tool.width / 2, y: y - h / 2, w: tool.width, h, src: tool.src });
    } else if (tool.kind === "rect") {
      const { w, h } = RECT_STYLES[tool.style];
      onAdd({ ...base, kind: "rect", x: x - w / 2, y: y - h / 2, w, h, style: tool.style });
    } else if (tool.kind === "shape") {
      const [w, h] = SHAPE_SIZE[tool.shape];
      onAdd({ ...base, kind: "shape", shape: tool.shape, x: x - w / 2, y: y - h / 2, w, h, color: "#c62828", width: 2 });
    } else if (tool.kind === "note") {
      onAdd({ ...base, kind: "note", x: x - NOTE_SIZE / 2, y: y - NOTE_SIZE / 2, text: "" });
    } else if (tool.kind === "field") {
      const [w, h] = tool.field === "checkbox" ? [14, 14] : [160, 22];
      onAdd({ ...base, kind: "field", field: tool.field, name: nextFieldName(), x: x - w / 2, y: y - h / 2, w, h });
    } else if (tool.kind === "pen") {
      e.preventDefault();
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture?.(e.pointerId);
      const pts: [number, number][] = [[x, y]];
      setStroke(pts);
      const move = (ev: PointerEvent) => {
        const r = el.getBoundingClientRect();
        pts.push([(ev.clientX - r.left) / scale, (ev.clientY - r.top) / scale]);
        setStroke([...pts]);
      };
      const up = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        setStroke(null);
        if (pts.length > 1) onAdd({ ...base, ...inkFromPoints(pts, tool.width), kind: "shape", shape: "ink", color: tool.color, width: tool.width });
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
    } else {
      onSelect(null);
      // A focused text box commits on its own blur, which fires after this pointerdown.
      if (!(document.activeElement as HTMLElement | null)?.isContentEditable) onEdit(null);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3" data-page-id={pageRef.id}>
      {/* The crop is a window over the full page: everything inside keeps uncropped page coordinates. */}
      <div className="paper relative shrink-0 overflow-hidden" style={{ width: vp.width - (crop.left + crop.right) * scale, height: vp.height - (crop.top + crop.bottom) * scale }}>
        <div
          data-page-surface={pageRef.id}
          className={cn("absolute", tool.kind !== "select" && "cursor-crosshair")}
          style={{ left: -crop.left * scale, top: -crop.top * scale, width: vp.width, height: vp.height }}
          onPointerDown={onPointerDown}
        >
          {/* Only the base PDF has live inputs; other pages keep their widgets drawn in the bitmap. */}
          <PageCanvas page={page} viewport={vp} forms={fields.length > 0} />
          <PageText page={page} viewport={vp} selectable={tool.kind === "select"} query={query} active={activeMatch} />
          <PageLinks page={page} viewport={vp} active={tool.kind === "select"} onOpen={onLink} />
          {fields.map((f, i) => (
            <FieldInput key={i} field={f} value={values(f)} vp={vp} scale={scale} onChange={(v) => onField(f.name, v)} />
          ))}
          {stamps.map((s) => (
            <div key={s.id} className="pointer-events-none absolute" style={textStyle(s, scale)}>
              {s.text}
            </div>
          ))}
          {items.map((it) => (
            <OverlayItem
              key={it.id}
              item={it}
              scale={scale}
              selected={selectedId === it.id}
              editing={editingId === it.id}
              onSelect={() => onSelect(it.id)}
              onEdit={onEdit}
              onChange={(p) => onChange(it.id, p)}
              onRemove={() => onRemove(it.id)}
            />
          ))}
          {stroke && tool.kind === "pen" && (
            <svg className="pointer-events-none absolute inset-0 size-full overflow-visible">
              <polyline points={stroke.map(([x, y]) => `${x * scale},${y * scale}`).join(" ")} fill="none" stroke={tool.color} strokeWidth={tool.width * scale} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {selected && editingId !== selected.id && (
            <ItemBar key={selected.id} item={selected} scale={scale} pageHeight={vp.height} onChange={(p) => onChange(selected.id, p)} onRemove={() => onRemove(selected.id)} />
          )}
        </div>
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{number}</span>
    </div>
  );
}

// A freehand stroke becomes a path relative to its own bounding box, smoothed through the midpoints of the samples.
function inkFromPoints(pts: [number, number][], width: number) {
  const pad = width;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x, y] = [Math.min(...xs) - pad, Math.min(...ys) - pad];
  const w = Math.max(...xs) + pad - x;
  const h = Math.max(...ys) + pad - y;
  const local = pts.map(([px, py]) => [+(px - x).toFixed(2), +(py - y).toFixed(2)]);
  let d = `M${local[0][0]} ${local[0][1]}`;
  for (let i = 1; i < local.length - 1; i++) {
    const [mx, my] = [(local[i][0] + local[i + 1][0]) / 2, (local[i][1] + local[i + 1][1]) / 2];
    d += ` Q${local[i][0]} ${local[i][1]} ${mx.toFixed(2)} ${my.toFixed(2)}`;
  }
  const last = local[local.length - 1];
  d += ` L${last[0]} ${last[1]}`;
  return { x, y, w, h, d, vw: w, vh: h };
}

const textStyle = (t: TextItem, scale: number): React.CSSProperties => ({
  left: t.x * scale,
  top: t.y * scale,
  fontSize: t.size * scale,
  lineHeight: LINE_HEIGHT,
  fontFamily: TEXT_FONT,
  color: t.color,
  opacity: t.opacity,
  whiteSpace: "pre",
  rotate: t.rotate ? `${-t.rotate}deg` : undefined,
});

// Screen-space (y down) rotation of a vector by `deg` counter-clockwise.
const rot = (dx: number, dy: number, deg: number): [number, number] => {
  const r = (deg * Math.PI) / 180;
  return [dx * Math.cos(r) + dy * Math.sin(r), -dx * Math.sin(r) + dy * Math.cos(r)];
};

// The rotated item's axis-aligned bounds, so its toolbar sits clear of it at any angle.
function bounds(it: Item) {
  const { w, h } = itemSize(it);
  const [cx, cy] = [it.x + w / 2, it.y + h / 2];
  const r = ((it.rotate ?? 0) * Math.PI) / 180;
  const ey = Math.abs((w / 2) * Math.sin(r)) + Math.abs((h / 2) * Math.cos(r));
  return { cx, top: cy - ey, bottom: cy + ey };
}

const COLORS = [
  { value: "#000000", label: t("Nero") },
  { value: "#1d3fa8", label: t("Blu inchiostro") },
  { value: "#c62828", label: t("Rosso") },
];

const canRotate = (it: Item) => it.kind !== "note" && it.kind !== "field";

function ColorSwatches({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  return (
    <>
      {COLORS.map((c) => (
        <button
          key={c.value}
          aria-label={c.label}
          title={c.label}
          onClick={() => onPick(c.value)}
          className={cn(
            "size-5 rounded-full shadow-[inset_0_0_0_1px_oklch(1_0_0/0.25)] outline-offset-2 transition-[outline-color,scale] duration-150 active:scale-[0.96]",
            value === c.value ? "outline-2 outline-ink" : "outline-2 outline-transparent hover:outline-border",
          )}
          style={{ background: c.value }}
        />
      ))}
      <label className="relative inline-flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground" title={t("Altro colore")}>
        <Palette className="size-4 stroke-[1.75]" />
        <input type="color" aria-label={t("Altro colore")} className="absolute inset-0 cursor-pointer opacity-0" value={value} onChange={(e) => onPick(e.target.value)} />
      </label>
    </>
  );
}

function Stepper({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <>
      <ToolButton label={t("{label}: meno", { label })} side="top" onClick={() => onChange(Math.max(min, +(value - step).toFixed(1)))}>
        <Minus />
      </ToolButton>
      <span className="w-7 text-center text-[13px] tabular-nums" aria-label={label}>
        {value}
      </span>
      <ToolButton label={t("{label}: più", { label })} side="top" onClick={() => onChange(Math.min(max, +(value + step).toFixed(1)))}>
        <Plus />
      </ToolButton>
    </>
  );
}

function ItemBar({ item, scale, pageHeight, onChange, onRemove }: { item: Item; scale: number; pageHeight: number; onChange: (p: Partial<Item>) => void; onRemove: () => void }) {
  const b = bounds(item);
  const tall = item.kind === "note" ? 120 : 44;
  // Above the item, clear of the rotation handle, so the work stays visible; below only near the page top.
  const above = b.top * scale - tall - 46 > 0;
  const angle = Math.round(item.rotate ?? 0);
  const setAngle = (deg: number) => onChange({ rotate: ((((deg + 180) % 360) + 360) % 360) - 180 });

  return (
    <div
      className="absolute z-20 -translate-x-1/2"
      style={{ left: b.cx * scale, top: above ? b.top * scale - tall - 46 : Math.min(b.bottom * scale + 14, pageHeight - tall) }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <FloatBar className="gap-1 whitespace-nowrap">
        {item.kind === "text" && (
          <>
            <Stepper label={t("Dimensione")} value={item.size} min={4} max={144} onChange={(size) => onChange({ size })} />
            <BarDivider />
            <ColorSwatches value={item.color} onPick={(color) => onChange({ color })} />
            <BarDivider />
          </>
        )}
        {item.kind === "shape" && (
          <>
            <Stepper label={t("Spessore")} value={item.width} min={0.5} max={12} step={0.5} onChange={(width) => onChange({ width })} />
            <BarDivider />
            <ColorSwatches value={item.color} onPick={(color) => onChange({ color })} />
            <BarDivider />
          </>
        )}
        {item.kind === "note" && (
          <>
            <textarea
              autoFocus
              aria-label={t("Testo del commento")}
              placeholder={t("Scrivi un commento…")}
              value={item.text}
              onChange={(e) => onChange({ text: e.target.value })}
              className="h-24 w-64 resize-none rounded-[10px] bg-muted px-2.5 py-2 text-[13px] whitespace-normal outline-none focus:ring-2 focus:ring-ring"
            />
            <BarDivider />
          </>
        )}
        {item.kind === "field" && (
          <>
            <label className="flex h-8 items-center gap-1.5 rounded-[10px] bg-muted px-2.5 text-[13px] focus-within:ring-2 focus-within:ring-ring">
              <span className="text-muted-foreground">{t("Nome")}</span>
              <input aria-label={t("Nome del campo")} value={item.name} onChange={(e) => onChange({ name: e.target.value })} className="w-28 bg-transparent outline-none" />
            </label>
            <BarDivider />
          </>
        )}
        {canRotate(item) && (
          <>
            <ToolButton label={t("Ruota di 90°")} side="top" onClick={() => setAngle(angle + 90)}>
              <RotateCcw />
            </ToolButton>
            <label className="flex h-8 items-center rounded-[10px] bg-muted px-2 text-[13px] focus-within:ring-2 focus-within:ring-ring">
              <input
                aria-label={t("Rotazione in gradi")}
                type="number"
                step={1}
                value={angle}
                onChange={(e) => setAngle(Number(e.target.value) || 0)}
                style={{ width: `${Math.max(1, String(angle).length)}ch` }}
                className="bg-transparent text-right tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-muted-foreground">°</span>
            </label>
            <BarDivider />
          </>
        )}
        <ToolButton label={t("Elimina")} shortcut="⌫" side="top" onClick={onRemove} className="hover:bg-destructive/10 hover:text-destructive">
          <Trash2 />
        </ToolButton>
      </FloatBar>
    </div>
  );
}

function FieldInput({ field: f, value, vp, scale, onChange }: { field: Field; value: FieldValue; vp: PageViewport; scale: number; onChange: (v: FieldValue) => void }) {
  const [x1, y1] = vp.convertToViewportPoint(f.rect[0], f.rect[1]);
  const [x2, y2] = vp.convertToViewportPoint(f.rect[2], f.rect[3]);
  const style = { left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
  const cls = "absolute z-[2] rounded-[2px] text-black bg-ink/8 hover:bg-ink/14 focus:bg-ink/6 outline-none focus:ring-2 ring-ink/60 transition-[background-color] duration-150 disabled:bg-transparent";
  const fontSize = Math.min(style.height * 0.7, 12 * scale);

  if (f.type === "checkbox" || f.type === "radio")
    return (
      <input
        type={f.type}
        name={f.name}
        disabled={f.readOnly}
        className={cn(cls, "m-0 accent-ink")}
        style={style}
        checked={f.type === "checkbox" ? !!value : value === f.exportValue}
        onChange={(e) => onChange(f.type === "checkbox" ? e.target.checked : f.exportValue)}
      />
    );
  if (f.type === "choice")
    return (
      <select disabled={f.readOnly} className={cls} style={{ ...style, fontSize }} value={String(value)} onChange={(e) => onChange(e.target.value)}>
        <option value="" />
        {f.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  const Tag = f.multiLine ? "textarea" : "input";
  return <Tag disabled={f.readOnly} maxLength={f.maxLength} className={cn(cls, "resize-none px-0.5")} style={{ ...style, fontSize, fontFamily: TEXT_FONT }} value={String(value)} onChange={(e) => onChange(e.target.value)} />;
}

type ItemProps = {
  item: Item;
  scale: number;
  selected: boolean;
  editing: boolean;
  onSelect: () => void;
  onEdit: (id: string | null) => void;
  onChange: (patch: Partial<Item>) => void;
  onRemove: () => void;
};

const HANDLE = "absolute size-2.5 rounded-[2px] border-[1.5px] border-ink bg-white";

function OverlayItem({ item, scale, selected, editing, onSelect, onEdit, onChange, onRemove }: ItemProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing || !ref.current) return;
    const el = ref.current;
    el.focus();
    getSelection()?.selectAllChildren(el);
    getSelection()?.collapseToEnd();
  }, [editing]);

  // One gesture handler for move, corner resize and rotate.
  const drag = (e: React.PointerEvent, mode: "move" | "resize" | "rotate") => {
    if (editing) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    const start = { ...item };
    const deg = start.rotate ?? 0;
    const box = ref.current!.getBoundingClientRect();
    const [cx, cy] = [box.left + box.width / 2, box.top + box.height / 2];
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx);
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);

    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - e.clientX) / scale;
      const dy = (ev.clientY - e.clientY) / scale;
      if (mode === "move") return onChange({ x: start.x + dx, y: start.y + dy });
      if (mode === "rotate") {
        // Screen angles grow clockwise; item rotation is counter-clockwise. Shift snaps to 15°.
        let next = deg - ((Math.atan2(ev.clientY - cy, ev.clientX - cx) - a0) * 180) / Math.PI;
        if (ev.shiftKey) next = Math.round(next / 15) * 15;
        return onChange({ rotate: ((((next + 180) % 360) + 360) % 360) - 180 });
      }
      if (start.kind === "text" || start.kind === "note") return;
      // Resize in the item's own axes, keeping its unrotated top-left corner fixed on screen.
      const keepRatio = start.kind === "image" || (start.kind === "shape" && start.shape === "ink");
      const [lx, ly] = rot(dx, dy, -deg);
      const w = Math.max(4, start.w + lx);
      const h = keepRatio ? (w * start.h) / start.w : Math.max(2, start.h + ly);
      const [ax, ay] = rot(-start.w / 2, -start.h / 2, deg);
      const [bx, by] = rot(-w / 2, -h / 2, deg);
      const [ccx, ccy] = [start.x + start.w / 2 + ax - bx, start.y + start.h / 2 + ay - by];
      onChange({ w, h, x: ccx - w / 2, y: ccy - h / 2 });
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  const outline = selected || editing ? "outline-[1.5px] outline-ink" : "outline-1 outline-transparent hover:outline-ink/60";
  const handles = selected && !editing && (
    <>
      {canRotate(item) && (
        <>
          <span aria-hidden className="absolute -top-6 left-1/2 h-4 w-px -translate-x-1/2 bg-ink" />
          {/* the labelled number field in the item bar is the accessible control */}
          <span aria-hidden className="absolute -top-8 left-1/2 size-3 -translate-x-1/2 cursor-grab rounded-full border-[1.5px] border-ink bg-white active:cursor-grabbing" onPointerDown={(e) => drag(e, "rotate")} />
        </>
      )}
      {item.kind !== "text" && item.kind !== "note" && <span className={cn(HANDLE, "-right-[5px] -bottom-[5px] cursor-nwse-resize")} onPointerDown={(e) => drag(e, "resize")} />}
    </>
  );

  if (item.kind === "note")
    return (
      <div
        ref={ref}
        title={item.text || t("Commento")}
        className={cn("absolute flex cursor-move items-center justify-center rounded-[4px] bg-[#ffd23f] text-black/70 shadow-[0_1px_3px_oklch(0_0_0/0.3)]", outline)}
        style={{ left: item.x * scale, top: item.y * scale, width: NOTE_SIZE * scale, height: NOTE_SIZE * scale }}
        onPointerDown={(e) => drag(e, "move")}
      >
        <MessageSquareText style={{ width: NOTE_SIZE * scale * 0.65, height: NOTE_SIZE * scale * 0.65 }} strokeWidth={1.75} />
      </div>
    );

  if (item.kind !== "text") {
    const rect = item.kind === "rect" ? RECT_STYLES[item.style] : null;
    return (
      <div
        ref={ref}
        className={cn("absolute cursor-move transition-[outline-color] duration-150", outline, rect?.multiply && "mix-blend-multiply")}
        style={{ left: item.x * scale, top: item.y * scale, width: item.w * scale, height: item.h * scale, rotate: item.rotate ? `${-item.rotate}deg` : undefined }}
        onPointerDown={(e) => drag(e, "move")}
      >
        {item.kind === "rect" && <div className="size-full" style={{ background: rect!.color, opacity: rect!.opacity }} />}
        {item.kind === "image" && <img src={item.src} alt="" draggable={false} className="pointer-events-none size-full" />}
        {item.kind === "shape" && (
          <svg viewBox={`0 0 ${item.vw ?? item.w} ${item.vh ?? item.h}`} preserveAspectRatio="none" className="pointer-events-none size-full overflow-visible">
            <path d={shapePath(item)} fill="none" stroke={item.color} strokeWidth={item.width} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {item.kind === "field" &&
          (item.field === "checkbox" ? (
            <div className="size-full rounded-[2px] border border-dashed border-ink bg-ink/10" />
          ) : (
            <div className="flex size-full items-center overflow-hidden rounded-[2px] border border-dashed border-ink bg-ink/10 px-1 text-ink" style={{ fontSize: Math.min(item.h * 0.55, 11) * scale }}>
              {item.name}
            </div>
          ))}
        {handles}
      </div>
    );
  }

  return (
    <div className="absolute" style={{ left: item.x * scale, top: item.y * scale, rotate: item.rotate ? `${-item.rotate}deg` : undefined }}>
      <div
        key={editing ? "edit" : item.text} // remount so React never reconciles text the browser edited
        ref={ref}
        contentEditable={editing ? "plaintext-only" : false}
        suppressContentEditableWarning
        spellCheck={false}
        className={cn("min-w-4 transition-[outline-color] duration-150", outline, editing ? "cursor-text" : "cursor-move")}
        style={{ ...textStyle(item, scale), left: undefined, top: undefined, rotate: undefined }}
        onPointerDown={(e) => (editing ? e.stopPropagation() : drag(e, "move"))}
        onDoubleClick={() => onEdit(item.id)}
        onBlur={(e) => {
          const text = e.currentTarget.innerText.replace(/\n$/, "");
          text.trim() ? onChange({ text }) : onRemove();
          onEdit(null); // after the text lands, so the empty-box cleanup sees it
        }}
        onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
      >
        {item.text}
      </div>
      {handles}
    </div>
  );
}
