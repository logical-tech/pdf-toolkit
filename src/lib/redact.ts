import { t } from "./i18n.ts";

export type Pattern = "cf" | "piva" | "iban" | "email" | "phone";

// shortcut: shapes only, no checksums (a CF with a wrong control letter still matches); fine for "find to review".
export const PATTERNS: Record<Pattern, { label: string; re: RegExp }> = {
  cf: { label: t("Codice fiscale"), re: /\b[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\b/gi },
  piva: { label: t("Partita IVA"), re: /\b(?:IT ?)?\d{11}\b/g },
  iban: { label: t("IBAN"), re: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/g },
  email: { label: t("Email"), re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g },
  phone: { label: t("Telefono"), re: /(?:\+39[ .]?)?\b(?:3\d{2}|0\d{1,3})[ ./-]?\d{3,4}[ ./-]?\d{3,4}\b/g },
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Character ranges to black out in `text`: every occurrence of `query` (any case) and of the chosen patterns.
export function findRanges(text: string, query: string, patterns: Pattern[]): [number, number][] {
  const res = [...patterns.map((p) => PATTERNS[p].re), ...(query.trim() ? [new RegExp(escape(query.trim()), "gi")] : [])];
  const out: [number, number][] = [];
  for (const re of res) for (const m of text.matchAll(new RegExp(re.source, re.flags))) out.push([m.index, m.index + m[0].length]);
  return out;
}
