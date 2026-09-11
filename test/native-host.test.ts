import { afterEach, describe, expect, test } from "bun:test";
import { createConnection } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { encodeNativeMessage, NativeMessageDecoder } from "../src/native-framing";
import type { ChromeRequest, ChromeResponse } from "../src/protocol";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

describe("native host bridge", () => {
  test.skipIf(process.env.CODEX_CI === "1")("forwards a socket request to Chrome framing and routes its response back", async () => {
    const directory = await mkdtemp(join(tmpdir(), "browser-mcp-test-"));
    const socketPath = join(directory, "bridge.sock");
    const processHandle = Bun.spawn([process.execPath, resolve(import.meta.dir, "..", "src", "native-host.ts")], {
      env: { ...process.env, BROWSER_MCP_SOCKET_PATH: socketPath },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    cleanup = async () => {
      processHandle.kill();
      await processHandle.exited;
      await rm(directory, { recursive: true, force: true });
    };

    const client = await connectEventually(socketPath);
    const request: ChromeRequest = { id: "bridge-test", method: "windows.list", params: {} };
    client.write(`${JSON.stringify(request)}\n`);

    const decoder = new NativeMessageDecoder<ChromeRequest>();
    const reader = processHandle.stdout.getReader();
    let forwarded: ChromeRequest | undefined;
    while (!forwarded) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error("Native host stdout closed before forwarding the request");
      forwarded = decoder.push(chunk.value)[0];
    }
    expect(forwarded).toEqual(request);

    const chromeResponse: ChromeResponse = { id: request.id, ok: true, result: [{ id: 7 }] };
    processHandle.stdin.write(encodeNativeMessage(chromeResponse));
    await processHandle.stdin.flush();

    const responseLine = await new Promise<string>((resolveResponse, reject) => {
      client.setEncoding("utf8");
      client.once("data", resolveResponse);
      client.once("error", reject);
    });
    expect(JSON.parse(responseLine)).toEqual(chromeResponse);
    client.destroy();
  });
});

async function connectEventually(socketPath: string): Promise<ReturnType<typeof createConnection>> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const socket = createConnection(socketPath);
    const connected = await new Promise<boolean>((resolveConnection) => {
      socket.once("connect", () => resolveConnection(true));
      socket.once("error", () => resolveConnection(false));
    });
    if (connected) return socket;
    socket.destroy();
    await Bun.sleep(10);
  }
  throw new Error("Native host socket did not become available");
}
