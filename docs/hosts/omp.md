# omp store layout

Measured 2026-09-16 on this machine (`~/.omp`). Reader: `src/hosts/omp.ts`.

omp is a native plugin host with its own store (AGENTS.md hosts list; landed
in main as `d1db50f`), and omp sessions read their MCP config from the
repository-root `.mcp.json` of the workspace they run in.

## Store

```
~/.omp/plugins/installed_plugins.json
  # claude-code-shaped registry:
  { "version": 2, "plugins": { "<name>@<marketplace>": [
      { "scope": "user", "installPath": "<abs>", "version": "<v>",
        "installedAt": "…", "lastUpdated": "…" } ] } }

~/.omp/plugins/cache/plugins/<marketplace>___<name>___<version>/
  # flat triple-underscore keys (unlike claude-code's nested cache layout)
  plugin.json                 # root manifest (spec-style; no inline mcpServers measured)
  .cursor-plugin/ .claude-plugin/ .codex-plugin/   # dereferenced host manifests
  skills/<skill>/SKILL.md

~/.omp/plugins/omp-plugins.lock.json
  { "plugins": { "<name>": { "version": "…", "enabled": true, "enabledFeatures": null } },
    "settings": {} }

~/.omp/plugins/node_modules/<name>   # symlinks into cache/plugins/ dirs

~/.omp/marketplaces.json
  { "version": 1, "marketplaces": [ { "name": "personal", "sourceType": "local",
      "sourceUri": "<abs path>", "catalogPath": "<abs marketplace.json>", … } ] }

<repo-root>/.mcp.json                 # per-session MCP config (the omp "user level")
```

## Reader decisions

- Install dirs come from `installPath`, falling back to the computed flat
  cache slot `cache/plugins/<marketplace>___<name>___<version>`.
- `enabled` comes from `omp-plugins.lock.json`, keyed by bare plugin name.
- **MCP surfaces**: the repository-root `.mcp.json` is read as the user-level
  config (origin `user`, so shadow checks apply); plugin-declared MCP would be
  read from the install dir's `.mcp.json`/`mcp.json` — **no install on this
  machine declares any MCP today** (all four are skills-only), so that half is
  defensive and exercised only by fixtures.
- No staleness source: omp's registry has no sha column; unknown-staleness
  applies until `add` records one in state.json.

## Evidence paths (read 2026-09-16)

- `~/.omp/plugins/installed_plugins.json` — registry (e.g. `mattpocock@personal` → `installPath` into `cache/plugins/personal___mattpocock___0.1.0`)
- `~/.omp/plugins/cache/plugins/personal___{personal,toolbox,try-skill,mattpocock}___0.1.0/` — install dirs; root `plugin.json` keys `[$schema, name, version, description, author, skills]`; no mcp files
- `~/.omp/plugins/omp-plugins.lock.json` — enabled/version lock
- `~/.omp/plugins/node_modules/` — symlinks into the cache
- `~/.omp/marketplaces.json` — marketplace registry (`sourceType: local`, `sourceUri`, `catalogPath`)
- omakase-distribution-state-2026-09-16.md — "omp: not a plugins target; reads repo-root .mcp.json" (store measured after omp gained native plugin support)

## Open

- `omp plugin …` CLI surface not inspected in v0 (store read directly).
- Whether omp will read plugin `mcp.json` (spec §7.2.1) or a native
  equivalent when plugins declare MCP is unknown — nothing on disk declares
  any yet.
