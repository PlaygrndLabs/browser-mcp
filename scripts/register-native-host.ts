#!/usr/bin/env bun
import { chmod, mkdir } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { NATIVE_HOST_NAME } from "../src/protocol";

const extensionId = valueAfter("--extension-id");
const browser = valueAfter("--browser") ?? "chrome";

if (!extensionId || !/^[a-p]{32}$/.test(extensionId)) {
  console.error("Usage: bun run register-host --extension-id <32-character Chrome extension ID> [--browser chrome|chrome-beta|chromium|brave|edge]");
  process.exit(1);
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index < 0 ? undefined : process.argv[index + 1];
}

function browserConfigDirectory(): string {
  const names: Record<string, { mac: string; linux: string }> = {
    chrome: { mac: "Google/Chrome", linux: "google-chrome" },
    "chrome-beta": { mac: "Google/Chrome Beta", linux: "google-chrome-beta" },
    chromium: { mac: "Chromium", linux: "chromium" },
    brave: { mac: "BraveSoftware/Brave-Browser", linux: "BraveSoftware/Brave-Browser" },
    edge: { mac: "Microsoft Edge", linux: "microsoft-edge" },
  };
  const selected = names[browser];
  if (!selected) throw new Error(`Unsupported browser '${browser}'`);
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support", selected.mac);
  if (platform() === "linux") return join(homedir(), ".config", selected.linux);
  throw new Error("This installer currently supports macOS and Linux. Windows registry installation is planned.");
}

const projectRoot = resolve(import.meta.dir, "..");
const installDirectory = platform() === "darwin"
  ? join(homedir(), "Library", "Application Support", "Browser MCP")
  : join(homedir(), ".local", "share", "browser-mcp");
const launcherPath = join(installDirectory, "native-host");
const manifestPath = join(browserConfigDirectory(), "NativeMessagingHosts", `${NATIVE_HOST_NAME}.json`);
const quote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

await mkdir(installDirectory, { recursive: true });
await Bun.write(
  launcherPath,
  `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(join(projectRoot, "src", "native-host.ts"))}\n`,
);
await chmod(launcherPath, 0o755);
await mkdir(dirname(manifestPath), { recursive: true });
await Bun.write(
  manifestPath,
  `${JSON.stringify({
    name: NATIVE_HOST_NAME,
    description: "Browser MCP native messaging bridge",
    path: launcherPath,
    type: "stdio",
    allowed_origins: [`chrome-extension://${extensionId}/`],
  }, null, 2)}\n`,
);

console.log(`Registered ${NATIVE_HOST_NAME} for ${browser}.`);
console.log(`Manifest: ${manifestPath}`);
console.log("Reload the Browser MCP extension in chrome://extensions.");
