import de from "../locales/de.ts";
import en from "../locales/en.ts";
import es from "../locales/es.ts";
import fr from "../locales/fr.ts";
import pt from "../locales/pt.ts";

export const LANGUAGES = [
  { code: "it", label: "Italiano", locale: "it-IT" },
  { code: "en", label: "English", locale: "en-US" },
  { code: "es", label: "Español", locale: "es-ES" },
  { code: "fr", label: "Français", locale: "fr-FR" },
  { code: "de", label: "Deutsch", locale: "de-DE" },
  { code: "pt", label: "Português", locale: "pt-PT" },
] as const;
export type Lang = (typeof LANGUAGES)[number]["code"];

// The source strings are Italian, so Italian needs no dictionary.
export const DICTS: Record<Exclude<Lang, "it">, Record<string, string>> = { en, es, fr, de, pt };
const KEY = "pdf-toolkit:language";
const isLang = (l: unknown): l is Lang => LANGUAGES.some((x) => x.code === l);

function detect(): Lang {
  // Outside the browser (node tests) stay on the source language.
  if (typeof document === "undefined") return "it";
  try {
    const saved = localStorage.getItem(KEY);
    if (isLang(saved)) return saved;
  } catch {}
  const nav = navigator.language.slice(0, 2);
  return isLang(nav) ? nav : "en";
}

/** Fixed for the session: changing it reloads the app, so module-level labels can call t() too. */
export const lang: Lang = detect();
export const locale = LANGUAGES.find((l) => l.code === lang)!.locale;

/** `it` is the Italian text, which is also the lookup key. `{name}` placeholders are filled from `vars`. */
export function t(it: string, vars?: Record<string, string | number>): string {
  const s = lang === "it" ? it : (DICTS[lang][it] ?? it);
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

export function setLanguage(l: Lang) {
  try {
    localStorage.setItem(KEY, l);
  } catch {}
  location.reload();
}
