# open-plugin

Open-source installer **and doctor** for agent plugins (Agent Plugins / OpenPlugin spec 1.0.0) and MCP configs — Claude Code, Codex, Cursor, Kimi, and more.

```
npx open-plugin add <marketplace-or-git-url>   # into each host's native plugin store
npx open-plugin doctor                          # dead commands, shadowed entries, stale installs
npx open-plugin pin                             # absolute command paths for GUI hosts
npx open-plugin update
```

Why another tool: `npx plugins` is closed-source and its Cursor target does not install into Cursor; nothing in the ecosystem checks that an installed plugin still *works*. See `docs/research/`.

Status: pre-alpha, scaffolding in progress.
