# dcode public route and current native loader, 2026-09-23

Scope: one isolated macOS home and empty working directory. No existing dcode
profile, user config, plugin store, or model request was used. This verifies
native plugin loading and public `plgnz` lifecycle, not model judgment.

## Pinned native source

PyPI `deepagents-code==0.1.74` wheel SHA-256 is
`4d5a843fa94e9a5cb9c95cfa4785c43976d9164bf59dc8e311ec7d2e57a681ff`;
the `uvx` run reported SDK `deepagents==0.7.18`. In the extracted wheel,
`deepagents_code/plugins/manifest.py:28-31` still marks `agents/` and
`commands/` unsupported, while lines 390-422 inventory skills, MCP, and hooks.
`plugins/adapters/skills_middleware.py:174-200` sends every plugin skill to the
SDK parser. The installed SDK `deepagents/middleware/skills.py:421-475` parses
name, description, allowed tools, compatibility, and metadata, with no
user-only invocation field or Codex sidecar policy. dcode's generic
`/skill:<namespaced>` command is in `command_registry.py:547-605`, but the
same skills also enter automatic model discovery. The `pythonExtensions`
manifest path and extension discovery are gated by
`DEEPAGENTS_CODE_EXPERIMENTAL` (`plugins/manifest.py:216-223`,
`extensions/discovery.py:164-177`); the default clean-profile loader does not
activate a companion extension.

An isolated temporary package declared a Python extension and registered an
`AgentMiddleware` through dcode's public `ExtensionAPI`. Native
`load_extensions()` reported zero extensions and middleware with the
experimental flag unset, then one extension and one registered middleware
with `DEEPAGENTS_CODE_EXPERIMENTAL=1`, with no load errors. A separate graph
probe used the installed `PluginSkillsMiddleware` and a later
`before_model`/`abefore_model` middleware to remove one manual skill from
`skills_metadata`; both synchronous and asynchronous model requests received
only the ordinary skill in their injected catalogue. LangChain's factory
orders `before_agent` → `before_model` → model, and dcode's CLI skill discovery
has a separate path. This proves a possible experimental integration seam,
not default-profile support or a shipped command/agent adapter.

## Public CLI and native loader

The input was Personal's neutral local collection built from commit `b16f2e1`.
Its dcode allowlist selects seven packages. Five have only ordinary skills:
`eval-skills`, `karakeep`, `personal`, `toolbox`, and `vercel`. The other two
contain four skills with `disable-model-invocation: true`:
`mattpocock` (three) and `try-skill` (one); three of the Matt Pocock skills
also have Codex `agents/openai.yaml` sidecars with
`policy.allow_implicit_invocation: false`.

With `HOME`, `OPEN_PLUGIN_HOME`, and `OPEN_PLUGIN_DCODE_ROOT` in one temporary
root, `DEEPAGENTS_HOME` unset, and an empty cwd, public `plgnz add` installed
all five ordinary packages with logical/native ids `<name>@personal`. Re-add
returned `unchanged` for all five. A same-version local edit to Karakeep's
skill returned `installed` and changed the native cached bytes. A subsequent
update adding `disable-model-invocation: true` returned `unsupported`; byte
comparison showed the previous active copy was preserved. Restoring the source
returned `unchanged`. Public `doctor --target dcode --json` reported five
matching source/native content proofs, and `remove karakeep@personal --target
dcode --json` removed only that owned record. The fixture re-added it for the
native loader probe.

The actual 0.1.74 `discover_plugins()` and `load_namespaced_skills()` loader
read those five public-installed native cache entries with **zero warnings**.
Skill counts were 8, 2, 22, 7, and 2, with names such as
`eval-skills@personal:write-judge-prompt` and `personal@personal:yolo-mode`.
The native roots matched public list paths. No plugin command or agent surface
was claimed.

At this earlier checkpoint, a public add of **all seven** selected packages failed visibly at
`mattpocock` with `unsupported for userOnlySkills`. Earlier package installs
remained content healthy; public list and doctor exposed the pending install
intent. Personal's subsequent regular-only cutover delivers the five ordinary
packages and reports the two restricted packages as deferred, without changing
the delivery allowlist or stripping their invocation metadata.

Focused regression: `bun test test/dcode-lifecycle.test.ts` passed 13 tests,
including a Codex-sidecar-only refusal that preserves the active copy and
ordinary explicit policy values that remain supported. `bun run check` passed.
The full `bun test` suite passed 231 tests, skipped one pre-existing Hermes
loader test, and failed zero; its read-only doctor import-graph checks passed.
