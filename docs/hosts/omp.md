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

~/.omp/plugins/plgnz/<hex-marketplace>-<hex-plugin>/
  package.json                       # {name:"@plgnz/<hex>-<hex>",version,omp:{}}
  plugin.json                        # original Agent Plugin manifest
  skills/                            # ordinary model-visible skills
  commands/                          # source commands + namespaced manual skills
  .plgnz/source/                     # byte-preserved source/resources for commands
  .plgnz-install.json                # plgnz ownership marker

~/.omp/plugins/node_modules/@plgnz/<hex-marketplace>-<hex-plugin>
  # native npm/link extension-package symlink into plugins/plgnz/

~/.omp/marketplaces.json
  { "version": 1, "marketplaces": [ { "name": "personal", "sourceType": "local",
      "sourceUri": "<abs path>", "catalogPath": "<abs marketplace.json>", … } ] }
```

## Reader decisions

- The host is **present iff `~/.omp/plugins/` exists** — a repo-root
  `.mcp.json` in the cwd must never conjure the omp host or its findings.
- plgnz-owned installs are enumerated from marker-bearing `plugins/plgnz/`
  packages whose `node_modules/@plgnz/*` link still points at the package.
  Their public identity remains `<plugin>@<marketplace>`; the scoped npm name
  is an OMP-native implementation detail. Foreign marketplace installs still
  come from `installed_plugins.json`, with the flat cache fallback.
- `enabled` comes from `omp-plugins.lock.json`, keyed by scoped npm package
  name for plgnz packages and bare plugin name for legacy marketplace rows.
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

## Native lifecycle and projection

- OMP 18.1.4 treats enabled npm/link packages containing `package.json` with
  `omp:{}` as native extension packages. One package root discovers `skills/`,
  `commands/`, hooks, tools, rules, prompts, and MCP together. This is the
  native plugin route used by plgnz; it is separate from standalone skill
  fanout and from the narrower Agent Plugin marketplace provider.
- Ordinary skills remain in `skills/`. A skill marked
  `disable-model-invocation:true` moves out of public skill discovery and is
  emitted as `<plugin>:<skill>` under `commands/`. Source commands use the
  same `<plugin>:<command>` namespace, including rewritten references between
  commands. Command bodies keep OMP's native `$1` and `$ARGUMENTS`
  expansion and receive the final `.plgnz/source/...` base directory, where
  all source resources are preserved. `user-invocable:false` and other
  unpreserved invocation/permission gates are refused before mutation.
- plgnz stages the complete extension package, swaps a marker-owned package,
  link, and lock entry transactionally, and rolls the old active package back
  if activation or metadata persistence fails. Same-version byte changes
  refresh the package. Removal requires both the ownership marker and the
  expected native link.
- `--adopt-existing` migrates only the selected user marketplace row at its
  exact contained flat cache slot, matching manifest identity and version.
  Symlinked or outside-cache paths are refused. Legacy bytes are deleted only
  after the native package is active and only when no retained registry row
  references them.
- The earlier marketplace-only finding remains accurate in
  [`evidence/omp-command-discovery-20260923.json`](../evidence/omp-command-discovery-20260923.json):
  marketplace roots do not reach OMP's command provider. The native package
  result and empty-cwd lifecycle proof are recorded in
  [`evidence/omp-native-extension-package-20260923.json`](../evidence/omp-native-extension-package-20260923.json).

## Open
- Whether omp will read plugin `mcp.json` (spec §7.2.1) or a native
  equivalent when plugins declare MCP is unknown — nothing on disk declares
  any yet.
- omp's own user-level/session MCP config location (if any) is unverified;
  see the reader-decision above before wiring one in.
