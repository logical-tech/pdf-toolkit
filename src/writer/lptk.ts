import { t } from "../lib/i18n.ts";
import { DEFAULT_MARGINS, type JSONContent, type Margins } from "./model.ts";

export type LptkFile = {
  format: "lptk";
  version: 1;
  kind: "document";
  title: string;
  content: JSONContent;
  page: { size: "A4"; margins: Margins };
};

export const newFile = (title: string, content: JSONContent): LptkFile => ({ format: "lptk", version: 1, kind: "document", title, content, page: { size: "A4", margins: { ...DEFAULT_MARGINS } } });

export const serialize = (file: LptkFile) => JSON.stringify(file, null, 2);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// Trust boundary: a .lptk can come from anywhere, so check the shape before the editor sees it.
export function parse(input: string | Uint8Array): LptkFile {
  let data: unknown;
  try {
    data = JSON.parse(typeof input === "string" ? input : new TextDecoder().decode(input));
  } catch {
    throw new Error(t("Il file non è leggibile: non è un JSON valido."));
  }
  if (!isObj(data) || data.format !== "lptk") throw new Error(t("Questo file non è un documento PDF Toolkit (.lptk)."));
  if (data.version !== 1) throw new Error(t("Questa versione del file ({version}) non è supportata: aggiorna l'app.", { version: String(data.version) }));
  if (data.kind !== "document") throw new Error(t("Questo .lptk non contiene un documento di testo."));
  if (!isObj(data.content) || data.content.type !== "doc") throw new Error(t("Il contenuto del documento è danneggiato."));
  const m = isObj(data.page) && isObj(data.page.margins) ? data.page.margins : {};
  const margins = Object.fromEntries(Object.entries(DEFAULT_MARGINS).map(([k, d]) => [k, typeof m[k] === "number" && m[k] >= 0 && m[k] < 100 ? m[k] : d])) as Margins;
  return { format: "lptk", version: 1, kind: "document", title: typeof data.title === "string" ? data.title : t("Documento"), content: data.content as JSONContent, page: { size: "A4", margins } };
}
