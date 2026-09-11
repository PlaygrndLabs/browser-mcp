import { beforeEach, describe, expect, test } from "bun:test";
import { handleChromeRequest } from "../src/extension/chrome-controller";
import type { ReorderResult } from "../src/protocol";

function tab(id: number, index: number, options: { active?: boolean; pinned?: boolean; groupId?: number } = {}): chrome.tabs.Tab {
  return {
    id,
    index,
    windowId: 7,
    active: options.active ?? false,
    pinned: options.pinned ?? false,
    groupId: options.groupId ?? -1,
    highlighted: options.active ?? false,
    incognito: false,
    selected: options.active ?? false,
    discarded: false,
    autoDiscardable: true,
    frozen: false,
    splitViewId: -1,
    title: `Tab ${id}`,
    url: `https://example.com/${id}`,
  };
}

function installFakeChrome(initialTabs: chrome.tabs.Tab[]): chrome.tabs.Tab[] {
  const state = initialTabs.map((item) => ({ ...item }));
  const reindex = () => state.forEach((item, index) => { item.index = index; });
  const moveIds = (ids: number[], index: number) => {
    const moving = state.filter((item) => ids.includes(item.id!));
    for (const movingTab of moving) state.splice(state.indexOf(movingTab), 1);
    state.splice(Math.min(index, state.length), 0, ...moving);
    reindex();
    return moving;
  };

  globalThis.chrome = {
    tabs: {
      query: async ({ windowId }: chrome.tabs.QueryInfo) =>
        state.filter((item) => windowId === undefined || item.windowId === windowId).map((item) => ({ ...item })),
      move: async (tabIds: number | number[], { index }: chrome.tabs.MoveProperties) => {
        const moved = moveIds(Array.isArray(tabIds) ? tabIds : [tabIds], index).map((item) => ({ ...item }));
        return Array.isArray(tabIds) ? moved : moved[0]!;
      },
    },
    tabGroups: {
      TAB_GROUP_ID_NONE: -1,
      move: async (groupId: number, { index }: chrome.tabGroups.MoveProperties) => {
        moveIds(state.filter((item) => item.groupId === groupId).map((item) => item.id!), index);
        return { id: groupId } as chrome.tabGroups.TabGroup;
      },
    },
    windows: { getAll: async () => [] },
  } as unknown as typeof chrome;
  return state;
}

describe("Chrome controller", () => {
  beforeEach(() => {
    installFakeChrome([]);
  });

  test("reorders tabs without changing the active tab", async () => {
    const state = installFakeChrome([
      tab(1, 0),
      tab(2, 1),
      tab(3, 2, { active: true }),
      tab(4, 3),
      tab(5, 4),
    ]);

    const response = await handleChromeRequest({
      id: "acceptance-test",
      method: "tabs.reorder",
      params: { windowId: 7, tabIds: [2, 4, 1, 3, 5] },
    });

    expect(response.ok).toBe(true);
    expect(state.map((item) => item.id)).toEqual([2, 4, 1, 3, 5]);
    expect(state.find((item) => item.active)?.id).toBe(3);
    if (response.ok) expect((response.result as ReorderResult).activeTabId).toBe(3);
  });

  test("moves groups as units and preserves their internal order", async () => {
    const state = installFakeChrome([
      tab(1, 0, { pinned: true }),
      tab(4, 1, { active: true }),
      tab(5, 2),
      tab(2, 3, { groupId: 10 }),
      tab(3, 4, { groupId: 10 }),
    ]);

    const response = await handleChromeRequest({
      id: "group-test",
      method: "tabs.reorder",
      params: { windowId: 7, tabIds: [1, 3, 2, 4, 5] },
    });

    expect(response.ok).toBe(true);
    expect(state.map((item) => item.id)).toEqual([1, 3, 2, 4, 5]);
    expect(state.filter((item) => item.groupId === 10).map((item) => item.id)).toEqual([3, 2]);
    expect(state.find((item) => item.active)?.id).toBe(4);
  });
});
