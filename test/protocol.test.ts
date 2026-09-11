import { describe, expect, test } from "bun:test";
import { parseChromeRequest, parseChromeResponse } from "../src/protocol";

describe("bridge protocol validation", () => {
  test("accepts valid requests and responses", () => {
    expect(parseChromeRequest({ id: "1", method: "tabs.move", params: { tabId: 4, index: 0 } })).toEqual({
      id: "1",
      method: "tabs.move",
      params: { tabId: 4, index: 0 },
    });
    expect(parseChromeResponse({ id: "1", ok: true, result: [] })).toEqual({ id: "1", ok: true, result: [] });
  });

  test("rejects unknown methods and malformed parameters", () => {
    expect(() => parseChromeRequest({ id: "1", method: "history.deleteAll", params: {} })).toThrow("Unknown");
    expect(() => parseChromeRequest({ id: "1", method: "tabs.move", params: { tabId: 4, index: -1 } })).toThrow("non-negative");
    expect(() => parseChromeResponse({ id: "1", ok: false, error: "nope" })).toThrow("Malformed error");
  });
});
