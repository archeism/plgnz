# Personal Kimi native composition evidence

- Date: 2026-09-23
- Host: `m1` (`arm64`)
- Isolated root: `/tmp/personal-kimi-composition.9qkR2b`
- Personal base: `f6900c69450f445a37ba70c3e471261ed464eea2`
- Candidate five-file diff SHA-256: `f4fb7510c881d5d9c8facb2bf255549e71a106d0502a44c57e4cb600c12c0347`
- `plgnz` launcher SHA-256: `91274b5f4ecc16ac38d16a9f880c945f580aecb3813b52647c17a29a5e0a7c43`
- Native Kimi version: `2.0.1`

The source snapshot was created with `git archive HEAD` plus only the tracked candidate diff for:

- `src/check-experiment-plugins.ts`
- `src/cli/kimi-plugins.ts`
- `src/cli/plgnz.ts`
- `src/cli/plugins.ts`
- `tests/kimi-plugins.test.ts`

The probe used explicit isolated `HOME`, `OPEN_PLUGIN_HOME`, `OPEN_PLUGIN_KIMI_ROOT`, `OPEN_PLUGIN_KIMI_BIN`, and `PERSONAL_PLGNZ_BIN` paths. It did not read or write the remote user's real Kimi or plgnz state.

The final replay did not precreate `OPEN_PLUGIN_KIMI_ROOT`. The owning `open-plugin` candidate detected the explicit valid Kimi 2.0.1 binary, selected the Kimi writer, and allowed the writer to initialize the missing native root. Missing, non-executable, and legacy 0.x explicit binaries remain absent targets in the regression test.

## Result

1. `deployKimiPlugins` called the real public `plgnz` process, which installed `personal@personal` through native Kimi into the isolated managed directory.
2. `inspectKimiPlugins` returned the native managed path.
3. The canonical `machine-local/SKILL.md` was changed without changing the plugin version; the neutral bundle was rebuilt and `deployKimiPlugins` refreshed the native managed bytes.
4. The marker `m1-native-refresh-proof-1790092473` was present in the refreshed native managed file.
5. Public `plgnz list --target kimi --json` returned `personal@personal` at the isolated managed path.
6. Public `plgnz doctor --target kimi --json` returned content mark `✓`: `source and native content match their recorded byte proofs`.

The doctor also reported source VCS staleness as unknown because the collection was intentionally built in a temporary archive without `.git`; this is separate from its successful source/native byte-proof check.

```json
{
  "first": ["kimi personal ok"],
  "firstPath": "/private/tmp/personal-kimi-composition.9qkR2b/kimi-home/plugins/managed/personal",
  "second": ["kimi personal ok"],
  "secondPath": "/private/tmp/personal-kimi-composition.9qkR2b/kimi-home/plugins/managed/personal",
  "markerPresent": true,
  "publicId": "personal@personal",
  "doctorContentMark": "✓"
}
```
