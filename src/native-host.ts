import { createConnection, createServer, type Socket } from "node:net";
import { chmod, mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { browserMcpSocketPath } from "./socket-path";
import { encodeNativeMessage, NativeMessageDecoder } from "./native-framing";
import { parseChromeRequest, parseChromeResponse, type ChromeRequest, type ChromeResponse } from "./protocol";

const socketPath = browserMcpSocketPath();
const pending = new Map<string, Socket>();
const decoder = new NativeMessageDecoder<unknown>();

function log(message: string): void {
  process.stderr.write(`[browser-mcp native host] ${message}\n`);
}

function sendToChrome(request: ChromeRequest): void {
  process.stdout.write(encodeNativeMessage(request));
}

process.stdin.on("data", (chunk: Buffer) => {
  try {
    for (const value of decoder.push(chunk)) {
      const response = parseChromeResponse(value);
      const client = pending.get(response.id);
      if (!client) continue;
      pending.delete(response.id);
      client.end(`${JSON.stringify(response)}\n`);
    }
  } catch (error) {
    log(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    process.stdin.destroy();
  }
});

const server = createServer((client) => {
  client.setEncoding("utf8");
  let buffer = "";
  client.on("data", (chunk: string) => {
    buffer += chunk;
    const newline = buffer.indexOf("\n");
    if (newline < 0) return;
    const line = buffer.slice(0, newline);
    try {
      const request = parseChromeRequest(JSON.parse(line));
      if (!request.id || pending.has(request.id)) throw new Error("Request ID is missing or already pending");
      pending.set(request.id, client);
      sendToChrome(request);
    } catch (error) {
      client.end(`${JSON.stringify({ ok: false, error: { code: "BAD_REQUEST", message: error instanceof Error ? error.message : String(error) } })}\n`);
    }
  });
  client.on("close", () => {
    for (const [id, socket] of pending) if (socket === client) pending.delete(id);
  });
});

server.on("error", (error: NodeJS.ErrnoException) => {
  log(`Socket server failed: ${error.message}`);
  process.exit(1);
});

async function prepareSocketPath(): Promise<void> {
  await mkdir(dirname(socketPath), { recursive: true });
  await chmod(dirname(socketPath), 0o700);
  const socketIsLive = await new Promise<boolean>((resolve) => {
    const probe = createConnection(socketPath);
    probe.once("connect", () => {
      probe.destroy();
      resolve(true);
    });
    probe.once("error", () => resolve(false));
  });
  if (socketIsLive) throw new Error(`Another Browser MCP native host is already listening on ${socketPath}`);
  await rm(socketPath, { force: true });
}

await prepareSocketPath();
server.listen(socketPath, () => {
  void chmod(socketPath, 0o600);
  log(`Listening on ${socketPath}`);
});

let shuttingDown = false;
async function shutdown(exitAfterCleanup: boolean): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const client of new Set(pending.values())) client.destroy();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(socketPath, { force: true });
  if (exitAfterCleanup) process.exit(0);
}

process.stdin.on("end", () => void shutdown(false));
process.on("SIGTERM", () => void shutdown(true));
process.on("SIGINT", () => void shutdown(true));
