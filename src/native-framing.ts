const HEADER_BYTES = 4;
export const MAX_NATIVE_MESSAGE_BYTES = 1024 * 1024;

export function encodeNativeMessage(value: unknown): Uint8Array {
  const body = new TextEncoder().encode(JSON.stringify(value));
  if (body.byteLength > MAX_NATIVE_MESSAGE_BYTES) {
    throw new Error(`Native message is ${body.byteLength} bytes; maximum is ${MAX_NATIVE_MESSAGE_BYTES}`);
  }

  const frame = new Uint8Array(HEADER_BYTES + body.byteLength);
  new DataView(frame.buffer).setUint32(0, body.byteLength, true);
  frame.set(body, HEADER_BYTES);
  return frame;
}

export class NativeMessageDecoder<T = unknown> {
  private buffer = new Uint8Array(0);

  push(chunk: Uint8Array): T[] {
    const merged = new Uint8Array(this.buffer.byteLength + chunk.byteLength);
    merged.set(this.buffer);
    merged.set(chunk, this.buffer.byteLength);
    this.buffer = merged;

    const messages: T[] = [];
    while (this.buffer.byteLength >= HEADER_BYTES) {
      const length = new DataView(
        this.buffer.buffer,
        this.buffer.byteOffset,
        HEADER_BYTES,
      ).getUint32(0, true);

      if (length > MAX_NATIVE_MESSAGE_BYTES) {
        throw new Error(`Native message declares ${length} bytes; maximum is ${MAX_NATIVE_MESSAGE_BYTES}`);
      }
      if (this.buffer.byteLength < HEADER_BYTES + length) break;

      const body = this.buffer.slice(HEADER_BYTES, HEADER_BYTES + length);
      messages.push(JSON.parse(new TextDecoder().decode(body)) as T);
      this.buffer = this.buffer.slice(HEADER_BYTES + length);
    }
    return messages;
  }
}
