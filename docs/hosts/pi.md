# Pi standalone-skill store

Measured against Pi 0.80.10. Pi is a standalone-skill route, not a native
plugin-store route. Its catalog is `~/.pi/agent/skills/`; plgnz resolves this
root as `OPEN_PLUGIN_PI_ROOT`, then `OPEN_PLUGIN_HOME/.pi/agent`, then
`$HOME/.pi/agent`.

Pi recursively discovers `SKILL.md` below its skills root, stopping only when
the current directory itself contains a `SKILL.md`. `src/hosts/pi-writer.ts`
therefore materializes one marker-owned package directory named
`<marketplace>___<plugin>`, which contains the complete source tree. This keeps
cross-skill (`../…`) and plugin-root (`../../…`) resource references valid. It
changes only each skill's frontmatter name to the generic standalone
`<plugin>-<skill>` namespace. `src/hosts/pi.ts` reports that package as one
installed plugin row, so the ledger and doctor fingerprint the complete
representation. User packages and unmarked collisions are preserved; malformed
ownership markers are failures.

Pi's native `disable-model-invocation: true` is copied unchanged. Pi excludes
such skills from automatic model discovery yet loads them with `/skill:<name>`;
ordinary skills remain discoverable. Pi's `.pi/prompts` command templates are a
separate parser with separate argument semantics, so this adapter refuses any
plugin command input until an equivalent conversion lifecycle is proven.
The isolated native-loader proof is recorded in
[`docs/evidence/pi-native-loader-20260922.json`](../evidence/pi-native-loader-20260922.json).
It includes the neutral bundled Addy projection: 25 ordinary skills and nine
manual command skills, with all manual names excluded from Pi's automatic
catalog and available through `/skill:<namespaced-name> <tail>`.

Writes validate the complete staged package before activation, replace the
owned representation reversibly, and remove temporary stage/backup trees in
`finally`. Same-version byte changes refresh the generated copy. Dry runs
perform the same validation but make no active-store writes. Writer preflight
rejects symlinked host-root/store path components. There is no Pi MCP/config
surface evidenced for this route, so `pin` is a no-op and the reader emits no
MCP entries.
