# claude-code store layout

Measured 2026-09-16 on this machine (`~/.claude`). Reader: `src/hosts/claude-code.ts`.

## Store

```
~/.claude/plugins/installed_plugins.json
  { "version": 2, "plugins": { "<name>@<marketplace>": [
      { "scope": "user", "installPath": "<abs>", "version": "<v>",
        "installedAt": "…", "lastUpdated": "…", "gitCommitSha": "<12-char>" } ] } }

~/.claude/plugins/cache/<marketplace>/<name>/<version-or-sha>/   # install dirs
  .mcp.json            # claude-code plugin MCP surface (what the host launches)
  mcp.json             # spec §7.2.1 copy written by the plugins CLI (same content)
  .plugin/plugin.json          # spec §5.2 manifest
  .claude-plugin/plugin.json   # claude-code native manifest (no inline mcpServers)
  skills/<skill>/SKILL.md

~/.claude/plugins/marketplaces/<name>/    # git clones of marketplace repos
~/.claude/plugins/data/<plugin>-<marketplace>/   # per-plugin data dirs (spec §9.1 PLUGIN_DATA analogue)
```

User-level MCP config: top-level `mcpServers` object of `~/.claude.json`
(a sibling of `~/.claude`, so it follows `OPEN_PLUGIN_HOME`, not the root
override). Per-project `mcpServers` under `projects.<path>` are not read in v0.

## Reader decisions

- **Plugin MCP source priority**: `.mcp.json`, then `mcp.json` — both read,
  identical entries deduped. `claude mcp list` shows plugin servers namespaced
  `plugin:<plugin>:<server>` (e.g. `plugin:omakase:omakase`).
- `installPath` records are absolute; the reader falls back to the computed
  cache slot `cache/<marketplace>/<name>/<version>` when the recorded path is
  gone (relocated homes, fixtures).
- Native commands may use `${CLAUDE_PLUGIN_ROOT}` (measured:
  `cache/air-checkout-65e728661043031a/alp/unknown/.mcp.json`); doctor expands
  it against the plugin root. A spec `mcp.json` `command` must not contain
  placeholders at all (spec §7.2.1).
- Shadow semantics: user entry vs plugin server of the same name — namespaced
  `plugin:` prefix means they coexist (duplicate), no silent shadow observed;
  doctor reports the generic shadow/duplicate message.

## Pin

`pin` rewrites the bare `command` of every stdio server in a cache slot's
`.mcp.json` and `mcp.json` (both carry the server). `~/.claude.json`'s
top-level `mcpServers` is user-level config and is never touched. claude-code
is not a GUI host, so it is not a default `pin` target; `--all` reaches it.
Rationale: `docs/pin-and-update.md`.

## Evidence paths (read 2026-09-16)

- `~/.claude/plugins/installed_plugins.json` — registry shape, `omakase@oh-my-ai-sdk` row with `installPath`/`gitCommitSha`
- `~/.claude/plugins/cache/oh-my-ai-sdk/omakase/{0.0.1,4f6f7f0a414e,897bf5b61c33,…}/` — install dirs, both mcp files
- `~/.claude.json` — top-level `mcpServers` (stdio + http entries)
- `~/.claude/plugins/marketplaces/oh-my-ai-sdk/` — marketplace git clone
- omakase-distribution-state-2026-09-16.md — `claude mcp list → plugin:omakase:omakase ✔`

## Open

- Which cache entry of several (sha-keyed copies + `.orphaned_at` markers) is
  live is not derived in v0; every registry row is listed.
