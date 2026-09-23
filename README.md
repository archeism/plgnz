# plgnz

Open-source installer **and doctor** for agent plugins (Agent Plugins / OpenPlugin spec 1.0.0) and MCP configs — Claude Code, Codex, Cursor, Kimi, and more.

```
npx plgnz add <marketplace-or-git-url>   # into each host's native plugin store
npx plgnz doctor                          # dead commands, shadowed entries, stale installs
npx plgnz pin                             # absolute command paths for GUI hosts
npx plgnz update                          # re-add from the recorded source, re-pin
```

`pin` rewrites a plugin's bare stdio `command` to the absolute path it resolves
to right now — a macOS GUI host like Cursor starts with no shell PATH, so a
spec-valid bare `command` never launches there. `update` is an idempotent
re-`add` from the source recorded in `state.json`, plus the pins that install
carried. Both refuse rather than guess, and neither will touch a plugin this
tool did not install. Details: `docs/pin-and-update.md`.

Why another tool: `npx plugins` is closed-source and its Cursor target does not install into Cursor; nothing in the ecosystem checks that an installed plugin still *works*. See `docs/research/`.

Status: pre-alpha, scaffolding in progress. Requires Bun on PATH; the CLI runs under Bun.

Published on npm as `plgnz`; source repository: `archeism/plgnz`.

Maintainers: see [publishing instructions](docs/publishing.md) for the manual npm release workflow.
