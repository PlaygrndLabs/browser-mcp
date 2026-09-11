import { createConnection } from "node:net";
import { parseChromeResponse, type ChromeRequest } from "./protocol";
import { browserMcpSocketPath } from "./socket-path";

export class ChromeClient {
  constructor(
    private readonly socketPath = browserMcpSocketPath(),
    private readonly timeoutMs = 10_000,
  ) {}

  request<T>(request: ChromeRequest): Promise<T> {
    return new Promise((resolve, reject) => {
      const socket = createConnection(this.socketPath);
      let responseText = "";
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Chrome did not respond within ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      const fail = (error: Error): void => {
        clearTimeout(timeout);
        reject(
          error.message.includes("ENOENT") || error.message.includes("ECONNREFUSED")
            ? new Error("Browser MCP native host is unavailable. Open Chrome and verify the extension reports ‘Native host connected’.")
            : error,
        );
      };

      socket.once("error", fail);
      socket.once("connect", () => socket.write(`${JSON.stringify(request)}\n`));
      socket.setEncoding("utf8");
      socket.on("data", (chunk: string) => {
        responseText += chunk;
        const newline = responseText.indexOf("\n");
        if (newline < 0) return;
        clearTimeout(timeout);
        socket.removeListener("error", fail);
        socket.end();
        const response = parseChromeResponse(JSON.parse(responseText.slice(0, newline)));
        if (!("id" in response) || response.id !== request.id) {
          reject(new Error("Native host returned a mismatched response"));
        } else if (!response.ok) {
          reject(new Error(`${response.error.code}: ${response.error.message}`));
        } else {
          resolve(response.result as T);
        }
      });
    });
  }
}
