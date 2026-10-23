import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { toast } from "sonner";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  FileDown,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  LayoutPanelTop,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Pilcrow,
  Redo2,
  SeparatorHorizontal,
  Table2,
  Underline,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BarDivider, FloatBar, ToolButton, ToolMenu } from "@/components/Chrome";
import { pickFiles } from "@/lib/io";
import { createWriterApi, type WriterHandle } from "./api";
import { BLOCKS } from "./blocks";
import { Gallery } from "./Gallery";
import { imageToPng } from "./image";
import { newFile, type LptkFile } from "./lptk";
import { A4_MM, type JSONContent } from "./model";
import { MM_TO_PX, Sheet } from "./Sheet";

export type { WriterHandle } from "./api";

type Props = { file: LptkFile | null; onChange?(file: LptkFile): void; onExportPdf(bytes: Uint8Array, name: string): void };

/**
 * The document writer. With `file` null it shows the template gallery; otherwise one continuous A4 sheet with floating tools.
 * Every edit calls onChange with a new LptkFile; passing that same object back as `file` does not reset the editor.
 */
export const WriterView = forwardRef<WriterHandle, Props>(function WriterView({ file, onChange, onExportPdf }, ref) {
  const [doc, setDoc] = useState<LptkFile | null>(file);
  const docRef = useRef(file);
  const editorRef = useRef<Editor | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const changed = useRef(onChange);
  changed.current = onChange;

  const replace = useCallback((next: LptkFile | null, emit = true) => {
    docRef.current = next;
    setDoc(next);
    if (next) editorRef.current?.commands.setContent(next.content, { emitUpdate: false });
    if (next && emit) changed.current?.(next);
  }, []);

  // A file from outside (open, new) replaces the editor content; our own echo does not.
  useEffect(() => {
    if (file === docRef.current) return;
    if (file && docRef.current && file.content === docRef.current.content) {
      docRef.current = file;
      setDoc(file);
      return;
    }
    replace(file, false);
  }, [file, replace]);

  const onEditor = useCallback((e: Editor | null) => {
    editorRef.current = e;
    setEditor(e);
  }, []);

  const onUpdate = useCallback((content: JSONContent) => {
    if (!docRef.current) return;
    docRef.current = { ...docRef.current, content };
    changed.current?.(docRef.current);
  }, []);

  const api = useRef<WriterHandle>(null as unknown as WriterHandle);
  api.current ??= createWriterApi({ editor: () => editorRef.current, file: () => docRef.current, replace: (f) => replace(f) });
  useImperativeHandle(ref, () => api.current, []);

  if (!doc) return <div className="canvas-scroll absolute inset-0 overflow-auto">{<Gallery onPick={(id) => api.current.applyTemplate(id)} />}</div>;

  return (
    <div className="absolute inset-0">
      <div className="canvas-scroll absolute inset-0 overflow-auto">
        <div className="flex min-w-fit justify-center px-10 pt-20 pb-32">
          <Sheet content={doc.content} margins={doc.page.margins} onEditor={onEditor} onUpdate={onUpdate} />
        </div>
      </div>
      {editor && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-3">
          <Toolbar editor={editor} margins={doc.page.margins} api={api.current} onExport={async () => onExportPdf(await api.current.exportPdf(), `${docRef.current?.title || "Documento"}.pdf`)} />
        </div>
      )}
    </div>
  );
});

const STYLES = [
  { level: 0, label: "Testo", icon: <Pilcrow /> },
  { level: 1, label: "Titolo 1", icon: <Heading1 /> },
  { level: 2, label: "Titolo 2", icon: <Heading2 /> },
  { level: 3, label: "Titolo 3", icon: <Heading3 /> },
] as const;

const ALIGNS = [
  { value: "left", label: "Allinea a sinistra", icon: <AlignLeft /> },
  { value: "center", label: "Centra", icon: <AlignCenter /> },
  { value: "right", label: "Allinea a destra", icon: <AlignRight /> },
  { value: "justify", label: "Giustifica", icon: <AlignJustify /> },
] as const;

