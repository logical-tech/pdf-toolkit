import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type Theme = "system" | "light" | "dark";

const KEY = "pdf-toolkit:theme";
const media = matchMedia("(prefers-color-scheme: dark)");

export function loadTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

let current: Theme = "system";
const paint = () => document.documentElement.classList.toggle("dark", current === "dark" || (current === "system" && media.matches));
media.addEventListener("change", paint);

export function applyTheme(theme: Theme) {
  current = theme;
  paint();
  try {
    localStorage.setItem(KEY, theme);
  } catch {}
  // Keep the native title bar and window chrome in step with the page.
  if (isTauri()) getCurrentWindow().setTheme(theme === "system" ? null : theme).catch(() => {});
}
