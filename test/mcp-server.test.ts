import { afterAll, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(import.meta.dir, "..", "src", "mcp-server.ts")],
  stderr: "pipe",
});
const client = new Client({ name: "browser-mcp-test", version: "0.1.0" });

afterAll(async () => {
  await client.close();
});

describe("MCP server", () => {
  test("negotiates and exposes the MVP tool surface", async () => {
    await client.connect(transport);
    const response = await client.listTools();
    expect(response.tools.map((tool) => tool.name).sort()).toEqual([
      "tabs_list",
      "tabs_move",
      "tabs_reorder",
      "windows_list",
    ]);
  });
});
