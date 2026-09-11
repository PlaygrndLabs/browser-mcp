import { mkdir, rm } from "node:fs/promises";

await mkdir("extension/dist", { recursive: true });
await rm("extension/dist", { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ["src/extension/service-worker.ts", "src/extension/popup.ts"],
  outdir: "extension/dist",
  target: "browser",
  format: "esm",
  minify: false,
  sourcemap: "linked",
  naming: "[dir]/[name].js",
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log("Built Browser MCP extension.");
