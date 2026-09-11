#!/usr/bin/env bun
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dir, "..");
console.log(JSON.stringify({
  mcpServers: {
    browser: {
      command: process.execPath,
      args: [resolve(projectRoot, "src", "mcp-server.ts")],
    },
  },
}, null, 2));
