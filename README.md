# Browser MCP

Browser MCP gives AI agents a browser-level Chrome control plane through MCP. It changes Chrome state with extension APIs—never by dragging tabs, stealing focus, or simulating mouse and keyboard input.

The MVP exposes four tools:

- `tabs_list`: list tabs in one or all Chrome windows
- `windows_list`: list Chrome windows
- `tabs_move`: move one tab within or between windows
- `tabs_reorder`: set a window's complete tab order while preserving the active tab and tab groups

## Architecture

```text
AI client → stdio MCP server → local Unix socket → Chrome native host → extension → chrome.* APIs
```

The Unix socket is local to the current OS user. There is no localhost TCP/HTTP server, page automation, DevTools session, new Chrome profile, or generic `chrome.call` escape hatch.

## Requirements

- Bun 1.2+
- Chrome 105+ on macOS or Linux

## Install for local development

```bash
bun install
bun run check
bun run build
```

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and choose this repository's `extension` directory.
4. Copy the extension ID shown by Chrome.
5. Register the native messaging host:

```bash
bun run register-host --extension-id <extension-id>
```

6. Reload the extension. Its popup should say **Native host connected**.
7. Print the MCP client configuration:

```bash
bun run print-mcp-config
```

Add the resulting `browser` server entry to any stdio-compatible MCP client and restart that client.

The registration command also supports `--browser chrome-beta|chromium|brave|edge`. Run it from the final repository location because the native-host registration contains absolute paths.

## Tool behavior and safety

`tabs_reorder` accepts an exact permutation of every tab ID in one window. It validates the entire request before changing Chrome:

- pinned tabs must remain before unpinned tabs;
- members of an existing tab group must remain contiguous;
- group membership is preserved by moving groups as units;
- the active tab is checked before and after the operation;
- no call activates a tab or focuses a window.

Moving an *active* tab to another window with `tabs_move` can still cause Chrome itself to select a replacement in the source window. Browser MCP never calls `tabs.update({ active: true })` or `windows.update({ focused: true })` implicitly.

## Permissions

- `nativeMessaging`: private extension ↔ native-host transport
- `tabs`: tab URLs/titles and tab operations
- `tabGroups`: preserve and move existing groups as units during reorder

Additional Chrome surfaces such as bookmarks, history, sessions, downloads, cookies, or extension management are intentionally not exposed yet. They should be added as explicit, validated MCP tools with their own permissions and risk classification.

## Development

```bash
bun run build       # bundle extension scripts
bun run typecheck   # strict TypeScript
bun test            # Bun tests
```

After rebuilding, click **Reload** for Browser MCP on `chrome://extensions`.

## Current platform scope

Native-host installation is implemented for macOS and Linux. Windows needs a small installer addition because Chrome registers native hosts there through the registry rather than only a manifest directory.
