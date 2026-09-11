export const NATIVE_HOST_NAME = "com.playgrndlabs.browser_mcp";

export type TabSummary = {
  id: number;
  windowId: number;
  index: number;
  title: string;
  url?: string;
  active: boolean;
  pinned: boolean;
  groupId: number;
};

export type WindowSummary = {
  id: number;
  focused: boolean;
  incognito: boolean;
  state?: NonNullable<chrome.windows.Window["state"]>;
  type?: NonNullable<chrome.windows.Window["type"]>;
  top?: number;
  left?: number;
  width?: number;
  height?: number;
};

export type ChromeRequest =
  | { id: string; method: "tabs.list"; params: { windowId?: number } }
  | { id: string; method: "tabs.move"; params: { tabId: number; index: number; windowId?: number } }
  | { id: string; method: "tabs.reorder"; params: { windowId: number; tabIds: number[] } }
  | { id: string; method: "windows.list"; params: Record<string, never> };

export type ChromeResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: { code: string; message: string } };

export type ReorderResult = {
  tabs: TabSummary[];
  moves: number;
  activeTabId?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function hasOptionalInteger(record: Record<string, unknown>, key: string): boolean {
  return record[key] === undefined || isInteger(record[key]);
}

export function parseChromeRequest(value: unknown): ChromeRequest {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0 || !isRecord(value.params)) {
    throw new Error("Request must have a non-empty string id and an object params value");
  }

  const params = value.params;
  switch (value.method) {
    case "tabs.list":
      if (!hasOptionalInteger(params, "windowId")) throw new Error("tabs.list windowId must be an integer");
      return value as ChromeRequest;
    case "windows.list":
      return value as ChromeRequest;
    case "tabs.move":
      if (!isInteger(params.tabId) || !isInteger(params.index) || params.index < 0 || !hasOptionalInteger(params, "windowId")) {
        throw new Error("tabs.move requires integer tabId, non-negative integer index, and optional integer windowId");
      }
      return value as ChromeRequest;
    case "tabs.reorder":
      if (!isInteger(params.windowId) || !Array.isArray(params.tabIds) || params.tabIds.length === 0 || !params.tabIds.every(isInteger)) {
        throw new Error("tabs.reorder requires integer windowId and a non-empty integer tabIds array");
      }
      return value as ChromeRequest;
    default:
      throw new Error(`Unknown Browser MCP method: ${String(value.method)}`);
  }
}

export function parseChromeResponse(value: unknown): ChromeResponse {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.ok !== "boolean") {
    throw new Error("Malformed response from the Chrome extension");
  }
  if (value.ok) return value as ChromeResponse;
  if (!isRecord(value.error) || typeof value.error.code !== "string" || typeof value.error.message !== "string") {
    throw new Error("Malformed error response from the Chrome extension");
  }
  return value as ChromeResponse;
}

export function errorResponse(id: string, error: unknown): ChromeResponse {
  const message = error instanceof Error ? error.message : String(error);
  return { id, ok: false, error: { code: "CHROME_API_ERROR", message } };
}
