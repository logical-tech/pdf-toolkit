import { useEffect, useRef, type CSSProperties } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { cn } from "@/lib/utils";
import { extensions } from "./extensions";
import { loadWriterFonts } from "./fonts";
import { A4_MM, type JSONContent, type Margins } from "./model";
import "./writer.css";

loadWriterFonts();

export const MM_TO_PX = 96 / 25.4;

/** One continuous A4-wide sheet at true size (1mm on screen is 1mm on paper). Read-only sheets power the gallery previews. */
export function Sheet({ content, margins, editable = true, onEditor, onUpdate, className, style }: {
  content: JSONContent;
  margins: Margins;
  editable?: boolean;
  onEditor?: (e: Editor | null) => void;
  onUpdate?: (json: JSONContent) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const update = useRef(onUpdate);
  update.current = onUpdate;
  const editor = useEditor({
    extensions,
    content,
    editable,
    immediatelyRender: true,
    editorProps: { attributes: { spellcheck: editable ? "true" : "false", "aria-label": "Documento" } },
    onUpdate: ({ editor }) => update.current?.(editor.getJSON()),
  });

  useEffect(() => {
    onEditor?.(editor);
    return () => onEditor?.(null);
  }, [editor, onEditor]);

  return (
    <div
      className={cn("writer-sheet paper rounded-[2px] [&>div]:min-h-[inherit]", className)}
      style={
        {
          width: `${A4_MM.width}mm`,
          minHeight: `${A4_MM.height}mm`,
          "--m-top": `${margins.top}mm`,
          "--m-right": `${margins.right}mm`,
          "--m-bottom": `${margins.bottom}mm`,
          "--m-left": `${margins.left}mm`,
          ...style,
        } as CSSProperties
      }
    >
      <EditorContent editor={editor} />
    </div>
  );
}
