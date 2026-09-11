import { beforeAll, describe, expect, test } from "bun:test";
import { validateAndCreateUnits } from "../src/extension/reorder";

beforeAll(() => {
  globalThis.chrome = { tabGroups: { TAB_GROUP_ID_NONE: -1 } } as typeof chrome;
});

const tabs = [
  { id: 1, index: 0, active: false, pinned: true, groupId: -1 },
  { id: 2, index: 1, active: false, pinned: false, groupId: 10 },
  { id: 3, index: 2, active: true, pinned: false, groupId: 10 },
  { id: 4, index: 3, active: false, pinned: false, groupId: -1 },
];

describe("reorder validation", () => {
  test("creates group-preserving units", () => {
    expect(validateAndCreateUnits(tabs, [1, 4, 3, 2])).toEqual([
      { kind: "tab", id: 1, tabIds: [1] },
      { kind: "tab", id: 4, tabIds: [4] },
      { kind: "group", id: 10, tabIds: [3, 2] },
    ]);
  });

  test("rejects an incomplete permutation", () => {
    expect(() => validateAndCreateUnits(tabs, [1, 2, 3])).toThrow("all 4 tabs");
  });

  test("rejects pinned tabs after unpinned tabs", () => {
    expect(() => validateAndCreateUnits(tabs, [4, 1, 2, 3])).toThrow("Pinned tabs");
  });

  test("rejects split groups", () => {
    expect(() => validateAndCreateUnits(tabs, [1, 2, 4, 3])).toThrow("must remain contiguous");
  });
});
