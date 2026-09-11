import { errorResponse, NATIVE_HOST_NAME, parseChromeRequest, type ChromeResponse } from "../protocol";
import { handleChromeRequest } from "./chrome-controller";

let nativePort: chrome.runtime.Port | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

function setBadge(connected: boolean): void {
  void chrome.action.setBadgeText({ text: connected ? "" : "!" });
  if (!connected) void chrome.action.setBadgeBackgroundColor({ color: "#d93f3f" });
}

function connectNativeHost(): void {
  if (nativePort) return;
  try {
    const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    nativePort = port;
    setBadge(true);

    port.onMessage.addListener((value: unknown) => {
      let operation: Promise<ChromeResponse>;
      try {
        operation = handleChromeRequest(parseChromeRequest(value));
      } catch (error) {
        const id = typeof value === "object" && value !== null && "id" in value && typeof value.id === "string"
          ? value.id
          : "invalid-request";
        operation = Promise.resolve(errorResponse(id, error));
      }
      void operation.then((response) => {
        try {
          port.postMessage(response);
        } catch {
          // onDisconnect handles reconnection and status.
        }
      });
    });

    port.onDisconnect.addListener(() => {
      nativePort = undefined;
      setBadge(false);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectNativeHost, 2_000);
    });
  } catch {
    nativePort = undefined;
    setBadge(false);
    reconnectTimer = setTimeout(connectNativeHost, 2_000);
  }
}

chrome.runtime.onInstalled.addListener(connectNativeHost);
chrome.runtime.onStartup.addListener(connectNativeHost);
chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (typeof message === "object" && message !== null && "type" in message && message.type === "native-status") {
    sendResponse({ connected: nativePort !== undefined });
  }
});

connectNativeHost();
