# omp store layout

Measured 2026-09-16 on this machine (`~/.omp`). Reader: `src/hosts/omp.ts`.

omp is a **native plugin host with its own store** (AGENTS.md hosts list,
landed in main as `d1db50f`; ground-truth "Correction" 2026-09-16). It is
never routed through a repository-root `.mcp.json`.

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
```

## Reader decisions

- The host is **present iff `~/.omp/plugins/` exists** — a repo-root
  `.mcp.json` in the cwd must never conjure the omp host or its findings.
- Install dirs come from `installPath`, falling back to the computed flat
  cache slot `cache/plugins/<marketplace>___<name>___<version>`.
- `enabled` comes from `omp-plugins.lock.json`, keyed by bare plugin name.
- **MCP surface**: installed plugins' `.mcp.json`/`mcp.json` only. No install
  on this machine declares any MCP today (all four are skills-only), so this
  half is defensive and exercised by fixtures. omp has **no measured
  user-level MCP config** (`~/.omp/mcp.json` does not exist), so doctor's
  shadow check has no user side to trip on for omp in v0.
- **Repo-root `.mcp.json` deliberately not read.** omp sessions do consult the
  workspace `.mcp.json` (pre-Correction evidence line in the ground-truth
  doc), but that file is the Claude Code project-level convention: reading it
  under omp would attribute another host's project servers to omp (double
  reporting) and make doctor output depend on the cwd. If a later phase wires
  omp's session config in, it must come from omp's own documented config
  resolution, not from the shared project file.
- No staleness source: omp's registry has no sha column; unknown-staleness
  applies until `add` records one in state.json.

## Pin

`pin` rewrites the bare `command` of every stdio server in an install dir's
`.mcp.json` / `mcp.json`. No install on this machine declares MCP yet, so the
path is defensive like the reader's. omp is not a GUI host and is not a
default `pin` target. Rationale: `docs/pin-and-update.md`.

## Evidence paths (read 2026-09-16)

- `~/.omp/plugins/installed_plugins.json` — registry (e.g. `mattpocock@personal` → `installPath` into `cache/plugins/personal___mattpocock___0.1.0`)
- `~/.omp/plugins/cache/plugins/personal___{personal,toolbox,try-skill,mattpocock}___0.1.0/` — install dirs; root `plugin.json` keys `[$schema, name, version, description, author, skills]`; no mcp files
- `~/.omp/plugins/omp-plugins.lock.json` — enabled/version lock
- `~/.omp/plugins/node_modules/` — symlinks into the cache
- `~/.omp/marketplaces.json` — marketplace registry (`sourceType: local`, `sourceUri`, `catalogPath`)
- omakase-distribution-state-2026-09-16.md — "Correction" section: omp is a
  native plugin host (`omp plugin install|…|doctor|upgrade|marketplace`,
  `~/.omp/plugins` store); the earlier "reads repo-root .mcp.json" line
  describes omp's session config, not its plugin surface

## Open

- plgnz stages and validates a copied Agent-Plugin tree, writes a
  `.plgnz-install.json` source/id/fingerprint marker, then swaps the cache
  copy before committing registry and lockfile metadata. Unmarked, malformed,
  or foreign user entries are refused; removal is limited to marker-owned user
  rows. Same-version byte changes refresh the marked copy. Cleanup after a
  durable registry/lock activation never rolls that activation back.
- OMP 18.1.4's marketplace schema rejects `disable-model-invocation`.
  plgnz rejects that unsupported policy before mutation rather than stripping
  it or treating OMP's standalone loader as marketplace support. Native
  `commands/*.md` discovery is source-evidenced, but its explicit-only
  lifecycle and collision behavior remain unverified and are not claimed.
- `omp plugin …` CLI is not used by this adapter; it activates the measured
  store layout directly.
- Whether omp will read plugin `mcp.json` (spec §7.2.1) or a native
  equivalent when plugins declare MCP is unknown — nothing on disk declares
  any yet.
- omp's own user-level/session MCP config location (if any) is unverified;
  see the reader-decision above before wiring one in.
