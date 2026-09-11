#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ChromeClient } from "./chrome-client";
import type { ChromeRequest } from "./protocol";

const server = new McpServer({ name: "browser-mcp", version: "0.1.0" });
const client = new ChromeClient();

type ToolResult = { content: Array<{ type: "text"; text: string }> };
type ToolConfig<T extends object> = {
  description: string;
  inputSchema: { [K in keyof T]-?: z.ZodType<T[K]> } | Record<string, never>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
};
const registerTool = server.registerTool.bind(server) as <T extends object>(
  name: string,
  config: ToolConfig<T>,
  callback: (args: T) => Promise<ToolResult>,
) => void;

function request<T>(method: ChromeRequest["method"], params: ChromeRequest["params"]): Promise<T> {
  return client.request<T>({ id: crypto.randomUUID(), method, params } as ChromeRequest);
}

function result(value: unknown): ToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

registerTool<{ windowId?: number }>(
  "tabs_list",
  {
    description: "List Chrome tabs without activating or focusing them. Omit windowId to list tabs in all windows.",
    inputSchema: { windowId: z.number().int().optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ windowId }) => result(await request("tabs.list", windowId === undefined ? {} : { windowId })),
);

registerTool<Record<string, never>>(
  "windows_list",
  {
    description: "List Chrome windows and their basic metadata without changing window focus.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => result(await request("windows.list", {})),
);

registerTool<{ tabId: number; index: number; windowId?: number }>(
  "tabs_move",
  {
    description: "Move one Chrome tab to an index, optionally into another window. Does not explicitly activate a tab or focus a window.",
    inputSchema: {
      tabId: z.number().int(),
      index: z.number().int().min(0),
      windowId: z.number().int().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  async ({ tabId, index, windowId }) =>
    result(await request("tabs.move", { tabId, index, ...(windowId === undefined ? {} : { windowId }) })),
);

registerTool<{ windowId: number; tabIds: number[] }>(
  "tabs_reorder",
  {
    description: "Make one window's complete tab order exactly match tabIds while preserving its active tab and existing tab groups. tabIds must include every tab once; pinned tabs must remain first and each group must stay contiguous.",
    inputSchema: {
      windowId: z.number().int(),
      tabIds: z.array(z.number().int()).min(1),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ windowId, tabIds }) => result(await request("tabs.reorder", { windowId, tabIds })),
);

await server.connect(new StdioServerTransport());
