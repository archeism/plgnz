# kimi store layout

Measured 2026-09-16 on this machine (`~/.kimi-code`). Reader: `src/hosts/kimi.ts`.

## Store

```
~/.kimi-code/plugins/installed.json
  { "version": 1, "plugins": [
      { "id": "<name>", "root": "<abs install dir>", "source": "local-path",
        "enabled": true, "installedAt": "…", "updatedAt": "…",
        "originalSource": "<staging path>" } ] }

~/.kimi-code/plugins/managed/<id>/    # install dirs
  .kimi-plugin/plugin.json    # native manifest WITH inline mcpServers
                              # (spec-style entries: type/command/args) + "skills": "./skills/"
  .mcp.json / mcp.json        # spec copies written by the plugins CLI
  .plugin/plugin.json         # spec §5.2 manifest
  skills/<skill>/SKILL.md
```

## Reader decisions

- **Plugin MCP source priority**: inline `.kimi-plugin/plugin.json`
  `mcpServers` (spec-style), then `.mcp.json`, then `mcp.json` — all read,
  identical entries deduped.
- `root` records are absolute; the reader falls back to
  `plugins/managed/<id>` when the recorded path is gone.
- **User-level MCP (unverified)**: kimi is a TOML-config host like codex
  (`~/.kimi-code/config.toml`), so the reader also parses
  `[mcp_servers.<name>]` there — none exist on this machine as of 2026-09-16
  and kimi's shadow semantics for them are **unverified**; doctor reports the
  generic shadow/duplicate message if a collision ever appears.

## Evidence paths (read 2026-09-16)

- `~/.kimi-code/plugins/installed.json` — registry shape, `omakase` row with `root`/`originalSource`
- `~/.kimi-code/plugins/managed/omakase/` — install dir; `.kimi-plugin/plugin.json` carries inline `mcpServers` with `"type": "stdio"`, `command: "omakase"`; `.mcp.json`/`mcp.json`/`.plugin/` also present
- `~/.kimi-code/config.toml` — section list read; no `[mcp_servers.*]` present

## Open

- Whether the plugins CLI's `originalSource` staging path can serve as a
  staleness source is not exploited in v0 (state.json is the only ledger).
