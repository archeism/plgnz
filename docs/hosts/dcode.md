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

dcode has evidence for ordinary plugin skills only. Plugin commands, agents,
and user-only skill invocation are unproven (commands are recorded as
unsupported), so the writer rejects those inputs before activation. No loader
subprocess is run by this adapter; the native state contract still needs a
separate isolated loader conformance probe.
