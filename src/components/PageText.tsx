import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TextLayer, type PageViewport, type PDFPageProxy } from "pdfjs-dist";

// Occurrences of `query` in a page's text items, in reading order; shared with the search counter so indexes line up.
export function findInItems(items: string[], query: string): { item: number; start: number }[] {
  const q = query.toLocaleLowerCase();
  const out: { item: number; start: number }[] = [];
  if (!q) return out;
  items.forEach((s, item) => {
    const t = s.toLocaleLowerCase();
    for (let i = t.indexOf(q); i !== -1; i = t.indexOf(q, i + q.length)) out.push({ item, start: i });
  });
  return out;
}

type Props = { page: PDFPageProxy; viewport: PageViewport; selectable: boolean; query: string; active: number | null };

// pdf.js text layer: invisible, selectable text over the canvas, plus search highlights.
export function PageText({ page, viewport, selectable, query, active }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [layer, setLayer] = useState<{ divs: HTMLElement[]; strs: string[] } | null>(null);
  const [marks, setMarks] = useState<{ x: number; y: number; w: number; h: number; active: boolean }[]>([]);

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "800px" });
    io.observe(ref.current!);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const container = ref.current!;
    container.replaceChildren();
    setLayer(null);
    const tl = new TextLayer({ textContentSource: page.streamTextContent(), container, viewport });
    tl.render()
      .then(() => setLayer({ divs: tl.textDivs, strs: tl.textContentItemsStr }))
      .catch(() => {});
    return () => tl.cancel();
  }, [visible, page, viewport.scale, viewport.rotation]);

  useLayoutEffect(() => {
    if (!layer || !query) return setMarks([]);
    const box = ref.current!.getBoundingClientRect();
    const found = findInItems(layer.strs, query);
    const next: typeof marks = [];
    let activeEl: { top: number } | null = null;
    found.forEach((f, k) => {
      const node = layer.divs[f.item]?.firstChild;
      if (!node) return;
      const range = document.createRange();
      range.setStart(node, Math.min(f.start, node.textContent!.length));
      range.setEnd(node, Math.min(f.start + query.length, node.textContent!.length));
      for (const r of range.getClientRects()) {
        next.push({ x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height, active: k === active });
        if (k === active) activeEl = { top: r.top };
      }
    });
    setMarks(next);
    if (activeEl) layer.divs[found[active!].item]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [layer, query, active]);

  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {marks.map((m, i) => (
          <span
            key={i}
            className={m.active ? "absolute rounded-[2px] bg-[oklch(0.75_0.18_60/0.55)] outline-2 outline-[oklch(0.65_0.2_50)]" : "absolute rounded-[2px] bg-[oklch(0.9_0.17_100/0.6)] mix-blend-multiply"}
            style={{ left: m.x, top: m.y, width: m.w, height: m.h }}
          />
        ))}
      </div>
      <div
        ref={ref}
        className="textLayer"
        data-text-layer
        style={{ pointerEvents: selectable ? "auto" : "none", ["--total-scale-factor" as string]: viewport.scale, ["--scale-round-x" as string]: "1px", ["--scale-round-y" as string]: "1px" }}
      />
    </>
  );
}

type Link = { rect: [number, number, number, number]; url?: string; dest?: unknown };

// Clickable areas for the PDF's own links: web links open in the browser, internal ones jump to their page.
export function PageLinks({ page, viewport, active, onOpen }: { page: PDFPageProxy; viewport: PageViewport; active: boolean; onOpen: (l: { url?: string; dest?: unknown }) => void }) {
  const [links, setLinks] = useState<Link[]>([]);
  useEffect(() => {
    let alive = true;
    // pdf.js annotation objects are untyped
    page.getAnnotations().then((anns: any[]) => alive && setLinks(anns.filter((a) => a.subtype === "Link" && (a.url || a.dest)).map((a) => ({ rect: a.rect, url: a.url, dest: a.dest }))));
    return () => {
      alive = false;
    };
  }, [page]);
  if (!active) return null;
  return (
    <>
      {links.map((l, i) => {
        const [x1, y1] = viewport.convertToViewportPoint(l.rect[0], l.rect[1]);
        const [x2, y2] = viewport.convertToViewportPoint(l.rect[2], l.rect[3]);
        return (
          <button
            key={i}
            title={l.url ?? "Vai alla pagina"}
            aria-label={l.url ? `Apri ${l.url}` : "Vai alla pagina collegata"}
            className="absolute z-[1] cursor-pointer rounded-[2px] hover:bg-ink/10"
            style={{ left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onOpen(l)}
          />
        );
      })}
    </>
  );
}
