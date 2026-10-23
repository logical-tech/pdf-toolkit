import { useEffect, useRef, useState } from "react";
import { AnnotationMode, type PageViewport, type PDFPageProxy } from "pdfjs-dist";

// Renders a page lazily (once near the viewport) at the size of `viewport`.
// `forms` leaves form widgets out of the bitmap, for when the editor draws its own inputs on top.
export function PageCanvas({ page, viewport, forms = false }: { page: PDFPageProxy; viewport: PageViewport; forms?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "800px" });
    io.observe(ref.current!);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const canvas = ref.current!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    const task = page.render({
      canvas,
      viewport,
      transform: [dpr, 0, 0, dpr, 0, 0],
      annotationMode: forms ? AnnotationMode.ENABLE_FORMS : AnnotationMode.ENABLE,
    });
    task.promise.catch(() => {}); // cancelled on re-render
    return () => task.cancel();
  }, [visible, page, viewport.width, viewport.height, viewport.rotation, forms]);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 size-full" />;
}
