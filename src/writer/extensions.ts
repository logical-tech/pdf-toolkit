import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import Typography from "@tiptap/extension-typography";
import { Placeholder } from "@tiptap/extensions";
import { CUSTOM_NODES } from "./nodes";

// One list for the editor, the read-only previews and the Markdown converter, so they always agree on the schema.
export const extensions = [
  StarterKit.configure({ code: false, codeBlock: false, heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  TableKit.configure({ table: { resizable: false } }),
  Image.configure({ allowBase64: true }),
  Typography,
  Placeholder.configure({ placeholder: ({ editor }) => (editor.isEmpty ? "Inizia a scrivere, o inserisci un blocco dal menu Blocchi…" : "") }),
  ...CUSTOM_NODES,
];
