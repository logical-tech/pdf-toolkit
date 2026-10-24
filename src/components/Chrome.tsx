import type { ReactNode } from "react";
import { Kbd } from "@/components/ui/kbd";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// A capsule of the floating functional layer. Radius 14 with 4px padding keeps the 10px buttons inside concentric.
export function FloatBar({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("float-surface float-enter pointer-events-auto flex items-center gap-0.5 rounded-full p-1", className)} {...props}>
      {children}
    </div>
  );
}

export function BarDivider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-border" />;
}

type ToolButtonProps = {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  side?: "top" | "bottom";
};

export function ToolButton({ label, shortcut, active, disabled, onClick, children, className, side = "bottom" }: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            aria-pressed={active}
            disabled={disabled}
            onClick={onClick}
            className={cn(
              "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-foreground/80 outline-none",
              "transition-[background-color,color,scale] duration-150 hover:bg-accent hover:text-foreground active:scale-[0.96]",
              "focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-35",
              "[&_svg]:size-[18px] [&_svg]:stroke-[1.75]",
              active && "bg-ink-soft text-ink hover:bg-ink-soft hover:text-ink",
              className,
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} sideOffset={8}>
        {label}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

// Segmented control whose highlight slides between equal-width options.
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; icon?: ReactNode }[]; onChange: (v: T) => void }) {
  const index = options.findIndex((o) => o.value === value);
  return (
    <div role="tablist" className="relative grid rounded-full bg-secondary p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 rounded-full bg-(--seg-thumb) shadow-[0_1px_2px_#0e0f1214] transition-transform duration-(--duration-fast) ease-(--ease-smooth-out) motion-reduce:transition-none"
        style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "relative z-10 inline-flex h-7 items-center justify-center gap-1.5 px-3 text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring rounded-full",
            "[&_svg]:size-4 [&_svg]:stroke-[1.75]",
            o.value === value ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Grouped option rows in the macOS settings manner: a tinted inset group, one setting per row.
export function OptionGroup({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-border overflow-hidden rounded-[12px] border border-border">{children}</div>;
}

export function OptionRow({ label, hint, children, htmlFor }: { label: string; hint?: string; children?: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 px-3.5 py-2.5">
      <label htmlFor={htmlFor} className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] font-medium">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

// A tool button that opens a short menu of variants (shapes, stamps, field types).
export function ToolMenu({ label, active, icon, items, side = "top" }: { label: string; active?: boolean; icon: ReactNode; items: { label: string; icon?: ReactNode; onPick: () => void }[]; side?: "top" | "bottom" }) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={label}
                  className={cn(
                    "relative inline-flex size-8 shrink-0 items-center justify-center rounded-full text-foreground/80 outline-none",
                    "transition-[background-color,color,scale] duration-150 hover:bg-accent hover:text-foreground active:scale-[0.96] data-[popup-open]:bg-accent",
                    "focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-[18px] [&_svg]:stroke-[1.75]",
                    active && "bg-ink-soft text-ink hover:bg-ink-soft hover:text-ink",
                  )}
                />
              }
            />
          }
        >
          {icon}
          <span aria-hidden className="absolute right-1 bottom-1 size-0 border-t-[3px] border-l-[3px] border-t-transparent border-l-transparent border-r-[3px] border-b-[3px] border-r-current border-b-current opacity-50" />
        </TooltipTrigger>
        <TooltipContent side={side} sideOffset={8}>
          {label}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent side={side} sideOffset={10} className="min-w-48">
        {items.map((it) => (
          <DropdownMenuItem key={it.label} onClick={it.onPick}>
            {it.icon}
            {it.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Big titles end on the brand's serif italic: the last word of the (translated) title, with a full stop.
export function Headline({ text }: { text: string }) {
  const cut = text.lastIndexOf(" ") + 1;
  return (
    <h1 className="text-[36px] leading-[1.1] font-medium tracking-[-1.2px] text-balance">
      {text.slice(0, cut)}
      <span className="font-serif text-[42px] leading-none font-normal tracking-[-0.6px] italic">{text.slice(cut)}.</span>
    </h1>
  );
}
