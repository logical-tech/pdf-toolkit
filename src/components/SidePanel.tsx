import { useEffect, useState } from "react";
import { BookmarkPlus, Download, FilePlus2, Paperclip, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented, ToolButton } from "@/components/Chrome";
import type { Attachment, Bookmark, PageRef, Source } from "@/lib/document";
import { pickFiles, saveBytesAs } from "@/lib/io";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

type Props = {
  base: Source;
  pages: PageRef[];
  bookmarks: Bookmark[];
  currentPage: string | null;
  attachments: Attachment[];
  onBookmarks: (b: Bookmark[]) => void;
  onAttachments: (a: Attachment[]) => void;
  onGo: (pageId: string) => void;
  onClose: () => void;
};

// Floating left panel: the document outline (editable) and the files attached to the PDF.
export function SidePanel({ base, pages, bookmarks, currentPage, attachments, onBookmarks, onAttachments, onGo, onClose }: Props) {
  const [tab, setTab] = useState<"outline" | "files">("outline");
  const [editing, setEditing] = useState<string | null>(null);
  const [existing, setExisting] = useState<{ name: string; bytes: Uint8Array }[]>([]);

  useEffect(() => {
    (async () => {
      const all = await base.pdf.getAttachments();
      const list = [];
      for (const [id, a] of all ?? []) {
        const bytes = a.content ?? (await base.pdf.getAttachmentContent(id));
        if (bytes) list.push({ name: a.filename, bytes });
      }
      setExisting(list);
    })().catch(() => setExisting([]));
  }, [base]);

  const pageNumber = (id: string) => pages.findIndex((p) => p.id === id) + 1;
  const addBookmark = () => {
    const page = currentPage ?? pages[0]?.id;
    if (!page) return;
    const b = { id: crypto.randomUUID(), title: t("Pagina {n}", { n: pageNumber(page) }), page };
    onBookmarks([...bookmarks, b].sort((x, y) => pageNumber(x.page) - pageNumber(y.page)));
    setEditing(b.id);
  };

  return (
    <aside className="float-panel float-enter fixed top-[60px] left-3 z-10 flex max-h-[calc(100%-140px)] w-72 flex-col gap-3 rounded-[16px] p-3 text-[13px]">
      <div className="flex items-center gap-2">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "outline", label: t("Indice") },
            { value: "files", label: t("Allegati") },
          ]}
        />
        <div className="flex-1" />
        <ToolButton label={t("Chiudi")} onClick={onClose}>
          <X />
        </ToolButton>
      </div>

      {tab === "outline" ? (
        <>
          <ul className="-mx-1 flex min-h-0 flex-col overflow-y-auto">
            {bookmarks.map((b) => {
              const n = pageNumber(b.page);
              return (
                <li key={b.id} className={cn("group flex items-center gap-1 rounded-[8px] px-2 py-1.5 hover:bg-accent", b.page === currentPage && "bg-ink-soft")}>
                  {editing === b.id ? (
                    <input
                      autoFocus
                      aria-label={t("Titolo del segnalibro")}
                      defaultValue={b.title}
                      onBlur={(e) => {
                        onBookmarks(bookmarks.map((x) => (x.id === b.id ? { ...x, title: e.target.value.trim() || x.title } : x)));
                        setEditing(null);
                      }}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape") && e.currentTarget.blur()}
                      className="h-6 min-w-0 flex-1 rounded-[6px] bg-background px-1.5 outline-none focus:ring-2 focus:ring-ring"
                    />
                  ) : (
                    <button className="min-w-0 flex-1 truncate text-left" onClick={() => n && onGo(b.page)} onDoubleClick={() => setEditing(b.id)} title={t("Doppio clic per rinominare")}>
                      {b.title}
                    </button>
                  )}
                  <span className="text-xs text-muted-foreground tabular-nums">{n || "—"}</span>
                  <button aria-label={t("Elimina {name}", { name: b.title })} className="invisible rounded-[6px] p-0.5 text-muted-foreground group-hover:visible hover:text-destructive" onClick={() => onBookmarks(bookmarks.filter((x) => x.id !== b.id))}>
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              );
            })}
            {!bookmarks.length && <li className="px-2 py-3 text-muted-foreground">{t("Nessun segnalibro. Aggiungine uno per la pagina che stai guardando.")}</li>}
          </ul>
          <Button variant="secondary" className="h-8 rounded-[10px]" onClick={addBookmark}>
            <BookmarkPlus /> {t("Aggiungi segnalibro")}
          </Button>
        </>
      ) : (
        <>
          <ul className="-mx-1 flex min-h-0 flex-col overflow-y-auto">
            {[...existing.map((a) => ({ ...a, added: false })), ...attachments.map((a) => ({ ...a, added: true }))].map((a, i) => (
              <li key={`${a.name}-${i}`} className="group flex items-center gap-2 rounded-[8px] px-2 py-1.5 hover:bg-accent">
                <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{Math.max(1, Math.round(a.bytes.length / 1024))} KB</span>
                <button aria-label={t("Salva {name}", { name: a.name })} className="rounded-[6px] p-0.5 text-muted-foreground hover:text-foreground" onClick={() => saveBytesAs(a.name, a.bytes)}>
                  <Download className="size-3.5" />
                </button>
                {a.added && (
                  <button aria-label={t("Rimuovi {name}", { name: a.name })} className="rounded-[6px] p-0.5 text-muted-foreground hover:text-destructive" onClick={() => onAttachments(attachments.filter((x) => x.name !== a.name))}>
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
            {!existing.length && !attachments.length && <li className="px-2 py-3 text-muted-foreground">{t("Questo PDF non ha file allegati.")}</li>}
          </ul>
          <Button
            variant="secondary"
            className="h-8 rounded-[10px]"
            onClick={async () => {
              const files = await pickFiles("*/*", true);
              const added = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
              if (added.length) onAttachments([...attachments, ...added]);
            }}
          >
            <FilePlus2 /> {t("Allega file…")}
          </Button>
        </>
      )}
    </aside>
  );
}
