# Personal native plugin consolidation — 2026-09-23

Personal owns vendoring, local amendments, bundling, and target selection.
plgnz owns native installation, conversion, ownership, refresh, and removal.
The local bundle is authoritative; installing it does not fetch pristine upstream
content over Personal amendments.

## Accepted native routes

| Route | Evidence |
| --- | --- |
| Claude Code | [Composed lifecycle](personal-claude-composition-20260923.md) |
| Codex | [Native package evidence](codex-personal-20260922.json) |
| Cursor | [Composed lifecycle](personal-cursor-composition-20260923.md) |
| Kimi Code | [Composed lifecycle](personal-kimi-composition-20260923.md) |
| OMP | [Native extension-package loader](omp-native-extension-package-20260923.json) |
| Hermes | [Composed native loaders and command bridge](personal-hermes-composition-20260923.md) |
| Grok Build | [Native marketplace lifecycle](../hosts/grok.md) |
| dcode (regular plugins) | [Pinned native loader and limitation](dcode-native-batch2-20260923.md) |
| Official ZCode CLI | [Public adapter and native loader](zcode-official-public-adapter-20260923.md) |

Personal's replaced installers for these routes have been removed. Source
commands and user-only skills are mapped only where their native invocation
semantics were verified. A successful installation alone is not loader evidence.

## dcode scope

The owner explicitly deferred experimental middleware on 2026-09-23 and
requested regular plugin distribution with a code TODO. The normal 0.1.74
loader supports ordinary plugin skills but ignores user-only restrictions.
The [pinned loader evidence](dcode-native-batch2-20260923.md) records that limit.
The regular cutover delivers five ordinary packages and visibly skips
`mattpocock` and `try-skill`; their four user-only skills are not silently made
automatically invocable. Existing restricted legacy installs are left untouched
and are not counted as healthy. A dated code TODO records the deferred capability.
The composed Personal regression covers guarded legacy adoption, five delivered
packages, both skips, content readback, and unchanged re-deployment. Native
0.1.74 reads the five packages and 41 namespaced skills with zero warnings.
See Personal `docs/evidence/dcode-regular-native-composed-20260923.md`.

## Deliberately outside this milestone

OpenClaw, ZCode Desktop, and Gemini remain follow-ups in issue #27. Existing
standalone routes for OpenCode, Pi, Factory, and Grok Bot were excluded from
this native-plugin migration. They are not claimed as completed plgnz migrations.
Grok Build is distinct from Grok Bot; official ZCode CLI evidence does not
stand in for Desktop or the historical community CLI.

## Verification and delivery boundary

At plgnz `a5aa9e0`, the combined core suite passed 242 tests with two explicit
native-loader opt-in skips and zero failures; TypeScript passed. The real
Grok loader test was run separately and passed. Personal `683f199` passed its complete check and all four Grok cutover tests.
Final Personal `bc6fe25` passed the complete `bun run check` and both real
dcode integration/audit tests (18 assertions). Its actual deployment entrypoint
installed an ordinary dcode-only fixture, visibly deferred a restricted fixture,
and passed the presence audit; native 0.1.74 loaded the ordinary fixture with
zero warnings. Earlier route-specific native evidence is linked above.

Source commits were pushed directly, and the local plgnz executable was rebuilt
from the clean committed source. No npm release, fleet rollout, or model-session
claim is implied. Operational skills were unchanged; this is product validation,
not evidence of an RSI skill improvement.
