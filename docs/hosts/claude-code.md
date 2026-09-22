# Claude Code adapter

`claude-code` reads and writes the native user plugin store through
`src/hosts/claude-code.ts` and `src/hosts/claude-code-writer.ts`.

## Evidence and boundary

The store layout was inspected on 2026-09-16:

```
~/.claude/plugins/installed_plugins.json
  { "version": 2, "plugins": { "<name>@<marketplace>": [
      { "scope": "user", "installPath": "<absolute path>", "version": "…" }
  ] } }
~/.claude/plugins/cache/<marketplace>/<name>/<version-or-sha>/
```

Personal's existing delivery uses the native commands `claude plugin
marketplace add/update`, then `claude plugin install/update <name>@personal
--scope user`; its same-version repair uninstalls and reinstalls stale cached
bytes. `claude --version` reported 2.1.275 on 2026-09-22. An isolated native
marketplace install of amended Addy reported all 25 skills through `claude
plugin details`. The same probe did not report the hidden Markdown commands,
so unprojected `.claude/commands` is not treated as loader proof.

The neutral collection’s `marketplace.json` identity is retained (`personal`),
so its native ID is `name@personal`. The adapter copies canonical amended
bytes without projection: `skills/`, `.claude/commands/*.md`, generic
`commands/` sidecars, resources, and existing `.claude-plugin/plugin.json`
remain in the staged tree. The established source location for Addy's Markdown
commands is `.claude/commands/`; Claude 2.1.275's pinned schema requires an
explicit `commands` list to load non-root command paths. plgnz adds every
staged Markdown command to that native list and refuses an existing incomplete
list. Addy's native sidecar contains its `skills` pointer. When a source lacks the
Claude sidecar, plgnz creates the minimal native manifest (`name`, `version`,
optional `description`, and `skills: "./skills/"`) rather than copying generic
Agent Plugins schema fields into it.
No Addy-specific command conversion occurs here.

For a root-only local plugin, the adapter creates one marked catalog wrapper per
marketplace under Claude's managed `plugins/marketplaces/` tree. It copies each
selected canonical plugin into that catalog and registers the catalog without
changing the source checkout. A foreign wrapper collision is refused; removal
deletes only its marked plugin copy and drops the wrapper only once it is empty.

## Lifecycle

`add` stages beside the cache slot, validates canonical/native manifest identity
and native content directories, writes a `.plgnz-install.json`
source/identity/fingerprint marker, and swaps the staged directory into place.
The registry is atomically replaced before obsolete owned cache copies are
cleaned up; a registry failure restores the prior cache copy. A changed
fingerprint refreshes bytes in the same version/SHA slot, and a new SHA from
the same source replaces its prior owned cache slot while retaining other
native registry scopes.
Existing unmarked or differently owned slots, and registry entries that point
at a different live user install, fail before activation. `remove` moves only
marker-owned directories aside, atomically removes its user registry row, then
commits deletion; project and other native scope rows and foreign cache content
are left alone. Root-wrapper changes, cache activation, registry, settings, and
known-marketplace metadata share a rollback boundary, including post-stage
registration refusal.

Tests set `OPEN_PLUGIN_CLAUDE_CODE_ROOT` to an isolated temporary root. The
adapter never writes `~/.claude.json`; user-level MCP entries remain reader
only. `pin` only rewrites plugin-local `.mcp.json` / `mcp.json` files.
