import { homedir, platform, userInfo } from "node:os";
import { join } from "node:path";

export function browserMcpSocketPath(): string {
  const overridden = process.env.BROWSER_MCP_SOCKET_PATH;
  if (overridden) return overridden;

  if (platform() === "darwin") {
    return join(homedir(), "Library", "Application Support", "Browser MCP", "browser-mcp.sock");
  }

  const runtimeDirectory = process.env.XDG_RUNTIME_DIR;
  if (runtimeDirectory) return join(runtimeDirectory, "browser-mcp.sock");
  return `/tmp/browser-mcp-${userInfo().uid}.sock`;
}
