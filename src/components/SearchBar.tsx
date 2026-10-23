import { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { TextMorph } from "torph/react";
import { FloatBar, ToolButton } from "@/components/Chrome";
import { t } from "@/lib/i18n";

type Props = { query: string; onQuery: (q: string) => void; total: number; index: number; onStep: (dir: 1 | -1) => void; onClose: () => void };

export function SearchBar({ query, onQuery, total, index, onStep, onClose }: Props) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.select(), []);
  return (
    <FloatBar role="search" className="gap-1 pl-2.5">
      <Search className="size-4 shrink-0 stroke-[1.75] text-muted-foreground" />
      <input
        ref={input}
        autoFocus
        aria-label={t("Cerca nel documento")}
        placeholder={t("Cerca nel documento")}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onStep(e.shiftKey ? -1 : 1);
          else if (e.key === "Escape") onClose();
        }}
        className="h-8 w-52 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
      />
      <span className="min-w-14 text-right text-xs text-muted-foreground tabular-nums">{query && <TextMorph>{total ? t("{n} di {total}", { n: index + 1, total }) : t("Nessuno")}</TextMorph>}</span>
      <ToolButton label={t("Precedente")} shortcut="⇧↵" disabled={!total} onClick={() => onStep(-1)}>
        <ChevronUp />
      </ToolButton>
      <ToolButton label={t("Successivo")} shortcut="↵" disabled={!total} onClick={() => onStep(1)}>
        <ChevronDown />
      </ToolButton>
      <ToolButton label={t("Chiudi")} shortcut="esc" onClick={onClose}>
        <X />
      </ToolButton>
    </FloatBar>
  );
}
