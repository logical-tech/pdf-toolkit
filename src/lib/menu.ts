import { isTauri } from "@tauri-apps/api/core";
import { Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Recent } from "@/lib/desktop";

export type MenuActions = {
  open: () => void;
  openRecent: (path: string) => void;
  clearRecent: () => void;
  addPdf: () => void;
  addImages: () => void;
  compare: () => void;
  save: () => void;
  saveAs: () => void;
  print: () => void;
  find: () => void;
  view: (v: "editor" | "pages") => void;
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  togglePanel: () => void;
  toggleStamps: () => void;
  settings: () => void;
};

// The native menu bar (HIG: every command reachable from it). Actions read through a getter so the menu,
// built once per document state, always calls the current handlers.
export async function installMenu(get: () => MenuActions, state: { hasDoc: boolean; recent: Recent[] }) {
  if (!isTauri()) return;
  const item = (text: string, action: (a: MenuActions) => void, accelerator?: string, enabled = true) =>
    MenuItem.new({ text, accelerator, enabled, action: () => action(get()) });
  const sep = () => PredefinedMenuItem.new({ item: "Separator" });
  const doc = state.hasDoc;

  const app = await Submenu.new({
    text: "PDF Toolkit",
    items: [
      await PredefinedMenuItem.new({ item: { About: { name: "PDF Toolkit" } }, text: "Informazioni su PDF Toolkit" }),
      await sep(),
      await item("Impostazioni…", (a) => a.settings(), "CmdOrCtrl+,"),
      await sep(),
      await PredefinedMenuItem.new({ item: "Services", text: "Servizi" }),
      await sep(),
      await PredefinedMenuItem.new({ item: "Hide", text: "Nascondi PDF Toolkit" }),
      await PredefinedMenuItem.new({ item: "HideOthers", text: "Nascondi altre" }),
      await PredefinedMenuItem.new({ item: "ShowAll", text: "Mostra tutte" }),
      await sep(),
      // Not the predefined Quit: that skips the unsaved-changes prompt on window close.
      await item("Esci da PDF Toolkit", () => void getCurrentWindow().close(), "CmdOrCtrl+Q"),
    ],
  });

  const recent = await Submenu.new({
    text: "Apri recenti",
    enabled: state.recent.length > 0,
    items: [...(await Promise.all(state.recent.map((r) => item(r.name, (a) => a.openRecent(r.path))))), await sep(), await item("Cancella elenco", (a) => a.clearRecent())],
  });

  const file = await Submenu.new({
    text: "File",
    items: [
      await item("Apri…", (a) => a.open(), "CmdOrCtrl+O"),
      recent,
      await sep(),
      await item("Aggiungi PDF…", (a) => a.addPdf(), undefined, doc),
      await item(doc ? "Aggiungi immagini…" : "Crea PDF da immagini…", (a) => a.addImages()),
      await item("Confronta con un altro PDF…", (a) => a.compare(), undefined, doc),
      await sep(),
      await item("Salva", (a) => a.save(), "CmdOrCtrl+S", doc),
      await item("Salva come…", (a) => a.saveAs(), "CmdOrCtrl+Shift+S", doc),
      await sep(),
      await item("Stampa…", (a) => a.print(), "CmdOrCtrl+P", doc),
      await sep(),
      await PredefinedMenuItem.new({ item: "CloseWindow", text: "Chiudi finestra" }),
    ],
  });

  // Native Undo/Redo so text fields keep their own history; outside a field the page's keydown handler
  // takes ⌘Z first (WebKit offers key equivalents to the page before the menu) and runs the app's undo.
  const edit = await Submenu.new({
    text: "Modifica",
    items: [
      await PredefinedMenuItem.new({ item: "Undo", text: "Annulla" }),
      await PredefinedMenuItem.new({ item: "Redo", text: "Ripeti" }),
      await sep(),
      await PredefinedMenuItem.new({ item: "Cut", text: "Taglia" }),
      await PredefinedMenuItem.new({ item: "Copy", text: "Copia" }),
      await PredefinedMenuItem.new({ item: "Paste", text: "Incolla" }),
      await PredefinedMenuItem.new({ item: "SelectAll", text: "Seleziona tutto" }),
      await sep(),
      await item("Trova…", (a) => a.find(), "CmdOrCtrl+F", doc),
    ],
  });

  const view = await Submenu.new({
    text: "Vista",
    items: [
      await item("Modifica", (a) => a.view("editor"), "CmdOrCtrl+1", doc),
      await item("Pagine", (a) => a.view("pages"), "CmdOrCtrl+2", doc),
      await sep(),
      await item("Indice e allegati", (a) => a.togglePanel(), "CmdOrCtrl+Alt+1", doc),
      await item("Timbri", (a) => a.toggleStamps(), "CmdOrCtrl+Alt+2", doc),
      await sep(),
      await item("Ingrandisci", (a) => a.zoomIn(), "CmdOrCtrl+=", doc),
      await item("Riduci", (a) => a.zoomOut(), "CmdOrCtrl+-", doc),
      await item("Adatta alla larghezza", (a) => a.fit(), "CmdOrCtrl+0", doc),
      await sep(),
      await PredefinedMenuItem.new({ item: "Fullscreen", text: "Schermo intero" }),
    ],
  });

  const windowMenu = await Submenu.new({
    text: "Finestra",
    items: [await PredefinedMenuItem.new({ item: "Minimize", text: "Contrai" }), await PredefinedMenuItem.new({ item: "Maximize", text: "Ridimensiona" })],
  });

  const menu = await Menu.new({ items: [app, file, edit, view, windowMenu] });
  await menu.setAsAppMenu();
}

// Undo/redo from the menu: inside a text field defer to the field's own history.
export function editableFocused() {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(el.tagName));
}
