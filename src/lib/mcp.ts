import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { runTool, toolDefs, type buildTools } from "@/lib/mcp-tools";

export type McpConfig = { enabled: boolean; port: number; token: string };
export type McpStatus = { running: boolean; port: number; error: string | null; clients: number };

const KEY = "pdf-toolkit:mcp";
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");

export function loadMcpConfig(): McpConfig {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (c && typeof c.token === "string" && c.token.length >= 24) return { enabled: !!c.enabled, port: Number(c.port) || 47321, token: c.token };
  } catch {}
  return { enabled: false, port: 47321, token: randomToken() };
}

export async function applyMcpConfig(c: McpConfig): Promise<McpStatus | null> {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {}
  if (!isTauri()) return null;
  return invoke<McpStatus>("mcp_configure", { enabled: c.enabled, port: c.port, token: c.token });
}

export const newToken = randomToken;
export const mcpStatus = () => (isTauri() ? invoke<McpStatus>("mcp_status") : Promise.resolve(null));
export const mcpUrl = (c: McpConfig) => `http://127.0.0.1:${c.port}/mcp`;

export function connectSnippets(c: McpConfig) {
  return {
    claudeCode: `claude mcp add --transport http pdf-toolkit ${mcpUrl(c)} --header "Authorization: Bearer ${c.token}"`,
    claudeDesktop: JSON.stringify({ mcpServers: { "pdf-toolkit": { command: "npx", args: ["-y", "mcp-remote", mcpUrl(c), "--header", `Authorization: Bearer ${c.token}`] } } }, null, 2),
  };
}

// Registers the tools with the backend and answers the calls it forwards; `tools` is read fresh on every call.
export function serveMcp(tools: () => ReturnType<typeof buildTools>): () => void {
  if (!isTauri()) return () => {};
  invoke("mcp_set_tools", { tools: toolDefs(tools()) }).catch(() => {});
  const off = listen<{ id: string; name: string; arguments?: Record<string, unknown> }>("mcp-call", async (e) => {
    const result = await runTool(tools(), e.payload.name, e.payload.arguments ?? {});
    // Rejected only when the backend already gave up on this call (timeout): nothing left to answer.
    await invoke("mcp_respond", { id: e.payload.id, result }).catch(() => {});
  });
  // Boot: restore the user's choice (off by default). Dev builds can force it on for end-to-end tests.
  const devToken = import.meta.env.DEV ? (import.meta.env.VITE_MCP_DEV_TOKEN as string | undefined) : undefined;
  applyMcpConfig(devToken ? { ...loadMcpConfig(), enabled: true, token: devToken } : loadMcpConfig()).catch(() => {});
  return () => void off.then((f) => f());
}
