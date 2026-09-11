import { describe, expect, test } from "bun:test";
import { encodeNativeMessage, NativeMessageDecoder } from "../src/native-framing";

describe("native messaging framing", () => {
  test("decodes fragmented and adjacent frames", () => {
    const first = encodeNativeMessage({ id: "1", value: "hello" });
    const second = encodeNativeMessage({ id: "2", value: "world" });
    const combined = new Uint8Array(first.length + second.length);
    combined.set(first);
    combined.set(second, first.length);

    const decoder = new NativeMessageDecoder();
    expect(decoder.push(combined.slice(0, 3))).toEqual([]);
    expect(decoder.push(combined.slice(3, first.length + 2))).toEqual([{ id: "1", value: "hello" }]);
    expect(decoder.push(combined.slice(first.length + 2))).toEqual([{ id: "2", value: "world" }]);
  });
});
