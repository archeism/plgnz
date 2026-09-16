# codex store layout

Measured 2026-09-16 on this machine (`~/.codex`). Reader: `src/hosts/codex.ts`.

## Store

```
~/.codex/config.toml
  [plugins."<name>@<marketplace>"]     # enabled = true|false — the install registry
  [mcp_servers.<name>]                 # user-level MCP: command/args/env/cwd (stdio)
                                       # or url (HTTP); optional enabled flag

~/.codex/plugins/cache/<marketplace>/<name>/<version>/   # install dirs
  .codex-plugin/plugin.json   # native manifest whose `mcpServers` is a pointer
                              # string ("./.mcp.json") — never inline (13 measured:
                              # 6 pointers, 7 absent)
  .mcp.json / mcp.json        # spec copies written by the plugins CLI
  .plugin/plugin.json         # spec §5.2 manifest
  skills/<skill>/SKILL.md
```

## Reader decisions

- **Plugin MCP source priority**: `.codex-plugin/plugin.json` (its `mcpServers`
  pointer resolved against the plugin root), then `.mcp.json`, then `mcp.json`
  — all read, identical entries deduped.
- Install dirs are keyed by version; when several exist the lexicographically
  highest subdir is picked (only single-version slots measured).
- Native commands may use `${CODEX_PLUGIN_ROOT}` (measured:
  `cache/air-local/alp/0.1.43/.mcp.json`); doctor expands it against the
  plugin root. A spec `mcp.json` `command` must not contain placeholders
  (spec §7.2.1).
- `enabled = false` entries are still checked, with ` [disabled]` appended to
  the message — a dead disabled entry is a latent failure mode, not a healthy
  one.
- **Shadow semantics (measured)**: a user-level `[mcp_servers.X]` silently
  wins over a plugin-provided server of the same name; doctor reports ✗ with
  "the user entry wins and silently shadows the plugin server".

## Evidence paths (read 2026-09-16)

- `~/.codex/config.toml:566` — `[plugins."omakase@plugins-cli"] enabled = true`
- `~/.codex/config.toml:306+` — `[mcp_servers.*]` stdio (`command`/`args`) and url-type entries
- `~/.codex/plugins/cache/plugins-cli/omakase/0.0.0/` — install dir with `.codex-plugin/plugin.json` (`"mcpServers": "./.mcp.json"`), `.mcp.json`, `mcp.json`, `.plugin/`
- omakase-distribution-state-2026-09-16.md — the shadow incident: a hand-written `[mcp_servers.omakase]` shadowed the plugin server until deleted (`codex mcp list`)

## Open

- Relative commands in user config (`./…`) are resolved against `~/.codex`;
  the codex client's actual cwd at launch is not knowable from config — such
  entries can be false ✗s (one measured: the disabled `computer-use` entry).