function Toolbar({ editor, margins, api, onExport }: { editor: Editor; margins: LptkFile["page"]["margins"]; api: WriterHandle; onExport: () => Promise<void> }) {
  const [exporting, setExporting] = useState(false);
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      table: e.isActive("table"),
      level: ([1, 2, 3] as const).find((l) => e.isActive("heading", { level: l })) ?? 0,
      align: (["center", "right", "justify"] as const).find((a) => e.isActive({ textAlign: a })) ?? "left",
      undo: e.can().undo(),
      redo: e.can().redo(),
    }),
  });
  const run = () => editor.chain().focus();

  const insertImage = async () => {
    const [f] = await pickFiles("image/png,image/jpeg,image/webp");
    if (!f) return;
    try {
      const src = await imageToPng(f, 1600);
      const img = Object.assign(new Image(), { src });
      await img.decode();
      const max = (A4_MM.width - margins.left - margins.right) * MM_TO_PX;
      run().setImage({ src, width: Math.round(Math.min(img.naturalWidth / 2, max)) }).run();
    } catch {
      toast.error("Immagine non leggibile");
    }
  };

  const style = STYLES[s.level];
  const align = ALIGNS.find((a) => a.value === s.align)!;

  return (
    <FloatBar role="toolbar" aria-label="Formattazione" className="max-w-full overflow-x-auto">
      <ToolMenu
        label="Stile paragrafo"
        active={s.level > 0}
        icon={style.icon}
        items={STYLES.map((st) => ({ label: st.label, icon: st.icon, onPick: () => (st.level ? run().setHeading({ level: st.level }).run() : run().setParagraph().run()) }))}
      />
      <BarDivider />
      <ToolButton side="top" label="Grassetto" shortcut="⌘B" active={s.bold} onClick={() => run().toggleBold().run()}>
        <Bold />
      </ToolButton>
      <ToolButton side="top" label="Corsivo" shortcut="⌘I" active={s.italic} onClick={() => run().toggleItalic().run()}>
        <Italic />
      </ToolButton>
      <ToolButton side="top" label="Sottolineato" shortcut="⌘U" active={s.underline} onClick={() => run().toggleUnderline().run()}>
        <Underline />
      </ToolButton>
      <BarDivider />
      <ToolButton side="top" label="Elenco puntato" shortcut="⇧⌘8" active={s.bullet} onClick={() => run().toggleBulletList().run()}>
        <List />
      </ToolButton>
      <ToolButton side="top" label="Elenco numerato" shortcut="⇧⌘7" active={s.ordered} onClick={() => run().toggleOrderedList().run()}>
        <ListOrdered />
      </ToolButton>
      <ToolMenu label="Allineamento" icon={align.icon} items={ALIGNS.map((a) => ({ label: a.label, icon: a.icon, onPick: () => run().setTextAlign(a.value).run() }))} />
      <BarDivider />
      <ToolMenu
        label="Tabella"
        active={s.table}
        icon={<Table2 />}
        items={
          s.table
            ? [
                { label: "Aggiungi riga sotto", onPick: () => run().addRowAfter().run() },
                { label: "Aggiungi colonna a destra", onPick: () => run().addColumnAfter().run() },
                { label: "Elimina riga", onPick: () => run().deleteRow().run() },
                { label: "Elimina colonna", onPick: () => run().deleteColumn().run() },
                { label: "Riga di intestazione sì/no", onPick: () => run().toggleHeaderRow().run() },
                { label: "Elimina tabella", onPick: () => run().deleteTable().run() },
              ]
            : [
                { label: "Tabella 3 × 3", onPick: () => run().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
                { label: "Tabella 2 × 4", onPick: () => run().insertTable({ rows: 4, cols: 2, withHeaderRow: false }).run() },
              ]
        }
      />
      <ToolButton side="top" label="Immagine" onClick={insertImage}>
        <ImagePlus />
      </ToolButton>
      <ToolButton side="top" label="Linea orizzontale" onClick={() => run().setHorizontalRule().run()}>
        <Minus />
      </ToolButton>
      <ToolButton side="top" label="Interruzione di pagina" shortcut="⌘↵" onClick={() => run().insertContent({ type: "pageBreak" }).run()}>
        <SeparatorHorizontal />
      </ToolButton>
      <BarDivider />
      <ToolMenu label="Blocchi" icon={<LayoutPanelTop />} items={BLOCKS.map((b) => ({ label: b.label, onPick: () => api.insertBlock(b.id) }))} />
      <BarDivider />
      <ToolButton side="top" label="Annulla" shortcut="⌘Z" disabled={!s.undo} onClick={() => run().undo().run()}>
        <Undo2 />
      </ToolButton>
      <ToolButton side="top" label="Ripristina" shortcut="⇧⌘Z" disabled={!s.redo} onClick={() => run().redo().run()}>
        <Redo2 />
      </ToolButton>
      <BarDivider />
      <Button
        variant="ghost"
        className="h-8 shrink-0 rounded-[10px] px-2.5"
        disabled={exporting}
        onClick={async () => {
          setExporting(true);
          try {
            await onExport();
          } catch (e) {
            toast.error(`Esportazione non riuscita: ${(e as Error).message}`);
          } finally {
            setExporting(false);
          }
        }}
      >
        {exporting ? <Loader2 className="animate-spin" /> : <FileDown />}
        Esporta PDF
      </Button>
    </FloatBar>
  );
}

/** A fresh document, e.g. for a "Nuovo" menu item that skips the gallery. */
export const blankFile = () => newFile("Documento senza titolo", { type: "doc", content: [{ type: "paragraph" }] });
