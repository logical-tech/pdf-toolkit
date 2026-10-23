import {
  BlendMode,
  PDFAcroTerminal,
  PDFArray,
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFOptionList,
  PDFPage,
  PDFPageLeaf,
  PDFRadioGroup,
  PDFRef,
  PDFStream,
  PDFTextField,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
} from "@cantoo/pdf-lib";
import { getDocument, type PDFPageProxy } from "pdfjs-dist";
import {
  LINE_HEIGHT,
  NOTE_SIZE,
  RECT_STYLES,
  cropOf,
  pageProxy,
  rotatedPoint,
  shapePath,
  textMetrics,
  viewportOf,
  type Bookmark,
  type ExportOptions,
  type Item,
  type Layout,
  type Source,
  type Work,
} from "@/lib/document";
import { compressJpegs, pageToPng } from "@/lib/tools";

const N = PDFName.of;

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

// pdf-lib's removePage/insertPage corrupt the tree's Count entries when every page is moved, so the tree is
// rewritten as one flat node. Inherited attributes are copied onto each page first, since the old intermediate nodes go away.
function setPageTree(doc: PDFDocument, list: PDFPage[]) {
  const rootRef = doc.catalog.get(N("Pages")) as PDFRef;
  const root = doc.catalog.Pages();
  for (const page of list)
    for (const key of PDFPageLeaf.InheritableEntries) {
      const value = page.node.getInheritableAttribute(N(key));
      if (value && !page.node.get(N(key))) page.node.set(N(key), value);
    }
  for (const key of PDFPageLeaf.InheritableEntries) root.delete(N(key));
  root.set(N("Kids"), doc.context.obj(list.map((p) => p.ref)));
  root.set(N("Count"), PDFNumber.of(list.length));
  for (const page of list) page.node.set(N("Parent"), rootRef);
  // private in pdf-lib: the page cache must be rebuilt from the new tree
  const internals = doc as unknown as { pageCache: { invalidate(): void }; pageMap: Map<unknown, PDFPage> };
  for (const page of list) internals.pageMap.set(page.node, page);
  internals.pageCache.invalidate();
}

// A second, independent page object for a page used twice: its own Contents array, so drawing on one leaves the other alone.
function clonePage(doc: PDFDocument, page: PDFPage): PDFPage {
  const node = page.node.clone(doc.context);
  const contents = node.get(N("Contents"));
  if (contents instanceof PDFArray) node.set(N("Contents"), doc.context.obj(contents.asArray()));
  node.delete(N("Annots")); // form widgets belong to one page only
  return PDFPage.of(node, doc.context.register(node), doc);
}

// Empty dropped pages (outlines or the structure tree may still point at them) and drop form fields that only lived there.
function stripPages(doc: PDFDocument, dropped: PDFPage[]) {
  if (!dropped.length) return;
  const tags = new Set(dropped.map((p) => p.ref.tag));
  const acroForm = doc.getForm().acroForm;
  for (const [field] of acroForm.getFields()) {
    if (!(field instanceof PDFAcroTerminal)) continue;
    const widgets = field.getWidgets();
    if (widgets.length && widgets.every((w) => w.P() && tags.has(w.P()!.tag))) acroForm.removeField(field);
  }
  for (const page of dropped) {
    page.node.set(N("Contents"), doc.context.obj([]));
    for (const key of ["Resources", "Annots", "Thumb", "B"]) page.node.delete(N(key));
  }
}

// pdf-lib writes every object it ever loaded, reachable or not; keep only what the trailer still reaches.
function dropUnreachable(doc: PDFDocument) {
  const ctx = doc.context;
  const seen = new Set<string>();
  const stack: unknown[] = [ctx.trailerInfo.Root, ctx.trailerInfo.Info, ctx.trailerInfo.Encrypt];
  while (stack.length) {
    const o = stack.pop();
    if (o instanceof PDFRef) {
      if (seen.has(o.tag)) continue;
      seen.add(o.tag);
      stack.push(ctx.lookup(o));
    } else if (o instanceof PDFDict) stack.push(...o.values());
    else if (o instanceof PDFArray) stack.push(...o.asArray());
    else if (o instanceof PDFStream) stack.push(o.dict);
  }
  for (const [ref] of ctx.enumerateIndirectObjects()) if (!seen.has(ref.tag)) ctx.delete(ref);
}

