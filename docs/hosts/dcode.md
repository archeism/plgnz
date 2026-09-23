# dcode store layout

The dcode adapter reads the native `DEEPAGENTS_HOME` store recorded by
deepagents-code 0.1.71 (`store.py` at upstream commit `59408ebe`). Its root is
`OPEN_PLUGIN_DCODE_ROOT`, then `OPEN_PLUGIN_HOME/.deepagents`, then
`$HOME/.deepagents`; this keeps tests isolated.

```
<root>/.state/installed_plugins.json  # {version:1|2, plugins:{name@market:[{installPath,…}]}}
<root>/.state/plugin_state.json       # {version:0|1, enabledPlugins:{name@market:true}}
<root>/plugins/cache/<market>/<name>/<version>/
```

`src/hosts/dcode.ts` is reader-only. `src/hosts/dcode-writer.ts` stages a
byte-preserving copy, adds a source/id/fingerprint marker, swaps the managed
cache copy, and commits the registry and enablement metadata together. A
same-version content change therefore refreshes the cache. Metadata failures
roll the swap back; cleanup after metadata commit does not undo the active
copy. Removal only handles marker-owned records.

dcode has native-loader evidence for ordinary plugin skills in
`docs/evidence/dcode-native-loader-20260922.json` and a five-package public-CLI
probe against deepagents-code 0.1.74 in
`docs/evidence/dcode-native-batch2-20260923.md`. Plugin commands and agents
are unsupported, and user-only skill invocation is not retained by the loader,
so the writer rejects those inputs before activation. The check reads both
opening `SKILL.md` frontmatter and a Codex `agents/openai.yaml` sidecar with
`policy.allow_implicit_invocation: false`. Hooks and MCP declarations
remain in the staged package unchanged; the writer does not translate or drop
them, and the native inventory accepts root `mcpServers` / `hooks`, `.mcp.json`,
and `hooks/hooks.json`. Its manifest reader accepts only `plugin.json`,
`.claude-plugin/plugin.json`, and `.codex-plugin/plugin.json`; a
`.plugin/plugin.json`-only package is rejected instead of silently losing its
manifest semantics.
