# cursor store layout

Measured 2026-09-16 on this machine (`~/.cursor`). Reader: `src/hosts/cursor.ts`.

## Store

```
~/.cursor/mcp.json                     # user-level { mcpServers: { … } }

~/.cursor/plugins/local/<name>/        # dereferenced plugin copies
  .cursor-plugin/plugin.json           # native manifest (no inline mcpServers measured)
  .mcp.json                            # plugin MCP surface; house route pins the
                                       # command to an absolute path (GUI host)
  mcp.json                             # spec §7.2.1 copy (also pinned here)
  skills/<skill>/SKILL.md

~/.cursor/plugins/cache/<marketplace>/<plugin>/<id>/   # cursor-native cache, observed
~/.cursor/plugins/marketplaces/                        # cursor-native marketplaces, observed
```

`npx plugins --target cursor` does **not** install into Cursor (house route
rejected it); the working route is a dereferenced copy into `plugins/local/`
plus `.cursor-plugin/plugin.json` (omas issue #284).

## Reader decisions

- **Plugin MCP source priority**: `.mcp.json`, then `mcp.json` — both read,
  identical entries deduped. On this machine both files of the omakase plugin
  carry the absolute pinned command, so which one Cursor launches is not
  distinguishable from evidence; reading both covers either.
- **GUI host**: `launchctl getenv PATH` is unset, so a bare command cannot be
  assumed to resolve (spec §7.2.1 makes PATH participation client-defined).
  Doctor flags bare commands `!` with `run plgnz pin`; `pin` rewrites
  them to absolute paths.
- **Shadow semantics (measured)**: a user-level entry and a plugin server of
  the same name both load and duplicate (Cursor runs the plugin one as
  `plugin-<plugin>-<server>`); doctor reports ✗ with "both load and duplicate".
- Native commands may use `${CURSOR_PLUGIN_ROOT}` (measured:
  `plugins/local/alp/.mcp.json`); doctor expands it against the plugin root.

## Pin

Cursor is the default `pin` target (`gui: true`). `pin()` rewrites the bare
`command` of every stdio server in each plugin copy's `mcp.json` *and*
`.mcp.json` — both files, because both carry the server and whichever one
Cursor launches is not distinguishable from the evidence. `~/.cursor/mcp.json`
is a user-level file and is never touched. Rationale and refusal rules:
`docs/pin-and-update.md`.

## Evidence paths (read 2026-09-16)

- `~/.cursor/mcp.json` — user-level `mcpServers` (url-type entry)
- `~/.cursor/plugins/local/omakase/` — `.cursor-plugin/plugin.json`; `.mcp.json` and `mcp.json` both `command: /Users/chaz/.bun/bin/omakase` (absolute)
- `~/.cursor/plugins/{cache,marketplaces}/` — cursor-native dirs observed, not read in v0
- omakase-distribution-state-2026-09-16.md — GUI PATH failure (`launchctl getenv PATH` unset), duplicate failure mode, `plugin-omakase-omakase` toolCount 10

## Open

- No per-plugin registry file observed under `plugins/local/` (unlike
  claude-code); installs are discovered by scanning for
  `.cursor-plugin/plugin.json`. If Cursor grows an index, prefer it.
