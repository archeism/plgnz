# AGENTS.md · open-plugin

`open-plugin` installs, diagnoses and updates agent plugins (Agent Plugins / "OpenPlugin" spec 1.0.0) and MCP configs across coding-agent hosts. It is the open-source counterpart of `npx plugins`, plus the verbs that tool lacks: `doctor`, `pin`, `update`.

## Verbs
- `add <source> [--target <host>…]` — install a plugin from a marketplace dir or git URL into each host's **native** store.
- `doctor` — read-only. (1) every configured stdio `command` resolves to an executable; (2) no hand-written entry shadows/duplicates a plugin-provided server of the same name; (3) installs are at the marketplace head. Prints findings, exits non-zero on ✗, never edits.
- `pin [--target <host>…|--all] [--dry-run]` — rewrite a plugin-provided bare `command` to its absolute path for GUI hosts (macOS GUI apps have no shell PATH). Refuses (✗) a command that does not resolve; never touches a host's user-level config.
- `update [name]` — idempotent re-`add` from the recorded `state.json` source; re-materializes copy-based hosts and re-applies recorded pins. Never modifies a plugin with no record — reports it instead.
- `list`, `remove`, `targets`.

## Hosts (v0, native stores owned by this tool)
claude-code · codex · kimi · cursor · omp (its own store under `~/.omp/plugins`, `omp plugin …`). Bare-MCP-config hosts (opencode, pi, gemini-cli, …) go through the `add-mcp` library API, not our own writers.

## Rules
- Bun + TypeScript. `bun test` and `bun run check` must pass before any PR.
- One module per host under `src/hosts/<host>.ts`, all implementing the `Host` interface in `src/host.ts`. No host-specific branches outside its module.
- Tests never touch the real home directory: every path is resolved through `src/paths.ts`, which honours `OPEN_PLUGIN_HOME` (tests point it at a temp dir with fixture stores).
- `doctor` is read-only by construction — it must not import any writer.
- Every spec claim in code or docs cites the section (`spec §7.2.1`). Spec: https://agentplugins.org (Agent Plugins Specification 1.0.0).
- Commit history is an asset: never squash, never squash-merge. Work via PRs into `main`.
- `CLAUDE.md` is a symlink to this file; do not maintain a second copy.
- Research and decisions live in `docs/`; this file is rules only.
