import type {
  ChromeRequest,
  ChromeResponse,
  ReorderResult,
  TabSummary,
  WindowSummary,
} from "../protocol";
import { errorResponse } from "../protocol";
import { validateAndCreateUnits } from "./reorder";

function requireTabId(tab: chrome.tabs.Tab): number {
  if (tab.id === undefined) throw new Error("Chrome returned a tab without an ID");
  return tab.id;
}

function summarizeTab(tab: chrome.tabs.Tab): TabSummary {
  const summary: TabSummary = {
    id: requireTabId(tab),
    windowId: tab.windowId,
    index: tab.index,
    title: tab.title ?? "",
    active: tab.active,
    pinned: tab.pinned,
    groupId: tab.groupId,
  };
  if (tab.url !== undefined) summary.url = tab.url;
  return summary;
}

function summarizeWindow(window: chrome.windows.Window): WindowSummary {
  if (window.id === undefined) throw new Error("Chrome returned a window without an ID");
  const summary: WindowSummary = {
    id: window.id,
    focused: window.focused,
    incognito: window.incognito,
  };
  if (window.state !== undefined) summary.state = window.state;
  if (window.type !== undefined) summary.type = window.type;
  if (window.top !== undefined) summary.top = window.top;
  if (window.left !== undefined) summary.left = window.left;
  if (window.width !== undefined) summary.width = window.width;
  if (window.height !== undefined) summary.height = window.height;
  return summary;
}

async function windowTabs(windowId: number): Promise<chrome.tabs.Tab[]> {
  const tabs = await chrome.tabs.query({ windowId });
  return tabs.sort((a, b) => a.index - b.index);
}

async function reorderTabs(windowId: number, desiredIds: number[]): Promise<ReorderResult> {
  const before = await windowTabs(windowId);
  const activeTabId = before.find((tab) => tab.active)?.id;
  const originalGroups = new Map(before.map((tab) => [requireTabId(tab), tab.groupId]));
  const units = validateAndCreateUnits(
    before.map((tab) => ({
      id: requireTabId(tab),
      index: tab.index,
      active: tab.active,
      pinned: tab.pinned,
      groupId: tab.groupId,
    })),
    desiredIds,
  );

  let moves = 0;

  // First establish the desired order inside every existing group.
  for (const unit of units) {
    if (unit.kind !== "group") continue;
    for (let offset = 0; offset < unit.tabIds.length; offset += 1) {
      const current = await windowTabs(windowId);
      const groupTabs = current.filter((tab) => tab.groupId === unit.id);
      const groupStart = groupTabs[0]?.index;
      if (groupStart === undefined) throw new Error(`Tab group ${unit.id} disappeared during reorder`);
      const wantedId = unit.tabIds[offset]!;
      if (current[groupStart + offset]?.id !== wantedId) {
        await chrome.tabs.move(wantedId, { index: groupStart + offset });
        moves += 1;
      }
    }
  }

  // Then arrange top-level units. Group movement preserves membership and internal order.
  let cursor = 0;
  for (const unit of units) {
    const current = await windowTabs(windowId);
    const actualStart = current.findIndex((tab) => unit.tabIds.includes(requireTabId(tab)));
    if (actualStart !== cursor) {
      if (unit.kind === "group") {
        await chrome.tabGroups.move(unit.id, { index: cursor });
      } else {
        await chrome.tabs.move(unit.id, { index: cursor });
      }
      moves += 1;
    }
    cursor += unit.tabIds.length;
  }

  const after = await windowTabs(windowId);
  const finalIds = after.map(requireTabId);
  if (!desiredIds.every((id, index) => finalIds[index] === id)) {
    throw new Error(`Chrome did not produce the requested order; actual order is [${finalIds.join(", ")}]`);
  }
  for (const tab of after) {
    if (originalGroups.get(requireTabId(tab)) !== tab.groupId) {
      throw new Error(`Chrome changed group membership for tab ${tab.id}`);
    }
  }
  if (activeTabId !== undefined && !after.some((tab) => tab.id === activeTabId && tab.active)) {
    throw new Error("Chrome changed the active tab during reorder");
  }

  const result: ReorderResult = { tabs: after.map(summarizeTab), moves };
  if (activeTabId !== undefined) result.activeTabId = activeTabId;
  return result;
}

export async function handleChromeRequest(request: ChromeRequest): Promise<ChromeResponse> {
  try {
    switch (request.method) {
      case "tabs.list": {
        const query = request.params.windowId === undefined ? {} : { windowId: request.params.windowId };
        const tabs = await chrome.tabs.query(query);
        return { id: request.id, ok: true, result: tabs.sort((a, b) => a.windowId - b.windowId || a.index - b.index).map(summarizeTab) };
      }
      case "windows.list": {
        const windows = await chrome.windows.getAll({ populate: false });
        return { id: request.id, ok: true, result: windows.map(summarizeWindow) };
      }
      case "tabs.move": {
        const moveProperties: chrome.tabs.MoveProperties = { index: request.params.index };
        if (request.params.windowId !== undefined) moveProperties.windowId = request.params.windowId;
        const moved = await chrome.tabs.move(request.params.tabId, moveProperties);
        if (Array.isArray(moved)) throw new Error("Chrome returned multiple tabs for a single-tab move");
        return { id: request.id, ok: true, result: summarizeTab(moved) };
      }
      case "tabs.reorder":
        return {
          id: request.id,
          ok: true,
          result: await reorderTabs(request.params.windowId, request.params.tabIds),
        };
    }
  } catch (error) {
    return errorResponse(request.id, error);
  }
}
