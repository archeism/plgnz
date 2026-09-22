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
- **User-level MCP (unverified)**: kimi is a TOML-config host like codex
  (`~/.kimi-code/config.toml`), so the reader also parses
  `[mcp_servers.<name>]` there — none exist on this machine as of 2026-09-16
  and kimi's shadow semantics for them are **unverified**; doctor reports the
  generic shadow/duplicate message if a collision ever appears.

## Write side (add / pin / update)

- **Native lifecycle only.** `plgnz` stages a copied projection under the Kimi
  root, validates its Agent Plugins identity, and writes a `kimi.plugin.json`
  with ordinary skills. Source skills with `disable-model-invocation` or
  `user-invocable` are refused until Kimi's native exclusion behavior is proved.
  It preserves Kimi's proven inline `mcpServers`; explicit native fields outside
  the supported projection (`name`, `version`, `description`, `skills`,
  `commands`, `mcpServers`) fail visibly before activation. Source skill
  frontmatter is retained byte-for-byte, but the real loader effect of
  `disable-model-invocation` has not yet been proved.
- **MCP projection.** The writer merges matching supported `mcpServers` from
  the Kimi native manifest, the root plugin manifest, `.mcp.json`, and
  `mcp.json` into `kimi.plugin.json`. A malformed declaration or conflicting
  duplicate server fails staging; no source MCP declaration is silently
  dropped. The reader and pin path prioritize that generated inline manifest.
- **Command dialect boundary.** Markdown parsing and argument semantics remain
  unverified in Kimi's native loader. Every command layout is therefore refused
  before activation. TOML, other resource files, symlinks, and
  `.claude/commands`-only layouts also receive specific staging refusals; the
  writer never relocates, deletes, or partially drops command resources.
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

## Open

- add-mcp documents `~/.kimi-code/mcp.json` as kimi's *global* MCP path
  (readme-add-mcp.md, Kimi Code row); no such file exists on this machine, so
  the reader does not parse it. Verify against kimi itself before wiring it
  in — until then config.toml `[mcp_servers]` is the only user surface read.
- Whether the plugins CLI's `originalSource` staging path can serve as a
  staleness source is not exploited in v0 (state.json is the only ledger).
- The isolated lifecycle fixture proves transaction/error handling against a
  simulated current Server API only. The separate real isolated probe above
  proves only the native install/enable/readback path. Neither proves command
  parsing or `disable-model-invocation` policy behavior.
