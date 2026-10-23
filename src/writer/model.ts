// Pure document model shared by the editor, the PDF export, templates and tests. No DOM, no React.
import { locale } from "../lib/i18n.ts";
import type { JSONContent } from "@tiptap/react";

export type { JSONContent };

export type CompanyData = {
  name: string;
  address: string;
  vat: string;
  taxCode: string;
  email: string;
  phone: string;
  iban: string;
  logo?: string; // PNG or JPEG data URL
  defaultPlace?: string;
};

export const EMPTY_COMPANY: CompanyData = { name: "", address: "", vat: "", taxCode: "", email: "", phone: "", iban: "", defaultPlace: "" };

export type Item = { description: string; qty: number; price: number; vat: number };
export type PartyAttrs = { label: string; name: string; address: string; vat: string; email: string };
export type SignatureAttrs = { labels: string[]; place: string; date: string };
export type PaymentAttrs = { terms: string };

/** Page margins in millimetres. */
export type Margins = { top: number; right: number; bottom: number; left: number };
export const DEFAULT_MARGINS: Margins = { top: 20, right: 20, bottom: 25, left: 20 };
export const A4_MM = { width: 210, height: 297 };

export const VAT_RATES = [22, 10, 5, 4, 0];

export type Totals = { net: number; vat: { rate: number; base: number; tax: number }[]; total: number };

// Work in cents so 0.1 + 0.2 never shows up on an invoice; VAT is computed once per rate on the summed base.
export function totals(items: Item[]): Totals {
  const byRate = new Map<number, number>();
  let net = 0;
  for (const it of items) {
    const line = Math.round((it.qty || 0) * (it.price || 0) * 100);
    net += line;
    byRate.set(it.vat || 0, (byRate.get(it.vat || 0) ?? 0) + line);
  }
  const vat = [...byRate].sort((a, b) => b[0] - a[0]).map(([rate, base]) => ({ rate, base: base / 100, tax: Math.round((base * rate) / 100) / 100 }));
  const tax = vat.reduce((s, v) => s + Math.round(v.tax * 100), 0);
  return { net: net / 100, vat, total: (net + tax) / 100 };
}

// it-IT leaves 4-digit amounts ungrouped by default ("1234,50 €"); invoices read "1.234,50 €". The ES2023 option is missing from the ES2022 lib types.
const always = { useGrouping: "always" } as unknown as Intl.NumberFormatOptions;
const EUR = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", ...always });
const NUM = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 3, ...always });
export const eur = (n: number) => EUR.format(n);
export const num = (n: number) => NUM.format(n);
export const lineTotal = (it: Item) => Math.round((it.qty || 0) * (it.price || 0) * 100) / 100;

/** Accepts Italian ("1.234,5") and plain ("1234.5") notation; null when it is not a number. */
export function parseNumber(s: string): number | null {
  const t = s.trim().replace(/\s|€|%/g, "");
  if (!t) return 0;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}

export const today = () => new Date().toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });

// JSON builders keep templates and blocks readable.
type Mark = "bold" | "italic" | "underline";
export const t = (text: string, ...marks: Mark[]): JSONContent => (marks.length ? { type: "text", text, marks: marks.map((type) => ({ type })) } : { type: "text", text });
const inline = (parts: (string | JSONContent)[]) => parts.filter((x) => x !== "").map((x) => (typeof x === "string" ? t(x) : x));
export const p = (...parts: (string | JSONContent)[]): JSONContent => ({ type: "paragraph", content: inline(parts) });
export const pAlign = (textAlign: "left" | "center" | "right" | "justify", ...parts: (string | JSONContent)[]): JSONContent => ({ ...p(...parts), attrs: { textAlign } });
export const h = (level: 1 | 2 | 3, text: string): JSONContent => ({ type: "heading", attrs: { level }, content: [t(text)] });
export const doc = (content: JSONContent[]): JSONContent => ({ type: "doc", content });
