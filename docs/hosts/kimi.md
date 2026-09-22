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

- **Plugin MCP source priority**: inline `kimi.plugin.json`, then inline
  `.kimi-plugin/plugin.json` `mcpServers` (spec-style), then `.mcp.json`, then `mcp.json` — all read,
  identical entries deduped.
- `root` records are absolute; the reader falls back to
  `plugins/managed/<id>` when the recorded path is gone.
- Kimi canonicalizes macOS temporary paths: a plugin installed from an
  isolated `/tmp/...` home can be recorded under `/private/tmp/...`. Writer
  readback compares existing roots by filesystem identity rather than lexical
  spelling. This prevents a successful native install from being mistaken for
  a missing install and rolled back.
- Kimi's registry id is the bare native plugin name. For a marketplace source,
  plgnz keeps its logical `name@marketplace` identity in the ownership marker;
  the reader exposes that logical id only when its name matches the native row.
  Native API calls still use the bare name. A same-source legacy bare marker is
  accepted on refresh and rewritten to the logical id.
- **User-level MCP (unverified)**: kimi is a TOML-config host like codex
  (`~/.kimi-code/config.toml`), so the reader also parses
  `[mcp_servers.<name>]` there — none exist on this machine as of 2026-09-16
  and kimi's shadow semantics for them are **unverified**; doctor reports the
  generic shadow/duplicate message if a collision ever appears.

## Write side (add / pin / update)

- **Native lifecycle only.** `plgnz` stages a copied projection under the Kimi
  root, validates its Agent Plugins identity, and writes a `kimi.plugin.json`
  with ordinary and manual skills. Kimi 2.0.1 bundled-loader source maps both
  boolean `disable-model-invocation` spellings and filters the resulting manual
  skills from its invocable-skill list. `user-invocable` is unsupported and is
  refused. This is source-level behavior evidence, not an executed model
  invocation claim.
  It preserves Kimi's proven inline `mcpServers`; explicit native fields outside
  the supported projection (`name`, `version`, `description`, `skills`,
  `commands`, `mcpServers`) fail visibly before activation. Source skill
  frontmatter is retained byte-for-byte; conflicting manual aliases and
  non-boolean manual values refuse staging.
- **MCP projection.** The writer merges matching supported `mcpServers` from
  the Kimi native manifest, the root plugin manifest, `.mcp.json`, and
  `mcp.json` into `kimi.plugin.json`. A malformed declaration or conflicting
  duplicate server fails staging; no source MCP declaration is silently
  dropped. The reader and pin path prioritize that generated inline manifest.
- **Command dialect boundary.** Current Kimi recursively loads Markdown command
  directories and expands `$ARGUMENTS`. The writer uses an existing
  Markdown-only `commands/` tree, or an existing Markdown-only
  `.claude/commands/` tree without moving files. When both exist, `.claude`
  is selected unless a supplied native manifest explicitly selects the root
  tree; that native pointer is preserved. Only `name` and `description`
  command metadata plus `$ARGUMENTS` bodies are admitted. TOML-only, resource,
  symlink, unsupported metadata, and unproven preprocessor layouts refuse
  staging.
- **`add` uses the current Kimi Code loopback plugin API.** The writer never
  authors `installed.json`. It starts Kimi with the resolved isolated
  `KIMI_CODE_HOME`, requests install and enable, then verifies Kimi's registry
  and `plugins/managed/<id>` readback. Before that call it moves the previous
  active copy aside and snapshots the registry, so a native failure restores
  both. After a successful registry readback it only cleans the backup; cleanup
  cannot roll back committed active state. Stages are removed in `finally`,
  including dry-run and unchanged paths.
- **Refresh and ownership.** A `.plgnz-install.json` marker records source,
  native id, and content fingerprint. Same bytes and marker return unchanged;
  changed bytes refresh even at the same version/revision. A differing unowned
  target requires `--adopt-existing`; an exact matching target may be adopted.
  Native removal calls the current native `POST /plugins/<id>:remove` API only
  after the marker and registry row match. The native API removes the active
  registry row but retains its managed cache; `plgnz` leaves that cache to Kimi
  rather than hand-editing native state. Dry-run performs the same stage
  and ownership preflight while making no native-store or registry writes.
- **`pin` rewrites** the inline `mcpServers` in `kimi.plugin.json` and the
  legacy `.kimi-plugin/plugin.json`, plus `.mcp.json` and `mcp.json` — the
  reader prefers the generated native manifest, so pinning only the spec copies
  would leave kimi launching the bare command. kimi is not a GUI host, so it is not a
  default `pin` target; `pin --target kimi` / `--all` reach it. Rationale:
  `docs/pin-and-update.md`.

## Evidence paths (read 2026-09-16)

- `~/.kimi-code/plugins/installed.json` — registry shape, `omakase` row with `root`/`originalSource`
- `~/.kimi-code/plugins/managed/omakase/` — install dir; `.kimi-plugin/plugin.json` carries inline `mcpServers` with `"type": "stdio"`, `command: "omakase"`; `.mcp.json`/`mcp.json`/`.plugin/` also present
- `~/.kimi-code/config.toml` — section list read; no `[mcp_servers.*]` present
- Isolated Mini probe, 2026-09-22 — current `2.0.1` binary started with a
  temporary `KIMI_CODE_HOME`; native install, enable, registry, and managed
  `kimi.plugin.json` readback succeeded for a no-model fixture, then the server
  shut down and the temporary home was removed.
- Isolated Mini loader probe, 2026-09-22 — a native manifest with
  `skills: "./skills/"` and `commands: "./commands/"` loaded 25 skills and 9
  Markdown commands (`skillCount: 25`, `commandCount: 9`) without a model
  request. Bundled loader source records manual-skill filtering and
  `$ARGUMENTS` expansion for both skills and commands; those are source
  evidence, not model-executed behavior.
- Machine-readable probe record: `docs/evidence/kimi-native-loader-20260922.json`.
- Public CLI lifecycle record:
  `docs/evidence/kimi-public-lifecycle-20260922.json`. On an isolated Kimi
  2.0.1 home it records install, logical-id list/readback, healthy doctor,
  unchanged re-add, changed-byte refresh, a refused unsupported manifest that
  preserved active bytes, recovery, and removal with an empty registry.

## Open

- add-mcp documents `~/.kimi-code/mcp.json` as kimi's *global* MCP path
  (readme-add-mcp.md, Kimi Code row); no such file exists on this machine, so
  the reader does not parse it. Verify against kimi itself before wiring it
  in — until then config.toml `[mcp_servers]` is the only user surface read.
- Whether the plugins CLI's `originalSource` staging path can serve as a
  staleness source is not exploited in v0 (state.json is the only ledger).
- The isolated lifecycle fixture proves transaction/error handling against a
  simulated current Server API. The real public CLI lifecycle record proves
  install/readback, doctor, re-add, refresh, guarded failure, recovery, and
  removal against Kimi 2.0.1. The separate loader discovery proves the two
  native pointers enumerate files; command argument expansion and manual
  filtering rely on the recorded bundled-source excerpts. None of this
  evidence makes a full model invocation claim.
