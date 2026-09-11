export type ReorderTab = {
  id: number;
  index: number;
  active: boolean;
  pinned: boolean;
  groupId: number;
};

export type ReorderUnit =
  | { kind: "tab"; id: number; tabIds: [number] }
  | { kind: "group"; id: number; tabIds: number[] };

export function validateAndCreateUnits(tabs: ReorderTab[], desiredIds: number[]): ReorderUnit[] {
  if (desiredIds.length !== tabs.length) {
    throw new Error(`tabIds must contain all ${tabs.length} tabs in the window exactly once`);
  }

  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const unique = new Set(desiredIds);
  if (unique.size !== desiredIds.length || desiredIds.some((id) => !byId.has(id))) {
    throw new Error("tabIds must be an exact permutation of the window's current tab IDs");
  }

  let sawUnpinned = false;
  for (const id of desiredIds) {
    const tab = byId.get(id)!;
    if (!tab.pinned) sawUnpinned = true;
    if (tab.pinned && sawUnpinned) {
      throw new Error("Pinned tabs must stay before all unpinned tabs");
    }
  }

  const groupPositions = new Map<number, number[]>();
  desiredIds.forEach((id, position) => {
    const groupId = byId.get(id)!.groupId;
    if (groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return;
    const positions = groupPositions.get(groupId) ?? [];
    positions.push(position);
    groupPositions.set(groupId, positions);
  });

  for (const [groupId, positions] of groupPositions) {
    const start = positions[0]!;
    if (positions.some((position, offset) => position !== start + offset)) {
      throw new Error(`Tabs in group ${groupId} must remain contiguous`);
    }
  }

  const units: ReorderUnit[] = [];
  const emittedGroups = new Set<number>();
  for (const id of desiredIds) {
    const tab = byId.get(id)!;
    if (tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
      units.push({ kind: "tab", id, tabIds: [id] });
      continue;
    }
    if (emittedGroups.has(tab.groupId)) continue;
    emittedGroups.add(tab.groupId);
    units.push({
      kind: "group",
      id: tab.groupId,
      tabIds: desiredIds.filter((candidate) => byId.get(candidate)!.groupId === tab.groupId),
    });
  }
  return units;
}
