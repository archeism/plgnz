# OpenCode standalone-skill store

Measured against OpenCode 1.15.13. This is a standalone projection: plgnz keeps
the complete package privately at `~/.config/opencode/.plgnz/packages/` and
creates two owned projections under `~/.config/opencode/`.

The skills projection copies the complete package-relative layout under
`skills/<encoded-market>-<encoded-plugin>/`, then removes only manual
`SKILL.md` files. Ordinary skills stay native-discoverable and still resolve
references such as `../../resources/persona.md`. Manual skills are never placed
under OpenCode's scanned skills tree. Each becomes an explicit Markdown command
under `commands/<plugin>/`, with its body and a base
directory pointing to that skill's original directory inside the private copy.
Source Markdown commands are projected recursively and retain a base directory
pointing to their original command parent, so a command's `references/` remains
distinct from a manual skill's sibling paths.

OpenCode derives a command name from its relative filename. The projection uses
the readable `<plugin>/<command>` namespace and rewrites only slash references
to commands delivered by that same package. A second marketplace package with
the same plugin name is refused before replacement because it would occupy the
same native namespace.

OpenCode does not have a native `disable-model-invocation` skill field. Its
skill reader admits only a name and optional description, then its command
service also exposes every loaded skill as a slash command. Therefore a manual
skill must be removed from the native scan before activation; its explicit
command is the only delivered form. This avoids duplicate implicit prompt body.

The writer accepts only source Markdown commands with description-only
frontmatter. It rejects TOML commands, all other command metadata (including
permission, invocation, model, or agent fields), shell/resource preprocessing,
and source symlinks before replacing an active install. It also refuses root
MCP files, hooks, agent directories, and manifest MCP/hook/agent fields: this
route has no proven equivalent for those components. This is deliberate:
OpenCode's command schema and Claude-style command metadata are not equivalent.
Package identity is an injective hexadecimal encoding of marketplace and plugin
segments, so separator collisions cannot alias two installations.

Writes stage the private, skills, and commands trees before activation. Each
target is marker-owned; collisions, malformed markers, symlinked managed paths,
or failures leave the prior three-path install intact. Remove moves all three
owned targets aside before deleting their backups. `pin` is a no-op because no
OpenCode MCP/config ownership is part of this route.

The OpenCode reader exposes these three active roots as `package`, `skills`,
and `commands` content roots. Doctor content proof therefore detects drift or a
missing projection instead of inspecting only the private package copy.

The model-free native loader evidence is recorded in
[`docs/evidence/opencode-native-loader-20260922.json`](../evidence/opencode-native-loader-20260922.json).
It uses the installed binary's `debug skill` command and isolated `serve`
`GET /command` endpoint in a temporary home: the ordinary skill is catalogued,
the manual skill is absent, and `demo/manual`, `demo/run`, and `demo/helper`
are native command entries with the expected `$1`/`$ARGUMENTS` hints. No command
was sent through a model session.
