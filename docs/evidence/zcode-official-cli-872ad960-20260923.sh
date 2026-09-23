#!/usr/bin/env bash
# Reproduce the no-model official ZCode CLI probes recorded beside this script.
# Usage: ZCODE_BIN=/absolute/path/to/apps/zcode-cli/packages/cli/dist/zcode.cjs \
#          bash docs/evidence/zcode-official-cli-872ad960-20260923.sh
set -euo pipefail

: "${ZCODE_BIN:?Set ZCODE_BIN to the built official apps/zcode-cli bundle}"
: "${ZCODE_NODE:=node}"
[[ -f "$ZCODE_BIN" ]] || { echo "ZCODE_BIN is not a file: $ZCODE_BIN" >&2; exit 2; }

out="${OUT:-$(mktemp -d "${TMPDIR:-/tmp}/plgnz-zcode-official-evidence-XXXXXX")}"
mkdir -p "$out"
zcode() { "$ZCODE_NODE" "$ZCODE_BIN" "$@"; }
new_home() { mktemp -d "$out/home-XXXXXX"; }
run_in_home() {
  local home=$1; shift
  HOME="$home" ZCODE_STORAGE_DIR="$home/.zcode" zcode "$@"
}
plugin_count() {
  local json=$1 id=$2
  "$ZCODE_NODE" -e 'const [p,id]=process.argv.slice(1); console.log(JSON.parse(require("node:fs").readFileSync(p,"utf8")).filter(x=>x.id===id).length)' "$json" "$id"
}
native_row() {
  local json=$1 id=$2
  "$ZCODE_NODE" -e 'const [p,id]=process.argv.slice(1); const x=JSON.parse(require("node:fs").readFileSync(p,"utf8")).filter(x=>x.id===id); if(x.length!==1) process.exit(1); console.log(JSON.stringify(x[0]))' "$json" "$id"
}
write_market() {
  local root=$1 market=$2 version=$3 body=$4
  mkdir -p "$root/plugins/demo/.zcode-plugin" "$root/plugins/demo/skills/a"
  printf '{"name":"%s","plugins":[{"name":"demo","source":"./plugins/demo"}]}\n' "$market" > "$root/marketplace.json"
  printf '{"name":"demo","version":"%s","skills":"skills"}\n' "$version" > "$root/plugins/demo/.zcode-plugin/plugin.json"
  printf '%s\n' "$body" > "$root/plugins/demo/skills/a/SKILL.md"
}

identity_home=$(new_home)
run_in_home "$identity_home" --version > "$out/identity.version"
run_in_home "$identity_home" doctor --json > "$out/identity.doctor.json"
run_in_home "$identity_home" plugins --help > "$out/plugins.help.txt"

# UOS is represented only as a command. The resource target is absolute and owned.
home=$(new_home)
plugin="$home/owned/demo"
resource="$home/plgnz-resources/demo/fp/HTML-REPORT.md"
mkdir -p "$plugin/.zcode-plugin" "$plugin/skills/ordinary" "$plugin/commands" "$(dirname "$resource")"
printf '{"name":"demo","version":"1.0.0","skills":"skills","commands":"commands"}\n' > "$plugin/.zcode-plugin/plugin.json"
printf '%s\n' 'ordinary' > "$plugin/skills/ordinary/SKILL.md"
printf '%s\n' 'resource bytes' > "$resource"
cat > "$plugin/commands/report.md" <<EOF
---
description: Report
argument-hint: [topic]
---
Read [the report]($resource) before acting.
\$ARGUMENTS
EOF
mkdir -p "$home/.zcode/cli"
printf '{"plugins":{"enabled":true,"dirs":["%s"]}}\n' "$plugin" > "$home/.zcode/cli/config.json"
run_in_home "$home" skills list --json > "$out/uos.skills.json"
run_in_home "$home" commands inspect report --json > "$out/uos.command.json"

# Failed update retains an enabled prior install and its native cache record.
home=$(new_home); market="$home/failure-market"; write_market "$market" failure-market 1.0.0 one
run_in_home "$home" plugins marketplace add "$market" > "$out/failure.marketplace-add.out"
run_in_home "$home" plugins install demo@failure-market > "$out/failure.install.out"
printf '{"name":"failure-market","plugins":[{"name":"demo","source":"./plugins/missing"}]}\n' > "$market/marketplace.json"
run_in_home "$home" plugins marketplace update failure-market > "$out/failure.marketplace-update.out"
set +e
run_in_home "$home" plugins update demo@failure-market > "$out/failure.update.out" 2> "$out/failure.update.err"
status=$?
set -e
printf '%s\n' "$status" > "$out/failure.update.status"
[[ $status -ne 0 ]] || { echo "expected failed marketplace update" >&2; exit 1; }
run_in_home "$home" plugins list --json > "$out/failure.after.json"
native_row "$out/failure.after.json" demo@failure-market > "$out/failure.survivor.json"

# Same semantic version can overwrite active bytes; therefore content needs a fingerprinted version.
home=$(new_home); market="$home/same-version"; write_market "$market" same-version 1.0.0 one
run_in_home "$home" plugins marketplace add "$market" > "$out/same.marketplace-add.out"
run_in_home "$home" plugins install demo@same-version > "$out/same.install.out"
printf '%s\n' two > "$market/plugins/demo/skills/a/SKILL.md"
run_in_home "$home" plugins marketplace update same-version > "$out/same.marketplace-update.out"
run_in_home "$home" plugins update demo@same-version > "$out/same.plugin-update.out"
run_in_home "$home" plugins list --json > "$out/same.after.json"
same_root=$("$ZCODE_NODE" -e 'const x=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).find(x=>x.id==="demo@same-version"); process.stdout.write(x.rootPath)' "$out/same.after.json")
cat "$same_root/skills/a/SKILL.md" > "$out/same.active-skill.txt"

# Native accepts plgnz build metadata, but normalizes + in its cache directory.
home=$(new_home); market="$home/buildmeta"; write_market "$market" buildmeta 1.0.0+plgnz.0123456789abcdef one
run_in_home "$home" plugins marketplace add "$market" > "$out/buildmeta.marketplace-add.out"
run_in_home "$home" plugins install demo@buildmeta > "$out/buildmeta.install.out"
run_in_home "$home" plugins list --json > "$out/buildmeta.after.json"
native_row "$out/buildmeta.after.json" demo@buildmeta > "$out/buildmeta.native-row.json"

# Re-add is an in-place native refresh, not a duplicate installed record.
home=$(new_home); market="$home/readd"; write_market "$market" readd 1.0.0 one
run_in_home "$home" plugins marketplace add "$market" > "$out/readd.marketplace-add.out"
run_in_home "$home" plugins install demo@readd > "$out/readd.first.out"
run_in_home "$home" plugins install demo@readd > "$out/readd.second.out"
run_in_home "$home" plugins list --json > "$out/readd.after.json"
plugin_count "$out/readd.after.json" demo@readd > "$out/readd.count.txt"
[[ "$(cat "$out/readd.count.txt")" == 1 ]] || { echo "re-add created duplicate native row" >&2; exit 1; }

printf 'Evidence written to %s\n' "$out"
