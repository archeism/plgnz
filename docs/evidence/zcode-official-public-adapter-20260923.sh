#!/usr/bin/env bash
# No-model public plgnz smoke for an already-built official terminal CLI.
# Usage: ZCODE_BIN=/absolute/path/to/zcode.cjs bash docs/evidence/zcode-official-public-adapter-20260923.sh
set -euo pipefail
: "${ZCODE_BIN:?Set ZCODE_BIN to the official apps/zcode-cli CLI bundle}"
repo=$(cd "$(dirname "$0")/../.." && pwd)
probe_home=$(mktemp -d "${TMPDIR:-/tmp}/plgnz-zcode-public-home-XXXXXX")
probe_source=$(mktemp -d "${TMPDIR:-/tmp}/plgnz-zcode-public-source-XXXXXX")
export OPEN_PLUGIN_HOME="$probe_home"
export ZCODE_STORAGE_DIR="$probe_home/.zcode"
export OPEN_PLUGIN_ZCODE_CLI_BIN="$ZCODE_BIN"

mkdir -p "$probe_source/skills/report"
cat > "$probe_source/plugin.json" <<'JSON'
{"name":"demo-uos","version":"1.0.0","description":"public smoke"}
JSON
cat > "$probe_source/skills/report/SKILL.md" <<'MD'
---
name: report
description: Report
argument-hint: [topic]
disable-model-invocation: true
---
Read [guide](guide.md).
$ARGUMENTS $1
MD
printf '%s\n' guide > "$probe_source/skills/report/guide.md"

bun "$repo/bin/plgnz.mjs" add "$probe_source" --target zcode-cli --json
bun "$repo/bin/plgnz.mjs" list --target zcode-cli --json
bun "$repo/bin/plgnz.mjs" doctor --target zcode-cli --json
bun "$repo/bin/plgnz.mjs" add "$probe_source" --target zcode-cli --json
HOME="$probe_home" ZCODE_STORAGE_DIR="$probe_home/.zcode" node "$ZCODE_BIN" commands inspect demo-uos:report --json
bun "$repo/bin/plgnz.mjs" remove demo-uos --target zcode-cli --json
printf 'temporary HOME retained for inspection: %s\n' "$probe_home"