// Metadata, scripts, attachments and private application data that travel unseen with a PDF.
function sanitize(doc: PDFDocument) {
  for (const key of ["Metadata", "OpenAction", "AA", "PieceInfo", "Names"]) doc.catalog.delete(N(key));
  const info = doc.context.lookup(doc.context.trailerInfo.Info);
  if (info instanceof PDFDict) for (const key of info.keys()) info.delete(key);
  for (const page of doc.getPages()) {
    for (const key of ["AA", "PieceInfo"]) page.node.delete(N(key));
    const annots = page.node.Annots();
    for (const ref of annots?.asArray() ?? []) {
      const a = doc.context.lookup(ref);
      const action = a instanceof PDFDict ? a.lookup(N("A")) : undefined;
      if (a instanceof PDFDict && action instanceof PDFDict && action.get(N("S")) === N("JavaScript")) a.delete(N("A"));
    }
  }
}

function writeOutline(doc: PDFDocument, entries: { title: string; page: PDFPage }[]) {
  doc.catalog.delete(N("Outlines"));
  if (!entries.length) return;
  const ctx = doc.context;
  const rootRef = ctx.nextRef();
  const refs = entries.map(() => ctx.nextRef());
  entries.forEach((e, i) => {
    const item: Record<string, unknown> = { Title: PDFHexString.fromText(e.title), Parent: rootRef, Dest: [e.page.ref, N("Fit")] };
    if (i > 0) item.Prev = refs[i - 1];
    if (i < refs.length - 1) item.Next = refs[i + 1];
    ctx.assign(refs[i], ctx.obj(item as never));
  });
  ctx.assign(rootRef, ctx.obj({ Type: "Outlines", First: refs[0], Last: refs[refs.length - 1], Count: refs.length }));
  doc.catalog.set(N("Outlines"), rootRef);
}

// Re-lay pages onto A4 sheets: one per sheet scaled to fit, or 2 / 4 per sheet. Returns the new pages.
async function relayout(doc: PDFDocument, pages: PDFPage[], layout: Exclude<Layout, "original">): Promise<PDFPage[]> {
  const A4: [number, number] = [595.28, 841.89];
  const per = layout === "2up" ? 2 : layout === "4up" ? 4 : 1;
  const boxes = pages.map((p) => {
    const b = p.getCropBox();
    return { left: b.x, bottom: b.y, right: b.x + b.width, top: b.y + b.height };
  });
  const embedded = await doc.embedPages(pages, boxes);
  const out: PDFPage[] = [];
  for (let i = 0; i < pages.length; i += per) {
    const group = pages.slice(i, i + per);
    const rot = (p: PDFPage) => ((p.getRotation().angle % 360) + 360) % 360;
    // A single page keeps its own orientation; 2-up runs landscape side by side, 4-up portrait in a 2×2 grid.
    const landscape = per === 2 || (per === 1 && (() => { const e = embedded[i]; const r = rot(group[0]); return (r % 180 ? e.height : e.width) > (r % 180 ? e.width : e.height); })());
    const [W, H] = landscape ? [A4[1], A4[0]] : A4;
    const cols = per === 1 ? 1 : 2;
    const rows = per === 4 ? 2 : 1;
    const sheet = PDFPage.create(doc);
    sheet.setSize(W, H);
    const margin = per === 1 ? 0 : 18;
    const [cw, ch] = [(W - margin * (cols + 1)) / cols, (H - margin * (rows + 1)) / rows];
    group.forEach((p, k) => {
      const e = embedded[i + k];
      const r = rot(p);
      const [dw, dh] = r % 180 ? [e.height, e.width] : [e.width, e.height];
      const s = Math.min(cw / dw, ch / dh);
      const [col, row] = [k % cols, Math.floor(k / cols)];
      // Bottom-left of the displayed page inside its cell, centred.
      const bx = margin + col * (cw + margin) + (cw - dw * s) / 2;
      const by = H - (margin + row * (ch + margin)) - ch + (ch - dh * s) / 2;
      // The XObject is unrotated; turn it clockwise like /Rotate would, pivoting on the corner that lands bottom-left.
      const anchor: Record<number, [number, number]> = { 0: [bx, by], 90: [bx, by + e.width * s], 180: [bx + e.width * s, by + e.height * s], 270: [bx + e.height * s, by] };
      const [x, y] = anchor[r];
      sheet.drawPage(e, { x, y, xScale: s, yScale: s, rotate: degrees(-r) });
    });
    out.push(sheet);
  }
  await doc.flush(); // embed now, while the source pages still have their content
  return out;
}

