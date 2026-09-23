# Hermes

Hermes Agent at source revision `c0d7294` loads portable Agent Plugins from
`$HERMES_HOME/plugins/<name>/plugin.json`. Portable packages are native and
opt-in: `plugins.enabled` activates a package and `plugins.disabled` overrides
it (`hermes_cli/plugins_cmd.py`).

The adapter retains the portable package, translates invocation policies, and
projects user-only skills as described below. An
owned sibling directory plugin uses Hermes's documented
`register_system_prompt_section` API to expose ordinary portable skill metadata
in new-session prompts; the skills themselves remain package-owned and load
through Hermes's native `ctx.register_skill` / `skill_view` path.

The same sibling registers Markdown/TOML prompt commands with
`ctx.register_command`. Its handler expands `$ARGUMENTS` and calls
`ctx.inject_message`, which queues the exact prompt into the interactive CLI's
pending-input or interrupt queue. It returns `None` after a successful queue and
an explicit unsupported message when no interactive CLI accepts the prompt; it
never prints a prompt as a successful model turn. Gateway injection is outside
this evidence and remains fail-closed.

Invocation policy is read from both `SKILL.md` and `agents/openai.yaml`, with
conflicts refused. A user-only skill is removed from the portable loader's
automatic/qualified discovery tree, retained under the owned package's private
skill tree, and exposed only as the namespaced native slash command
`/<plugin>:<skill>`. That handler queues a prompt to read the private `SKILL.md`;
it does not add the skill to the ordinary system-prompt catalog. The adapter
keeps `mcp.json` in the portable package, where Hermes loads it natively, and
exposes those entries to doctor/pin. Package and companion activation, refresh,
rollback, and removal are one marker-owned lifecycle. `OPEN_PLUGIN_HERMES_ROOT` selects the profile data
home. An optional `OPEN_PLUGIN_HERMES_CONFIG_PATH` is accepted only when
Hermes's effective `$HERMES_HOME/config.yaml` already resolves to that same
file (including an existing symlink; a separate hardlink alias is refused); otherwise the adapter fails
before mutation. Config writes preserve the native config symlink and the
target file's mode.
