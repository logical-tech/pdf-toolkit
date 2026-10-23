import { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { TextMorph } from "torph/react";
import { FloatBar, ToolButton } from "@/components/Chrome";

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
        aria-label="Cerca nel documento"
        placeholder="Cerca nel documento"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onStep(e.shiftKey ? -1 : 1);
          else if (e.key === "Escape") onClose();
        }}
        className="h-8 w-52 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
      />
      <span className="min-w-14 text-right text-xs text-muted-foreground tabular-nums">{query && <TextMorph>{total ? `${index + 1} di ${total}` : "Nessuno"}</TextMorph>}</span>
      <ToolButton label="Precedente" shortcut="⇧↵" disabled={!total} onClick={() => onStep(-1)}>
        <ChevronUp />
      </ToolButton>
      <ToolButton label="Successivo" shortcut="↵" disabled={!total} onClick={() => onStep(1)}>
        <ChevronDown />
      </ToolButton>
      <ToolButton label="Chiudi" shortcut="esc" onClick={onClose}>
        <X />
      </ToolButton>
    </FloatBar>
  );
}
