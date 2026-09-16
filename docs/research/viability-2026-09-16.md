# Viability research — 2026-09-16

> Source: archeism/oh-my-ai-sdk#285 (four-model panel + orchestrator acceptance). Edited for publication.

## Verdict (4-model panel + orchestrator acceptance, 2026-09-16)

Do **not** build a dedicated npx-style distribution service. Distribution is commoditized (`npx plugins` for 7 native plugin hosts, `add-mcp` for 22 bare-config hosts, `npx skills` for skill dirs). What is missing is everything *after* install, and it is small: three primitives no tool has.

Panel: deepseek + glm → thin-wrapper · kimi → build-dedicated-service · gemini → contribute-upstream. Synthesis → thin-wrapper. Accepted with corrections (the run acceptance record).

## Measured, reproduced by the orchestrator
- `plugins@1.3.4` `dist/index.js`: verbs = add/install/targets/discover only; 0 occurrences of doctor/stale/shadow/duplicate/prune. No update, no remove.
- `add-mcp@2.4.0` (8 files): 0 occurrences of plugin/skills/SKILL.md/marketplace — structurally blind to plugin-provided servers. Has a programmatic API (`import { upsertServer } from "add-mcp"`).
- open-plugin spec 1.0.0 §7.2.1: bare command legal; "Whether a configured PATH … participates … is client-defined. Plugins claiming conformance MUST NOT depend on that behavior." Bundled executables MUST use `./` — impossible while the server is the bun-linked checkout.
- `vercel-labs/plugins` → GitHub 404, no `repository` field on npm. Upstream PRs are only possible against `add-mcp` (public, 298★, pushed 2026-09-10).

## Gap table (5 failure modes hit this week)
| # | failure | covered by |
|---|---|---|
| 1 | stale hand-written entry → spawn ENOENT, silent | nothing |
| 2 | same-name hand entry shadows plugin server (Codex) / duplicates (Cursor) | nothing — spans two layers no tool reads together |
| 3 | bare command unresolvable in macOS GUI apps | house absolute pin only |
| 4 | manifest description contradicted launcher | #283 gate ✅ |
| 5 | sha-keyed caches go stale | `npx skills update` for skills; MCP is the live checkout |

## Scope of the wrapper — four verbs, nothing else
- `install` — shell out to `npx plugins add` (claude-code/codex/kimi/grok/copilot/vscode), `add-mcp` API (opencode/pi/gemini-cli), Cursor materialize (#284), omp = repo-root `.mcp.json`.
- `doctor` — resolve every configured stdio command per host, ENOENT → loud; read native config **and** plugin cache, flag shadow/duplicate by name. (House rule: ceremony becomes a check — "stop hand-writing configs" is not a fix.)
- `pin` — rewrite bare → absolute for GUI hosts from `which omakase` at install time.
- `update` — idempotent re-`install` (plugins has no update verb) + re-materialize Cursor.

Would flip to contribute-upstream: `vercel-labs/plugins` becoming public, or `plugins` shipping update/doctor.



