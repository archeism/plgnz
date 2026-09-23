# Official ZCode CLI public adapter evidence — 2026-09-23

This records the public `plgnz` adapter, separately from the native-only probe
in [zcode-official-cli-872ad960-20260923.json](zcode-official-cli-872ad960-20260923.json).
All commands below used temporary homes and stores. No command submitted a
model prompt or used credentials.

## Subject

- Official source: `https://github.com/zai-org/ZCode`
- Source pin: `872ad960de7ec172591f7e1952f7849229f94521`
- Terminal CLI bundle: `apps/zcode-cli/packages/cli/dist/zcode.cjs`
- Observed CLI identity: `zcode --version` → `0.16.9`; `doctor --json` reports
  `cli.name: zcode`, `cli.processName: zcode-cli`.
- Runtime used: darwin/arm64, Node `v26.7.0`. The source declares Node `24.14.0`;
  this is interface evidence, not supported-runtime certification.

The public adapter requires `OPEN_PLUGIN_ZCODE_CLI_BIN`. Detection invokes
`--version` first and rejects a `zcode-app-cli` banner before accepting the
official `doctor --json` identity. It does not use `plugins list` for
detection because native list initializes bundled plugins.

## Public lifecycle smoke

The isolated candidate was run as:

```sh
export OPEN_PLUGIN_HOME="$temporary_home"
export OPEN_PLUGIN_ZCODE_CLI_BIN=/tmp/plgnz-zcode-official-VI76GL/source/apps/zcode-cli/packages/cli/dist/zcode.cjs
bun /tmp/open-plugin-zcode-official-20260923/bin/plgnz.mjs add /tmp/plgnz-zcode-fixture-eval-skills --target zcode-cli --json
bun /tmp/open-plugin-zcode-official-20260923/bin/plgnz.mjs list --target zcode-cli --json
bun /tmp/open-plugin-zcode-official-20260923/bin/plgnz.mjs doctor --target zcode-cli --json
bun /tmp/open-plugin-zcode-official-20260923/bin/plgnz.mjs add /tmp/plgnz-zcode-fixture-eval-skills --target zcode-cli --json
bun /tmp/open-plugin-zcode-official-20260923/bin/plgnz.mjs remove eval-skills --target zcode-cli --json
```

Observed public results:

```json
{"plugin":"eval-skills","target":"zcode-cli","status":"installed","action":"install","nativeId":"eval-skills"}
{"host":"zcode-cli","plugins":[{"id":"eval-skills","enabled":true,"version":"0.0.0+plgnz.e029d753f1248544"}]}
{"host":"zcode-cli","pluginId":"eval-skills","check":"content","mark":"✓"}
{"plugin":"eval-skills","target":"zcode-cli","status":"unchanged","action":"install","nativeId":"eval-skills"}
{"plugin":"eval-skills","target":"zcode-cli","status":"installed","action":"remove"}
```

`listInstalled()` is registry/config only. `doctor` therefore remains
read-only: the focused suite verifies that both the registry and config bytes
stay unchanged. `ZCODE_STORAGE_DIR` moves only native plugin storage to
`$ZCODE_STORAGE_DIR/cli`; official config remains at
`$OPEN_PLUGIN_HOME/.zcode/cli/config.json`.

## User-only command and resource projection

A fixture with one `disable-model-invocation: true` skill was added through the
public CLI. Native `skills list --json` did not contain `report`; native
`commands inspect demo-uos:report --json` returned:

```json
{"name":"demo-uos:report","argumentHint":"[topic]","content":"Read [guide](/tmp/.../plgnz-resources/.../skills/report/guide.md).\n$ARGUMENTS $1"}
```

This proves one command-only namespaced representation, absolute owned resource
mapping, and preservation of `$ARGUMENTS`/`$1`. It does not claim a model turn
or template/session execution. Editing that owned resource made public
`plgnz doctor --target zcode-cli --json` return exit 1 with a content `✗`;
`plgnz update demo-uos` restored the source bytes.

## Changed content and failed update

Changed source bytes receive a new immutable
`canonical+plgnz.<fingerprint>` native version. This is necessary because the
official native same-version update may overwrite active cache bytes while
reporting that it is up to date.

The public failure injection used an explicit temporary wrapper around the
official binary. On the first update it replaced the staged generated
marketplace manifest with a missing plugin source immediately before native
`plugins marketplace update`, then delegated all commands to the official CLI.
The public command failed and the prior active install survived:

```text
plgnz update fault-demo --target zcode-cli --json  # exit 1
prior survivor: enabled true
prior version: 1.0.0+plgnz.a96d9a7143a9008a
prior owned resource bytes: preserved
log home: m1:/tmp/plgnz-zcode-fault3-home-5q91c4
```

The observed error was a **post-update verification failure**. This evidence
does not claim that the new candidate became active before compensation.

## Reproduction and checks

[zcode-official-public-adapter-20260923.sh](zcode-official-public-adapter-20260923.sh)
reproduces the fresh add/list/doctor/re-add/remove and user-only projection
with an explicit official bundle and temporary paths. The pre-existing
[native probe script](zcode-official-cli-872ad960-20260923.sh) covers native
marketplace failure/re-add/build-metadata behavior.

Final local verification after the frozen implementation:

```text
bun test       # 219 pass, 0 fail, 916 expectations
bun run check  # tsc --noEmit passes
```

The latest rerunnable public-smoke output was retained at
`m1:/var/folders/40/x60_1sr15v1bzqq7ypf2hzm40000gn/T/plgnz-zcode-public-home-BmPLD5`.

Unsupported/refused boundaries: unowned adoption, workspace-scoped mutation,
foreign or symlinked owned paths, command collisions, shell expansion,
unsupported command metadata, and root plugin hooks/MCP semantics. Addy's
host-specific `commands/*.toml` set is refused before native mutation.