const load = (s: Source) => PDFDocument.load(s.bytes, { password: s.password ?? "" });

function drawOcr(page: PDFPage, words: Work["ocr"][string], font: PDFFont, toPdf: (x: number, y: number) => [number, number], rotate: ReturnType<typeof degrees>) {
  for (const w of words) {
    // Helvetica's WinAnsi set: replace anything it cannot encode instead of failing the whole save.
    const text = [...w.text].map((ch) => { try { font.encodeText(ch); return ch; } catch { return "?"; } }).join("");
    if (!text.trim()) continue;
    const unit = font.widthOfTextAtSize(text, 1);
    const size = Math.max(1, Math.min(w.h, unit ? w.w / unit : w.h));
    const [x, y] = toPdf(w.x, w.y + w.h * 0.8);
    page.drawText(text, { x, y, size, font, opacity: 0, rotate });
  }
}

export async function exportPdf(sources: Source[], work: Pick<Work, "pages" | "items" | "edits" | "bookmarks" | "attachments" | "ocr">, opts: Partial<ExportOptions> = {}): Promise<Uint8Array> {
  const { pages, items, edits } = work;
  const [base] = sources;
  const doc = await load(base);
  const onPages = (it: Item) => pages.some((p) => p.id === it.page);
  const hasRedactions = items.some((i) => i.kind === "rect" && i.style === "redact" && onPages(i));
  const layout = opts.layout ?? "original";
  const flattenAll = !!opts.flatten || hasRedactions || layout !== "original";

  const form = doc.getForm();
  for (const [name, value] of Object.entries(edits)) {
    const f = form.getFieldMaybe(name);
    if (f instanceof PDFTextField) f.setText(String(value));
    else if (f instanceof PDFCheckBox) value ? f.check() : f.uncheck();
    else if (f instanceof PDFRadioGroup) value ? f.select(String(value)) : f.clear();
    else if (f instanceof PDFDropdown || f instanceof PDFOptionList) {
      // Write the export value directly: select() takes display labels and turns unknown values into free text.
      f.acroField.setValues(value ? [PDFHexString.fromText(String(value))] : []);
      form.markFieldAsDirty(f.ref);
    }
  }
  // Rasterised or re-laid pages lose their widgets, so bake form values into the content first.
  if (flattenAll) form.flatten();

  // Rebuild the page list in the order of `pages`, copying pages from other sources into the base.
  const own = doc.getPages();
  const copied = new Map<string, PDFPage>(); // PageRef id → page copied from another source
  for (const src of sources.slice(1)) {
    const refs = pages.filter((p) => p.source === src.id);
    if (!refs.length) continue;
    const other = await load(src);
    if (flattenAll) other.getForm().flatten();
    // One copyPages call per source, so fonts and images shared between its pages are copied once.
    const copies = await doc.copyPages(other, refs.map((r) => r.index));
    refs.forEach((r, i) => copied.set(r.id, copies[i]));
  }
  // Clone every repeat of a page before any of them is rotated or cropped, so each copy starts from the original.
  const used = new Set<PDFPage>();
  const objects = pages.map((ref) => {
    const page = ref.source === base.id ? own[ref.index] : copied.get(ref.id)!;
    if (!used.has(page)) return used.add(page), page;
    return clonePage(doc, page);
  });
  const placed = new Map<string, { page: PDFPage; proxy: PDFPageProxy }>();
  for (const [i, ref] of pages.entries()) {
    const page = objects[i];
    page.setRotation(degrees((page.getRotation().angle + ref.rotation) % 360));
    const proxy = pageProxy(sources, ref);
    const c = cropOf(ref);
    if (c.top || c.right || c.bottom || c.left) {
      const vp = viewportOf(proxy, ref, 1);
      const [x1, y1] = vp.convertToPdfPoint(c.left, c.top) as [number, number];
      const [x2, y2] = vp.convertToPdfPoint(vp.width - c.right, vp.height - c.bottom) as [number, number];
      page.setCropBox(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    }
    placed.set(ref.id, { page, proxy });
  }
  let final = pages.map((ref) => placed.get(ref.id)!.page);
  setPageTree(doc, final);

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const images = new Map<string, Awaited<ReturnType<typeof doc.embedPng>>>();
  const fieldNames = new Set(form.getFields().map((f) => f.getName()));
  for (const it of items) {
    const target = placed.get(it.page);
    if (!target) continue;
    const ref = pages.find((p) => p.id === it.page)!;
    const vp = viewportOf(target.proxy, ref, 1);
    const toPdf = (x: number, y: number) => vp.convertToPdfPoint(x, y) as [number, number];
    // pdf-lib rotates counter-clockwise; /Rotate turns the page clockwise, so this keeps content upright on screen.
    const rotate = degrees((it.rotate ?? 0) + vp.rotation);
    const { page } = target;
    // Shapes are drawn from their bottom-left corner, text from each line's baseline start, paths from their top-left.
    const at = (ox: number, oy: number) => toPdf(...rotatedPoint(it, ox, oy));

    if (it.kind === "text") {
      const { ascent, descent } = textMetrics(it.size);
      const lineBox = it.size * LINE_HEIGHT;
      it.text.split("\n").forEach((line, i) => {
        const [x, y] = at(0, (lineBox - ascent - descent) / 2 + ascent + i * lineBox);
        page.drawText(line, { x, y, size: it.size, font, color: hexToRgb(it.color), opacity: it.opacity ?? 1, rotate });
      });
    } else if (it.kind === "image") {
      if (!images.has(it.src)) images.set(it.src, await doc.embedPng(it.src));
      const [x, y] = at(0, it.h);
      page.drawImage(images.get(it.src)!, { x, y, width: it.w, height: it.h, rotate });
    } else if (it.kind === "rect") {
      const s = RECT_STYLES[it.style];
      const [x, y] = at(0, it.h);
      page.drawRectangle({ x, y, width: it.w, height: it.h, color: hexToRgb(s.color), opacity: s.opacity, blendMode: s.multiply ? BlendMode.Multiply : undefined, rotate });
    } else if (it.kind === "shape") {
      const scale = it.shape === "ink" ? it.w / (it.vw ?? it.w) : 1;
      const [x, y] = at(0, 0);
      page.drawSvgPath(shapePath(it), { x, y, scale, rotate, borderColor: hexToRgb(it.color), borderWidth: it.width, borderLineCap: 1 });
    } else if (it.kind === "note") {
      const [ax, ay] = toPdf(it.x, it.y);
      const [bx, by] = toPdf(it.x + NOTE_SIZE, it.y + NOTE_SIZE);
      const annot = doc.context.obj({
        Type: "Annot",
        Subtype: "Text",
        Rect: [Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by)],
        Contents: PDFHexString.fromText(it.text),
        Name: "Comment",
        C: [1, 0.82, 0.2],
        F: 4,
        M: PDFHexString.fromText(new Date().toISOString()),
      });
      page.node.addAnnot(doc.context.register(annot));
    } else if (it.kind === "field") {
      let name = it.name.trim() || "campo";
      for (let n = 2; fieldNames.has(name); n++) name = `${it.name}_${n}`;
      fieldNames.add(name);
      // Fields stay upright on screen: their PDF rect spans the displayed box, whatever the page rotation.
      const [ax, ay] = toPdf(it.x, it.y);
      const [bx, by] = toPdf(it.x + it.w, it.y + it.h);
      const box = { x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay), borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5 };
      if (it.field === "checkbox") form.createCheckBox(name).addToPage(page, box);
      else form.createTextField(name).addToPage(page, { ...box, font });
    }
  }

  for (const ref of pages) {
    const words = work.ocr[ref.id];
    const target = placed.get(ref.id);
    if (!words?.length || !target) continue;
    const vp = viewportOf(target.proxy, ref, 1);
    drawOcr(target.page, words, font, (x, y) => vp.convertToPdfPoint(x, y) as [number, number], degrees(vp.rotation));
  }

  // A black box alone leaves the text underneath copyable: redacted pages are replaced by an image of themselves.
  if (hasRedactions) {
    const snapshot = await getDocument({ data: await doc.save() }).promise;
    for (const [i, ref] of pages.entries()) {
      if (!items.some((it) => it.page === ref.id && it.kind === "rect" && it.style === "redact")) continue;
      const p = await snapshot.getPage(i + 1);
      const { width, height } = p.getViewport({ scale: 1 });
      const img = await doc.embedPng(await pageToPng(p, 2));
      final[i] = PDFPage.create(doc);
      final[i].setSize(width, height);
      final[i].drawImage(img, { x: 0, y: 0, width, height });
    }
    await snapshot.loadingTask.destroy();
    setPageTree(doc, final);
  }

  if (work.bookmarks) {
    const index = new Map(pages.map((p, i) => [p.id, i]));
    writeOutline(doc, work.bookmarks.filter((b) => index.has(b.page)).map((b: Bookmark) => ({ title: b.title, page: final[index.get(b.page)!] })));
  }

  if (layout !== "original") {
    const sheets = await relayout(doc, final, layout);
    stripPages(doc, final);
    final = sheets;
    setPageTree(doc, final);
    doc.catalog.delete(N("Outlines")); // its destinations pointed at the pages that were just re-laid
  }

  // Base pages that were deleted, left out of an extract/split, or replaced must not ship.
  const kept = new Set(final.map((p) => p.ref.tag));
  stripPages(doc, own.filter((p) => !kept.has(p.ref.tag)));

  if (opts.sanitize) sanitize(doc);
  for (const a of work.attachments) await doc.attach(a.bytes, a.name, { creationDate: new Date(), modificationDate: new Date() });
  if (opts.compress) await compressJpegs(doc, opts.compress);
  if (opts.title) doc.setTitle(opts.title);
  if (opts.author) doc.setAuthor(opts.author);
  await doc.flush();
  dropUnreachable(doc);

  const r = opts.restrict;
  if (opts.password || r) {
    // Always a random owner password: if it equalled the open password, whoever opens the file would be the owner
    // and the restrictions would not apply to anyone.
    const owner = crypto.randomUUID();
    doc.encrypt({
      userPassword: opts.password ?? "",
      ownerPassword: owner,
      permissions: r
        ? { printing: r.print ? "highResolution" : false, copying: r.copy, modifying: r.modify, annotating: r.modify, fillingForms: true, contentAccessibility: true, documentAssembly: r.modify }
        : undefined,
    });
  }
  return doc.save();
}
