import { useEffect, useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import { TextMorph } from "torph/react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { OptionGroup, OptionRow } from "@/components/Chrome";
import { applyMcpConfig, connectSnippets, loadMcpConfig, mcpStatus, mcpUrl, newToken, type McpConfig, type McpStatus } from "@/lib/mcp";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1.5 px-3.5 py-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium">{label}</span>
        <Button
          variant="ghost"
          className="h-7 rounded-[8px] px-2 text-xs"
          onClick={() =>
            navigator.clipboard.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? <Check /> : <Copy />}
          <TextMorph>{copied ? t("Copiato") : t("Copia")}</TextMorph>
        </Button>
      </div>
      <pre className="max-h-32 overflow-auto rounded-[8px] bg-background px-2.5 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-muted-foreground select-text">{value}</pre>
    </div>
  );
}

// Lets Claude and other AI clients drive the open document through the app's local MCP endpoint.
export function McpSettings() {
  const [config, setConfig] = useState<McpConfig>(loadMcpConfig);
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = async (next: McpConfig) => {
    setConfig(next);
    setError(null);
    try {
      setStatus(await applyMcpConfig(next));
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    mcpStatus().then(setStatus).catch(() => {});
    const timer = setInterval(() => mcpStatus().then(setStatus).catch(() => {}), 3000);
    return () => clearInterval(timer);
  }, []);

  const snippets = connectSnippets(config);
  const running = !!status?.running;
  const problem = error ?? status?.error;

  return (
    <>
      <OptionGroup>
        <OptionRow
          label={t("Collega Claude e altri assistenti AI")}
          hint={problem ? t("Errore: {error}", { error: problem }) : running ? status?.clients ? t("Attivo su {url} · {n} connessioni", { url: mcpUrl(config), n: status.clients }) : t("Attivo su {url}", { url: mcpUrl(config) }) : t("Spento: nessun programma può controllare l'app")}
          htmlFor="mcp-enabled"
        >
          <span className="flex items-center gap-2">
            <span aria-hidden className={cn("size-2 rounded-full transition-colors duration-300", running ? "bg-[oklch(0.7_0.17_150)]" : "bg-muted-foreground/40")} />
            <Switch id="mcp-enabled" checked={config.enabled} onCheckedChange={(enabled) => apply({ ...config, enabled })} />
          </span>
        </OptionRow>
        <OptionRow label={t("Chiave di accesso")} hint={t("Chi ha la chiave può modificare i documenti aperti. Cambiala se l'hai condivisa per errore.")}>
          <Button variant="secondary" className="h-8 rounded-full px-3" onClick={() => apply({ ...config, token: newToken() })}>
            <RefreshCw /> {t("Rigenera")}
          </Button>
        </OptionRow>
      </OptionGroup>

      {config.enabled && (
        <OptionGroup>
          <CopyField label={t("Claude Code (terminale)")} value={snippets.claudeCode} />
          <CopyField label="Claude Desktop (claude_desktop_config.json)" value={snippets.claudeDesktop} />
        </OptionGroup>
      )}
    </>
  );
}
